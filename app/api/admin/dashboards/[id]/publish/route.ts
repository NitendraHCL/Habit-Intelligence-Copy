import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// Publish a dashboard — creates a version snapshot and marks as published
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (!["SUPER_ADMIN", "INTERNAL_OPS"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dashboard = await prisma.dashboardDefinition.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!dashboard) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextVersion =
      dashboard.versions.length > 0 ? dashboard.versions[0].version + 1 : 1;

    // Create version snapshot + mark as published in a transaction
    const [version, updated] = await prisma.$transaction([
      prisma.dashboardVersion.create({
        data: {
          dashboardId: id,
          version: nextVersion,
          config: dashboard.config as object,
          title: dashboard.title,
          publishedBy: session.user.id,
        },
      }),
      prisma.dashboardDefinition.update({
        where: { id },
        data: { isDraft: false, publishedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      version: version.version,
      publishedAt: updated.publishedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Publish dashboard error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
