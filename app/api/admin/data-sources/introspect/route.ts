import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";

// ── GET /api/admin/data-sources/introspect?table=schema.table ──
// Reads information_schema.columns on the warehouse for the given table and
// returns a suggested column map that the admin UI can auto-fill into the
// form. Read-only — no grants needed beyond what the app user already has.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table");
    if (!table || !/^[\w]+\.[\w]+$/.test(table)) {
      return NextResponse.json(
        { error: "Provide ?table=schema.table" },
        { status: 400 }
      );
    }
    const [schema, name] = table.split(".");

    const rows = await dwQuery<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2
       ORDER BY ordinal_position`,
      [schema, name],
      { statementTimeoutMs: 10_000 }
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: `Table "${table}" not found or not visible` },
        { status: 404 }
      );
    }

    // Map Postgres types to our ColumnType + sensible default flags.
    type ColMeta = {
      label: string;
      type: "timestamp" | "text" | "number" | "boolean";
      groupable?: boolean;
      aggregatable?: boolean;
      filterable?: boolean;
    };
    const columns: Record<string, ColMeta> = {};
    for (const r of rows) {
      const pgType = r.data_type.toLowerCase();
      let type: ColMeta["type"];
      let aggregatable = false;
      if (pgType.includes("timestamp") || pgType === "date") {
        type = "timestamp";
      } else if (pgType === "boolean") {
        type = "boolean";
      } else if (
        pgType === "integer" ||
        pgType === "bigint" ||
        pgType === "smallint" ||
        pgType === "numeric" ||
        pgType === "real" ||
        pgType === "double precision"
      ) {
        type = "number";
        aggregatable = true;
      } else {
        type = "text";
      }
      columns[r.column_name] = {
        label: r.column_name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase()),
        type,
        groupable: type !== "number",
        aggregatable,
        filterable: true,
      };
    }

    return NextResponse.json({
      table,
      columns,
      suggestion: {
        // Heuristic cug column guess — app uses cug_code_mapped on most
        // aggregated tables. Admin can override in the form.
        cugColumn: columns.cug_code_mapped
          ? "cug_code_mapped"
          : columns.cug_code_reg
            ? "cug_code_reg"
            : Object.keys(columns).find((c) => c.includes("cug")) ?? "",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Introspect error:", error);
    return NextResponse.json(
      { error: "Introspection failed", details: String(error) },
      { status: 500 }
    );
  }
}
