// ── No-Code Dashboard Builder — Core Type Definitions ──

// ---------------------------------------------------------------------------
// Chart type identifiers (all 50+ chart types available in the builder)
// ---------------------------------------------------------------------------

export type ChartTypeId =
  // Comparison
  | "bar"
  | "stacked_bar"
  | "grouped_bar"
  | "horizontal_bar"
  | "stacked_bar_100"
  | "bullet"
  | "pictorial_bar"
  // Trends
  | "line"
  | "step_line"
  | "area"
  | "stacked_area"
  | "stacked_area_100"
  | "composed"
  | "candlestick"
  // Proportion
  | "pie"
  | "donut"
  | "half_donut"
  | "nightingale"
  | "funnel"
  | "waterfall"
  | "treemap"
  | "sunburst"
  // Distribution
  | "scatter"
  | "bubble"
  | "boxplot"
  | "heatmap"
  | "calendar_heatmap"
  | "histogram"
  // Relationship
  | "radar"
  | "sankey"
  | "chord"
  | "graph"
  | "parallel"
  // Progress & KPIs
  | "gauge"
  | "ring_progress"
  | "liquid_fill"
  | "progress_bar"
  | "kpi"
  | "stat_card"
  // Hierarchy
  | "tree"
  // Text
  | "word_cloud"
  // Tabular
  | "data_table"
  | "metric_table"
  | "comparison_card"
  // Polar
  | "polar_bar"
  | "polar_line"
  | "polar_area";

// ---------------------------------------------------------------------------
// Renderer — which component actually renders the chart
// ---------------------------------------------------------------------------

export type RendererType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "radar"
  | "scatter"
  | "bubble"
  | "composed"
  | "funnel"
  | "heatmap"
  | "treemap"
  | "sunburst"
  | "echarts"
  | "table"
  | "kpi"
  | "html";

// ---------------------------------------------------------------------------
// Chart Preset — maps a ChartTypeId to its renderer + default config
// ---------------------------------------------------------------------------

export type ChartCategory =
  | "comparison"
  | "trends"
  | "proportion"
  | "distribution"
  | "relationship"
  | "progress"
  | "hierarchy"
  | "text"
  | "tabular"
  | "polar";

export interface ChartPreset {
  id: ChartTypeId;
  label: string;
  description: string;
  category: ChartCategory;
  renderer: RendererType;
  icon: string;
  /** Default visualization overrides applied when this type is selected */
  defaults: Record<string, unknown>;
  /** Minimum required transform fields */
  requiredFields: {
    groupBy?: boolean;
    metric?: boolean;
    metrics?: boolean;
    xKey?: boolean;
    yKey?: boolean;
    zKey?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Data Source — whitelist entry
// ---------------------------------------------------------------------------

export type ColumnType = "timestamp" | "text" | "number" | "boolean";

export interface ColumnDefinition {
  label: string;
  type: ColumnType;
  /** If true, this column can be used in groupBy */
  groupable?: boolean;
  /** If true, this column can be used in metrics (sum, avg, etc.) */
  aggregatable?: boolean;
  /** If true, this column can be used as a filter */
  filterable?: boolean;
}

export interface JoinRelationship {
  /** The foreign table to join */
  foreignTable: string;
  /** Column on this table */
  localColumn: string;
  /** Column on the foreign table */
  foreignColumn: string;
  /** Join type */
  type: "inner" | "left";
}

export interface DataSourceEntry {
  label: string;
  columns: Record<string, ColumnDefinition>;
  cugColumn: string;
  /** Defined join relationships to other tables */
  joins?: Record<string, JoinRelationship>;
}

// ---------------------------------------------------------------------------
// Where conditions (used in chart definitions and query requests)
// ---------------------------------------------------------------------------

export type WhereCondition =
  | { eq: string | number | boolean }
  | { neq: string | number | boolean }
  | { in: (string | number)[] }
  | { not_in: (string | number)[] }
  | { gte: string | number }
  | { lte: string | number }
  | { gt: string | number }
  | { lt: string | number }
  | { between: [string | number, string | number] }
  | { is_null: boolean }
  | { like: string };

// ---------------------------------------------------------------------------
// Data source config (per chart)
// ---------------------------------------------------------------------------

export interface JoinConfig {
  table: string;
  on: { primary: string; foreign: string };
  type?: "inner" | "left";
}

export interface DataSourceConfig {
  table: string;
  where?: Record<string, WhereCondition>;
  /** Optional joins to other tables */
  joins?: JoinConfig[];
}

// ---------------------------------------------------------------------------
// Transform config — how to aggregate and shape the data
// ---------------------------------------------------------------------------

export interface MetricConfig {
  key: string;
  /** "count" | "count_distinct:col" | "sum:col" | "avg:col" | "min:col" | "max:col" */
  metric: string;
  label: string;
  where?: Record<string, WhereCondition>;
}

export interface TransformConfig {
  /** Column or time-function expression: "speciality_name", "month(slotstarttime)" */
  groupBy?: string | string[];
  /** Single metric shorthand: "count", "count_distinct:uhid", "sum:age_years" */
  metric?: string;
  /** Multiple metrics for multi-series charts */
  metrics?: MetricConfig[];
  sort?: "asc" | "desc";
  limit?: number;
  /** Label for aggregated overflow bucket */
  groupRest?: string;
}

// ---------------------------------------------------------------------------
// Visualization config — style / presentation options
// ---------------------------------------------------------------------------

export interface VisualizationConfig {
  colors?: string[] | "default";
  showLegend?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  strokeWidth?: number;
  innerRadius?: string;
  orientation?: "vertical" | "horizontal";
  stacked?: boolean;
  stack100?: boolean;
  curved?: boolean;
  stepped?: boolean;
  format?: "number" | "percentage" | "currency" | "decimal";
  xAxisLabel?: string;
  yAxisLabel?: string;
  height?: number;
  /** For ECharts generic renderer — full ECharts option override */
  echartsOption?: Record<string, unknown>;
  /** Arbitrary renderer-specific options */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Threshold config — conditional formatting for KPIs
// ---------------------------------------------------------------------------

export interface ThresholdConfig {
  max?: number;
  min?: number;
  above?: number;
  color: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Chart Definition — a single chart's complete specification
// ---------------------------------------------------------------------------

export interface ChartDefinition {
  id: string;
  type: ChartTypeId;
  title: string;
  subtitle?: string;
  dataSource: DataSourceConfig;
  transform: TransformConfig;
  visualization?: VisualizationConfig;
  thresholds?: ThresholdConfig[];
  linkGroup?: string;
  emitFilter?: { column: string; on: "click" | "hover" };
  receiveFilter?: string[];
}

// ---------------------------------------------------------------------------
// Section Definition — layout container for charts
// ---------------------------------------------------------------------------

export interface SectionDefinition {
  id: string;
  type: "kpi_row" | "chart_grid" | "full_width" | "tabs";
  columns?: number;
  charts: string[];
  label?: string;
  title?: string;
  subtitle?: string;
}

// ---------------------------------------------------------------------------
// Page Definition — a complete dashboard page
// ---------------------------------------------------------------------------

export interface PageDefinition {
  slug: string;
  title: string;
  subtitle?: string;
  icon: string;
  navGroup: string;
  filters: FilterType[];
  sections: SectionDefinition[];
  charts: Record<string, ChartDefinition>;
}

export type FilterType =
  | "dateRange"
  | "location"
  | "gender"
  | "ageGroup"
  | "specialty"
  | "relationship";

// ---------------------------------------------------------------------------
// Query Engine — request/response types for POST /api/data/query
// ---------------------------------------------------------------------------

export interface QueryRequest {
  dataSource: DataSourceConfig;
  transform: TransformConfig;
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    dateColumn?: string;
    locations?: string[];
    genders?: string[];
    ageGroups?: string[];
    specialties?: string[];
    relationships?: string[];
  };
}

export interface QueryResponse {
  data: Record<string, unknown>[];
  meta: {
    rowCount: number;
    executionMs: number;
    cached: boolean;
  };
}
