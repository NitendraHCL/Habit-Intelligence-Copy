// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";

async function handler() {
  return NextResponse.json({
    kpis: {
      activeUsers: 0,
      avgDailyActiveUsers: 0,
      avgSteps: 0,
      avgSleepHours: 0,
      challengeParticipation: 0,
      webinarAttendance: 0,
    },
    engagementTrends: [],
    deviceBreakdown: [],
    featureUsage: [],
    retentionCohort: [],
  });
}

export const GET = withCache(handler, { endpoint: "engagement" });
