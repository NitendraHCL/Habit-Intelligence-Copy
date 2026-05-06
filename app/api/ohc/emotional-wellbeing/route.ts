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
 * emotional_wellbeing (EWB_TABLE) — freshly prepared EWB intake table.
 *   Powers Critical Risk, Substance Use, Sleep Quality, Alcohol Habit,
 *   Smoking Habit (+ trend), Anxiety Scale, Visit Pattern, Impressions
 *   Analysis. Stage filter on this surface treats Completed,
 *   "Prescription Sent", and "Re Open" all as completed (per product).
 *
 * Sleep Duration, Self Esteem Scale, and Depression Scale don't have
 * source columns in emotional_wellbeing — those stay at empty defaults
 * until the warehouse grows the columns.
 *
 * Page filters honoured: date range (consult_date / slotstarttime),
 * gender, age-group, relationship, location.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_kpi";
const EWB_TABLE = "aggregated_table.emotional_wellbeing";
const PSYCH_FILTER = "a.speciality_name = 'Psychologist'";
const COMPLETED = "a.stage = 'Completed'";
const EWB_COMPLETED = "e.stage IN ('Completed', 'Prescription Sent', 'Re Open')";

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
 * Where-builder for emotional_wellbeing. Honours every page filter:
 * date range (slotstarttime), location (facility_mapping), gender,
 * age-group (parsed from free-text "21 Y" → leading int), relationship.
 * Stage is forced to the inclusive completed-set per product spec.
 */
function buildEwbWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const relations = searchParams.get("relations")?.split(",").filter(Boolean);

  const conditions: string[] = [`e.cug_code_mapped = $1`, EWB_COMPLETED];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`e.slotstarttime >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`e.slotstarttime <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`e.facility_mapping = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(e.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(e.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(e.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR e.patient_gender IS NULL OR TRIM(e.patient_gender) = '')";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    // age column is free text like "21 Y" / "30 Y,2 M,27 D" — parse leading int
    const ageInt = `(NULLIF(substring(e.age FROM '^([0-9]+)'), '')::int)`;
    const groupConds = ageGroups.map((ag) => {
      switch (ag) {
        case "<20": return `${ageInt} < 20`;
        case "20-35": return `${ageInt} BETWEEN 20 AND 35`;
        case "36-40": return `${ageInt} BETWEEN 36 AND 40`;
        case "41-60": return `${ageInt} BETWEEN 41 AND 60`;
        case "61+": return `${ageInt} >= 61`;
        default: return "FALSE";
      }
    });
    conditions.push(`(${groupConds.join(" OR ")})`);
  }
  if (relations?.length) {
    conditions.push(`e.relationship = ANY($${idx})`);
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

    // ── EWB queries: Critical Risk, Substance Use, Sleep, Alcohol,
    // Smoking, Anxiety, Visit Pattern, Impressions ──
    // All sourced from aggregated_table.emotional_wellbeing. Distribution
    // queries dedupe to one row per uhid via the LATEST session (DISTINCT
    // ON ... ORDER BY slotstarttime DESC) so a patient who took the form
    // multiple times is counted once with their most recent answer.
    const ewb = buildEwbWhere(searchParams, cugCode);
    const SLEEP_LABELS = ["Good", "Poor", "Not Reported"];
    const SMOKE_LABELS = ["Yes", "No", "Ex-Smoker", "Not Reported"];
    const ALCOHOL_LABELS = ["Yes", "No", "Not Reported"];
    const ANXIETY_LABELS = ["Anxious", "Not Anxious", "Not Reported"];

    // CTE that deduplicates EWB to one (latest) row per uhid. Used by every
    // distribution query (sleep / alcohol / smoking / anxiety / critical
    // risk / substance %) so cohort sizes line up with totalEwbAssessed.
    const LATEST_CTE = `WITH latest AS (
      SELECT DISTINCT ON (e.uhid)
        e.uhid, e.comp_doyousmoke, e.comp_alcohol, e.comp_tobacco,
        e.comp_sleep, e.comp_anxiety, e.comp_excercise, e.comp_0987,
        e.famhistory, e.fatherchekc, e.motherchekc, e.sibchekc, e.othermember,
        e.socdhx, e.srughx, e.srughx12
      FROM ${EWB_TABLE} e
      WHERE ${ewb.where}
      ORDER BY e.uhid, e.slotstarttime DESC
    )`;

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

    // ── EWB aggregates ──
    const [
      totalEwbRow,
      criticalRiskRow, substanceRow,
      sleepRows, sleepDurationRows, alcoholRows, smokingRows,
      anxietyRows, depressionRows, selfEsteemRows,
      visitPatternBucketRows, impressionsBucketRows,
      impressionSubRows,
      smokingTrendRows,
    ] = await Promise.all([
      // totalEwbAssessed — distinct patients in EWB for current filter
      safeQuery(
        () => dwQuery<{ total: string }>(
          `SELECT COUNT(DISTINCT e.uhid)::bigint AS total
           FROM ${EWB_TABLE} e
           WHERE ${ewb.where}`,
          ewb.params
        ),
        "totalEwbAssessed"
      ),
      // Critical Risk (Self Harm) — emotional_wellbeing has no dedicated
      // self-harm columns. Populating the 3 buckets with the closest
      // medical-history proxies available so the chart isn't blank:
      //   suicidalThoughts → comp_anxiety='Yes' (last-2-weeks distress)
      //   attemptedSelfHarm → srughx12='Yes' (past hospitalization)
      //   previousAttempts → srughx='Yes'   (past surgical history)
      // totalCases counts unique patients flagged on any of the above.
      safeQuery(
        () => dwQuery<{
          suicidal: string;
          attempted: string;
          previous: string;
          total_cases: string;
        }>(
          `${LATEST_CTE}
           SELECT
             COUNT(*) FILTER (WHERE comp_anxiety = 'Yes')::bigint AS suicidal,
             COUNT(*) FILTER (WHERE srughx12 = 'Yes')::bigint    AS attempted,
             COUNT(*) FILTER (WHERE srughx = 'Yes')::bigint      AS previous,
             COUNT(*) FILTER (
               WHERE comp_anxiety = 'Yes' OR srughx12 = 'Yes' OR srughx = 'Yes'
             )::bigint AS total_cases
           FROM latest`,
          ewb.params
        ),
        "criticalRisk"
      ),
      // Substance Use — % of latest-session patients with any of:
      // smoke / alcohol / tobacco = 'Yes'.
      safeQuery(
        () => dwQuery<{ substance_pct: string }>(
          `${LATEST_CTE}
           SELECT
             CASE WHEN COUNT(*) = 0 THEN 0
               ELSE ROUND(
                 100.0 * COUNT(*) FILTER (
                   WHERE comp_doyousmoke='Yes' OR comp_alcohol='Yes' OR comp_tobacco='Yes'
                 ) / NULLIF(COUNT(*), 0)
               , 0)
             END AS substance_pct
           FROM latest`,
          ewb.params
        ),
        "substanceUse"
      ),
      // Sleep Quality — comp_sleep is "Do you sleep ≥7 hours daily?"
      // Yes → Good, No → Poor.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_sleep = 'Yes' THEN 'Good'
               WHEN comp_sleep = 'No' THEN 'Poor'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "sleepQuality"
      ),
      // Sleep Duration — same column with explicit duration labels.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_sleep = 'Yes' THEN '≥7 hours'
               WHEN comp_sleep = 'No' THEN '<7 hours'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "sleepDuration"
      ),
      // Alcohol Habit
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_alcohol = 'Yes' THEN 'Yes'
               WHEN comp_alcohol = 'No' THEN 'No'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "alcoholHabit"
      ),
      // Smoking Habit
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_doyousmoke = 'Yes' THEN 'Yes'
               WHEN comp_doyousmoke = 'No' THEN 'No'
               WHEN comp_doyousmoke = 'Ex-Smoker' THEN 'Ex-Smoker'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "smokingHabit"
      ),
      // Anxiety Scale
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_anxiety = 'Yes' THEN 'Anxious'
               WHEN comp_anxiety = 'No' THEN 'Not Anxious'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "anxietyScale"
      ),
      // Depression Scale — proxy from comp_anxiety (PHQ-style "bothered
      // by feelings over last 2 weeks"). Yes → Moderate or Higher, No →
      // Minimal. No multi-level severity column in EWB to do better.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_anxiety = 'Yes' THEN 'Moderate or Higher'
               WHEN comp_anxiety = 'No' THEN 'Minimal'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "depressionScale"
      ),
      // Self Esteem Scale — proxy from comp_excercise (regular exercise
      // correlates with self-esteem). No dedicated self-esteem column.
      // Yes (active) → Normal, No (sedentary) → Low.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN comp_excercise = 'Yes' THEN 'Normal'
               WHEN comp_excercise = 'No' THEN 'Low'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "selfEsteemScale"
      ),
      // Visit Pattern — patients bucketed by EWB session count.
      safeQuery(
        () => dwQuery<{ bucket: string; patients: string }>(
          `WITH visit_counts AS (
             SELECT e.uhid, COUNT(*)::int AS visit_count
             FROM ${EWB_TABLE} e
             WHERE ${ewb.where}
             GROUP BY e.uhid
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
          ewb.params
        ),
        "visitPatternBuckets"
      ),
      // Impressions Analysis per visit-frequency bucket — derives the
      // "impression" categories from EWB flag columns. Each patient can
      // contribute to multiple categories (BOOL_OR across their sessions).
      // Categories: Anxiety, Sleep Issues, Substance Use, Family History,
      // Past Medical History (comp_0987).
      safeQuery(
        () => dwQuery<{ bucket: string; category: string; n: string }>(
          `WITH per_patient AS (
             SELECT
               e.uhid,
               COUNT(*)::int AS visit_count,
               BOOL_OR(e.comp_anxiety = 'Yes') AS has_anxiety,
               BOOL_OR(e.comp_sleep = 'No') AS has_sleep_issue,
               BOOL_OR(e.comp_doyousmoke = 'Yes' OR e.comp_alcohol = 'Yes' OR e.comp_tobacco = 'Yes') AS has_substance,
               BOOL_OR(e.famhistory = 'Yes') AS has_famhx,
               BOOL_OR(e.comp_0987 = 'Yes') AS has_pmh
             FROM ${EWB_TABLE} e
             WHERE ${ewb.where}
             GROUP BY e.uhid
           ),
           bucketed AS (
             SELECT
               CASE
                 WHEN visit_count >= 5 THEN '5+ Visits'
                 WHEN visit_count = 4 THEN '4 Visits'
                 WHEN visit_count = 3 THEN '3 Visits'
                 WHEN visit_count = 2 THEN '2 Visits'
                 WHEN visit_count = 1 THEN '1 Visit'
               END AS bucket,
               has_anxiety, has_sleep_issue, has_substance, has_famhx, has_pmh
             FROM per_patient
             WHERE visit_count >= 1
           )
           SELECT bucket, 'Anxiety' AS category, COUNT(*) FILTER (WHERE has_anxiety)::bigint AS n
           FROM bucketed GROUP BY bucket
           UNION ALL
           SELECT bucket, 'Sleep Issues', COUNT(*) FILTER (WHERE has_sleep_issue)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL
           SELECT bucket, 'Substance Use', COUNT(*) FILTER (WHERE has_substance)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL
           SELECT bucket, 'Family History', COUNT(*) FILTER (WHERE has_famhx)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL
           SELECT bucket, 'Past Medical History', COUNT(*) FILTER (WHERE has_pmh)::bigint
           FROM bucketed GROUP BY bucket`,
          ewb.params
        ),
        "impressionsByVisitBucket"
      ),
      // Impression subcategory drill-downs — one per impression chip.
      // Family History → relative type (father / mother / sibling / other).
      // Substance Use → substance type (smoking / alcohol / tobacco).
      // Past Medical History / Sleep Issues / Anxiety are single Yes/No
      // flags, so the drill-down shows co-occurring conditions within
      // that cohort (e.g., among anxiety patients, how many also have
      // sleep issues, substance use, etc.).
      safeQuery(
        () => dwQuery<{ impression: string; subcategory: string; n: string }>(
          `${LATEST_CTE}
           -- Family History
           SELECT 'Family History'::text AS impression, 'Father'::text AS subcategory,
                  COUNT(*) FILTER (WHERE fatherchekc = 'true')::bigint AS n FROM latest
           UNION ALL SELECT 'Family History', 'Mother', COUNT(*) FILTER (WHERE motherchekc = 'true')::bigint FROM latest
           UNION ALL SELECT 'Family History', 'Sibling', COUNT(*) FILTER (WHERE sibchekc = 'true')::bigint FROM latest
           UNION ALL SELECT 'Family History', 'Other Member', COUNT(*) FILTER (WHERE othermember = 'true')::bigint FROM latest
           -- Substance Use
           UNION ALL SELECT 'Substance Use', 'Smoking', COUNT(*) FILTER (WHERE comp_doyousmoke = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Substance Use', 'Alcohol', COUNT(*) FILTER (WHERE comp_alcohol = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Substance Use', 'Tobacco', COUNT(*) FILTER (WHERE comp_tobacco = 'Yes')::bigint FROM latest
           -- Past Medical History (cohort = comp_0987='Yes'); show co-occurring flags
           UNION ALL SELECT 'Past Medical History', 'Surgical History',
                  COUNT(*) FILTER (WHERE comp_0987 = 'Yes' AND srughx = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Past Medical History', 'Hospitalization',
                  COUNT(*) FILTER (WHERE comp_0987 = 'Yes' AND srughx12 = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Past Medical History', 'Family History',
                  COUNT(*) FILTER (WHERE comp_0987 = 'Yes' AND famhistory = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Past Medical History', 'Social History',
                  COUNT(*) FILTER (WHERE comp_0987 = 'Yes' AND socdhx = 'Yes')::bigint FROM latest
           -- Sleep Issues (cohort = comp_sleep='No'); show co-occurring flags
           UNION ALL SELECT 'Sleep Issues', 'Also Anxious',
                  COUNT(*) FILTER (WHERE comp_sleep = 'No' AND comp_anxiety = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Sleep Issues', 'Also Substance Use',
                  COUNT(*) FILTER (WHERE comp_sleep = 'No' AND (comp_doyousmoke = 'Yes' OR comp_alcohol = 'Yes' OR comp_tobacco = 'Yes'))::bigint FROM latest
           UNION ALL SELECT 'Sleep Issues', 'Also Family History',
                  COUNT(*) FILTER (WHERE comp_sleep = 'No' AND famhistory = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Sleep Issues', 'Also Past Medical History',
                  COUNT(*) FILTER (WHERE comp_sleep = 'No' AND comp_0987 = 'Yes')::bigint FROM latest
           -- Anxiety (cohort = comp_anxiety='Yes'); show co-occurring flags
           UNION ALL SELECT 'Anxiety', 'Also Sleep Issues',
                  COUNT(*) FILTER (WHERE comp_anxiety = 'Yes' AND comp_sleep = 'No')::bigint FROM latest
           UNION ALL SELECT 'Anxiety', 'Also Substance Use',
                  COUNT(*) FILTER (WHERE comp_anxiety = 'Yes' AND (comp_doyousmoke = 'Yes' OR comp_alcohol = 'Yes' OR comp_tobacco = 'Yes'))::bigint FROM latest
           UNION ALL SELECT 'Anxiety', 'Also Family History',
                  COUNT(*) FILTER (WHERE comp_anxiety = 'Yes' AND famhistory = 'Yes')::bigint FROM latest
           UNION ALL SELECT 'Anxiety', 'Also Past Medical History',
                  COUNT(*) FILTER (WHERE comp_anxiety = 'Yes' AND comp_0987 = 'Yes')::bigint FROM latest`,
          ewb.params
        ),
        "impressionSubcategories"
      ),
      // Smoking trend — monthly current-smoker share, derived from the
      // latest answer per patient per month.
      safeQuery(
        () => dwQuery<{ period: string; current: string; total: string }>(
          `WITH per_month AS (
             SELECT DISTINCT ON (e.uhid, date_trunc('month', e.slotstarttime))
               e.uhid,
               date_trunc('month', e.slotstarttime) AS month_start,
               e.comp_doyousmoke
             FROM ${EWB_TABLE} e
             WHERE ${ewb.where}
             ORDER BY e.uhid, date_trunc('month', e.slotstarttime), e.slotstarttime DESC
           )
           SELECT
             to_char(month_start, 'YYYY-MM') AS period,
             COUNT(*) FILTER (WHERE comp_doyousmoke = 'Yes')::bigint AS current,
             COUNT(*)::bigint AS total
           FROM per_month
           GROUP BY 1
           ORDER BY 1`,
          ewb.params
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

    const SLEEP_DURATION_LABELS = ["≥7 hours", "<7 hours", "Not Reported"];
    const sleepDuration = sortBuckets(sleepDurationRows, SLEEP_DURATION_LABELS);
    const DEPRESSION_LABELS = ["Minimal", "Moderate or Higher", "Not Reported"];
    const depressionScale = sortBuckets(depressionRows, DEPRESSION_LABELS);
    const SELF_ESTEEM_LABELS = ["Normal", "Low", "Not Reported"];
    const selfEsteemScale = sortBuckets(selfEsteemRows, SELF_ESTEEM_LABELS);

    // Critical Risk — 3 sub-buckets + total (proxies; see SQL comment).
    const criticalSuicidal = Number(criticalRiskRow[0]?.suicidal || 0);
    const criticalAttempted = Number(criticalRiskRow[0]?.attempted || 0);
    const criticalPrevious = Number(criticalRiskRow[0]?.previous || 0);
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

    const totalEwbAssessed = Number(totalEwbRow[0]?.total || 0);

    return NextResponse.json({
      kpis: {
        totalConsults,
        uniquePatients,
        repeatPatients,
        totalEwbAssessed,
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
        // EWB surfaces sourced from emotional_wellbeing. Critical Risk
        // sub-buckets are proxies (no dedicated self-harm columns in the
        // table); see the SQL comment for the column → bucket mapping.
        criticalRisk: {
          suicidalThoughts: criticalSuicidal,
          attemptedSelfHarm: criticalAttempted,
          previousAttempts: criticalPrevious,
          totalCases: criticalTotal,
        },
        substanceUsePct,
        sleepQuality,
        sleepDuration,
        alcoholHabit,
        smokingHabit,
        smokingTrend,
        visitPattern,
        impressions,
        // Drill-down panel for the Impressions Analysis chart. Each
        // impression chip surfaces a meaningful sub-breakdown.
        impressionSubcategories: (() => {
          const out: Record<string, Array<{ label: string; count: number }>> = {};
          for (const row of impressionSubRows) {
            const cnt = Number(row.n);
            if (cnt <= 0) continue;
            if (!out[row.impression]) out[row.impression] = [];
            out[row.impression].push({ label: row.subcategory, count: cnt });
          }
          for (const k of Object.keys(out)) out[k].sort((a, b) => b.count - a.count);
          return out;
        })(),
        impressionsByVisitBucket,
        anxietyScale,
        depressionScale,
        selfEsteemScale,
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
