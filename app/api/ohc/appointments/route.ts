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

    const rows = await dwQuery<{
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
    );

    return NextResponse.json({ rows });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC appointments raw API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/appointments" });
