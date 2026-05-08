import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Referral API — two-table fact model.
 *
 *   agg_appt_referral_conversion (alias r — BASE_TABLE)
 *     Dim-rich appointment-level fact. One row per
 *     (uhid + slotstarttime + speciality_referred_from + referred_to).
 *     Cols: uhid, slotstarttime, stage, facility_mapping,
 *     cug_code_mapped, relationship, patient_gender, age,
 *     speciality_referred_from, doctor_referred_from,
 *     speciality_referred_to, doctor_referred_to, conversion_status.
 *     Carries the only conversion flag on the warehouse, plus the
 *     specialty / location / demographic dims.
 *
 *   total_referrals (alias t — TOTAL_REFERRALS_TABLE)
 *     Issuance log keyed by g_creation_time. SUM(total_referrals)
 *     gives the true count of referrals issued. Schema is sparse —
 *     only g_creation_time, cug_code_mapped, relationship,
 *     total_referrals — so location / specialty / age / gender
 *     filters can't be honored here (they're silently ignored for
 *     queries that hit this table). Date + cug + relationship are the
 *     only filters that apply.
 *
 * Source per surface:
 *   KPI Total Referrals          → total_referrals (SUM)
 *   KPI Converted / Conv %       → agg (COUNT FILTER converted)
 *   Trends total per period      → total_referrals (g_creation_time)
 *   Trends conversions per period→ agg (slotstarttime, conv flag)
 *   Specialty Conversion bars    → agg (only place with specialty)
 *   Referral Matrix              → agg (specialty pairs)
 *   Demographics                 → agg (age / gender)
 *   Location × Specialty         → agg (facility / specialty)
 *
 * Stage filter on agg: per product spec, "Completed", "Prescription
 * Sent" and "Re Open" all count as completed appointments.
 *
 * ⚠ Known semantic mismatch on HCLT001 (and likely all tenants):
 *   - total_referrals.SUM(total_referrals) ≈ 203k for the default window
 *   - agg COUNT(*) FILTER (conversion_status='Converted') ≈ 1.28M
 *   This is because agg has ~6 rows per issued referral (one per
 *   from-spec → to-spec combo) and `conversion_status` itself is
 *   constant 'Converted' for every existing row. The displayed
 *   "Conversion %" can therefore exceed 100%. A meaningful rate
 *   requires either a real not-converted flag at issuance grain or a
 *   redefinition of "conversion" — see PR / discussion.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_appt_referral_conversion";
const TOTAL_REFERRALS_TABLE = "aggregated_table.total_referrals";
const COMPLETED = "r.stage IN ('Completed', 'Prescription Sent', 'Re Open')";

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

// total_referrals only carries g_creation_time + cug + relationship +
// total_referrals — no specialty / location / age / gender. Filters that
// don't exist on the table are silently dropped.
function buildTotalRefWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const conditions: string[] = [`t.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;
  if (dateFrom) {
    conditions.push(`t.g_creation_time >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`t.g_creation_time <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  return { params, where: conditions.join(" AND ") };
}

function buildQueryParts(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);

  const conditions: string[] = [`r.cug_code_mapped = $1`, COMPLETED];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`r.slotstarttime >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`r.slotstarttime <= ($${idx}::date + interval '1 day')::timestamp`);
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
      if (l === "male") return "LOWER(TRIM(r.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(r.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(r.patient_gender)) NOT IN ('male','m','female','f') OR r.patient_gender IS NULL OR TRIM(r.patient_gender)='')";
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
    const t = buildTotalRefWhere(searchParams, cugCode);

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

    // ── Filter options (unfiltered, scoped to the client tenant only) ──
    // Sourced from the same fact table the page queries so dropdown
    // values always return data when picked.
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
    //   Total Referrals  → SUM(total_referrals) on the issuance log.
    //   Converted Count  → COUNT(*) FILTER (conversion_status = 'Converted') on agg.
    //   Conversion %     → converted / total × 100 (cross-table ratio:
    //                       converted-events / referrals-issued).
    const [totalRefRows, convertedRows, [filterLocations, filterSpecialties]] = await Promise.all([
      safeQuery(
        () => dwQuery<{ total_referrals: string }>(
          `SELECT COALESCE(SUM(t.total_referrals), 0)::bigint AS total_referrals
           FROM ${TOTAL_REFERRALS_TABLE} t
           WHERE ${t.where}`,
          t.params
        ),
        "kpiTotalReferrals"
      ),
      safeQuery(
        () => dwQuery<{ converted_count: string }>(
          `SELECT COUNT(*) FILTER (WHERE r.conversion_status = 'Converted')::bigint AS converted_count
           FROM ${BASE_TABLE} r
           WHERE ${q.where}`,
          q.params
        ),
        "kpiConverted"
      ),
      filterPromise,
    ]);
    const totalReferrals = Number(totalRefRows[0]?.total_referrals || 0);
    const convertedCount = Number(convertedRows[0]?.converted_count || 0);
    const conversionPct = totalReferrals > 0 ? Math.round((convertedCount / totalReferrals) * 100) : 0;

    // ── Concurrent batch: trends (split), matrix, specialty, demographics, location ──
    const [trendTotalRows, trendConvRows, matrixRows, specRows, demoRows, locSpecRows] = await Promise.all([
      // Trend — Total Referrals per period from total_referrals.
      // Bucketed on g_creation_time (referral issuance time).
      safeQuery(
        () => dwQuery<{ period: string; total: string }>(
          `SELECT
             to_char(date_trunc('${trendBucket}', t.g_creation_time), '${periodFormat}') AS period,
             COALESCE(SUM(t.total_referrals), 0)::bigint                                 AS total
           FROM ${TOTAL_REFERRALS_TABLE} t
           WHERE ${t.where}
           GROUP BY 1
           ORDER BY 1`,
          t.params
        ),
        "trendsTotal"
      ),
      // Trend — Converted count per period from agg.
      // Bucketed on slotstarttime (the consult slot for the converted referral).
      safeQuery(
        () => dwQuery<{ period: string; conversions: string }>(
          `SELECT
             to_char(date_trunc('${trendBucket}', r.slotstarttime), '${periodFormat}') AS period,
             COUNT(*) FILTER (WHERE r.conversion_status = 'Converted')::bigint         AS conversions
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
           GROUP BY 1
           ORDER BY 1`,
          q.params
        ),
        "trendsConversions"
      ),
      // Year × from-spec → to-spec matrix.
      safeQuery(
        () => dwQuery<{ year: string; from_spec: string; to_spec: string; cnt: string }>(
          `SELECT
             EXTRACT(YEAR FROM r.slotstarttime)::int::text AS year,
             r.speciality_referred_from                    AS from_spec,
             r.speciality_referred_to                      AS to_spec,
             COUNT(*)::bigint                              AS cnt
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
      // Per-specialty referrals + conversions (single pass).
      safeQuery(
        () => dwQuery<{ specialty: string; referrals: string; conversions: string }>(
          `SELECT
             r.speciality_referred_to                                          AS specialty,
             COUNT(*)::bigint                                                  AS referrals,
             COUNT(*) FILTER (WHERE r.conversion_status = 'Converted')::bigint AS conversions
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
      // Demographics: age_group × gender, weighted by row count.
      safeQuery(
        () => dwQuery<{ age_group: string; gender: string; cnt: string }>(
          `SELECT
             ${AGE_GROUP_CASE} AS age_group,
             r.patient_gender   AS gender,
             COUNT(*)::bigint   AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND ${AGE_GROUP_CASE} IS NOT NULL
           GROUP BY age_group, r.patient_gender`,
          q.params
        ),
        "demographics"
      ),
      // Location × specialty.
      safeQuery(
        () => dwQuery<{ location: string; specialty: string; cnt: string }>(
          `SELECT
             r.facility_mapping        AS location,
             r.speciality_referred_to  AS specialty,
             COUNT(*)::bigint          AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.facility_mapping IS NOT NULL
             AND TRIM(r.facility_mapping) <> ''
             AND r.speciality_referred_to IS NOT NULL
             AND TRIM(r.speciality_referred_to) <> ''
           GROUP BY r.facility_mapping, r.speciality_referred_to`,
          q.params
        ),
        "locSpec"
      ),
    ]);

    // ── Trends ── merge two cross-table per-period series on `period`.
    // The total series (issuance-time) and the converted series
    // (slot-time) generally cover the same months — fill missing
    // sides with 0 so a sparse period in one source still appears.
    const trendMap: Record<string, { period: string; total: number; conversions: number }> = {};
    for (const row of trendTotalRows) {
      const p = row.period;
      if (!trendMap[p]) trendMap[p] = { period: p, total: 0, conversions: 0 };
      trendMap[p].total += Number(row.total);
    }
    for (const row of trendConvRows) {
      const p = row.period;
      if (!trendMap[p]) trendMap[p] = { period: p, total: 0, conversions: 0 };
      trendMap[p].conversions += Number(row.conversions);
    }
    const referralTrends = Object.values(trendMap)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map((row) => ({
        period: row.period,
        totalReferrals: row.total,
        // Backward-compat fields used by the chart.
        availableInClinic: row.total,
        inClinicConversions: row.conversions,
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

export const GET = withCache(handler, { endpoint: "ohc/referral" });
