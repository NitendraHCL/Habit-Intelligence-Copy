import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Referral API — two-table fact model.
 *
 * agg_referral_matrix (BASE_TABLE) is the dim-rich fact table that drives
 *   filters, demographics, location, matrix and per-period/per-specialty
 *   referral counts. One row per referral event.
 *
 *   Columns: g_creation_time, uhid, referral_count, speciality_referred_from,
 *   speciality_referred_to, speciality_conversion (LEGACY — superseded),
 *   age, gender, facility, facility_mapping, cug_code_mapped, relationship.
 *
 * referral_conversion (CONV_TABLE) is the new authoritative source for
 *   conversion outcomes. The legacy speciality_conversion flag on
 *   agg_referral_matrix is no longer used.
 *
 *   Columns: uhid, speciality_name, stage, slotstarttime, g_creation_time,
 *   difference_days, conversion (0/1 flag).
 *
 *   Verified UNIQUE on (uhid, g_creation_time, speciality_name); the
 *   matrix table has up to 7 duplicates per same triple, so a JOIN would
 *   inflate the conversion sum. We use IN-subquery scoping instead — see
 *   convFilter() helper.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_referral_matrix";
const CONV_TABLE = "aggregated_table.referral_conversion";

/**
 * Conversion-fact lookup: filters are expressed against agg_referral_matrix
 * (where the dim columns live), so any conversion query needs to scope itself
 * to the (uhid, g_creation_time, speciality) keys that survive the filters.
 *
 * IN-subquery (not JOIN) on purpose: agg_referral_matrix has up to 7 duplicate
 * rows per (uhid, time, spec) triple, so a JOIN would inflate the conversion
 * sum. referral_conversion is verified-unique on the same triple, so the
 * IN-subquery gives the true conversion count.
 *
 * Pass the filter SQL fragment as `whereR` (referencing alias `r`) and the
 * matching params; the helper inlines them into the inner subquery.
 */
function convFilter(whereR: string): string {
  return `(rc.uhid, rc.g_creation_time, rc.speciality_name) IN (
    SELECT r.uhid, r.g_creation_time, r.speciality_referred_to
    FROM ${BASE_TABLE} r
    WHERE ${whereR} AND r.speciality_referred_to IS NOT NULL
  )`;
}

const AGE_GROUP_CASE = `CASE
  WHEN r.age < 20 THEN '<20'
  WHEN r.age BETWEEN 20 AND 35 THEN '20-35'
  WHEN r.age BETWEEN 36 AND 40 THEN '36-40'
  WHEN r.age BETWEEN 41 AND 60 THEN '41-60'
  WHEN r.age > 60 THEN '61+'
END`;

const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];

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
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);

  const conditions: string[] = [`r.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`r.g_creation_time >= $${idx}::date`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`r.g_creation_time <= $${idx}::date`);
    params.push(dateTo);
    idx++;
  }
  if (specialties?.length) {
    conditions.push(`r.speciality_referred_to = ANY($${idx})`);
    params.push(specialties);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`r.facility_mapping = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(r.gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(r.gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(r.gender)) NOT IN ('male','m','female','f') OR r.gender IS NULL OR TRIM(r.gender)='')";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    conditions.push(`${AGE_GROUP_CASE} = ANY($${idx})`);
    params.push(ageGroups);
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

    const q = buildQueryParts(searchParams, cugCode);

    // Trend bucketing: when the selected window is ≤ 31 days the trend chart
    // groups by day instead of month. Same pattern the OHC Utilization API
    // uses for Visit Trends. period is emitted in machine format
    // (YYYY-MM-DD or YYYY-MM) so the client can format on display.
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    let trendBucket: "day" | "month" = "month";
    if (dateFromParam && dateToParam) {
      const days = Math.round((Date.parse(dateToParam) - Date.parse(dateFromParam)) / 86400000) + 1;
      if (days > 0 && days <= 31) trendBucket = "day";
    }
    const periodFormat = trendBucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";

    // Track per-query failures so the cache layer can skip writes when the
    // warehouse is degraded (same pattern as ohc/utilization).
    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Referral query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // ── Filter options (unfiltered, scoped to the client tenant only) ──
    // Sourced from agg_referral_matrix so the dropdown values are always
    // present in the data this page actually queries — no orphan filter
    // values that return empty results.
    const filterPromise = Promise.all([
      safeQuery(
        () => dwQuery<{ v: string }>(
          `SELECT DISTINCT r.facility_mapping AS v
           FROM ${BASE_TABLE} r
           WHERE r.cug_code_mapped = $1 AND r.facility_mapping IS NOT NULL AND TRIM(r.facility_mapping) <> ''
           ORDER BY 1`,
          [cugCode]
        ),
        "filterLocations"
      ),
      safeQuery(
        () => dwQuery<{ v: string }>(
          `SELECT DISTINCT r.speciality_referred_to AS v
           FROM ${BASE_TABLE} r
           WHERE r.cug_code_mapped = $1 AND r.speciality_referred_to IS NOT NULL AND TRIM(r.speciality_referred_to) <> ''
           ORDER BY 1`,
          [cugCode]
        ),
        "filterSpecialties"
      ),
    ]);

    // ── KPIs ──
    // total_referrals comes from agg_referral_matrix (dim-rich fact table);
    // converted_count comes from referral_conversion (the new authoritative
    // source of truth for conversions). Both queries respect the same filter
    // context — see convFilter() comment for why we use IN-subquery vs JOIN.
    const [refsRows, convRows, [filterLocations, filterSpecialties]] = await Promise.all([
      safeQuery(
        () => dwQuery<{ total_referrals: string }>(
          `SELECT COALESCE(SUM(r.referral_count), 0)::bigint AS total_referrals
           FROM ${BASE_TABLE} r WHERE ${q.where}`,
          q.params
        ),
        "kpiRefs"
      ),
      safeQuery(
        () => dwQuery<{ converted_count: string }>(
          `SELECT COALESCE(SUM(rc.conversion), 0)::bigint AS converted_count
           FROM ${CONV_TABLE} rc
           WHERE ${convFilter(q.where)}`,
          q.params
        ),
        "kpiConv"
      ),
      filterPromise,
    ]);
    const totalReferrals = Number(refsRows[0]?.total_referrals || 0);
    const convertedCount = Number(convRows[0]?.converted_count || 0);
    const conversionPct = totalReferrals > 0 ? Math.round((convertedCount / totalReferrals) * 100) : 0;

    // ── Concurrent batch: trends, matrix, specialty, demographics, location ──
    // Trends and per-specialty conversion data are split between two tables
    // — referrals from agg_referral_matrix, conversions from referral_conversion
    // — and merged in JS below.
    const [trendRefRows, trendConvRows, matrixRows, specRefRows, specConvRows, demoRows, locSpecRows] = await Promise.all([
      // Per-period referral volume (from agg_referral_matrix)
      safeQuery(
        () => dwQuery<{ period: string; total: string }>(
          `SELECT
             to_char(date_trunc('${trendBucket}', r.g_creation_time), '${periodFormat}') AS period,
             COALESCE(SUM(r.referral_count), 0)::bigint AS total
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
           GROUP BY 1
           ORDER BY 1`,
          q.params
        ),
        "trendRefs"
      ),
      // Per-period conversion count (from referral_conversion, scoped via filter)
      safeQuery(
        () => dwQuery<{ period: string; conversions: string }>(
          `SELECT
             to_char(date_trunc('${trendBucket}', rc.g_creation_time), '${periodFormat}') AS period,
             COALESCE(SUM(rc.conversion), 0)::bigint AS conversions
           FROM ${CONV_TABLE} rc
           WHERE ${convFilter(q.where)}
           GROUP BY 1`,
          q.params
        ),
        "trendConv"
      ),
      // Year × from-spec → to-spec matrix.
      safeQuery(
        () => dwQuery<{ year: string; from_spec: string; to_spec: string; cnt: string }>(
          `SELECT
             EXTRACT(YEAR FROM r.g_creation_time)::int::text AS year,
             r.speciality_referred_from AS from_spec,
             r.speciality_referred_to   AS to_spec,
             COALESCE(SUM(r.referral_count), 0)::bigint AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.speciality_referred_from IS NOT NULL
             AND r.speciality_referred_to   IS NOT NULL
           GROUP BY year, from_spec, to_spec`,
          q.params
        ),
        "matrix"
      ),
      // Per-specialty referral volume (from agg_referral_matrix)
      safeQuery(
        () => dwQuery<{ specialty: string; referrals: string }>(
          `SELECT
             r.speciality_referred_to                  AS specialty,
             COALESCE(SUM(r.referral_count), 0)::bigint AS referrals
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND r.speciality_referred_to IS NOT NULL
           GROUP BY r.speciality_referred_to
           ORDER BY referrals DESC`,
          q.params
        ),
        "specialtyRefs"
      ),
      // Per-specialty conversion count (from referral_conversion)
      safeQuery(
        () => dwQuery<{ specialty: string; conversions: string }>(
          `SELECT
             rc.speciality_name                     AS specialty,
             COALESCE(SUM(rc.conversion), 0)::bigint AS conversions
           FROM ${CONV_TABLE} rc
           WHERE ${convFilter(q.where)}
           GROUP BY rc.speciality_name`,
          q.params
        ),
        "specialtyConv"
      ),
      // Demographics: age_group × gender, weighted by referral_count.
      safeQuery(
        () => dwQuery<{ age_group: string; gender: string; cnt: string }>(
          `SELECT
             ${AGE_GROUP_CASE} AS age_group,
             r.gender          AS gender,
             COALESCE(SUM(r.referral_count), 0)::bigint AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND ${AGE_GROUP_CASE} IS NOT NULL
           GROUP BY age_group, r.gender`,
          q.params
        ),
        "demographics"
      ),
      // Location × specialty (referrals).
      safeQuery(
        () => dwQuery<{ location: string; specialty: string; cnt: string }>(
          `SELECT
             r.facility_mapping        AS location,
             r.speciality_referred_to  AS specialty,
             COALESCE(SUM(r.referral_count), 0)::bigint AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.facility_mapping IS NOT NULL
             AND r.speciality_referred_to IS NOT NULL
           GROUP BY r.facility_mapping, r.speciality_referred_to`,
          q.params
        ),
        "locSpec"
      ),
    ]);

    // ── Trends ──
    // Merge per-period referrals (agg_referral_matrix) with per-period
    // conversions (referral_conversion) by the shared period key
    // (YYYY-MM-DD when daily-bucketed, YYYY-MM when monthly).
    const convByPeriod: Record<string, number> = {};
    for (const row of trendConvRows) convByPeriod[row.period] = Number(row.conversions);
    const referralTrends = trendRefRows.map((row) => ({
      period: row.period,
      totalReferrals: Number(row.total),
      // Kept for backward compat with the chart's data contract; not rendered
      // anymore but the response shape stays stable.
      availableInClinic: Number(row.total),
      inClinicConversions: convByPeriod[row.period] || 0,
    }));

    // ── Matrix by year ──
    const matrixByYear: Record<string, { referredFrom: string; referredTo: string; count: number }[]> = {};
    const matrixYearsSet = new Set<string>();
    for (const row of matrixRows) {
      matrixYearsSet.add(row.year);
      if (!matrixByYear[row.year]) matrixByYear[row.year] = [];
      matrixByYear[row.year].push({
        referredFrom: row.from_spec,
        referredTo: row.to_spec,
        count: Number(row.cnt),
      });
    }
    const matrixYears = Array.from(matrixYearsSet).sort();

    // ── Specialty details — REAL conversion rates ──
    // Merge per-specialty referrals (agg_referral_matrix) with per-specialty
    // conversions (referral_conversion) by specialty name.
    const convBySpec: Record<string, number> = {};
    for (const row of specConvRows) convBySpec[row.specialty] = Number(row.conversions);
    const specialtyDetails = specRefRows.map((r) => {
      const referrals = Number(r.referrals);
      const conversions = convBySpec[r.specialty] || 0;
      return {
        specialty: r.specialty,
        referrals,
        inClinicConsults: conversions,
        conversionRate: referrals > 0 ? Math.round((conversions / referrals) * 100) : 0,
        // Page no longer gates on this flag (the "Available in Clinic" column
        // was removed). Keeping the field true so any downstream filtering
        // still pre-existing on this key continues to work.
        isAvailableInClinic: true,
      };
    });

    // ── Demographics (age_group × gender) ──
    const ageBuckets: Record<string, { male: number; female: number; others: number }> = {};
    for (const row of demoRows) {
      if (!row.age_group) continue;
      if (!ageBuckets[row.age_group]) ageBuckets[row.age_group] = { male: 0, female: 0, others: 0 };
      const g = normGender(row.gender);
      const c = Number(row.cnt);
      if (g === "M") ageBuckets[row.age_group].male += c;
      else if (g === "F") ageBuckets[row.age_group].female += c;
      else ageBuckets[row.age_group].others += c;
    }
    const demographics = AGE_ORDER
      .filter((ag) => ageBuckets[ag])
      .map((ag) => ({
        ageGroup: ag,
        male: ageBuckets[ag].male,
        female: ageBuckets[ag].female,
      }));

    const ageTotals: Record<string, number> = {};
    const genderTotals: Record<string, number> = {};
    let topCombo = { ageGroup: "", gender: "", count: 0 };
    for (const ag of Object.keys(ageBuckets)) {
      const { male, female, others } = ageBuckets[ag];
      ageTotals[ag] = male + female + others;
      genderTotals.Male = (genderTotals.Male || 0) + male;
      genderTotals.Female = (genderTotals.Female || 0) + female;
      genderTotals.Others = (genderTotals.Others || 0) + others;
      const pairs: [string, number][] = [["Male", male], ["Female", female], ["Others", others]];
      for (const [g, c] of pairs) {
        if (c > topCombo.count) topCombo = { ageGroup: ag, gender: g, count: c };
      }
    }
    const topAgeEntry = Object.entries(ageTotals).sort((a, b) => b[1] - a[1])[0];
    const topGenderEntry = Object.entries(genderTotals).sort((a, b) => b[1] - a[1])[0];
    const demographicStats = {
      topAgeGroup: topAgeEntry ? { ageGroup: topAgeEntry[0], total: topAgeEntry[1] } : null,
      topGender: topGenderEntry ? { gender: topGenderEntry[0], count: topGenderEntry[1] } : { gender: "", count: 0 },
      topCombo,
    };

    // ── Location × Specialty (top-N specialties stacked per location) ──
    const specTotals: Record<string, number> = {};
    for (const row of locSpecRows) {
      specTotals[row.specialty] = (specTotals[row.specialty] || 0) + Number(row.cnt);
    }
    const topBarSpecialties = Object.entries(specTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([s]) => s);
    const specAvailability: Record<string, boolean> = {};
    for (const s of topBarSpecialties) specAvailability[s] = true;

    const locMap: Record<string, Record<string, number>> = {};
    for (const row of locSpecRows) {
      if (!topBarSpecialties.includes(row.specialty)) continue;
      if (!locMap[row.location]) locMap[row.location] = {};
      locMap[row.location][row.specialty] = Number(row.cnt);
    }
    const sumSpecs = (o: Record<string, unknown>) =>
      Object.entries(o)
        .filter(([k]) => k !== "location")
        .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);

    const allLocationsSorted = Object.entries(locMap)
      .map(([location, specs]) => ({ location, ...specs }))
      .sort((a, b) => sumSpecs(b) - sumSpecs(a));

    // Roll smaller clinics into a synthetic "Others" bar — same TOP_N pattern
    // the OHC Utilization location chart uses. othersBreakdown lets the UI
    // render a clickable footer + breakdown modal.
    const TOP_N = 15;
    const topLocations = allLocationsSorted.slice(0, TOP_N);
    const restLocations = allLocationsSorted.slice(TOP_N);
    const othersEntry: Record<string, unknown> = { location: "Others" };
    const othersBreakdown: { location: string; total: number }[] = [];
    for (const loc of restLocations) {
      const locTotal = sumSpecs(loc);
      if (locTotal > 0) othersBreakdown.push({ location: loc.location as string, total: locTotal });
      for (const spec of topBarSpecialties) {
        othersEntry[spec] = ((othersEntry[spec] as number) || 0) + ((loc as any)[spec] || 0);
      }
    }
    othersBreakdown.sort((a, b) => b.total - a.total);
    const locationBySpecialty = restLocations.length > 0
      ? [...topLocations, othersEntry as any]
      : topLocations;

    return NextResponse.json({
      kpis: {
        totalReferrals,
        // Kept for backward-compat with any chart still reading these keys
        // (the "Available in Clinic" KPI card was removed but the page may
        // still reference these in fallback insight text).
        availableInClinicCount: totalReferrals,
        availableInClinicPct: totalReferrals > 0 ? 100 : 0,
        convertedCount,
        conversionPct,
      },
      filterOptions: {
        locations: filterLocations.map((r) => r.v),
        specialties: filterSpecialties.map((r) => r.v),
      },
      charts: {
        referralTrends,
        matrixByYear,
        matrixYears,
        demographics,
        demographicStats,
        specialtyDetails,
        locationBySpecialty,
        topBarSpecialties,
        specAvailability,
        othersBreakdown,
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
    console.error("OHC Referral API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}

export const GET = withCache(handler, { endpoint: "ohc/referral" });
