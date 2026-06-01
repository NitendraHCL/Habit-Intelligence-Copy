import {
  LayoutDashboard,
  Stethoscope,
  Activity,
  Heart,
  RefreshCw,
  Brain,
  ClipboardCheck,
  BarChart3,
  Users,
  ThumbsUp,
  Dumbbell,
  Bell,
  Smartphone,
  GitBranch,
  ListChecks,
  PenTool,
  Database,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  external?: boolean;
  walkthroughId?: string;
  /** If set, only users with this role see the item. */
  requiredRole?: string;
  /**
   * Slug used for the CUG-level enabled-pages / config-visibility checks,
   * when it differs from `href`. Needed for external links (whose href is
   * an absolute URL that will never appear in a client's enabledPages) so
   * their visibility can be driven by an internal page slug instead.
   */
  accessSlug?: string;
  children?: NavItem[];
}

export const navigation: NavItem[] = [
  {
    label: "Overview",
    href: "/portal/home",
    icon: LayoutDashboard,
  },
  {
    label: "OHC",
    href: "/portal/ohc",
    icon: Stethoscope,
    walkthroughId: "nav-ohc",
    children: [
      { label: "Utilisation", href: "/portal/ohc/utilization", icon: Activity },
      { label: "Referral", href: "/portal/ohc/referral", icon: GitBranch },
      { label: "Emotional Wellbeing", href: "/portal/ohc/emotional-wellbeing", icon: Heart },
      { label: "Repeat Visits", href: "/portal/ohc/repeat-visits", icon: RefreshCw },
      { label: "Health Insights", href: "/portal/ohc/health-insights", icon: Brain },
    ],
  },
  {
    label: "AHC",
    href: "/portal/ahc",
    icon: ClipboardCheck,
    walkthroughId: "nav-ahc",
    // All three AHC links are external (hosted on facility.habithealth.com),
    // so their visibility is gated by the single internal AHC slug
    // (/portal/ahc/utilization) that CUG Management toggles — making the
    // whole group show/hide as one "AHC" switch.
    children: [
      { label: "Utilisation", href: "https://facility.habithealth.com/health-dashboard", icon: BarChart3, external: true, accessSlug: "/portal/ahc/utilization" },
      { label: "Comparison Insights", href: "https://facility.habithealth.com/health-dashboard/comparison", icon: BarChart3, external: true, accessSlug: "/portal/ahc/utilization" },
      { label: "Action Plan", href: "https://facility.habithealth.com/health-dashboard/action-plan", icon: ListChecks, external: true, accessSlug: "/portal/ahc/utilization" },
    ],
  },
  {
    label: "Employee Experience",
    href: "/portal/employee-experience",
    icon: Users,
    walkthroughId: "nav-ee",
    children: [
      { label: "NPS", href: "/portal/employee-experience/nps", icon: ThumbsUp },
      { label: "LSMP", href: "/portal/employee-experience/lsmp", icon: Dumbbell },
      { label: "Alerts & Surveys", href: "/portal/employee-experience/alerts-surveys", icon: Bell },
    ],
  },
  {
    label: "App Engagement",
    href: "/portal/engagement",
    icon: Smartphone,
    walkthroughId: "nav-engagement",
  },
  {
    label: "Correlations",
    href: "/portal/correlations",
    icon: GitBranch,
    walkthroughId: "nav-correlations",
  },
  {
    label: "Action Plan",
    href: "/portal/action-plan",
    icon: ListChecks,
    walkthroughId: "nav-action-plan",
  },
  {
    label: "Dashboard Builder",
    href: "/portal/builder",
    icon: PenTool,
    walkthroughId: "nav-builder",
    requiredRole: "SUPER_ADMIN",
  },
  {
    label: "Data Sources",
    href: "/portal/admin/data-sources",
    icon: Database,
    walkthroughId: "nav-data-sources",
    requiredRole: "SUPER_ADMIN",
  },
  {
    label: "CUG Management",
    href: "/portal/admin/cug-management",
    icon: Building2,
    walkthroughId: "nav-cug-management",
    requiredRole: "SUPER_ADMIN",
  },
  {
    label: "User Management",
    href: "/portal/admin/user-management",
    icon: Users,
    walkthroughId: "nav-user-management",
    requiredRole: "SUPER_ADMIN",
  },
  {
    label: "Custom Dashboards",
    href: "/portal/custom",
    icon: BarChart3,
    walkthroughId: "nav-custom",
    children: [],
  },
];
