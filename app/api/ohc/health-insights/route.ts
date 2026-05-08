import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Health Insights API — sourced from aggregated_table.agg_diagnosis
 * (the freshly prepared chronic-aware fact table).
 *
 * Columns we use: cug_code_mapped, last_diagnosis_date,
 * first_diagnosis_date, facility_mapping, uhid, age, patient_gender,
 * status, category, icd_code, icd_description, total_diagnosis_records,
 * encounter_count.
 *
 * Row grain: ONE row per (uhid × icd_code). total_diagnosis_records is
 * the visit count for that combo, encounter_count is the distinct
 * encounter count. So "total consults" must come from
 * SUM(total_diagnosis_records), NOT COUNT(*).
 *
 * Key column semantics (per product):
 *   uhid               — unique patient identifier
 *   category           — chronic ICD parent category (used directly,
 *                        no regex derivation)
 *   icd_description    — chronic ICD subcategory / condition name
 *   status             — 'Chronic' / 'Acute or Chronic' / 'Acute' /
 *                        'Not Applicable' (used directly for chronic
 *                        filtering, no description regex)
 *
 * No vitals / no symptoms — vitalsTrend and symptomMapping are
 * returned empty.
 * ──────────────────────────────────────────────────────────────────── */

const DIAG_TABLE = "aggregated_table.agg_diagnosis";

// Native chronic flag — was a description regex before the new schema
// landed. "Acute or Chronic" rolls up into chronic per product.
const CHRONIC_CASE = `(LOWER(d.status) IN ('chronic', 'acute or chronic'))`;

// Native parent category — was a regex switch on icd_description before
// the new schema landed. Wrap in COALESCE so NULL/empty rows still
// land in a valid bucket.
const CATEGORY_CASE = `COALESCE(NULLIF(TRIM(d.category), ''), 'Other')`;

const AGE_GROUP_CASE = `CASE
  WHEN d.age < 20 THEN '<20'
  WHEN d.age BETWEEN 20 AND 35 THEN '20-35'
  WHEN d.age BETWEEN 36 AND 40 THEN '36-40'
  WHEN d.age BETWEEN 41 AND 60 THEN '41-60'
  WHEN d.age > 60 THEN '61+'
END`;

const GENDER_NORM = `CASE
  WHEN LOWER(TRIM(d.patient_gender)) IN ('male','m') THEN 'Male'
  WHEN LOWER(TRIM(d.patient_gender)) IN ('female','f') THEN 'Female'
  ELSE 'Others'
END`;

function buildWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const year = searchParams.get("year");
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const conditions = searchParams.get("conditions")?.split(",").filter(Boolean);
  const conditionType = searchParams.get("conditionType"); // 'chronic' | 'acute' | 'all'

  const where: string[] = [`d.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (year && /^\d{4}$/.test(year)) {
    where.push(`EXTRACT(YEAR FROM d.last_diagnosis_date) = ${Number(year)}`);
  }
  if (dateFrom) {
    where.push(`d.last_diagnosis_date >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    where.push(`d.last_diagnosis_date <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    where.push(`d.facility_mapping = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(d.patient_gender)) IN ('male','m')";
      if (l === "female") return "LOWER(TRIM(d.patient_gender)) IN ('female','f')";
      return "(LOWER(TRIM(d.patient_gender)) NOT IN ('male','m','female','f') OR d.patient_gender IS NULL)";
    });
    where.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    where.push(`${AGE_GROUP_CASE} = ANY($${idx})`);
    params.push(ageGroups);
    idx++;
  }
  if (conditions?.length) {
    where.push(`d.icd_description = ANY($${idx})`);
    params.push(conditions);
    idx++;
  }
  if (conditionType === "chronic") where.push(CHRONIC_CASE);
  else if (conditionType === "acute") where.push(`NOT ${CHRONIC_CASE}`);

  return { params, where: where.join(" AND ") };
}

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) return NextResponse.json({ error: "No client selected" }, { status: 400 });

    const q = buildWhere(searchParams, cugCode);
    const selectedCategory = searchParams.get("category") || null;
    const selectedCondition = searchParams.get("condition") || null;

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Health Insights query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // agg_diagnosis is ~33M rows (22.9M for HCLT001). Default 15s timeout is
    // far too low for the heavy aggregations; bump per-query.
    const HEAVY_OPTS = { statementTimeoutMs: 120000 };

    // Demo queries are scoped — when a category is picked they group by
    // condition (icd_description) within that category; when a single
    // condition is selected they group by that one icd; otherwise by
    // category. Avoids enormous result sets.
    const demoCategoryFilter = selectedCategory
      ? `AND ${CATEGORY_CASE} = $${q.params.length + 1}`
      : "";
    const demoCategoryParams = selectedCategory
      ? [...q.params, selectedCategory]
      : q.params;
    const demoConditionFilter = selectedCondition
      ? `AND d.icd_description = $${q.params.length + 1}`
      : "";
    const demoConditionParams = selectedCondition
      ? [...q.params, selectedCondition]
      : q.params;

    const demoKeyExpr = (selectedCategory || selectedCondition)
      ? "d.icd_description"
      : `${CATEGORY_CASE}`;
    const demoExtraFilter = selectedCondition
      ? demoConditionFilter
      : selectedCategory
        ? demoCategoryFilter
        : "";
    const demoExtraParams = selectedCondition
      ? demoConditionParams
      : selectedCategory
        ? demoCategoryParams
        : q.params;

    const [
      categoryRows,
      conditionRows,
      conditionsByCategoryRows,
      chronicAcuteRows,
      demoMatrixRows,
      coOccurrenceVennRows,
      pairsRows,
      yearsRows,
      facilitiesRows,
      conditionTrendsRows,
      seasonalRows,
      seasonalTrendsRows,
    ] = await Promise.all([
      // 1) categoryTreemap — visit counts per category. SUM the row's
      //    total_diagnosis_records since each row is one (uhid, icd) combo.
      safeQuery(
        () => dwQuery<{ category: string; count: string; patients: string }>(
          `SELECT
             ${CATEGORY_CASE} AS category,
             COALESCE(SUM(d.total_diagnosis_records), 0)::bigint AS count,
             COUNT(DISTINCT d.uhid)::bigint AS patients
           FROM ${DIAG_TABLE} d
           WHERE ${q.where} AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
           GROUP BY 1
           ORDER BY 2 DESC`,
          q.params,
          HEAVY_OPTS
        ),
        "categoryTreemap"
      ),
      // 2) conditionBreakdown — top N icds (filtered to selectedCategory if any)
      safeQuery(
        () => dwQuery<{ name: string; count: string; patients: string }>(
          `SELECT
             d.icd_description AS name,
             COALESCE(SUM(d.total_diagnosis_records), 0)::bigint AS count,
             COUNT(DISTINCT d.uhid)::bigint AS patients
           FROM ${DIAG_TABLE} d
           WHERE ${q.where} AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
             ${selectedCategory ? `AND ${CATEGORY_CASE} = $${q.params.length + 1}` : ""}
           GROUP BY 1
           ORDER BY 2 DESC
           LIMIT 20`,
          selectedCategory ? [...q.params, selectedCategory] : q.params,
          HEAVY_OPTS
        ),
        "conditionBreakdown"
      ),
      // 2b) conditionsByCategory — every (category, icd) combo with counts.
      // Powers the Condition Share Distribution table's expandable rows
      // so all categories' subcategories load in a single payload (no
      // per-row fetch on expand).
      safeQuery(
        () => dwQuery<{ category: string; name: string; count: string; patients: string }>(
          `SELECT
             ${CATEGORY_CASE} AS category,
             d.icd_description  AS name,
             COALESCE(SUM(d.total_diagnosis_records), 0)::bigint AS count,
             COUNT(DISTINCT d.uhid)::bigint AS patients
           FROM ${DIAG_TABLE} d
           WHERE ${q.where} AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
           GROUP BY 1, 2
           ORDER BY 1, 3 DESC`,
          q.params,
          HEAVY_OPTS
        ),
        "conditionsByCategory"
      ),
      // 3) chronicAcute split (rows + distinct patients).
      //    `COUNT(DISTINCT uhid) FILTER (...)` is too slow on the raw 80M-row
      //    fact table (≈42 s on HCLT001), so we pre-aggregate per uhid in a
      //    CTE and then count flags. Same numbers, ~5s instead of ~42s.
      safeQuery(
        () => dwQuery<{ chronic_count: string; chronic_patients: string; acute_count: string; acute_patients: string }>(
          `WITH per_uhid AS (
            SELECT
              d.uhid,
              COALESCE(SUM(d.total_diagnosis_records) FILTER (WHERE ${CHRONIC_CASE}), 0)::bigint AS chronic_rows,
              COALESCE(SUM(d.total_diagnosis_records) FILTER (WHERE NOT ${CHRONIC_CASE}), 0)::bigint AS acute_rows,
              BOOL_OR(${CHRONIC_CASE}) AS has_chronic,
              BOOL_OR(NOT ${CHRONIC_CASE}) AS has_acute
            FROM ${DIAG_TABLE} d
            WHERE ${q.where} AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
            GROUP BY d.uhid
          )
          SELECT
            COALESCE(SUM(chronic_rows), 0)::bigint AS chronic_count,
            COUNT(*) FILTER (WHERE has_chronic)::bigint AS chronic_patients,
            COALESCE(SUM(acute_rows), 0)::bigint AS acute_count,
            COUNT(*) FILTER (WHERE has_acute)::bigint AS acute_patients
          FROM per_uhid`,
          q.params,
          HEAVY_OPTS
        ),
        "chronicAcute"
      ),
      // 4-5b) demoAge / demoGender / demoLocation — consolidated.
      //   Three GROUP BY queries against agg_diagnosis become one CTE-driven
      //   pass: scan + categorize once, then emit three UNION-ALL'd
      //   aggregates tagged by `dim`. The page splits them apart by tag.
      //   Cuts wall-clock by ~3x and avoids 60s timeout under parallel load.
      safeQuery(
        () => dwQuery<{ dim: string; key: string; bucket: string; count: string }>(
          `WITH base AS (
            SELECT
              ${demoKeyExpr} AS key,
              ${AGE_GROUP_CASE} AS age_bucket,
              ${GENDER_NORM} AS gender_bucket,
              COALESCE(NULLIF(TRIM(d.facility_mapping), ''), 'Unknown') AS loc_bucket,
              d.age,
              d.total_diagnosis_records AS visits
            FROM ${DIAG_TABLE} d
            WHERE ${q.where}
              AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
              -- Health Insights is now a chronic-only surface; restrict the
              -- demographic matrix to chronic-flagged diagnoses so the
              -- breakdown reflects long-term condition load only.
              AND ${CHRONIC_CASE}
              ${demoExtraFilter}
          )
          SELECT 'age' AS dim, key, age_bucket AS bucket, COALESCE(SUM(visits), 0)::bigint AS count
          FROM base WHERE age IS NOT NULL AND age_bucket IS NOT NULL
          GROUP BY 1, 2, 3
          UNION ALL
          SELECT 'gender' AS dim, key, gender_bucket AS bucket, COALESCE(SUM(visits), 0)::bigint AS count
          FROM base WHERE gender_bucket IS NOT NULL
          GROUP BY 1, 2, 3
          UNION ALL
          SELECT 'location' AS dim, key, loc_bucket AS bucket, COALESCE(SUM(visits), 0)::bigint AS count
          FROM base
          GROUP BY 1, 2, 3`,
          demoExtraParams,
          HEAVY_OPTS
        ),
        "demoMatrix"
      ),
      // 5c) coOccurrenceVenn — for a list of selected chronic ICD parent
      // categories (capped at 3), returns the unique-UHID count per
      // subset (single category, pair, all-overlap) plus the age × gender
      // breakdown of the all-overlap intersection. Powers the Co-Occurrence
      // venn-diagram chart. Empty array when fewer than 1 category picked.
      (() => {
        const raw = searchParams.get("coOccurrenceCategories")?.split(",").map((s) => s.trim()).filter(Boolean) || [];
        // De-dupe + cap at 3 to keep the SQL bounded (8 subsets max).
        const cats = Array.from(new Set(raw)).slice(0, 3);
        if (cats.length === 0) return Promise.resolve([] as Array<{ kind: string; bucket: string; n: string }>);
        return safeQuery(
          () => {
            const flagCols = cats.map((_, i) => {
              const paramIdx = q.params.length + 1 + i;
              return `BOOL_OR(${CATEGORY_CASE} = $${paramIdx} AND ${CHRONIC_CASE}) AS in_${i}`;
            }).join(",\n              ");
            // bitmask = in_0 + in_1*2 + in_2*4 (only the indices we have).
            const bitmask = cats.map((_, i) => `in_${i}::int * ${1 << i}`).join(" + ");
            const anyIn = cats.map((_, i) => `in_${i}`).join(" OR ");
            const allIn = cats.map((_, i) => `in_${i}`).join(" AND ");
            return dwQuery<{ kind: string; bucket: string; n: string }>(
              `WITH per_uhid AS (
                SELECT
                  d.uhid,
                  ${flagCols},
                  MAX(${AGE_GROUP_CASE}) AS age_bucket,
                  ${GENDER_NORM} AS gender_bucket
                FROM ${DIAG_TABLE} d
                WHERE ${q.where}
                  AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
                GROUP BY d.uhid, ${GENDER_NORM}
              )
              SELECT 'subset' AS kind, (${bitmask})::text AS bucket, COUNT(*)::bigint AS n
              FROM per_uhid WHERE ${anyIn}
              GROUP BY 1, 2
              UNION ALL
              SELECT 'overlapAge', age_bucket, COUNT(*)::bigint
              FROM per_uhid WHERE ${allIn} AND age_bucket IS NOT NULL
              GROUP BY 1, 2
              UNION ALL
              SELECT 'overlapGender', gender_bucket, COUNT(*)::bigint
              FROM per_uhid WHERE ${allIn} AND gender_bucket IS NOT NULL
              GROUP BY 1, 2`,
              [...q.params, ...cats],
              HEAVY_OPTS
            );
          },
          "coOccurrenceVenn"
        );
      })(),
      // 6) diseaseCombinations — pairs of distinct diagnoses on same uhid,
      //    with gender split per pair (Male/Female counts)
      safeQuery(
        () => dwQuery<{ a: string; b: string; total: string; male: string; female: string }>(
          `WITH distinct_dx AS (
            SELECT DISTINCT d.uhid, d.icd_description, d.patient_gender
            FROM ${DIAG_TABLE} d
            WHERE ${q.where}
              AND d.icd_description IS NOT NULL
              AND TRIM(d.icd_description) <> ''
              AND ${CHRONIC_CASE}
          )
          SELECT
            d1.icd_description AS a,
            d2.icd_description AS b,
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE LOWER(TRIM(d1.patient_gender)) IN ('male','m'))::bigint   AS male,
            COUNT(*) FILTER (WHERE LOWER(TRIM(d1.patient_gender)) IN ('female','f'))::bigint AS female
          FROM distinct_dx d1
          JOIN distinct_dx d2 ON d2.uhid = d1.uhid AND d1.icd_description < d2.icd_description
          GROUP BY 1, 2
          HAVING COUNT(*) >= 5
          ORDER BY total DESC
          LIMIT 12`,
          q.params,
          HEAVY_OPTS
        ),
        "diseaseCombinations"
      ),
      // 7) years dropdown — derived from MIN/MAX(last_diagnosis_date) for
      //    the cug. MIN/MAX is much cheaper than `SELECT DISTINCT EXTRACT(YEAR ...)`
      //    on the agg_diagnosis fact table.
      safeQuery(
        () => dwQuery<{ min_y: number | null; max_y: number | null }>(
          `SELECT
             EXTRACT(YEAR FROM MIN(d.last_diagnosis_date))::int AS min_y,
             EXTRACT(YEAR FROM MAX(d.last_diagnosis_date))::int AS max_y
           FROM ${DIAG_TABLE} d
           WHERE d.cug_code_mapped = $1 AND d.last_diagnosis_date IS NOT NULL`,
          [cugCode],
          HEAVY_OPTS
        ),
        "years"
      ),
      // 8) facilities dropdown
      safeQuery(
        () => dwQuery<{ f: string }>(
          `SELECT DISTINCT d.facility_mapping AS f
           FROM ${DIAG_TABLE} d
           WHERE d.cug_code_mapped = $1
             AND d.facility_mapping IS NOT NULL
             AND TRIM(d.facility_mapping) <> ''
           ORDER BY 1`,
          [cugCode]
        ),
        "facilities"
      ),
      // 9) conditionTrends — monthly time series for the filter context.
      // Health Insights is chronic-only: the chronic predicate restricts
      // both monthly and yearly views (yearly is rolled up in JS from
      // these monthly buckets, so a single AND keeps both consistent).
      safeQuery(
        () => dwQuery<{ period: string; count: string; unique_patients: string }>(
          `SELECT to_char(date_trunc('month', d.last_diagnosis_date), 'YYYY-MM') AS period,
                  COALESCE(SUM(d.total_diagnosis_records), 0)::bigint AS count,
                  COUNT(DISTINCT d.uhid)::bigint AS unique_patients
           FROM ${DIAG_TABLE} d
           WHERE ${q.where}
             AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
             AND ${CHRONIC_CASE}
             ${selectedCondition ? `AND d.icd_description = $${q.params.length + 1}` : (selectedCategory ? `AND ${CATEGORY_CASE} = $${q.params.length + 1}` : "")}
           GROUP BY 1 ORDER BY 1`,
          selectedCondition
            ? [...q.params, selectedCondition]
            : selectedCategory
              ? [...q.params, selectedCategory]
              : q.params,
          HEAVY_OPTS
        ),
        "conditionTrends"
      ),
      // 10) seasonal split — Mar–Aug vs. Sep–Feb (rough warm/cool buckets)
      safeQuery(
        () => dwQuery<{ seasonal_count: string; seasonal_patients: string; non_seasonal_count: string; non_seasonal_patients: string }>(
          `SELECT
             COALESCE(SUM(d.total_diagnosis_records) FILTER (WHERE EXTRACT(MONTH FROM d.last_diagnosis_date) BETWEEN 3 AND 8), 0)::bigint AS seasonal_count,
             COUNT(DISTINCT d.uhid) FILTER (WHERE EXTRACT(MONTH FROM d.last_diagnosis_date) BETWEEN 3 AND 8)::bigint AS seasonal_patients,
             COALESCE(SUM(d.total_diagnosis_records) FILTER (WHERE EXTRACT(MONTH FROM d.last_diagnosis_date) NOT BETWEEN 3 AND 8), 0)::bigint AS non_seasonal_count,
             COUNT(DISTINCT d.uhid) FILTER (WHERE EXTRACT(MONTH FROM d.last_diagnosis_date) NOT BETWEEN 3 AND 8)::bigint AS non_seasonal_patients
           FROM ${DIAG_TABLE} d
           WHERE ${q.where} AND d.last_diagnosis_date IS NOT NULL`,
          q.params,
          HEAVY_OPTS
        ),
        "seasonal"
      ),
      // 11) seasonalTrends — per-CATEGORY (parent ICD) monthly time
      //     series for the Monthly Patterns calendar grid. Chronic-only;
      //     the page picks the top 3 categories per month from these
      //     rows. Drops the old top-N-conditions CTE since there are
      //     only ~22 chronic categories total.
      safeQuery(
        () => dwQuery<{ name: string; period: string; count: string }>(
          `SELECT
             ${CATEGORY_CASE} AS name,
             to_char(date_trunc('month', d.last_diagnosis_date), 'YYYY-MM') AS period,
             COALESCE(SUM(d.total_diagnosis_records), 0)::bigint AS count
           FROM ${DIAG_TABLE} d
           WHERE ${q.where}
             AND d.icd_description IS NOT NULL AND TRIM(d.icd_description) <> ''
             AND ${CHRONIC_CASE}
             AND d.last_diagnosis_date IS NOT NULL
           GROUP BY 1, 2
           ORDER BY 1, 2`,
          q.params,
          HEAVY_OPTS
        ),
        "seasonalTrends"
      ),
    ]);

    // ── Assemble ──
    const totalCategoryRows = categoryRows.reduce((s, r) => s + Number(r.count || 0), 0);
    const categories = categoryRows.map((r) => r.category);
    const categoryTreemap = categoryRows.map((r) => {
      const value = Number(r.count);
      return {
        name: r.category,
        value,
        percentage: totalCategoryRows > 0 ? Math.round((value / totalCategoryRows) * 1000) / 10 : 0,
        uniquePatients: Number(r.patients),
      };
    });

    const totalConditionRows = conditionRows.reduce((s, r) => s + Number(r.count || 0), 0);
    const conditionBreakdown = conditionRows.map((r) => {
      const value = Number(r.count);
      return {
        name: r.name,
        value,
        count: value,
        percentage: totalConditionRows > 0 ? Math.round((value / totalConditionRows) * 1000) / 10 : 0,
        uniquePatients: Number(r.patients),
        patients: Number(r.patients),
      };
    });

    // conditionsByCategory: keyed by category name → sorted array of
    // { name, value, uniquePatients }. Drives the expandable subcategory
    // rows in the Condition Share Distribution table.
    const conditionsByCategory: Record<string, Array<{ name: string; value: number; uniquePatients: number }>> = {};
    for (const r of conditionsByCategoryRows) {
      const cat = r.category;
      if (!cat) continue;
      if (!conditionsByCategory[cat]) conditionsByCategory[cat] = [];
      conditionsByCategory[cat].push({
        name: r.name,
        value: Number(r.count),
        uniquePatients: Number(r.patients),
      });
    }

    const chronicAcuteRow = chronicAcuteRows[0] || ({} as Record<string, string>);
    const chronicAcute = {
      chronicCount: Number(chronicAcuteRow.chronic_count || 0),
      chronicPatients: Number(chronicAcuteRow.chronic_patients || 0),
      acuteCount: Number(chronicAcuteRow.acute_count || 0),
      acutePatients: Number(chronicAcuteRow.acute_patients || 0),
    };

    // demoAge / demoGender / demoLocation shape: { [key]: { [bucket]: { count } } }
    // Source: single demoMatrix query, split by `dim` tag.
    const demoAge: Record<string, Record<string, { count: number }>> = {};
    const demoGender: Record<string, Record<string, { count: number }>> = {};
    const demoLocation: Record<string, Record<string, { count: number }>> = {};
    for (const r of demoMatrixRows) {
      if (!r.key || !r.bucket) continue;
      const target = r.dim === "age" ? demoAge : r.dim === "gender" ? demoGender : r.dim === "location" ? demoLocation : null;
      if (!target) continue;
      if (!target[r.key]) target[r.key] = {};
      target[r.key][r.bucket] = { count: Number(r.count) };
    }

    const diseaseCombinations = pairsRows.map((r) => ({
      conditionA: r.a,
      conditionB: r.b,
      name: `${r.a} + ${r.b}`,
      patients: Number(r.total),
      total: Number(r.total),
      male: Number(r.male || 0),
      female: Number(r.female || 0),
    }));

    // years derived from MIN/MAX bounds — generate the inclusive range.
    const yearsList: number[] = (() => {
      const row = yearsRows[0];
      const minY = row && row.min_y != null ? Number(row.min_y) : null;
      const maxY = row && row.max_y != null ? Number(row.max_y) : null;
      if (minY == null || maxY == null) return [];
      const out: number[] = [];
      for (let y = minY; y <= maxY; y++) out.push(y);
      return out;
    })();
    const facilitiesList = facilitiesRows.map((r) => r.f);
    const conditionTrends = conditionTrendsRows.map((r) => ({
      period: r.period,
      count: Number(r.count),
      uniquePatients: Number(r.unique_patients || 0),
    }));
    // Yearly aggregation derived from the monthly trends
    type YearAgg = { count: number; uniquePatients: number };
    const yearlyMap: Record<string, YearAgg> = {};
    for (const t of conditionTrends) {
      const yr = (t.period || "").slice(0, 4);
      if (!yr) continue;
      if (!yearlyMap[yr]) yearlyMap[yr] = { count: 0, uniquePatients: 0 };
      yearlyMap[yr].count += t.count;
      // Approximation — uniquePatients summed across months over-counts a
      // patient who returns in multiple months. The DW exposes no annual
      // distinct count without an extra query, so this stands as the
      // best-effort headline.
      yearlyMap[yr].uniquePatients += t.uniquePatients;
    }
    const conditionTrendsYearly = Object.entries(yearlyMap)
      .map(([year, v]) => ({ period: year, year: Number(year), count: v.count, uniquePatients: v.uniquePatients }))
      .sort((a, b) => a.year - b.year);

    const seas = seasonalRows[0] || ({} as Record<string, string>);
    const seasonalData = {
      seasonalCount: Number(seas.seasonal_count || 0),
      seasonalPatients: Number(seas.seasonal_patients || 0),
      nonSeasonalCount: Number(seas.non_seasonal_count || 0),
      nonSeasonalPatients: Number(seas.non_seasonal_patients || 0),
    };

    // seasonalTrends shape consumed by the calendar grid:
    //   { [conditionName]: [{ period: 'YYYY-MM', count: N }, ...] }
    const seasonalTrends: Record<string, { period: string; count: number }[]> = {};
    for (const r of seasonalTrendsRows) {
      if (!r.name) continue;
      if (!seasonalTrends[r.name]) seasonalTrends[r.name] = [];
      seasonalTrends[r.name].push({ period: r.period, count: Number(r.count) });
    }

    return NextResponse.json({
      years: yearsList,
      ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
      facilities: facilitiesList,
      categories,
      categoryTreemap,
      conditionBreakdown,
      conditionsByCategory,
      coOccurrenceVenn: (() => {
        const cats = (searchParams.get("coOccurrenceCategories")?.split(",").map((s) => s.trim()).filter(Boolean) || []).slice(0, 3);
        const subsets: Record<string, number> = {};
        const overlapAge: Record<string, number> = {};
        const overlapGender: Record<string, number> = {};
        for (const r of (coOccurrenceVennRows as Array<{ kind: string; bucket: string; n: string }>)) {
          const n = Number(r.n);
          if (r.kind === "subset") subsets[r.bucket] = n;
          else if (r.kind === "overlapAge") overlapAge[r.bucket] = n;
          else if (r.kind === "overlapGender") overlapGender[r.bucket] = n;
        }
        return { categories: cats, subsets, overlapAge, overlapGender };
      })(),
      chronicAcute,
      seasonalData,
      seasonalTrends,
      demoAge,
      demoGender,
      demoLocation,
      conditionTrends,
      conditionTrendsYearly,
      diseaseCombinations,
      // Not sourced from agg_diagnosis:
      symptomMapping: [],
      vitalsTrend: {},
      meta: { hadErrors: failedQueries.length > 0, failedQueries },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC Health Insights API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/health-insights" });
