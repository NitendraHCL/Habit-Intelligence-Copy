import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Repeat Visits API — sourced from aggregated_table.agg_diagnosis.
 *
 * Each row is one diagnosis recorded for a patient. "Visit count" =
 * number of diagnosis rows for the uhid. Repeat patients = uhids with
 * visit_count >= minVisits (default 2).
 *
 * Limitations of agg_diagnosis (vs. a richer event-level fact table):
 *   - No date column. So no time-series, no year breakdown, no cohort
 *     progression, no trend charts. Charts that need time return [].
 *   - No facility/location. So locationDistribution returns [].
 *   - No NPS, no vitals, no condition-transition path. Those return
 *     empty defaults.
 *
 * What agg_diagnosis CAN populate (and we do):
 *   - KPIs: totalRepeatPatients, avgVisitFrequency,
 *           totalConsultsByRepeat, frequentRepeaters
 *   - chronicVsAcute breakdown
 *   - demographics: ageGroups, genderSplit
 *   - repeatVisitFrequency bucket distribution
 *   - specialtyTreemap (by treating_doctor_speciality)
 *   - recurringConditions (diagnoses repeating per uhid)
 *   - repeatUserSegments (visit-bucket × age × gender cohorts)
 * ──────────────────────────────────────────────────────────────────── */

const DIAG_TABLE = "aggregated_table.agg_diagnosis";

// Categorise a diagnosis_text into broad chronic vs acute. Chronic
// catches the standard long-term conditions that actually drive most
// repeat-visit volume in an OHC setting; everything else falls to acute.
const CHRONIC_CASE = `(
  LOWER(d.icd_description) ~* '(diabet|hyperten|hyperlipid|asthma|arthrit|copd|chronic|thyroid|cardiac|hypothyr|hyperthyr|coronary|ischaem|ischem|kidney disease|ckd|cancer|tumor|tumour|psori|ecz|migraine|epileps|alzheim|parkinson|depress|anxiety|bipolar)'
)`;

const AGE_GROUP_CASE = `CASE
  WHEN d.patient_age < 20 THEN '<20'
  WHEN d.patient_age BETWEEN 20 AND 35 THEN '20-35'
  WHEN d.patient_age BETWEEN 36 AND 40 THEN '36-40'
  WHEN d.patient_age BETWEEN 41 AND 60 THEN '41-60'
  WHEN d.patient_age > 60 THEN '61+'
END`;

const GENDER_NORM = `CASE
  WHEN LOWER(TRIM(d.patient_gender)) IN ('male', 'm') THEN 'Male'
  WHEN LOWER(TRIM(d.patient_gender)) IN ('female', 'f') THEN 'Female'
  ELSE 'Others'
END`;

function buildWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const conditionType = searchParams.get("conditionType"); // 'chronic' | 'acute' | 'all'

  const conditions: string[] = [`d.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`d.g_creation_time >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`d.g_creation_time <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`d.facility_name = ANY($${idx})`);
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
  if (conditionType === "chronic") conditions.push(CHRONIC_CASE);
  else if (conditionType === "acute") conditions.push(`NOT ${CHRONIC_CASE}`);

  return { params, where: conditions.join(" AND ") };
}

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const minVisitsParam = parseInt(searchParams.get("minVisits") || "2", 10);
    const minVisits = Number.isFinite(minVisitsParam) && minVisitsParam >= 1 ? minVisitsParam : 2;

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

    // ── Heavy timeout: agg_diagnosis can be ~80M rows for a single tenant.
    // The per_uhid GROUP BY scans the cug-filtered slice; bump the per-query
    // statement timeout to 60s rather than the 15s default.
    const HEAVY_OPTS = { statementTimeoutMs: 60000 };

    // ── Consolidated patient-stats query: one per_uhid pass, every patient-
    // level rollup (KPIs, age bucket, gender, visit-frequency bucket,
    // segments) computed in a single round-trip via FILTER aggregates.
    //
    // Each demographic row carries n_total, n_chronic, n_acute so the page
    // can switch between All/Chronic/Acute views from cached data — no API
    // refetch on filter toggle.
    const patientStatsRows = await safeQuery(
      () => dwQuery<{
        kind: string;
        bucket: string;
        n: string;
        n_chronic: string;
        n_acute: string;
      }>(
        `WITH per_uhid AS (
          SELECT
            d.uhid,
            COUNT(*)::int AS vc,
            MAX(d.patient_age) AS age_years,
            MAX(d.patient_gender)    AS gender,
            MAX(d.facility_name)     AS facility,
            BOOL_OR(${CHRONIC_CASE}) AS has_chronic
          FROM ${DIAG_TABLE} d
          WHERE ${q.where}
          GROUP BY d.uhid
        ),
        repeat_pool AS (
          SELECT * FROM per_uhid WHERE vc >= ${minVisits}
        )
        SELECT 'kpi' AS kind, 'totalRepeatPatients' AS bucket,
               COUNT(*)::bigint AS n, 0::bigint AS n_chronic, 0::bigint AS n_acute
          FROM repeat_pool
        UNION ALL SELECT 'kpi', 'totalConsultsByRepeat', COALESCE(SUM(vc), 0)::bigint, 0::bigint, 0::bigint FROM repeat_pool
        UNION ALL SELECT 'kpi', 'avgVisitFrequencyX10', ROUND(COALESCE(AVG(vc), 0) * 10)::bigint, 0::bigint, 0::bigint FROM repeat_pool
        UNION ALL SELECT 'kpi', 'frequentRepeaters', COUNT(*)::bigint, 0::bigint, 0::bigint FROM per_uhid WHERE vc >= 5
        UNION ALL
          SELECT 'ageGroup', CASE
            WHEN age_years < 20 THEN '<20'
            WHEN age_years BETWEEN 20 AND 35 THEN '20-35'
            WHEN age_years BETWEEN 36 AND 40 THEN '36-40'
            WHEN age_years BETWEEN 41 AND 60 THEN '41-60'
            WHEN age_years > 60 THEN '61+'
            ELSE 'Unknown' END,
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE has_chronic)::bigint,
            COUNT(*) FILTER (WHERE NOT has_chronic)::bigint
          FROM repeat_pool WHERE age_years IS NOT NULL GROUP BY 2
        UNION ALL
          SELECT 'gender', CASE
            WHEN LOWER(TRIM(gender)) IN ('male','m') THEN 'Male'
            WHEN LOWER(TRIM(gender)) IN ('female','f') THEN 'Female'
            ELSE 'Others' END,
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE has_chronic)::bigint,
            COUNT(*) FILTER (WHERE NOT has_chronic)::bigint
          FROM repeat_pool GROUP BY 2
        UNION ALL
          SELECT 'visitFreq', CASE
            WHEN vc >= 10 THEN '10+'
            WHEN vc BETWEEN 5 AND 9 THEN '5-9'
            WHEN vc BETWEEN 2 AND 4 THEN '2-4'
            ELSE '1' END,
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE has_chronic)::bigint,
            COUNT(*) FILTER (WHERE NOT has_chronic)::bigint
          FROM repeat_pool GROUP BY 2
        UNION ALL
          SELECT 'location', COALESCE(NULLIF(TRIM(facility), ''), 'Unknown'),
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE has_chronic)::bigint,
            COUNT(*) FILTER (WHERE NOT has_chronic)::bigint
          FROM repeat_pool GROUP BY 2
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
            COUNT(*)::bigint,
            COUNT(*) FILTER (WHERE has_chronic)::bigint,
            COUNT(*) FILTER (WHERE NOT has_chronic)::bigint
          FROM repeat_pool GROUP BY 2`,
        q.params,
        HEAVY_OPTS
      ),
      "patientStats"
    );

    // ── Diagnosis-level queries (need diagnosis_text + speciality) ──
    const [
      chronicAcuteRows,
      specialtyRows,
      recurringRows,
      tenureSegmentRows,
    ] = await Promise.all([
      // Chronic vs Acute — rows count among repeat patients
      safeQuery(
        () => dwQuery<{ chronic: string; acute: string }>(
          `WITH per_uhid AS (
            SELECT d.uhid, COUNT(*) AS vc
            FROM ${DIAG_TABLE} d WHERE ${q.where}
            GROUP BY d.uhid
          )
          SELECT
            COUNT(*) FILTER (WHERE ${CHRONIC_CASE})::bigint AS chronic,
            COUNT(*) FILTER (WHERE NOT ${CHRONIC_CASE})::bigint AS acute
          FROM ${DIAG_TABLE} d
          WHERE ${q.where}
            AND d.uhid IN (SELECT uhid FROM per_uhid WHERE vc >= ${minVisits})`,
          q.params,
          HEAVY_OPTS
        ),
        "chronicVsAcute"
      ),
      // specialtyTreemap — diagnosis volumes per treating doctor speciality
      // (uses agg_diagnosis.treating_doctor_speciality, ~10–15 buckets)
      safeQuery(
        () => dwQuery<{ speciality: string; count: string }>(
          `WITH per_uhid AS (
            SELECT d.uhid, COUNT(*) AS vc FROM ${DIAG_TABLE} d WHERE ${q.where}
            GROUP BY d.uhid
          )
          SELECT
            COALESCE(NULLIF(TRIM(d.treating_doctor_speciality), ''), 'Unknown') AS speciality,
            COUNT(*)::bigint AS count
          FROM ${DIAG_TABLE} d
          WHERE ${q.where}
            AND d.uhid IN (SELECT uhid FROM per_uhid WHERE vc >= ${minVisits})
          GROUP BY 1
          ORDER BY 2 DESC
          LIMIT 25`,
          q.params,
          HEAVY_OPTS
        ),
        "specialtyTreemap"
      ),
      // recurringConditions — diagnoses occurring 2+ times for the same uhid,
      // split into chronic vs acute
      safeQuery(
        () => dwQuery<{ category: string; condition: string; patients: string; total_occurrences: string }>(
          `WITH dx AS (
            SELECT d.uhid,
                   d.icd_description AS condition,
                   ${CHRONIC_CASE} AS is_chronic,
                   COUNT(*)::int AS occ
            FROM ${DIAG_TABLE} d
            WHERE ${q.where}
              AND d.icd_description IS NOT NULL
              AND TRIM(d.icd_description) <> ''
            GROUP BY d.uhid, d.icd_description
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
          LIMIT 30`,
          q.params,
          HEAVY_OPTS
        ),
        "recurringConditions"
      ),
      // tenureSegments — group repeat patients by tenure (years between
      // first and last visit) and chronic-vs-acute. Used to populate the
      // "Key Repeat User Segments" cards (1 yr / 2 yr / 3+ yr).
      safeQuery(
        () => dwQuery<{
          tenure_label: string;
          has_chronic: boolean;
          patients: string;
          total_visits: string;
          avg_tenure_years: string;
        }>(
          `WITH per_uhid AS (
            SELECT
              d.uhid,
              COUNT(*) AS vc,
              MIN(d.g_creation_time) AS first_visit,
              MAX(d.g_creation_time) AS last_visit,
              BOOL_OR(${CHRONIC_CASE}) AS has_chronic
            FROM ${DIAG_TABLE} d
            WHERE ${q.where}
            GROUP BY d.uhid
            HAVING COUNT(*) >= ${minVisits}
          ),
          tenured AS (
            SELECT
              vc,
              has_chronic,
              GREATEST(EXTRACT(EPOCH FROM (last_visit - first_visit)) / (365.25 * 86400.0), 0) AS tenure_years
            FROM per_uhid
          )
          SELECT
            CASE
              WHEN tenure_years >= 2 THEN '3+ years'
              WHEN tenure_years >= 1 THEN '2 years'
              ELSE '1 year' END AS tenure_label,
            has_chronic,
            COUNT(*)::bigint AS patients,
            COALESCE(SUM(vc), 0)::bigint AS total_visits,
            COALESCE(AVG(GREATEST(tenure_years, 0.5)), 0.5)::numeric AS avg_tenure_years
          FROM tenured
          GROUP BY 1, 2`,
          q.params,
          HEAVY_OPTS
        ),
        "tenureSegments"
      ),
    ]);

    // ── Assemble ──
    // patientStatsRows is a multi-shape result: { kind, bucket, n, n_chronic, n_acute }
    // We index three parallel stat maps so the page can switch between
    // All/Chronic/Acute views from a single cached payload.
    type StatMap = Record<string, Record<string, number>>;
    const stats: StatMap = {};
    const statsChronic: StatMap = {};
    const statsAcute: StatMap = {};
    for (const r of patientStatsRows) {
      if (!stats[r.kind]) stats[r.kind] = {};
      if (!statsChronic[r.kind]) statsChronic[r.kind] = {};
      if (!statsAcute[r.kind]) statsAcute[r.kind] = {};
      stats[r.kind][r.bucket] = Number(r.n);
      statsChronic[r.kind][r.bucket] = Number(r.n_chronic);
      statsAcute[r.kind][r.bucket] = Number(r.n_acute);
    }
    const totalRepeatPatients = stats.kpi?.totalRepeatPatients || 0;
    const totalConsultsByRepeat = stats.kpi?.totalConsultsByRepeat || 0;
    const frequentRepeaters = stats.kpi?.frequentRepeaters || 0;
    const avgVisitFrequencyNum = (stats.kpi?.avgVisitFrequencyX10 || 0) / 10;

    const chronicAcute = chronicAcuteRows[0];
    const chronicVsAcute = {
      chronic: Number(chronicAcute?.chronic || 0),
      acute: Number(chronicAcute?.acute || 0),
    };

    const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];
    const FREQ_ORDER = ["1", "2-4", "5-9", "10+"];

    // Build a complete demographics slice (ageGroups, genderSplit,
    // locationDistribution, ageGenderPyramid) from any stats map. We call this
    // 3 times — once for combined, chronic, acute — so the page can render any
    // slice from a single cached payload.
    function buildDemographics(s: StatMap) {
      const ageMap = s.ageGroup || {};
      const ageGroupsArr = AGE_ORDER
        .filter((b) => ageMap[b])
        .map((b) => ({ label: b, count: ageMap[b] }));

      const genderMap = s.gender || {};
      const genderSplit = ["Male", "Female", "Others"]
        .filter((g) => genderMap[g])
        .map((g) => ({ label: g, count: genderMap[g] }));

      const locationDistribution = Object.entries(s.location || {})
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);

      // ageGenderPyramid — derived from segment keys (`visitBucket|age|gender`)
      // by collapsing across visit buckets. One row per age band with male,
      // female and others counts.
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

      return { ageGroups: ageGroupsArr, genderSplit, locationDistribution, ageGenderPyramid };
    }

    const demoCombined = buildDemographics(stats);
    const demoChronic = buildDemographics(statsChronic);
    const demoAcute = buildDemographics(statsAcute);

    // Build location top-N + others rollup once per slice (Top 10 + Others)
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
    const combinedLoc = withLocationRollup(demoCombined.locationDistribution);
    const chronicLoc = withLocationRollup(demoChronic.locationDistribution);
    const acuteLoc = withLocationRollup(demoAcute.locationDistribution);

    const freqMap = stats.visitFreq || {};
    const repeatVisitFrequency = FREQ_ORDER
      .filter((b) => freqMap[b])
      .map((b) => ({ label: `${b} Visits`, count: freqMap[b] }));

    // Backwards-compat aliases for the existing page consumers
    const ageGroupsArr = demoCombined.ageGroups;
    const genderSplit = demoCombined.genderSplit;
    const ageGenderPyramid = demoCombined.ageGenderPyramid;

    // specialtyTreemap is keyed by year — agg_diagnosis has no date, so we
    // expose a single synthetic bucket "All" that the page picks up via the
    // existing year-selector machinery (it'll just show one option).
    const specialtyTreemap: Record<string, Array<{ name: string; value: number }>> = {
      All: specialtyRows.map((r) => ({ name: r.speciality, value: Number(r.count) })),
    };

    // recurringConditions split into chronic + acute arrays
    const recurringConditions: { chronic: Array<{ name: string; count: number; patients: number }>; acute: Array<{ name: string; count: number; patients: number }> } = {
      chronic: [],
      acute: [],
    };
    for (const r of recurringRows) {
      const entry = { name: r.condition, count: Number(r.total_occurrences), patients: Number(r.patients) };
      if (r.category === "chronic") recurringConditions.chronic.push(entry);
      else recurringConditions.acute.push(entry);
    }

    // repeatUserSegments — tenure-bucketed (1yr / 2yr / 3+yr) cards with
    // chronic/acute split. Built from tenureSegmentRows. NPS is unavailable
    // on agg_diagnosis, so avgNps/responseRate default to 0 (page renders
    // "—" via `seg.chronic.nps || "—"`).
    type SegBucket = {
      label: string;
      patients: number;
      totalVisits: number;
      avgTenure: number;
      chronicCount: number;
      acuteCount: number;
    };
    const segBuckets: Record<string, SegBucket> = {
      "1 year": { label: "1 year", patients: 0, totalVisits: 0, avgTenure: 0.5, chronicCount: 0, acuteCount: 0 },
      "2 years": { label: "2 years", patients: 0, totalVisits: 0, avgTenure: 1.5, chronicCount: 0, acuteCount: 0 },
      "3+ years": { label: "3+ years", patients: 0, totalVisits: 0, avgTenure: 3, chronicCount: 0, acuteCount: 0 },
    };
    let segTenureWeight: Record<string, number> = { "1 year": 0, "2 years": 0, "3+ years": 0 };
    for (const r of tenureSegmentRows) {
      const b = segBuckets[r.tenure_label];
      if (!b) continue;
      const patients = Number(r.patients || 0);
      const visits = Number(r.total_visits || 0);
      const tenure = Number(r.avg_tenure_years || 0);
      b.patients += patients;
      b.totalVisits += visits;
      segTenureWeight[r.tenure_label] += tenure * patients;
      if (r.has_chronic) b.chronicCount += patients;
      else b.acuteCount += patients;
    }
    const repeatUserSegments = (["1 year", "2 years", "3+ years"] as const).map((label) => {
      const b = segBuckets[label];
      const denom = b.patients || 1;
      const tenureYears = segTenureWeight[label] / denom || (label === "3+ years" ? 3 : label === "2 years" ? 1.5 : 0.5);
      const visitsPerYear = b.totalVisits > 0 && tenureYears > 0
        ? Math.round((b.totalVisits / denom / Math.max(tenureYears, 0.5)) * 10) / 10
        : 0;
      const chronicPct = b.patients > 0 ? Math.round((b.chronicCount / b.patients) * 100) : 0;
      const acutePct = b.patients > 0 ? 100 - chronicPct : 0;
      return {
        label,
        patients: b.patients,
        avgNps: 0,
        visitsPerYear,
        responseRate: 0,
        chronic: { count: b.chronicCount, pct: chronicPct, nps: 0 },
        acute:   { count: b.acuteCount,   pct: acutePct,   nps: 0 },
      };
    });

    return NextResponse.json({
      kpis: {
        totalRepeatPatients,
        avgVisitFrequency: avgVisitFrequencyNum,
        totalConsultsByRepeat,
        avgNps: 0,                  // No NPS source
        frequentRepeaters,
        // Convenience fields the PageGlanceBox and fallback text reads:
        avgFrequency: avgVisitFrequencyNum.toFixed(1),
        repeatRate: 0,              // Needs total-patient denominator from another table
        lsmpEnrolled: 0,            // No LSMP enrollment source
      },
      charts: {
        chronicVsAcute,
        // Combined demographics — what the page consumes when conditionFilter === "all"
        demographics: {
          ageGroups: ageGroupsArr,
          ageGenderPyramid,
          genderSplit,
          locationDistribution: combinedLoc.locationDistribution,
          othersBreakdown: combinedLoc.othersBreakdown,
        },
        // Chronic-only slice — page picks this when conditionFilter === "chronic"
        demographicsChronic: {
          ageGroups: demoChronic.ageGroups,
          ageGenderPyramid: demoChronic.ageGenderPyramid,
          genderSplit: demoChronic.genderSplit,
          locationDistribution: chronicLoc.locationDistribution,
          othersBreakdown: chronicLoc.othersBreakdown,
        },
        // Acute-only slice — page picks this when conditionFilter === "acute"
        demographicsAcute: {
          ageGroups: demoAcute.ageGroups,
          ageGenderPyramid: demoAcute.ageGenderPyramid,
          genderSplit: demoAcute.genderSplit,
          locationDistribution: acuteLoc.locationDistribution,
          othersBreakdown: acuteLoc.othersBreakdown,
        },
        repeatVisitFrequency,
        specialtyTreemap,
        treemapYears: ["All"],
        // Time-bound charts (no date column on agg_diagnosis):
        conditionTransitions: [],
        visitFrequencyNps: [],
        sankeyFlow: { nodes: [], links: [] },
        vitalTotals: { v1: {}, v2: {}, v3: {} },
        cohortVisitFrequency: {},
        cohortYears: [],
        recurringConditions,
        repeatUserSegments,
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

export const GET = withCache(handler, { endpoint: "ohc/repeat-visits" });
