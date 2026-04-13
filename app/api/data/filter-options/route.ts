import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { dataSources, getFilterableColumns } from "@/lib/config/data-sources";

// In-memory cache: key = "table:cugCode" → { data, timestamp }
const cache = new Map<string, { data: Record<string, string[]>; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * POST /api/data/filter-options
 * Body: { tables: ["aggregated_table.stage_master", ...] }
 * Returns: { "facility_name": ["Location A", ...], "stage": ["Completed", ...], ... }
 *
 * Scans the provided tables for filterable columns (from the whitelist),
 * fetches distinct values, deduplicates across tables, and caches in memory.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const body = await request.json();
    const tables: string[] = body.tables ?? [];

    if (tables.length === 0) {
      return NextResponse.json({ options: {} });
    }

    // Validate all tables are in the whitelist
    const validTables = tables.filter((t) => t in dataSources);
    if (validTables.length === 0) {
      return NextResponse.json({ options: {} });
    }

    // Collect filterable columns across all tables, deduplicate by column name
    // Map: columnName → { table, column, label, type }
    const columnMap = new Map<
      string,
      { table: string; column: string; label: string; type: string }
    >();

    for (const table of validTables) {
      const cols = getFilterableColumns(table);
      for (const col of cols) {
        // Skip timestamp columns — they use date pickers, not dropdowns
        if (col.type === "timestamp") continue;
        // First table to define a column wins (avoids duplicate queries)
        if (!columnMap.has(col.key)) {
          columnMap.set(col.key, {
            table,
            column: col.key,
            label: col.label,
            type: col.type,
          });
        }
      }
    }

    // Fetch distinct values for each column (with caching)
    const options: Record<string, string[]> = {};

    await Promise.all(
      Array.from(columnMap.entries()).map(async ([colName, info]) => {
        const cacheKey = `${info.table}:${colName}:${cugCode}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          options[colName] = cached.data[colName] ?? [];
          return;
        }

        // Query distinct values
        const ds = dataSources[info.table];
        if (!ds) return;

        try {
          const rows = await dwQuery<Record<string, unknown>>(
            `SELECT DISTINCT ${info.column}
             FROM ${info.table}
             WHERE ${ds.cugColumn} = $1
               AND ${info.column} IS NOT NULL
               AND TRIM(${info.column}::text) != ''
             ORDER BY ${info.column}
             LIMIT 200`,
            [cugCode]
          );

          const values = rows
            .map((r) => String(r[info.column] ?? ""))
            .filter(Boolean);

          options[colName] = values;

          // Cache the result
          cache.set(cacheKey, {
            data: { [colName]: values },
            ts: Date.now(),
          });
        } catch {
          // If query fails (timeout, etc.), return empty — don't block other columns
          options[colName] = [];
        }
      })
    );

    return NextResponse.json({ options });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Filter options API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
