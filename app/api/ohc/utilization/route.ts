import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

function yoyChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const BASE_TABLE = "aggregated_table.agg_kpi";
const SOURCE_TABLE = "aggregated_table.agg_apptt";
const COMPLETED_KPI = "stage_category = 'Completed'";

// Builds WHERE conditions for agg_kpi queries (alias 'a')
function buildKpiQueryParts(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);

  const conditions: string[] = [`a.cug_code_mapped = $1`, COMPLETED_KPI];
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
    conditions.push(`a.facility_name = ANY($${idx})`);
    prevConditions.push(`a.facility_name = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (specialties?.length) {
    conditions.push(`a.speciality_name = ANY($${idx})`);
    prevConditions.push(`a.speciality_name = ANY($${idx})`);
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
    conditions.push(`a.age_group = ANY($${idx})`);
    prevConditions.push(`a.age_group = ANY($${idx})`);
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

// Builds WHERE conditions for agg_apptt source queries (alias 's').
// Used for unique/repeat patient counts and peak hours — columns differ from agg_kpi.
function buildSrcQueryParts(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);

  const conditions: string[] = [
    `s.cug_code_mapped = $1`,
    `s.stage IN ('Completed', 'Prescription Sent', 'Re Open')`,
  ];
  const prevConditions: string[] = [...conditions];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`s.slotstarttime >= $${idx}::date`);
    prevConditions.push(`s.slotstarttime >= ($${idx}::date - interval '1 year')`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`s.slotstarttime < ($${idx}::date + interval '1 day')`);
    prevConditions.push(`s.slotstarttime < ($${idx}::date - interval '1 year' + interval '1 day')`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    // agg_apptt stores the raw column as facility_mapping
    conditions.push(`s.facility_mapping = ANY($${idx})`);
    prevConditions.push(`s.facility_mapping = ANY($${idx})`);
    params.push(locations);
    idx++;
  }
  if (specialties?.length) {
    conditions.push(`s.speciality_name = ANY($${idx})`);
    prevConditions.push(`s.speciality_name = ANY($${idx})`);
    params.push(specialties);
    idx++;
  }
  if (genders?.length) {
    const gc = genders.map((g) => {
      const l = g.toLowerCase();
      if (l === "male") return "LOWER(TRIM(s.patient_gender)) IN ('male', 'm')";
      if (l === "female") return "LOWER(TRIM(s.patient_gender)) IN ('female', 'f')";
      return "(LOWER(TRIM(s.patient_gender)) NOT IN ('male', 'm', 'female', 'f') OR s.patient_gender IS NULL OR TRIM(s.patient_gender) = '')";
    });
    const cond = `(${gc.join(" OR ")})`;
    conditions.push(cond);
    prevConditions.push(cond);
  }
  if (ageGroups?.length) {
    const ac = ageGroups.map((ag) => {
      switch (ag) {
        case "<20":   return `s.age < 20`;
        case "20-35": return `s.age BETWEEN 20 AND 35`;
        case "36-40": return `s.age BETWEEN 36 AND 40`;
        case "41-60": return `s.age BETWEEN 41 AND 60`;
        case "61+":   return `s.age >= 61`;
        default:      return "FALSE";
      }
    });
    const cond = `(${ac.join(" OR ")})`;
    conditions.push(cond);
    prevConditions.push(cond);
  }

  return {
    params,
    currentWhere: conditions.join(" AND "),
    prevWhere: prevConditions.join(" AND "),
  };
}

function normGender(g: string | null | undefined): "M" | "F" | "O" {
  if (!g) return "O";
  const l = g.trim().toLowerCase();
  if (l === "male" || l === "m") return "M";
  if (l === "female" || l === "f") return "F";
  return "O";
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

    const kpiQ = buildKpiQueryParts(searchParams, cugCode);
    const srcQ = buildSrcQueryParts(searchParams, cugCode);

    async function safeQuery<T>(fn: () => Promise<T[]>): Promise<T[]> {
      try { return await fn(); } catch (e) { console.error("Query failed:", e); return []; }
    }

    // ── BATCH 1: consults + location count (agg_kpi) + unique/repeat patients (agg_apptt) ──
    const [kpiCountRows, patientRows] = await Promise.all([
      safeQuery(() => dwQuery<{ total_consults: string; location_count: string }>(
        `SELECT
          COALESCE(SUM(a.consult_count), 0)::bigint AS total_consults,
          COUNT(DISTINCT a.facility_name) AS location_count
        FROM ${BASE_TABLE} a
        WHERE ${kpiQ.currentWhere}`,
        kpiQ.params
      )),
      // COUNT(DISTINCT uhid) directly from source — no double-counting risk
      safeQuery(() => dwQuery<{ unique_patients: string; repeat_patients: string }>(
        `WITH counts AS (
          SELECT s.uhid, COUNT(*) AS visits
          FROM ${SOURCE_TABLE} s
          WHERE ${srcQ.currentWhere}
          GROUP BY s.uhid
        )
        SELECT
          COUNT(*)::bigint AS unique_patients,
          COUNT(*) FILTER (WHERE visits >= 2)::bigint AS repeat_patients
        FROM counts`,
        srcQ.params
      )),
    ]);

    const totalConsults = Number(kpiCountRows[0]?.total_consults || 0);
    const locationCount = Number(kpiCountRows[0]?.location_count || 0);
    const uniquePatients = Number(patientRows[0]?.unique_patients || 0);
    const repeatPatients = Number(patientRows[0]?.repeat_patients || 0);
    const repeatRate = uniquePatients > 0 ? Math.round((repeatPatients / uniquePatients) * 100) : 0;

    // ── BATCH 2: Specialty treemap + Location × Specialty (concurrent) ──
    const [specRows, locSpecRows] = await Promise.all([
      safeQuery(() => dwQuery<{ name: string; value: string }>(
        `SELECT a.speciality_name AS name, COALESCE(SUM(a.consult_count), 0)::bigint AS value
        FROM ${BASE_TABLE} a
        WHERE ${kpiQ.currentWhere} AND a.speciality_name IS NOT NULL
        GROUP BY a.speciality_name ORDER BY value DESC`,
        kpiQ.params
      )),
      safeQuery(() => dwQuery<{ location: string; specialty: string; total_consults: string }>(
        `SELECT a.facility_name AS location, a.speciality_name AS specialty,
         COALESCE(SUM(a.consult_count), 0)::bigint AS total_consults
        FROM ${BASE_TABLE} a
        WHERE ${kpiQ.currentWhere} AND a.facility_name IS NOT NULL AND a.speciality_name IS NOT NULL
        GROUP BY a.facility_name, a.speciality_name ORDER BY total_consults DESC`,
        kpiQ.params
      )),
    ]);

    // ── BATCH 3: Demographics (agg_kpi) + Peak hours (agg_apptt) + Visit Trends (agg_kpi) ──
    const trendWhere = kpiQ.currentWhere.replace(COMPLETED_KPI, "1=1");
    const [demoRows, peakRows, trendRows] = await Promise.all([
      safeQuery(() => dwQuery<{ age_group: string; gender: string; total_consults: string }>(
        `SELECT
          a.age_group,
          a.patient_gender AS gender,
          COALESCE(SUM(a.consult_count), 0)::bigint AS total_consults
        FROM ${BASE_TABLE} a
        WHERE ${kpiQ.currentWhere} AND a.age_group IS NOT NULL
        GROUP BY a.age_group, a.patient_gender`,
        kpiQ.params
      )),
      // Peak hours: consult_hour was removed from agg_kpi grain, query source directly
      safeQuery(() => dwQuery<{ day_of_week: string; hour_of_day: string; total_consults: string }>(
        `SELECT
          EXTRACT(DOW  FROM s.slotstarttime)::INT AS day_of_week,
          EXTRACT(HOUR FROM s.slotstarttime)::INT AS hour_of_day,
          COUNT(*) AS total_consults
        FROM ${SOURCE_TABLE} s
        WHERE ${srcQ.currentWhere}
        GROUP BY day_of_week, hour_of_day
        ORDER BY day_of_week, hour_of_day`,
        srcQ.params
      )),
      safeQuery(() => dwQuery<{ period: string; stage: string; consults: string }>(
        `SELECT
          to_char(a.consult_date, 'YYYY-MM') AS period,
          a.stage_category AS stage,
          COALESCE(SUM(a.consult_count), 0)::bigint AS consults
        FROM ${BASE_TABLE} a
        WHERE ${trendWhere}
        GROUP BY period, stage
        ORDER BY period`,
        kpiQ.params
      )),
    ]);

    // ── BATCH 4: YoY — consults from agg_kpi, unique/repeat from agg_apptt ──
    let yoyConsults: number | null = null;
    let yoyUnique: number | null = null;
    let yoyRepeat: number | null = null;
    if (kpiQ.hasDateRange) {
      const [prevKpiRows, prevPatientRows] = await Promise.all([
        safeQuery(() => dwQuery<{ total_consults: string }>(
          `SELECT COALESCE(SUM(a.consult_count), 0)::bigint AS total_consults
          FROM ${BASE_TABLE} a WHERE ${kpiQ.prevWhere}`,
          kpiQ.params
        )),
        safeQuery(() => dwQuery<{ unique_patients: string; repeat_patients: string }>(
          `WITH counts AS (
            SELECT s.uhid, COUNT(*) AS visits
            FROM ${SOURCE_TABLE} s
            WHERE ${srcQ.prevWhere}
            GROUP BY s.uhid
          )
          SELECT
            COUNT(*)::bigint AS unique_patients,
            COUNT(*) FILTER (WHERE visits >= 2)::bigint AS repeat_patients
          FROM counts`,
          srcQ.params
        )),
      ]);
      if (prevKpiRows[0]) {
        yoyConsults = yoyChange(totalConsults, Number(prevKpiRows[0].total_consults || 0));
      }
      if (prevPatientRows[0]) {
        yoyUnique = yoyChange(uniquePatients, Number(prevPatientRows[0].unique_patients || 0));
        yoyRepeat = yoyChange(repeatPatients, Number(prevPatientRows[0].repeat_patients || 0));
      }
    }

    // ── Process visit trends ──
    const trendMap: Record<string, { completed: number; cancelled: number; noShow: number; uniquePatients: number }> = {};
    for (const row of trendRows) {
      if (!trendMap[row.period]) {
        trendMap[row.period] = { completed: 0, cancelled: 0, noShow: 0, uniquePatients: 0 };
      }
      const c = Number(row.consults);
      switch (row.stage) {
        case "Completed": trendMap[row.period].completed += c; break;
        case "Cancelled": trendMap[row.period].cancelled += c; break;
        case "No Show":   trendMap[row.period].noShow += c; break;
      }
    }
    const visitTrends = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, ...v }));
    const avgConsults = visitTrends.length > 0
      ? Math.round(visitTrends.reduce((s, v) => s + v.completed, 0) / visitTrends.length)
      : 0;

    // ── Process specialty treemap ──
    const specialtyTreemap = specRows.map((r) => ({ name: r.name, value: Number(r.value) }));

    // ── Process location × specialty ──
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
    let peakMax = 0;
    let peakCell = { day: 0, hour: 0, count: 0 };
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
    const ageMap: Record<string, Record<string, number>> = {};
    for (const row of demoRows) {
      if (!row.age_group) continue;
      const g = normGender(row.gender);
      if (!ageMap[row.age_group]) ageMap[row.age_group] = {};
      ageMap[row.age_group][g] = (ageMap[row.age_group][g] ?? 0) + Number(row.total_consults);
    }
    const demographicSunburst = AGE_ORDER.filter((ag) => ageMap[ag]).map((ag) => ({
      name: ag, itemStyle: { color: SUNBURST_COLORS[ag] || "#888" },
      children: (["M", "F", "O"] as const)
        .filter((g) => ageMap[ag][g] && ageMap[ag][g] > 0)
        .map((g) => ({ name: g, value: ageMap[ag][g], itemStyle: { color: GENDER_COLORS[g] } })),
    }));
    const genderTotals: Record<string, number> = {};
    const ageGroupTotals: Record<string, number> = {};
    let highestCohort = { ageGroup: "", gender: "", count: 0 };
    for (const row of demoRows) {
      if (!row.age_group) continue;
      const g = normGender(row.gender);
      const c = Number(row.total_consults);
      genderTotals[g] = (genderTotals[g] || 0) + c;
      ageGroupTotals[row.age_group] = (ageGroupTotals[row.age_group] || 0) + c;
      if (c > highestCohort.count) {
        highestCohort = { ageGroup: row.age_group, gender: g === "M" ? "Male" : g === "F" ? "Female" : "Others", count: c };
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
        visitTrends, avgConsults,
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
