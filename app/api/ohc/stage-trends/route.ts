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

    // Fetch daily pre-aggregated data from stage_master
    const rows = await dwQuery<{
      date: string;
      stage_group: string;
      count: string;
      unique_patients: string;
    }>(
      `SELECT
        TO_CHAR(slotstarttime, 'YYYY-MM-DD') AS date,
        CASE
          WHEN stage IN ('Completed', 'Prescription Sent', 'Re Open') THEN 'Completed'
          WHEN stage = 'Cancelled' THEN 'Cancelled'
          WHEN stage = 'NoShow' THEN 'NoShow'
          ELSE 'Other'
        END AS stage_group,
        COUNT(*) AS count,
        COUNT(DISTINCT uhid) AS unique_patients
      FROM aggregated_table.stage_master
      WHERE cug_code_reg = $1
      GROUP BY cug_code_reg, TO_CHAR(slotstarttime, 'YYYY-MM-DD'), stage_group
      ORDER BY date, stage_group`,
      [cugCode]
    );

    // Group daily rows into the requested period (weekly/monthly/yearly)
    const periodMap = new Map<string, { completed: number; cancelled: number; noShow: number; uniquePatients: number }>();

    for (const r of rows) {
      const d = r.date; // "YYYY-MM-DD"
      let period: string;
      if (trendView === "weekly") {
        const dt = new Date(d);
        const jan1 = new Date(dt.getFullYear(), 0, 1);
        const days = Math.floor((dt.getTime() - jan1.getTime()) / 86400000);
        const week = Math.ceil((days + jan1.getDay() + 1) / 7);
        period = `${dt.getFullYear()}-W${String(week).padStart(2, "0")}`;
      } else if (trendView === "yearly") {
        period = d.slice(0, 4);
      } else {
        period = d.slice(0, 7);
      }

      if (!periodMap.has(period)) periodMap.set(period, { completed: 0, cancelled: 0, noShow: 0, uniquePatients: 0 });
      const entry = periodMap.get(period)!;
      const count = Number(r.count);
      const patients = Number(r.unique_patients);
      if (r.stage_group === "Completed") {
        entry.completed += count;
        entry.uniquePatients += patients;
      } else if (r.stage_group === "Cancelled") {
        entry.cancelled += count;
      } else if (r.stage_group === "NoShow") {
        entry.noShow += count;
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
