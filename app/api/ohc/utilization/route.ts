import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────
 * OHC Utilization API — powered by aggregated_table.agg_kpi
 *
 * Live agg_kpi schema:
 *   consult_date (timestamp), consult_hour (int), uhid (text),
 *   speciality_name (text), age (int), age_group (text),
 *   patient_gender (text), stage (text), facility_mapping (text),
 *   cug_code_mapped (text), relationship (text),
 *   total_consult_count (bigint), unique_consult_count (int),
 *   unique_patient_per_day (int), unique_patient_per_month (int),
 *   repeat_patient_count (int)
 *
 * Unique-patient math uses COUNT(DISTINCT uhid) over filtered Completed rows.
 * Repeat-patient math uses uhids_with_2plus_visits (≥2 completed rows).
 *
 * Category Radar / Service Category Metrics come from aggregated_table.agg_service_kpi.
 * Columns: g_creation_time, "serviceType", booked_count, completed_count,
 * cug_code_mapped, age_group, patient_gender, relationship, status.
 * ──────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_kpi";
const COMPLETED = "a.stage = 'Completed'";

function yoyChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function normGender(g: string | null | undefined): "M" | "F" | "O" {
  if (!g) return "O";
  const l = g.trim().toLowerCase();
  if (l === "male" || l === "m") return "M";
  if (l === "female" || l === "f") return "F";
  return "O";
}

function buildQueryParts(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);
  const relations = searchParams.get("relations")?.split(",").filter(Boolean);

  const conditions: string[] = [`a.cug_code_mapped = $1`, COMPLETED];
  const prevConditions: string[] = [`a.cug_code_mapped = $1`, COMPLETED];
  // "all-stage" variant for visit trends (includes Cancelled / No Show / Pending)
  const allStageConditions: string[] = [`a.cug_code_mapped = $1`];
  const allStagePrevConditions: string[] = [`a.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;
  const hasDateRange = !!(dateFrom && dateTo);

  if (dateFrom) {
    conditions.push(`a.consult_date >= $${idx}::timestamp`);
    prevConditions.push(`a.consult_date >= ($${idx}::date - interval '1 year')::timestamp`);
    allStageConditions.push(`a.consult_date >= $${idx}::timestamp`);
    allStagePrevConditions.push(`a.consult_date >= ($${idx}::date - interval '1 year')::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`a.consult_date <= ($${idx}::date + interval '1 day')::timestamp`);
    prevConditions.push(`a.consult_date <= (($${idx}::date - interval '1 year') + interval '1 day')::timestamp`);
    allStageConditions.push(`a.consult_date <= ($${idx}::date + interval '1 day')::timestamp`);
    allStagePrevConditions.push(`a.consult_date <= (($${idx}::date - interval '1 year') + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    const cond = `a.facility_mapping = ANY($${idx})`;
    conditions.push(cond); prevConditions.push(cond);
    allStageConditions.push(cond); allStagePrevConditions.push(cond);
    params.push(locations);
    idx++;
  }
  if (specialties?.length) {
    const cond = `a.speciality_name = ANY($${idx})`;
    conditions.push(cond); prevConditions.push(cond);
    allStageConditions.push(cond); allStagePrevConditions.push(cond);
    params.push(specialties);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(a.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(a.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(a.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR a.patient_gender IS NULL OR TRIM(a.patient_gender) = '')";
    });
    const cond = `(${gc.join(" OR ")})`;
    conditions.push(cond); prevConditions.push(cond);
    allStageConditions.push(cond); allStagePrevConditions.push(cond);
  }
  if (ageGroups?.length) {
    const cond = `a.age_group = ANY($${idx})`;
    conditions.push(cond); prevConditions.push(cond);
    allStageConditions.push(cond); allStagePrevConditions.push(cond);
    params.push(ageGroups);
    idx++;
  }
  if (relations?.length) {
    const cond = `a.relationship = ANY($${idx})`;
    conditions.push(cond); prevConditions.push(cond);
    allStageConditions.push(cond); allStagePrevConditions.push(cond);
    params.push(relations);
    idx++;
  }

  return {
    params,
    hasDateRange,
    currentWhere: conditions.join(" AND "),
    prevWhere: prevConditions.join(" AND "),
    allStageWhere: allStageConditions.join(" AND "),
  };
}

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const q = buildQueryParts(searchParams, cugCode);

    // If the selected range is ≤ 31 days, trend & repeat series bucket by day
    // (YYYY-MM-DD) instead of by month (YYYY-MM). Same response shape otherwise.
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    let trendBucket: "day" | "month" = "month";
    if (dateFromParam && dateToParam) {
      const days = Math.round((Date.parse(dateToParam) - Date.parse(dateFromParam)) / 86400000) + 1;
      if (days > 0 && days <= 31) trendBucket = "day";
    }
    const periodFormat = trendBucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";

    async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
      try { return await fn(); } catch (e) { console.error("Query failed:", e); return []; }
    }

    // ── FILTER OPTIONS (unfiltered, completed only) ──
    const baseWhere = `a.cug_code_mapped = $1 AND ${COMPLETED}`;
    const filterPromise = Promise.all([
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.facility_mapping AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.facility_mapping IS NOT NULL ORDER BY 1`, [cugCode])),
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.speciality_name AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.speciality_name IS NOT NULL AND a.speciality_name <> '' ORDER BY 1`, [cugCode])),
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.patient_gender AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.patient_gender IS NOT NULL ORDER BY 1`, [cugCode])),
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.relationship AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.relationship IS NOT NULL ORDER BY 1`, [cugCode])),
    ]);

    // ── BATCH 1: KPIs ──
    // unique_patients = COUNT(DISTINCT uhid) over Completed rows
    // repeat_patients = uhids with ≥2 completed rows in the filtered range
    const kpiPromise = safeQuery(() => dwQuery<{
      total_consults: string; unique_patients: string; repeat_patients: string; location_count: string;
    }>(
      `WITH per_uhid AS (
        SELECT a.uhid, COUNT(*) AS row_count, SUM(a.total_consult_count) AS consult_count
        FROM ${BASE_TABLE} a
        WHERE ${q.currentWhere}
        GROUP BY a.uhid
      )
      SELECT
        COALESCE((SELECT SUM(consult_count) FROM per_uhid), 0)::bigint AS total_consults,
        (SELECT COUNT(*) FROM per_uhid)::bigint AS unique_patients,
        (SELECT COUNT(*) FROM per_uhid WHERE row_count >= 2)::bigint AS repeat_patients,
        (SELECT COUNT(DISTINCT a.facility_mapping) FROM ${BASE_TABLE} a WHERE ${q.currentWhere})::bigint AS location_count`,
      q.params
    ));

    // ── BATCH 2: Specialty treemap + Location × Specialty ──
    const specPromise = safeQuery(() => dwQuery<{ name: string; value: string }>(
      `SELECT a.speciality_name AS name, COALESCE(SUM(a.total_consult_count), 0)::bigint AS value
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere} AND a.speciality_name IS NOT NULL AND a.speciality_name <> ''
      GROUP BY a.speciality_name ORDER BY value DESC`,
      q.params
    ));

    const locSpecPromise = safeQuery(() => dwQuery<{ location: string; specialty: string; total_consults: string }>(
      `SELECT a.facility_mapping AS location, a.speciality_name AS specialty,
       COALESCE(SUM(a.total_consult_count), 0)::bigint AS total_consults
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere} AND a.facility_mapping IS NOT NULL AND a.speciality_name IS NOT NULL AND a.speciality_name <> ''
      GROUP BY a.facility_mapping, a.speciality_name ORDER BY total_consults DESC`,
      q.params
    ));

    // ── BATCH 3: Demographics + Peak hours + Visit Trends ──
    const demoPromise = safeQuery(() => dwQuery<{ age_group: string; gender: string; total_consults: string; unique_pats: string }>(
      `SELECT
        a.age_group,
        a.patient_gender AS gender,
        COALESCE(SUM(a.total_consult_count), 0)::bigint AS total_consults,
        COUNT(DISTINCT a.uhid)::bigint AS unique_pats
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere} AND a.age_group IS NOT NULL
      GROUP BY a.age_group, a.patient_gender`,
      q.params
    ));

    // Peak hours heatmap — consult_hour is back on agg_kpi, so we can compute
    // day-of-week × hour buckets directly. DOW: Sun=0 … Sat=6 to match dowToChart.
    const peakPromise = safeQuery(() => dwQuery<{ day_of_week: string; hour_of_day: string; total_consults: string }>(
      `SELECT
        EXTRACT(DOW FROM a.consult_date)::int AS day_of_week,
        a.consult_hour AS hour_of_day,
        COALESCE(SUM(a.total_consult_count), 0)::bigint AS total_consults
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere} AND a.consult_hour IS NOT NULL
      GROUP BY day_of_week, hour_of_day`,
      q.params
    ));

    // Visit trends: period × stage. For unique_pats we only populate for the
    // Completed group (COUNT(DISTINCT uhid)); other stages report 0 and the
    // client aggregator only adds unique_pats from Completed rows anyway.
    const trendPromise = safeQuery(() => dwQuery<{
      period: string; stage: string; consults: string; unique_pats: string;
    }>(
      `SELECT
        to_char(a.consult_date, '${periodFormat}') AS period,
        a.stage AS stage,
        CASE WHEN a.stage = 'Completed'
          THEN COALESCE(SUM(a.total_consult_count), 0)::bigint
          ELSE COUNT(*)::bigint
        END AS consults,
        CASE WHEN a.stage = 'Completed'
          THEN COUNT(DISTINCT a.uhid)::bigint
          ELSE 0::bigint
        END AS unique_pats
      FROM ${BASE_TABLE} a
      WHERE ${q.allStageWhere}
      GROUP BY period, a.stage
      ORDER BY period`,
      q.params
    ));

    // ── BATCH 4: Repeat trends ──
    // per_period_uhid aggregates Completed rows to one row per (period, uhid)
    // repeat_visits = SUM(consult_count) − COUNT(*)  (true_repeat_visits)
    // repeat_patients = uhids with ≥2 completed rows within the period
    const repeatPromise = safeQuery(() => dwQuery<{
      period: string; repeat_visits: string; repeat_patients: string;
    }>(
      `WITH per_period_uhid AS (
        SELECT
          to_char(a.consult_date, '${periodFormat}') AS period,
          a.uhid,
          COUNT(*) AS row_count,
          SUM(a.total_consult_count) AS consult_count
        FROM ${BASE_TABLE} a
        WHERE ${q.currentWhere}
        GROUP BY period, a.uhid
      )
      SELECT
        period,
        (COALESCE(SUM(consult_count), 0) - COUNT(*))::bigint AS repeat_visits,
        (COUNT(*) FILTER (WHERE row_count >= 2))::bigint AS repeat_patients
      FROM per_period_uhid
      GROUP BY period
      ORDER BY period`,
      q.params
    ));

    // ── Bubble chart: specialty × location × ageGroup × gender ──
    const bubblePromise = safeQuery(() => dwQuery<{
      specialty: string; location: string; age_group: string; gender: string; total: string;
    }>(
      `SELECT a.speciality_name AS specialty, a.facility_mapping AS location, a.age_group,
       a.patient_gender AS gender, COALESCE(SUM(a.total_consult_count), 0)::bigint AS total
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere} AND a.speciality_name IS NOT NULL AND a.speciality_name <> ''
        AND a.facility_mapping IS NOT NULL AND a.age_group IS NOT NULL
      GROUP BY a.speciality_name, a.facility_mapping, a.age_group, a.patient_gender`,
      q.params
    ));

    // ── Service Categories (from agg_service_kpi) ──
    const svcParams: unknown[] = [cugCode];
    let svcWhere = `a.cug_code_mapped = $1`;
    let svcIdx = 2;
    const svcDateFrom = searchParams.get("dateFrom");
    const svcDateTo = searchParams.get("dateTo");
    const svcAgeGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
    const svcGenders = searchParams.get("genders")?.split(",").filter(Boolean);
    const svcRelations = searchParams.get("relations")?.split(",").filter(Boolean);
    if (svcDateFrom) {
      svcWhere += ` AND a.g_creation_time >= $${svcIdx}::timestamp`;
      svcParams.push(svcDateFrom); svcIdx++;
    }
    if (svcDateTo) {
      svcWhere += ` AND a.g_creation_time <= $${svcIdx}::timestamp`;
      svcParams.push(svcDateTo + "T23:59:59"); svcIdx++;
    }
    if (svcAgeGroups?.length) {
      svcWhere += ` AND a.age_group = ANY($${svcIdx})`;
      svcParams.push(svcAgeGroups); svcIdx++;
    }
    if (svcGenders?.length) {
      const gc = svcGenders.map((g) => {
        const l = g.toLowerCase();
        if (l === "male") return "LOWER(TRIM(a.patient_gender)) IN ('male', 'm')";
        if (l === "female") return "LOWER(TRIM(a.patient_gender)) IN ('female', 'f')";
        return "(LOWER(TRIM(a.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR a.patient_gender IS NULL OR TRIM(a.patient_gender) = '')";
      });
      svcWhere += ` AND (${gc.join(" OR ")})`;
    }
    if (svcRelations?.length) {
      svcWhere += ` AND a.relationship = ANY($${svcIdx})`;
      svcParams.push(svcRelations); svcIdx++;
    }
    const svcPromise = safeQuery(() => dwQuery<{ category: string; booked: string; completed: string }>(
      `SELECT a."serviceType" AS category,
              COALESCE(SUM(a.booked_count), 0)::bigint AS booked,
              COALESCE(SUM(a.completed_count), 0)::bigint AS completed
       FROM aggregated_table.agg_service_kpi a
       WHERE ${svcWhere} AND a."serviceType" IS NOT NULL
       GROUP BY a."serviceType" ORDER BY booked DESC`, svcParams,
      { statementTimeoutMs: 60000 }
    ));

    // ── Execute all in parallel ──
    const [
      [filterLocations, filterSpecialties, filterGenders, filterRelations],
      kpiRows, specRows, locSpecRows, demoRows, peakRows, trendRows, repeatRows, bubbleRows, svcRows,
    ] = await Promise.all([
      filterPromise, kpiPromise, specPromise, locSpecPromise,
      demoPromise, peakPromise, trendPromise, repeatPromise, bubblePromise, svcPromise,
    ]);

    // ── Filter options ──
    const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];
    const filterOptions = {
      locations: filterLocations.map((r) => r.v),
      specialties: filterSpecialties.map((r) => r.v),
      genders: [...new Set(filterGenders.map((r) => { const n = normGender(r.v); return n === "M" ? "Male" : n === "F" ? "Female" : "Other"; }))],
      ageGroups: AGE_ORDER,
      relations: filterRelations.map((r) => r.v),
    };

    // ── KPIs ──
    const kpi = kpiRows[0];
    const totalConsults = Number(kpi?.total_consults || 0);
    const uniquePatients = Number(kpi?.unique_patients || 0);
    const repeatPatients = Number(kpi?.repeat_patients || 0);
    const locationCount = Number(kpi?.location_count || 0);
    const repeatRate = uniquePatients > 0 ? Math.round((repeatPatients / uniquePatients) * 100) : 0;

    // ── YoY with fallback to period-over-period (PoP) ──
    // Primary: compare to the same window one year ago (YoY).
    // If prior-period history is too thin (< threshold consults — usually a
    // recently-onboarded client), fall back to the immediately preceding
    // window of equal length (PoP). If even PoP is thin, surface a
    // "New this year" pill via hasInsufficientHistory.
    const YOY_MIN_PRIOR_CONSULTS = 50;
    let yoyConsults: number | null = null;
    let yoyUnique: number | null = null;
    let yoyRepeat: number | null = null;
    let yoyBasis: "yoy" | "pop" | null = null;
    let yoyLabel: string | null = null;
    let hasInsufficientHistory = false;

    if (q.hasDateRange) {
      const yoyPrev = await safeQuery(() => dwQuery<{
        total_consults: string; unique_patients: string; repeat_patients: string;
      }>(
        `WITH per_uhid AS (
          SELECT a.uhid, COUNT(*) AS row_count, SUM(a.total_consult_count) AS consult_count
          FROM ${BASE_TABLE} a WHERE ${q.prevWhere}
          GROUP BY a.uhid
        )
        SELECT
          COALESCE((SELECT SUM(consult_count) FROM per_uhid), 0)::bigint AS total_consults,
          (SELECT COUNT(*) FROM per_uhid)::bigint AS unique_patients,
          (SELECT COUNT(*) FROM per_uhid WHERE row_count >= 2)::bigint AS repeat_patients`,
        q.params
      ));
      const yoyPrevConsults = Number(yoyPrev[0]?.total_consults || 0);

      if (yoyPrevConsults >= YOY_MIN_PRIOR_CONSULTS) {
        yoyBasis = "yoy";
        yoyLabel = "vs Last Year";
        yoyConsults = yoyChange(totalConsults, yoyPrevConsults);
        yoyUnique = yoyChange(uniquePatients, Number(yoyPrev[0]!.unique_patients || 0));
        yoyRepeat = yoyChange(repeatPatients, Number(yoyPrev[0]!.repeat_patients || 0));
      } else {
        // Try PoP: preceding equal-length window
        const dateFromStr = searchParams.get("dateFrom")!;
        const dateToStr = searchParams.get("dateTo")!;
        const MS = 86400000;
        const fromMs = Date.parse(dateFromStr);
        const toMs = Date.parse(dateToStr);
        const durationMs = toMs - fromMs;
        const popToMs = fromMs - MS;
        const popFromMs = popToMs - durationMs;
        const popFromStr = new Date(popFromMs).toISOString().slice(0, 10);
        const popToStr = new Date(popToMs).toISOString().slice(0, 10);

        // Reuse currentWhere (no year offset) with substituted date params.
        // q.params positional order: [cugCode, dateFrom, dateTo, ...otherFilters]
        const popParams = [...q.params];
        popParams[1] = popFromStr;
        popParams[2] = popToStr;

        const popPrev = await safeQuery(() => dwQuery<{
          total_consults: string; unique_patients: string; repeat_patients: string;
        }>(
          `WITH per_uhid AS (
            SELECT a.uhid, COUNT(*) AS row_count, SUM(a.total_consult_count) AS consult_count
            FROM ${BASE_TABLE} a WHERE ${q.currentWhere}
            GROUP BY a.uhid
          )
          SELECT
            COALESCE((SELECT SUM(consult_count) FROM per_uhid), 0)::bigint AS total_consults,
            (SELECT COUNT(*) FROM per_uhid)::bigint AS unique_patients,
            (SELECT COUNT(*) FROM per_uhid WHERE row_count >= 2)::bigint AS repeat_patients`,
          popParams
        ));
        const popPrevConsults = Number(popPrev[0]?.total_consults || 0);

        if (popPrevConsults >= YOY_MIN_PRIOR_CONSULTS) {
          yoyBasis = "pop";
          const days = Math.round(durationMs / MS) + 1;
          const humanRange = days <= 45
            ? `${days} days`
            : days <= 60
              ? "1 month"
              : `${(days / 30).toFixed(days < 120 ? 1 : 0)} months`;
          yoyLabel = `vs previous ${humanRange}`;
          yoyConsults = yoyChange(totalConsults, popPrevConsults);
          yoyUnique = yoyChange(uniquePatients, Number(popPrev[0]!.unique_patients || 0));
          yoyRepeat = yoyChange(repeatPatients, Number(popPrev[0]!.repeat_patients || 0));
        } else {
          hasInsufficientHistory = true;
        }
      }
    }

    // ── Visit trends (pivot by stage) ──
    const trendMap: Record<string, { completed: number; cancelled: number; noShow: number; uniquePatients: number }> = {};
    for (const row of trendRows) {
      if (!trendMap[row.period]) {
        trendMap[row.period] = { completed: 0, cancelled: 0, noShow: 0, uniquePatients: 0 };
      }
      const c = Number(row.consults);
      const u = Number(row.unique_pats);
      switch (row.stage) {
        case "Completed":
          trendMap[row.period].completed += c;
          trendMap[row.period].uniquePatients += u;
          break;
        case "Cancelled":
          trendMap[row.period].cancelled += c;
          break;
        case "No Show":
          trendMap[row.period].noShow += c;
          break;
      }
    }
    const visitTrends = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, ...v }));
    const avgConsults = visitTrends.length > 0
      ? Math.round(visitTrends.reduce((s, v) => s + v.completed, 0) / visitTrends.length)
      : 0;

    // ── Repeat trends ──
    const repeatTrends = repeatRows.map((r) => ({
      label: r.period,
      repeatVisits: Number(r.repeat_visits),
      repeatPatients: Number(r.repeat_patients),
    }));

    // ── Specialty treemap ──
    const specialtyTreemap = specRows.map((r) => ({ name: r.name, value: Number(r.value) }));

    // ── Location × Specialty ──
    const specTotals: Record<string, number> = {};
    for (const row of locSpecRows) specTotals[row.specialty] = (specTotals[row.specialty] || 0) + Number(row.total_consults);
    const topSpecialties = Object.entries(specTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
    const locationMap: Record<string, Record<string, number>> = {};
    for (const row of locSpecRows) {
      if (!locationMap[row.location]) locationMap[row.location] = {};
      if (topSpecialties.includes(row.specialty)) locationMap[row.location][row.specialty] = Number(row.total_consults);
    }
    const sumSpecs = (obj: Record<string, unknown>) =>
      Object.entries(obj).filter(([k]) => k !== "location").reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
    const allLocationsSorted = Object.entries(locationMap)
      .map(([location, specs]) => ({ location, ...specs }))
      .sort((a, b) => sumSpecs(b) - sumSpecs(a));
    const TOP_N = 15;
    const topLocations = allLocationsSorted.slice(0, TOP_N);
    const restLocations = allLocationsSorted.slice(TOP_N);
    const othersEntry: Record<string, unknown> = { location: "Others" };
    const othersBreakdown: { location: string; total: number }[] = [];
    for (const loc of restLocations) {
      const locTotal = sumSpecs(loc);
      if (locTotal > 0) othersBreakdown.push({ location: loc.location as string, total: locTotal });
      for (const spec of topSpecialties) {
        othersEntry[spec] = ((othersEntry[spec] as number) || 0) + ((loc as any)[spec] || 0);
      }
    }
    othersBreakdown.sort((a, b) => b.total - a.total);
    const locationBySpecialty = restLocations.length > 0
      ? [...topLocations, othersEntry as any]
      : topLocations;

    // ── Peak hours ──
    const dowToChart: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const peakHoursData: [number, number, number][] = [];
    let peakMax = 0; let peakCell = { day: 0, hour: 0, count: 0 };
    for (const row of peakRows) {
      const hour = Number(row.hour_of_day);
      if (hour < 6 || hour > 22) continue;
      const dayIdx = dowToChart[Number(row.day_of_week)];
      if (dayIdx === undefined) continue;
      const hourIdx = hour - 6;
      const count = Number(row.total_consults);
      peakHoursData.push([hourIdx, dayIdx, count]);
      if (count > peakMax) { peakMax = count; peakCell = { day: dayIdx, hour: hourIdx, count }; }
    }
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const HOUR_NAMES = ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"];

    // ── Demographics (age_group comes pre-bucketed from warehouse) ──
    const SUNBURST_COLORS: Record<string, string> = { "<20": "#818cf8", "20-35": "#0d9488", "36-40": "#d4d4d8", "41-60": "#a78bfa", "61+": "#6366f1" };
    const GENDER_COLORS: Record<string, string> = { M: "#0d9488", F: "#a78bfa", O: "#a1a1aa" };
    const ageMap: Record<string, Record<string, { consults: number; patients: number }>> = {};
    for (const row of demoRows) {
      const ag = row.age_group;
      const g = normGender(row.gender);
      if (!ageMap[ag]) ageMap[ag] = {};
      ageMap[ag][g] = {
        consults: (ageMap[ag][g]?.consults ?? 0) + Number(row.total_consults),
        patients: (ageMap[ag][g]?.patients ?? 0) + Number(row.unique_pats),
      };
    }
    const demographicSunburst = AGE_ORDER.filter((ag) => ageMap[ag]).map((ag) => ({
      name: ag, itemStyle: { color: SUNBURST_COLORS[ag] || "#888" },
      children: (["M", "F", "O"] as const)
        .filter((g) => ageMap[ag]?.[g] && ageMap[ag][g].consults > 0)
        .map((g) => ({ name: g, value: ageMap[ag][g].consults, itemStyle: { color: GENDER_COLORS[g] } })),
    }));
    const genderTotals: Record<string, number> = {};
    const ageGroupTotals: Record<string, number> = {};
    let highestCohort = { ageGroup: "", gender: "", count: 0, patients: 0 };
    for (const row of demoRows) {
      const ag = row.age_group;
      const g = normGender(row.gender);
      const c = Number(row.total_consults); const p = Number(row.unique_pats);
      genderTotals[g] = (genderTotals[g] || 0) + c;
      ageGroupTotals[ag] = (ageGroupTotals[ag] || 0) + c;
      if (c > highestCohort.count) {
        highestCohort = { ageGroup: ag, gender: g === "M" ? "Male" : g === "F" ? "Female" : "Others", count: c, patients: p };
      }
    }
    const topGenderEntry = Object.entries(genderTotals).sort((a, b) => b[1] - a[1])[0];
    const topAgeEntry = Object.entries(ageGroupTotals).sort((a, b) => b[1] - a[1])[0];
    const gl = (g: string) => g === "M" ? "Male" : g === "F" ? "Female" : "Others";

    // ── Service categories ──
    const serviceCategories = svcRows.map((r) => {
      const booked = Number(r.booked);
      const completed = Number(r.completed);
      return { category: r.category, booked, completed, completionRate: booked > 0 ? Math.round((completed / booked) * 100) : 0 };
    });

    // ── Bubble chart: group by specialty → location × ageGroup with gender split ──
    const bubbleMap: Record<string, Record<string, { male: number; female: number }>> = {};
    const bubbleSpecTotals: Record<string, number> = {};
    for (const row of bubbleRows) {
      const key = `${row.location}||${row.age_group}`;
      if (!bubbleMap[row.specialty]) bubbleMap[row.specialty] = {};
      if (!bubbleMap[row.specialty][key]) bubbleMap[row.specialty][key] = { male: 0, female: 0 };
      const g = normGender(row.gender);
      const count = Number(row.total);
      if (g === "M") bubbleMap[row.specialty][key].male += count;
      else bubbleMap[row.specialty][key].female += count;
      bubbleSpecTotals[row.specialty] = (bubbleSpecTotals[row.specialty] || 0) + count;
    }
    const bubbleSpecialties = Object.entries(bubbleSpecTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([s]) => s);
    const bubbleBySpecialty: Record<string, { location: string; ageGroup: string; total: number; male: number; female: number; malePercent: number }[]> = {};
    for (const spec of bubbleSpecialties) {
      bubbleBySpecialty[spec] = Object.entries(bubbleMap[spec] || {}).map(([key, v]) => {
        const [location, ageGroup] = key.split("||");
        const total = v.male + v.female;
        return { location, ageGroup, total, male: v.male, female: v.female, malePercent: total > 0 ? Math.round((v.male / total) * 100) : 0 };
      }).sort((a, b) => b.total - a.total);
    }

    return NextResponse.json({
      filterOptions,
      kpis: { totalConsults, uniquePatients, repeatPatients, locationCount, repeatRate, yoyConsults, yoyUnique, yoyRepeat, yoyBasis, yoyLabel, hasInsufficientHistory },
      charts: {
        demographicSunburst,
        demographicStats: {
          totalConsults, uniquePatients,
          highestCohort: highestCohort.count > 0 ? highestCohort : null,
          topGender: topGenderEntry ? { gender: gl(topGenderEntry[0]), count: topGenderEntry[1] } : null,
          topAgeGroup: topAgeEntry ? { ageGroup: topAgeEntry[0], count: topAgeEntry[1] } : null,
        },
        locationBySpecialty, topSpecialties, othersBreakdown,
        visitTrends, avgConsults,
        specialtyTreemap,
        peakHours: { data: peakHoursData, max: peakMax, peakDay: DAY_NAMES[peakCell.day] || "", peakHour: HOUR_NAMES[peakCell.hour] || "", peakCount: peakCell.count },
        serviceCategories, bubbleBySpecialty, bubbleSpecialties,
        repeatTrends,
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC Utilization API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/utilization" });
