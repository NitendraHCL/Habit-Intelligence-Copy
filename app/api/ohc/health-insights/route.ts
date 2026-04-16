// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";

async function handler() {
  return NextResponse.json({
    years: [],
    categories: [],
    ageGroups: [],
    facilities: [],
    categoryTreemap: [],
    conditionBreakdown: [],
    chronicAcute: {
      chronicCount: 0,
      chronicPatients: 0,
      acuteCount: 0,
      acutePatients: 0,
    },
    seasonalData: {
      seasonalCount: 0,
      seasonalPatients: 0,
      nonSeasonalCount: 0,
      nonSeasonalPatients: 0,
    },
    demoAge: {},
    demoGender: {},
    demoLocation: {},
    conditionTrends: [],
    conditionTrendsYearly: [],
    diseaseCombinations: [],
    symptomMapping: [],
    vitalsTrend: {},
    seasonalTrends: {},
  });
}

export const GET = withCache(handler, { endpoint: "ohc/health-insights" });
