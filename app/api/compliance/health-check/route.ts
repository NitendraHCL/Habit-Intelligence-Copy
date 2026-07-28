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
  isCompleted,
  dueDateTs,
  parseComplianceFilters,
  buildComplianceWhere,
  complianceFilterOptions,
  MONTH_ORDER_SQL,
} from "@/lib/compliance/sodexo";

/* ────────────────────────────────────────────────────────────────────
 * SOD001 (Sodexo) — Health Check Compliance API.
 *
 * Single fact table: aggregated_table."sodexo_Apt" (alias `s`), scoped to
 * cug_code = 'SOD001'. All metric definitions, the global filter set, and the
 * dropdown options live in lib/compliance/sodexo.ts so every Compliance route
 * behaves identically. One row = one package appointment for an employee.
 *
 * Global filters (this page): Month, Site (DC_Name), Package Type, Gender,
 * Booking Status — parsed from months/sites/packageTypes/genders/bookingStatuses
 * query params by parseComplianceFilters and turned into a parameterised WHERE
 * by buildComplianceWhere. Every KPI and chart respects that WHERE.
 * ──────────────────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per chart/section, keyed identically
 * to the `charts` keys in the response below (plus `kpis`). Shipped only to
 * SUPER_ADMIN callers and rendered by <DataAuditSection>.
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Health-check + vaccination compliance)",
    sources: [SODEXO_TABLE],
    logic:
      "Over the filtered SOD001 rows. Total Employees = COUNT(DISTINCT employee_id) over base-package rows; " +
      "Complete Healthcheck = COUNT(*) of base-package rows; Overdue Healthcheck = base-package rows not completed; " +
      "Pending (30/45 days) = base-package, not completed, Due Date within the next 30/45 days; " +
      "Complete vaccination = COUNT(*) of vaccination-package rows; Unique Employees Vaccinated = " +
      "COUNT(DISTINCT employee_id) over those; Vaccinations Overdue = vaccination-package rows not completed.",
    sql:
      "SELECT COUNT(DISTINCT employee_id) FILTER (WHERE package_name = 'Sodexo Base Package'), " +
      "COUNT(*) FILTER (WHERE package_name = base), COUNT(*) FILTER (WHERE base AND NOT completed), … FROM sodexo_Apt WHERE <filters>.",
  },
  completedVsOverdue: {
    chart: "Completed vs Overdue (health check)",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered base-package rows split into Completed (Completed__Logic = 'completed') and Overdue (everything else). " +
      "Rendered as a donut.",
    sql: "SELECT COUNT(*) FILTER (completed) AS completed, COUNT(*) FILTER (NOT completed) AS overdue FROM sodexo_Apt WHERE base-package AND <filters>.",
  },
  monthlyTrend: {
    chart: "Monthly Trend — Health Check Completions",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered base-package rows that are completed, grouped by the MONTH text column and ordered chronologically " +
      "(to_date(MONTH,'Mon-YY')). Per month: completions = COUNT(*).",
    sql: "SELECT MONTH, COUNT(*) FROM sodexo_Apt WHERE base-package AND completed AND <filters> GROUP BY MONTH ORDER BY to_date(MONTH,'Mon-YY').",
  },
  completedVsPendingBySite: {
    chart: "Completed vs Pending by Site",
    sources: [SODEXO_TABLE],
    logic:
      "Filtered base-package rows grouped by DC_Name: completed = COUNT(*) FILTER (completed), overdue = " +
      "COUNT(*) FILTER (NOT completed). Top ~12 sites by total volume are shown; each split Completed vs Overdue.",
    sql: "SELECT DC_Name, COUNT(*) FILTER (completed), COUNT(*) FILTER (NOT completed) FROM sodexo_Apt WHERE base-package AND <filters> GROUP BY DC_Name ORDER BY total DESC.",
  },
};

const nf = (v: unknown) => Number(v || 0);

// complianceFilterOptions expects a `<T = ...>` dwQuery; adapt the constrained
// warehouse client (`<T extends Record<string, unknown>>`) to that signature.
const dwQueryLoose = <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
  dwQuery<T & Record<string, unknown>>(sql, p) as Promise<T[]>;

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }
    // Compliance dashboards are Sodexo-only — block other tenants from SOD001 data.
    if (cugCode !== "SOD001") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Global compliance filters → parameterised WHERE (always scoped to SOD001).
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
        console.error(`Health-check compliance query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // Reusable SQL fragments.
    const base = `s.package_name = '${BASE_PACKAGE.replace(/'/g, "''")}'`;
    const vacc = `s.package_name IN (${VACCINATION_IN})`;
    const completed = isCompleted("s");
    const due = dueDateTs("s");

    const [kpiRows, donutRows, trendRows, siteRows, filterOptions] = await Promise.all([
      // ── KPIs — single pass over the filtered rows. ──
      safeQuery(
        () =>
          dwQuery<{
            total_employees: string;
            complete_healthcheck: string;
            overdue_healthcheck: string;
            pending_30: string;
            pending_45: string;
            complete_vaccination: string;
            unique_vaccinated: string;
            vaccinations_overdue: string;
          }>(
            `SELECT
               COUNT(DISTINCT s.employee_id) FILTER (WHERE ${base})                                    AS total_employees,
               COUNT(*)                      FILTER (WHERE ${base})                                    AS complete_healthcheck,
               COUNT(*)                      FILTER (WHERE ${base} AND NOT ${completed})               AS overdue_healthcheck,
               COUNT(*)                      FILTER (WHERE ${base} AND NOT ${completed}
                                                        AND ${due} >= now()
                                                        AND ${due} <  now() + interval '30 days')      AS pending_30,
               COUNT(*)                      FILTER (WHERE ${base} AND NOT ${completed}
                                                        AND ${due} >= now()
                                                        AND ${due} <  now() + interval '45 days')      AS pending_45,
               COUNT(*)                      FILTER (WHERE ${vacc})                                    AS complete_vaccination,
               COUNT(DISTINCT s.employee_id) FILTER (WHERE ${vacc})                                    AS unique_vaccinated,
               COUNT(*)                      FILTER (WHERE ${vacc} AND NOT ${completed})               AS vaccinations_overdue
             FROM ${SODEXO_TABLE} s
             WHERE ${where}`,
            params,
          ),
        "kpis",
      ),
      // ── Chart 1: Completed vs Overdue (base package). ──
      safeQuery(
        () =>
          dwQuery<{ completed_cnt: string; overdue_cnt: string }>(
            `SELECT
               COUNT(*) FILTER (WHERE ${completed})     AS completed_cnt,
               COUNT(*) FILTER (WHERE NOT ${completed}) AS overdue_cnt
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${base}`,
            params,
          ),
        "completedVsOverdue",
      ),
      // ── Chart 2: Monthly trend of completed health checks. ──
      safeQuery(
        () =>
          dwQuery<{ month: string; completions: string }>(
            `SELECT s."MONTH" AS month, COUNT(*) AS completions
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${base} AND ${completed} AND s."MONTH" IS NOT NULL
             GROUP BY s."MONTH"
             ORDER BY ${MONTH_ORDER_SQL("s")}`,
            params,
          ),
        "monthlyTrend",
      ),
      // ── Chart 3: Completed vs Overdue by site (base package). ──
      safeQuery(
        () =>
          dwQuery<{ site: string; completed_cnt: string; overdue_cnt: string }>(
            `SELECT
               s."DC_Name" AS site,
               COUNT(*) FILTER (WHERE ${completed})     AS completed_cnt,
               COUNT(*) FILTER (WHERE NOT ${completed}) AS overdue_cnt
             FROM ${SODEXO_TABLE} s
             WHERE ${where} AND ${base} AND s."DC_Name" IS NOT NULL
             GROUP BY s."DC_Name"
             ORDER BY COUNT(*) DESC`,
            params,
          ),
        "completedVsPendingBySite",
      ),
      // ── Filter dropdown options (unfiltered apart from tenant scope). ──
      safeQuery(() => complianceFilterOptions(dwQueryLoose).then((o) => [o]), "filterOptions"),
    ]);

    const k = kpiRows[0] || ({} as Record<string, string>);
    const kpis = {
      totalEmployees: nf(k.total_employees),
      completeHealthcheck: nf(k.complete_healthcheck),
      overdueHealthcheck: nf(k.overdue_healthcheck),
      pending30: nf(k.pending_30),
      pending45: nf(k.pending_45),
      completeVaccination: nf(k.complete_vaccination),
      uniqueEmployeesVaccinated: nf(k.unique_vaccinated),
      vaccinationsOverdue: nf(k.vaccinations_overdue),
    };

    const donut = donutRows[0] || ({} as Record<string, string>);
    const completedVsOverdue = {
      completed: nf(donut.completed_cnt),
      overdue: nf(donut.overdue_cnt),
    };

    const monthlyTrend = trendRows.map((r) => ({
      month: r.month,
      completions: nf(r.completions),
    }));

    const completedVsPendingBySite = siteRows
      .map((r) => ({
        site: r.site,
        completed: nf(r.completed_cnt),
        overdue: nf(r.overdue_cnt),
        total: nf(r.completed_cnt) + nf(r.overdue_cnt),
      }))
      .slice(0, 12);

    return NextResponse.json({
      kpis,
      filterOptions: filterOptions[0] || {
        months: [],
        sites: [],
        packageTypes: [],
        genders: [],
        bookingStatuses: [],
      },
      charts: {
        completedVsOverdue,
        monthlyTrend,
        completedVsPendingBySite,
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
    console.error("Health Check Compliance API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "compliance/health-check" }),
  PROVENANCE,
);
