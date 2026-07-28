import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";
import {
  SODEXO_TABLE,
  BASE_PACKAGE,
  VACCINATION_IN,
  pkgCategory,
  isCompleted,
  parseComplianceFilters,
  buildComplianceWhere,
  complianceFilterOptions,
  MONTH_ORDER_SQL,
} from "@/lib/compliance/sodexo";

/* ────────────────────────────────────────────────────────────────────
 * SOD001 (Sodexo) — "Vaccinations & Additional Tests" dashboard.
 *
 * Source: aggregated_table."sodexo_Apt" (alias `s`), scoped to
 *   cug_code = 'SOD001'. All KPIs and charts read this single fact table
 *   (one row = one booking/test line). Package categorisation and the
 *   completion flag come from lib/compliance/sodexo.ts so this route stays
 *   consistent with the other Compliance pages.
 *
 * Global filters (Month, Site, Package Type, Gender, Booking Status) are
 * applied to every KPI and chart via buildComplianceWhere().
 *
 * Categories (pkgCategory):
 *   Base Package     = package_name = 'Sodexo Base Package'
 *   Vaccination      = package_name IN (VACCINATION_IN)
 *   Additional Test  = everything else
 * ──────────────────────────────────────────────────────────────────── */

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Complete Vaccination · Total Additional Tests)",
    sources: [SODEXO_TABLE],
    logic:
      "Over the filtered SOD001 rows: Complete Vaccination = COUNT(*) where package_name IN (vaccination packages); " +
      "Total Tests = COUNT(*) where the derived category = 'Additional Test' (package_name is neither the base " +
      "package nor a vaccination package).",
    sql: "SELECT COUNT(*) FILTER (WHERE package_name IN (<vax>)) AS vax, COUNT(*) FILTER (WHERE pkgCategory = 'Additional Test') AS tests FROM sodexo_Apt s WHERE <filters>.",
  },
  additionalDiagnostics: {
    chart: "Additional Diagnostics by Type (pie)",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered rows whose derived category = 'Additional Test', grouped by package_name; count = COUNT(*). " +
      "Ordered by count desc.",
    sql: "GROUP BY s.package_name WHERE pkgCategory(s) = 'Additional Test' → COUNT(*) ORDER BY 2 DESC.",
  },
  vaccinationTypes: {
    chart: "Vaccination Type Distribution (bar)",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered vaccination rows (package_name IN vaccination packages), grouped by package_name; count = COUNT(*). " +
      "Ordered by count desc.",
    sql: "GROUP BY s.package_name WHERE s.package_name IN (<vax>) → COUNT(*) ORDER BY 2 DESC.",
  },
  vaccinationsOverTime: {
    chart: "Vaccinations over time (area)",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered vaccination rows bucketed by the MONTH text column, ordered chronologically via to_date(MONTH,'Mon-YY'); " +
      "count = COUNT(*) per month.",
    sql: "GROUP BY s.\"MONTH\" WHERE s.package_name IN (<vax>) ORDER BY to_date(s.\"MONTH\",'Mon-YY') → COUNT(*).",
  },
  vaccinationStatus: {
    chart: "Completed vs Pending Vaccination (donut)",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered vaccination rows split by the completion flag: Completed = Completed__Logic = 'completed', " +
      "Pending/Overdue = everything else. Counts are COUNT(*).",
    sql: "SELECT COUNT(*) FILTER (WHERE isCompleted) AS completed, COUNT(*) FILTER (WHERE NOT isCompleted) AS pending FROM sodexo_Apt s WHERE s.package_name IN (<vax>) AND <filters>.",
  },
};

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    // Compliance dashboards are Sodexo-only — block other tenants from SOD001 data.
    const cugCode = await getSessionCugCode(searchParams.get("clientId") ?? undefined);
    if (cugCode !== "SOD001") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const filters = parseComplianceFilters(searchParams);
    const { where, params } = buildComplianceWhere(filters, 1, "s");

    // Vaccination / Additional-Test row predicates (categories from sodexo.ts).
    const VAX_ROW = `s.package_name IN (${VACCINATION_IN})`;
    const ADDL_ROW = `(${pkgCategory("s")}) = 'Additional Test'`;

    const failedQueries: string[] = [];
    async function safeQuery<T extends Record<string, unknown>>(
      fn: () => Promise<T[]>,
      tag: string,
    ): Promise<T[]> {
      try {
        return await fn();
      } catch (e) {
        console.error(`Vaccinations query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    const [
      kpiRows,
      diagnosticsRows,
      vaxTypeRows,
      overTimeRows,
      statusRows,
      filterOptions,
    ] = await Promise.all([
      // ── KPIs ── single pass over the filtered rows.
      safeQuery(
        () =>
          dwQuery<{ complete_vaccination: string; total_tests: string }>(
            `SELECT
               COUNT(*) FILTER (WHERE ${VAX_ROW})::bigint  AS complete_vaccination,
               COUNT(*) FILTER (WHERE ${ADDL_ROW})::bigint AS total_tests
             FROM ${SODEXO_TABLE} s
             WHERE ${where}`,
            params,
          ),
        "kpi",
      ),
      // ── Chart 1: Additional Diagnostics by Type (pie) ──
      safeQuery(
        () =>
          dwQuery<{ name: string; cnt: string }>(
            `SELECT s.package_name AS name, COUNT(*)::bigint AS cnt
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${ADDL_ROW}
             GROUP BY s.package_name
             ORDER BY cnt DESC`,
            params,
          ),
        "additionalDiagnostics",
      ),
      // ── Chart 2: Vaccination Type Distribution (bar) ──
      safeQuery(
        () =>
          dwQuery<{ name: string; cnt: string }>(
            `SELECT s.package_name AS name, COUNT(*)::bigint AS cnt
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${VAX_ROW}
             GROUP BY s.package_name
             ORDER BY cnt DESC`,
            params,
          ),
        "vaccinationTypes",
      ),
      // ── Chart 3: Vaccinations over time (area) ──
      safeQuery(
        () =>
          dwQuery<{ month: string; cnt: string }>(
            `SELECT s."MONTH" AS month, COUNT(*)::bigint AS cnt
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${VAX_ROW} AND s."MONTH" IS NOT NULL
             GROUP BY s."MONTH"
             ORDER BY ${MONTH_ORDER_SQL("s")}`,
            params,
          ),
        "vaccinationsOverTime",
      ),
      // ── Chart 4: Completed vs Pending Vaccination (donut) ──
      safeQuery(
        () =>
          dwQuery<{ completed: string; pending: string }>(
            `SELECT
               COUNT(*) FILTER (WHERE ${isCompleted("s")})::bigint     AS completed,
               COUNT(*) FILTER (WHERE NOT (${isCompleted("s")}))::bigint AS pending
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${VAX_ROW}`,
            params,
          ),
        "vaccinationStatus",
      ),
      // ── Filter dropdowns (unfiltered apart from tenant scope) ──
      complianceFilterOptions(
        dwQuery as unknown as <T = Record<string, unknown>>(
          sql: string,
          p?: unknown[],
        ) => Promise<T[]>,
      ).catch((e) => {
        console.error("Vaccinations filterOptions failed:", e);
        failedQueries.push("filterOptions");
        return {
          months: [],
          sites: [],
          packageTypes: ["Base Package", "Vaccination", "Additional Test"],
          genders: [],
          bookingStatuses: [],
        };
      }),
    ]);

    const completeVaccination = Number(kpiRows[0]?.complete_vaccination || 0);
    const totalTests = Number(kpiRows[0]?.total_tests || 0);

    const additionalDiagnostics = diagnosticsRows.map((r) => ({
      name: r.name || "Unknown",
      count: Number(r.cnt),
    }));

    const vaccinationTypes = vaxTypeRows.map((r) => ({
      name: r.name || "Unknown",
      count: Number(r.cnt),
    }));

    const vaccinationsOverTime = overTimeRows.map((r) => ({
      month: r.month,
      count: Number(r.cnt),
    }));

    const completedCount = Number(statusRows[0]?.completed || 0);
    const pendingCount = Number(statusRows[0]?.pending || 0);
    const vaccinationStatus = [
      { name: "Completed", count: completedCount },
      { name: "Pending / Overdue", count: pendingCount },
    ];

    return NextResponse.json({
      kpis: {
        completeVaccination,
        totalTests,
      },
      filterOptions,
      charts: {
        additionalDiagnostics,
        vaccinationTypes,
        vaccinationsOverTime,
        vaccinationStatus,
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
    console.error("Compliance Vaccinations API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "compliance/vaccinations" }),
  PROVENANCE,
);
