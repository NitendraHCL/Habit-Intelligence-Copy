import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import {
  issuePasswordResetOtp,
  issueDecoyResetToken,
  PENDING_RESET_COOKIE,
  OTP_TTL_MINUTES,
} from "@/lib/auth/password-reset-otp";

/**
 * Step 1 of the password reset flow.
 *
 * The response is deliberately uniform whether the email exists or not —
 * we set the same pending cookie, return the same masked email, and take
 * roughly the same time, so an attacker cannot enumerate accounts by
 * watching this endpoint.
 *
 * • Real, active user → issue an OTP, email it, set the cookie to the
 *   real pendingToken.
 * • Unknown email OR inactive user → set the cookie to a decoy token
 *   that will never match any row. The subsequent /verify-otp call will
 *   return the same "wrong code" UI it would for a real account.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });

    let pendingToken: string;
    let expiresAt: Date;
    if (user && user.isActive) {
      try {
        const issued = await issuePasswordResetOtp(user.id, user.email, user.name);
        pendingToken = issued.pendingToken;
        expiresAt = issued.expiresAt;
      } catch (err) {
        // Email send failed for a real user. We surface a generic error and
        // do NOT set a cookie — without an email they can't proceed anyway,
        // and a stuck pending cookie would give a worse UX than asking them
        // to retry. Log on the server.
        console.error("[forgot-password] OTP issuance failed", err);
        return NextResponse.json(
          {
            error:
              "We couldn't send your verification code. Please try again in a moment.",
          },
          { status: 503 }
        );
      }
    } else {
      // Unknown / inactive — issue a decoy token. The OTP will never match
      // because there's no row.
      const decoy = issueDecoyResetToken();
      pendingToken = decoy.pendingToken;
      expiresAt = decoy.expiresAt;
    }

    const cookieStore = await cookies();
    cookieStore.set(PENDING_RESET_COOKIE, pendingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      // Leave headroom over the OTP TTL so the user can still resend if
      // they catch the email at the last second.
      maxAge: (OTP_TTL_MINUTES + 1) * 60,
    });

    return NextResponse.json({
      ok: true,
      maskedEmail: maskEmail(normalized),
      expiresAt: expiresAt.toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 3))}${local.slice(-1)}@${domain}`;
}
