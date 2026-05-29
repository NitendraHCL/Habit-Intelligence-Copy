// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { withProvenance } from "@/lib/audit/with-provenance";

/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance — one entry per key this route returns (`kpis`,
 * `services`). Shipped only to SUPER_ADMIN callers and rendered by
 * <DataAuditSection> at the bottom of the Home / Overview page.
 *
 * IMPORTANT: this route does NOT yet query any data source. It returns
 * static placeholder values (all KPI numbers are 0; each service card's
 * counts are 0) — see the TODO at the top of the file. The entries below
 * describe exactly that. When this route is wired to real queries
 * (dwQuery against the warehouse, or other endpoints), update these
 * entries to name the actual sources and aggregation logic.
 * ──────────────────────────────────────────────────────────────────── */
const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart:
      "Executive Summary KPIs (Registered Employees · Services Availed · Active Employees · Service Categories · Multi-Service Users)",
    sources: [],
    logic:
      "Not yet wired to a data source. The route currently returns hardcoded placeholder values (every KPI is 0). " +
      "No table or query backs these numbers today — see the route's TODO to migrate to dwQuery() against the " +
      "warehouse schemas.",
  },
  services: {
    chart: "Our Services cards (OHC · Annual Health Checks · Employee Engagement · Habit App Engagement)",
    sources: [],
    logic:
      "Not yet wired to a data source. The route returns a static list of the four service categories with fixed " +
      "name/description/href and totalUsers = 0, totalInteractions = 0 for each. No query backs these counts today.",
  },
};

async function handler() {
  return NextResponse.json({
    kpis: {
      totalEmployees: 0,
      totalServicesAvailed: 0,
      activeEmployees: 0,
      serviceCategories: 0,
      multiCategoryUsers: 0,
    },
    services: [
      {
        key: "ohc",
        name: "OHC",
        description: "Occupational Health Centre consultations including general physician visits, specialist appointments, and on-site clinical care.",
        totalUsers: 0,
        totalInteractions: 0,
        href: "/portal/ohc/utilization",
      },
      {
        key: "ahc",
        name: "Annual Health Checks",
        description: "Annual Health Check-ups covering health risk assessments, preventive screenings, and personalised wellness recommendations.",
        totalUsers: 0,
        totalInteractions: 0,
        href: "/portal/ahc/utilization",
      },
      {
        key: "employee-engagement",
        name: "Employee Engagement & Programs",
        description: "Emotional wellbeing assessments, NPS feedback surveys, and wellness programs driving employee satisfaction and mental health.",
        totalUsers: 0,
        totalInteractions: 0,
        href: "/portal/employee-experience",
      },
      {
        key: "app-engagement",
        name: "Habit App Engagement",
        description: "Mobile health app usage tracking steps, sleep, meditation, yoga, challenges, and overall digital wellness engagement.",
        totalUsers: 0,
        totalInteractions: 0,
        href: "/portal/engagement",
      },
    ],
  });
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "overview" }),
  PROVENANCE
);
