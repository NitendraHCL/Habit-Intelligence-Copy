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
    const EXERCISE_LABELS = ["Yes", "No", "Not Reported"];
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
      sleepRows, alcoholRows, smokingRows, anxietyRows, exerciseRows,
      impressionsRow,
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
      // Visit Pattern — repurposed from exercise_status (Yes / No / Not Reported)
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT ${norm("h.exercise_status", EXERCISE_LABELS)} AS label,
                  COALESCE(SUM(h.unique_patients), 0)::bigint AS count
           FROM ${HRA_TABLE} h WHERE ${hra.where}
           GROUP BY 1`,
          hra.params
        ),
        "visitPattern"
      ),
      // Impressions Analysis — chronic-condition counts as four "impressions"
      safeQuery(
        () => dwQuery<{ diabetes: string; hypertension: string; heart_disease: string; thyroid: string }>(
          `SELECT
             COALESCE(SUM(h.count_diabetes), 0)::bigint      AS diabetes,
             COALESCE(SUM(h.count_hypertension), 0)::bigint  AS hypertension,
             COALESCE(SUM(h.count_heart_disease), 0)::bigint AS heart_disease,
             COALESCE(SUM(h.count_thyroid), 0)::bigint       AS thyroid
           FROM ${HRA_TABLE} h
           WHERE ${hra.where}`,
          hra.params
        ),
        "impressions"
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
    const visitPattern = sortBuckets(exerciseRows, EXERCISE_LABELS);

    const criticalTotal = Number(criticalRiskRow[0]?.total_cases || 0);
    const substanceUsePct = Number(substanceRow[0]?.substance_pct || 0);

    const imp = impressionsRow[0] || ({} as Record<string, string>);
    const impressions = [
      { label: "Diabetes", count: Number(imp.diabetes || 0) },
      { label: "Hypertension", count: Number(imp.hypertension || 0) },
      { label: "Heart Disease", count: Number(imp.heart_disease || 0) },
      { label: "Thyroid", count: Number(imp.thyroid || 0) },
    ].filter((i) => i.count > 0);

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
        visitPattern,
        impressions,
        impressionSubcategories: {},
        impressionsByVisitBucket: {},
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
