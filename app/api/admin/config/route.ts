import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/session";
import type { DashboardConfig } from "@/lib/types/dashboard-config";

/**
 * GET /api/admin/config?clientId=X
 * Returns { draftConfig, publishedConfig, configPublishedAt } for the given client.
 * Requires SUPER_ADMIN role.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();

    const { searchParams } = request.nextUrl;
    const clientId = searchParams.get("clientId");

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId parameter required" },
        { status: 400 }
      );
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        draftConfig: true,
        publishedConfig: true,
        configPublishedAt: true,
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json({
      draftConfig: (client.draftConfig as unknown as DashboardConfig) ?? null,
      publishedConfig: (client.publishedConfig as unknown as DashboardConfig) ?? null,
      configPublishedAt: client.configPublishedAt ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Admin config GET error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/config
 * Body: { clientId: string, config: DashboardConfig }
 * Saves config to the client's draftConfig column.
 * Requires SUPER_ADMIN role.
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, config } = body as {
      clientId?: string;
      config?: DashboardConfig;
    };

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      );
    }

    if (!config || typeof config !== "object") {
      return NextResponse.json(
        { error: "config is required and must be an object" },
        { status: 400 }
      );
    }

    // Verify client exists
    const existing = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: { draftConfig: config as any },
      select: { draftConfig: true },
    });

    return NextResponse.json({
      draftConfig: updated.draftConfig,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Admin config PUT error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/config
 * Body: { clientId: string, action: "publish" }
 * Copies draftConfig to publishedConfig and sets configPublishedAt.
 * Requires SUPER_ADMIN role.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, action } = body as {
      clientId?: string;
      action?: string;
    };

    if (!clientId) {
      return NextResponse.json(
        { error: "clientId is required" },
        { status: 400 }
      );
    }

    if (action !== "publish") {
      return NextResponse.json(
        { error: 'Invalid action. Expected "publish"' },
        { status: 400 }
      );
    }

    // Read current draft
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { draftConfig: true },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.draftConfig) {
      return NextResponse.json(
        { error: "No draft config to publish" },
        { status: 400 }
      );
    }

    const now = new Date();

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: {
        publishedConfig: client.draftConfig as any,
        configPublishedAt: now,
      },
      select: {
        publishedConfig: true,
        configPublishedAt: true,
      },
    });

    return NextResponse.json({
      publishedConfig: updated.publishedConfig,
      configPublishedAt: updated.configPublishedAt,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Admin config POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
