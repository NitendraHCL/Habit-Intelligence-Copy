import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Repeat Visits API — sourced exclusively from
 * aggregated_table.health_diagnosis.
 *
 * Row grain: ONE diagnosis (ICD code) per row. A single appointment
 * (one bill_no) typically carries multiple ICD rows, so visit count is
 * COUNT(DISTINCT bill_no) per uhid — NOT COUNT(*).
 *
 * Chronic vs Acute uses the native `icd_status` column:
 *   'Chronic' / 'Acute or Chronic'  → chronic
 *   'Acute'                         → acute
 *   'Not Applicable'                → neither (excluded from chronic side)
 *
 * Pre-computes 12 slices (4 visit-buckets × 3 condition types) in a
 * single per_uhid scan and ships them all in one payload so the page
 * can switch between Min Visits (2/3/4/5) and All/Chronic/Acute toggles
 * without re-hitting the warehouse.
 * ──────────────────────────────────────────────────────────────────── */

const DIAG_TABLE = "aggregated_table.health_diagnosis";

// Patient-level chronic flag — true if any of their diagnoses carry a
// chronic ICD status. Aggregated with BOOL_OR over the per-uhid scan.
const CHRONIC_ROW_EXPR = `(LOWER(d.icd_status) IN ('chronic', 'acute or chronic'))`;
const ACUTE_ROW_EXPR   = `(LOWER(d.icd_status) = 'acute')`;

const AGE_GROUP_CASE = `CASE
  WHEN d.age < 20 THEN '<20'
  WHEN d.age BETWEEN 20 AND 35 THEN '20-35'
  WHEN d.age BETWEEN 36 AND 40 THEN '36-40'
  WHEN d.age BETWEEN 41 AND 60 THEN '41-60'
  WHEN d.age > 60 THEN '61+'
END`;

// Slice combinations for the multi-FILTER aggregation. The SQL emits 12
// columns per grouped row (n2a, n2c, n2x, … n5x) where the digit is the
// minVisits threshold and the letter is the condition: a=all, c=chronic,
// x=acute (= NOT chronic at the patient level).
const VC_THRESHOLDS = [2, 3, 4, 5] as const;
const COND_TYPES = ["a", "c", "x"] as const;
type Cond = typeof COND_TYPES[number];

const filterCol = (
  template: (filter: string) => string,
  vc: number,
  cond: Cond,
  extraWhere?: string,
): string => {
  const condClause =
    cond === "a" ? "" :
    cond === "c" ? "AND has_chronic" :
                   "AND NOT has_chronic";
  const extra = extraWhere ? ` AND ${extraWhere}` : "";
  const filter = `FILTER (WHERE vc >= ${vc} ${condClause}${extra})`;
  return `${template(filter)}::bigint AS n${vc}${cond}`;
};
const allFilterCols = (
  template: (filter: string) => string,
  extraWhere?: string,
): string =>
  VC_THRESHOLDS.flatMap((vc) => COND_TYPES.map((cond) => filterCol(template, vc, cond, extraWhere))).join(",\n  ");

function buildWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);

  const conditions: string[] = [`d.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`d.slotstarttime >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`d.slotstarttime <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`d.facility_mapping = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(d.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(d.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(d.patient_gender)) NOT IN ('male','m','female','f') OR d.patient_gender IS NULL)";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    conditions.push(`${AGE_GROUP_CASE} = ANY($${idx})`);
    params.push(ageGroups);
    idx++;
  }
  // Note: minVisits and conditionType are intentionally NOT in the WHERE
  // clause — they're applied client-side from the precomputed slices so
  // toggling them doesn't change the cache key or refetch.

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
        console.error(`Repeat Visits query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    const HEAVY_OPTS = { statementTimeoutMs: 60000 };

    type SliceCols = Record<string, string>;

    // ── Big consolidated query — one per_uhid pass, all 12 slices.
    // vc = DISTINCT bill_no (each appointment groups multiple ICD rows).
    const patientStatsRows = await safeQuery(
      () => dwQuery<{ kind: string; bucket: string } & SliceCols>(
        `WITH per_uhid AS (
          SELECT
            d.uhid,
            COUNT(DISTINCT d.bill_no)::int AS vc,
            MAX(d.age) AS age_years,
            MAX(d.patient_gender) AS gender,
            MAX(d.facility_mapping) AS facility,
            MIN(d.slotstarttime) AS first_at,
            MAX(d.slotstarttime) AS last_at,
            BOOL_OR(${CHRONIC_ROW_EXPR}) AS has_chronic,
            COUNT(DISTINCT NULLIF(TRIM(d.treating_doctor_speciality), ''))::int AS spec_count
          FROM ${DIAG_TABLE} d
          WHERE ${q.where}
          GROUP BY d.uhid
        )
        SELECT 'kpi' AS kind, 'totalRepeatPatients' AS bucket,
          ${allFilterCols((f) => `COUNT(*) ${f}`)}
        FROM per_uhid
        UNION ALL
        SELECT 'kpi', 'totalConsultsByRepeat',
          ${allFilterCols((f) => `COALESCE(SUM(vc) ${f}, 0)`)}
        FROM per_uhid
        UNION ALL
        SELECT 'kpi', 'avgVisitFrequencyX10',
          ${allFilterCols((f) => `ROUND(COALESCE(AVG(vc) ${f}, 0) * 10)`)}
        FROM per_uhid
        UNION ALL
        SELECT 'kpi' AS kind, 'frequentRepeaters' AS bucket,
          COUNT(*) FILTER (WHERE vc >= 5)::bigint AS n2a,
          COUNT(*) FILTER (WHERE vc >= 5 AND has_chronic)::bigint AS n2c,
          COUNT(*) FILTER (WHERE vc >= 5 AND NOT has_chronic)::bigint AS n2x,
          COUNT(*) FILTER (WHERE vc >= 5)::bigint AS n3a,
          COUNT(*) FILTER (WHERE vc >= 5 AND has_chronic)::bigint AS n3c,
          COUNT(*) FILTER (WHERE vc >= 5 AND NOT has_chronic)::bigint AS n3x,
          COUNT(*) FILTER (WHERE vc >= 5)::bigint AS n4a,
          COUNT(*) FILTER (WHERE vc >= 5 AND has_chronic)::bigint AS n4c,
          COUNT(*) FILTER (WHERE vc >= 5 AND NOT has_chronic)::bigint AS n4x,
          COUNT(*) FILTER (WHERE vc >= 5)::bigint AS n5a,
          COUNT(*) FILTER (WHERE vc >= 5 AND has_chronic)::bigint AS n5c,
          COUNT(*) FILTER (WHERE vc >= 5 AND NOT has_chronic)::bigint AS n5x
        FROM per_uhid
        UNION ALL
          SELECT 'ageGroup', CASE
            WHEN age_years < 20 THEN '<20'
            WHEN age_years BETWEEN 20 AND 35 THEN '20-35'
            WHEN age_years BETWEEN 36 AND 40 THEN '36-40'
            WHEN age_years BETWEEN 41 AND 60 THEN '41-60'
            WHEN age_years > 60 THEN '61+'
            ELSE 'Unknown' END,
            ${allFilterCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid WHERE age_years IS NOT NULL GROUP BY 2
        UNION ALL
          SELECT 'gender', CASE
            WHEN LOWER(TRIM(gender)) IN ('male','m') THEN 'Male'
            WHEN LOWER(TRIM(gender)) IN ('female','f') THEN 'Female'
            ELSE 'Others' END,
            ${allFilterCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'visitFreq', CASE
            WHEN vc >= 10 THEN '10+'
            WHEN vc BETWEEN 5 AND 9 THEN '5-9'
            WHEN vc BETWEEN 2 AND 4 THEN '2-4'
            ELSE '1' END,
            ${allFilterCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'visitFreqSame', CASE
            WHEN vc >= 10 THEN '10+'
            WHEN vc BETWEEN 5 AND 9 THEN '5-9'
            WHEN vc BETWEEN 2 AND 4 THEN '2-4'
            ELSE '1' END,
            ${allFilterCols((f) => `COUNT(*) ${f}`, "spec_count <= 1")}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'visitFreqDiff', CASE
            WHEN vc >= 10 THEN '10+'
            WHEN vc BETWEEN 5 AND 9 THEN '5-9'
            WHEN vc BETWEEN 2 AND 4 THEN '2-4'
            ELSE '1' END,
            ${allFilterCols((f) => `COUNT(*) ${f}`, "spec_count >= 2")}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'location', COALESCE(NULLIF(TRIM(facility), ''), 'Unknown'),
            ${allFilterCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'segment',
            (CASE
              WHEN vc >= 10 THEN '10+'
              WHEN vc BETWEEN 5 AND 9 THEN '5-9'
              WHEN vc BETWEEN 2 AND 4 THEN '2-4'
              ELSE '1' END)
            || '|' ||
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
            ${allFilterCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'tenure',
            (CASE
              WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 2 THEN '3+ years'
              WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 1 THEN '2 years'
              ELSE '1 year' END)
            || '|' || (CASE WHEN has_chronic THEN 'chronic' ELSE 'acute' END),
            ${allFilterCols((f) => `COUNT(*) ${f}`)}
          FROM per_uhid GROUP BY 2
        UNION ALL
          SELECT 'tenureVisits',
            (CASE
              WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 2 THEN '3+ years'
              WHEN EXTRACT(EPOCH FROM (last_at - first_at)) / (365.25 * 86400.0) >= 1 THEN '2 years'
              ELSE '1 year' END),
            ${allFilterCols((f) => `COALESCE(SUM(vc) ${f}, 0)`)}
          FROM per_uhid GROUP BY 2`,
        q.params,
        HEAVY_OPTS
      ),
      "patientStats"
    );

    // ── Parallel: chronic vs acute headline + recurring conditions +
    //   specialty treemap.
    const [
      chronicAcuteRows,
      recurringRows,
      specialtyRows,
    ] = await Promise.all([
      // Chronic vs Acute uses ROW-LEVEL counts of ICD diagnoses, scoped
      // to repeat patients (uhid with ≥2 distinct bill_no).
      safeQuery(
        () => dwQuery<{ chronic: string; acute: string }>(
          `WITH repeaters AS (
            SELECT d.uhid FROM ${DIAG_TABLE} d WHERE ${q.where}
            GROUP BY d.uhid HAVING COUNT(DISTINCT d.bill_no) >= 2
          )
          SELECT
            COUNT(*) FILTER (WHERE ${CHRONIC_ROW_EXPR})::bigint AS chronic,
            COUNT(*) FILTER (WHERE ${ACUTE_ROW_EXPR})::bigint AS acute
          FROM ${DIAG_TABLE} d
          WHERE ${q.where} AND d.uhid IN (SELECT uhid FROM repeaters)`,
          q.params,
          HEAVY_OPTS
        ),
        "chronicVsAcute"
      ),
      safeQuery(
        () => dwQuery<{ category: string; condition: string; patients: string; total_occurrences: string }>(
          `WITH dx AS (
            SELECT d.uhid,
                   d.icd_description AS condition,
                   ${CHRONIC_ROW_EXPR} AS is_chronic,
                   COUNT(*)::int AS occ
            FROM ${DIAG_TABLE} d
            WHERE ${q.where}
              AND d.icd_description IS NOT NULL
              AND TRIM(d.icd_description) <> ''
            GROUP BY d.uhid, d.icd_description, ${CHRONIC_ROW_EXPR}
            HAVING COUNT(*) >= 2
          )
          SELECT
            CASE WHEN is_chronic THEN 'chronic' ELSE 'acute' END AS category,
            condition,
            COUNT(DISTINCT uhid)::bigint AS patients,
            SUM(occ)::bigint AS total_occurrences
          FROM dx
          GROUP BY 1, 2
          ORDER BY patients DESC
          LIMIT 60`,
          q.params,
          HEAVY_OPTS
        ),
        "recurringConditions"
      ),
      safeQuery(
        () => dwQuery<{ speciality: string; year: string; count: string }>(
          `WITH per_uhid AS (
            SELECT d.uhid, COUNT(DISTINCT d.bill_no) AS vc
            FROM ${DIAG_TABLE} d WHERE ${q.where}
            GROUP BY d.uhid
          )
          SELECT
            COALESCE(NULLIF(TRIM(d.treating_doctor_speciality), ''), 'Unknown') AS speciality,
            EXTRACT(YEAR FROM d.slotstarttime)::int::text AS year,
            COUNT(DISTINCT d.bill_no)::bigint AS count
          FROM ${DIAG_TABLE} d
          WHERE ${q.where}
            AND d.slotstarttime IS NOT NULL
            AND d.uhid IN (SELECT uhid FROM per_uhid WHERE vc >= 2)
          GROUP BY 1, 2
          ORDER BY 3 DESC`,
          q.params,
          HEAVY_OPTS
        ),
        "specialtyTreemap"
      ),
    ]);

    // ── Build slice maps ─────────────────────────────────────────────
    type StatMap = Record<string, Record<string, number>>;
    const colKey = (vc: number, cond: Cond) => `n${vc}${cond}`;

    function bucketByCond(rows: typeof patientStatsRows, vc: number, cond: Cond): StatMap {
      const map: StatMap = {};
      for (const r of rows) {
        if (!map[r.kind]) map[r.kind] = {};
        const col = colKey(vc, cond);
        map[r.kind][r.bucket] = Number((r as Record<string, string>)[col] || 0);
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
        if (parts.length !== 3) continue;
        const ageBucket = parts[1];
        const genderBucket = parts[2];
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

    function buildRepeatUserSegments(rows: typeof patientStatsRows, vc: number, cond: Cond) {
      const segPatients: Record<string, { chronic: number; acute: number }> = {
        "1 year": { chronic: 0, acute: 0 },
        "2 years": { chronic: 0, acute: 0 },
        "3+ years": { chronic: 0, acute: 0 },
      };
      const segVisits: Record<string, number> = { "1 year": 0, "2 years": 0, "3+ years": 0 };
      const col = colKey(vc, cond);
      for (const r of rows) {
        const v = Number((r as Record<string, string>)[col] || 0);
        if (r.kind === "tenure") {
          const [label, kind] = r.bucket.split("|");
          if (segPatients[label]) {
            if (kind === "chronic") segPatients[label].chronic = v;
            else segPatients[label].acute = v;
          }
        } else if (r.kind === "tenureVisits") {
          if (segVisits[r.bucket] !== undefined) segVisits[r.bucket] = v;
        }
      }
      return (["1 year", "2 years", "3+ years"] as const).map((label) => {
        const c = segPatients[label].chronic;
        const a = segPatients[label].acute;
        const total = c + a;
        const visits = segVisits[label] || 0;
        const tenureYears = label === "3+ years" ? 3 : label === "2 years" ? 1.5 : 0.5;
        const visitsPerYear = total > 0 ? Math.round((visits / total / tenureYears) * 10) / 10 : 0;
        const chronicPct = total > 0 ? Math.round((c / total) * 100) : 0;
        return {
          label,
          patients: total,
          avgNps: 0,
          visitsPerYear,
          responseRate: 0,
          chronic: { count: c, pct: chronicPct, nps: 0 },
          acute:   { count: a, pct: 100 - chronicPct, nps: 0 },
        };
      });
    }

    function buildSlice(vc: number, cond: Cond) {
      const stats = bucketByCond(patientStatsRows, vc, cond);
      const statsChronic = bucketByCond(patientStatsRows, vc, "c");
      const statsAcute = bucketByCond(patientStatsRows, vc, "x");

      const totalRepeatPatients = stats.kpi?.totalRepeatPatients || 0;
      const totalConsultsByRepeat = stats.kpi?.totalConsultsByRepeat || 0;
      const frequentRepeaters = stats.kpi?.frequentRepeaters || 0;
      const avgVisitFrequencyNum = (stats.kpi?.avgVisitFrequencyX10 || 0) / 10;

      const demoCombined = buildDemographics(stats);
      const demoChronic = buildDemographics(statsChronic);
      const demoAcute = buildDemographics(statsAcute);

      const combinedLoc = withLocationRollup(demoCombined.locationDistribution);
      const chronicLoc = withLocationRollup(demoChronic.locationDistribution);
      const acuteLoc = withLocationRollup(demoAcute.locationDistribution);

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

      const repeatUserSegments = buildRepeatUserSegments(patientStatsRows, vc, cond);

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
            ageGroups: demoCombined.ageGroups,
            ageGenderPyramid: demoCombined.ageGenderPyramid,
            genderSplit: demoCombined.genderSplit,
            locationDistribution: combinedLoc.locationDistribution,
            othersBreakdown: combinedLoc.othersBreakdown,
          },
          demographicsChronic: {
            ageGroups: demoChronic.ageGroups,
            ageGenderPyramid: demoChronic.ageGenderPyramid,
            genderSplit: demoChronic.genderSplit,
            locationDistribution: chronicLoc.locationDistribution,
            othersBreakdown: chronicLoc.othersBreakdown,
          },
          demographicsAcute: {
            ageGroups: demoAcute.ageGroups,
            ageGenderPyramid: demoAcute.ageGenderPyramid,
            genderSplit: demoAcute.genderSplit,
            locationDistribution: acuteLoc.locationDistribution,
            othersBreakdown: acuteLoc.othersBreakdown,
          },
          repeatVisitFrequency,
          repeatUserSegments,
        },
      };
    }

    type SlicePayload = ReturnType<typeof buildSlice>;
    const slices: Record<string, SlicePayload> = {};
    const condLabel: Record<Cond, "all" | "chronic" | "acute"> = { a: "all", c: "chronic", x: "acute" };
    for (const cond of COND_TYPES) {
      for (const vc of VC_THRESHOLDS) {
        slices[`${condLabel[cond]}_${vc}`] = buildSlice(vc, cond);
      }
    }

    const defaultSlice = slices["all_2"];

    const chronicAcute = chronicAcuteRows[0];
    const chronicVsAcute = {
      chronic: Number(chronicAcute?.chronic || 0),
      acute: Number(chronicAcute?.acute || 0),
    };

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

    const recurringConditions: { chronic: Array<{ name: string; count: number; patients: number }>; acute: Array<{ name: string; count: number; patients: number }> } = {
      chronic: [],
      acute: [],
    };
    for (const r of recurringRows) {
      const entry = { name: r.condition, count: Number(r.total_occurrences), patients: Number(r.patients) };
      if (r.category === "chronic") recurringConditions.chronic.push(entry);
      else recurringConditions.acute.push(entry);
    }

    return NextResponse.json({
      kpis: defaultSlice.kpis,
      charts: {
        ...defaultSlice.charts,
        chronicVsAcute,
        specialtyTreemap,
        treemapYears,
        recurringConditions,
        // Cohort progression intentionally empty — needs per-visit BMI source
        conditionTransitions: [],
        visitFrequencyNps: [],
        sankeyFlow: { nodes: [], links: [] },
        vitalTotals: { v1: {}, v2: {}, v3: {} },
        cohortVisitFrequency: {},
        cohortYears: [],
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

export const GET = withCache(handler, { endpoint: "ohc/repeat-visits" });
