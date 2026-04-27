import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Referral API — powered by aggregated_table.agg_referral_matrix
 *
 * Schema (one row per referral event):
 *   g_creation_time         (date)    — referral creation date
 *   uhid                    (text)    — patient identifier
 *   referral_count          (bigint)  — count for the row (typically 1)
 *   speciality_referred_from (text)   — origin specialty (nullable)
 *   speciality_referred_to   (text)   — target specialty
 *   speciality_conversion   (integer) — 0/1 flag, did the referral convert
 *   age                     (integer)
 *   gender                  (text)    — "Male" / "Female"
 *   facility                (text)    — long facility name
 *   facility_mapping        (text)    — short facility identifier ("Chennai SEZ")
 *   cug_code_mapped         (text)    — client tenant code
 *   relationship            (text)    — Employee / Others / etc.
 *
 * Demographic + facility attributes are now embedded in the row, so no
 * JOIN with agg_apptt is required. Conversion rate per specialty is real
 * (SUM(speciality_conversion) / SUM(referral_count)) instead of the
 * hard-coded 100% the old conversion-only table forced us into.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_referral_matrix";

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

    // ── KPIs ──
    const kpiRows = await safeQuery(
      () => dwQuery<{ total_referrals: string; converted_count: string }>(
        `SELECT
           COALESCE(SUM(r.referral_count), 0)::bigint        AS total_referrals,
           COALESCE(SUM(r.speciality_conversion), 0)::bigint AS converted_count
         FROM ${BASE_TABLE} r
         WHERE ${q.where}`,
        q.params
      ),
      "kpi"
    );
    const totalReferrals = Number(kpiRows[0]?.total_referrals || 0);
    const convertedCount = Number(kpiRows[0]?.converted_count || 0);
    const conversionPct = totalReferrals > 0 ? Math.round((convertedCount / totalReferrals) * 100) : 0;

    // ── Concurrent batch: trends, matrix, specialty, demographics, location ──
    const [trendRows, matrixRows, specRows, demoRows, locSpecRows] = await Promise.all([
      // Monthly trends — totalReferrals + actual conversions per month.
      safeQuery(
        () => dwQuery<{ period: string; bucket: string; total: string; conversions: string }>(
          `SELECT
             to_char(date_trunc('month', r.g_creation_time), 'Mon YYYY') AS period,
             to_char(date_trunc('month', r.g_creation_time), 'YYYY-MM')   AS bucket,
             COALESCE(SUM(r.referral_count), 0)::bigint        AS total,
             COALESCE(SUM(r.speciality_conversion), 0)::bigint AS conversions
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
           GROUP BY 1, 2
           ORDER BY bucket`,
          q.params
        ),
        "trends"
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
      // Per-specialty referrals + conversions (real rate).
      safeQuery(
        () => dwQuery<{ specialty: string; referrals: string; conversions: string }>(
          `SELECT
             r.speciality_referred_to                       AS specialty,
             COALESCE(SUM(r.referral_count), 0)::bigint        AS referrals,
             COALESCE(SUM(r.speciality_conversion), 0)::bigint AS conversions
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND r.speciality_referred_to IS NOT NULL
           GROUP BY r.speciality_referred_to
           ORDER BY referrals DESC`,
          q.params
        ),
        "specialty"
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
    const referralTrends = trendRows.map((row) => ({
      period: row.period,
      totalReferrals: Number(row.total),
      // Kept for backward compat with the chart's data contract; not rendered
      // anymore but the response shape stays stable.
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

    // ── Specialty details — REAL conversion rates ──
    const specialtyDetails = specRows.map((r) => {
      const referrals = Number(r.referrals);
      const conversions = Number(r.conversions);
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
    const locationBySpecialty = Object.entries(locMap)
      .map(([location, specs]) => ({ location, ...specs }))
      .sort((a, b) => {
        const sum = (o: Record<string, unknown>) =>
          Object.entries(o)
            .filter(([k]) => k !== "location")
            .reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
        return sum(b) - sum(a);
      });

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
