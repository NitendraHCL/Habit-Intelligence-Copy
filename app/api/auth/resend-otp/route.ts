import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  resendLoginOtp,
  PENDING_OTP_COOKIE,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_RESENDS,
} from "@/lib/auth/otp";

/**
 * Resend the 6-digit OTP for an in-flight challenge. Identified by the
 * `hi_pending_otp` cookie. Generates a fresh code; the prior code is
 * invalidated so the user is never left juggling two valid OTPs.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const pendingToken = cookieStore.get(PENDING_OTP_COOKIE)?.value;
    if (!pendingToken) {
      return NextResponse.json(
        { error: "Your verification session has expired. Please sign in again.", terminal: true },
        { status: 401 }
      );
    }

    const result = await resendLoginOtp(pendingToken);
    if (!result.ok) {
      if (result.error === "not_found" || result.error === "expired") {
        cookieStore.delete(PENDING_OTP_COOKIE);
        return NextResponse.json(
          {
            error:
              result.error === "expired"
                ? "This sign-in session expired. Please sign in again."
                : "We couldn't find your verification session. Please sign in again.",
            terminal: true,
          },
          { status: 401 }
        );
      }
      if (result.error === "too_many_resends") {
        return NextResponse.json(
          {
            error: `You can resend up to ${OTP_MAX_RESENDS} times. If you didn't get the email, please sign in again.`,
          },
          { status: 429 }
        );
      }
      // cooldown
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
    console.error("[resend-otp] unexpected error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
