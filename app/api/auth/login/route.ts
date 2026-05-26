import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { verifyPassword, createSession } from "@/lib/auth/session";
import { issueLoginOtp, PENDING_OTP_COOKIE, OTP_TTL_MINUTES } from "@/lib/auth/otp";

/**
 * Two-step login:
 *   • If the user has `mfaEnabled = false` → mint a session immediately
 *     (unchanged behaviour for everyone today, since the default is off).
 *   • If the user has `mfaEnabled = true`  → issue an OTP, set a short-lived
 *     `hi_pending_otp` cookie keyed to the in-flight challenge, and ask the
 *     client to call /api/auth/verify-otp next. NO session is minted yet.
 *
 * If SendGrid fails we deliberately fail-closed: the user sees an error and
 * cannot complete login. This avoids silently letting an MFA-required user
 * in just because email is down.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { client: true },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Branch on MFA. Default is false for every user, so the unchanged
    // single-step flow fires for everyone unless an admin has explicitly
    // turned MFA on for this account.
    if (user.mfaEnabled) {
      try {
        const { pendingToken, expiresAt } = await issueLoginOtp(
          user.id,
          user.email,
          user.name
        );

        // Short-lived cookie scoped to the OTP step only. Lives slightly
        // longer than the OTP itself so a user can hit "resend" right up
        // to the moment the code expires.
        const cookieStore = await cookies();
        cookieStore.set(PENDING_OTP_COOKIE, pendingToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: (OTP_TTL_MINUTES + 1) * 60,
        });

        return NextResponse.json({
          needsMfa: true,
          // Display hint only — never the full email; helps the user
          // confirm the right inbox without exposing PII to a shoulder-surfer.
          maskedEmail: maskEmail(user.email),
          expiresAt: expiresAt.toISOString(),
        });
      } catch (err) {
        // Fail-closed when email cannot be sent — better to break login
        // than to bypass MFA. Log once on the server but never echo the
        // SendGrid internals to the client.
        console.error("[login] OTP issuance failed", err);
        return NextResponse.json(
          {
            error:
              "We couldn't send your verification code. Please try again in a moment or contact your administrator.",
          },
          { status: 503 }
        );
      }
    }

    await createSession(user.id);

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
