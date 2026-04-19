import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

// ── DELETE /api/comments/:id — delete own comment
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const comment = await prisma.chartComment.findUnique({ where: { id } });
    if (!comment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Only the author or SUPER_ADMIN can delete
    if (comment.userId !== session.user.id && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete replies first, then the comment
    await prisma.chartComment.deleteMany({ where: { parentId: id } });
    await prisma.chartComment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Delete comment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
