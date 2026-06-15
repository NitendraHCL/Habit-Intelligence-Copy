import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

/* ────────────────────────────────────────────────────────────────────
 * OHC Repeat Visits API — populated from THREE warehouse tables:
 *
 *   • aggregated_table.agg_kpi        — the same source the Utilization
 *     page reads. Per-(uhid × consult_date × specialty) consult counts.
 *     We derive the repeat-patient cohort (SUM(total_consult_count)>=2)
 *     and every demographics / specialty / tenure / visit-frequency
 *     aggregate from this table.
 *
 *   • aggregated_table.agg_diagnosis  — the same source the Health
 *     Insights page reads. One row per (uhid × icd_code); the `status`
 *     column carries the native chronic flag. We use it to mark which
 *     repeat-patient uhids are chronic and to build the Recurring
 *     Conditions Performance table (chronic only).
 *
 *   • aggregated_table.vitals         — new table. Per-visit vital
 *     parameter readings keyed by uhid + slotstarttime. We pull
 *     BMI to build the Same-Cohort-Progression Sankey (Visit 1→2→3
 *     transitions between Below Normal / In Range / Above Normal using
 *     WHO cut-offs: <18.5 / 18.5–24.9 / ≥25).
 *
 * The previous implementation used aggregated_table.health_diagnosis as
 * its sole source and had `sankeyFlow` returned empty — explicit TODO in
 * the old comment. This rewrite fills that gap.
 *
 * Page contract preserved: same JSON keys the React side already reads
 * (kpis, charts.chronicVsAcute, charts.recurringConditions.chronic,
 *  charts.demographics, charts.repeatVisitFrequency, charts.specialtyTreemap,
 *  charts.repeatUserSegments, charts.cohortYears, charts.cohortVisitFrequency,
 *  charts.sankeyFlow, slices.all_<n>). The page-level chronic/acute toggle
 *  was removed in a prior commit, so we emit just 4 slice keys (all_2 …
 *  all_5) rather than 12.
 * ──────────────────────────────────────────────────────────────────── */

const KPI_TABLE = "aggregated_table.agg_kpi";
const DIAG_TABLE = "aggregated_table.agg_diagnosis";
const VITALS_TABLE = "aggregated_table.vitals";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per chart, keyed identically to the
 * `charts` keys in the response below (plus `kpis`). Shipped only to
 * SUPER_ADMIN callers and rendered by <DataAuditSection> at the bottom
 * of the page. Edit an entry whenever you change the query that feeds
 * the matching chart so the audit panel stays truthful.
 *
 * Common cohort across every chart: the "repeat patient" set is the
 * UHIDs from agg_kpi (stage = 'Completed', within the filter window)
 * whose SUM(total_consult_count) >= the Min Visits filter (default 2).
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Repeat Patients · Total Consults · Avg Frequency · Frequent Repeaters)",
    sources: [KPI_TABLE],
    logic:
      "From the repeat-patient cohort (agg_kpi, stage='Completed', SUM(total_consult_count) ≥ Min Visits, grouped by uhid): " +
      "Total Repeat Patients = COUNT(uhid); Total Consults by Repeat = SUM(total_consult_count); " +
      "Avg Visit Frequency = AVG(consults per uhid); Frequent Repeaters = COUNT(uhid with ≥5 consults), " +
      "a fixed ≥5 bar independent of the Min Visits filter.",
    sql: "GROUP BY a.uhid HAVING SUM(a.total_consult_count) >= :minVisits → COUNT / SUM / AVG; FILTER (WHERE vc >= 5) for frequent repeaters.",
  },
  chronicVsAcute: {
    chart: "Chronic Repeat Patients",
    sources: [KPI_TABLE, DIAG_TABLE],
    logic:
      "Repeat-patient UHIDs (agg_kpi) LEFT JOIN the chronic UHID set (agg_diagnosis where LOWER(status) IN " +
      "('chronic','acute or chronic')). chronic = repeaters present in the chronic set; acute = repeaters absent from it " +
      "(i.e. non-chronic). Same date/location/gender/age filters applied to both tables.",
    sql: "COUNT(*) FILTER (WHERE c.uhid IS NOT NULL) AS chronic vs FILTER (WHERE c.uhid IS NULL) AS acute.",
  },
  recurringConditions: {
    chart: "Recurring Conditions Performance (chronic)",
    sources: [KPI_TABLE, DIAG_TABLE],
    logic:
      "agg_diagnosis rows for repeat-patient UHIDs, chronic only (LOWER(status) IN ('chronic','acute or chronic')), " +
      "grouped by icd_description. patients = COUNT(DISTINCT uhid); occurrences = COUNT(*). " +
      "Keeps conditions with ≥2 total records, top 40 by patient count.",
    sql: "GROUP BY d.icd_description HAVING COUNT(*) >= 2 ORDER BY patients DESC LIMIT 40.",
  },
  demographics: {
    chart: "Demographics (Age Groups · Gender Split · Age×Gender Pyramid · Location Distribution)",
    sources: [KPI_TABLE],
    logic:
      "Per repeat-patient UHID, one row carrying MAX(age), MAX(gender), MAX(facility_mapping). Age banded into " +
      "<20 / 20-35 / 36-40 / 41-60 / 61+; gender normalised to Male/Female/Others; counts are distinct patients. " +
      "Location distribution keeps the top 10 facilities and rolls the remainder into 'Others'.",
    sql: "COUNT(*) per age band / gender / age|gender / facility over the per_uhid cohort.",
  },
  repeatVisitFrequency: {
    chart: "Repeat Visit Frequency (Same vs Different Specialty)",
    sources: [KPI_TABLE],
    logic:
      "Repeat-patient UHIDs bucketed by total consults into 2-4 / 5-9 / 10+. Within each bucket, sameSpecialty = " +
      "patients touching ≤1 distinct speciality_name, differentSpecialty = patients touching ≥2.",
    sql: "COUNT(*) per visit-count bucket, split by COUNT(DISTINCT speciality_name) <= 1 vs >= 2.",
  },
  repeatUserSegments: {
    chart: "Repeat User Segments by Tenure",
    sources: [KPI_TABLE, DIAG_TABLE],
    logic:
      "Tenure per UHID = MAX(consult_date) − MIN(consult_date), banded into 1 year / 2 years / 3+ years. Per band: " +
      "patients = COUNT(uhid); visitsPerYear = SUM(consults)/patients/tenure; chronic share = % of band's UHIDs in " +
      "the chronic set (agg_diagnosis).",
    sql: "GROUP BY tenure band || chronic flag; visits summed per band.",
  },
  specialtyTreemap: {
    chart: "Specialty Treemap (by year)",
    sources: [KPI_TABLE],
    logic:
      "Consults for repeat-patient UHIDs grouped by speciality_name × consult year. value = SUM(total_consult_count). " +
      "Top 25 specialities per year plus an 'All' aggregate; blank specialities labelled 'Unknown'.",
    sql: "GROUP BY speciality_name, EXTRACT(YEAR FROM consult_date) ORDER BY SUM DESC LIMIT 25.",
  },
  cohortVisitFrequency: {
    chart: "Same Cohort Progression — Visit Frequency by Year",
    sources: [KPI_TABLE],
    logic:
      "For each consult year, count repeat-patient UHIDs whose consults in that year clear each threshold (3+, 4+, 5+, 6+). " +
      "A patient contributes to a year's '5+' bucket if they had ≥5 consults in that year.",
    sql: "per_uhid_year (SUM consults per uhid per year) → COUNT(*) WHERE vc_year >= N for N in 3,4,5,6.",
  },
  sankeyFlow: {
    chart: "Same Cohort Progression — BMI Sankey (Visit 1→2→3)",
    sources: [KPI_TABLE, VITALS_TABLE],
    logic:
      "For repeat-patient UHIDs, take their first 3 BMI readings from vitals (vital_parameter_name='BMI', value 5–80), " +
      "ordered by slotstarttime. Bucket each by WHO cut-offs (<18.5 Below Normal / 18.5–24.9 In Range / ≥25 " +
      "Above Normal) and count Visit 1→2 and Visit 2→3 bucket transitions.",
    sql: "ROW_NUMBER() OVER (PARTITION BY uhid ORDER BY slotstarttime); LEAD(bucket) for transitions; visit_n IN (1,2).",
  },
};

// WHO BMI cut-offs (user-confirmed). Reference range columns on the
// vitals row are intentionally ignored — we want one consistent
// classifier across the whole cohort so transitions are comparable.
const BMI_BUCKET_CASE = `
  CASE
    WHEN v.vital_value < 18.5 THEN 'Below Normal'
    WHEN v.vital_value < 25   THEN 'In Range'
    ELSE 'Above Normal'
  END
`;

const AGE_GROUP_CASE_KPI = `CASE
  WHEN a.age < 20 THEN '<20'
  WHEN a.age BETWEEN 20 AND 35 THEN '20-35'
  WHEN a.age BETWEEN 36 AND 40 THEN '36-40'
  WHEN a.age BETWEEN 41 AND 60 THEN '41-60'
  WHEN a.age > 60 THEN '61+'
END`;

interface FilterShape {
  dateFrom: string | null;
  dateTo: string | null;
  ageGroups: string[];
  genders: string[];
  locations: string[];
  /** Minimum total OHC consults per uhid to qualify as a "repeat patient".
   *  Default 2. Now a server-side filter so it cascades to every chart. */
  minVisits: number;
}

function readFilters(searchParams: URLSearchParams): FilterShape {
  const rawMin = Number(searchParams.get("minVisits"));
  const minVisits = Number.isFinite(rawMin) && rawMin >= 2 && rawMin <= 50
    ? Math.floor(rawMin)
    : 2;
  return {
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    ageGroups: searchParams.get("ageGroups")?.split(",").filter(Boolean) ?? [],
    genders: searchParams.get("genders")?.split(",").filter(Boolean) ?? [],
    locations: searchParams.get("locations")?.split(",").filter(Boolean) ?? [],
    minVisits,
  };
}

/**
 * Build the WHERE clause + params array for a given source table.
 * `alias` is the table alias (e.g. "a" for agg_kpi, "d" for agg_diagnosis,
 * "v" for vitals). `dateColumn` is the date column on that table to
 * filter by (consult_date / g_creation_time / slotstarttime).
 *
 * Returns a closure that gives the next placeholder index — callers can
 * tack on more conditions later without colliding.
 */
function buildWhere(
  alias: string,
  dateColumn: string,
  cugCode: string,
  f: FilterShape,
  options: { ageGroupCase?: string; ignoreAge?: boolean } = {}
): { where: string; params: unknown[] } {
  const conditions: string[] = [`${alias}.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (f.dateFrom) {
    conditions.push(`${alias}.${dateColumn} >= $${idx}::timestamp`);
    params.push(f.dateFrom);
    idx++;
  }
  if (f.dateTo) {
    conditions.push(`${alias}.${dateColumn} <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(f.dateTo);
    idx++;
  }
  if (f.locations.length) {
    conditions.push(`${alias}.facility_mapping = ANY($${idx})`);
    params.push(f.locations);
    idx++;
  }
  if (f.genders.length) {
    const gc = f.genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return `LOWER(TRIM(${alias}.patient_gender)) IN ('male', 'm')`;
      if (l === "female") return `LOWER(TRIM(${alias}.patient_gender)) IN ('female', 'f')`;
      return `(LOWER(TRIM(${alias}.patient_gender)) NOT IN ('male','m','female','f') OR ${alias}.patient_gender IS NULL)`;
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (!options.ignoreAge && f.ageGroups.length && options.ageGroupCase) {
    conditions.push(`${options.ageGroupCase} = ANY($${idx})`);
    params.push(f.ageGroups);
    idx++;
  }
  return { where: conditions.join(" AND "), params };
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

    const f = readFilters(searchParams);

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try {
        return await fn();
      } catch (e) {
        console.error(`Repeat Visits query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    const HEAVY_OPTS = { statementTimeoutMs: 60000 };

    const kpiWhere = buildWhere("a", "consult_date", cugCode, f, {
      ageGroupCase: AGE_GROUP_CASE_KPI,
    });
    // agg_diagnosis carries age but not an age_group column; we apply the
    // same banding via inline CASE.
    const AGE_GROUP_CASE_DIAG = AGE_GROUP_CASE_KPI.replace(/a\.age/g, "d.age");
    const diagWhere = buildWhere("d", "g_creation_time", cugCode, f, {
      ageGroupCase: AGE_GROUP_CASE_DIAG,
    });
    // vitals carries age too; same banding.
    const AGE_GROUP_CASE_VITALS = AGE_GROUP_CASE_KPI.replace(/a\.age/g, "v.age");
    const vitalsWhere = buildWhere("v", "slotstarttime", cugCode, f, {
      ageGroupCase: AGE_GROUP_CASE_VITALS,
    });

    // ── ① Big consolidated per_uhid scan on agg_kpi.
    //    Joined to chronic_uhids (derived from agg_diagnosis in the same
    //    window) for the has_chronic flag. minVisits is now applied
    //    upstream in repeat_base so every downstream aggregation
    //    automatically respects the threshold.
    type StatRow = { kind: string; bucket: string; n: string };
    const patientStatsRows = await safeQuery(
      () =>
        dwQuery<StatRow>(
          `
          WITH repeat_base AS (
            SELECT
              a.uhid,
              SUM(a.total_consult_count)::int AS vc,
              MAX(a.age) AS age_years,
              MAX(a.patient_gender) AS gender,
              MAX(a.facility_mapping) AS facility,
              MIN(a.consult_date) AS first_at,
              MAX(a.consult_date) AS last_at,
              COUNT(DISTINCT NULLIF(TRIM(a.speciality_name), ''))::int AS spec_count
            FROM ${KPI_TABLE} a
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY a.uhid
            HAVING SUM(a.total_consult_count) >= ${f.minVisits}
          ),
          chronic_uhids AS (
            SELECT DISTINCT d.uhid
            FROM ${DIAG_TABLE} d
            WHERE ${diagWhere.where}
              AND LOWER(d.status) IN ('chronic', 'acute or chronic')
          ),
          per_uhid AS (
            SELECT r.*, (c.uhid IS NOT NULL) AS has_chronic
            FROM repeat_base r
            LEFT JOIN chronic_uhids c ON c.uhid = r.uhid
          )
          SELECT 'kpi' AS kind, 'totalRepeatPatients' AS bucket, COUNT(*)::bigint AS n FROM per_uhid
          UNION ALL
          SELECT 'kpi', 'totalConsultsByRepeat', COALESCE(SUM(vc), 0)::bigint FROM per_uhid
          UNION ALL
          SELECT 'kpi', 'avgVisitFrequencyX10', ROUND(COALESCE(AVG(vc), 0) * 10)::bigint FROM per_uhid
          UNION ALL
          -- "Frequent repeaters" is its own definition (≥5 visits) regardless
          -- of the minVisits filter. Counts the subset of the active cohort
          -- that also clears the ≥5 bar.
          SELECT 'kpi', 'frequentRepeaters', COUNT(*) FILTER (WHERE vc >= 5)::bigint FROM per_uhid
          UNION ALL
            SELECT 'ageGroup', CASE
              WHEN age_years < 20 THEN '<20'
              WHEN age_years BETWEEN 20 AND 35 THEN '20-35'
              WHEN age_years BETWEEN 36 AND 40 THEN '36-40'
              WHEN age_years BETWEEN 41 AND 60 THEN '41-60'
              WHEN age_years > 60 THEN '61+'
              ELSE 'Unknown' END,
              COUNT(*)::bigint
            FROM per_uhid WHERE age_years IS NOT NULL GROUP BY 2
          UNION ALL
            SELECT 'gender', CASE
              WHEN LOWER(TRIM(gender)) IN ('male','m') THEN 'Male'
              WHEN LOWER(TRIM(gender)) IN ('female','f') THEN 'Female'
              ELSE 'Others' END,
              COUNT(*)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'visitFreq', CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END,
              COUNT(*)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'visitFreqSame', CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END,
              COUNT(*) FILTER (WHERE spec_count <= 1)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'visitFreqDiff', CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END,
              COUNT(*) FILTER (WHERE spec_count >= 2)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'location', COALESCE(NULLIF(TRIM(facility), ''), 'Unknown'),
              COUNT(*)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'segment',
              (CASE
                WHEN age_years < 20 THEN '<20'
                WHEN age_years BETWEEN 20 AND 35 THEN '20-35'
                WHEN age_years BETWEEN 36 AND 40 THEN '36-40'
                WHEN age_years BETWEEN 41 AND 60 THEN '41-60'
                WHEN age_years > 60 THEN '61+'
                ELSE 'Unknown' END)
              || '|' ||
              (CASE
                WHEN LOWER(TRIM(gender)) IN ('male','m') THEN 'Male'
                WHEN LOWER(TRIM(gender)) IN ('female','f') THEN 'Female'
                ELSE 'Others' END),
              COUNT(*)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'tenure',
              (CASE
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 2 THEN '3+ years'
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 1 THEN '2 years'
                ELSE '1 year' END)
              || '|' || (CASE WHEN has_chronic THEN 'chronic' ELSE 'notchronic' END),
              COUNT(*)::bigint
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'tenureVisits',
              CASE
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 2 THEN '3+ years'
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 1 THEN '2 years'
                ELSE '1 year' END,
              COALESCE(SUM(vc), 0)::bigint
            FROM per_uhid GROUP BY 2
          `,
          mergeParams(kpiWhere, diagWhere).params,
          HEAVY_OPTS
        ),
      "patientStats"
    );

    // ── ② Headline chronic count among repeaters (for "Chronic Repeat
    //    Patients" card). chronic_count = #repeat-uhids that also appear
    //    in the chronic set; total = #repeat-uhids; the page derives the
    //    share. We keep an "acute" alias for back-compat with the page
    //    field name (chronicVsAcute) — `acute` here means non-chronic
    //    repeaters, since the chronic/acute split was retired UI-side.
    const chronicAcuteRows = await safeQuery(
      () =>
        dwQuery<{ chronic: string; acute: string }>(
          `
          WITH repeat_uhids AS (
            SELECT a.uhid
            FROM ${KPI_TABLE} a
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY a.uhid
            HAVING SUM(a.total_consult_count) >= ${f.minVisits}
          ),
          chronic_uhids AS (
            SELECT DISTINCT d.uhid
            FROM ${DIAG_TABLE} d
            WHERE ${diagWhere.where}
              AND LOWER(d.status) IN ('chronic', 'acute or chronic')
          )
          SELECT
            COUNT(*) FILTER (WHERE c.uhid IS NOT NULL)::bigint AS chronic,
            COUNT(*) FILTER (WHERE c.uhid IS NULL)::bigint AS acute
          FROM repeat_uhids r
          LEFT JOIN chronic_uhids c ON c.uhid = r.uhid
          `,
          mergeParams(kpiWhere, diagWhere).params,
          HEAVY_OPTS
        ),
      "chronicVsAcute"
    );

    // ── ③ Recurring Conditions (chronic) — top chronic icd_descriptions
    //    across the repeat-patient cohort. Threshold ≥2 occurrences per
    //    (uhid × condition) so single-shot entries don't pollute the list.
    const recurringRows = await safeQuery(
      () =>
        dwQuery<{ condition: string; patients: string; total_occurrences: string }>(
          `
          WITH repeat_uhids AS (
            SELECT a.uhid
            FROM ${KPI_TABLE} a
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY a.uhid
            HAVING SUM(a.total_consult_count) >= ${f.minVisits}
          )
          SELECT
            d.icd_description AS condition,
            COUNT(DISTINCT d.uhid)::bigint AS patients,
            COUNT(*)::bigint AS total_occurrences
          FROM ${DIAG_TABLE} d
          INNER JOIN repeat_uhids r ON r.uhid = d.uhid
          WHERE ${diagWhere.where}
            AND LOWER(d.status) IN ('chronic', 'acute or chronic')
            AND d.icd_description IS NOT NULL
            AND TRIM(d.icd_description) <> ''
          GROUP BY d.icd_description
          HAVING COUNT(*) >= 2
          ORDER BY patients DESC
          LIMIT 40
          `,
          mergeParams(kpiWhere, diagWhere).params,
          HEAVY_OPTS
        ),
      "recurringConditions"
    );

    // ── ④ Specialty treemap — uses agg_kpi.speciality_name. Scoped to
    //    repeat uhids; bucketed by year so the page's year selector works.
    const specialtyRows = await safeQuery(
      () =>
        dwQuery<{ speciality: string; year: string; count: string }>(
          `
          WITH repeat_uhids AS (
            SELECT a.uhid
            FROM ${KPI_TABLE} a
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY a.uhid
            HAVING SUM(a.total_consult_count) >= ${f.minVisits}
          )
          SELECT
            COALESCE(NULLIF(TRIM(a.speciality_name), ''), 'Unknown') AS speciality,
            EXTRACT(YEAR FROM a.consult_date)::int::text AS year,
            SUM(a.total_consult_count)::bigint AS count
          FROM ${KPI_TABLE} a
          INNER JOIN repeat_uhids r ON r.uhid = a.uhid
          WHERE ${kpiWhere.where} AND a.stage = 'Completed'
          GROUP BY 1, 2
          ORDER BY 3 DESC
          `,
          kpiWhere.params,
          HEAVY_OPTS
        ),
      "specialtyTreemap"
    );

    // ── ⑤ Cohort visit-frequency per year — for the bar chart on the left
    //    of "Same Cohort Progression". A patient counts toward a year's
    //    "N+" bucket if they had ≥N consults in that year (and were a
    //    repeat patient overall).
    const cohortRows = await safeQuery(
      () =>
        dwQuery<{ year: string; threshold: string; count: string }>(
          `
          WITH repeat_uhids AS (
            SELECT a.uhid
            FROM ${KPI_TABLE} a
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY a.uhid
            HAVING SUM(a.total_consult_count) >= ${f.minVisits}
          ),
          per_uhid_year AS (
            SELECT
              EXTRACT(YEAR FROM a.consult_date)::int::text AS year,
              a.uhid,
              SUM(a.total_consult_count)::int AS vc_year
            FROM ${KPI_TABLE} a
            INNER JOIN repeat_uhids r ON r.uhid = a.uhid
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY 1, 2
          )
          SELECT year, '3+' AS threshold, COUNT(*)::bigint AS count FROM per_uhid_year WHERE vc_year >= 3 GROUP BY year
          UNION ALL
          SELECT year, '4+', COUNT(*)::bigint FROM per_uhid_year WHERE vc_year >= 4 GROUP BY year
          UNION ALL
          SELECT year, '5+', COUNT(*)::bigint FROM per_uhid_year WHERE vc_year >= 5 GROUP BY year
          UNION ALL
          SELECT year, '6+', COUNT(*)::bigint FROM per_uhid_year WHERE vc_year >= 6 GROUP BY year
          ORDER BY year DESC, threshold
          `,
          kpiWhere.params,
          HEAVY_OPTS
        ),
      "cohortFrequency"
    );

    // ── ⑥ BMI Sankey from vitals. Per repeat-uhid, take the first 3
    //    BMI readings, bucket by WHO cut-offs, count transitions
    //    Visit 1→Visit 2 and Visit 2→Visit 3.
    type BmiPairRow = { from_visit: string; from_bucket: string; to_bucket: string; transitions: string };
    const bmiPairRows = await safeQuery(
      () =>
        dwQuery<BmiPairRow>(
          `
          WITH repeat_uhids AS (
            SELECT a.uhid
            FROM ${KPI_TABLE} a
            WHERE ${kpiWhere.where} AND a.stage = 'Completed'
            GROUP BY a.uhid
            HAVING SUM(a.total_consult_count) >= ${f.minVisits}
          ),
          bmi_series AS (
            SELECT
              v.uhid,
              v.vital_value,
              ${BMI_BUCKET_CASE} AS bucket,
              ROW_NUMBER() OVER (PARTITION BY v.uhid ORDER BY v.slotstarttime) AS visit_n
            FROM ${VITALS_TABLE} v
            INNER JOIN repeat_uhids r ON r.uhid = v.uhid
            WHERE ${vitalsWhere.where}
              AND v.vital_parameter_name = 'BMI'
              AND v.vital_value IS NOT NULL
              AND v.vital_value BETWEEN 5 AND 80  -- defensive: ignore garbage values
          ),
          bmi_pairs AS (
            SELECT
              uhid,
              visit_n,
              bucket AS from_bucket,
              LEAD(bucket) OVER (PARTITION BY uhid ORDER BY visit_n) AS to_bucket
            FROM bmi_series
            WHERE visit_n <= 3
          )
          SELECT
            visit_n::text AS from_visit,
            from_bucket,
            to_bucket,
            COUNT(*)::bigint AS transitions
          FROM bmi_pairs
          WHERE to_bucket IS NOT NULL
            AND visit_n IN (1, 2)
          GROUP BY 1, 2, 3
          ORDER BY 1, 2, 3
          `,
          kpiWhere.params,
          HEAVY_OPTS
        ),
      "bmiSankey"
    );

    // ────────────────────────────────────────────────────────────────
    // Compose response — shape-compatible with the existing React page.
    // ────────────────────────────────────────────────────────────────

    type StatMap = Record<string, Record<string, number>>;
    // minVisits is now applied upstream so the rows carry a single `n`
    // column — no need to slice by vc threshold.
    const stats: StatMap = {};
    for (const r of patientStatsRows) {
      if (!stats[r.kind]) stats[r.kind] = {};
      stats[r.kind][r.bucket] = Number(r.n || 0);
    }

    const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];
    const FREQ_ORDER = ["1", "2-4", "5-9", "10+"];

    function buildDemographics(s: StatMap) {
      const ageMap = s.ageGroup || {};
      const ageGroups = AGE_ORDER.filter((b) => ageMap[b]).map((b) => ({ label: b, count: ageMap[b] }));

      const genderMap = s.gender || {};
      const genderSplit = ["Male", "Female", "Others"]
        .filter((g) => genderMap[g])
        .map((g) => ({ label: g, count: genderMap[g] }));

      const locationDistribution = Object.entries(s.location || {})
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      const segMap = s.segment || {};
      const acc: Record<string, { male: number; female: number; others: number }> = {};
      for (const key of Object.keys(segMap)) {
        const parts = key.split("|");
        if (parts.length !== 2) continue;
        const ageBucket = parts[0];
        const genderBucket = parts[1];
        const n = segMap[key] || 0;
        if (!acc[ageBucket]) acc[ageBucket] = { male: 0, female: 0, others: 0 };
        if (genderBucket === "Male") acc[ageBucket].male += n;
        else if (genderBucket === "Female") acc[ageBucket].female += n;
        else acc[ageBucket].others += n;
      }
      const ageGenderPyramid = AGE_ORDER
        .filter((b) => acc[b])
        .map((b) => ({
          ageGroup: b,
          male: acc[b].male,
          female: acc[b].female,
          others: acc[b].others,
          total: acc[b].male + acc[b].female + acc[b].others,
        }));

      return { ageGroups, genderSplit, locationDistribution, ageGenderPyramid };
    }

    function withLocationRollup(loc: Array<{ label: string; count: number }>) {
      const TOP_N = 10;
      const top = loc.slice(0, TOP_N);
      const tail = loc.slice(TOP_N);
      const tailSum = tail.reduce((s, r) => s + r.count, 0);
      return {
        locationDistribution: tailSum > 0 ? [...top, { label: "Others", count: tailSum }] : top,
        othersBreakdown: tail.map((r) => ({ location: r.label, total: r.count })),
      };
    }

    function buildRepeatUserSegments(s: StatMap) {
      // Tenure rows are emitted with bucket = "<tenure>|<chronic|notchronic>".
      // We sum chronic + notchronic per tenure to get the total patient
      // count, and keep `chronic.count` for the chronic-only stat shown
      // in the React side. The legacy `acute` field is kept zeroed so
      // existing typed reads don't blow up.
      const segPatients: Record<string, { chronic: number; total: number }> = {
        "1 year": { chronic: 0, total: 0 },
        "2 years": { chronic: 0, total: 0 },
        "3+ years": { chronic: 0, total: 0 },
      };
      const segVisits: Record<string, number> = { "1 year": 0, "2 years": 0, "3+ years": 0 };
      for (const [key, v] of Object.entries(s.tenure || {})) {
        const [label, kind] = key.split("|");
        if (segPatients[label]) {
          segPatients[label].total += v;
          if (kind === "chronic") segPatients[label].chronic += v;
        }
      }
      for (const [k, v] of Object.entries(s.tenureVisits || {})) {
        if (segVisits[k] !== undefined) segVisits[k] = v;
      }
      return (["1 year", "2 years", "3+ years"] as const).map((label) => {
        const total = segPatients[label].total;
        const chronic = segPatients[label].chronic;
        const visits = segVisits[label] || 0;
        const tenureYears = label === "3+ years" ? 3 : label === "2 years" ? 1.5 : 0.5;
        const visitsPerYear = total > 0 ? Math.round((visits / total / tenureYears) * 10) / 10 : 0;
        const chronicPct = total > 0 ? Math.round((chronic / total) * 100) : 0;
        return {
          label,
          patients: total,
          avgNps: 0,
          visitsPerYear,
          responseRate: 0,
          chronic: { count: chronic, pct: chronicPct, nps: 0 },
          acute: { count: total - chronic, pct: 100 - chronicPct, nps: 0 },
        };
      });
    }

    // Compose the single-cohort payload (no slices anymore — minVisits is
    // applied upstream).
    const totalRepeatPatients = stats.kpi?.totalRepeatPatients || 0;
    const totalConsultsByRepeat = stats.kpi?.totalConsultsByRepeat || 0;
    const frequentRepeaters = stats.kpi?.frequentRepeaters || 0;
    const avgVisitFrequencyNum = (stats.kpi?.avgVisitFrequencyX10 || 0) / 10;

    const demo = buildDemographics(stats);
    const loc = withLocationRollup(demo.locationDistribution);

    const freqMap = stats.visitFreq || {};
    const sameMap = stats.visitFreqSame || {};
    const diffMap = stats.visitFreqDiff || {};
    const repeatVisitFrequency = FREQ_ORDER
      .filter((b) => freqMap[b])
      .map((b) => ({
        bucket: `${b} Visits`,
        label: `${b} Visits`,
        count: freqMap[b] || 0,
        sameSpecialty: sameMap[b] || 0,
        differentSpecialty: diffMap[b] || 0,
      }));

    const repeatUserSegments = buildRepeatUserSegments(stats);

    const kpis = {
      totalRepeatPatients,
      avgVisitFrequency: avgVisitFrequencyNum,
      totalConsultsByRepeat,
      avgNps: 0,
      frequentRepeaters,
      avgFrequency: avgVisitFrequencyNum.toFixed(1),
      repeatRate: 0,
      lsmpEnrolled: 0,
    };

    // ── Chronic-vs-Acute headline.
    const ca = chronicAcuteRows[0];
    const chronicVsAcute = {
      chronic: Number(ca?.chronic || 0),
      acute: Number(ca?.acute || 0),
    };

    // ── Specialty treemap — collapse rows into All + per-year maps.
    const specialtyTreemap: Record<string, Array<{ name: string; value: number }>> = { All: [] };
    const allTotals: Record<string, number> = {};
    const yearTotals: Record<string, Record<string, number>> = {};
    for (const r of specialtyRows) {
      const sp = r.speciality;
      const yr = r.year;
      const n = Number(r.count);
      allTotals[sp] = (allTotals[sp] || 0) + n;
      if (!yearTotals[yr]) yearTotals[yr] = {};
      yearTotals[yr][sp] = (yearTotals[yr][sp] || 0) + n;
    }
    specialtyTreemap.All = Object.entries(allTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 25);
    for (const yr of Object.keys(yearTotals)) {
      specialtyTreemap[yr] = Object.entries(yearTotals[yr])
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 25);
    }
    const treemapYears = ["All", ...Object.keys(yearTotals).sort((a, b) => Number(b) - Number(a))];

    // ── Recurring conditions (chronic only). Keep an empty `acute` array
    //    for back-compat shape — page only reads `.chronic`.
    const recurringConditions: {
      chronic: Array<{ name: string; count: number; patients: number }>;
      acute: Array<{ name: string; count: number; patients: number }>;
    } = { chronic: [], acute: [] };
    for (const r of recurringRows) {
      recurringConditions.chronic.push({
        name: r.condition,
        count: Number(r.total_occurrences),
        patients: Number(r.patients),
      });
    }


    // ── Cohort visit-frequency: shape it as { [year]: [{threshold, count}, ...] }.
    const cohortVisitFrequency: Record<string, Array<{ threshold: string; count: number }>> = {};
    const yearsSeen = new Set<string>();
    for (const r of cohortRows) {
      yearsSeen.add(r.year);
      if (!cohortVisitFrequency[r.year]) cohortVisitFrequency[r.year] = [];
      cohortVisitFrequency[r.year].push({ threshold: r.threshold, count: Number(r.count) });
    }
    const cohortYears = Array.from(yearsSeen).sort((a, b) => Number(b) - Number(a));

    // ── Sankey nodes + links from BMI transitions.
    //    Nodes are named "Visit N - <bucket>"; links carry source→target
    //    indices into the nodes array along with `value`. ECharts on the
    //    page reads { name }, { source, target, value }.
    const BMI_BUCKETS = ["Above Normal", "In Range", "Below Normal"] as const;
    type BmiBucket = typeof BMI_BUCKETS[number];
    const VISITS = [1, 2, 3] as const;
    const nodes: Array<{ name: string }> = [];
    const nodeIdx: Record<string, number> = {};
    for (const v of VISITS) {
      for (const b of BMI_BUCKETS) {
        const name = `Visit ${v} - ${b}`;
        nodeIdx[name] = nodes.length;
        nodes.push({ name });
      }
    }
    const links: Array<{ source: number; target: number; value: number }> = [];
    for (const r of bmiPairRows) {
      const fromV = Number(r.from_visit);
      const toV = fromV + 1;
      const from = `Visit ${fromV} - ${r.from_bucket}`;
      const to = `Visit ${toV} - ${r.to_bucket}`;
      const s = nodeIdx[from];
      const t = nodeIdx[to];
      if (s === undefined || t === undefined) continue;
      links.push({ source: s, target: t, value: Number(r.transitions) });
    }
    const sankeyFlow = { nodes, links };

    return NextResponse.json({
      kpis,
      charts: {
        demographics: {
          ageGroups: demo.ageGroups,
          ageGenderPyramid: demo.ageGenderPyramid,
          genderSplit: demo.genderSplit,
          locationDistribution: loc.locationDistribution,
          othersBreakdown: loc.othersBreakdown,
        },
        repeatVisitFrequency,
        repeatUserSegments,
        chronicVsAcute,
        specialtyTreemap,
        treemapYears,
        recurringConditions,
        // Vital-trend supplementary fields kept empty — UI doesn't render
        // them after the chronic-only refactor.
        conditionTransitions: [],
        visitFrequencyNps: [],
        sankeyFlow,
        vitalTotals: { v1: {}, v2: {}, v3: {} },
        cohortVisitFrequency,
        cohortYears,
      },
      lastUpdated: new Date().toISOString(),
      meta: { hadErrors: failedQueries.length > 0, failedQueries },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC Repeat Visits API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

/**
 * Each query references TWO source WHERE clauses (kpiWhere on `a` and
 * diagWhere on `d` / vitalsWhere on `v`) inside CTEs. The two clauses
 * share `$1` (cugCode) and may share other placeholder indices, so we
 * can't just concat their params arrays — pg would receive the wrong
 * binding count.
 *
 * Trick we use: every clause is built independently against placeholder
 * indices that start at `$1`. To run them together we duplicate the
 * params array — both clauses will re-bind the same $N indices, which
 * pg accepts because the values are identical (we always pass the SAME
 * cugCode, date range, etc.).
 *
 * `mergeParams` returns just one copy because the WHERE strings still
 * reference `$1..$N` literally, and pg's parameter binding is positional.
 * If the two clauses produced different placeholder counts we'd need to
 * renumber — for now both routes through `buildWhere` produce the same
 * indices for the same filter set, so this is safe.
 */
function mergeParams(
  a: { params: unknown[] },
  _b: { params: unknown[] }
): { params: unknown[] } {
  // Both calls were built from the same FilterShape + cugCode so their
  // params arrays are identical position-for-position. Use just one.
  return { params: a.params };
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "ohc/repeat-visits" }),
  PROVENANCE
);
