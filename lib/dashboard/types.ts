// ── No-Code Dashboard Builder — Core Type Definitions ──

// ---------------------------------------------------------------------------
// Chart type identifiers (all 50+ chart types available in the builder)
// ---------------------------------------------------------------------------

export type ChartTypeId =
  // Layout / non-data
  | "narrative"
  | "tile_grid"
  | "metric_card_grid"
  // Comparison
  | "bar"
  | "lollipop"
  | "dumbbell"
  | "diverging_bar"
  | "marimekko"
  | "tornado"
  | "variance"
  | "ribbon"
  | "stacked_bar"
  | "grouped_bar"
  | "horizontal_bar"
  | "stacked_bar_100"
  | "bullet"
  | "pictorial_bar"
  // Trends
  | "line"
  | "step_line"
  | "slope"
  | "bump"
  | "sparkline"
  | "sparkline_kpi"
  | "small_multiples"
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
  | "dot_plot"
  | "categorical_bubble"
  | "correlation_matrix"
  // Relationship
  | "radar"
  | "sankey"
  | "chord"
  | "graph"
  | "parallel"
  // Progress & KPIs
  | "gauge"
  | "ring_progress"
  | "progress_ring"
  | "radial_bar"
  | "liquid_fill"
  | "progress_bar"
  | "kpi"
  | "stat_card"
  // Hierarchy
  | "tree"
  // Text
  | "word_cloud"
  | "waffle"
  | "infographic"
  | "aster_plot"
  // Tabular
  | "data_table"
  | "metric_table"
  | "comparison_card"
  | "timeline"
  | "gantt"
  | "matrix"
  | "table_heatmap"
  | "map"
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
  | "html"
  | "narrative"
  | "tile_grid"
  | "categorical_bubble";

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
  /** G2: derived/computed columns produced via SQL CASE WHEN. */
  computed?: CaseWhenSpec[];
}

// ---------------------------------------------------------------------------
// Visualization config — style / presentation options
// ---------------------------------------------------------------------------

/** Map a category label to a specific hex color (e.g. {"<20": "#818cf8"}). */
export type ColorOverrides = Record<string, string>;

/** Custom styling for a single stat_card / KPI tile. */
export interface StatCardStyle {
  /** Card background color (CSS color or hex). */
  bgColor?: string;
  /** Accent color for the value text. */
  accentColor?: string;
  /** Sublabel template under the value, e.g. "{value}% of total". */
  sublabelTemplate?: string;
  /** Value formatting: number | percent | inr-lakhs | inr-crores. */
  valueFormat?: "number" | "percent" | "inr-lakhs" | "inr-crores" | "decimal";
}

/** Action a view-mode toggle performs when clicked. */
export interface ViewToggleAction {
  /** Replace the chart's groupBy with this column. */
  regroup?: string;
  /** Add a where clause restricting one column to one value. */
  refilter?: { column: string; value: string | number };
  /** Replace the chart's metric (e.g. "count" or "sum:referral_count"). */
  metric?: string;
}

export interface ViewToggle {
  id: string;
  label: string;
  action: ViewToggleAction;
  /** Default-active toggle (only one should be true). */
  default?: boolean;
}

/** G7: how the toggles are presented above the chart. */
export type ToggleLayout = "buttons" | "dropdown";

/** Route series colors based on a categorical column (e.g. in-clinic vs external). */
export interface ColorByColumn {
  /** Column whose value drives palette selection. */
  column: string;
  /** Map of column-value → palette (array of hex). Series color = palette[seriesIndex %]. */
  palettes: Record<string, string[]>;
}

/** Per-group dark→light gradient applied by rank within each bar/group. */
export interface RankPalette {
  /** [from, to] hex; #1 in each bar gets `from`, last gets `to`. */
  gradient: [string, string];
  /** When true, ranks are computed per group (per bar); otherwise globally. */
  applyPerGroup?: boolean;
}

/** Auto-generate tabs from the distinct values of a column. */
export interface TabsFromColumn {
  /** Column whose distinct values become tab labels. */
  column: string;
  /** Optional first "All" tab that disables the filter. Default: true. */
  showAll?: boolean;
  /** Cap on number of tabs rendered (most frequent values picked first). */
  limit?: number;
  /** Optional label override for the "All" tab. */
  allLabel?: string;
}

export interface ColorByValueBucket {
  /** Inclusive lower bound. Omit for the lowest open bucket. */
  from?: number;
  /** Exclusive upper bound. Omit for the highest open bucket. */
  to?: number;
  color: string;
  label?: string;
}

/** Color cells/segments by binning a numeric metric into buckets. */
export interface ColorByValueRange {
  /** "value" = the metric column, "pct" = value as % of row total. */
  source: "value" | "pct";
  buckets: ColorByValueBucket[];
}

/** Background overlay rendered behind a bubble/scatter chart. */
export interface BackgroundOverlay {
  /** horizontal_bar = capacity bars per row; vertical_bands = alternating column shading. */
  type: "horizontal_bar" | "vertical_bands";
  /** Column whose value drives the bar width (horizontal_bar only). */
  column?: string;
  color?: string;
  /** Second color for alternating bands (vertical_bands only). */
  altColor?: string;
  opacity?: number;
}

/** Show a numeric range slider above the chart that hides values outside. */
export interface ValueSlider {
  enabled: boolean;
  /** Slider min (defaults to data min). */
  min?: number;
  /** Slider max (defaults to data max). */
  max?: number;
}

/** Per-series style overrides keyed by metric key. */
export interface SeriesStyle {
  /** Override series rendering: line | area | bar | scatter. */
  type?: "line" | "area" | "bar" | "scatter";
  /** Dashed stroke (line/area only). */
  dashed?: boolean;
  /** Fill area under the line (line only). */
  filled?: boolean;
  color?: string;
}

/** Editor-friendly visualMap config for ECharts heatmap/scatter/sunburst. */
export interface VisualMapConfig {
  min?: number;
  max?: number;
  minColor?: string;
  maxColor?: string;
  position?: "top" | "bottom" | "left" | "right";
  /** Optional marker value to highlight (e.g. current peak). */
  markerValue?: number;
  markerLabel?: string;
}

// ── G6: per-column cell renderer config for data_table ──
export type CellRenderer = "text" | "badge" | "progress_bar" | "pill" | "threshold_pill";

export interface CellRendererConfig {
  /** How to render this column's cells. */
  renderer: CellRenderer;
  /** For badge / pill — explicit color map (value → hex). */
  colorMap?: Record<string, string>;
  /** For threshold_pill — threshold→color buckets. */
  thresholds?: { from?: number; to?: number; color: string }[];
  /** For progress_bar — max value (defaults to row max). */
  max?: number;
  /** Optional value formatter: number | percent | inr-lakhs | inr-crores. */
  format?: "number" | "percent" | "inr-lakhs" | "inr-crores";
  /** Display label for the column (header). */
  label?: string;
}

// ── G8: sub-KPI strip below a chart ──
export interface SummaryKpi {
  /** Label shown above the value. */
  label: string;
  /** Either an "agg:column" expression or a literal "{first.col}" reference. */
  expr: string;
  color?: string;
  bgColor?: string;
  sublabel?: string;
}

// ── G2: derived/computed columns ──
export interface CaseWhenSpec {
  /** Logical column name produced. */
  as: string;
  /** Source column to inspect. */
  column: string;
  /** Cases evaluated in order. */
  cases: { when: string | number; then: string }[];
  /** Default value if no case matches. */
  else?: string;
}

// ── PBI-2: drill-down hierarchy ──
export interface DrillDownConfig {
  /** Ordered levels; chart starts at levels[0] and advances on click. */
  levels: string[];
  /** Optional labels per level (default: the column name). */
  labels?: string[];
}

// ── PBI-5: drill-through to a detail page ──
export interface DrillThroughConfig {
  /** Target page slug (e.g. "/portal/ohc/referral"). */
  slug: string;
  /** URL query param name. */
  paramColumn: string;
  /** Which data column's value to send (defaults to the chart's groupBy). */
  valueColumn?: string;
}

// ── G1: tile-grid layout config ──
export interface TileGridConfig {
  /** Number of columns in the grid (default 4). */
  columns?: number;
  /** Optional categorical color column. */
  colorColumn?: string;
  /** Color overrides per category value. */
  colorMap?: Record<string, string>;
  /** Sublabel template for each tile, e.g. "{count} cases". */
  sublabelTemplate?: string;
  /** Show a small caption (e.g. season label) under the tile name. */
  captionColumn?: string;
}

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
  /** Map a category label to a specific hex color. */
  colorOverrides?: ColorOverrides;
  /** Custom styling for stat_card / KPI tiles. */
  statCard?: StatCardStyle;
  /** Tooltip template with {name}, {value}, {pct}, {seriesName} tokens. */
  tooltipTemplate?: string;
  /** Auto-insight template with {topLabel}, {topValue}, {topPct}, {bottomLabel}, {bottomValue}, {total}, {count} tokens. Set to "" to suppress. */
  insightTemplate?: string;
  /** View-mode toggles rendered as a button group (or dropdown) above the chart. */
  toggles?: ViewToggle[];
  /** How toggles are presented (default: buttons). */
  toggleLayout?: ToggleLayout;
  /** Categorical palette routing (e.g. in-clinic vs external). */
  colorByColumn?: ColorByColumn;
  /** Per-group rank-based dark→light gradient. */
  rankPalette?: RankPalette;
  /** Auto-generate tabs from distinct values of a column. */
  tabsFromColumn?: TabsFromColumn;
  /** Color cells by numeric bucket (e.g. % female ranges). */
  colorByValueRange?: ColorByValueRange;
  /** Background overlay (horizontal capacity bars behind a bubble chart). */
  background?: BackgroundOverlay;
  /** Range slider above the chart that hides values outside. */
  valueSlider?: ValueSlider;
  /** Per-series style overrides keyed by metric key. */
  seriesStyles?: Record<string, SeriesStyle>;
  /** Enable a second Y-axis on the right side for multi-metric charts. */
  dualAxis?: boolean;
  /** Which metric keys use the right Y-axis (all others use left). */
  rightAxisKeys?: string[];
  /** First-class visualMap config (ECharts heatmap/scatter). */
  visualMap?: VisualMapConfig;
  /** G3: insight slot rendered ABOVE the chart body (in addition to the bottom one). */
  topInsightTemplate?: string;
  /** G6: per-column cell renderer config keyed by column name. */
  columnConfig?: Record<string, CellRendererConfig>;
  /** G8: sub-KPI strip rendered below the chart inside the same card. */
  summaryKpis?: SummaryKpi[];
  /** G1: tile-grid layout config (only when chart.type === "tile_grid"). */
  tileGrid?: TileGridConfig;
  /** G4: narrative chart prose template (only when chart.type === "narrative"). */
  narrativeTemplate?: string;
  /** PBI-2: drill-down hierarchy (click a segment → advance to next level). */
  drillDown?: DrillDownConfig;
  /** PBI-5: drill-through to a detail page. */
  drillThrough?: DrillThroughConfig;
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
  /** Tooltip text shown on hover of the info icon next to the title */
  tooltipText?: string;
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
  type: "kpi_row" | "chart_grid" | "full_width" | "tabs" | "composite";
  columns?: number;
  charts: string[];
  label?: string;
  title?: string;
  subtitle?: string;
  /** For composite: optional accent color for the shared card. */
  accentColor?: string;
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
