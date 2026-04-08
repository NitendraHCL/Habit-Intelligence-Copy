import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";

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
      });
    }

    const [locationRows, specialtyRows] = await Promise.all([
      dwQuery<{ facility_name: string }>(
        `SELECT DISTINCT a.facility_name
         FROM aggregated_table.agg_appointment a
         WHERE a.cug_code_mapped = $1
           AND a.facility_name IS NOT NULL
           AND TRIM(a.facility_name) != ''
         ORDER BY a.facility_name`,
        [cugCode]
      ),

      dwQuery<{ speciality_name: string }>(
        `SELECT DISTINCT a.speciality_name
         FROM aggregated_table.agg_appointment a
         WHERE a.cug_code_mapped = $1
           AND a.speciality_name IS NOT NULL
         ORDER BY a.speciality_name`,
        [cugCode]
      ),
    ]);

    return NextResponse.json({
      genders: ["Male", "Female", "Others"],
      ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
      locations: locationRows.map((r) => r.facility_name),
      specialties: specialtyRows.map((r) => r.speciality_name),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Filters API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
