// ── Chart Presets ──
// Defines all ~50 chart types available in the builder.
// Each preset maps to a renderer + default configuration.

import type { ChartPreset, ChartCategory } from "@/lib/dashboard/types";

export const chartPresets: ChartPreset[] = [
  // ═══════════════════════════════════════════════════════════════
  // COMPARISON
  // ═══════════════════════════════════════════════════════════════
  {
    id: "bar",
    label: "Bar Chart",
    description: "Compare values across categories",
    category: "comparison",
    renderer: "bar",
    icon: "BarChart3",
    defaults: { orientation: "vertical" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "stacked_bar",
    label: "Stacked Bar",
    description: "Show composition within each category",
    category: "comparison",
    renderer: "bar",
    icon: "BarChart3",
    defaults: { stacked: true },
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "grouped_bar",
    label: "Grouped Bar",
    description: "Side-by-side bars for multi-series comparison",
    category: "comparison",
    renderer: "bar",
    icon: "BarChart3",
    defaults: { stacked: false },
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "horizontal_bar",
    label: "Horizontal Bar",
    description: "Horizontal bars for long category names",
    category: "comparison",
    renderer: "bar",
    icon: "BarChartHorizontal",
    defaults: { orientation: "horizontal" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "stacked_bar_100",
    label: "100% Stacked Bar",
    description: "Show proportional composition per category",
    category: "comparison",
    renderer: "bar",
    icon: "BarChart3",
    defaults: { stacked: true, stack100: true },
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "bullet",
    label: "Bullet Chart",
    description: "Compact comparison against a target value",
    category: "comparison",
    renderer: "echarts",
    icon: "Minus",
    defaults: {
      echartsType: "custom",
      echartsBuilder: "bullet",
    },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "pictorial_bar",
    label: "Pictorial Bar",
    description: "Bars with pictographic shapes for visual impact",
    category: "comparison",
    renderer: "echarts",
    icon: "Image",
    defaults: {
      echartsType: "pictorialBar",
    },
    requiredFields: { groupBy: true, metric: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // TRENDS
  // ═══════════════════════════════════════════════════════════════
  {
    id: "line",
    label: "Line Chart",
    description: "Track changes over time",
    category: "trends",
    renderer: "line",
    icon: "TrendingUp",
    defaults: { curved: true, showGrid: true },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "step_line",
    label: "Step Line",
    description: "Line chart with stepped transitions",
    category: "trends",
    renderer: "line",
    icon: "TrendingUp",
    defaults: { stepped: true },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "area",
    label: "Area Chart",
    description: "Line chart with filled area underneath",
    category: "trends",
    renderer: "area",
    icon: "AreaChart",
    defaults: { showGrid: true },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "stacked_area",
    label: "Stacked Area",
    description: "Show composition changes over time",
    category: "trends",
    renderer: "area",
    icon: "AreaChart",
    defaults: { stacked: true },
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "stacked_area_100",
    label: "100% Stacked Area",
    description: "Show proportional changes over time",
    category: "trends",
    renderer: "area",
    icon: "AreaChart",
    defaults: { stacked: true, stack100: true },
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "composed",
    label: "Composed Chart",
    description: "Mix bar and line series on the same axes",
    category: "trends",
    renderer: "composed",
    icon: "BarChart2",
    defaults: {},
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "candlestick",
    label: "Candlestick",
    description: "Open-high-low-close chart for range data",
    category: "trends",
    renderer: "echarts",
    icon: "CandlestickChart",
    defaults: { echartsType: "candlestick" },
    requiredFields: { groupBy: true, metrics: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // PROPORTION
  // ═══════════════════════════════════════════════════════════════
  {
    id: "pie",
    label: "Pie Chart",
    description: "Show parts of a whole",
    category: "proportion",
    renderer: "pie",
    icon: "PieChart",
    defaults: { innerRadius: 0 },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "donut",
    label: "Donut Chart",
    description: "Pie chart with center space for KPIs",
    category: "proportion",
    renderer: "pie",
    icon: "Circle",
    defaults: { innerRadius: "50%" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "half_donut",
    label: "Half Donut",
    description: "Semi-circle donut for gauge-like display",
    category: "proportion",
    renderer: "echarts",
    icon: "CircleDashed",
    defaults: {
      echartsType: "pie",
      echartsOverrides: {
        series: [{ startAngle: 180, endAngle: 360, radius: ["50%", "75%"] }],
      },
    },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "nightingale",
    label: "Nightingale Rose",
    description: "Polar area chart with varying radii",
    category: "proportion",
    renderer: "echarts",
    icon: "Flower2",
    defaults: {
      echartsType: "pie",
      echartsOverrides: { series: [{ roseType: "area" }] },
    },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "funnel",
    label: "Funnel",
    description: "Visualize stages in a pipeline or process",
    category: "proportion",
    renderer: "funnel",
    icon: "Filter",
    defaults: {},
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "waterfall",
    label: "Waterfall",
    description: "Show cumulative effect of sequential values",
    category: "proportion",
    renderer: "echarts",
    icon: "BarChart3",
    defaults: { echartsType: "bar", echartsBuilder: "waterfall" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "treemap",
    label: "Treemap",
    description: "Nested rectangles showing hierarchical proportions",
    category: "proportion",
    renderer: "treemap",
    icon: "LayoutGrid",
    defaults: {},
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "sunburst",
    label: "Sunburst",
    description: "Multi-level donut for hierarchical data",
    category: "proportion",
    renderer: "sunburst",
    icon: "Sun",
    defaults: {},
    requiredFields: { groupBy: true, metric: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // DISTRIBUTION
  // ═══════════════════════════════════════════════════════════════
  {
    id: "scatter",
    label: "Scatter Plot",
    description: "Visualize relationships between two variables",
    category: "distribution",
    renderer: "scatter",
    icon: "ScatterChart",
    defaults: {},
    requiredFields: { xKey: true, yKey: true },
  },
  {
    id: "bubble",
    label: "Bubble Chart",
    description: "Scatter with a third dimension as bubble size",
    category: "distribution",
    renderer: "bubble",
    icon: "CircleDot",
    defaults: {},
    requiredFields: { xKey: true, yKey: true, zKey: true },
  },
  {
    id: "boxplot",
    label: "Box Plot",
    description: "Show statistical distribution with quartiles",
    category: "distribution",
    renderer: "echarts",
    icon: "BoxSelect",
    defaults: { echartsType: "boxplot" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "heatmap",
    label: "Heatmap",
    description: "Two-dimensional density visualization",
    category: "distribution",
    renderer: "heatmap",
    icon: "Grid3x3",
    defaults: {},
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "calendar_heatmap",
    label: "Calendar Heatmap",
    description: "Daily values displayed on a calendar grid",
    category: "distribution",
    renderer: "echarts",
    icon: "Calendar",
    defaults: { echartsType: "heatmap", echartsBuilder: "calendar" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "histogram",
    label: "Histogram",
    description: "Show frequency distribution of numeric values",
    category: "distribution",
    renderer: "bar",
    icon: "BarChart3",
    defaults: { orientation: "vertical", showGrid: true },
    requiredFields: { groupBy: true, metric: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // RELATIONSHIP
  // ═══════════════════════════════════════════════════════════════
  {
    id: "radar",
    label: "Radar Chart",
    description: "Multi-dimensional comparison on radial axes",
    category: "relationship",
    renderer: "radar",
    icon: "Radar",
    defaults: {},
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "sankey",
    label: "Sankey Diagram",
    description: "Show flow between nodes with proportional width",
    category: "relationship",
    renderer: "echarts",
    icon: "GitBranch",
    defaults: { echartsType: "sankey" },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "chord",
    label: "Chord Diagram",
    description: "Circular flow between interconnected categories",
    category: "relationship",
    renderer: "echarts",
    icon: "Circle",
    defaults: { echartsType: "graph", echartsOverrides: { series: [{ layout: "circular" }] } },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "graph",
    label: "Network Graph",
    description: "Force-directed graph showing connections",
    category: "relationship",
    renderer: "echarts",
    icon: "Share2",
    defaults: { echartsType: "graph", echartsOverrides: { series: [{ layout: "force" }] } },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "parallel",
    label: "Parallel Coordinates",
    description: "Compare multi-dimensional data across parallel axes",
    category: "relationship",
    renderer: "echarts",
    icon: "AlignVerticalSpaceAround",
    defaults: { echartsType: "parallel" },
    requiredFields: { metrics: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // PROGRESS & KPIs
  // ═══════════════════════════════════════════════════════════════
  {
    id: "gauge",
    label: "Gauge",
    description: "Speedometer-style progress indicator",
    category: "progress",
    renderer: "echarts",
    icon: "Gauge",
    defaults: { echartsType: "gauge" },
    requiredFields: { metric: true },
  },
  {
    id: "ring_progress",
    label: "Ring Progress",
    description: "Circular progress bar with percentage",
    category: "progress",
    renderer: "echarts",
    icon: "CircleDashed",
    defaults: {
      echartsType: "pie",
      echartsOverrides: {
        series: [{
          radius: ["65%", "80%"],
          itemStyle: { borderRadius: 10 },
          label: { show: true, position: "center", fontSize: 24, fontWeight: "bold" },
        }],
      },
    },
    requiredFields: { metric: true },
  },
  {
    id: "liquid_fill",
    label: "Liquid Fill",
    description: "Animated liquid-fill gauge for progress/saturation",
    category: "progress",
    renderer: "echarts",
    icon: "Droplet",
    defaults: { echartsType: "liquidFill" },
    requiredFields: { metric: true },
  },
  {
    id: "progress_bar",
    label: "Progress Bar",
    description: "Horizontal progress bar with label",
    category: "progress",
    renderer: "html",
    icon: "Minus",
    defaults: {},
    requiredFields: { metric: true },
  },
  {
    id: "kpi",
    label: "KPI Card",
    description: "Single number with trend indicator and threshold",
    category: "progress",
    renderer: "kpi",
    icon: "Hash",
    defaults: { format: "number" },
    requiredFields: { metric: true },
  },
  {
    id: "stat_card",
    label: "Stat Card",
    description: "Compact stat with label, value, and delta",
    category: "progress",
    renderer: "html",
    icon: "TrendingUp",
    defaults: {},
    requiredFields: { metric: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // HIERARCHY
  // ═══════════════════════════════════════════════════════════════
  {
    id: "tree",
    label: "Tree Diagram",
    description: "Hierarchical tree with expandable nodes",
    category: "hierarchy",
    renderer: "echarts",
    icon: "GitFork",
    defaults: {
      echartsType: "tree",
      echartsOverrides: { series: [{ layout: "orthogonal", orient: "TB" }] },
    },
    requiredFields: { groupBy: true, metric: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // TEXT
  // ═══════════════════════════════════════════════════════════════
  {
    id: "word_cloud",
    label: "Word Cloud",
    description: "Visualize text frequency with sized words",
    category: "text",
    renderer: "echarts",
    icon: "Type",
    defaults: { echartsType: "wordCloud" },
    requiredFields: { groupBy: true, metric: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // TABULAR
  // ═══════════════════════════════════════════════════════════════
  {
    id: "data_table",
    label: "Data Table",
    description: "Sortable, paginated table of raw data",
    category: "tabular",
    renderer: "table",
    icon: "Table",
    defaults: { pageSize: 10, sortable: true, striped: true },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "metric_table",
    label: "Metric Table",
    description: "Compact table showing multiple metrics per group",
    category: "tabular",
    renderer: "table",
    icon: "Table2",
    defaults: { pageSize: 20, sortable: true },
    requiredFields: { groupBy: true, metrics: true },
  },
  {
    id: "comparison_card",
    label: "Comparison Card",
    description: "Side-by-side metric comparison with labels",
    category: "tabular",
    renderer: "html",
    icon: "Columns2",
    defaults: {},
    requiredFields: { metrics: true },
  },

  // ═══════════════════════════════════════════════════════════════
  // POLAR
  // ═══════════════════════════════════════════════════════════════
  {
    id: "polar_bar",
    label: "Polar Bar",
    description: "Bars arranged in a polar coordinate system",
    category: "polar",
    renderer: "echarts",
    icon: "Circle",
    defaults: {
      echartsType: "bar",
      echartsOverrides: { polar: {}, angleAxis: {}, radiusAxis: { type: "category" } },
    },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "polar_line",
    label: "Polar Line",
    description: "Line chart in polar coordinates",
    category: "polar",
    renderer: "echarts",
    icon: "Circle",
    defaults: {
      echartsType: "line",
      echartsOverrides: { polar: {}, angleAxis: { type: "category" }, radiusAxis: {} },
    },
    requiredFields: { groupBy: true, metric: true },
  },
  {
    id: "polar_area",
    label: "Polar Area",
    description: "Area chart wrapped around polar coordinates",
    category: "polar",
    renderer: "echarts",
    icon: "Circle",
    defaults: {
      echartsType: "line",
      echartsOverrides: {
        polar: {},
        angleAxis: { type: "category" },
        radiusAxis: {},
        series: [{ areaStyle: {} }],
      },
    },
    requiredFields: { groupBy: true, metric: true },
  },
];

// ── Helpers ──

export function getPreset(id: string): ChartPreset | undefined {
  return chartPresets.find((p) => p.id === id);
}

export function getPresetsByCategory(category: ChartCategory): ChartPreset[] {
  return chartPresets.filter((p) => p.category === category);
}

export const chartCategories: { id: ChartCategory; label: string; icon: string }[] = [
  { id: "comparison", label: "Comparison", icon: "BarChart3" },
  { id: "trends", label: "Trends", icon: "TrendingUp" },
  { id: "proportion", label: "Proportion", icon: "PieChart" },
  { id: "distribution", label: "Distribution", icon: "ScatterChart" },
  { id: "relationship", label: "Relationship", icon: "GitBranch" },
  { id: "progress", label: "Progress & KPIs", icon: "Gauge" },
  { id: "hierarchy", label: "Hierarchy", icon: "GitFork" },
  { id: "text", label: "Text", icon: "Type" },
  { id: "tabular", label: "Tabular", icon: "Table" },
  { id: "polar", label: "Polar", icon: "Circle" },
];
