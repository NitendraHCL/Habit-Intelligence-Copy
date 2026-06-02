import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

/* ────────────────────────────────────────────────────────────────────
 * OHC Referral API — single-table fact model.
 *
 * Source: aggregated_table.referral_conversion_updated (alias `r`).
 *   Freshly prepared table that backs every chart on this dashboard.
 *
 *   Columns used here:
 *     uhid, g_creation_time, slotstarttime,
 *     age (int), gender,
 *     speciality_referred_from, doctor_referred_from,
 *     speciality_referred_to,   doctor_referred_to,
 *     referral_facility (referral LOCATION — drives the location filter,
 *       the filter-options dropdown, and the Location × Specialty chart),
 *     cug_code_mapped, relationship,
 *     consumption ("Consumed" | "Not Consumed").
 *
 * Canonical metrics (each row = one referral; no count multiplier):
 *   referrals  = COUNT(*)                                   (Consumed + Not Consumed)
 *   converted  = COUNT(*) FILTER (consumption = 'Consumed')
 *   conversion = converted / referrals × 100
 *
 * Location = referral_facility (replaced the old facility_mapping column
 * when this page moved to referral_conversion_updated).
 *
 * Date filtering uses `g_creation_time` (when the referral was issued)
 * — this is the trend axis the warehouse team intends.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.referral_conversion_updated";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per chart/section, keyed identically
 * to the `charts` keys in the response below (plus `kpis`). Shipped only
 * to SUPER_ADMIN callers and rendered by <DataAuditSection> at the bottom
 * of the page. Edit an entry whenever you change the query that feeds the
 * matching chart so the audit panel stays truthful.
 *
 * Every chart reads the single fact table aggregated_table.referral_conversion
 * (one row = one referral). The shared filter (cug_code_mapped, optional
 * tenant specialty whitelist on speciality_referred_to, g_creation_time date
 * range, speciality_referred_to / referral_facility / gender / age-band filters)
 * is applied to every query. Counts are plain COUNT(*); "converted" is
 * COUNT(*) FILTER (WHERE consumption = 'Consumed').
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Total Referrals · Converted · Conversion %)",
    sources: [BASE_TABLE],
    logic:
      "Over the filtered referral rows: Total Referrals = COUNT(*); Converted = COUNT(*) of rows where " +
      "consumption = 'Consumed'; Conversion % = converted / total × 100 (rounded).",
    sql: "SELECT COUNT(*) AS total_referrals, COUNT(*) FILTER (WHERE r.consumption = 'Consumed') AS converted_count FROM referral_conversion WHERE <filters>.",
  },
  referralTrends: {
    chart: "Referral Trends over time",
    sources: [BASE_TABLE],
    logic:
      "Filtered referrals bucketed by issue date (g_creation_time) using date_trunc — by day when the selected " +
      "window is ≤31 days, otherwise by month. Per bucket: totalReferrals = COUNT(*) and conversions = " +
      "COUNT(*) FILTER (WHERE consumption = 'Consumed').",
    sql: "GROUP BY to_char(date_trunc('day'|'month', r.g_creation_time), fmt) → COUNT(*), COUNT(*) FILTER (consumption='Consumed') ORDER BY period.",
  },
  matrixByYear: {
    chart: "Referral Matrix — From-Specialty → To-Specialty (by year)",
    sources: [BASE_TABLE],
    logic:
      "Filtered referrals with non-blank speciality_referred_from and speciality_referred_to, grouped by " +
      "EXTRACT(YEAR FROM g_creation_time) × speciality_referred_from × speciality_referred_to; count = COUNT(*). " +
      "Returned as a per-year map of {referredFrom, referredTo, count}.",
    sql: "GROUP BY year, speciality_referred_from, speciality_referred_to WHERE both specialties non-empty → COUNT(*).",
  },
  specialtyDetails: {
    chart: "Specialty Details (referrals · conversions · conversion rate)",
    sources: [BASE_TABLE],
    logic:
      "Filtered referrals with non-blank speciality_referred_to, grouped by speciality_referred_to: referrals = " +
      "COUNT(*); inClinicConsults = COUNT(*) FILTER (WHERE consumption = 'Consumed'); conversionRate = " +
      "conversions / referrals × 100 (rounded). Ordered by referrals desc.",
    sql: "GROUP BY r.speciality_referred_to WHERE speciality_referred_to non-empty ORDER BY referrals DESC.",
  },
  demographics: {
    chart: "Demographics (Age Group × Gender) + summary stats",
    sources: [BASE_TABLE],
    logic:
      "Filtered referrals banded into age groups (<20 / 20-35 / 36-40 / 41-60 / 61+ via CASE on age) × gender, " +
      "count = COUNT(*). Gender normalised to Male/Female/Others. demographicStats derives the top age group, top " +
      "gender, and the single largest age×gender combination from these counts.",
    sql: "GROUP BY <age-band CASE>, r.gender WHERE age-band IS NOT NULL → COUNT(*).",
  },
  locationBySpecialty: {
    chart: "Location × Specialty (stacked by clinic)",
    sources: [BASE_TABLE],
    logic:
      "Filtered referrals with non-blank referral_facility and speciality_referred_to, grouped by referral_facility × " +
      "speciality_referred_to (count = COUNT(*)). Page keeps the top 8 specialties as stack segments and the top 15 " +
      "locations by total referrals, rolling the remaining locations into an 'Others' bucket (othersBreakdown).",
    sql: "GROUP BY r.referral_facility, r.speciality_referred_to WHERE both non-empty → COUNT(*); top 8 specialties / top 15 locations applied in JS.",
  },
};

// Tenant-specific specialty whitelist. CISCO01 only wants these seven
// referred-to specialties surfaced on the Referral dashboard; every
// other client sees the full set. Applies to KPIs, charts, and the
// filter-options dropdown.
const TENANT_SPECIALTY_WHITELIST: Record<string, string[]> = {
  CISCO01: [
    "Obstetrics And Gynecology",
    "General Physician",
    "Family Medicine",
    "Internal Medicine",
    "Physiotherapy",
    "Psychologist",
    "Dietetics",
  ],
};

// Volume / converted expressions — used wherever we need a count.
const REFERRALS_SUM = `COUNT(*)::bigint`;
const CONVERTED_SUM = `COUNT(*) FILTER (WHERE r.consumption = 'Consumed')::bigint`;

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

  // Tenant-level specialty restriction (CISCO01 today). Pinned ahead of
  // user filters so all downstream charts and KPIs respect it.
  const whitelist = TENANT_SPECIALTY_WHITELIST[cugCode];
  if (whitelist?.length) {
    conditions.push(`r.speciality_referred_to = ANY($${idx})`);
    params.push(whitelist);
    idx++;
  }

  if (dateFrom) {
    conditions.push(`r.g_creation_time >= $${idx}::date`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`r.g_creation_time <= ($${idx}::date + interval '1 day')`);
    params.push(dateTo);
    idx++;
  }
  if (specialties?.length) {
    conditions.push(`r.speciality_referred_to = ANY($${idx})`);
    params.push(specialties);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`r.referral_facility = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(r.gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(r.gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(r.gender)) NOT IN ('male','m','female','f') OR r.gender IS NULL OR TRIM(r.gender) = '')";
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

    // Trend bucketing: ≤31-day windows group by day, otherwise by month.
    const dateFromParam = searchParams.get("dateFrom");
    const dateToParam = searchParams.get("dateTo");
    let trendBucket: "day" | "month" = "month";
    if (dateFromParam && dateToParam) {
      const days = Math.round((Date.parse(dateToParam) - Date.parse(dateFromParam)) / 86400000) + 1;
      if (days > 0 && days <= 31) trendBucket = "day";
    }
    const periodFormat = trendBucket === "day" ? "YYYY-MM-DD" : "YYYY-MM";

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Referral query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // ── Filter options (unfiltered apart from tenant scope) ──
    // Tenant whitelist is applied here too so dropdowns never offer a
    // specialty that the rest of the page is configured to hide.
    const filterWhitelist = TENANT_SPECIALTY_WHITELIST[cugCode];
    const filterPromise = Promise.all([
      safeQuery(
        () => dwQuery<{ v: string }>(
          `SELECT DISTINCT r.referral_facility AS v
           FROM ${BASE_TABLE} r
           WHERE r.cug_code_mapped = $1
             AND r.referral_facility IS NOT NULL AND TRIM(r.referral_facility) <> ''
             ${filterWhitelist ? "AND r.speciality_referred_to = ANY($2)" : ""}
           ORDER BY 1`,
          filterWhitelist ? [cugCode, filterWhitelist] : [cugCode]
        ),
        "filterLocations"
      ),
      safeQuery(
        () => dwQuery<{ v: string }>(
          `SELECT DISTINCT r.speciality_referred_to AS v
           FROM ${BASE_TABLE} r
           WHERE r.cug_code_mapped = $1
             AND r.speciality_referred_to IS NOT NULL AND TRIM(r.speciality_referred_to) <> ''
             ${filterWhitelist ? "AND r.speciality_referred_to = ANY($2)" : ""}
           ORDER BY 1`,
          filterWhitelist ? [cugCode, filterWhitelist] : [cugCode]
        ),
        "filterSpecialties"
      ),
    ]);

    // ── KPIs ──
    // Single-pass: total = COUNT(*); converted = filtered COUNT.
    const [kpiRows, [filterLocations, filterSpecialties]] = await Promise.all([
      safeQuery(
        () => dwQuery<{ total_referrals: string; converted_count: string }>(
          `SELECT
             ${REFERRALS_SUM} AS total_referrals,
             ${CONVERTED_SUM} AS converted_count
           FROM ${BASE_TABLE} r
           WHERE ${q.where}`,
          q.params
        ),
        "kpi"
      ),
      filterPromise,
    ]);
    const totalReferrals = Number(kpiRows[0]?.total_referrals || 0);
    const convertedCount = Number(kpiRows[0]?.converted_count || 0);
    const conversionPct = totalReferrals > 0 ? Math.round((convertedCount / totalReferrals) * 100) : 0;

    // ── Concurrent batch: trends, matrix, specialty, demographics, location ──
    const [trendRows, matrixRows, specRows, demoRows, locSpecRows] = await Promise.all([
      // Trend per period (referrals + conversions, single query).
      safeQuery(
        () => dwQuery<{ period: string; total: string; conversions: string }>(
          `SELECT
             to_char(date_trunc('${trendBucket}', r.g_creation_time), '${periodFormat}') AS period,
             ${REFERRALS_SUM} AS total,
             ${CONVERTED_SUM} AS conversions
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
           GROUP BY 1
           ORDER BY 1`,
          q.params
        ),
        "trends"
      ),
      // Year × from-spec → to-spec matrix.
      safeQuery(
        () => dwQuery<{ year: string; from_spec: string; to_spec: string; cnt: string }>(
          `SELECT
             EXTRACT(YEAR FROM r.g_creation_time)::int::text AS year,
             r.speciality_referred_from                      AS from_spec,
             r.speciality_referred_to                        AS to_spec,
             ${REFERRALS_SUM}                                AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.speciality_referred_from IS NOT NULL
             AND TRIM(r.speciality_referred_from) <> ''
             AND r.speciality_referred_to   IS NOT NULL
             AND TRIM(r.speciality_referred_to) <> ''
           GROUP BY year, from_spec, to_spec`,
          q.params
        ),
        "matrix"
      ),
      // Per-specialty referrals + conversions.
      safeQuery(
        () => dwQuery<{ specialty: string; referrals: string; conversions: string }>(
          `SELECT
             r.speciality_referred_to AS specialty,
             ${REFERRALS_SUM}         AS referrals,
             ${CONVERTED_SUM}         AS conversions
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.speciality_referred_to IS NOT NULL
             AND TRIM(r.speciality_referred_to) <> ''
           GROUP BY r.speciality_referred_to
           ORDER BY referrals DESC`,
          q.params
        ),
        "specialty"
      ),
      // Demographics: age_group × gender, weighted by COUNT.
      safeQuery(
        () => dwQuery<{ age_group: string; gender: string; cnt: string }>(
          `SELECT
             ${AGE_GROUP_CASE} AS age_group,
             r.gender          AS gender,
             ${REFERRALS_SUM}  AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND ${AGE_GROUP_CASE} IS NOT NULL
           GROUP BY age_group, r.gender`,
          q.params
        ),
        "demographics"
      ),
      // Location × specialty.
      safeQuery(
        () => dwQuery<{ location: string; specialty: string; cnt: string }>(
          `SELECT
             r.referral_facility        AS location,
             r.speciality_referred_to  AS specialty,
             ${REFERRALS_SUM}          AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.referral_facility IS NOT NULL
             AND TRIM(r.referral_facility) <> ''
             AND r.speciality_referred_to IS NOT NULL
             AND TRIM(r.speciality_referred_to) <> ''
           GROUP BY r.referral_facility, r.speciality_referred_to`,
          q.params
        ),
        "locSpec"
      ),
    ]);

    // ── Trends ──
    const referralTrends = trendRows.map((row) => ({
      period: row.period,
      totalReferrals: Number(row.total),
      // Backward-compat fields the chart still reads.
      availableInClinic: Number(row.total),
      inClinicConversions: Number(row.conversions),
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

    // ── Specialty details with real conversion rates ──
    const specialtyDetails = specRows.map((s) => {
      const referrals = Number(s.referrals);
      const conversions = Number(s.conversions);
      return {
        specialty: s.specialty,
        referrals,
        inClinicConsults: conversions,
        conversionRate: referrals > 0 ? Math.round((conversions / referrals) * 100) : 0,
        // Page no longer gates on this flag; kept for backward compat.
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
        // Backward-compat keys (Available-in-Clinic card was removed but
        // some callers / fallback summaries still read these):
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

export const GET = withProvenance(
  withCache(handler, { endpoint: "ohc/referral" }),
  PROVENANCE
);
