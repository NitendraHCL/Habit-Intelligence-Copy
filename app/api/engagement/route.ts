// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per top-level key this route returns
 * (kpis, engagementTrends, deviceBreakdown, featureUsage, retentionCohort).
 * Shipped only to SUPER_ADMIN callers and rendered by <DataAuditSection>.
 *
 * IMPORTANT — this endpoint is still a stub. The handler performs NO
 * database queries: it returns hardcoded zero KPIs and empty arrays
 * (see the TODO above re: migrating to dwQuery() against the fact_kx /
 * habit_intelligence schemas). The entries below describe exactly that.
 * Update each entry when the real query lands so the audit panel stays
 * truthful.
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Engagement KPIs (Active Users · Avg Daily Active Users · Avg Steps · Avg Sleep Hours · Challenge Participation · Webinar Attendance)",
    sources: [],
    logic:
      "Not yet wired to a data source. The handler returns hardcoded placeholder values (all 0) for every KPI; no warehouse table is queried. Pending migration to dwQuery() against the fact_kx / habit_intelligence schemas.",
  },
  engagementTrends: {
    chart: "Engagement Trends",
    sources: [],
    logic:
      "Not yet wired to a data source. The handler returns an empty array; no warehouse table is queried. Pending migration to dwQuery() against the fact_kx / habit_intelligence schemas.",
  },
  deviceBreakdown: {
    chart: "Device Breakdown",
    sources: [],
    logic:
      "Not yet wired to a data source. The handler returns an empty array; no warehouse table is queried. Pending migration to dwQuery() against the fact_kx / habit_intelligence schemas.",
  },
  featureUsage: {
    chart: "Feature Usage",
    sources: [],
    logic:
      "Not yet wired to a data source. The handler returns an empty array; no warehouse table is queried. Pending migration to dwQuery() against the fact_kx / habit_intelligence schemas.",
  },
  retentionCohort: {
    chart: "Retention Cohort",
    sources: [],
    logic:
      "Not yet wired to a data source. The handler returns an empty array; no warehouse table is queried. Pending migration to dwQuery() against the fact_kx / habit_intelligence schemas.",
  },
};

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

export const GET = withProvenance(
  withCache(handler, { endpoint: "engagement" }),
  PROVENANCE
);
