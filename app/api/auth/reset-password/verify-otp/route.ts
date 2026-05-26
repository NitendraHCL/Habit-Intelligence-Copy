import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  verifyPasswordResetOtp,
  PENDING_RESET_COOKIE,
} from "@/lib/auth/password-reset-otp";

/**
 * Step 2 of the password reset flow: verify the 6-digit code the user
 * received via email. Identified by the `hi_password_reset` cookie set
 * in step 1.
 *
 * On success the row is marked verified (NOT deleted) so the next call —
 * /api/auth/reset-password — can complete the password change. On
 * terminal failure we clear the pending cookie so the UI doesn't get
 * stuck.
 */
export async function POST(request: NextRequest) {
  try {
    const { otp } = await request.json();

    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
    }

    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_RESET_COOKIE)?.value;
    if (!pendingToken) {
      return NextResponse.json(
        { error: "Your reset session has expired. Please start again.", terminal: true },
        { status: 401 }
      );
    }

    const result = await verifyPasswordResetOtp(pendingToken, otp);
    if (!result.ok) {
      if (
        result.error === "expired" ||
        result.error === "too_many_attempts" ||
        result.error === "not_found"
      ) {
        cookieStore.delete(PENDING_RESET_COOKIE);
        const message =
          result.error === "expired"
            ? "This code has expired. Please start again to get a new one."
            : result.error === "too_many_attempts"
              ? "Too many incorrect attempts. Please start again."
              : "Your reset session has expired. Please start again.";
        return NextResponse.json({ error: message, terminal: true }, { status: 401 });
      }
      return NextResponse.json(
        {
          error: "That code didn't match. Check the latest email and try again.",
          attemptsRemaining: result.attemptsRemaining,
        },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[reset-password/verify-otp] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
