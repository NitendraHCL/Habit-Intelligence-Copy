import bcryptjs from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

/**
 * Password policy — single source of truth.
 *
 * Classic-enterprise complexity rules: a candidate password must clear
 * every rule below to be accepted. The same rules are enforced in three
 * places: admin user-creation, admin password-edit, and the
 * forgot-password reset flow. The client mirrors the rules for live UX
 * feedback; the server is the only thing that decides.
 *
 * History: we additionally refuse to accept a password that matches the
 * user's current password or either of their last two — i.e. their last
 * three distinct passwords are off-limits.
 */

export const POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  /** Total distinct passwords the user cannot reuse, current included. */
  historyDepth: 3,
} as const;

/** Recognised special characters. Generous so users aren't surprised. */
const SPECIAL_CHARS_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;

/** A single rule in the policy. Used to render the live checklist. */
export type PolicyRuleId =
  | "minLength"
  | "maxLength"
  | "uppercase"
  | "lowercase"
  | "digit"
  | "special";

export interface PolicyRuleStatus {
  id: PolicyRuleId;
  label: string;
  ok: boolean;
}

/**
 * Evaluate every rule against the candidate. Returns one entry per rule
 * so the UI can show ✓/✗ inline as the user types. The order matters —
 * we render in this order.
 */
export function evaluatePolicy(password: string): PolicyRuleStatus[] {
  return [
    {
      id: "minLength",
      label: `At least ${POLICY.minLength} characters`,
      ok: password.length >= POLICY.minLength,
    },
    {
      id: "maxLength",
      label: `No more than ${POLICY.maxLength} characters`,
      ok: password.length <= POLICY.maxLength,
    },
    {
      id: "uppercase",
      label: "An uppercase letter (A–Z)",
      ok: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "A lowercase letter (a–z)",
      ok: /[a-z]/.test(password),
    },
    { id: "digit", label: "A number (0–9)", ok: /[0-9]/.test(password) },
    {
      id: "special",
      label: "A special character (e.g. ! @ # $ %)",
      ok: SPECIAL_CHARS_RE.test(password),
    },
  ];
}

export interface ValidationResult {
  ok: boolean;
  /** Human-friendly error to surface to the client when ok=false. */
  error?: string;
}

/**
 * Server-side validator. Returns a single error string suitable for
 * direct surfacing to the UI when validation fails. The UI also runs
 * `evaluatePolicy` to show per-rule feedback so users rarely hit this
 * error in practice.
 */
export function validatePassword(password: unknown): ValidationResult {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, error: "Password is required." };
  }
  if (password.length < POLICY.minLength) {
    return { ok: false, error: `Password must be at least ${POLICY.minLength} characters.` };
  }
  if (password.length > POLICY.maxLength) {
    return { ok: false, error: `Password must be at most ${POLICY.maxLength} characters.` };
  }
  const rules = evaluatePolicy(password);
  const firstFailure = rules.find((r) => !r.ok);
  if (firstFailure) {
    return {
      ok: false,
      error: `Password must include: ${firstFailure.label.toLowerCase()}.`,
    };
  }
  return { ok: true };
}

// ── password history ─────────────────────────────────────────────────────

/**
 * Check that `newPlainPassword` isn't the same as the user's current
 * password OR either of the previous two (HISTORY_DEPTH - 1 stored rows).
 * Returns ok=true when the new password is acceptably new.
 *
 * Implementation note: we cannot just compare hashes because bcrypt uses a
 * per-row random salt — the same plaintext produces a different hash every
 * time. So we have to call bcrypt.compare against each historical hash.
 * History depth is small (2 rows + current) so this is bounded.
 */
export async function checkPasswordHistory(
  userId: string,
  newPlainPassword: string
): Promise<ValidationResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    // Caller's bug, but fail-closed.
    return { ok: false, error: "User not found." };
  }

  // Compare against the live password.
  if (await bcryptjs.compare(newPlainPassword, user.passwordHash)) {
    return {
      ok: false,
      error: `You can't reuse any of your last ${POLICY.historyDepth} passwords. Please choose a different one.`,
    };
  }

  // Compare against the historical hashes (most recent first).
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: POLICY.historyDepth - 1,
  });

  for (const row of history) {
    if (await bcryptjs.compare(newPlainPassword, row.passwordHash)) {
      return {
        ok: false,
        error: `You can't reuse any of your last ${POLICY.historyDepth} passwords. Please choose a different one.`,
      };
    }
  }

  return { ok: true };
}

/**
 * After accepting a new password and updating user.passwordHash, call this
 * to roll the OLD hash into PasswordHistory and prune older rows so we
 * never store more than (HISTORY_DEPTH - 1) entries per user. Pass the
 * OLD hash that was previously on the user record.
 *
 * Idempotent / safe to call without an existing oldHash (the caller should
 * just skip it on the very first password set, where there's no prior).
 */
export async function archivePreviousPasswordHash(
  userId: string,
  oldHash: string
): Promise<void> {
  await prisma.passwordHistory.create({ data: { userId, passwordHash: oldHash } });

  // Prune the oldest rows that fall outside the policy window. We keep
  // (HISTORY_DEPTH - 1) because the current password lives on the user
  // row itself — the union of current + history rows is the no-reuse set.
  const keep = POLICY.historyDepth - 1;
  const rows = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const stale = rows.slice(keep).map((r) => r.id);
  if (stale.length > 0) {
    await prisma.passwordHistory.deleteMany({ where: { id: { in: stale } } });
  }
}
