import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { refreshRegistryFromDB } from "@/lib/config/data-sources-server";

// ── PUT /api/admin/data-sources/:id ── update
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    if (!["SUPER_ADMIN", "INTERNAL_OPS"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const { label, cugColumn, columns, joins, enabled } = body ?? {};
    const row = await prisma.dataSourceRegistry.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(cugColumn !== undefined && { cugColumn }),
        ...(columns !== undefined && { columns }),
        ...(joins !== undefined && { joins }),
        ...(enabled !== undefined && { enabled }),
      },
    });
    await refreshRegistryFromDB(true);
    return NextResponse.json({ dataSource: row });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update data source error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE /api/admin/data-sources/:id ──
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    if (!["SUPER_ADMIN", "INTERNAL_OPS"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    await prisma.dataSourceRegistry.delete({ where: { id } });
    await refreshRegistryFromDB(true);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete data source error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
