// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per key in the response below.
 * Shipped only to SUPER_ADMIN callers and rendered by <DataAuditSection>
 * at the bottom of the page.
 *
 * NOTE: this endpoint is not yet wired to the data warehouse. The handler
 * returns static placeholder values (zeroed KPIs and empty arrays) and
 * reads no warehouse tables — see the TODO at the top of this file. The
 * entries below describe exactly that: there is no source table and no
 * computation yet. Update each entry to its real source(s) and logic when
 * the matching query is implemented against fact_kx / habit_intelligence.
 * ──────────────────────────────────────────────────────────────────── */
const NOT_YET_WIRED =
  "Not yet wired to the data warehouse. The handler returns a static placeholder value (no query is run, no table is read).";

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart:
      "Headline KPIs (Total Enrollments · Active in Care Plan · Completion Rate · Overall Improvement · Avg Duration)",
    sources: [],
    logic:
      "Placeholder. Every KPI returns a hard-coded { value: 0, trend: 0, trendLabel } object. " +
      NOT_YET_WIRED,
  },
  carePlanDistribution: {
    chart: "Care Plan Distribution",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  ageGroupDistribution: {
    chart: "Age Group Distribution",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  genderDistribution: {
    chart: "Gender Distribution",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  improvementStatus: {
    chart: "Improvement Status",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  complianceStatus: {
    chart: "Compliance Status",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  locationDistribution: {
    chart: "Location Distribution",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  carePlanTrends: {
    chart: "Care Plan Trends",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  improvementVsDuration: {
    chart: "Improvement vs Duration",
    sources: [],
    logic: "Placeholder. Returns an empty array. " + NOT_YET_WIRED,
  },
  complianceTriggerPattern: {
    chart: "Compliance Trigger Pattern",
    sources: [],
    logic:
      "Placeholder. Returns an empty matrix ({ rows: [], columns: [], data: [] }). " +
      NOT_YET_WIRED,
  },
};

async function handler() {
  return NextResponse.json({
    kpis: {
      totalEnrollments: { value: 0, trend: 0, trendLabel: "vs Last Year" },
      activeInCarePlan: { value: 0, trend: 0, trendLabel: "Last Month" },
      completionRate: { value: 0, trend: 0, trendLabel: "vs Target" },
      overallImprovement: { value: 0, trend: 0, trendLabel: "Last Quarter" },
      avgDuration: { value: 0, trend: 0, trendLabel: "days vs avg" },
    },
    carePlanDistribution: [],
    ageGroupDistribution: [],
    genderDistribution: [],
    improvementStatus: [],
    complianceStatus: [],
    locationDistribution: [],
    carePlanTrends: [],
    improvementVsDuration: [],
    complianceTriggerPattern: { rows: [], columns: [], data: [] },
  });
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "lsmp" }),
  PROVENANCE
);
