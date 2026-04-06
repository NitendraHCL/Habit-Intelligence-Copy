import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const locations = searchParams.get("locations")?.split(",").filter(Boolean);
    const genders = searchParams.get("genders")?.split(",").filter(Boolean);
    const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
    const specialties = searchParams.get("specialties")?.split(",").filter(Boolean);
    const trendView = searchParams.get("trendView") || "monthly";

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const conditions: string[] = [
      `a.cug_code_reg = $1`,
      `a.stage IN ('Completed', 'Prescription Sent', 'Re Open')`,
    ];
    const params: unknown[] = [cugCode];
    let idx = 2;

    if (dateFrom) {
      conditions.push(`a.slotstarttime >= $${idx}::date`);
      params.push(dateFrom);
      idx++;
    }
    if (dateTo) {
      conditions.push(`a.slotstarttime <= $${idx}::date`);
      params.push(dateTo);
      idx++;
    }
    if (locations?.length) {
      conditions.push(`a.facility_name = ANY($${idx})`);
      params.push(locations);
      idx++;
    }
    if (specialties?.length) {
      conditions.push(`a.speciality_name = ANY($${idx})`);
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
      conditions.push(`(${gc.join(" OR ")})`);
    }
    if (ageGroups?.length) {
      const ac = ageGroups.map((ag) => {
        switch (ag) {
          case "<20": return `a.age_years < 20`;
          case "20-35": return `a.age_years BETWEEN 20 AND 35`;
          case "36-40": return `a.age_years BETWEEN 36 AND 40`;
          case "41-60": return `a.age_years BETWEEN 41 AND 60`;
          case "61+": return `a.age_years > 60`;
          default: return "FALSE";
        }
      });
      conditions.push(`(${ac.join(" OR ")})`);
    }

    const whereClause = conditions.join("\n      AND ");

    let periodExpr: string;
    let periodFormat: string;
    switch (trendView) {
      case "weekly":
        periodExpr = "DATE_TRUNC('week', a.slotstarttime)";
        periodFormat = `TO_CHAR(DATE_TRUNC('week', a.slotstarttime), 'YYYY-"W"IW')`;
        break;
      case "yearly":
        periodExpr = "DATE_TRUNC('year', a.slotstarttime)";
        periodFormat = `TO_CHAR(DATE_TRUNC('year', a.slotstarttime), 'YYYY')`;
        break;
      default:
        periodExpr = "DATE_TRUNC('month', a.slotstarttime)";
        periodFormat = `TO_CHAR(DATE_TRUNC('month', a.slotstarttime), 'YYYY-MM')`;
        break;
    }

    const rows = await dwQuery<{
      period: string;
      total_consults: string;
      unique_patients: string;
    }>(
      `SELECT
        ${periodFormat} AS period,
        COUNT(*) AS total_consults,
        COUNT(DISTINCT a.uhid) AS unique_patients
      FROM aggregated_table.agg_appointment a
      WHERE ${whereClause}
      GROUP BY ${periodExpr}
      ORDER BY ${periodExpr}`,
      params
    );

    const visitTrends = rows.map((r) => ({
      period: r.period,
      totalConsults: Number(r.total_consults),
      uniquePatients: Number(r.unique_patients),
    }));

    const avgConsults =
      visitTrends.length > 0
        ? Math.round(
            visitTrends.reduce((s, v) => s + v.totalConsults, 0) /
              visitTrends.length
          )
        : 0;

    return NextResponse.json({ visitTrends, avgConsults });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Visit trends API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
