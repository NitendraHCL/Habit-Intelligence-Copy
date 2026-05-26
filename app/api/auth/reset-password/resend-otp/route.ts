import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  resendPasswordResetOtp,
  PENDING_RESET_COOKIE,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_RESENDS,
} from "@/lib/auth/password-reset-otp";

/**
 * Step 2-bis: resend the password-reset OTP for an in-flight challenge.
 * The previous code is invalidated and a new one is emailed. Subject to
 * the same cooldown / max-resends budget as the MFA flow.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_RESET_COOKIE)?.value;
    if (!pendingToken) {
      return NextResponse.json(
        { error: "Your reset session has expired. Please start again.", terminal: true },
        { status: 401 }
      );
    }

    const result = await resendPasswordResetOtp(pendingToken);
    if (!result.ok) {
      if (result.error === "not_found" || result.error === "expired") {
        cookieStore.delete(PENDING_RESET_COOKIE);
        return NextResponse.json(
          {
            error:
              result.error === "expired"
                ? "This reset session expired. Please start again."
                : "We couldn't find your reset session. Please start again.",
            terminal: true,
          },
          { status: 401 }
        );
      }
      if (result.error === "too_many_resends") {
        return NextResponse.json(
          {
            error: `You can resend up to ${OTP_MAX_RESENDS} times. If you didn't get the email, please start again.`,
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        {
          error: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds between resend attempts.`,
        },
        { status: 429 }
      );
    }

    return NextResponse.json({
      ok: true,
      expiresAt: result.expiresAt.toISOString(),
      resendCount: result.resendCount,
    });
  } catch (err) {
    console.error("[reset-password/resend-otp] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
