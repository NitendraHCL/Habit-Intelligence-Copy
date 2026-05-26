import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { verifyLoginOtp, PENDING_OTP_COOKIE } from "@/lib/auth/otp";
import {
  issuePendingPasswordChange,
  PENDING_PASSWORD_CHANGE_COOKIE,
  PENDING_PASSWORD_CHANGE_TTL_MINUTES,
} from "@/lib/auth/pending-password-change";

/**
 * Step 2 of MFA login: the user submits the 6-digit code we emailed them.
 *
 * We identify the in-flight challenge via the `hi_pending_otp` cookie set
 * by /api/auth/login. On hit we mint the real session cookie and delete
 * the pending cookie. On miss we surface a soft error so the UI can show
 * "incorrect code, N attempts remaining". On hard failure (too many
 * attempts, expired) we clear the pending cookie so the user gets bounced
 * back to the credentials step.
 */
export async function POST(request: NextRequest) {
  try {
    const { otp } = await request.json();

    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { error: "Enter the 6-digit code." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_OTP_COOKIE)?.value;
    if (!pendingToken) {
      return NextResponse.json(
        { error: "Your verification session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const result = await verifyLoginOtp(pendingToken, otp);

    if (!result.ok) {
      // On terminal errors, also wipe the pending cookie so the UI doesn't
      // get stuck in the OTP step.
      if (
        result.error === "expired" ||
        result.error === "too_many_attempts" ||
        result.error === "not_found"
      ) {
        cookieStore.delete(PENDING_OTP_COOKIE);
        const message =
          result.error === "expired"
            ? "This code has expired. Please sign in again to get a new one."
            : result.error === "too_many_attempts"
              ? "Too many incorrect attempts. Please sign in again."
              : "Your verification session has expired. Please sign in again.";
        return NextResponse.json({ error: message, terminal: true }, { status: 401 });
      }
      // Mismatch — keep the cookie so the user can try the next digit. Surface
      // the remaining attempt budget so the UI can warn them.
      return NextResponse.json(
        {
          error: "That code didn't match. Check the latest email and try again.",
          attemptsRemaining: result.attemptsRemaining,
        },
        { status: 401 }
      );
    }

    // OTP good — mint the session and clear the pending cookie.
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      include: { client: true },
    });
    if (!user || !user.isActive) {
      cookieStore.delete(PENDING_OTP_COOKIE);
      return NextResponse.json(
        { error: "Your account is unavailable. Please contact your administrator." },
        { status: 403 }
      );
    }

    // OTP good — but if the user is in "must change password" state, hold
    // off on minting a session and route them through /change-password.
    if (user.mustChangePassword) {
      const { pendingToken } = await issuePendingPasswordChange(user.id);
      cookieStore.set(PENDING_PASSWORD_CHANGE_COOKIE, pendingToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: PENDING_PASSWORD_CHANGE_TTL_MINUTES * 60,
      });
      cookieStore.delete(PENDING_OTP_COOKIE);
      return NextResponse.json({ needsPasswordChange: true });
    }

    await createSession(user.id);
    cookieStore.delete(PENDING_OTP_COOKIE);

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
    console.error("[verify-otp] unexpected error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
