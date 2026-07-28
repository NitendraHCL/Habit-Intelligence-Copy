import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";
import {
  SODEXO_TABLE,
  isCompleted,
  parseComplianceFilters,
  buildComplianceWhere,
  complianceFilterOptions,
} from "@/lib/compliance/sodexo";

/* ────────────────────────────────────────────────────────────────────
 * SOD001 (Sodexo) Compliance — Employee Detail API.
 *
 * Employee-level detail table backed by aggregated_table."sodexo_Apt"
 * (alias `s`), scoped to cug_code = 'SOD001'. Every metric + row respects
 * the shared global filters (Month, Site, Package Type, Gender, Booking
 * Status) plus this page's extra Employee id filter. There is NO date
 * picker on this dashboard.
 *
 * Response shape mirrors the OHC dashboards: { kpis, charts, filterOptions }.
 * ──────────────────────────────────────────────────────────────────── */

// Rows returned to the client are capped for performance; the table shows a
// truncation note when the total exceeds this.
const ROW_CAP = 500;

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Rows · Unique Employees · Complete Healthchecks)",
    sources: [SODEXO_TABLE],
    logic:
      "Over the filtered SOD001 rows: Rows = COUNT(*); Unique Employees = " +
      "COUNT(DISTINCT employee_id); Complete Healthchecks = COUNT(*) of rows " +
      "where Completed__Logic is 'completed' (case-insensitive).",
    sql: "SELECT COUNT(*) AS rows, COUNT(DISTINCT s.employee_id) AS unique_employees, COUNT(*) FILTER (WHERE <completed>) AS complete_healthchecks FROM sodexo_Apt s WHERE <filters>.",
  },
  employeeDetail: {
    chart: "Employee-Level Detail table",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered SOD001 rows, one row per employee record: Name (first_name), " +
      "Gender (gender), Package Name (package_name), Count of Employee (1 per " +
      "row), Employee id (employee_id), Complete Healthcheck ('Complete' when " +
      "Completed__Logic = 'completed', else '—'), Status (status). Ordered by " +
      `first_name and capped at ${ROW_CAP} rows for transport; a total count is ` +
      "returned so the UI can flag truncation.",
    sql: `SELECT s.first_name, s.gender, s.package_name, s.employee_id, <completed>, s.status FROM sodexo_Apt s WHERE <filters> ORDER BY s.first_name LIMIT ${ROW_CAP}.`,
  },
};

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    // Every Compliance route is scoped to SOD001; still resolve the session
    // cug so unauthorised tenants can't reach the endpoint.
    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }
    // Compliance dashboards are Sodexo-only — block other tenants from SOD001 data.
    if (cugCode !== "SOD001") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const filters = parseComplianceFilters(searchParams);
    const { where, params } = buildComplianceWhere(filters, 1, "s");
    const completed = isCompleted("s");

    const failedQueries: string[] = [];
    async function safeQuery<T extends Record<string, unknown>>(
      fn: () => Promise<T[]>,
      tag: string,
    ): Promise<T[]> {
      try {
        return await fn();
      } catch (e) {
        console.error(`Employee-detail query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    const [kpiRows, rows, filterOptions] = await Promise.all([
      // ── KPIs ── single pass over the filtered rows.
      safeQuery(
        () =>
          dwQuery<{
            rows: string;
            unique_employees: string;
            complete_healthchecks: string;
          }>(
            `SELECT
               COUNT(*)::bigint                                    AS rows,
               COUNT(DISTINCT s.employee_id)::bigint               AS unique_employees,
               COUNT(*) FILTER (WHERE ${completed})::bigint        AS complete_healthchecks
             FROM ${SODEXO_TABLE} s
             WHERE ${where}`,
            params,
          ),
        "kpi",
      ),
      // ── Employee-level detail rows (capped, ordered by name) ──
      safeQuery(
        () =>
          dwQuery<{
            first_name: string | null;
            gender: string | null;
            package_name: string | null;
            employee_id: string | null;
            completed: boolean;
            status: string | null;
          }>(
            `SELECT
               s.first_name                 AS first_name,
               s.gender                     AS gender,
               s.package_name               AS package_name,
               s.employee_id                AS employee_id,
               (${completed})               AS completed,
               s.status                     AS status
             FROM ${SODEXO_TABLE} s
             WHERE ${where}
             ORDER BY s.first_name NULLS LAST
             LIMIT ${ROW_CAP}`,
            params,
          ),
        "employeeDetail",
      ),
      // ── Filter-option dropdowns (Month, Site, Package Type, Gender, Status) ──
      complianceFilterOptions(<T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
        dwQuery<T & Record<string, unknown>>(sql, p) as Promise<T[]>,
      ).catch((e) => {
        console.error("Employee-detail filterOptions failed:", e);
        failedQueries.push("filterOptions");
        return {
          months: [] as string[],
          sites: [] as string[],
          packageTypes: [] as string[],
          genders: [] as string[],
          bookingStatuses: [] as string[],
        };
      }),
    ]);

    const total = Number(kpiRows[0]?.rows || 0);
    const uniqueEmployees = Number(kpiRows[0]?.unique_employees || 0);
    const completeHealthchecks = Number(kpiRows[0]?.complete_healthchecks || 0);

    const employeeDetail = rows.map((r) => ({
      name: r.first_name ?? "",
      gender: r.gender ?? "",
      packageName: r.package_name ?? "",
      count: 1,
      employeeId: r.employee_id ?? "",
      completeHealthcheck: r.completed ? "Complete" : "—",
      status: r.status ?? "",
    }));

    return NextResponse.json({
      kpis: {
        rows: total,
        uniqueEmployees,
        completeHealthchecks,
      },
      charts: {
        employeeDetail,
        // How many rows the caller actually received vs. how many matched —
        // lets the UI show a truncation note instead of silently capping.
        returned: employeeDetail.length,
        total,
        truncated: total > employeeDetail.length,
      },
      filterOptions,
      lastUpdated: new Date().toISOString(),
      meta: {
        hadErrors: failedQueries.length > 0,
        failedQueries,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Compliance Employee-Detail API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "compliance/employee-detail" }),
  PROVENANCE,
);
