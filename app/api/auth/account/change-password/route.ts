import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, hashPassword, verifyPassword } from "@/lib/auth/session";
import {
  validatePassword,
  checkPasswordHistory,
  archivePreviousPasswordHash,
} from "@/lib/auth/password-policy";
import { sendPasswordChangedEmail } from "@/lib/email/notifications";

/**
 * Self-service password change for a signed-in user (Settings page).
 *
 * Distinct from /api/auth/change-password, which serves the force-change /
 * pending-token flow. This one requires an authenticated session, verifies
 * the user's CURRENT password, then applies the same policy + no-reuse
 * history checks before swapping the hash. Touches only the existing
 * passwordHash column + password_history — no schema change.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { currentPassword, newPassword } = await request.json();
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return NextResponse.json(
        { error: "Current and new password are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Verify the current password.
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Your current password is incorrect." },
        { status: 401 }
      );
    }

    // 2) New password must differ from the current one.
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "New password must be different from your current password." },
        { status: 400 }
      );
    }

    // 3) Policy validation.
    const validation = validatePassword(newPassword);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // 4) No-reuse-last-N history check.
    const historyCheck = await checkPasswordHistory(user.id, newPassword);
    if (!historyCheck.ok) {
      return NextResponse.json({ error: historyCheck.error }, { status: 400 });
    }

    // 5) Swap the hash and archive the old one.
    const oldHash = user.passwordHash;
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash },
    });
    await archivePreviousPasswordHash(user.id, oldHash);

    // Fire-and-forget confirmation email — never let email failure undo the
    // password change.
    sendPasswordChangedEmail({
      to: user.email,
      name: user.name,
      source: "self-service",
    }).catch((err) => {
      console.error("[account/change-password] confirmation email failed", err);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Account change-password error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
