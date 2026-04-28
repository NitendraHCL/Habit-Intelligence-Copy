import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";

/* ────────────────────────────────────────────────────────────────────
 * OHC Emotional Wellbeing API — sourced from aggregated_table.agg_kpi,
 * the same fact table that powers /portal/ohc/utilization.
 *
 * Forced filter: speciality_name = 'Psychologist'. Every metric below
 * is the Psychologist-only slice of OHC consults.
 *
 * Standard page filters (date range, location, gender, age-group,
 * relationship) are honoured against the same agg_kpi columns the
 * utilization route uses, so dropdown picks behave identically.
 *
 * EWB-specific surfaces (sleep, anxiety, depression, critical risk,
 * substance use, etc.) are not derivable from agg_kpi and stay at
 * the empty-defaults the UI already renders gracefully.
 * ──────────────────────────────────────────────────────────────────── */

const BASE_TABLE = "aggregated_table.agg_kpi";
const PSYCH_FILTER = "a.speciality_name = 'Psychologist'";
const COMPLETED = "a.stage = 'Completed'";

const AGE_ORDER = ["<20", "20-35", "36-40", "41-60", "61+"];

function buildWhere(searchParams: URLSearchParams, cugCode: string) {
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const locations = searchParams.get("locations")?.split(",").filter(Boolean);
  const genders = searchParams.get("genders")?.split(",").filter(Boolean);
  const ageGroups = searchParams.get("ageGroups")?.split(",").filter(Boolean);
  const relations = searchParams.get("relations")?.split(",").filter(Boolean);

  const conditions: string[] = [`a.cug_code_mapped = $1`, COMPLETED, PSYCH_FILTER];
  const params: unknown[] = [cugCode];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`a.consult_date >= $${idx}::timestamp`);
    params.push(dateFrom);
    idx++;
  }
  if (dateTo) {
    conditions.push(`a.consult_date <= ($${idx}::date + interval '1 day')::timestamp`);
    params.push(dateTo);
    idx++;
  }
  if (locations?.length) {
    conditions.push(`a.facility_mapping = ANY($${idx})`);
    params.push(locations);
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
    conditions.push(`a.age_group = ANY($${idx})`);
    params.push(ageGroups);
    idx++;
  }
  if (relations?.length) {
    conditions.push(`a.relationship = ANY($${idx})`);
    params.push(relations);
    idx++;
  }

  return { params, where: conditions.join(" AND ") };
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

    const q = buildWhere(searchParams, cugCode);

    const failedQueries: string[] = [];
    async function safeQuery<T>(fn: () => Promise<T[]>, tag: string): Promise<T[]> {
      try { return await fn(); } catch (e) {
        console.error(`Emotional Wellbeing query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return [];
      }
    }

    // ── KPI: total / unique / repeat — Psychologist slice ──
    // Same CTE pattern as the OHC Utilization API: per_uhid groups one row per
    // patient, then we sum, count, and threshold for the three KPIs.
    const kpiRows = await safeQuery(
      () => dwQuery<{ total_consults: string; unique_patients: string; repeat_patients: string }>(
        `WITH per_uhid AS (
          SELECT a.uhid, COUNT(*) AS row_count, SUM(a.total_consult_count) AS consult_count
          FROM ${BASE_TABLE} a
          WHERE ${q.where}
          GROUP BY a.uhid
        )
        SELECT
          COALESCE((SELECT SUM(consult_count) FROM per_uhid), 0)::bigint AS total_consults,
          (SELECT COUNT(*) FROM per_uhid)::bigint                      AS unique_patients,
          (SELECT COUNT(*) FROM per_uhid WHERE row_count >= 2)::bigint AS repeat_patients`,
        q.params
      ),
      "kpi"
    );
    const totalConsults = Number(kpiRows[0]?.total_consults || 0);
    const uniquePatients = Number(kpiRows[0]?.unique_patients || 0);
    const repeatPatients = Number(kpiRows[0]?.repeat_patients || 0);

    // ── Demographics: age × gender × location, plus monthly trends ──
    const [ageRows, genderRows, locationRows, trendRows] = await Promise.all([
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT a.age_group AS label, COALESCE(SUM(a.total_consult_count), 0)::bigint AS count
           FROM ${BASE_TABLE} a
           WHERE ${q.where} AND a.age_group IS NOT NULL
           GROUP BY a.age_group`,
          q.params
        ),
        "ageDemo"
      ),
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT
             CASE
               WHEN LOWER(TRIM(a.patient_gender)) IN ('male', 'm') THEN 'Male'
               WHEN LOWER(TRIM(a.patient_gender)) IN ('female', 'f') THEN 'Female'
               ELSE 'Others'
             END AS label,
             COALESCE(SUM(a.total_consult_count), 0)::bigint AS count
           FROM ${BASE_TABLE} a
           WHERE ${q.where}
           GROUP BY label
           ORDER BY count DESC`,
          q.params
        ),
        "genderDemo"
      ),
      safeQuery(
        () => dwQuery<{ label: string; count: string }>(
          `SELECT a.facility_mapping AS label, COALESCE(SUM(a.total_consult_count), 0)::bigint AS count
           FROM ${BASE_TABLE} a
           WHERE ${q.where} AND a.facility_mapping IS NOT NULL
           GROUP BY a.facility_mapping
           ORDER BY count DESC`,
          q.params
        ),
        "locationDemo"
      ),
      safeQuery(
        () => dwQuery<{ period: string; total_consults: string; unique_patients: string }>(
          `SELECT
             to_char(date_trunc('month', a.consult_date), 'YYYY-MM') AS period,
             COALESCE(SUM(a.total_consult_count), 0)::bigint           AS total_consults,
             COUNT(DISTINCT a.uhid)::bigint                            AS unique_patients
           FROM ${BASE_TABLE} a
           WHERE ${q.where}
           GROUP BY 1
           ORDER BY 1`,
          q.params
        ),
        "trends"
      ),
    ]);

    // Sort age rows in canonical order
    const ageMap: Record<string, number> = {};
    for (const r of ageRows) ageMap[r.label] = Number(r.count);
    const age = AGE_ORDER
      .filter((ag) => ageMap[ag])
      .map((ag) => ({ label: ag, count: ageMap[ag] }));

    return NextResponse.json({
      kpis: {
        totalConsults,
        uniquePatients,
        repeatPatients,
        totalEwbAssessed: 0,
      },
      charts: {
        demographics: {
          age,
          gender: genderRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          location: locationRows.map((r) => ({ label: r.label, count: Number(r.count) })),
          shift: [],
        },
        consultTrends: trendRows.map((r) => ({
          period: r.period,
          totalConsults: Number(r.total_consults),
          uniquePatients: Number(r.unique_patients),
        })),
        // EWB-specific surfaces — not derivable from agg_kpi. Return empty
        // defaults so the UI renders the cards in their no-data state.
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
      meta: {
        hadErrors: failedQueries.length > 0,
        failedQueries,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("OHC Emotional Wellbeing API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withCache(handler, { endpoint: "ohc/emotional-wellbeing" });
