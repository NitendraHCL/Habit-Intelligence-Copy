import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

const BASE_TABLE = "aggregated_table.agg_referral_kpi";

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
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);

  const conditions: string[] = [`r.cug_code_mapped = $1`];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`r.consult_month >= date_trunc('month', $${idx}::date)`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`r.consult_month <= date_trunc('month', $${idx}::date)`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`r.facility_name = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (specialties?.length) {
    conditions.push(`r.speciality_referred_to = ANY($${idx})`);
    params.push(specialties);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(r.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(r.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(r.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR r.patient_gender IS NULL OR TRIM(r.patient_gender) = '')";
    });
    conditions.push(`(${gc.join(" OR ")})`);
  }
  if (ageGroups?.length) {
    conditions.push(`r.age_group = ANY($${idx})`);
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

    async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
      try {
        return await fn();
      } catch (e) {
        console.error("Referral query failed:", e);
        return [];
      }
    }

    // ── KPIs ──
    const kpiRows = await safeQuery(() =>
      dwQuery<{ total_referrals: string; converted_count: string }>(
        `SELECT
           COALESCE(SUM(r.referral_count), 0)::bigint AS total_referrals,
           COALESCE(SUM(CASE WHEN r.converted = 'Conversion' THEN r.referral_count ELSE 0 END), 0)::bigint AS converted_count
         FROM ${BASE_TABLE} r
         WHERE ${q.where}`,
        q.params
      )
    );
    const totalReferrals = Number(kpiRows[0]?.total_referrals || 0);
    const convertedCount = Number(kpiRows[0]?.converted_count || 0);
    const conversionPct = totalReferrals > 0 ? Math.round((convertedCount / totalReferrals) * 100) : 0;

    // ── Concurrent batch: trends, matrix, demographics, specialty, location ──
    const [trendRows, matrixRows, demoRows, specRows, locSpecRows] = await Promise.all([
      safeQuery(() =>
        dwQuery<{ month: string; total_referrals: string; converted_count: string }>(
          `SELECT
             to_char(r.consult_month, 'Mon YYYY') AS month,
             COALESCE(SUM(r.referral_count), 0)::bigint AS total_referrals,
             COALESCE(SUM(CASE WHEN r.converted = 'Conversion' THEN r.referral_count ELSE 0 END), 0)::bigint AS converted_count
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
           GROUP BY r.consult_month
           ORDER BY r.consult_month`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ year: string; from_spec: string; to_spec: string; cnt: string }>(
          `SELECT
             EXTRACT(YEAR FROM r.consult_month)::int::text AS year,
             r.referring_speciality AS from_spec,
             r.speciality_referred_to AS to_spec,
             COALESCE(SUM(r.referral_count), 0)::bigint AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.referring_speciality IS NOT NULL
             AND r.speciality_referred_to IS NOT NULL
           GROUP BY year, from_spec, to_spec`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ age_group: string; gender: string; cnt: string }>(
          `SELECT
             r.age_group,
             r.patient_gender AS gender,
             COALESCE(SUM(r.referral_count), 0)::bigint AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND r.age_group IS NOT NULL
           GROUP BY r.age_group, r.patient_gender`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ specialty: string; referrals: string; converted: string }>(
          `SELECT
             r.speciality_referred_to AS specialty,
             COALESCE(SUM(r.referral_count), 0)::bigint AS referrals,
             COALESCE(SUM(CASE WHEN r.converted = 'Conversion' THEN r.referral_count ELSE 0 END), 0)::bigint AS converted
           FROM ${BASE_TABLE} r
           WHERE ${q.where} AND r.speciality_referred_to IS NOT NULL
           GROUP BY r.speciality_referred_to
           ORDER BY referrals DESC`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ location: string; specialty: string; cnt: string }>(
          `SELECT
             r.facility_name AS location,
             r.speciality_referred_to AS specialty,
             COALESCE(SUM(r.referral_count), 0)::bigint AS cnt
           FROM ${BASE_TABLE} r
           WHERE ${q.where}
             AND r.facility_name IS NOT NULL
             AND r.speciality_referred_to IS NOT NULL
           GROUP BY r.facility_name, r.speciality_referred_to`,
          q.params
        )
      ),
    ]);

    // ── Trends ──
    const referralTrends = trendRows.map((r) => ({
      period: r.month,
      totalReferrals: Number(r.total_referrals),
      availableInClinic: 0,
      inClinicConversions: Number(r.converted_count),
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

    // ── Demographics ──
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

    // ── Specialty details ──
    const specialtyDetails = specRows.map((r) => {
      const referrals = Number(r.referrals);
      const converted = Number(r.converted);
      return {
        specialty: r.specialty,
        referrals,
        conversionRate: referrals > 0 ? Math.round((converted / referrals) * 100) : 0,
        inClinicConsults: converted,
        isAvailableInClinic: true,
      };
    });

    // ── Location × Specialty ──
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
        availableInClinicCount: 0,
        availableInClinicPct: 0,
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
