import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// List version history for a dashboard
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await params;

    const versions = await prisma.dashboardVersion.findMany({
      where: { dashboardId: id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        title: true,
        publishedBy: true,
        publishedAt: true,
      },
    });

    return NextResponse.json({ versions });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List versions error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Restore a specific version — copies its config back into the draft
export async function POST(
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
    const { versionId } = body;

    if (!versionId) {
      return NextResponse.json(
        { error: "versionId is required" },
        { status: 400 }
      );
    }

    const version = await prisma.dashboardVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.dashboardId !== id) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    const dashboard = await prisma.dashboardDefinition.update({
      where: { id },
      data: {
        config: version.config as object,
        title: version.title,
        isDraft: true,
      },
    });

    return NextResponse.json({
      dashboard: { id: dashboard.id, title: dashboard.title },
      restoredFrom: version.version,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Restore version error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
