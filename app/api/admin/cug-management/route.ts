import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// ── GET /api/admin/cug-management — list all CUGs
export async function GET() {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const clients = await prisma.client.findMany({
      orderBy: { cugName: "asc" },
      select: {
        id: true,
        cugId: true,
        cugCode: true,
        cugName: true,
        enabledPages: true,
        hasCustomDashboards: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({ clients });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List CUGs error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/admin/cug-management — register a new CUG
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const { cugCode, cugName, enabledPages, hasCustomDashboards } = body ?? {};
    if (!cugName || !cugCode) {
      return NextResponse.json({ error: "cugName and cugCode are required" }, { status: 400 });
    }
    const client = await prisma.client.create({
      data: {
        cugId: `${crypto.randomUUID()}`,
        cugCode,
        cugName,
        enabledPages: enabledPages ?? null,
        hasCustomDashboards: hasCustomDashboards ?? false,
      },
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create CUG error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
