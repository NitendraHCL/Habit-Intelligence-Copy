import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/session";
import {
  consumePasswordResetOtp,
  PENDING_RESET_COOKIE,
} from "@/lib/auth/password-reset-otp";

/** Server-side minimum. Match whatever the user-management form expects. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Step 3 of the password reset flow: set a new password.
 *
 * Requires:
 *  • `hi_password_reset` cookie (set by /forgot-password)
 *  • The matching `password_reset_otps` row must have `verifiedAt` set
 *    (caller has already proven OTP possession via /verify-otp)
 *  • The row must not have expired (5 minutes from verify, see helper)
 *
 * On success: row is deleted (cookie now useless), password is updated,
 * AND every active session for that user is destroyed — anyone holding a
 * stolen cookie is booted, the legitimate user re-logs in fresh.
 */
export async function POST(request: NextRequest) {
  try {
    const { newPassword } = await request.json();

    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_RESET_COOKIE)?.value;
    if (!pendingToken) {
      return NextResponse.json(
        { error: "Your reset session has expired. Please start again.", terminal: true },
        { status: 401 }
      );
    }

    const result = await consumePasswordResetOtp(pendingToken);
    if (!result.ok) {
      // not_verified means the caller tried to skip step 2 — possible if
      // they replay this endpoint directly. Clear the cookie either way:
      // if they want to reset, they should restart cleanly from step 1.
      cookieStore.delete(PENDING_RESET_COOKIE);
      const message =
        result.error === "not_verified"
          ? "Please verify the code from your email before setting a new password."
          : result.error === "expired"
            ? "This reset session expired. Please start again."
            : "Your reset session has expired. Please start again.";
      return NextResponse.json({ error: message, terminal: true }, { status: 401 });
    }

    const passwordHash = await hashPassword(newPassword);

    // Update password and wipe every existing session in a single
    // transaction. Anyone holding an old hi_session cookie is locked out
    // immediately; the user has to re-login with the new password (and
    // pass MFA if it's enabled for them).
    await prisma.$transaction([
      prisma.user.update({
        where: { id: result.userId },
        data: { passwordHash },
      }),
      prisma.session.deleteMany({ where: { userId: result.userId } }),
    ]);

    // Clear the pending cookie so the next /reset-password call (replay)
    // cannot reuse it — the row is gone, but belt-and-braces.
    cookieStore.delete(PENDING_RESET_COOKIE);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
