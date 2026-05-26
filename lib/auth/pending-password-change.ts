import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Transitional cookie + row that ties a browser to its in-flight force-
 * change challenge. Pattern mirrors the MFA pending-OTP cookie:
 *
 *   1. Credentials (and MFA OTP, if applicable) clear → if the user has
 *      `mustChangePassword=true`, we issue a row here instead of minting
 *      a session.
 *   2. The user's browser keeps the `pendingToken` in a short-lived
 *      cookie; nothing else (no session) is set.
 *   3. /api/auth/change-password resolves the token back to a userId,
 *      validates the new password, applies it, clears the flag, then
 *      mints the real session and deletes the row.
 *
 * Sessions are NEVER minted while a row exists — that's the whole point
 * of forcing the password change.
 */

export const PENDING_PASSWORD_CHANGE_COOKIE = "hi_pending_change";
export const PENDING_PASSWORD_CHANGE_TTL_MINUTES = 15;

function generatePendingToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Issue a fresh pending-change row for the given user. Any prior rows
 * for the same user are wiped so only one challenge is live at a time.
 */
export async function issuePendingPasswordChange(
  userId: string
): Promise<{ pendingToken: string; expiresAt: Date }> {
  await prisma.pendingPasswordChange.deleteMany({ where: { userId } });

  const pendingToken = generatePendingToken();
  const expiresAt = new Date(
    Date.now() + PENDING_PASSWORD_CHANGE_TTL_MINUTES * 60 * 1000
  );

  await prisma.pendingPasswordChange.create({
    data: { userId, pendingToken, expiresAt },
  });

  return { pendingToken, expiresAt };
}

export type ConsumeResult =
  | { ok: true; userId: string }
  | { ok: false; error: "not_found" | "expired" };

/**
 * Look up the in-flight challenge by pendingToken and return the bound
 * userId. Row is hard-deleted on success so the cookie is single-use.
 */
export async function consumePendingPasswordChange(
  pendingToken: string
): Promise<ConsumeResult> {
  const row = await prisma.pendingPasswordChange.findUnique({
    where: { pendingToken },
  });
  if (!row) return { ok: false, error: "not_found" };

  if (row.expiresAt < new Date()) {
    await prisma.pendingPasswordChange.delete({ where: { id: row.id } });
    return { ok: false, error: "expired" };
  }

  await prisma.pendingPasswordChange.delete({ where: { id: row.id } });
  return { ok: true, userId: row.userId };
}
