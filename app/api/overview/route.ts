// TODO: Replace with dwQuery() using fact_kx / habit_intelligence schemas
import { NextResponse } from "next/server";
import { withCache } from "@/lib/cache/middleware";

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

export const GET = withCache(handler, { endpoint: "overview" });
