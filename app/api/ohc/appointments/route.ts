import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/**
 * Raw-ish appointment rows for any client-side aggregator
 * (RawAppointment type in lib/aggregation/ohc-utilization.ts).
 *
 * Sourced from aggregated_table.agg_kpi. agg_kpi is rolled up — each
 * row represents a unique (consult_date, consult_hour, uhid, speciality,
 * facility, …) tuple — so the row count is fewer than actual completed
 * appointments. Aggregators relying on row counts may slightly under-
 * report; aggregators relying on the dimensional fields (location,
 * gender, age-group, specialty) work correctly.
 *
 * Column mapping vs. the legacy agg_appointment (which doesn't exist):
 *   slotstarttime → consult_date + consult_hour
 *   facility_name → facility_mapping
 *   age_years     → age
 *   stage filter  → a.stage = 'Completed'
 */
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
      age_years: number | null;
      relationship: string | null;
    }>(
      `SELECT
        TO_CHAR(a.consult_date, 'YYYY-MM-DD')         AS slotdate,
        EXTRACT(DOW FROM a.consult_date)::int          AS dow,
        COALESCE(a.consult_hour, 0)::int               AS hour,
        a.uhid,
        a.facility_mapping                              AS facility_name,
        a.speciality_name,
        a.patient_gender,
        a.age                                           AS age_years,
        a.relationship
      FROM aggregated_table.agg_kpi a
      WHERE a.cug_code_mapped = $1
        AND a.stage = 'Completed'
      ORDER BY a.consult_date`,
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
