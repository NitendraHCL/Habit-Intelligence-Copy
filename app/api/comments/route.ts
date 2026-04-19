import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// ── GET /api/comments?chartId=X&clientId=Y&pageSlug=Z
// Returns all comments for a chart, with author info + replies.
// Visible to: SUPER_ADMIN, INTERNAL_OPS, KAM, CLIENT_ADMIN
// NOT visible to: CLIENT_VIEWER
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    // CLIENT_VIEWER cannot see comments
    if (session.user.role === "CLIENT_VIEWER") {
      return NextResponse.json({ comments: [] });
    }

    const { searchParams } = new URL(request.url);
    const chartId = searchParams.get("chartId");
    const clientId = searchParams.get("clientId");
    const pageSlug = searchParams.get("pageSlug");

    if (!chartId || !clientId) {
      return NextResponse.json({ error: "chartId and clientId required" }, { status: 400 });
    }

    const comments = await prisma.chartComment.findMany({
      where: {
        chartId,
        clientId,
        ...(pageSlug ? { pageSlug } : {}),
        parentId: null, // top-level only; replies loaded via include
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ comments });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Get comments error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/comments — create a comment or reply
// Allowed: SUPER_ADMIN, KAM, CLIENT_ADMIN
// NOT allowed: INTERNAL_OPS (read-only), CLIENT_VIEWER (no access)
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const allowedRoles = ["SUPER_ADMIN", "KAM", "CLIENT_ADMIN"];
    if (!allowedRoles.includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { chartId, pageSlug, clientId, text, anchor, parentId } = body ?? {};

    if (!chartId || !pageSlug || !clientId || !text || !anchor) {
      return NextResponse.json(
        { error: "chartId, pageSlug, clientId, text, and anchor are required" },
        { status: 400 }
      );
    }

    const comment = await prisma.chartComment.create({
      data: {
        chartId,
        pageSlug,
        clientId,
        userId: session.user.id,
        text,
        anchor,
        parentId: parentId || null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create comment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
