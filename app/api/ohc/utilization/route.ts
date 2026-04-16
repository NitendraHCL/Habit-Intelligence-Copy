import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

function yoyChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const BASE_TABLE = "aggregated_table.agg_kpi";

function buildQueryParts(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);

  const conditions: string[] = [`a.cug_code_mapped = $1`];
  const prevConditions: string[] = [...conditions];
  const params: unknown[] = [cugCode];
  let idx = 2;
  const hasDateRange = !!(dateFrom && dateTo);

  if (dateFrom) {
    conditions.push(`a.consult_date >= $${idx}::date`);
    prevConditions.push(`a.consult_date >= ($${idx}::date - interval '1 year')`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`a.consult_date <= $${idx}::date`);
    prevConditions.push(`a.consult_date <= ($${idx}::date - interval '1 year')`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    const cond = `a.facility_name = ANY($${idx})`;
    conditions.push(cond);
    prevConditions.push(cond);
    params.push(locations);
    idx++;
  }
  if (specialties?.length) {
    const cond = `a.speciality_name = ANY($${idx})`;
    conditions.push(cond);
    prevConditions.push(cond);
    params.push(specialties);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(a.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(a.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(a.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR a.patient_gender IS NULL OR TRIM(a.patient_gender) = '')";
    });
    const cond = `(${gc.join(" OR ")})`;
    conditions.push(cond);
    prevConditions.push(cond);
  }
  if (ageGroups?.length) {
    const cond = `a.age_group = ANY($${idx})`;
    conditions.push(cond);
    prevConditions.push(cond);
    params.push(ageGroups);
    idx++;
  }

  return {
    params,
    hasDateRange,
    currentWhere: conditions.join(" AND "),
    prevWhere: prevConditions.join(" AND "),
  };
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
      try { return await fn(); } catch (e) { console.error("Query failed:", e); return []; }
    }

    // ── BATCH 1: KPIs ──
    const kpiRows = await safeQuery(() => dwQuery<{
      total_consults: string; unique_patients: string; repeat_patients: string; location_count: string;
    }>(
      `SELECT
        SUM(a.consult_count) AS total_consults,
        SUM(a.unique_patients) AS unique_patients,
        SUM(a.repeat_patients) AS repeat_patients,
        COUNT(DISTINCT a.facility_name) AS location_count
      FROM ${BASE_TABLE} a
      WHERE ${q.currentWhere}`,
      q.params
    ));

    const kpi = kpiRows[0];
    const totalConsults = Number(kpi?.total_consults || 0);
    const uniquePatients = Number(kpi?.unique_patients || 0);
    const repeatPatients = Number(kpi?.repeat_patients || 0);
    const locationCount = Number(kpi?.location_count || 0);
    const repeatRate = uniquePatients > 0 ? Math.round((repeatPatients / uniquePatients) * 100) : 0;

    // ── BATCH 2: Specialty treemap + Location x Specialty (2 concurrent) ──
    const [specRows, locSpecRows] = await Promise.all([
      safeQuery(() => dwQuery<{ name: string; value: string }>(
        `SELECT a.speciality_name AS name, SUM(a.consult_count) AS value
        FROM ${BASE_TABLE} a
        WHERE ${q.currentWhere} AND a.speciality_name IS NOT NULL
        GROUP BY a.speciality_name ORDER BY value DESC`,
        q.params
      )),
      safeQuery(() => dwQuery<{ location: string; specialty: string; total_consults: string }>(
        `SELECT a.facility_name AS location, a.speciality_name AS specialty, SUM(a.consult_count) AS total_consults
        FROM ${BASE_TABLE} a
        WHERE ${q.currentWhere} AND a.facility_name IS NOT NULL AND a.speciality_name IS NOT NULL
        GROUP BY a.facility_name, a.speciality_name ORDER BY total_consults DESC`,
        q.params
      )),
    ]);

    // ── BATCH 3: Demographics + Peak hours (2 concurrent) ──
    const [demoRows, peakRows] = await Promise.all([
      safeQuery(() => dwQuery<{ age_group: string; gender: string; total_consults: string; unique_patients: string }>(
        `SELECT
          a.age_group,
          CASE
            WHEN LOWER(TRIM(a.patient_gender)) IN ('male', 'm') THEN 'M'
            WHEN LOWER(TRIM(a.patient_gender)) IN ('female', 'f') THEN 'F'
            ELSE 'O'
          END AS gender,
          SUM(a.consult_count) AS total_consults,
          SUM(a.unique_patients) AS unique_patients
        FROM ${BASE_TABLE} a
        WHERE ${q.currentWhere} AND a.age_group IS NOT NULL
        GROUP BY a.age_group, gender ORDER BY a.age_group, gender`,
        q.params
      )),
      safeQuery(() => dwQuery<{ day_of_week: string; hour_of_day: string; total_consults: string }>(
        `SELECT
          EXTRACT(DOW FROM a.consult_date) AS day_of_week,
          a.consult_hour AS hour_of_day,
          SUM(a.consult_count) AS total_consults
        FROM ${BASE_TABLE} a
        WHERE ${q.currentWhere} AND a.consult_date IS NOT NULL
        GROUP BY day_of_week, a.consult_hour ORDER BY day_of_week, a.consult_hour`,
        q.params
      )),
    ]);

    // ── BATCH 4: YoY ──
    let yoyConsults: number | null = null;
    let yoyUnique: number | null = null;
    let yoyRepeat: number | null = null;
    if (q.hasDateRange) {
      const prevRows = await safeQuery(() => dwQuery<{ total_consults: string; unique_patients: string; repeat_patients: string }>(
        `SELECT
          SUM(a.consult_count) AS total_consults,
          SUM(a.unique_patients) AS unique_patients,
          SUM(a.repeat_patients) AS repeat_patients
        FROM ${BASE_TABLE} a WHERE ${q.prevWhere}`,
        q.params
      ));
      if (prevRows[0]) {
        yoyConsults = yoyChange(totalConsults, Number(prevRows[0].total_consults || 0));
        yoyUnique = yoyChange(uniquePatients, Number(prevRows[0].unique_patients || 0));
        yoyRepeat = yoyChange(repeatPatients, Number(prevRows[0].repeat_patients || 0));
      }
    }

    // ── Process specialty treemap ──
    const specialtyTreemap = specRows.map((r) => ({ name: r.name, value: Number(r.value) }));

    // ── Process location x specialty ──
    const specTotals: Record<string, number> = {};
    for (const row of locSpecRows) specTotals[row.specialty] = (specTotals[row.specialty] || 0) + Number(row.total_consults);
    const topSpecialties = Object.entries(specTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);
    const locationMap: Record<string, Record<string, number>> = {};
    for (const row of locSpecRows) {
      if (!locationMap[row.location]) locationMap[row.location] = {};
      if (topSpecialties.includes(row.specialty)) locationMap[row.location][row.specialty] = Number(row.total_consults);
    }
    const locationBySpecialty = Object.entries(locationMap)
      .map(([location, specs]) => ({ location, ...specs }))
      .sort((a, b) => {
        const sum = (obj: Record<string, unknown>) =>
          Object.entries(obj).filter(([k]) => k !== "location").reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
        return sum(b) - sum(a);
      });

    // ── Process peak hours ──
    const dowToChart: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const peakHoursData: [number, number, number][] = [];
    let peakMax = 0; let peakCell = { day: 0, hour: 0, count: 0 };
    for (const row of peakRows) {
      const hour = Number(row.hour_of_day);
      if (hour < 6 || hour > 22) continue;
      const dayIdx = dowToChart[Number(row.day_of_week)];
      if (dayIdx === undefined) continue;
      const hourIdx = hour - 6;
      const count = Number(row.total_consults);
      peakHoursData.push([hourIdx, dayIdx, count]);
      if (count > peakMax) { peakMax = count; peakCell = { day: dayIdx, hour: hourIdx, count }; }
    }
    const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const HOUR_NAMES = ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"];

    // ── Process demographics ──
    const SUNBURST_COLORS: Record<string, string> = { "<20": "#818cf8", "20-35": "#0d9488", "36-40": "#d4d4d8", "41-60": "#a78bfa", "61+": "#6366f1" };
    const GENDER_COLORS: Record<string, string> = { M: "#0d9488", F: "#a78bfa", O: "#a1a1aa" };
    const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];
    const ageMap: Record<string, Record<string, { consults: number; patients: number }>> = {};
    for (const row of demoRows) {
      if (!row.age_group) continue;
      if (!ageMap[row.age_group]) ageMap[row.age_group] = {};
      ageMap[row.age_group][row.gender] = { consults: Number(row.total_consults), patients: Number(row.unique_patients) };
    }
    const demographicSunburst = AGE_ORDER.filter((ag) => ageMap[ag]).map((ag) => ({
      name: ag, itemStyle: { color: SUNBURST_COLORS[ag] || "#888" },
      children: (["M", "F", "O"] as const)
        .filter((g) => ageMap[ag][g] && ageMap[ag][g].consults > 0)
        .map((g) => ({ name: g, value: ageMap[ag][g].consults, itemStyle: { color: GENDER_COLORS[g] } })),
    }));
    const genderTotals: Record<string, number> = {};
    const ageGroupTotals: Record<string, number> = {};
    let highestCohort = { ageGroup: "", gender: "", count: 0, patients: 0 };
    for (const row of demoRows) {
      if (!row.age_group) continue;
      const c = Number(row.total_consults); const p = Number(row.unique_patients);
      genderTotals[row.gender] = (genderTotals[row.gender] || 0) + c;
      ageGroupTotals[row.age_group] = (ageGroupTotals[row.age_group] || 0) + c;
      if (c > highestCohort.count) {
        highestCohort = { ageGroup: row.age_group, gender: row.gender === "M" ? "Male" : row.gender === "F" ? "Female" : "Others", count: c, patients: p };
      }
    }
    const topGenderEntry = Object.entries(genderTotals).sort((a, b) => b[1] - a[1])[0];
    const topAgeEntry = Object.entries(ageGroupTotals).sort((a, b) => b[1] - a[1])[0];
    const gl = (g: string) => g === "M" ? "Male" : g === "F" ? "Female" : "Others";

    return NextResponse.json({
      kpis: { totalConsults, uniquePatients, repeatPatients, locationCount, repeatRate, yoyConsults, yoyUnique, yoyRepeat },
      charts: {
        demographicSunburst,
        demographicStats: {
          totalConsults, uniquePatients,
          highestCohort: highestCohort.count > 0 ? highestCohort : null,
          topGender: topGenderEntry ? { gender: gl(topGenderEntry[0]), count: topGenderEntry[1] } : null,
          topAgeGroup: topAgeEntry ? { ageGroup: topAgeEntry[0], count: topAgeEntry[1] } : null,
        },
        locationBySpecialty, topSpecialties,
        visitTrends: [], avgConsults: 0,
        specialtyTreemap,
        peakHours: { data: peakHoursData, max: peakMax, peakDay: DAY_NAMES[peakCell.day] || "", peakHour: HOUR_NAMES[peakCell.hour] || "", peakCount: peakCell.count },
        serviceCategories: [], bubbleBySpecialty: {}, bubbleSpecialties: [],
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC Utilization API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/utilization" });
