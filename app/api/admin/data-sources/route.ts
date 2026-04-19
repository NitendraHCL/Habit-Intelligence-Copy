import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { refreshRegistryFromDB } from "@/lib/config/data-sources-server";

// ── GET /api/admin/data-sources ── list every registered data source
// (includes disabled rows for the admin UI). Also refreshes the in-memory
// registry as a side effect.
export async function GET() {
  try {
    const session = await requireAuth();
    // Anyone can read the list (the builder's dropdowns rely on it),
    // but only super admins can write (see POST/PUT/DELETE).
    void session;
    await refreshRegistryFromDB(false);
    const rows = await prisma.dataSourceRegistry.findMany({
      orderBy: { label: "asc" },
    });
    return NextResponse.json({ dataSources: rows });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("List data sources error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST /api/admin/data-sources ── create a new entry
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const { table, label, cugColumn, columns, joins, enabled } = body ?? {};
    if (!table || !label || !cugColumn || !columns) {
      return NextResponse.json(
        { error: "table, label, cugColumn, and columns are required" },
        { status: 400 }
      );
    }
    const row = await prisma.dataSourceRegistry.create({
      data: {
        table,
        label,
        cugColumn,
        columns,
        joins: joins ?? null,
        enabled: enabled ?? true,
      },
    });
    await refreshRegistryFromDB(true);
    return NextResponse.json({ dataSource: row }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Unique violation on `table`
    if (error instanceof Error && /Unique constraint/.test(error.message)) {
      return NextResponse.json(
        { error: "A data source with this table name already exists" },
        { status: 409 }
      );
    }
    console.error("Create data source error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
