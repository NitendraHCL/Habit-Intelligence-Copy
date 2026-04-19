import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// List dashboards (optionally filtered by clientId)
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;

    const slug = searchParams.get("slug");
    if (slug) where.slug = slug;

    // Non-superadmin users can only see published dashboards for their client
    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      where.isDraft = false;
      where.clientId = session.user.clientId;
    }

    const dashboards = await prisma.dashboardDefinition.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ dashboards });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List dashboards error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Create a new dashboard
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, slug, title, subtitle, icon, navGroup, config } = body;

    if (!slug || !title || !config) {
      return NextResponse.json(
        { error: "slug, title, and config are required" },
        { status: 400 }
      );
    }

    const dashboard = await prisma.dashboardDefinition.create({
      data: {
        clientId: clientId || null,
        slug,
        title,
        subtitle: subtitle || null,
        icon: icon || "BarChart3",
        navGroup: navGroup || "Custom",
        config,
        isDraft: true,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
