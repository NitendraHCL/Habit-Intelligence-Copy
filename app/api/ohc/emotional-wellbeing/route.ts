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
 *   Powers Critical Risk (suicidal_thoughts / attempted_self_harm /
 *   suicide_attempt), Substance Use, Sleep Quality, Sleep Duration,
 *   Alcohol Habit, Smoking Habit (+ trend), Anxiety Scale, Self Esteem
 *   Scale, Depression Scale, Visit Pattern, and Impressions Analysis
 *   (9 native category columns: family / career / self_improvement /
 *   health / session_relationship / financial / psychological_disorders
 *   / sexual_wellness / lgbtqia). Stage filter on this surface treats
 *   Completed, "Prescription Sent", and "Re Open" all as completed (per
 *   product).
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
      if (l === "male") return "LOWER(TRIM(e.appt_patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(e.appt_patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(e.appt_patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR e.appt_patient_gender IS NULL OR TRIM(e.appt_patient_gender) = '')";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    // age is INT in the new schema — direct comparison.
    const groupConds = ageGroups.map((ag) => {
      switch (ag) {
        case "<20": return `e.age < 20`;
        case "20-35": return `e.age BETWEEN 20 AND 35`;
        case "36-40": return `e.age BETWEEN 36 AND 40`;
        case "41-60": return `e.age BETWEEN 41 AND 60`;
        case "61+": return `e.age >= 61`;
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
    const SLEEP_LABELS = ["Good", "Average", "Poor", "Not Reported"];
    const SMOKE_LABELS = ["Yes", "No", "Ex-Smoker", "Not Reported"];
    const ALCOHOL_LABELS = ["Yes", "No", "Not Reported"];
    const ANXIETY_LABELS = ["Anxious", "Not Anxious", "Not Reported"];

    // CTE that deduplicates EWB to one (latest) row per uhid. Used by every
    // distribution query (sleep / alcohol / smoking / anxiety / critical
    // risk / substance % / depression / self-esteem / impressions) so cohort
    // sizes line up with totalEwbAssessed.
    const LATEST_CTE = `WITH latest AS (
      SELECT DISTINCT ON (e.uhid)
        e.uhid,
        e.suicidal_thoughts, e.attempted_self_harm, e.suicide_attempt,
        e.smoking, e.alcohol_intake, e.alcohol_use, e.other_substance_use,
        e.sleep_quality, e.sleep_duration,
        e.family, e.career, e.self_improvement, e.health,
        e.session_relationship, e.financial, e.psychological_disorders,
        e.sexual_wellness, e.lgbtqia
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
      // Critical Risk (Self Harm) — native columns on the new EWB table.
      //   suicidalThoughts → suicidal_thoughts = 'Yes'
      //   attemptedSelfHarm → attempted_self_harm = 'Yes'
      //   previousAttempts → suicide_attempt = 'Yes'
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
             COUNT(*) FILTER (WHERE suicidal_thoughts = 'Yes')::bigint     AS suicidal,
             COUNT(*) FILTER (WHERE attempted_self_harm = 'Yes')::bigint   AS attempted,
             COUNT(*) FILTER (WHERE suicide_attempt = 'Yes')::bigint       AS previous,
             COUNT(*) FILTER (
               WHERE suicidal_thoughts = 'Yes'
                  OR attempted_self_harm = 'Yes'
                  OR suicide_attempt = 'Yes'
             )::bigint AS total_cases
           FROM latest`,
          ewb.params
        ),
        "criticalRisk"
      ),
      // Substance Use — % of latest-session patients flagged on any of:
      // smoking / alcohol_intake / other_substance_use = 'Yes'.
      safeQuery(
        () => dwQuery<{ substance_pct: string }>(
          `${LATEST_CTE}
           SELECT
             CASE WHEN COUNT(*) = 0 THEN 0
               ELSE ROUND(
                 100.0 * COUNT(*) FILTER (
                   WHERE smoking='Yes' OR alcohol_intake='Yes' OR other_substance_use='Yes'
                 ) / NULLIF(COUNT(*), 0)
               , 0)
             END AS substance_pct
           FROM latest`,
          ewb.params
        ),
        "substanceUse"
      ),
      // Sleep Quality — native column with Good / Average / Poor.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN sleep_quality IN ('Good', 'Average', 'Poor') THEN sleep_quality
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "sleepQuality"
      ),
      // Sleep Duration — native column with bucketed labels.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN sleep_duration IN ('7-9 hrs', 'Less than 7 hrs', 'More than 9 hrs') THEN sleep_duration
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "sleepDuration"
      ),
      // Alcohol Habit — native alcohol_intake Yes/No.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN alcohol_intake = 'Yes' THEN 'Yes'
               WHEN alcohol_intake = 'No' THEN 'No'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "alcoholHabit"
      ),
      // Smoking Habit — native smoking column.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN smoking = 'Yes' THEN 'Yes'
               WHEN smoking = 'No' THEN 'No'
               WHEN smoking = 'Ex-Smoker' THEN 'Ex-Smoker'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "smokingHabit"
      ),
      // Anxiety Scale — derived from psychological_disorders containing
      // any anxiety-class label (Generalized Anxiety, etc.). 'No' explicit
      // → Not Anxious; missing/empty → Not Reported.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN psychological_disorders ILIKE '%anxi%' THEN 'Anxious'
               WHEN psychological_disorders = 'No' THEN 'Not Anxious'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "anxietyScale"
      ),
      // Depression Scale — derived from psychological_disorders containing
      // depression / dysthymia. 'No' explicit → Minimal; else Not Reported.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN psychological_disorders ILIKE '%depress%'
                 OR psychological_disorders ILIKE '%dysthym%' THEN 'Moderate or Higher'
               WHEN psychological_disorders = 'No' THEN 'Minimal'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "depressionScale"
      ),
      // Self Esteem Scale — derived from self_improvement column. Patients
      // flagged with low self-esteem / insecurities → Low; explicit 'No'
      // → Normal; else Not Reported.
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `${LATEST_CTE}
           SELECT
             CASE
               WHEN self_improvement ILIKE '%self esteem%'
                 OR self_improvement ILIKE '%insecur%' THEN 'Low'
               WHEN self_improvement = 'No' THEN 'Normal'
               ELSE 'Not Reported'
             END AS label,
             COUNT(*)::bigint AS count
           FROM latest
           GROUP BY 1`,
          ewb.params
        ),
        "selfEsteemScale"
      ),
      // Visit Pattern — patients bucketed by distinct EWB visit count.
      // visit_id is the cleanest per-visit key, but ~10% of rows leave it
      // NULL; fall back to slotstarttime so every assessed patient lands
      // in a bucket and the totals match totalEwbAssessed.
      safeQuery(
        () => dwQuery<{ bucket: string; patients: string }>(
          `WITH visit_counts AS (
             SELECT e.uhid, COUNT(DISTINCT COALESCE(e.visit_id, e.slotstarttime::text))::int AS visit_count
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
      // Impressions Analysis per visit-frequency bucket — derived from
      // the 9 native category columns. A patient is flagged for a
      // category when the column has any value other than NULL/''/'No'
      // (BOOL_OR across their sessions). Category labels match the
      // page's hardcoded tab list verbatim.
      safeQuery(
        () => dwQuery<{ bucket: string; category: string; n: string }>(
          `WITH per_patient AS (
             SELECT
               e.uhid,
               COUNT(DISTINCT COALESCE(e.visit_id, e.slotstarttime::text))::int AS visit_count,
               BOOL_OR(e.family IS NOT NULL AND TRIM(e.family) NOT IN ('', 'No')) AS has_family,
               BOOL_OR(e.career IS NOT NULL AND TRIM(e.career) NOT IN ('', 'No')) AS has_career,
               BOOL_OR(e.self_improvement IS NOT NULL AND TRIM(e.self_improvement) NOT IN ('', 'No')) AS has_self_improvement,
               BOOL_OR(e.health IS NOT NULL AND TRIM(e.health) NOT IN ('', 'No')) AS has_health,
               BOOL_OR(e.session_relationship IS NOT NULL AND TRIM(e.session_relationship) NOT IN ('', 'No')) AS has_relationship,
               BOOL_OR(e.financial IS NOT NULL AND TRIM(e.financial) NOT IN ('', 'No')) AS has_financial,
               BOOL_OR(e.psychological_disorders IS NOT NULL AND TRIM(e.psychological_disorders) NOT IN ('', 'No')) AS has_psych,
               BOOL_OR(e.sexual_wellness IS NOT NULL AND TRIM(e.sexual_wellness) NOT IN ('', 'No')) AS has_sexual,
               BOOL_OR(e.lgbtqia IS NOT NULL AND TRIM(e.lgbtqia) NOT IN ('', 'No')) AS has_lgbtqia
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
               has_family, has_career, has_self_improvement, has_health,
               has_relationship, has_financial, has_psych, has_sexual, has_lgbtqia
             FROM per_patient
             WHERE visit_count >= 1
           )
           SELECT bucket, 'Family' AS category, COUNT(*) FILTER (WHERE has_family)::bigint AS n
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Career', COUNT(*) FILTER (WHERE has_career)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Self Improvement', COUNT(*) FILTER (WHERE has_self_improvement)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Health', COUNT(*) FILTER (WHERE has_health)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Relationship', COUNT(*) FILTER (WHERE has_relationship)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Financial', COUNT(*) FILTER (WHERE has_financial)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Psychological disorders', COUNT(*) FILTER (WHERE has_psych)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'Sexual Wellness', COUNT(*) FILTER (WHERE has_sexual)::bigint
           FROM bucketed GROUP BY bucket
           UNION ALL SELECT bucket, 'LGBTQIA', COUNT(*) FILTER (WHERE has_lgbtqia)::bigint
           FROM bucketed GROUP BY bucket`,
          ewb.params
        ),
        "impressionsByVisitBucket"
      ),
      // Impression subcategory drill-downs — for each of the 9 categories,
      // distribute patients across the distinct non-empty/non-'No' values
      // recorded in that column (using the latest row per uhid).
      safeQuery(
        () => dwQuery<{ impression: string; subcategory: string; n: string }>(
          `${LATEST_CTE}
           SELECT 'Family'::text AS impression, TRIM(family) AS subcategory,
                  COUNT(*)::bigint AS n
             FROM latest WHERE family IS NOT NULL AND TRIM(family) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Career', TRIM(career), COUNT(*)::bigint
             FROM latest WHERE career IS NOT NULL AND TRIM(career) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Self Improvement', TRIM(self_improvement), COUNT(*)::bigint
             FROM latest WHERE self_improvement IS NOT NULL AND TRIM(self_improvement) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Health', TRIM(health), COUNT(*)::bigint
             FROM latest WHERE health IS NOT NULL AND TRIM(health) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Relationship', TRIM(session_relationship), COUNT(*)::bigint
             FROM latest WHERE session_relationship IS NOT NULL AND TRIM(session_relationship) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Financial', TRIM(financial), COUNT(*)::bigint
             FROM latest WHERE financial IS NOT NULL AND TRIM(financial) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Psychological disorders', TRIM(psychological_disorders), COUNT(*)::bigint
             FROM latest WHERE psychological_disorders IS NOT NULL AND TRIM(psychological_disorders) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'Sexual Wellness', TRIM(sexual_wellness), COUNT(*)::bigint
             FROM latest WHERE sexual_wellness IS NOT NULL AND TRIM(sexual_wellness) NOT IN ('', 'No') GROUP BY 1, 2
           UNION ALL SELECT 'LGBTQIA', TRIM(lgbtqia), COUNT(*)::bigint
             FROM latest WHERE lgbtqia IS NOT NULL AND TRIM(lgbtqia) NOT IN ('', 'No') GROUP BY 1, 2`,
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
               e.smoking
             FROM ${EWB_TABLE} e
             WHERE ${ewb.where}
             ORDER BY e.uhid, date_trunc('month', e.slotstarttime), e.slotstarttime DESC
           )
           SELECT
             to_char(month_start, 'YYYY-MM') AS period,
             COUNT(*) FILTER (WHERE smoking = 'Yes')::bigint AS current,
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

    const SLEEP_DURATION_LABELS = ["7-9 hrs", "Less than 7 hrs", "More than 9 hrs", "Not Reported"];
    const sleepDuration = sortBuckets(sleepDurationRows, SLEEP_DURATION_LABELS);
    const DEPRESSION_LABELS = ["Minimal", "Moderate or Higher", "Not Reported"];
    const depressionScale = sortBuckets(depressionRows, DEPRESSION_LABELS);
    const SELF_ESTEEM_LABELS = ["Normal", "Low", "Not Reported"];
    const selfEsteemScale = sortBuckets(selfEsteemRows, SELF_ESTEEM_LABELS);

    // Critical Risk — 3 sub-buckets + total, sourced from the native
    // suicidal_thoughts / attempted_self_harm / suicide_attempt columns.
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
        // EWB surfaces sourced from emotional_wellbeing.
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
