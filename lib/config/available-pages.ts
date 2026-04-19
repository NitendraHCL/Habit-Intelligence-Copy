// ── All dashboard pages available for CUG-level visibility control ──
// Used by the CUG Management form to render the page checklist.

export interface AvailablePage {
  slug: string;
  label: string;
  group: string;
}

export const AVAILABLE_PAGES: AvailablePage[] = [
  // OHC
  { slug: "/portal/ohc/utilization", label: "Utilization", group: "OHC" },
  { slug: "/portal/ohc/referral", label: "Referral", group: "OHC" },
  { slug: "/portal/ohc/health-insights", label: "Health Insights", group: "OHC" },
  { slug: "/portal/ohc/emotional-wellbeing", label: "Emotional Wellbeing", group: "OHC" },
  { slug: "/portal/ohc/repeat-visits", label: "Repeat Visits", group: "OHC" },

  // Employee Experience
  { slug: "/portal/employee-experience/nps", label: "NPS", group: "Employee Experience" },
  { slug: "/portal/employee-experience/lsmp", label: "LSMP", group: "Employee Experience" },
  { slug: "/portal/employee-experience/alerts-surveys", label: "Alerts & Surveys", group: "Employee Experience" },

  // General
  { slug: "/portal/home", label: "Overview", group: "General" },
  { slug: "/portal/engagement", label: "Engagement", group: "General" },
  { slug: "/portal/correlations", label: "Correlations", group: "General" },
  { slug: "/portal/action-plan", label: "Action Plan", group: "General" },

  // AHC
  { slug: "/portal/ahc/utilization", label: "AHC Utilization", group: "AHC" },
];

export const PAGE_GROUPS = ["OHC", "Employee Experience", "General", "AHC"];

/** All slugs as a flat set for quick lookup. */
export const ALL_PAGE_SLUGS = AVAILABLE_PAGES.map((p) => p.slug);
