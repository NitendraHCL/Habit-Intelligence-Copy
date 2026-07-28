/**
 * Shared query helpers for the SOD001 (Sodexo) Compliance dashboards.
 *
 * Every Compliance page reads a single warehouse table,
 * aggregated_table."sodexo_Apt" (mixed-case, some quoted columns), scoped to
 * cug_code = 'SOD001'. This module centralises the table name, the verified
 * metric definitions (reconciled against the Power BI figures), the global
 * filter set, and the filter-option dropdowns so all four routes behave
 * identically.
 *
 * Verified metric reconciliation (against the client's Power BI report):
 *   Complete Healthcheck (11,547)  = rows where package_name = 'Sodexo Base Package'
 *   Total Employees (9,516)        = COUNT(DISTINCT employee_id) over base-package rows
 *   Total Employees in Site (11,955) = COUNT(DISTINCT employee_id) over all rows
 *   Complete vaccination (4,270)   = rows in VACCINATION_PACKAGES
 *   Unique Employees Vaccinated (3,795) = COUNT(DISTINCT employee_id) over those
 *   Overdue Healthcheck (9,090)    = base-package rows where NOT completed
 *   Completed                       = Completed__Logic = 'completed'
 */

// Table + tenant ──────────────────────────────────────────────────────────
export const SODEXO_TABLE = 'aggregated_table."sodexo_Apt"';
export const SODEXO_CUG = "SOD001";

// Package categorisation ──────────────────────────────────────────────────
export const BASE_PACKAGE = "Sodexo Base Package";
export const VACCINATION_PACKAGES = [
  "Additional Tests-Typhoid Vaccination",
  "Sodexo -Vaccination",
  "Additional Tests-Hepatitis B Vaccination",
  "Additional Tests-Tetanus Injection", // "Injection", not "Vaccination" — but counts as a vaccination
  "Additional Tests-Hepatitis A Vaccination",
];
const sqlList = (arr: string[]) => arr.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");

/** SQL literal set of vaccination package names, for `IN (...)`. */
export const VACCINATION_IN = sqlList(VACCINATION_PACKAGES);

/** Derived "Package Type" category expression for a given table alias. */
export function pkgCategory(alias = "s"): string {
  return `CASE
    WHEN ${alias}.package_name = '${BASE_PACKAGE}' THEN 'Base Package'
    WHEN ${alias}.package_name IN (${VACCINATION_IN}) THEN 'Vaccination'
    ELSE 'Additional Test' END`;
}

/** Completion flag (health-check completed) for a given alias. */
export const isCompleted = (alias = "s") =>
  `LOWER(COALESCE(${alias}."Completed__Logic", '')) = 'completed'`;

/** Parse a Due Date text column ('YYYY-MM-DD HH:MM:SS') to a real timestamp. */
export const dueDateTs = (alias = "s") =>
  `NULLIF(${alias}."Due Date", '')::timestamp`;

// Global filters ──────────────────────────────────────────────────────────
export interface ComplianceFilters {
  months?: string[];
  sites?: string[];
  packageTypes?: string[];
  genders?: string[];
  bookingStatuses?: string[];
  employeeIds?: string[];
}

export function parseComplianceFilters(sp: URLSearchParams): ComplianceFilters {
  const arr = (k: string) =>
    sp.get(k)?.split(",").map((s) => s.trim()).filter(Boolean);
  return {
    months: arr("months"),
    sites: arr("sites"),
    packageTypes: arr("packageTypes"),
    genders: arr("genders"),
    bookingStatuses: arr("bookingStatuses"),
    employeeIds: arr("employeeIds"),
  };
}

/**
 * Build a parameterised WHERE clause (always scoped to SOD001) for the given
 * filters. `startIdx` is the first $N placeholder to use; returns the clause,
 * the ordered params, and the next free index so callers can append more.
 */
export function buildComplianceWhere(
  f: ComplianceFilters,
  startIdx = 1,
  alias = "s",
): { where: string; params: unknown[]; nextIdx: number } {
  const conds: string[] = [`${alias}.cug_code = '${SODEXO_CUG}'`];
  const params: unknown[] = [];
  let i = startIdx;
  const add = (col: string, vals?: string[]) => {
    if (vals && vals.length) {
      conds.push(`${col} = ANY($${i})`);
      params.push(vals);
      i++;
    }
  };
  add(`${alias}."MONTH"`, f.months);
  add(`${alias}."DC_Name"`, f.sites);
  add(`${alias}.gender`, f.genders);
  add(`${alias}.status`, f.bookingStatuses);
  add(`${alias}.employee_id`, f.employeeIds);
  if (f.packageTypes && f.packageTypes.length) {
    conds.push(`(${pkgCategory(alias)}) = ANY($${i})`);
    params.push(f.packageTypes);
    i++;
  }
  return { where: conds.join(" AND "), params, nextIdx: i };
}

// Month ordering — the MONTH column is text like 'Apr-25'; sort chronologically.
export const MONTH_ORDER_SQL = (alias = "s") =>
  `to_date(${alias}."MONTH", 'Mon-YY')`;

/**
 * Standard filter-option dropdowns for the global bar. Returns distinct,
 * ordered values for Month, Site, Package Type, Gender and Booking Status.
 */
export async function complianceFilterOptions(
  dwQuery: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>,
): Promise<{
  months: string[];
  sites: string[];
  packageTypes: string[];
  genders: string[];
  bookingStatuses: string[];
}> {
  const scope = `s.cug_code = '${SODEXO_CUG}'`;
  const one = async (sql: string) => {
    const rows = await dwQuery<{ v: string }>(sql);
    return rows.map((r) => r.v).filter((v) => v != null && v !== "");
  };
  const [months, sites, genders, bookingStatuses] = await Promise.all([
    one(`SELECT DISTINCT s."MONTH" AS v FROM ${SODEXO_TABLE} s WHERE ${scope} AND s."MONTH" IS NOT NULL ORDER BY to_date(s."MONTH", 'Mon-YY')`),
    one(`SELECT DISTINCT s."DC_Name" AS v FROM ${SODEXO_TABLE} s WHERE ${scope} AND s."DC_Name" IS NOT NULL ORDER BY 1`),
    one(`SELECT DISTINCT s.gender AS v FROM ${SODEXO_TABLE} s WHERE ${scope} AND s.gender IS NOT NULL ORDER BY 1`),
    one(`SELECT DISTINCT s.status AS v FROM ${SODEXO_TABLE} s WHERE ${scope} AND s.status IS NOT NULL ORDER BY 1`),
  ]);
  return {
    months,
    sites,
    packageTypes: ["Base Package", "Vaccination", "Additional Test"],
    genders,
    bookingStatuses,
  };
}
