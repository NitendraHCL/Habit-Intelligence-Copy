import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// Get a single dashboard with full config
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const dashboard = await prisma.dashboardDefinition.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "desc" }, take: 10 } },
    });

    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ dashboard });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update a dashboard
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, subtitle, slug, icon, navGroup, config } = body;

    const dashboard = await prisma.dashboardDefinition.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(subtitle !== undefined && { subtitle }),
        ...(slug !== undefined && { slug }),
        ...(icon !== undefined && { icon }),
        ...(navGroup !== undefined && { navGroup }),
        ...(config !== undefined && { config, isDraft: true }),
      },
    });

    return NextResponse.json({ dashboard });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Update dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Delete a dashboard
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.dashboardDefinition.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
