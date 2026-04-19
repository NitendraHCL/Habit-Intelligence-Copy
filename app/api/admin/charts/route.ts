import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

// List chart templates
export async function GET() {
  try {
    await requireAuth();

    const charts = await prisma.chartDefinition.findMany({
      where: { isTemplate: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        config: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ charts });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List charts error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Save a chart definition (optionally as a reusable template)
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, config, isTemplate } = body;

    if (!name || !config) {
      return NextResponse.json(
        { error: "name and config are required" },
        { status: 400 }
      );
    }

    const chart = await prisma.chartDefinition.create({
      data: {
        name,
        config,
        isTemplate: isTemplate ?? false,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ chart }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create chart error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
