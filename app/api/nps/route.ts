// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";

async function handler() {
  return NextResponse.json({
    kpis: {
      overallNPS: 0,
      totalResponses: 0,
      promotersPct: 0,
      passivesPct: 0,
      detractorsPct: 0,
      responseRate: 0,
      yoyChange: 0,
    },
    charts: {
      npsTrends: [],
      bySpecialty: [],
      byServiceCategory: [],
      byDiagnosisCategory: [],
      demographics: [],
      demoSummary: {
        highestCount: 0,
        highestAgeGroup: "",
        highestGender: "",
        topGender: "",
        topGenderCount: 0,
        topAgeGroup: "",
        topAgeGroupCount: 0,
      },
      byVisitFrequency: [],
      wordCloud: [],
      topPositive: null,
      topConcern: null,
    },
  });
}

export const GET = withCache(handler, { endpoint: "nps" });
