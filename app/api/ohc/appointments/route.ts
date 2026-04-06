import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const [rows, stageTrends] = await Promise.all([
      dwQuery<{
        slotdate: string;
        dow: number;
        hour: number;
        uhid: string;
        facility_name: string;
        speciality_name: string;
        patient_gender: string;
        age_years: number;
        relation: string | null;
      }>(
        `SELECT
          TO_CHAR(a.slotstarttime, 'YYYY-MM-DD') AS slotdate,
          EXTRACT(DOW FROM a.slotstarttime)::int AS dow,
          EXTRACT(HOUR FROM a.slotstarttime)::int AS hour,
          a.uhid,
          a.facility_name,
          a.speciality_name,
          a.patient_gender,
          a.age_years,
          a.relation
        FROM aggregated_table.agg_appointment a
        WHERE a.cug_code_reg = $1
          AND a.stage IN ('Completed', 'Prescription Sent', 'Re Open')
        ORDER BY a.slotstarttime`,
        [cugCode]
      ),
      dwQuery<{
        period: string;
        stage_group: string;
        count: string;
        unique_patients: string;
      }>(
        `SELECT
          TO_CHAR(DATE_TRUNC('month', a.slotstarttime), 'YYYY-MM') AS period,
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
        GROUP BY DATE_TRUNC('month', a.slotstarttime), stage_group
        ORDER BY DATE_TRUNC('month', a.slotstarttime)`,
        [cugCode]
      ),
    ]);

    // Pivot stage trends into { period, completed, cancelled, noShow, uniquePatients }
    const trendMap = new Map<string, { completed: number; cancelled: number; noShow: number; uniquePatients: number }>();
    for (const r of stageTrends) {
      if (!trendMap.has(r.period)) trendMap.set(r.period, { completed: 0, cancelled: 0, noShow: 0, uniquePatients: 0 });
      const entry = trendMap.get(r.period)!;
      if (r.stage_group === "Completed") {
        entry.completed = Number(r.count);
        entry.uniquePatients = Number(r.unique_patients);
      } else if (r.stage_group === "Cancelled") {
        entry.cancelled = Number(r.count);
      } else if (r.stage_group === "NoShow") {
        entry.noShow = Number(r.count);
      }
    }
    const trends = Array.from(trendMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, entry]) => ({ period, ...entry }));

    return NextResponse.json({ rows, stageTrends: trends });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC appointments raw API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/appointments" });
