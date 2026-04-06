import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const trendView = searchParams.get("trendView") || "monthly";

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

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
      stage_group: string;
      count: string;
      unique_patients: string;
    }>(
      `SELECT
        ${periodFormat} AS period,
        CASE
          WHEN a.stage IN ('Completed', 'Prescription Sent', 'Re Open') THEN 'Completed'
          WHEN a.stage = 'Cancelled' THEN 'Cancelled'
          WHEN a.stage = 'NoShow' THEN 'NoShow'
          ELSE 'Other'
        END AS stage_group,
        COUNT(*) AS count,
        COUNT(DISTINCT a.uhid) AS unique_patients
      FROM aggregated_table.agg_appointment a
      WHERE a.cug_code_reg = $1
      GROUP BY ${periodExpr}, stage_group
      ORDER BY ${periodExpr}, stage_group`,
      [cugCode]
    );

    // Pivot into { period, completed, cancelled, noShow, uniquePatients }
    const periodMap = new Map<string, { completed: number; cancelled: number; noShow: number; uniquePatients: number }>();
    for (const r of rows) {
      if (!periodMap.has(r.period)) periodMap.set(r.period, { completed: 0, cancelled: 0, noShow: 0, uniquePatients: 0 });
      const entry = periodMap.get(r.period)!;
      if (r.stage_group === "Completed") {
        entry.completed = Number(r.count);
        entry.uniquePatients = Number(r.unique_patients);
      } else if (r.stage_group === "Cancelled") {
        entry.cancelled = Number(r.count);
      } else if (r.stage_group === "NoShow") {
        entry.noShow = Number(r.count);
      }
    }

    const trends = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, entry]) => ({ period, ...entry }));

    return NextResponse.json({ trends });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Stage trends API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}
