export type StepPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface WalkthroughStep {
  /** data-walkthrough attribute value to target, or null for center-only steps */
  target: string | null;
  title: string;
  description: string;
  placement: StepPlacement;
  /** Icon name from lucide-react */
  icon?: string;
  /** Action to perform when this step activates */
  action?: "open-kam-comments" | "open-habit-ai" | "close-panels";
  /** Ordered list of pages where this step's feature is anchored. The tour
   *  picks the first accessible page as the route. If no entry passes the
   *  client's `enabledPages` + per-tenant `isPageVisible` gates, the step
   *  is dropped from the tour entirely. Omit for global / always-show steps
   *  (welcome, sidebar, topbar, closing) that don't need navigation. */
  pageSlugs?: string[];
}

// Pages that render charts inside `CVCardDynamic`, which provides KAM
// Comments and Ask Habit AI buttons for free. Used as the route candidate
// list for the KAM Comments, Ask AI, AI Page Summary, and Filters steps.
// Ordered so the most "general" landing page comes first for tenants that
// have it.
const CHART_CARD_PAGES = [
  "/portal/ohc/utilization",
  "/portal/ohc/referral",
  "/portal/ohc/emotional-wellbeing",
  "/portal/ohc/repeat-visits",
  "/portal/ohc/health-insights",
  "/portal/engagement",
  "/portal/employee-experience/nps",
  "/portal/employee-experience/lsmp",
  "/portal/employee-experience/alerts-surveys",
  "/portal/correlations",
  "/portal/action-plan",
];

// Pages with the `data-walkthrough="page-glance"` AI summary banner. Home
// is listed first so tenants that have the overview start there.
const PAGE_GLANCE_PAGES = ["/portal/home", ...CHART_CARD_PAGES];

export const walkthroughSteps: WalkthroughStep[] = [
  // ── Phase 1: Welcome & Layout ──
  // Global; no route, no slug. Shown on whatever page the user opens from.
  {
    target: null,
    title: "Welcome to Habit Intelligence",
    description:
      "This quick tour will walk you through your health analytics portal — from the overview dashboard to detailed service pages, AI-powered insights, and expert annotations. Let's explore!",
    placement: "center",
    icon: "Sparkles",
  },
  {
    target: "sidebar",
    title: "Navigation Sidebar",
    description:
      "This is your navigation hub. Click any section to expand its sub-pages. You can collapse the sidebar for more screen space.",
    placement: "right",
    icon: "LayoutDashboard",
  },
  {
    target: "topbar",
    title: "Quick Actions",
    description:
      "Download reports and check notifications from the top bar. These are available on every page across the portal.",
    placement: "bottom",
    icon: "Download",
  },

  // ── Phase 2: Overview Page ──
  // page-glance / kpi-cards / service-cards hooks are set on /portal/home.
  // AI Page Summary works on every chart-card page too; KPI cards and
  // Service Categories are home-only.
  {
    target: "page-glance",
    title: "AI-Powered Page Summary",
    description:
      "Every analytics page opens with an AI-generated summary of your key metrics. This gives you an instant snapshot — key numbers, trends, and highlights — without scrolling through charts.",
    placement: "bottom",
    icon: "Brain",
    action: "close-panels",
    pageSlugs: PAGE_GLANCE_PAGES,
  },
  {
    target: "kpi-cards",
    title: "Key Performance Indicators",
    description:
      "These cards show your top-line metrics at a glance — registered employees, total services availed, active engagement rates, and cross-service adoption.",
    placement: "bottom",
    icon: "BarChart3",
    pageSlugs: ["/portal/home"],
  },
  {
    target: "service-cards",
    title: "Your Service Categories",
    description:
      "Your organisation's wellness services are organized here — OHC, Annual Health Checks, Employee Engagement, and the Habit App. Click 'View Details' on any card to dive into its dedicated analytics pages. Services are shown based on what your organisation has opted for.",
    placement: "top",
    icon: "Layers",
    pageSlugs: ["/portal/home"],
  },

  // ── Phase 3: OHC Section ──
  {
    target: null,
    title: "OHC — Occupational Health Centre",
    description:
      "The OHC section tracks on-site clinic consultations across Utilisation (visit volumes & trends), Referral (specialist referral patterns), Emotional Wellbeing (mental health screening), Repeat Visits (frequent visitor analysis), and Health Insights (disease landscape by ICD categories). Each page has detailed charts filtered by date, location, gender, and age group.",
    placement: "center",
    icon: "Stethoscope",
    pageSlugs: [
      "/portal/ohc/utilization",
      "/portal/ohc/referral",
      "/portal/ohc/emotional-wellbeing",
      "/portal/ohc/repeat-visits",
      "/portal/ohc/health-insights",
    ],
  },
  {
    target: "kam-comments-btn",
    title: "KAM Comments",
    description:
      "Your Key Account Manager adds contextual annotations explaining trends, dips, or spikes on charts across the portal. Look for the comment icon on chart headers — click it to open the comments thread and reply directly to your KAM.",
    placement: "left",
    icon: "MessageSquare",
    action: "open-kam-comments",
    pageSlugs: CHART_CARD_PAGES,
  },
  {
    target: "ask-ai-btn",
    title: "Ask Habit AI",
    description:
      "Click the sparkle icon on any chart to open the AI assistant. It analyses that chart's data, shows KAM insights, suggests questions, and lets you ask anything about the data — all powered by Habit AI.",
    placement: "left",
    icon: "Sparkles",
    action: "open-habit-ai",
    pageSlugs: CHART_CARD_PAGES,
  },

  // ── Phase 4: AHC Section ──
  {
    target: null,
    title: "AHC — Annual Health Checks",
    description:
      "The AHC section covers your annual health check-up program — Utilisation dashboards, Comparison Insights across cycles, and Action Plans based on health outcomes.",
    placement: "center",
    icon: "ClipboardCheck",
    action: "close-panels",
    pageSlugs: [
      "/portal/ahc/utilization",
      "/portal/ahc/comparison",
      "/portal/ahc/action-plan",
    ],
  },

  // ── Phase 5: Employee Experience ──
  {
    target: null,
    title: "Employee Experience",
    description:
      "This section captures the employee voice and engagement programs: NPS (Net Promoter Score with promoter/detractor analysis), LSMP (Lifestyle & Wellbeing program participation and compliance tracking), and Alerts & Surveys. Every chart here also supports KAM comments and AI analysis.",
    placement: "center",
    icon: "Users",
    pageSlugs: [
      "/portal/employee-experience/nps",
      "/portal/employee-experience/lsmp",
      "/portal/employee-experience/alerts-surveys",
    ],
  },
  {
    target: null,
    title: "Alerts, Surveys & Targeted Actions",
    description:
      "The Alerts & Surveys page is your action centre. It shows smart health alerts triggered by patterns in your data — like low AHC participation or NPS dips.\n\nFrom here you can:\n• Send reminder emails to targeted employee cohorts\n• Launch wellness programs for specific groups (e.g., high-risk, repeat visitors)\n• Deploy surveys to gather feedback\n\nAll actions send a request to your Key Account Manager for review and execution.",
    placement: "center",
    icon: "Bell",
    pageSlugs: ["/portal/employee-experience/alerts-surveys"],
  },

  // ── Phase 6: App Engagement ──
  {
    target: null,
    title: "Habit App Engagement",
    description:
      "Track how employees engage with the Habit wellness app — steps, sleep, meditation, yoga, challenges, and overall digital wellness adoption. See adoption trends, active user rates, and engagement breakdowns across your organisation.",
    placement: "center",
    icon: "Smartphone",
    pageSlugs: ["/portal/engagement"],
  },

  // ── Phase 7: Correlations & Action Plan ──
  {
    target: null,
    title: "Correlations",
    description:
      "Discover relationships between health metrics across services. The correlation matrix shows how OHC utilisation, app engagement, NPS scores, and health outcomes influence each other — helping you identify what drives better results.",
    placement: "center",
    icon: "GitBranch",
    pageSlugs: ["/portal/correlations"],
  },
  {
    target: null,
    title: "Action Plan",
    description:
      "Your consolidated action centre powered by AI. It analyses data across all dashboards to generate prioritised action items — from clinical interventions (AHC gaps, repeat-visit management) to engagement initiatives (app adoption, NPS improvement).\n\nEach action item shows the data source, impact metric, and recommended timeline. You can reach out to your KAM directly to initiate any action.",
    placement: "center",
    icon: "ListChecks",
    pageSlugs: ["/portal/action-plan"],
  },

  // ── Phase 8: Features & Completion ──
  // Filters step spotlights the filter bar (tagged on OHC utilization) on
  // any chart-card page the tenant has.
  {
    target: "filter-bar",
    title: "Filters & Data Controls",
    description:
      "On every analytics page you'll find filter controls — date range pickers, location selectors, gender and age group filters. Charts update in real-time as you filter. You can also expand any chart to full width using the maximize button, and download data from the top bar.",
    placement: "bottom",
    icon: "SlidersHorizontal",
    pageSlugs: CHART_CARD_PAGES,
  },
  {
    target: null,
    title: "You're All Set!",
    description:
      "You're ready to explore your organisation's health & wellness analytics! Remember:\n\n• Look for the comment icon to read KAM expert annotations\n• Click the sparkle icon to ask Habit AI about any chart\n• Use Alerts & Surveys to send reminders and launch programs for targeted cohorts\n• Use filters to slice data by date, location, and demographics\n\nYou can restart this tour anytime by clicking 'Show me Around' at the bottom of the screen.",
    placement: "center",
    icon: "PartyPopper",
  },
];
