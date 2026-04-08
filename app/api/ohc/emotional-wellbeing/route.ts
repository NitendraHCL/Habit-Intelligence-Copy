import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const conditions: string[] = [
      `a.cug_code_mapped = $1`,
      `a.stage IN ('Completed', 'Prescription Sent', 'Re Open')`,
      `a.speciality_name = 'Psychologist'`,
    ];
    const params: unknown[] = [cugCode];
    let idx = 2;

    if (dateFrom) {
      conditions.push(`a.slotstarttime::date >= $${idx}::date`);
      params.push(dateFrom);
      idx++;
    }
    if (dateTo) {
      conditions.push(`a.slotstarttime::date <= $${idx}::date`);
      params.push(dateTo);
      idx++;
    }

    const where = conditions.join(" AND ");

    // KPIs
    const kpiRows = await dwQuery<{
      total_consults: string;
      unique_patients: string;
      repeat_patients: string;
    }>(
      `SELECT
        COUNT(*) AS total_consults,
        COUNT(DISTINCT a.uhid) AS unique_patients,
        (SELECT COUNT(*) FROM (
          SELECT a2.uhid FROM aggregated_table.agg_appointment a2
          WHERE ${where.replace(/\ba\./g, "a2.")}
          GROUP BY a2.uhid HAVING COUNT(*) >= 2
        ) rp) AS repeat_patients
      FROM aggregated_table.agg_appointment a
      WHERE ${where}`,
      params
    );

    const kpi = kpiRows[0];
    const totalConsults = Number(kpi?.total_consults || 0);
    const uniquePatients = Number(kpi?.unique_patients || 0);
    const repeatPatients = Number(kpi?.repeat_patients || 0);

    // Demographics: age
    const ageRows = await dwQuery<{ label: string; count: string }>(
      `SELECT
        CASE
          WHEN a.age_years < 20 THEN '<20'
          WHEN a.age_years BETWEEN 20 AND 35 THEN '20-35'
          WHEN a.age_years BETWEEN 36 AND 40 THEN '36-40'
          WHEN a.age_years BETWEEN 41 AND 60 THEN '41-60'
          WHEN a.age_years > 60 THEN '61+'
          ELSE 'Unknown'
        END AS label,
        COUNT(*) AS count
      FROM aggregated_table.agg_appointment a
      WHERE ${where} AND a.age_years IS NOT NULL
      GROUP BY label ORDER BY label`,
      params
    );

    // Demographics: gender
    const genderRows = await dwQuery<{ label: string; count: string }>(
      `SELECT
        CASE
          WHEN LOWER(TRIM(a.patient_gender)) IN ('male', 'm') THEN 'Male'
          WHEN LOWER(TRIM(a.patient_gender)) IN ('female', 'f') THEN 'Female'
          ELSE 'Others'
        END AS label,
        COUNT(*) AS count
      FROM aggregated_table.agg_appointment a
      WHERE ${where}
      GROUP BY label ORDER BY count DESC`,
      params
    );

    // Demographics: location
    const locationRows = await dwQuery<{ label: string; count: string }>(
      `SELECT a.facility_name AS label, COUNT(*) AS count
      FROM aggregated_table.agg_appointment a
      WHERE ${where} AND a.facility_name IS NOT NULL
      GROUP BY a.facility_name ORDER BY count DESC`,
      params
    );

    // Consult trends (monthly)
    const trendRows = await dwQuery<{ period: string; total_consults: string; unique_patients: string }>(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', a.slotstarttime), 'YYYY-MM') AS period,
        COUNT(*) AS total_consults,
        COUNT(DISTINCT a.uhid) AS unique_patients
      FROM aggregated_table.agg_appointment a
      WHERE ${where}
      GROUP BY DATE_TRUNC('month', a.slotstarttime)
      ORDER BY DATE_TRUNC('month', a.slotstarttime)`,
      params
    );

    return NextResponse.json({
      kpis: { totalConsults, uniquePatients, repeatPatients, totalEwbAssessed: 0 },
      charts: {
        demographics: {
          age: ageRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          gender: genderRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          location: locationRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          shift: [],
        },
        consultTrends: trendRows.map((r) => ({
          period: r.period,
          totalConsults: Number(r.total_consults),
          uniquePatients: Number(r.unique_patients),
        })),
        criticalRisk: { suicidalThoughts: 0, attemptedSelfHarm: 0, previousAttempts: 0, totalCases: 0 },
        substanceUsePct: 0,
        sleepQuality: [],
        sleepDuration: [],
        alcoholHabit: [],
        smokingHabit: [],
        visitPattern: [],
        impressions: [],
        impressionSubcategories: {},
        impressionsByVisitBucket: {},
        anxietyScale: [],
        depressionScale: [],
        selfEsteemScale: [],
      },
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC Emotional Wellbeing API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = handler;
