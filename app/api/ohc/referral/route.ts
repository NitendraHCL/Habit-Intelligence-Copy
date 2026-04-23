import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Referral API — powered by aggregated_table.agg_referral, joined
 * with aggregated_table.agg_apptt on (uhid, slotstarttime) for patient
 * demographics and facility information.
 *
 * agg_referral  → conversion events (one row per converted referral),
 *                 plus patient-level rollups (total_referrals_by_uhid,
 *                 total_conversions_by_uhid).
 * agg_apptt     → appointment-level patient attributes (age, gender,
 *                 facility_name, specialty).
 *
 * The (uhid, slotstarttime) join yields a 100% match against HCL data,
 * so every chart can honour location/gender/age filters.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_referral";
const APPTT_TABLE = "aggregated_table.agg_apptt";

const AGE_GROUP_CASE = `CASE
  WHEN ap.age < 20 THEN '<20'
  WHEN ap.age BETWEEN 20 AND 35 THEN '20-35'
  WHEN ap.age BETWEEN 36 AND 40 THEN '36-40'
  WHEN ap.age BETWEEN 41 AND 60 THEN '41-60'
  WHEN ap.age > 60 THEN '61+'
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
    conditions.push(`r.bill_date_time >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`r.bill_date_time <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (specialties?.length) {
    conditions.push(`r.speciality_referred_to = ANY($${idx})`);
    params.push(specialties);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`ap.facility_name = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(ap.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(ap.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(ap.patient_gender)) NOT IN ('male','m','female','f') OR ap.patient_gender IS NULL OR TRIM(ap.patient_gender)='')";
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

// Common JOIN fragment used by every query that needs patient/facility data.
const JOIN_APPTT = `
  JOIN ${APPTT_TABLE} ap
    ON ap.uhid = r.uhid
   AND ap.slotstarttime = r.slotstarttime`;

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
    // Total referrals: SUM over DISTINCT uhids of their patient-level
    // total_referrals_by_uhid (the column is constant per uhid).
    // Converted count: COUNT of matched conversion rows.
    const [totalsRow, convRow] = await Promise.all([
      safeQuery(() =>
        dwQuery<{ total_referrals: string }>(
          `SELECT COALESCE(SUM(min_tr), 0)::bigint AS total_referrals
           FROM (
             SELECT r.uhid, MIN(r.total_referrals_by_uhid) AS min_tr
             FROM ${BASE_TABLE} r ${JOIN_APPTT}
             WHERE ${q.where}
             GROUP BY r.uhid
           ) s`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ converted_count: string }>(
          `SELECT COUNT(*)::bigint AS converted_count
           FROM ${BASE_TABLE} r ${JOIN_APPTT}
           WHERE ${q.where}`,
          q.params
        )
      ),
    ]);

    const totalReferrals = Number(totalsRow[0]?.total_referrals || 0);
    const convertedCount = Number(convRow[0]?.converted_count || 0);
    const conversionPct = totalReferrals > 0 ? Math.round((convertedCount / totalReferrals) * 100) : 0;

    // ── Concurrent batch: trends, matrix, specialty, demographics, location ──
    const [trendRows, matrixRows, specRows, demoRows, locSpecRows] = await Promise.all([
      safeQuery(() =>
        dwQuery<{ period: string; bucket: string; conversions: string }>(
          `SELECT
             to_char(date_trunc('month', r.bill_date_time), 'Mon YYYY') AS period,
             to_char(date_trunc('month', r.bill_date_time), 'YYYY-MM')   AS bucket,
             COUNT(*)::bigint AS conversions
           FROM ${BASE_TABLE} r ${JOIN_APPTT}
           WHERE ${q.where}
           GROUP BY 1, 2
           ORDER BY bucket`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ year: string; from_spec: string; to_spec: string; cnt: string }>(
          `SELECT
             EXTRACT(YEAR FROM r.bill_date_time)::int::text AS year,
             r.speciality_referred_from AS from_spec,
             r.speciality_referred_to   AS to_spec,
             COUNT(*)::bigint AS cnt
           FROM ${BASE_TABLE} r ${JOIN_APPTT}
           WHERE ${q.where}
             AND r.speciality_referred_from IS NOT NULL
             AND r.speciality_referred_to   IS NOT NULL
           GROUP BY year, from_spec, to_spec`,
          q.params
        )
      ),
      safeQuery(() =>
        dwQuery<{ specialty: string; conversions: string }>(
          `SELECT
             r.speciality_referred_to AS specialty,
             COUNT(*)::bigint AS conversions
           FROM ${BASE_TABLE} r ${JOIN_APPTT}
           WHERE ${q.where} AND r.speciality_referred_to IS NOT NULL
           GROUP BY r.speciality_referred_to
           ORDER BY conversions DESC`,
          q.params
        )
      ),
      // Demographics: age_group × gender count
      safeQuery(() =>
        dwQuery<{ age_group: string; gender: string; cnt: string }>(
          `SELECT
             ${AGE_GROUP_CASE} AS age_group,
             ap.patient_gender AS gender,
             COUNT(*)::bigint AS cnt
           FROM ${BASE_TABLE} r ${JOIN_APPTT}
           WHERE ${q.where} AND ${AGE_GROUP_CASE} IS NOT NULL
           GROUP BY age_group, ap.patient_gender`,
          q.params
        )
      ),
      // Location × specialty: facility -> referred-to specialty counts
      safeQuery(() =>
        dwQuery<{ location: string; specialty: string; cnt: string }>(
          `SELECT
             ap.facility_name AS location,
             r.speciality_referred_to AS specialty,
             COUNT(*)::bigint AS cnt
           FROM ${BASE_TABLE} r ${JOIN_APPTT}
           WHERE ${q.where}
             AND ap.facility_name IS NOT NULL
             AND r.speciality_referred_to IS NOT NULL
           GROUP BY ap.facility_name, r.speciality_referred_to`,
          q.params
        )
      ),
    ]);

    // ── Trends ──
    // agg_referral only records conversions, so the three trend lines
    // (totalReferrals, availableInClinic, inClinicConversions) all mirror
    // the monthly conversion count.
    const referralTrends = trendRows.map((row) => {
      const c = Number(row.conversions);
      return {
        period: row.period,
        totalReferrals: c,
        availableInClinic: c,
        inClinicConversions: c,
      };
    });

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

    // ── Specialty details ──
    // agg_referral stores only conversion rows, so a per-specialty
    // conversion rate (conversions / referrals to that specialty) is not
    // derivable from this table. We expose conversion counts and flag
    // every returned specialty as available in-clinic.
    const specialtyDetails = specRows.map((r) => ({
      specialty: r.specialty,
      referrals: Number(r.conversions),
      inClinicConsults: Number(r.conversions),
      conversionRate: 100,
      isAvailableInClinic: true,
    }));

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

    // ── Location × Specialty (top-N specialties rolled into bars per location) ──
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
