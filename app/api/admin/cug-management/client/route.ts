import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// ── GET /api/admin/cug-management/client?id=<clientId> ──
// Lightweight fetch of a single client's enabledPages + hasCustomDashboards.
// Used by the auth context when the user switches clients.
export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        cugCode: true,
        cugName: true,
        enabledPages: true,
        hasCustomDashboards: true,
      },
    });
    if (!client) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ client });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
