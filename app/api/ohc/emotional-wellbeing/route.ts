import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Emotional Wellbeing API — two-source fact model.
 *
 * agg_kpi (BASE_TABLE) — same fact table /portal/ohc/utilization uses.
 *   Powers KPIs (Total Consults / Unique Patients / Repeat Patients),
 *   Patient Demographics (age / gender / location), and Consult Trends.
 *   Forced filter: speciality_name = 'Psychologist'.
 *
 * hra_kpi_summary (HRA_TABLE) — Health Risk Assessment summary.
 *   Powers EWB-specific surfaces — Critical Risk, Substance Use, Sleep
 *   Quality, Alcohol Habit, Smoking Habit, Anxiety Scale, Visit Pattern,
 *   Impressions. assessment_status = 'final' always applied.
 *
 * Sleep Duration, Self Esteem Scale, and Depression Scale don't have
 * source columns in hra_kpi_summary — those stay at empty defaults
 * until the warehouse grows the columns.
 *
 * Page filters honoured: date range (consult_date / report_month),
 * gender, age-group, relationship. Location filter applies only to
 * agg_kpi queries — hra_kpi_summary has no facility column.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_kpi";
const HRA_TABLE = "aggregated_table.hra_kpi_summary";
const PSYCH_FILTER = "a.speciality_name = 'Psychologist'";
const COMPLETED = "a.stage = 'Completed'";

const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];

function buildWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const relations = searchParams.get("relations")?.split(",").filter(Boolean);

  const conditions: string[] = [`a.cug_code_mapped = $1`, COMPLETED, PSYCH_FILTER];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`a.consult_date >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`a.consult_date <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`a.facility_mapping = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(a.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(a.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(a.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR a.patient_gender IS NULL OR TRIM(a.patient_gender) = '')";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    conditions.push(`a.age_group = ANY($${idx})`);
    params.push(ageGroups);
    idx++;
  }
  if (relations?.length) {
    conditions.push(`a.relationship = ANY($${idx})`);
    params.push(relations);
    idx++;
  }

  return { params, where: conditions.join(" AND ") };
}

/**
 * Where-builder for hra_kpi_summary. Different column names + no
 * facility column, so we can't honour a location filter — but every
 * other dimension (date, gender, age-group, relationship) maps cleanly.
 * Always restricts to assessment_status = 'final' so draft assessments
 * don't pollute the counts.
 */
function buildHraWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const relations = searchParams.get("relations")?.split(",").filter(Boolean);

  const conditions: string[] = [
    `h.cug_code_mapped = $1`,
    `h.assessment_status = 'final'`,
  ];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`h.report_month >= $${idx}::date`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`h.report_month <= $${idx}::date`);
    params.push(dateTo);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(h.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(h.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(h.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR h.patient_gender IS NULL OR TRIM(h.patient_gender) = '')";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    conditions.push(`h.age_group = ANY($${idx})`);
    params.push(ageGroups);
    idx++;
  }
  if (relations?.length) {
    conditions.push(`h.relationship = ANY($${idx})`);
    params.push(relations);
    idx++;
  }

  return { params, where: conditions.join(" AND ") };
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

    const q = buildWhere(searchParams, cugCode);

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Emotional Wellbeing query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // ── KPI: total / unique / repeat — Psychologist slice ──
    // Same CTE pattern as the OHC Utilization API: per_uhid groups one row per
    // patient, then we sum, count, and threshold for the three KPIs.
    const kpiRows = await safeQuery(
      () => dwQuery<{ total_consults: string; unique_patients: string; repeat_patients: string }>(
        `WITH per_uhid AS (
          SELECT a.uhid, COUNT(*) AS row_count, SUM(a.total_consult_count) AS consult_count
          FROM ${BASE_TABLE} a
          WHERE ${q.where}
          GROUP BY a.uhid
        )
        SELECT
          COALESCE((SELECT SUM(consult_count) FROM per_uhid), 0)::bigint AS total_consults,
          (SELECT COUNT(*) FROM per_uhid)::bigint                      AS unique_patients,
          (SELECT COUNT(*) FROM per_uhid WHERE row_count >= 2)::bigint AS repeat_patients`,
        q.params
      ),
      "kpi"
    );
    const totalConsults = Number(kpiRows[0]?.total_consults || 0);
    const uniquePatients = Number(kpiRows[0]?.unique_patients || 0);
    const repeatPatients = Number(kpiRows[0]?.repeat_patients || 0);

    // ── HRA queries: Critical Risk, Substance Use, Sleep, Alcohol,
    // Smoking, Anxiety, Visit Pattern, Impressions ──
    const hra = buildHraWhere(searchParams, cugCode);
    const SLEEP_LABELS = ["Good", "Poor", "Not Reported"];
    const SMOKE_LABELS = ["Yes", "No", "Ex-Smoker", "Not Reported"];
    const ALCOHOL_LABELS = ["Yes", "No", "Not Reported"];
    const ANXIETY_LABELS = ["Anxious", "Not Anxious", "Not Reported"];
    // Normalise nulls/empty strings into a "Not Reported" bucket so the UI
    // doesn't render mystery blank labels.
    const norm = (col: string, allowed: string[]) => `CASE
      WHEN ${col} IS NULL OR TRIM(${col}) = '' THEN 'Not Reported'
      WHEN ${col} = ANY(ARRAY[${allowed.map((s) => `'${s}'`).join(",")}]) THEN ${col}
      ELSE 'Not Reported'
    END`;

    // ── Demographics: age × gender × location, plus monthly trends ──
    const [ageRows, genderRows, locationRows, trendRows] = await Promise.all([
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT a.age_group AS label, COALESCE(SUM(a.total_consult_count), 0)::bigint AS count
           FROM ${BASE_TABLE} a
           WHERE ${q.where} AND a.age_group IS NOT NULL
           GROUP BY a.age_group`,
          q.params
        ),
        "ageDemo"
      ),
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT
             CASE
               WHEN LOWER(TRIM(a.patient_gender)) IN ('male', 'm') THEN 'Male'
               WHEN LOWER(TRIM(a.patient_gender)) IN ('female', 'f') THEN 'Female'
               ELSE 'Others'
             END AS label,
             COALESCE(SUM(a.total_consult_count), 0)::bigint AS count
           FROM ${BASE_TABLE} a
           WHERE ${q.where}
           GROUP BY label
           ORDER BY count DESC`,
          q.params
        ),
        "genderDemo"
      ),
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT a.facility_mapping AS label, COALESCE(SUM(a.total_consult_count), 0)::bigint AS count
           FROM ${BASE_TABLE} a
           WHERE ${q.where} AND a.facility_mapping IS NOT NULL
           GROUP BY a.facility_mapping
           ORDER BY count DESC`,
          q.params
        ),
        "locationDemo"
      ),
      safeQuery(
        () => dwQuery<{ period: string; total_consults: string; unique_patients: string }>(
          `SELECT
             to_char(date_trunc('month', a.consult_date), 'YYYY-MM') AS period,
             COALESCE(SUM(a.total_consult_count), 0)::bigint           AS total_consults,
             COUNT(DISTINCT a.uhid)::bigint                            AS unique_patients
           FROM ${BASE_TABLE} a
           WHERE ${q.where}
           GROUP BY 1
           ORDER BY 1`,
          q.params
        ),
        "trends"
      ),
    ]);

    // Sort age rows in canonical order
    const ageMap: Record<string, number> = {};
    for (const r of ageRows) ageMap[r.label] = Number(r.count);
    const age = AGE_ORDER
      .filter((ag) => ageMap[ag])
      .map((ag) => ({ label: ag, count: ageMap[ag] }));

    // ── HRA aggregates ──
    const [
      criticalRiskRow, substanceRow,
      sleepRows, alcoholRows, smokingRows, anxietyRows,
      visitPatternBucketRows, impressionsBucketRows,
      smokingTrendRows,
    ] = await Promise.all([
      // Critical Risk — total High Risk patients
      safeQuery(
        () => dwQuery<{ total_cases: string }>(
          `SELECT COALESCE(SUM(h.unique_patients), 0)::bigint AS total_cases
           FROM ${HRA_TABLE} h
           WHERE ${hra.where} AND h.risk_category = 'High Risk'`,
          hra.params
        ),
        "criticalRisk"
      ),
      // Substance Use — % patients with smoking='Yes' OR alcohol='Yes'
      safeQuery(
        () => dwQuery<{ substance_pct: string }>(
          `SELECT
             CASE WHEN COALESCE(SUM(h.unique_patients), 0) = 0 THEN 0
               ELSE ROUND(
                 100.0 * COALESCE(SUM(h.unique_patients) FILTER (WHERE h.smoking_status = 'Yes' OR h.alcohol_status = 'Yes'), 0)
                       / NULLIF(SUM(h.unique_patients), 0)
               , 0)
             END AS substance_pct
           FROM ${HRA_TABLE} h
           WHERE ${hra.where}`,
          hra.params
        ),
        "substanceUse"
      ),
      // Sleep Quality
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT ${norm("h.sleep_quality", SLEEP_LABELS)} AS label,
                  COALESCE(SUM(h.unique_patients), 0)::bigint AS count
           FROM ${HRA_TABLE} h WHERE ${hra.where}
           GROUP BY 1`,
          hra.params
        ),
        "sleepQuality"
      ),
      // Alcohol Habit
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT ${norm("h.alcohol_status", ALCOHOL_LABELS)} AS label,
                  COALESCE(SUM(h.unique_patients), 0)::bigint AS count
           FROM ${HRA_TABLE} h WHERE ${hra.where}
           GROUP BY 1`,
          hra.params
        ),
        "alcoholHabit"
      ),
      // Smoking Habit
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT ${norm("h.smoking_status", SMOKE_LABELS)} AS label,
                  COALESCE(SUM(h.unique_patients), 0)::bigint AS count
           FROM ${HRA_TABLE} h WHERE ${hra.where}
           GROUP BY 1`,
          hra.params
        ),
        "smokingHabit"
      ),
      // Anxiety Scale
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT ${norm("h.anxiety_flag", ANXIETY_LABELS)} AS label,
                  COALESCE(SUM(h.unique_patients), 0)::bigint AS count
           FROM ${HRA_TABLE} h WHERE ${hra.where}
           GROUP BY 1`,
          hra.params
        ),
        "anxietyScale"
      ),
      // Visit Pattern — patients bucketed by their total Psychologist visit
      // count (1 / 2 / 3 / 4 / 5+). Sourced from agg_kpi.
      safeQuery(
        () => dwQuery<{ bucket: string; patients: string }>(
          `WITH visit_counts AS (
             SELECT a.uhid, SUM(a.total_consult_count)::int AS visit_count
             FROM ${BASE_TABLE} a
             WHERE ${q.where}
             GROUP BY a.uhid
           )
           SELECT
             CASE
               WHEN visit_count >= 5 THEN '5+ Visits'
               WHEN visit_count = 4 THEN '4 Visits'
               WHEN visit_count = 3 THEN '3 Visits'
               WHEN visit_count = 2 THEN '2 Visits'
               WHEN visit_count = 1 THEN '1 Visit'
             END AS bucket,
             COUNT(*)::bigint AS patients
           FROM visit_counts
           WHERE visit_count >= 1
           GROUP BY 1`,
          q.params
        ),
        "visitPatternBuckets"
      ),
      // Impressions per visit-frequency bucket — JOINs the visit_counts cohort
      // with agg_diagnosis (Psychologist diagnoses), categorising the free-text
      // diagnosis_text into ~9 broad buckets (Anxiety, Depression, Stress/PTSD,
      // OCD, Adjustment, Personality, Substance Use, Insomnia, General
      // Counseling, Other). The diagnosis table has no date column, so date
      // filters apply only to the visit_counts cohort upstream.
      safeQuery(
        () => dwQuery<{ bucket: string; category: string; n: string }>(
          `WITH visit_counts AS (
             SELECT a.uhid, SUM(a.total_consult_count)::int AS visit_count
             FROM ${BASE_TABLE} a
             WHERE ${q.where}
             GROUP BY a.uhid
           ),
           diag_categorized AS (
             SELECT d.uhid,
               CASE
                 WHEN LOWER(d.diagnosis_text) LIKE '%anxiety%' THEN 'Anxiety'
                 WHEN LOWER(d.diagnosis_text) LIKE '%depress%' OR LOWER(d.diagnosis_text) LIKE '%dysthymic%' THEN 'Depression'
                 WHEN LOWER(d.diagnosis_text) LIKE '%ptsd%' OR LOWER(d.diagnosis_text) LIKE '%stress%' THEN 'Stress / PTSD'
                 WHEN LOWER(d.diagnosis_text) LIKE '%obsessive%' OR LOWER(d.diagnosis_text) LIKE '%ocd%' THEN 'OCD'
                 WHEN LOWER(d.diagnosis_text) LIKE '%adjustment%' THEN 'Adjustment'
                 WHEN LOWER(d.diagnosis_text) LIKE '%personality%' THEN 'Personality Disorder'
                 WHEN LOWER(d.diagnosis_text) LIKE '%alcohol%' OR LOWER(d.diagnosis_text) LIKE '%substance%' THEN 'Substance Use'
                 WHEN LOWER(d.diagnosis_text) LIKE '%insomnia%' OR LOWER(d.diagnosis_text) LIKE '%sleep%' THEN 'Insomnia'
                 WHEN LOWER(d.diagnosis_text) LIKE '%counsel%' OR d.diagnosis_text = '' OR d.diagnosis_text IS NULL THEN 'General Counseling'
                 ELSE 'Other'
               END AS category
             FROM aggregated_table.agg_diagnosis d
             WHERE d.cug_code_mapped = $1
               AND d.treating_doctor_speciality = 'Psychologist'
           )
           SELECT
             CASE
               WHEN v.visit_count >= 5 THEN '5+ Visits'
               WHEN v.visit_count = 4 THEN '4 Visits'
               WHEN v.visit_count = 3 THEN '3 Visits'
               WHEN v.visit_count = 2 THEN '2 Visits'
               WHEN v.visit_count = 1 THEN '1 Visit'
             END AS bucket,
             d.category,
             COUNT(*)::bigint AS n
           FROM visit_counts v
           JOIN diag_categorized d ON d.uhid = v.uhid
           GROUP BY 1, 2`,
          q.params
        ),
        "impressionsByVisitBucket"
      ),
      // Smoking trend — current-smoker share per month for the sparkline.
      // current = SUM(unique_patients WHERE smoking_status='Yes')
      // total   = SUM(unique_patients) over all rows in the month
      safeQuery(
        () => dwQuery<{ period: string; current: string; total: string }>(
          `SELECT
             to_char(date_trunc('month', h.report_month), 'YYYY-MM') AS period,
             COALESCE(SUM(h.unique_patients) FILTER (WHERE h.smoking_status = 'Yes'), 0)::bigint AS current,
             COALESCE(SUM(h.unique_patients), 0)::bigint AS total
           FROM ${HRA_TABLE} h
           WHERE ${hra.where}
           GROUP BY 1
           ORDER BY 1`,
          hra.params
        ),
        "smokingTrend"
      ),
    ]);

    const sortBuckets = (rows: { label: string; count: string }[], order: string[]) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[r.label] = Number(r.count);
      return order.filter((l) => map[l] != null).map((l) => ({ label: l, count: map[l] }));
    };

    const sleepQuality = sortBuckets(sleepRows, SLEEP_LABELS);
    const alcoholHabit = sortBuckets(alcoholRows, ALCOHOL_LABELS);
    const smokingHabit = sortBuckets(smokingRows, SMOKE_LABELS);
    const anxietyScale = sortBuckets(anxietyRows, ANXIETY_LABELS);

    const criticalTotal = Number(criticalRiskRow[0]?.total_cases || 0);
    const substanceUsePct = Number(substanceRow[0]?.substance_pct || 0);

    // ── Visit Pattern (real visit counts from agg_kpi) ──
    const VISIT_BUCKET_ORDER = ["1 Visit", "2 Visits", "3 Visits", "4 Visits", "5+ Visits"];
    const visitMap: Record<string, number> = {};
    for (const r of visitPatternBucketRows) visitMap[r.bucket] = Number(r.patients);
    const visitPattern = VISIT_BUCKET_ORDER
      .filter((b) => visitMap[b] > 0)
      .map((b) => ({ label: b, count: visitMap[b] }));

    // ── Impressions Analysis (mental-health diagnoses, bucketed by visit count) ──
    // Build both the global breakdown (sum across buckets) and the per-bucket
    // map the chart consumes when a bucket is clicked.
    const impressionsByVisitBucket: Record<string, Array<{ category: string; count: number }>> = {};
    const globalImpressionMap: Record<string, number> = {};
    for (const row of impressionsBucketRows) {
      const cnt = Number(row.n);
      if (!impressionsByVisitBucket[row.bucket]) impressionsByVisitBucket[row.bucket] = [];
      impressionsByVisitBucket[row.bucket].push({ category: row.category, count: cnt });
      globalImpressionMap[row.category] = (globalImpressionMap[row.category] || 0) + cnt;
    }
    for (const b of Object.keys(impressionsByVisitBucket)) {
      impressionsByVisitBucket[b].sort((a, b2) => b2.count - a.count);
    }
    const impressions = Object.entries(globalImpressionMap)
      .map(([category, count]) => ({ category, count }))
      .filter((i) => i.count > 0)
      .sort((a, b) => b.count - a.count);

    // Smoking trend — last 12 monthly points within the filter window.
    // Each point carries the share of assessed patients flagged as current
    // smokers (rounded to a whole percent, same as the tile figure).
    const smokingTrend = smokingTrendRows
      .map((r) => {
        const cur = Number(r.current || 0);
        const tot = Number(r.total || 0);
        return { period: r.period, pct: tot > 0 ? Math.round((cur / tot) * 100) : 0 };
      })
      .slice(-12);

    return NextResponse.json({
      kpis: {
        totalConsults,
        uniquePatients,
        repeatPatients,
        totalEwbAssessed: 0,
      },
      charts: {
        demographics: {
          age,
          gender: genderRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          location: locationRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          shift: [],
        },
        consultTrends: trendRows.map((r) => ({
          period: r.period,
          totalConsults: Number(r.total_consults),
          uniquePatients: Number(r.unique_patients),
        })),
        // EWB surfaces sourced from hra_kpi_summary. Sub-categories of
        // Critical Risk (suicidalThoughts / attemptedSelfHarm /
        // previousAttempts) aren't broken out in the table, so the totalCases
        // pill is derived from risk_category='High Risk' and the breakdown
        // pills stay at zero.
        criticalRisk: {
          suicidalThoughts: 0,
          attemptedSelfHarm: 0,
          previousAttempts: 0,
          totalCases: criticalTotal,
        },
        substanceUsePct,
        sleepQuality,
        // sleepDuration, depressionScale, selfEsteemScale don't have source
        // columns in hra_kpi_summary — empty until the table grows them.
        sleepDuration: [],
        alcoholHabit,
        smokingHabit,
        smokingTrend,
        visitPattern,
        impressions,
        impressionSubcategories: {},
        impressionsByVisitBucket,
        anxietyScale,
        depressionScale: [],
        selfEsteemScale: [],
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
    console.error("OHC Emotional Wellbeing API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/emotional-wellbeing" });
