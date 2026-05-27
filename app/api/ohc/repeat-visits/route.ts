import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

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
 *     parameter readings keyed by uhid + vitals_creation_time. We pull
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

const MIN_VISITS = [2, 3, 4, 5] as const;

interface FilterShape {
  dateFrom: string | null;
  dateTo: string | null;
  ageGroups: string[];
  genders: string[];
  locations: string[];
}

function readFilters(searchParams: URLSearchParams): FilterShape {
  return {
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    ageGroups: searchParams.get("ageGroups")?.split(",").filter(Boolean) ?? [],
    genders: searchParams.get("genders")?.split(",").filter(Boolean) ?? [],
    locations: searchParams.get("locations")?.split(",").filter(Boolean) ?? [],
  };
}

/**
 * Build the WHERE clause + params array for a given source table.
 * `alias` is the table alias (e.g. "a" for agg_kpi, "d" for agg_diagnosis,
 * "v" for vitals). `dateColumn` is the date column on that table to
 * filter by (consult_date / last_diagnosis_date / vitals_creation_time).
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
    const diagWhere = buildWhere("d", "last_diagnosis_date", cugCode, f, {
      ageGroupCase: AGE_GROUP_CASE_DIAG,
    });
    // vitals carries age too; same banding.
    const AGE_GROUP_CASE_VITALS = AGE_GROUP_CASE_KPI.replace(/a\.age/g, "v.age");
    const vitalsWhere = buildWhere("v", "vitals_creation_time", cugCode, f, {
      ageGroupCase: AGE_GROUP_CASE_VITALS,
    });

    // ── ① Big consolidated per_uhid scan on agg_kpi.
    //    Joined to chronic_uhids (derived from agg_diagnosis in the same
    //    window) for the has_chronic flag. All slice-independent aggregates
    //    — demographics, visit-frequency, tenure, segment buckets — flow
    //    from this single result set.
    type StatRow = { kind: string; bucket: string } & Record<string, string>;
    const filterCol = (template: (filter: string) => string, vc: number, extraWhere?: string) => {
      const extra = extraWhere ? ` AND ${extraWhere}` : "";
      const filter = `FILTER (WHERE vc >= ${vc}${extra})`;
      return `${template(filter)}::bigint AS n${vc}`;
    };
    const allCols = (template: (filter: string) => string, extra?: string) =>
      MIN_VISITS.map((vc) => filterCol(template, vc, extra)).join(",\n  ");

    // NOTE on params: every query below references the same FilterShape +
    // cugCode, so kpiWhere.params, diagWhere.params, vitalsWhere.params are
    // all positionally identical. The SQL strings reference $1..$N
    // literally and pg binds positionally, so we pass one copy.
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
            HAVING SUM(a.total_consult_count) >= 2
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
          SELECT 'kpi' AS kind, 'totalRepeatPatients' AS bucket,
            ${allCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid
          UNION ALL
          SELECT 'kpi', 'totalConsultsByRepeat',
            ${allCols((f) => `COALESCE(SUM(vc) ${f}, 0)`)}
          FROM per_uhid
          UNION ALL
          SELECT 'kpi', 'avgVisitFrequencyX10',
            ${allCols((f) => `ROUND(COALESCE(AVG(vc) ${f}, 0) * 10)`)}
          FROM per_uhid
          UNION ALL
          SELECT 'kpi', 'frequentRepeaters',
            ${MIN_VISITS.map(
              (vc) => `COUNT(*) FILTER (WHERE vc >= 5)::bigint AS n${vc}`
            ).join(",\n  ")}
          FROM per_uhid
          UNION ALL
            SELECT 'ageGroup', CASE
              WHEN age_years < 20 THEN '<20'
              WHEN age_years BETWEEN 20 AND 35 THEN '20-35'
              WHEN age_years BETWEEN 36 AND 40 THEN '36-40'
              WHEN age_years BETWEEN 41 AND 60 THEN '41-60'
              WHEN age_years > 60 THEN '61+'
              ELSE 'Unknown' END,
              ${allCols((f) => `COUNT(*) ${f}`)}
            FROM per_uhid WHERE age_years IS NOT NULL GROUP BY 2
          UNION ALL
            SELECT 'gender', CASE
              WHEN LOWER(TRIM(gender)) IN ('male','m') THEN 'Male'
              WHEN LOWER(TRIM(gender)) IN ('female','f') THEN 'Female'
              ELSE 'Others' END,
              ${allCols((f) => `COUNT(*) ${f}`)}
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'visitFreq', CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END,
              ${allCols((f) => `COUNT(*) ${f}`)}
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'visitFreqSame', CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END,
              ${allCols((f) => `COUNT(*) ${f}`, "spec_count <= 1")}
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'visitFreqDiff', CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END,
              ${allCols((f) => `COUNT(*) ${f}`, "spec_count >= 2")}
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'location', COALESCE(NULLIF(TRIM(facility), ''), 'Unknown'),
              ${allCols((f) => `COUNT(*) ${f}`)}
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
              ${allCols((f) => `COUNT(*) ${f}`)}
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'tenure',
              (CASE
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 2 THEN '3+ years'
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 1 THEN '2 years'
                ELSE '1 year' END)
              || '|' || (CASE WHEN has_chronic THEN 'chronic' ELSE 'notchronic' END),
              ${allCols((f) => `COUNT(*) ${f}`)}
            FROM per_uhid GROUP BY 2
          UNION ALL
            SELECT 'tenureVisits',
              CASE
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 2 THEN '3+ years'
                WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 1 THEN '2 years'
                ELSE '1 year' END,
              ${allCols((f) => `COALESCE(SUM(vc) ${f}, 0)`)}
            FROM per_uhid GROUP BY 2
          `,
          // patientStats query uses both kpiWhere and diagWhere placeholders.
          // We zip params: kpiWhere.params first, then diagWhere.params, but
          // both start with $1=cugCode. We use a different parameter binding:
          // since both clauses reference $1, we'll concat all params from
          // kpiWhere then renumber diagWhere placeholders to start fresh.
          // Simpler: replicate cugCode in both branches by using two
          // parameter slots. To keep this readable we rebuild diagWhere's
          // WHERE inline below with fresh $N indices.
          // ↑ Comment above is informational — the actual workaround is in
          //    `mergedParams` below.
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
            HAVING SUM(a.total_consult_count) >= 2
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
            HAVING SUM(a.total_consult_count) >= 2
          )
          SELECT
            d.icd_description AS condition,
            COUNT(DISTINCT d.uhid)::bigint AS patients,
            SUM(d.total_diagnosis_records)::bigint AS total_occurrences
          FROM ${DIAG_TABLE} d
          INNER JOIN repeat_uhids r ON r.uhid = d.uhid
          WHERE ${diagWhere.where}
            AND LOWER(d.status) IN ('chronic', 'acute or chronic')
            AND d.icd_description IS NOT NULL
            AND TRIM(d.icd_description) <> ''
          GROUP BY d.icd_description
          HAVING SUM(d.total_diagnosis_records) >= 2
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
            HAVING SUM(a.total_consult_count) >= 2
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
            HAVING SUM(a.total_consult_count) >= 2
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
            HAVING SUM(a.total_consult_count) >= 2
          ),
          bmi_series AS (
            SELECT
              v.uhid,
              v.vital_value,
              ${BMI_BUCKET_CASE} AS bucket,
              ROW_NUMBER() OVER (PARTITION BY v.uhid ORDER BY v.vitals_creation_time) AS visit_n
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
    const colKey = (vc: number) => `n${vc}`;
    function bucketByVc(rows: StatRow[], vc: number): StatMap {
      const map: StatMap = {};
      for (const r of rows) {
        if (!map[r.kind]) map[r.kind] = {};
        map[r.kind][r.bucket] = Number(r[colKey(vc)] || 0);
      }
      return map;
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

    function buildRepeatUserSegments(rows: StatRow[], vc: number) {
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
      const col = colKey(vc);
      for (const r of rows) {
        const v = Number(r[col] || 0);
        if (r.kind === "tenure") {
          const [label, kind] = r.bucket.split("|");
          if (segPatients[label]) {
            segPatients[label].total += v;
            if (kind === "chronic") segPatients[label].chronic += v;
          }
        } else if (r.kind === "tenureVisits") {
          if (segVisits[r.bucket] !== undefined) segVisits[r.bucket] = v;
        }
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

    function buildSlice(vc: number) {
      const stats = bucketByVc(patientStatsRows, vc);

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

      const repeatUserSegments = buildRepeatUserSegments(patientStatsRows, vc);

      return {
        kpis: {
          totalRepeatPatients,
          avgVisitFrequency: avgVisitFrequencyNum,
          totalConsultsByRepeat,
          avgNps: 0,
          frequentRepeaters,
          avgFrequency: avgVisitFrequencyNum.toFixed(1),
          repeatRate: 0,
          lsmpEnrolled: 0,
        },
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
        },
      };
    }

    type SlicePayload = ReturnType<typeof buildSlice>;
    const slices: Record<string, SlicePayload> = {};
    for (const vc of MIN_VISITS) {
      slices[`all_${vc}`] = buildSlice(vc);
    }
    const defaultSlice = slices["all_2"];

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
      kpis: defaultSlice.kpis,
      charts: {
        ...defaultSlice.charts,
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
      slices,
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

export const GET = withCache(handler, { endpoint: "ohc/repeat-visits" });
