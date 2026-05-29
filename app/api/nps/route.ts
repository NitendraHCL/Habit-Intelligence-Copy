// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per response key. Shipped only to
 * SUPER_ADMIN callers and rendered by <DataAuditSection> at the bottom
 * of the page.
 *
 * IMPORTANT: This route is currently a STUB. The handler is not wired to
 * any warehouse table or Prisma model — it returns a hardcoded payload of
 * zeros / empty arrays (see the TODO at the top of the file). There is no
 * query, no source table, and no computation yet. The provenance below
 * reflects that literal state; update each entry once the route is
 * connected to real sources (per the TODO: dwQuery against fact_kx /
 * habit_intelligence schemas) and the NPS math is implemented.
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Overall NPS · Total Responses · Promoters % · Passives % · Detractors % · Response Rate · YoY Change)",
    sources: [],
    logic:
      "Not yet implemented. The handler returns hardcoded zeros for every KPI " +
      "(overallNPS, totalResponses, promotersPct, passivesPct, detractorsPct, responseRate, yoyChange) — " +
      "no warehouse query runs. Per the file TODO, the intended source is dwQuery against the " +
      "fact_kx / habit_intelligence schemas, and Overall NPS is intended to be %Promoters − %Detractors " +
      "(promoters = 9-10, passives = 7-8, detractors = 0-6 on the 0-10 scale, per the page's own labels), " +
      "but none of that computation exists in this route yet.",
  },
  npsTrends: {
    chart: "NPS Trends Over Time",
    sources: [],
    logic: "Not yet implemented. Returned as an empty array; no query or source table.",
  },
  bySpecialty: {
    chart: "NPS by Specialty (treemap)",
    sources: [],
    logic: "Not yet implemented. Returned as an empty array; no query or source table.",
  },
  byServiceCategory: {
    chart: "NPS by Service Category (radar)",
    sources: [],
    logic: "Not yet implemented. Returned as an empty array; no query or source table.",
  },
  byDiagnosisCategory: {
    chart: "NPS by Location (donut)",
    sources: [],
    logic: "Not yet implemented. Returned as an empty array; no query or source table.",
  },
  demographics: {
    chart: "NPS Submissions Breakdown (scatter by location × feedback channel)",
    sources: [],
    logic:
      "Not yet implemented. Both `demographics` (empty array) and `demoSummary` (all-zero summary object) " +
      "are returned hardcoded; no query or source table.",
  },
  byVisitFrequency: {
    chart: "NPS by Visit Frequency",
    sources: [],
    logic: "Not yet implemented. Returned as an empty array; no query or source table.",
  },
  wordCloud: {
    chart: "Feedback Word Cloud (incl. topPositive / topConcern)",
    sources: [],
    logic:
      "Not yet implemented. `wordCloud` is returned as an empty array and `topPositive` / `topConcern` " +
      "as null; no query or source table.",
  },
};

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

export const GET = withProvenance(
  withCache(handler, { endpoint: "nps" }),
  PROVENANCE
);
