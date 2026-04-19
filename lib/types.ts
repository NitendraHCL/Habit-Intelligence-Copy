// ── Role & Auth Types ──

export type UserRole =
  | "SUPER_ADMIN"
  | "INTERNAL_OPS"
  | "KAM"
  | "CLIENT_ADMIN"
  | "CLIENT_VIEWER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clientId: string | null;
  avatarUrl: string | null;
}

export interface AuthSession {
  user: SessionUser;
  token: string;
  expiresAt: Date;
}

// ── Client Types ──

export interface Client {
  id: string;
  cugCode: string;
  cugName: string;
  /** JSON array of enabled page slugs. null = all pages visible. */
  enabledPages: string[] | null;
  /** When true, custom dashboards for this CUG are visible by default. */
  hasCustomDashboards: boolean;
}

// ── Metric System Types ──

export type MetricCategory =
  | "OHC"
  | "AHC"
  | "NPS"
  | "LSMP"
  | "ENGAGEMENT"
  | "EMOTIONAL_WELLBEING";

export type ChartType =
  | "KPI"
  | "BAR"
  | "STACKED_BAR"
  | "LINE"
  | "AREA"
  | "PIE"
  | "TREEMAP"
  | "HEATMAP"
  | "RADAR"
  | "BUBBLE"
  | "SANKEY"
  | "TABLE"
  | "SUNBURST";

export type CommentType =
  | "OBSERVATION"
  | "RECOMMENDATION"
  | "ACTION_ITEM"
  | "HIGHLIGHT";

export interface MetricDefinition {
  metricKey: string;
  name: string;
  description: string | null;
  category: MetricCategory;
  chartType: ChartType;
  derivedTable: string;
  sqlExpression: string | null;
  unit: string;
  whyItMatters: string | null;
  benchmarkNote: string | null;
  supportedFilters: string[];
  isActive: boolean;
}

export interface MetricPlacement {
  metricKey: string;
  pageSlug: string;
  section: "kpi_row" | "chart_grid" | "detail_section";
  sortOrder: number;
  colSpan: number;
  isActive: boolean;
}

export interface ClientMetricOverride {
  metricKey: string;
  pageSlug: string;
  isHidden: boolean;
  sortOrderOverride: number | null;
  titleOverride: string | null;
  colSpanOverride: number | null;
  notes: string | null;
}

export interface DashboardAnnotation {
  id: string;
  metricKey: string | null;
  pageSlug: string;
  commentText: string;
  commentType: CommentType;
  authorName: string;
  isVisibleToClient: boolean;
  isPinned: boolean;
  filterContext: Record<string, unknown> | null;
  createdAt: string;
}

// ── Page Config API Response ──

export interface PageMetricConfig {
  key: string;
  name: string;
  description: string | null;
  chartType: ChartType;
  section: string;
  sortOrder: number;
  colSpan: number;
  isHidden: boolean;
  unit: string;
  derivedTable: string;
  supportedFilters: string[];
  whyItMatters: string | null;
  benchmarkNote: string | null;
  annotations: DashboardAnnotation[];
}

export interface PageConfigResponse {
  page: {
    slug: string;
    title: string;
    navGroup: string;
  };
  metrics: PageMetricConfig[];
}

// ── Metric Data API Response ──

export interface MetricDataResponse {
  metricKey: string;
  chartType: ChartType;
  unit: string;
  data: Record<string, unknown>[] | Record<string, unknown>;
  meta?: {
    total?: number;
    dateRange?: { from: string; to: string };
    filters?: Record<string, string>;
  };
}

// ── Filter Types ──

export interface DashboardFilters {
  cugCode: string;
  dateFrom?: string;
  dateTo?: string;
  facility?: string;
  specialty?: string;
  gender?: string;
  ageGroup?: string;
}
