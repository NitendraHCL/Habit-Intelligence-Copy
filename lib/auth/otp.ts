import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/email/sendgrid";
import { renderBrandedEmail, escapeHtml } from "@/lib/email/template";

/**
 * Email-OTP MFA helpers.
 *
 * Lifecycle of a single MFA challenge:
 *   1. User submits valid email+password to /api/auth/login.
 *   2. If their `mfaEnabled` is true, we call `issueLoginOtp(userId)` —
 *      this generates a 6-digit code, hashes it (SHA-256), and stores a
 *      LoginOtp row with a 5-minute expiry. The row also gets a random
 *      `pendingToken` which is set as a short-lived cookie on the browser.
 *   3. The 6-digit OTP itself is emailed to the user via SendGrid. We never
 *      log or return the plaintext OTP.
 *   4. User submits the OTP to /api/auth/verify-otp. We look up the row by
 *      the pendingToken cookie, timing-safe-compare the hashes, increment
 *      attempts on miss, and mint a session on hit.
 *
 * Constants are tuned for a low-noise admin UX: 5-minute TTL, 5 attempts
 * before the row is hard-deleted, 3 resend allowance, 30-second resend
 * cooldown.
 */

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_RESENDS = 3;
export const OTP_RESEND_COOLDOWN_SECONDS = 30;

/** Cookie that ties a browser to its in-flight OTP row. Short-lived. */
export const PENDING_OTP_COOKIE = "hi_pending_otp";

function generateOtp(): string {
  // randomInt is cryptographically secure. We pad to OTP_LENGTH so the user
  // always sees a fixed-width code even when the first digit is zero.
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
 * Issue a fresh OTP for the given user. Any prior un-consumed OTPs for the
 * same user are deleted first — only one challenge is live at a time per
 * user. Returns the pendingToken (for the cookie) and the expiresAt
 * timestamp (for UI countdown). The OTP itself is sent via email and is
 * never returned to the caller.
 */
export async function issueLoginOtp(
  userId: string,
  email: string,
  name: string
): Promise<{ pendingToken: string; expiresAt: Date }> {
  // Wipe any in-flight challenges for this user before issuing a new one.
  // This is what gives a user a clean slate when they re-enter credentials.
  await prisma.loginOtp.deleteMany({ where: { userId } });

  const otp = generateOtp();
  const pendingToken = generatePendingToken();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.loginOtp.create({
    data: {
      userId,
      otpHash: hashOtp(otp),
      pendingToken,
      expiresAt,
    },
  });

  await sendOtpEmail({ to: email, name, otp, expiresAt });

  return { pendingToken, expiresAt };
}

/**
 * Resend the OTP for an in-flight challenge. Identified by the
 * pendingToken cookie. Returns the new expiresAt and the updated resend
 * count, OR an error code if the resend can't proceed (no such challenge,
 * too many resends, cooldown not elapsed).
 *
 * Resending generates a NEW OTP — the old one is invalidated. This
 * matches user expectation ("resend means send a new one") and avoids the
 * "I got two emails, which works?" footgun.
 */
export type ResendResult =
  | { ok: true; expiresAt: Date; resendCount: number }
  | { ok: false; error: "not_found" | "expired" | "too_many_resends" | "cooldown" };

export async function resendLoginOtp(pendingToken: string): Promise<ResendResult> {
  const row = await prisma.loginOtp.findUnique({
    where: { pendingToken },
    include: { user: true },
  });
  if (!row) return { ok: false, error: "not_found" };

  const now = new Date();
  if (row.expiresAt < now) return { ok: false, error: "expired" };
  if (row.resendCount >= OTP_MAX_RESENDS) return { ok: false, error: "too_many_resends" };

  // Cooldown — compare against createdAt for the first resend and against
  // the updatedAt (we set it via the explicit consumedAt-style timestamp
  // below) for subsequent ones. We use createdAt for simplicity since the
  // row is recreated on each fresh challenge.
  const secondsSinceCreate = Math.floor((now.getTime() - row.createdAt.getTime()) / 1000);
  // Allow the first resend after the cooldown; we approximate "last send
  // time" using createdAt + resendCount * cooldown which is monotonically
  // increasing and matches the UX we want.
  const earliestResendTime =
    row.createdAt.getTime() + (row.resendCount + 1) * OTP_RESEND_COOLDOWN_SECONDS * 1000;
  if (now.getTime() < earliestResendTime) {
    return { ok: false, error: "cooldown" };
  }
  void secondsSinceCreate; // kept for potential debug logging in future

  const newOtp = generateOtp();
  const newExpiry = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const updated = await prisma.loginOtp.update({
    where: { id: row.id },
    data: {
      otpHash: hashOtp(newOtp),
      expiresAt: newExpiry,
      resendCount: { increment: 1 },
      attempts: 0, // fresh attempt budget for the new code
    },
  });

  await sendOtpEmail({
    to: row.user.email,
    name: row.user.name,
    otp: newOtp,
    expiresAt: newExpiry,
  });

  return { ok: true, expiresAt: updated.expiresAt, resendCount: updated.resendCount };
}

/**
 * Verify a submitted OTP against the in-flight challenge identified by the
 * pendingToken cookie. Increments attempts on miss; hard-deletes the row
 * when the attempt budget is exhausted (defence against brute-force). On
 * hit returns the userId so the caller can mint a session.
 */
export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; error: "not_found" | "expired" | "too_many_attempts" | "mismatch"; attemptsRemaining?: number };

export async function verifyLoginOtp(
  pendingToken: string,
  submittedOtp: string
): Promise<VerifyResult> {
  const row = await prisma.loginOtp.findUnique({ where: { pendingToken } });
  if (!row) return { ok: false, error: "not_found" };

  const now = new Date();
  if (row.expiresAt < now) {
    await prisma.loginOtp.delete({ where: { id: row.id } });
    return { ok: false, error: "expired" };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.loginOtp.delete({ where: { id: row.id } });
    return { ok: false, error: "too_many_attempts" };
  }

  const submittedHash = hashOtp(submittedOtp);
  // timingSafeEqual requires same-length buffers — hashOtp always returns
  // a 64-char hex string so this is safe.
  const matches = timingSafeEqual(
    Buffer.from(submittedHash, "hex"),
    Buffer.from(row.otpHash, "hex")
  );

  if (!matches) {
    const updated = await prisma.loginOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - updated.attempts;
    if (remaining <= 0) {
      await prisma.loginOtp.delete({ where: { id: row.id } });
      return { ok: false, error: "too_many_attempts" };
    }
    return { ok: false, error: "mismatch", attemptsRemaining: remaining };
  }

  // Hit — mark consumed and delete. We delete instead of just consumedAt
  // so the pendingToken cookie becomes useless on replay.
  await prisma.loginOtp.delete({ where: { id: row.id } });
  return { ok: true, userId: row.userId };
}

// ── email body ────────────────────────────────────────────────────────────

interface OtpEmailParams {
  to: string;
  name: string;
  otp: string;
  expiresAt: Date;
}

async function sendOtpEmail({ to, name, otp, expiresAt }: OtpEmailParams): Promise<void> {
  const ttlMinutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const subject = `Your Habit Intelligence sign-in code: ${otp}`;

  const contentHtml = `
    <div style="background:#F3F4F6;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
      <div style="font-size:30px;letter-spacing:6px;font-weight:700;color:#111827;">${escapeHtml(otp)}</div>
    </div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6B7280;">
      The code expires in <strong>${ttlMinutes} minutes</strong>.
    </p>
  `;
  const reassuranceHtml = `
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">
      If you didn't try to sign in, ignore this email — no one can access your account without this code.
    </p>
  `;

  const branded = renderBrandedEmail({
    title: "Sign-in verification",
    intro: `Hi ${name || "there"}, use this one-time code to finish signing in to Habit Intelligence.`,
    contentHtml,
    reassuranceHtml,
    textBody:
      `Use this one-time code to finish signing in:\n\n` +
      `    ${otp}\n\n` +
      `The code expires in ${ttlMinutes} minutes.\n\n` +
      `If you didn't try to sign in, ignore this email — no one can access your account without this code.`,
  });

  await sendTransactionalEmail({
    to,
    subject,
    text: branded.text,
    html: branded.html,
    attachments: branded.attachments,
  });
}
