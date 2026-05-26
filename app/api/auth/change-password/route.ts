import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { createSession, hashPassword } from "@/lib/auth/session";
import {
  validatePassword,
  checkPasswordHistory,
  archivePreviousPasswordHash,
} from "@/lib/auth/password-policy";
import {
  consumePendingPasswordChange,
  PENDING_PASSWORD_CHANGE_COOKIE,
} from "@/lib/auth/pending-password-change";
import { sendPasswordChangedEmail } from "@/lib/email/notifications";

/**
 * Completes the force-change flow.
 *
 * Identified by the `hi_pending_change` cookie set by /login or
 * /verify-otp. We resolve it back to a userId, validate the new password
 * against the policy and the no-reuse-last-N history, swap the password
 * in, clear the `mustChangePassword` flag, archive the old hash, then
 * mint the real session — the user lands logged-in on the portal.
 */
export async function POST(request: NextRequest) {
  try {
    const { newPassword } = await request.json();

    // Validate complexity/length first so weak guesses don't consume the
    // pending row.
    const validation = validatePassword(newPassword);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_PASSWORD_CHANGE_COOKIE)?.value;
    if (!pendingToken) {
      return NextResponse.json(
        {
          error: "Your sign-in session has expired. Please sign in again.",
          terminal: true,
        },
        { status: 401 }
      );
    }

    const consume = await consumePendingPasswordChange(pendingToken);
    if (!consume.ok) {
      cookieStore.delete(PENDING_PASSWORD_CHANGE_COOKIE);
      return NextResponse.json(
        {
          error:
            consume.error === "expired"
              ? "This sign-in session expired. Please sign in again."
              : "Your sign-in session has expired. Please sign in again.",
          terminal: true,
        },
        { status: 401 }
      );
    }

    // History check — also blocks reuse of the temp password the admin
    // just set, because that hash sits on user.passwordHash right now.
    const historyCheck = await checkPasswordHistory(consume.userId, newPassword);
    if (!historyCheck.ok) {
      // The pending row is already consumed at this point. To avoid making
      // the user start over for a policy nit, issue a fresh pending row so
      // they can try a different password from the same UI.
      const { issuePendingPasswordChange } = await import(
        "@/lib/auth/pending-password-change"
      );
      const reissue = await issuePendingPasswordChange(consume.userId);
      cookieStore.set(PENDING_PASSWORD_CHANGE_COOKIE, reissue.pendingToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
      return NextResponse.json({ error: historyCheck.error }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: consume.userId },
      include: { client: true },
    });
    if (!user || !user.isActive) {
      cookieStore.delete(PENDING_PASSWORD_CHANGE_COOKIE);
      return NextResponse.json(
        {
          error: "Your account is unavailable. Please contact your administrator.",
          terminal: true,
        },
        { status: 403 }
      );
    }

    const oldHash = user.passwordHash;
    const newHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        // User picked this password themselves — clear the gate.
        mustChangePassword: false,
      },
    });
    await archivePreviousPasswordHash(user.id, oldHash);

    // Mint the real session and clear the pending-change cookie. From
    // here the browser is fully logged in.
    await createSession(user.id);
    cookieStore.delete(PENDING_PASSWORD_CHANGE_COOKIE);

    // Fire-and-forget confirmation email. Same caveat as the other
    // sites: email failure should never undo the password change.
    sendPasswordChangedEmail({
      to: user.email,
      name: user.name,
      source: "force-change",
    }).catch((err) => {
      console.error("[change-password] confirmation email failed", err);
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        clientId: user.clientId,
        clientName: user.client?.cugName ?? null,
      },
    });
  } catch (err) {
    console.error("[change-password] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
