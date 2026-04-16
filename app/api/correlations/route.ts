// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";

async function handler() {
  return NextResponse.json({
    kpis: {},
    charts: {
      bmiVsBp: [],
      riskDistribution: [],
    },
  });
}

export const GET = withCache(handler, { endpoint: "correlations" });
