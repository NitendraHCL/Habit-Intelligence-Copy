import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/session";

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
    const { name, email, password, role, clientId, isActive, assignedCugIds } = body ?? {};

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (password) updateData.passwordHash = await hashPassword(password);
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (clientId !== undefined) updateData.clientId = clientId;

    // If switching to a non-external role, clear clientId
    if (role && ["SUPER_ADMIN", "INTERNAL_OPS", "KAM"].includes(role)) {
      updateData.clientId = null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData as any,
    });

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
