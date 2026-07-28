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
 * SOD001 (Sodexo) Compliance — "Site Performance" API.
 *
 * Single-table fact model: aggregated_table."sodexo_Apt" (alias `s`),
 * always scoped to cug_code = 'SOD001' by buildComplianceWhere(). Every
 * row is one employee × package appointment. Health-check completion is
 * derived from the Completed__Logic column via isCompleted('s'):
 *   completed = LOWER(Completed__Logic) = 'completed'
 *   overdue   = NOT completed
 *
 * Global filters (all respected by KPIs + the Site Performance table):
 *   months          → s."MONTH"      (text like 'Apr-25')
 *   sites           → s."DC_Name"    (the site / distribution centre)
 *   packageTypes    → derived pkgCategory('s')
 *   genders         → s.gender
 *   bookingStatuses → s.status
 *
 * TODO confirm: the client's Power BI "12,366 overdue" headline may use a
 * different overdue rule than NOT isCompleted() (e.g. a Due Date cutoff).
 * We keep the logic transparent and derived purely from Completed__Logic
 * rather than inventing a rule. Adjust here once the client confirms.
 * ──────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per chart/section, keyed identically
 * to the `charts` keys in the response (plus `kpis`). Shipped only to
 * SUPER_ADMIN callers. Every query reads SODEXO_TABLE (alias `s`) with the
 * shared SOD001-scoped filter (Month, Site, Package Type, Gender, Booking
 * Status). "Completed" = Completed__Logic = 'completed'; "Overdue" = NOT.
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Total Employees in Site · Completed · Overdue)",
    sources: [SODEXO_TABLE],
    logic:
      "Over the filtered SOD001 rows: Total Employees in Site = COUNT(DISTINCT employee_id) over ALL rows; " +
      "Completed in Site = COUNT(*) where Completed__Logic = 'completed'; Overdue in Site = COUNT(*) where NOT. " +
      "Note: overdue is derived purely from Completed__Logic — the client's Power BI 'overdue' figure may apply a " +
      "different rule (e.g. a Due Date cutoff); left transparent pending confirmation.",
    sql: "SELECT COUNT(DISTINCT s.employee_id), COUNT(*) FILTER (isCompleted), COUNT(*) FILTER (NOT isCompleted) FROM sodexo_Apt s WHERE <filters>.",
  },
  sitePerformance: {
    chart: "Site Performance — per-site Completed vs Overdue health checks",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered SOD001 rows grouped by s.\"DC_Name\": Completed_Site = COUNT(*) FILTER (Completed__Logic = 'completed'); " +
      "Overdue Health Checks = COUNT(*) FILTER (NOT completed); Total = COUNT(*). Ordered by total desc; the page adds a " +
      "grand-total row and a top-~15 bar view.",
    sql: "GROUP BY s.\"DC_Name\" → COUNT(*) FILTER (isCompleted), COUNT(*) FILTER (NOT isCompleted), COUNT(*) ORDER BY total DESC.",
  },
};

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    // Auth/tenant resolution. The query itself is hard-scoped to SOD001 via
    // buildComplianceWhere(), but we still resolve the session cug so callers
    // without a client selected get a clean 400 (mirrors the other routes).
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

    const failedQueries: string[] = [];
    async function safeQuery<T extends Record<string, unknown>>(
      fn: () => Promise<T[]>,
      tag: string,
    ): Promise<T[]> {
      try {
        return await fn();
      } catch (e) {
        console.error(`Site Performance query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    const completed = isCompleted("s");

    const [kpiRows, siteRows, filterOptions] = await Promise.all([
      // ── KPIs ──
      safeQuery(
        () =>
          dwQuery<{ total_employees: string; completed: string; overdue: string }>(
            `SELECT
               COUNT(DISTINCT s.employee_id)::bigint            AS total_employees,
               COUNT(*) FILTER (WHERE ${completed})::bigint     AS completed,
               COUNT(*) FILTER (WHERE NOT ${completed})::bigint AS overdue
             FROM ${SODEXO_TABLE} s
             WHERE ${where}`,
            params,
          ),
        "kpis",
      ),
      // ── Site Performance (per DC_Name) ──
      safeQuery(
        () =>
          dwQuery<{ site: string; completed: string; overdue: string; total: string }>(
            `SELECT
               s."DC_Name"                                      AS site,
               COUNT(*) FILTER (WHERE ${completed})::bigint     AS completed,
               COUNT(*) FILTER (WHERE NOT ${completed})::bigint AS overdue,
               COUNT(*)::bigint                                 AS total
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND s."DC_Name" IS NOT NULL AND TRIM(s."DC_Name") <> ''
             GROUP BY s."DC_Name"
             ORDER BY total DESC`,
            params,
          ),
        "sitePerformance",
      ),
      // complianceFilterOptions types its dwQuery arg with a looser generic
      // (T = Record<string, unknown>) than the real dwQuery (T extends
      // Record<string, unknown>); the two signatures are compatible at the
      // call sites it uses, so cast to bridge the generic constraint.
      complianceFilterOptions(
        dwQuery as Parameters<typeof complianceFilterOptions>[0],
      ),
    ]);

    const totalEmployees = Number(kpiRows[0]?.total_employees || 0);
    const completedCount = Number(kpiRows[0]?.completed || 0);
    const overdueCount = Number(kpiRows[0]?.overdue || 0);

    const sitePerformance = siteRows.map((r) => ({
      site: r.site,
      completed: Number(r.completed),
      overdue: Number(r.overdue),
      total: Number(r.total),
    }));

    return NextResponse.json({
      kpis: {
        totalEmployees,
        completedCount,
        overdueCount,
      },
      filterOptions,
      charts: {
        sitePerformance,
      },
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
    console.error("Site Performance API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "compliance/site-performance" }),
  PROVENANCE,
);
