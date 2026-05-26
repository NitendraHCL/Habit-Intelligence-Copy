import { readFileSync } from "fs";
import { join } from "path";
import type { InlineAttachment } from "@/lib/email/sendgrid";

/**
 * Shared branded transactional email template.
 *
 * Renders a consistent header (logo) + body + footer for every email the
 * platform sends. Returns html + text + attachments ready to pass into
 * `sendTransactionalEmail`. The logo is bundled as an inline CID
 * attachment (image/png), which is the only embedding strategy that
 * renders reliably in Gmail, Outlook, and Apple Mail.
 *
 * All callers should use this — never hand-roll email HTML elsewhere.
 */

const LOGO_PATH = join(process.cwd(), "public", "logo-habit-expanded.png");
const LOGO_CID = "habit-logo";

// Read the logo from disk ONCE at module load. The PNG is small (~32 KB)
// and never changes at runtime — caching it avoids hammering the filesystem
// on every email send. If the file is missing we still try to send the
// email; recipients will see broken-image alt text rather than nothing.
let cachedLogo: Buffer | null = null;
try {
  cachedLogo = readFileSync(LOGO_PATH);
} catch {
  // Logged once at boot if missing — keep going so dev / CI without the
  // asset don't crash on email-adjacent code.
  console.warn(`[email/template] Logo not found at ${LOGO_PATH}; emails will render with alt text only.`);
}

export interface BrandedEmailParams {
  /** Big heading at the top of the email body. */
  title: string;
  /** One sentence under the heading. Keep it short. */
  intro: string;
  /** Block of HTML for the main content — buttons, code displays, etc. */
  contentHtml: string;
  /** Plain-text version of the body for non-HTML clients. */
  textBody: string;
  /** Optional reassurance paragraph after the content (e.g., "if this wasn't you..."). */
  reassuranceHtml?: string;
}

export interface BrandedEmail {
  html: string;
  text: string;
  attachments: InlineAttachment[];
}

export function renderBrandedEmail(params: BrandedEmailParams): BrandedEmail {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F5F6FA;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;width:100%;background-color:#FFFFFF;border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,0.04),0 8px 24px rgba(15,23,42,0.06);overflow:hidden;">
          <!-- Header / logo -->
          <tr>
            <td style="padding:28px 32px 0;text-align:left;">
              <img src="cid:${LOGO_CID}" alt="Habit Intelligence" width="200" style="display:block;width:200px;height:auto;max-width:60%;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111827;letter-spacing:-0.01em;">${escapeHtml(params.title)}</h1>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(params.intro)}</p>
              ${params.contentHtml}
              ${params.reassuranceHtml ?? ""}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid #E5E7EB;">
              <p style="margin:0 0 6px;font-size:12px;color:#6B7280;">
                Need help? Reach us at <a href="mailto:support.healthcare@hclhealthcare.in" style="color:#4F46E5;text-decoration:none;">support.healthcare@hclhealthcare.in</a>.
              </p>
              <p style="margin:0;font-size:11px;color:#9CA3AF;">
                Habit Intelligence by HCL Healthcare &middot; © ${new Date().getFullYear()} HCL Healthcare. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text version. Header is just the product name; body is whatever
  // the caller passed; footer is a tight signature.
  const text =
    `Habit Intelligence — HCL Healthcare\n\n` +
    `${params.title}\n\n` +
    `${params.intro}\n\n` +
    `${params.textBody}\n\n` +
    `Need help? Email support.healthcare@hclhealthcare.in\n` +
    `— Habit Intelligence`;

  const attachments: InlineAttachment[] = cachedLogo
    ? [
        {
          content: cachedLogo,
          filename: "habit-intelligence-logo.png",
          type: "image/png",
          cid: LOGO_CID,
        },
      ]
    : [];

  return { html, text, attachments };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}
