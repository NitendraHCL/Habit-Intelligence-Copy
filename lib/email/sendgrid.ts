import sgMail from "@sendgrid/mail";

/**
 * Thin SendGrid wrapper.
 *
 * The API key is read from `SENDGRID_API_KEY` on first use — we do NOT
 * configure the SDK at module load because it would crash the build in
 * environments where the key isn't set (e.g., type-check on CI). Instead
 * we lazily initialise on the first send and throw a clear error if the
 * key is missing.
 *
 * From-address and from-name are read from the env too so the operator can
 * change them without code edits. Both have safe defaults.
 *
 * Failures are surfaced as thrown errors — the caller decides whether to
 * fail-closed (block login) or fail-open (warn but proceed). For OTP login
 * we deliberately fail-closed: a user who can't receive the OTP must not be
 * silently let through.
 */

let initialised = false;

function ensureClient(): void {
  if (initialised) return;
  const key = process.env.SENDGRID_API_KEY;
  if (!key) {
    throw new Error(
      "SENDGRID_API_KEY is not set — refusing to send email. Configure it in .env before enabling MFA."
    );
  }
  sgMail.setApiKey(key);
  initialised = true;
}

/** Inline attachment for embedded images (e.g., the logo). The `cid` is
 * referenced from the HTML as `<img src="cid:logo">`. */
export interface InlineAttachment {
  /** Raw bytes of the file. */
  content: Buffer;
  /** Filename SendGrid will report — purely cosmetic for inline images. */
  filename: string;
  /** MIME type, e.g., "image/png". */
  type: string;
  /** Content-ID without angle brackets, e.g., "logo" → cid:logo. */
  cid: string;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  /** Plain-text fallback. Required by SendGrid for deliverability. */
  text: string;
  /** Optional HTML version. If omitted, only text is sent. */
  html?: string;
  /** Optional inline attachments (for embedded logos / images). */
  attachments?: InlineAttachment[];
}

export async function sendTransactionalEmail(params: SendEmailParams): Promise<void> {
  ensureClient();

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || "no-reply@hclhealthcare.in";
  const fromName = process.env.SENDGRID_FROM_NAME || "Habit Intelligence";

  const attachments = params.attachments?.map((a) => ({
    content: a.content.toString("base64"),
    filename: a.filename,
    type: a.type,
    disposition: "inline" as const,
    content_id: a.cid,
  }));

  await sgMail.send({
    to: params.to,
    from: { email: fromEmail, name: fromName },
    subject: params.subject,
    text: params.text,
    ...(params.html ? { html: params.html } : {}),
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  });
}
