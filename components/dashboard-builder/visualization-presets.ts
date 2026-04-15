// ── Visualization presets — chart-type-aware starter configurations ──
// Each preset patches a chart's `visualization` (and optionally `transform`)
// to give a naive user a polished result with one click.

import type {
  ChartTypeId,
  VisualizationConfig,
  TransformConfig,
} from "@/lib/dashboard/types";

export interface VisualizationPreset {
  id: string;
  label: string;
  description: string;
  /** Patch applied to chart.visualization. */
  visualization: Partial<VisualizationConfig>;
  /** Optional patch applied to chart.transform (e.g. set sort, limit). */
  transform?: Partial<TransformConfig>;
}

/** Which advanced sections should default-open for each chart type. */
export const DEFAULT_OPEN_SECTIONS: Record<string, string[]> = {
  bar: ["colorOverrides", "tooltipTemplate"],
  stacked_bar: ["rankPalette", "colorByColumn", "tooltipTemplate"],
  grouped_bar: ["rankPalette", "tooltipTemplate"],
  horizontal_bar: ["colorOverrides", "tooltipTemplate"],
  stacked_bar_100: ["rankPalette", "tooltipTemplate"],
  line: ["tooltipTemplate"],
  area: ["tooltipTemplate"],
  stacked_area: ["tooltipTemplate"],
  pie: ["colorOverrides", "tooltipTemplate"],
  donut: ["colorOverrides", "tooltipTemplate"],
  half_donut: ["colorOverrides", "tooltipTemplate"],
  treemap: ["colorOverrides", "tooltipTemplate"],
  sunburst: ["colorOverrides", "tooltipTemplate"],
  heatmap: ["tooltipTemplate"],
  funnel: ["colorOverrides"],
  kpi: ["statCard"],
  stat_card: ["statCard"],
  data_table: [],
  metric_table: [],
};

/** Visualization presets per chart type. */
export const VISUALIZATION_PRESETS: Partial<Record<ChartTypeId, VisualizationPreset[]>> = {
  sunburst: [
    {
      id: "demographic-2ring",
      label: "Demographic Sunburst (2 rings)",
      description: "Gender × Age, with auto-color per age bucket.",
      visualization: {
        showLabels: true,
        height: 380,
        colorOverrides: {
          "<20": "#818cf8",
          "20-35": "#0d9488",
          "36-40": "#a78bfa",
          "41-60": "#6366f1",
          "61+": "#3730a3",
          Male: "#4A6FA5",
          Female: "#E75480",
        },
        tooltipTemplate: "{name}: {value} ({pct}%)",
        insightTemplate:
          "{topLabel} accounts for the largest share at {topValue} ({topPct}% of total).",
      },
    },
    {
      id: "single-ring",
      label: "Single-Ring Donut",
      description: "Flat sunburst (acts like a donut chart).",
      visualization: {
        showLabels: true,
        height: 320,
        tooltipTemplate: "{name}: {value} ({pct}%)",
      },
    },
  ],

  stacked_bar: [
    {
      id: "rank-palette-clinic",
      label: "Per-bar Rank Palette (dark→light)",
      description:
        "Each bar's biggest segment gets the darkest color. Great for location × specialty.",
      visualization: {
        showLegend: false,
        height: 400,
        rankPalette: { gradient: ["#3730A3", "#C7D2FE"], applyPerGroup: true },
        tooltipTemplate: "{seriesName}: {value} ({pct}% of bar)",
      },
    },
    {
      id: "in-clinic-vs-external",
      label: "In-Clinic vs External",
      description: "Two palettes routed by an availability column.",
      visualization: {
        showLegend: true,
        height: 400,
        colorByColumn: {
          column: "is_available_in_clinic",
          palettes: {
            true: ["#3730A3", "#5046E5", "#818cf8", "#A5B4FC"],
            false: ["#92400E", "#B45309", "#D97706", "#FDE68A"],
          },
        },
        tooltipTemplate: "{seriesName}: {value}",
      },
    },
  ],

  bar: [
    {
      id: "single-color-with-insight",
      label: "Single Color + Auto Insight",
      description: "Clean look, with auto-generated insight sentence below.",
      visualization: {
        colors: ["#4f46e5"],
        showLegend: false,
        showGrid: true,
        height: 320,
        tooltipTemplate: "{name}: {value}",
        insightTemplate:
          "{topLabel} leads with {topValue} ({topPct}% of total). Lowest is {bottomLabel} at {bottomValue}.",
      },
      transform: { sort: "desc", limit: 10 },
    },
    {
      id: "categorical-overrides",
      label: "Custom Colors per Category",
      description: "Map specific labels to specific colors.",
      visualization: {
        showLegend: false,
        height: 320,
        colorOverrides: {},
        tooltipTemplate: "{name}: {value}",
      },
    },
  ],

  pie: [
    {
      id: "donut-with-pct",
      label: "Donut with %",
      description: "Inner-radius cutout + percent in tooltip.",
      visualization: {
        innerRadius: "60",
        showLegend: true,
        showLabels: true,
        height: 320,
        tooltipTemplate: "{name}: {value} ({pct}%)",
      },
    },
  ],

  line: [
    {
      id: "with-points",
      label: "Smooth Line + Points",
      description: "Curved line with hover dots.",
      visualization: {
        curved: true,
        strokeWidth: 2,
        height: 320,
        tooltipTemplate: "{seriesName}: {value}",
      },
    },
  ],

  area: [
    {
      id: "gradient-fill",
      label: "Gradient Area",
      description: "Filled area with subtle gradient.",
      visualization: {
        height: 320,
        tooltipTemplate: "{seriesName}: {value}",
      },
    },
  ],

  treemap: [
    {
      id: "labeled",
      label: "Labeled Treemap",
      description: "Per-cell labels with percent share.",
      visualization: {
        height: 380,
        tooltipTemplate: "{name}: {value} ({pct}%)",
      },
    },
  ],

  heatmap: [
    {
      id: "intensity",
      label: "Intensity Heatmap",
      description: "Indigo gradient with axis labels.",
      visualization: {
        height: 380,
        tooltipTemplate: "{name}: {value}",
      },
    },
  ],

  kpi: [
    {
      id: "indigo-tile",
      label: "Indigo Tile + YoY",
      description: "Standard KPI with white background, indigo value.",
      visualization: {
        statCard: {
          bgColor: "#FFFFFF",
          accentColor: "#4f46e5",
          valueFormat: "number",
        },
      },
    },
    {
      id: "purple-card",
      label: "Purple Card with Sublabel",
      description: "Soft purple background, INR Lakhs format, sublabel.",
      visualization: {
        statCard: {
          bgColor: "#F9F0FF",
          accentColor: "#7B2D9B",
          valueFormat: "inr-lakhs",
          sublabelTemplate: "{value} total",
        },
      },
    },
    {
      id: "green-percent",
      label: "Green Percent KPI",
      description: "Green tile, percent format, threshold-friendly.",
      visualization: {
        statCard: {
          bgColor: "#E6F9F5",
          accentColor: "#0d9488",
          valueFormat: "percent",
        },
      },
    },
  ],

  stat_card: [
    {
      id: "amber-card",
      label: "Amber Card",
      description: "Warm amber tile with sublabel.",
      visualization: {
        statCard: {
          bgColor: "#FFF5E6",
          accentColor: "#8B6914",
          valueFormat: "number",
          sublabelTemplate: "{value} consults",
        },
      },
    },
  ],
};

/** Get presets for a chart type (empty array if none). */
export function getPresetsForType(type?: ChartTypeId): VisualizationPreset[] {
  if (!type) return [];
  return VISUALIZATION_PRESETS[type] ?? [];
}

/** Get the list of advanced section IDs that should default-open. */
export function getDefaultOpenSections(type?: ChartTypeId): string[] {
  if (!type) return [];
  return DEFAULT_OPEN_SECTIONS[type] ?? [];
}
