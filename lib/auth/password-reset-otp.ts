import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/email/sendgrid";

/**
 * Password-reset OTP helpers.
 *
 * Mirrors `lib/auth/otp.ts` but lives in its own table (`password_reset_otps`)
 * so a leaked or replayed code from one flow can never authorise the other.
 *
 * Flow:
 *   1. `issuePasswordResetOtp(user)` — wipes any in-flight reset for this
 *      user, creates a fresh row with a 5-minute OTP, emails the code, and
 *      returns the pendingToken (caller sets it as a short-lived cookie).
 *   2. `verifyPasswordResetOtp(pendingToken, otp)` — timing-safe-compares,
 *      stamps `verifiedAt`, extends `expiresAt` by 5 minutes so the user
 *      has time to type the new password. Row stays alive.
 *   3. `consumePasswordResetOtp(pendingToken)` — checks `verifiedAt IS NOT
 *      NULL` and `expiresAt > now`, then deletes the row and returns the
 *      userId so the caller can update the password and kill sessions.
 *
 * Independent of login-MFA — a user can reset their password whether or
 * not MFA is on for the account.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
export const POST_VERIFY_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_RESENDS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Cookie that binds the browser to its in-flight reset row. Short-lived. */
export const PENDING_RESET_COOKIE = "hi_password_reset";

function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

function generatePendingToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Issue a fresh password-reset OTP for the given user. Any prior unconsumed
 * reset rows for the same user are wiped first — only one challenge is live
 * at a time per user. Returns the pendingToken and the expiresAt. The OTP
 * itself is sent via email.
 */
export async function issuePasswordResetOtp(
  userId: string,
  email: string,
  name: string
): Promise<{ pendingToken: string; expiresAt: Date }> {
  await prisma.passwordResetOtp.deleteMany({ where: { userId } });

  const otp = generateOtp();
  const pendingToken = generatePendingToken();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetOtp.create({
    data: {
      userId,
      otpHash: hashOtp(otp),
      pendingToken,
      expiresAt,
    },
  });

  await sendResetEmail({ to: email, name, otp, expiresAt });

  return { pendingToken, expiresAt };
}

/**
 * Issue a "ghost" pending cookie for an email that is NOT in our system.
 * This keeps the timing and the UX of /forgot-password identical between
 * existing and non-existing emails, defeating user-enumeration probes. The
 * returned pendingToken is a random string that will never match any row,
 * so the next /verify-otp call returns the same "code didn't match" error
 * as a real wrong code on a real account would.
 */
export function issueDecoyResetToken(): { pendingToken: string; expiresAt: Date } {
  return {
    pendingToken: generatePendingToken(),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
  };
}

// ── verify ────────────────────────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: "not_found" | "expired" | "too_many_attempts" | "mismatch"; attemptsRemaining?: number };

export async function verifyPasswordResetOtp(
  pendingToken: string,
  submittedOtp: string
): Promise<VerifyResult> {
  const row = await prisma.passwordResetOtp.findUnique({ where: { pendingToken } });
  if (!row) return { ok: false, error: "not_found" };

  const now = new Date();
  if (row.expiresAt < now) {
    await prisma.passwordResetOtp.delete({ where: { id: row.id } });
    return { ok: false, error: "expired" };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.passwordResetOtp.delete({ where: { id: row.id } });
    return { ok: false, error: "too_many_attempts" };
  }

  const submittedHash = hashOtp(submittedOtp);
  const matches = timingSafeEqual(
    Buffer.from(submittedHash, "hex"),
    Buffer.from(row.otpHash, "hex")
  );

  if (!matches) {
    const updated = await prisma.passwordResetOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - updated.attempts;
    if (remaining <= 0) {
      await prisma.passwordResetOtp.delete({ where: { id: row.id } });
      return { ok: false, error: "too_many_attempts" };
    }
    return { ok: false, error: "mismatch", attemptsRemaining: remaining };
  }

  // Mark verified and extend the TTL so the user has time to type the new
  // password without the OTP expiring underneath them. The reset endpoint
  // re-checks expiresAt before allowing the password change.
  const newExpiry = new Date(Date.now() + POST_VERIFY_TTL_MINUTES * 60 * 1000);
  await prisma.passwordResetOtp.update({
    where: { id: row.id },
    data: { verifiedAt: now, expiresAt: newExpiry },
  });
  return { ok: true, userId: row.userId };
}

// ── resend ────────────────────────────────────────────────────────────────

export type ResendResult =
  | { ok: true; expiresAt: Date; resendCount: number }
  | { ok: false; error: "not_found" | "expired" | "too_many_resends" | "cooldown" };

export async function resendPasswordResetOtp(pendingToken: string): Promise<ResendResult> {
  const row = await prisma.passwordResetOtp.findUnique({
    where: { pendingToken },
    include: { user: true },
  });
  if (!row) return { ok: false, error: "not_found" };

  const now = new Date();
  if (row.expiresAt < now) return { ok: false, error: "expired" };
  if (row.resendCount >= OTP_MAX_RESENDS) return { ok: false, error: "too_many_resends" };

  const earliestResendTime =
    row.createdAt.getTime() + (row.resendCount + 1) * OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (now.getTime() < earliestResendTime) {
    return { ok: false, error: "cooldown" };
  }

  const newOtp = generateOtp();
  const newExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const updated = await prisma.passwordResetOtp.update({
    where: { id: row.id },
    data: {
      otpHash: hashOtp(newOtp),
      expiresAt: newExpiry,
      resendCount: { increment: 1 },
      attempts: 0,
      verifiedAt: null, // new code → must re-verify
    },
  });

  await sendResetEmail({
    to: row.user.email,
    name: row.user.name,
    otp: newOtp,
    expiresAt: newExpiry,
  });

  return { ok: true, expiresAt: updated.expiresAt, resendCount: updated.resendCount };
}

// ── consume (gate the actual password change) ─────────────────────────────

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; error: "not_found" | "not_verified" | "expired" };

/**
 * Used by the /reset-password endpoint to confirm the caller has earned
 * the right to change the password. The row must exist, must be verified,
 * and must not have expired. On success the row is deleted so the cookie
 * cannot be replayed.
 */
export async function consumePasswordResetOtp(pendingToken: string): Promise<ConsumeResult> {
  const row = await prisma.passwordResetOtp.findUnique({ where: { pendingToken } });
  if (!row) return { ok: false, error: "not_found" };

  const now = new Date();
  if (row.expiresAt < now) {
    await prisma.passwordResetOtp.delete({ where: { id: row.id } });
    return { ok: false, error: "expired" };
  }
  if (!row.verifiedAt) return { ok: false, error: "not_verified" };

  await prisma.passwordResetOtp.delete({ where: { id: row.id } });
  return { ok: true, userId: row.userId };
}

// ── email body ────────────────────────────────────────────────────────────

interface ResetEmailParams {
  to: string;
  name: string;
  otp: string;
  expiresAt: Date;
}

async function sendResetEmail({ to, name, otp, expiresAt }: ResetEmailParams): Promise<void> {
  const ttlMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const subject = `Reset your Habit Intelligence password: ${otp}`;
  const text =
    `Hi ${name || "there"},\n\n` +
    `Someone — hopefully you — asked to reset the password for your Habit ` +
    `Intelligence account. Use this code to continue:\n\n` +
    `    ${otp}\n\n` +
    `The code expires in ${ttlMinutes} minutes. If you didn't request a ` +
    `password reset, you can ignore this email — your account stays ` +
    `unchanged until the code is used.\n\n` +
    `— Habit Intelligence`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">Password reset</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#374151;">
        Hi ${escapeHtml(name || "there")}, someone asked to reset the password for your Habit Intelligence account. If that was you, use this code to continue.
      </p>
      <div style="background:#F3F4F6;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
        <div style="font-size:30px;letter-spacing:6px;font-weight:700;color:#111827;">${escapeHtml(otp)}</div>
      </div>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:#6B7280;">
        The code expires in <strong>${ttlMinutes} minutes</strong>.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.55;color:#6B7280;">
        If you didn't request a password reset, ignore this email — your account stays unchanged until the code is used.
      </p>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;" />
      <p style="margin:0;font-size:12px;color:#9CA3AF;">— Habit Intelligence by HCL Healthcare</p>
    </div>
  `;

  await sendTransactionalEmail({ to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}
