// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";

async function handler() {
  return NextResponse.json({
    kpis: {
      totalRepeatPatients: 0,
      avgVisitFrequency: 0,
      totalConsultsByRepeat: 0,
      avgNps: 0,
    },
    charts: {
      chronicVsAcute: { chronic: 0, acute: 0 },
      demographics: {
        ageGroups: [],
        genderSplit: [],
        locationDistribution: [],
      },
      repeatVisitFrequency: [],
      specialtyTreemap: {},
      treemapYears: [],
      conditionTransitions: [],
      visitFrequencyNps: [],
      recurringConditions: { chronic: [], acute: [] },
      repeatUserSegments: [],
      sankeyFlow: { nodes: [], links: [] },
      vitalTotals: { v1: {}, v2: {}, v3: {} },
      cohortVisitFrequency: {},
      cohortYears: [],
    },
    lastUpdated: new Date().toISOString(),
  });
}

export const GET = withCache(handler, { endpoint: "ohc/repeat-visits" });
