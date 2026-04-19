import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// List global templates (clientId = null)
export async function GET() {
  try {
    await requireAuth();

    const templates = await prisma.dashboardDefinition.findMany({
      where: { clientId: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        icon: true,
        navGroup: true,
        config: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List templates error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Apply a template to a specific client (clone with clientId)
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { templateId, clientId } = await request.json();

    if (!templateId || !clientId) {
      return NextResponse.json(
        { error: "templateId and clientId are required" },
        { status: 400 }
      );
    }

    const template = await prisma.dashboardDefinition.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const dashboard = await prisma.dashboardDefinition.create({
      data: {
        clientId,
        slug: template.slug,
        title: template.title,
        subtitle: template.subtitle,
        icon: template.icon,
        navGroup: template.navGroup,
        config: template.config as object,
        isDraft: true,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Apply template error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
