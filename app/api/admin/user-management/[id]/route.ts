import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/session";
import {
  validatePassword,
  checkPasswordHistory,
  archivePreviousPasswordHash,
} from "@/lib/auth/password-policy";
import { sendPasswordChangedEmail } from "@/lib/email/notifications";

// ── PUT /api/admin/user-management/:id — update user
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const { name, email, password, role, clientId, isActive, assignedCugIds, mfaEnabled } = body ?? {};

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = String(email).toLowerCase().trim();
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (mfaEnabled !== undefined) updateData.mfaEnabled = Boolean(mfaEnabled);

    // Password handling: enforce policy + history-no-reuse, then archive
    // the previous hash. We compute the new hash here but apply it as part
    // of the same `prisma.user.update` below so the change is atomic.
    let oldHashForArchive: string | null = null;
    if (password) {
      const validation = validatePassword(password);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const historyCheck = await checkPasswordHistory(id, password);
      if (!historyCheck.ok) {
        return NextResponse.json({ error: historyCheck.error }, { status: 400 });
      }
      const existing = await prisma.user.findUnique({
        where: { id },
        select: { passwordHash: true },
      });
      oldHashForArchive = existing?.passwordHash ?? null;
      updateData.passwordHash = await hashPassword(password);
      // Admin just wrote this password — force the user to choose their
      // own on next login. Matches the create-user behaviour above.
      updateData.mustChangePassword = true;
    }

    // If switching to a non-external role, clear clientId
    if (role && ["SUPER_ADMIN", "INTERNAL_OPS", "KAM"].includes(role)) {
      updateData.clientId = null;
    }

    // When MFA is being turned ON, invalidate any existing sessions so the
    // affected user is forced to re-authenticate and pass the OTP step on
    // their next visit. We only do this on the OFF→ON transition — turning
    // MFA off does not need to bounce active sessions.
    let invalidateSessions = false;
    if (mfaEnabled !== undefined) {
      const before = await prisma.user.findUnique({
        where: { id },
        select: { mfaEnabled: true },
      });
      if (before && !before.mfaEnabled && Boolean(mfaEnabled)) {
        invalidateSessions = true;
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData as any,
    });

    if (invalidateSessions) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }

    // Roll the old password into history if it was changed in this PUT.
    if (oldHashForArchive) {
      await archivePreviousPasswordHash(id, oldHashForArchive);
    }

    // Fire-and-forget confirmation email when an admin changed the
    // password. The recipient is the affected user, NOT the admin who
    // made the change — they need to know their password was changed
    // and react if it wasn't expected.
    if (oldHashForArchive) {
      sendPasswordChangedEmail({
        to: user.email,
        name: user.name,
        source: "admin-update",
      }).catch((err) => {
        console.error("[user-management/update] confirmation email failed", err);
      });
    }

    // For KAM, sync CUG assignments
    if (role === "KAM" && Array.isArray(assignedCugIds)) {
      // Remove old assignments
      await prisma.userClientAssignment.deleteMany({ where: { userId: id } });
      // Add new
      if (assignedCugIds.length > 0) {
        await prisma.userClientAssignment.createMany({
          data: assignedCugIds.map((cId: string) => ({
            userId: id,
            clientId: cId,
            role: "KAM" as any,
          })),
          skipDuplicates: true,
        });
      }
    }

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/admin/user-management/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    // Prevent self-delete
    if (id === session.user.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
