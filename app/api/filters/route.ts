import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";

/**
 * Cross-page filter options. Sourced from aggregated_table.agg_kpi —
 * the same fact table /portal/ohc/utilization queries — so dropdown
 * values are guaranteed to return data when picked.
 *
 * Was previously aggregated_table.agg_appointment, which doesn't exist
 * in the warehouse; every consumer was getting empty arrays.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({
        genders: ["Male", "Female", "Others"],
        ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
        locations: [],
        specialties: [],
        relationships: [],
      });
    }

    const [locationRows, specialtyRows, relationshipRows] = await Promise.all([
      dwQuery<{ v: string }>(
        `SELECT DISTINCT a.facility_mapping AS v
         FROM aggregated_table.agg_kpi a
         WHERE a.cug_code_mapped = $1
           AND a.facility_mapping IS NOT NULL
           AND TRIM(a.facility_mapping) != ''
         ORDER BY 1`,
        [cugCode]
      ),
      dwQuery<{ v: string }>(
        `SELECT DISTINCT a.speciality_name AS v
         FROM aggregated_table.agg_kpi a
         WHERE a.cug_code_mapped = $1
           AND a.speciality_name IS NOT NULL
           AND TRIM(a.speciality_name) != ''
         ORDER BY 1`,
        [cugCode]
      ),
      dwQuery<{ v: string }>(
        `SELECT DISTINCT a.relationship AS v
         FROM aggregated_table.agg_kpi a
         WHERE a.cug_code_mapped = $1
           AND a.relationship IS NOT NULL
           AND TRIM(a.relationship) != ''
         ORDER BY 1`,
        [cugCode]
      ),
    ]);

    return NextResponse.json({
      genders: ["Male", "Female", "Others"],
      ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
      locations: locationRows.map((r) => r.v),
      specialties: specialtyRows.map((r) => r.v),
      relationships: relationshipRows.map((r) => r.v),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Filters API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
