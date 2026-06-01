import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

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
 * Category Radar / Service Category Metrics come from aggregated_table.result_entry
 * (one row per ordered service). Booked = COUNT(*); Completed = COUNT(*) FILTER
 * (WHERE status = 'Completed'). Filtered to service_type IN ('Pathology',
 * 'Radiology', 'Cardiology').
 *
 * Columns used: creation_date (timestamp), cug_code_mapped, gender,
 * relationship, age (text — parse leading "N Y" for age-group filter),
 * service_type, status.
 * ──────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_kpi";
const RESULT_TABLE = "aggregated_table.result_entry";
const CAPACITY_TABLE = "aggregated_table.doctor_capacity";
const COMPLETED = "a.stage = 'Completed'";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per chart/section, keyed identically
 * to the keys in the response below (plus `kpis`). Shipped only to
 * SUPER_ADMIN callers and rendered by <DataAuditSection> at the bottom of
 * the page. Edit an entry whenever you change the query that feeds the
 * matching chart so the audit panel stays truthful.
 *
 * Two source tables:
 *   • aggregated_table.agg_kpi      — consult-level KPI rows. Almost every
 *     chart filters to stage = 'Completed' (visit trends include all
 *     stages). Consult volume = SUM(total_consult_count); patients =
 *     COUNT(DISTINCT uhid).
 *   • aggregated_table.result_entry — one row per ordered service test.
 *     Feeds the Service Category charts only, restricted to service_type
 *     IN ('Pathology','Radiology','Cardiology').
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Total Consults · Unique Patients · Repeat Patients · Locations · Repeat Rate · YoY/PoP)",
    sources: [BASE_TABLE],
    logic:
      "From Completed agg_kpi rows in the filter window, aggregated to one row per uhid: " +
      "Total Consults = SUM(total_consult_count); Unique Patients = COUNT(uhid); " +
      "Repeat Patients = COUNT(uhid with ≥2 source rows); Locations = COUNT(DISTINCT facility_mapping); " +
      "Repeat Rate = repeatPatients / uniquePatients. YoY compares the same window one year earlier; " +
      "if prior-year consults < 50 it falls back to the immediately preceding equal-length window (PoP), " +
      "else flags insufficient history.",
    sql: "WITH per_uhid AS (… GROUP BY a.uhid) SELECT SUM(consult_count), COUNT(*), COUNT(*) FILTER (WHERE row_count >= 2).",
  },
  demographicSunburst: {
    chart: "Demographics Sunburst (Age Group → Gender)",
    sources: [BASE_TABLE],
    logic:
      "Completed agg_kpi rows grouped by age_group × patient_gender (age_group pre-banded in the warehouse). " +
      "Inner ring = age group, outer ring = normalised gender (Male/Female/Others); ring value = SUM(total_consult_count). " +
      "Age groups ordered <20 / 20-35 / 36-40 / 41-60 / 61+.",
    sql: "GROUP BY a.age_group, a.patient_gender → SUM(total_consult_count) per (age, gender).",
  },
  demographicStats: {
    chart: "Demographics Summary (Top Gender · Top Age Group · Highest Cohort)",
    sources: [BASE_TABLE],
    logic:
      "Derived in JS from the same age_group × gender aggregation as the sunburst: topGender / topAgeGroup are the " +
      "buckets with the largest SUM(total_consult_count); highestCohort is the single (age group × gender) cell with " +
      "the most consults, carrying its unique-patient count.",
    sql: "argmax over SUM(total_consult_count) per gender / per age_group / per (age×gender).",
  },
  locationBySpecialty: {
    chart: "Consult Distribution by Specialty & Location (stacked bar)",
    sources: [BASE_TABLE],
    logic:
      "All Completed agg_kpi rows grouped by facility_mapping × speciality_name (NULL facility → 'Unknown'). " +
      "Top 6 specialities by total consults become stack segments; remaining/unlabeled fall into 'Other'. " +
      "Top 15 locations kept; the rest rolled into an 'Others' row. Companion keys topSpecialties / othersBreakdown / " +
      "otherSpecialtyBreakdown carry the stack keys and the rolled-up tails.",
    sql: "GROUP BY facility_mapping, speciality_name → SUM(total_consult_count); top-6 specialties, top-15 locations in JS.",
  },
  visitTrends: {
    chart: "Visit Trends over time (Completed · Cancelled · No Show, with unique patients)",
    sources: [BASE_TABLE],
    logic:
      "agg_kpi rows across ALL stages (not just Completed), bucketed by period (day if range ≤31 days, else month) × stage. " +
      "Completed → consults = SUM(total_consult_count) and uniquePatients = COUNT(DISTINCT uhid); other stages → consults = " +
      "COUNT(*) and uniquePatients = 0. avgConsults = mean of completed per period.",
    sql: "GROUP BY to_char(consult_date, period), a.stage; CASE on stage for consults vs row count.",
  },
  specialtyTreemap: {
    chart: "Specialty Treemap",
    sources: [BASE_TABLE],
    logic:
      "Completed agg_kpi rows with a non-empty speciality_name, grouped by speciality_name. value = SUM(total_consult_count), " +
      "ordered descending.",
    sql: "GROUP BY a.speciality_name → SUM(total_consult_count) ORDER BY value DESC.",
  },
  peakHours: {
    chart: "Peak Consultation Hours heatmap (weekday × hour)",
    sources: [BASE_TABLE],
    logic:
      "Completed agg_kpi rows grouped by EXTRACT(DOW FROM consult_date) × consult_hour, value = SUM(total_consult_count). " +
      "Rendered for hours 6 AM–10 PM only; peakDay/peakHour/peakCount mark the busiest cell.",
    sql: "GROUP BY EXTRACT(DOW FROM a.consult_date), a.consult_hour → SUM(total_consult_count).",
  },
  serviceCategories: {
    chart: "Service Categories (Booked vs Completed · Completion Rate)",
    sources: [RESULT_TABLE],
    logic:
      "result_entry rows (one per ordered service test) restricted to service_type IN ('Pathology','Radiology','Cardiology'), " +
      "grouped by service_type. Booked = COUNT(*); Completed = COUNT(*) FILTER (WHERE status = 'Completed'); " +
      "Completion Rate = Completed / Booked. Filters applied on creation_date, gender, age (parsed from leading 'N Y'), relationship.",
    sql: "GROUP BY a.service_type → COUNT(*) booked, COUNT(*) FILTER (WHERE status='Completed') completed.",
  },
  serviceCategoryLineItems: {
    chart: "Service Category Line Items (drill-down: packages vs tests)",
    sources: [RESULT_TABLE],
    logic:
      "Same result_entry filter as Service Categories, grouped by service_type × service_name. Pathology rows matching " +
      "Health Check% / EHC% / %Care Plan% / Annual Health Check% are labelled 'package', everything else 'test'. " +
      "Top 6 service_names per (category × kind) by booked count.",
    sql: "ROW_NUMBER() OVER (PARTITION BY category, kind ORDER BY booked DESC) WHERE rn <= 6.",
  },
  bubbleBySpecialty: {
    chart: "Consult Distribution bubbles (Specialty × Location × Age Group, gender split)",
    sources: [BASE_TABLE],
    logic:
      "Completed agg_kpi rows with non-empty speciality_name, non-null facility_mapping and age_group, grouped by " +
      "speciality_name × facility_mapping × age_group × patient_gender. total = SUM(total_consult_count) split into " +
      "male/female; malePercent = male/total. Top 10 specialities by total (key bubbleSpecialties).",
    sql: "GROUP BY speciality_name, facility_mapping, age_group, patient_gender → SUM(total_consult_count).",
  },
  repeatTrends: {
    chart: "Repeat Visit Trends over time",
    sources: [BASE_TABLE],
    logic:
      "Completed agg_kpi rows bucketed by period (day if range ≤31 days, else month) then aggregated to one row per " +
      "(period, uhid). repeatVisits = SUM(total_consult_count) − COUNT(*) (extra visits beyond the first); " +
      "repeatPatients = COUNT(uhid with ≥2 source rows in that period).",
    sql: "WITH per_period_uhid AS (GROUP BY period, a.uhid) SELECT SUM(consult_count) - COUNT(*), COUNT(*) FILTER (WHERE row_count >= 2).",
  },
  capacityBookedCompleted: {
    chart: "Capacity vs Booked vs Completed (by specialty)",
    sources: [CAPACITY_TABLE],
    logic:
      "doctor_capacity rows (one per month × doctor × specialty) grouped by speciality. " +
      "Capacity = SUM(capacity); Booked = SUM(booked_consult_count); Completed = SUM(consult_successful_count). " +
      "Only the date range (on period_date) and the specialty filter apply — this table has no facility / gender / " +
      "age / relationship columns, so those page filters do not affect this chart. Specialties with all-zero measures " +
      "are dropped; sorted by capacity, top 15.",
    sql: "GROUP BY speciality → SUM(capacity), SUM(booked_consult_count), SUM(consult_successful_count) ORDER BY capacity DESC LIMIT 15.",
  },
};

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

    // Track per-query failures so the endpoint can signal degraded data to the
    // client + let withCache skip writing a poisoned blob to disk.
    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string = "unknown"): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // ── FILTER OPTIONS (unfiltered, completed only) ──
    const baseWhere = `a.cug_code_mapped = $1 AND ${COMPLETED}`;
    const filterPromise = Promise.all([
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.facility_mapping AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.facility_mapping IS NOT NULL ORDER BY 1`, [cugCode]), "filterLocations"),
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.speciality_name AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.speciality_name IS NOT NULL AND a.speciality_name <> '' ORDER BY 1`, [cugCode]), "filterSpecialties"),
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.patient_gender AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.patient_gender IS NOT NULL ORDER BY 1`, [cugCode]), "filterGenders"),
      safeQuery(() => dwQuery<{ v: string }>(`SELECT DISTINCT a.relationship AS v FROM ${BASE_TABLE} a WHERE ${baseWhere} AND a.relationship IS NOT NULL ORDER BY 1`, [cugCode]), "filterRelations"),
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
    ), "kpi");

    // ── BATCH 2: Specialty treemap + Location × Specialty ──
    const specPromise = safeQuery(() => dwQuery<{ name: string; value: string }>(
      `SELECT a.speciality_name AS name, COALESCE(SUM(a.total_consult_count), 0)::bigint AS value
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere} AND a.speciality_name IS NOT NULL AND a.speciality_name <> ''
      GROUP BY a.speciality_name ORDER BY value DESC`,
      q.params
    ), "specialtyTreemap");

    // Keep every row (no specialty / facility filter) so per-clinic
    // bar totals reconcile to the headline totalConsults KPI. Missing
    // specialty falls into the "Other" bar segment in JS below; missing
    // facility falls into an "Unknown" location bucket.
    const locSpecPromise = safeQuery(() => dwQuery<{ location: string; specialty: string; total_consults: string }>(
      `SELECT
         COALESCE(NULLIF(TRIM(a.facility_mapping), ''), 'Unknown') AS location,
         COALESCE(NULLIF(TRIM(a.speciality_name), ''), '') AS specialty,
         COALESCE(SUM(a.total_consult_count), 0)::bigint AS total_consults
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere}
      GROUP BY 1, 2 ORDER BY total_consults DESC`,
      q.params
    ), "locSpec");

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
    ), "demographics");

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
    ), "peakHours");

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
    ), "visitTrends");

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
    ), "repeatTrends");

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
    ), "bubble");

    // ── Service Categories (from result_entry) ──
    // Each row in result_entry is one ordered service test. Booked = COUNT(*);
    // Completed = COUNT(*) FILTER (WHERE status='Completed'). Restricted to the
    // three categories surfaced on the dashboard (Pathology / Radiology /
    // Cardiology). Filters preserved from the previous agg_service_kpi version
    // — date range, gender, relationship, age group — see notes per filter.
    const svcParams: unknown[] = [cugCode];
    let svcWhere = `a.cug_code_mapped = $1
      AND a.service_type IN ('Pathology','Radiology','Cardiology')`;
    let svcIdx = 2;
    const svcDateFrom = searchParams.get("dateFrom");
    const svcDateTo = searchParams.get("dateTo");
    const svcAgeGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
    const svcGenders = searchParams.get("genders")?.split(",").filter(Boolean);
    const svcRelations = searchParams.get("relations")?.split(",").filter(Boolean);
    if (svcDateFrom) {
      svcWhere += ` AND a.creation_date >= $${svcIdx}::timestamp`;
      svcParams.push(svcDateFrom); svcIdx++;
    }
    if (svcDateTo) {
      svcWhere += ` AND a.creation_date <= $${svcIdx}::timestamp`;
      svcParams.push(svcDateTo + "T23:59:59"); svcIdx++;
    }
    if (svcAgeGroups?.length) {
      // result_entry stores age as text like "31 Y,1 M,7 D" — extract the
      // leading-number-before-Y as the year and bucket it the same way the
      // rest of the page does. NULL ages drop out of any age-group filter.
      const ageYears = `NULLIF(substring(a.age from '^([0-9]+)'), '')::int`;
      const ageGroupCase = `CASE
        WHEN ${ageYears} IS NULL THEN NULL
        WHEN ${ageYears} < 20 THEN '<20'
        WHEN ${ageYears} BETWEEN 20 AND 35 THEN '20-35'
        WHEN ${ageYears} BETWEEN 36 AND 40 THEN '36-40'
        WHEN ${ageYears} BETWEEN 41 AND 60 THEN '41-60'
        WHEN ${ageYears} > 60 THEN '61+'
      END`;
      svcWhere += ` AND ${ageGroupCase} = ANY($${svcIdx})`;
      svcParams.push(svcAgeGroups); svcIdx++;
    }
    if (svcGenders?.length) {
      const gc = svcGenders.map((g) => {
        const l = g.toLowerCase();
        if (l === "male") return "LOWER(TRIM(a.gender)) IN ('male', 'm')";
        if (l === "female") return "LOWER(TRIM(a.gender)) IN ('female', 'f')";
        return "(LOWER(TRIM(a.gender)) NOT IN ('male', 'm', 'female', 'f') OR a.gender IS NULL OR TRIM(a.gender) = '')";
      });
      svcWhere += ` AND (${gc.join(" OR ")})`;
    }
    if (svcRelations?.length) {
      svcWhere += ` AND a.relationship = ANY($${svcIdx})`;
      svcParams.push(svcRelations); svcIdx++;
    }
    const svcPromise = safeQuery(() => dwQuery<{ category: string; booked: string; completed: string }>(
      `SELECT a.service_type AS category,
              COUNT(*)::bigint AS booked,
              COUNT(*) FILTER (WHERE a.status = 'Completed')::bigint AS completed
       FROM aggregated_table.result_entry a
       WHERE ${svcWhere}
       GROUP BY a.service_type
       ORDER BY booked DESC`, svcParams,
      { statementTimeoutMs: 60000 }
    ), "serviceCategories");

    // ── Service Category Line Items (drill-down on Category Radar) ──
    // Top-6 service_name rows per service_type, split into "packages" vs
    // "tests" so the drill view can show two distinct lists. Only Pathology
    // has the package/test split — Cardiology and Radiology fall through
    // as plain tests since the bundle naming patterns don't apply.
    const svcLineItemsPromise = safeQuery(() => dwQuery<{
      category: string; service_name: string; kind: string; booked: string; completed: string;
    }>(
      `WITH per_item AS (
         SELECT
           a.service_type AS category,
           a.service_name,
           CASE
             WHEN a.service_type = 'Pathology' AND (
               a.service_name ILIKE 'Health Check%' OR
               a.service_name ILIKE 'EHC%' OR
               a.service_name ILIKE '%Care Plan%' OR
               a.service_name ILIKE 'Annual Health Check%'
             ) THEN 'package'
             ELSE 'test'
           END AS kind,
           COUNT(*)::bigint AS booked,
           COUNT(*) FILTER (WHERE a.status = 'Completed')::bigint AS completed
         FROM aggregated_table.result_entry a
         WHERE ${svcWhere} AND a.service_name IS NOT NULL AND TRIM(a.service_name) <> ''
         GROUP BY 1, 2, 3
       ),
       ranked AS (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY category, kind ORDER BY booked DESC) AS rn
         FROM per_item
       )
       SELECT category, service_name, kind, booked, completed
       FROM ranked
       WHERE rn <= 6
       ORDER BY category, kind, booked DESC`,
      svcParams,
      { statementTimeoutMs: 60000 }
    ), "serviceCategoryLineItems");

    // ── Capacity vs Booked vs Completed (by specialty) ──
    // Sourced from doctor_capacity (month × doctor × specialty). This table
    // only carries cug / period_date / speciality dimensions, so we honour
    // just the date range + specialty filter here; facility / gender / age /
    // relationship filters have no matching column and are intentionally
    // not applied.
    const capConds: string[] = ["dc.cug_code_mapped = $1"];
    const capParams: unknown[] = [cugCode];
    let capIdx = 2;
    if (dateFromParam) { capConds.push(`dc.period_date >= $${capIdx}::date`); capParams.push(dateFromParam); capIdx++; }
    if (dateToParam) { capConds.push(`dc.period_date <= $${capIdx}::date`); capParams.push(dateToParam); capIdx++; }
    const capSpecialties = searchParams.get("specialties")?.split(",").filter(Boolean);
    if (capSpecialties?.length) { capConds.push(`dc.speciality = ANY($${capIdx})`); capParams.push(capSpecialties); capIdx++; }

    const capacityPromise = safeQuery(() => dwQuery<{
      specialty: string; capacity: string; booked: string; completed: string;
    }>(
      `SELECT
         COALESCE(NULLIF(TRIM(dc.speciality), ''), 'Unknown') AS specialty,
         COALESCE(SUM(dc.capacity), 0)::numeric AS capacity,
         COALESCE(SUM(dc.booked_consult_count), 0)::bigint AS booked,
         COALESCE(SUM(dc.consult_successful_count), 0)::bigint AS completed
       FROM ${CAPACITY_TABLE} dc
       WHERE ${capConds.join(" AND ")}
       GROUP BY 1
       HAVING SUM(dc.capacity) > 0 OR SUM(dc.booked_consult_count) > 0 OR SUM(dc.consult_successful_count) > 0
       ORDER BY capacity DESC`,
      capParams
    ), "capacityBookedCompleted");

    // ── Execute all in parallel ──
    const [
      [filterLocations, filterSpecialties, filterGenders, filterRelations],
      kpiRows, specRows, locSpecRows, demoRows, peakRows, trendRows, repeatRows, bubbleRows, svcRows, svcLineRows, capacityRows,
    ] = await Promise.all([
      filterPromise, kpiPromise, specPromise, locSpecPromise,
      demoPromise, peakPromise, trendPromise, repeatPromise, bubblePromise, svcPromise, svcLineItemsPromise, capacityPromise,
    ]);

    // Shape into the grouped-bar payload (top 15 specialties by capacity).
    const capacityBookedCompleted = capacityRows.slice(0, 15).map((r) => ({
      specialty: r.specialty,
      capacity: Math.round(Number(r.capacity) || 0),
      booked: Number(r.booked) || 0,
      completed: Number(r.completed) || 0,
    }));

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
      ), "kpiYoY");
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
        ), "kpiPoP");
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
    // Rank top 6 from labelled specialties only; NULL/empty rows always
    // fall into the per-clinic "Other" bucket so the stacked bar totals
    // reconcile to the headline totalConsults KPI in every case.
    const specTotals: Record<string, number> = {};
    for (const row of locSpecRows) {
      if (!row.specialty) continue;
      specTotals[row.specialty] = (specTotals[row.specialty] || 0) + Number(row.total_consults);
    }
    const topSpecialties = Object.entries(specTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
    const locationMap: Record<string, Record<string, number>> = {};
    for (const row of locSpecRows) {
      if (!locationMap[row.location]) locationMap[row.location] = {};
      const v = Number(row.total_consults);
      if (row.specialty && topSpecialties.includes(row.specialty)) {
        locationMap[row.location][row.specialty] = (locationMap[row.location][row.specialty] || 0) + v;
      } else {
        locationMap[row.location]["Other"] = (locationMap[row.location]["Other"] || 0) + v;
      }
    }
    const hasOther = Object.values(locationMap).some((m) => (m["Other"] || 0) > 0);
    const stackKeys = hasOther ? [...topSpecialties, "Other"] : topSpecialties;
    // Aggregated breakdown of what's hiding inside the "Other" bar segment —
    // tail specialties (rank 7+) plus any unlabeled rows, summed across
    // every clinic. Powers the "View breakdown" pill below the chart.
    const otherSpecMap: Record<string, number> = {};
    for (const row of locSpecRows) {
      if (row.specialty && topSpecialties.includes(row.specialty)) continue;
      const label = row.specialty || "Unspecified";
      otherSpecMap[label] = (otherSpecMap[label] || 0) + Number(row.total_consults);
    }
    const otherSpecialtyBreakdown = Object.entries(otherSpecMap)
      .map(([specialty, total]) => ({ specialty, total }))
      .sort((a, b) => b.total - a.total);
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
      for (const spec of stackKeys) {
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
    // Male/Female colors deliberately chosen to NOT collide with any of the
    // SUNBURST_COLORS age-group palette above — otherwise the inner ring
    // (age group) and outer ring (gender) of the demographic sunburst would
    // share hues and stop reading as distinct dimensions.
    const GENDER_COLORS: Record<string, string> = { M: "#4f46e5", F: "#e879f9", O: "#a1a1aa" };
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

    // ── Service Category Line Items ──
    type LineItem = { serviceName: string; booked: number; completed: number; completionRate: number };
    const serviceCategoryLineItems: Record<string, { packages: LineItem[]; tests: LineItem[] }> = {};
    for (const r of svcLineRows) {
      const booked = Number(r.booked);
      const completed = Number(r.completed);
      const item: LineItem = {
        serviceName: r.service_name,
        booked,
        completed,
        completionRate: booked > 0 ? Math.round((completed / booked) * 100) : 0,
      };
      if (!serviceCategoryLineItems[r.category]) {
        serviceCategoryLineItems[r.category] = { packages: [], tests: [] };
      }
      if (r.kind === "package") serviceCategoryLineItems[r.category].packages.push(item);
      else serviceCategoryLineItems[r.category].tests.push(item);
    }

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
        locationBySpecialty, topSpecialties: stackKeys, othersBreakdown, otherSpecialtyBreakdown,
        visitTrends, avgConsults,
        specialtyTreemap,
        peakHours: { data: peakHoursData, max: peakMax, peakDay: DAY_NAMES[peakCell.day] || "", peakHour: HOUR_NAMES[peakCell.hour] || "", peakCount: peakCell.count },
        serviceCategories, serviceCategoryLineItems, bubbleBySpecialty, bubbleSpecialties,
        repeatTrends,
        capacityBookedCompleted,
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
    console.error("OHC Utilization API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "ohc/utilization" }),
  PROVENANCE
);
