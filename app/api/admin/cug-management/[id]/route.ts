import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// ── PUT /api/admin/cug-management/:id — update a CUG
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
    const { cugCode, cugName, enabledPages, hasCustomDashboards } = body ?? {};
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...(cugCode !== undefined && { cugCode }),
        ...(cugName !== undefined && { cugName }),
        ...(enabledPages !== undefined && { enabledPages }),
        ...(hasCustomDashboards !== undefined && { hasCustomDashboards }),
      },
    });
    return NextResponse.json({ client });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update CUG error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/admin/cug-management/:id — delete a CUG
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
    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete CUG error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
