import { sendTransactionalEmail } from "@/lib/email/sendgrid";
import { renderBrandedEmail, escapeHtml } from "@/lib/email/template";

/**
 * Non-OTP transactional notifications.
 *
 * The two emails here are sent in addition to the OTP flows, not as part
 * of them — they're courtesy notifications, not security challenges:
 *   • Welcome email when an admin creates a user.
 *   • "Your password was just changed" email after any successful
 *     password change.
 *
 * All sends are fire-and-forget from the caller's perspective in that
 * the email path is wrapped in try/catch in each call site — a SendGrid
 * outage should never block account creation or password completion.
 */

function appBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://intelligence.habithealth.com/login";
}

// ── Welcome email ─────────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  to: string;
  name: string;
  /** The email the user will use to sign in (= `to`, but kept explicit). */
  loginEmail: string;
  /** Plaintext temp password the admin chose. */
  tempPassword: string;
}

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  const subject = "Welcome to Habit Intelligence — your account is ready";
  const signInUrl = appBaseUrl();

  const contentHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 20px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;font-size:13px;color:#475569;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:4px;">Sign-in email</div>
          <div style="font-family:Menlo,Consolas,monospace;font-size:14px;color:#0F172A;">${escapeHtml(params.loginEmail)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 14px;font-size:13px;color:#475569;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:4px;">Temporary password</div>
          <div style="font-family:Menlo,Consolas,monospace;font-size:14px;color:#0F172A;letter-spacing:0.02em;">${escapeHtml(params.tempPassword)}</div>
        </td>
      </tr>
    </table>
    <div style="margin:18px 0 6px;">
      <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5 0%,#6D28D9 100%);color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Sign in to Habit Intelligence</a>
    </div>
    <p style="margin:0 0 14px;font-size:12px;line-height:1.55;color:#6B7280;">
      Or copy this link into your browser:<br>
      <a href="${escapeHtml(signInUrl)}" style="color:#4F46E5;text-decoration:none;word-break:break-all;">${escapeHtml(signInUrl)}</a>
    </p>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#374151;">
      For your security, we'll ask you to choose your own password the first time you sign in. The temporary one above only works once.
    </p>
  `;
  const reassuranceHtml = `
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6B7280;">
      Didn't expect this email? Forward it to <a href="mailto:customerexperience@hclhealthcare.in" style="color:#4F46E5;text-decoration:none;">customerexperience@hclhealthcare.in</a> and we'll look into it.
    </p>
  `;

  const branded = renderBrandedEmail({
    title: "Welcome aboard",
    intro: `Hi ${params.name || "there"}, an administrator has created a Habit Intelligence account for you. Here's how to sign in.`,
    contentHtml,
    reassuranceHtml,
    textBody:
      `An administrator has created a Habit Intelligence account for you.\n\n` +
      `Sign-in email:     ${params.loginEmail}\n` +
      `Temporary password: ${params.tempPassword}\n\n` +
      `Sign in: ${signInUrl}\n\n` +
      `For your security, you'll be asked to choose your own password the first time you sign in. The temporary one above only works once.\n\n` +
      `Didn't expect this email? Forward it to customerexperience@hclhealthcare.in and we'll look into it.`,
  });

  await sendTransactionalEmail({
    to: params.to,
    subject,
    text: branded.text,
    html: branded.html,
    attachments: branded.attachments,
  });
}

// ── Password-changed confirmation ─────────────────────────────────────────

export type PasswordChangeSource =
  /** User reset via forgot-password OTP flow. */
  | "self-reset"
  /** User chose their own password on first sign-in (force-change). */
  | "force-change"
  /** Admin updated the password from the user-management page. */
  | "admin-update"
  /** Signed-in user changed their own password from Settings. */
  | "self-service";

export interface PasswordChangedEmailParams {
  to: string;
  name: string;
  source: PasswordChangeSource;
  /** ISO timestamp of when the change happened. Default: now. */
  changedAt?: Date;
}

export async function sendPasswordChangedEmail(
  params: PasswordChangedEmailParams
): Promise<void> {
  const when = params.changedAt ?? new Date();
  const subject = "Your Habit Intelligence password was just updated";
  const signInUrl = appBaseUrl();

  // Lead sentence shifts subtly with the source. The reassurance line
  // stays constant — if it wasn't them, they should contact support
  // regardless of which path made the change.
  const intro =
    params.source === "self-reset"
      ? `Hi ${params.name || "there"}, we just updated the password on your Habit Intelligence account after a password-reset request.`
      : params.source === "force-change"
        ? `Hi ${params.name || "there"}, we just set the new password you chose during sign-in.`
        : params.source === "self-service"
          ? `Hi ${params.name || "there"}, your Habit Intelligence password was just changed from your account settings.`
          : `Hi ${params.name || "there"}, an administrator just updated the password on your Habit Intelligence account.`;

  const formattedWhen = formatTimestamp(when);

  const contentHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:14px 0 4px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;">
      <tr>
        <td style="padding:14px 16px;font-size:13px;color:#475569;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#94A3B8;margin-bottom:4px;">When</div>
          <div style="font-size:14px;color:#0F172A;">${escapeHtml(formattedWhen)}</div>
        </td>
      </tr>
    </table>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#374151;">
      Any existing sign-in sessions have been ended for security — you'll need to sign in again with the new password.
    </p>
    <div style="margin:18px 0 6px;">
      <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:linear-gradient(135deg,#4F46E5 0%,#6D28D9 100%);color:#FFFFFF;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;">Open Habit Intelligence</a>
    </div>
    <p style="margin:0;font-size:12px;line-height:1.55;color:#6B7280;">
      Or copy this link into your browser:<br>
      <a href="${escapeHtml(signInUrl)}" style="color:#4F46E5;text-decoration:none;word-break:break-all;">${escapeHtml(signInUrl)}</a>
    </p>
  `;
  const reassuranceHtml = `
    <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#DC2626;">
      <strong>Wasn't you?</strong> Contact your administrator or email
      <a href="mailto:customerexperience@hclhealthcare.in" style="color:#DC2626;text-decoration:underline;">customerexperience@hclhealthcare.in</a>
      immediately so we can secure your account.
    </p>
  `;

  const branded = renderBrandedEmail({
    title: "Password updated",
    intro,
    contentHtml,
    reassuranceHtml,
    textBody:
      `When: ${formattedWhen}\n\n` +
      `Any existing sign-in sessions have been ended for security — you'll need to sign in again with the new password.\n\n` +
      `Sign in: ${signInUrl}\n\n` +
      `Wasn't you? Contact your administrator or email customerexperience@hclhealthcare.in immediately so we can secure your account.`,
  });

  await sendTransactionalEmail({
    to: params.to,
    subject,
    text: branded.text,
    html: branded.html,
    attachments: branded.attachments,
  });
}

function formatTimestamp(d: Date): string {
  // Format like "26 May 2026, 12:47 IST" — readable and timezone-aware.
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}
