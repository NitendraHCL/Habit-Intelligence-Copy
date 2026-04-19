import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createHash } from "crypto";

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

// ── GET /api/admin/user-management?type=internal|external
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const type = new URL(request.url).searchParams.get("type") ?? "all";
    const internalRoles = ["SUPER_ADMIN", "INTERNAL_OPS", "KAM"];
    const externalRoles = ["CLIENT_ADMIN", "CLIENT_VIEWER"];

    const whereRole =
      type === "internal"
        ? { role: { in: internalRoles as any } }
        : type === "external"
          ? { role: { in: externalRoles as any } }
          : {};

    const users = await prisma.user.findMany({
      where: whereRole,
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        clientId: true,
        lastLoginAt: true,
        createdAt: true,
        client: { select: { id: true, cugName: true, cugCode: true } },
        clientAssignments: {
          select: {
            id: true,
            clientId: true,
            client: { select: { id: true, cugName: true, cugCode: true } },
          },
        },
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/admin/user-management — create user
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role, clientId, assignedCugIds } = body ?? {};

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: "name, email, password, and role are required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ["SUPER_ADMIN", "INTERNAL_OPS", "KAM", "CLIENT_ADMIN", "CLIENT_VIEWER"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
    }

    // External users must have a clientId
    if (["CLIENT_ADMIN", "CLIENT_VIEWER"].includes(role) && !clientId) {
      return NextResponse.json(
        { error: "External users must be assigned to a CUG (clientId required)" },
        { status: 400 }
      );
    }

    // Check duplicate email
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(password),
        role: role as any,
        clientId: ["CLIENT_ADMIN", "CLIENT_VIEWER"].includes(role) ? clientId : null,
        isActive: true,
      },
    });

    // For KAM, create CUG assignments
    if (role === "KAM" && Array.isArray(assignedCugIds) && assignedCugIds.length > 0) {
      await prisma.userClientAssignment.createMany({
        data: assignedCugIds.map((cId: string) => ({
          userId: user.id,
          clientId: cId,
          role: "KAM" as any,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Create user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
