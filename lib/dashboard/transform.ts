// ── Transform Layer ──
// Reshapes generic query engine output into the specific data format
// expected by each chart renderer.

import type { ChartDefinition } from "./types";
import type { RendererType } from "./types";
import { getPreset } from "@/lib/config/chart-presets";
import { CHART_PALETTE } from "@/lib/design-tokens";

type Row = Record<string, unknown>;

export interface TransformedData {
  renderer: RendererType;
  props: Record<string, unknown>;
}

export function transformForChart(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const preset = getPreset(chart.type);
  if (!preset) {
    return { renderer: "table", props: { data } };
  }

  const renderer = preset.renderer;

  switch (renderer) {
    case "bar":
      return transformBar(chart, data);
    case "line":
      return transformLine(chart, data);
    case "area":
      return transformArea(chart, data);
    case "pie":
      return transformPie(chart, data);
    case "radar":
      return transformRadar(chart, data);
    case "scatter":
    case "bubble":
      return transformScatter(chart, data, renderer);
    case "composed":
      return transformComposed(chart, data);
    case "funnel":
      return transformFunnel(chart, data);
    case "heatmap":
      return transformHeatmap(chart, data);
    case "treemap":
      return transformTreemap(chart, data);
    case "sunburst":
      return transformSunburst(chart, data);
    case "echarts":
      return transformECharts(chart, data);
    case "table":
      return transformTable(chart, data);
    case "kpi":
      return transformKPI(chart, data);
    case "html":
      return transformHTML(chart, data);
    case "tile_grid":
      return transformTileGrid(chart, data);
    case "categorical_bubble":
      return transformCategoricalBubble(chart, data);
    case "narrative":
      return transformNarrative(chart, data);
    default:
      return { renderer: "table", props: { data } };
  }
}

function transformCategoricalBubble(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const groupKeys = getGroupKeys(chart);
  const metricKeys = getMetricKeys(chart);
  const viz = chart.visualization ?? {};

  // Expect 2 groupBys (X + Y categories) and 1-3 metrics (size required, color optional)
  const xKey = groupKeys[0] ?? "x";
  const yKey = groupKeys[1] ?? groupKeys[0] ?? "y";
  const sizeKey = metricKeys[0] ?? "value";
  const colorKey = metricKeys[1]; // optional — for gender-split coloring

  return {
    renderer: "categorical_bubble",
    props: {
      data,
      xKey,
      yKey,
      sizeKey,
      colorKey,
      colorByValueRange: viz.colorByValueRange,
      background: viz.background,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

function transformTileGrid(chart: ChartDefinition, data: Row[]): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKey = getMetricKeys(chart)[0];
  const viz = chart.visualization ?? {};
  return {
    renderer: "tile_grid",
    props: {
      data,
      groupKey,
      metricKey,
      config: viz.tileGrid ?? {},
    },
  };
}

function transformNarrative(chart: ChartDefinition, data: Row[]): TransformedData {
  const viz = chart.visualization ?? {};
  return {
    renderer: "narrative",
    props: {
      template: (viz.narrativeTemplate as string) ?? "",
      data,
    },
  };
}

// ── Helpers ──

function getGroupKey(chart: ChartDefinition): string {
  const gb = chart.transform.groupBy;
  if (!gb) return "label";
  const expr = Array.isArray(gb) ? gb[0] : gb;
  const fnMatch = expr.match(/^(\w+)\((\w+)\)$/);
  return fnMatch ? "period" : expr;
}

/** All groupBy column aliases (post time-function resolution). */
function getGroupKeys(chart: ChartDefinition): string[] {
  const gb = chart.transform.groupBy;
  if (!gb) return [];
  const exprs = Array.isArray(gb) ? gb : [gb];
  return exprs.map((expr) => {
    const fnMatch = expr.match(/^(\w+)\((\w+)\)$/);
    return fnMatch ? "period" : expr;
  });
}




function getMetricKeys(chart: ChartDefinition): string[] {
  if (chart.transform.metrics?.length) {
    return chart.transform.metrics.map((m) => m.key);
  }
  return ["value"];
}

function getMetricLabels(chart: ChartDefinition): Record<string, string> {
  const labels: Record<string, string> = {};
  if (chart.transform.metrics?.length) {
    for (const m of chart.transform.metrics) {
      labels[m.key] = m.label;
    }
  } else {
    labels.value = chart.title;
  }
  return labels;
}

// ── Bar ──

function transformBar(chart: ChartDefinition, data: Row[]): TransformedData {
  const xKey = getGroupKey(chart);
  const metricKeys = getMetricKeys(chart);
  const labels = getMetricLabels(chart);
  const viz = chart.visualization ?? {};
  const colors = Array.isArray(viz.colors) ? viz.colors as string[] : CHART_PALETTE;

  const bars = metricKeys.map((key, i) => ({
    key,
    name: labels[key] ?? key,
    ...(viz.stacked ? { stackId: "stack" } : {}),
    color: colors[i % colors.length],
  }));

  return {
    renderer: "bar",
    props: {
      data,
      xKey,
      bars,
      layout: viz.orientation === "horizontal" ? "horizontal" : "vertical",
      showGrid: viz.showGrid ?? true,
      showLegend: viz.showLegend ?? metricKeys.length > 1,
      colorByIndex: metricKeys.length === 1,
      colorOverrides: viz.colorOverrides,
      colorByColumn: viz.colorByColumn,
      colorByValueRange: viz.colorByValueRange,
      rankPalette: viz.rankPalette,
      tooltipTemplate: viz.tooltipTemplate,
      basePalette: colors,
    },
  };
}

// ── Line ──

function transformLine(chart: ChartDefinition, data: Row[]): TransformedData {
  const xKey = getGroupKey(chart);
  const metricKeys = getMetricKeys(chart);
  const labels = getMetricLabels(chart);
  const viz = chart.visualization ?? {};
  const colors = Array.isArray(viz.colors) ? viz.colors as string[] : CHART_PALETTE;
  const seriesStyles = (viz.seriesStyles as Record<string, { type?: string; dashed?: boolean; filled?: boolean; color?: string }>) ?? {};

  // If any series has filled or a non-line type override, route to composed
  const hasMixedStyles = metricKeys.some((k) => {
    const s = seriesStyles[k];
    return s && (s.filled || (s.type && s.type !== "line"));
  });

  const dualAxis = viz.dualAxis === true;
  const rightAxisKeys = new Set<string>((viz.rightAxisKeys as string[]) ?? []);

  if (hasMixedStyles || dualAxis) {
    const series = metricKeys.map((key, i) => {
      const s = seriesStyles[key] ?? {};
      const color = s.color ?? colors[i % colors.length];
      return {
        key,
        name: labels[key] ?? key,
        type: s.type ?? (s.filled ? "area" : "line"),
        color,
        dashed: s.dashed,
        filled: s.filled,
        yAxisId: dualAxis && rightAxisKeys.has(key) ? "right" : "left",
      };
    });
    return {
      renderer: "composed",
      props: {
        data,
        xKey,
        series,
        showGrid: viz.showGrid ?? true,
        showLegend: viz.showLegend ?? metricKeys.length > 1,
        dualAxis,
        tooltipTemplate: viz.tooltipTemplate,
      },
    };
  }

  const lines = metricKeys.map((key, i) => {
    const s = seriesStyles[key] ?? {};
    return {
      key,
      name: labels[key] ?? key,
      color: s.color ?? colors[i % colors.length],
      dashed: s.dashed,
      ...(viz.stepped ? { type: "step" as const } : {}),
    };
  });

  return {
    renderer: "line",
    props: {
      data,
      xKey,
      lines,
      showGrid: viz.showGrid ?? true,
      showLegend: viz.showLegend ?? metricKeys.length > 1,
      strokeWidth: viz.strokeWidth ?? 2,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

// ── Area ──

function transformArea(chart: ChartDefinition, data: Row[]): TransformedData {
  const xKey = getGroupKey(chart);
  const metricKeys = getMetricKeys(chart);
  const labels = getMetricLabels(chart);
  const viz = chart.visualization ?? {};
  const colors = Array.isArray(viz.colors) ? viz.colors as string[] : CHART_PALETTE;

  const areas = metricKeys.map((key, i) => ({
    key,
    name: labels[key] ?? key,
    ...(viz.stacked ? { stackId: "stack" } : {}),
    color: colors[i % colors.length],
  }));

  return {
    renderer: "area",
    props: {
      data,
      xKey,
      areas,
      showGrid: viz.showGrid ?? true,
      showLegend: viz.showLegend ?? metricKeys.length > 1,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

// ── Pie / Donut ──

function transformPie(chart: ChartDefinition, data: Row[]): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKey = getMetricKeys(chart)[0];
  const viz = chart.visualization ?? {};

  const pieData = data.map((row) => ({
    name: String(row[groupKey] ?? ""),
    value: Number(row[metricKey] ?? 0),
  }));

  return {
    renderer: "pie",
    props: {
      data: pieData,
      innerRadius: viz.innerRadius ? parseInt(String(viz.innerRadius)) : 0,
      showLegend: viz.showLegend ?? true,
      showLabel: viz.showLabels ?? true,
      colors: Array.isArray(viz.colors) ? viz.colors as string[] : CHART_PALETTE,
      colorOverrides: viz.colorOverrides,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

// ── Radar ──

function transformRadar(chart: ChartDefinition, data: Row[]): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKeys = getMetricKeys(chart);
  const labels = getMetricLabels(chart);

  return {
    renderer: "radar",
    props: {
      data,
      angleKey: groupKey,
      radars: metricKeys.map((key) => ({
        key,
        name: labels[key] ?? key,
      })),
    },
  };
}

// ── Scatter / Bubble ──

function transformScatter(
  chart: ChartDefinition,
  data: Row[],
  renderer: "scatter" | "bubble"
): TransformedData {
  const metricKeys = getMetricKeys(chart);
  const viz = chart.visualization ?? {};

  return {
    renderer,
    props: {
      datasets: [{ name: chart.title, data }],
      xKey: metricKeys[0] ?? "x",
      yKey: metricKeys[1] ?? "y",
      ...(renderer === "bubble" ? { zKey: metricKeys[2] ?? "z" } : {}),
      ...(Array.isArray(viz.colors) ? { colors: viz.colors } : {}),
      colorByValueRange: viz.colorByValueRange,
      background: viz.background,
      valueSlider: viz.valueSlider,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

// ── Composed ──

function transformComposed(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const xKey = getGroupKey(chart);
  const metricKeys = getMetricKeys(chart);
  const labels = getMetricLabels(chart);
  const viz = chart.visualization ?? {};

  const series = metricKeys.map((key, i) => ({
    key,
    name: labels[key] ?? key,
    type: i === 0 ? ("bar" as const) : ("line" as const),
    ...(Array.isArray(viz.colors) && viz.colors[i]
      ? { color: viz.colors[i] }
      : {}),
  }));

  return {
    renderer: "composed",
    props: { data, xKey, series, showGrid: true, showLegend: true },
  };
}

// ── Funnel ──

function transformFunnel(chart: ChartDefinition, data: Row[]): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKey = getMetricKeys(chart)[0];

  const funnelData = data.map((row) => ({
    name: String(row[groupKey] ?? ""),
    value: Number(row[metricKey] ?? 0),
  }));

  return { renderer: "funnel", props: { data: funnelData } };
}

// ── Heatmap ──

function transformHeatmap(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const gb = chart.transform.groupBy;
  const groupKeys = Array.isArray(gb) ? gb : [gb ?? "x"];
  const metricKey = getMetricKeys(chart)[0];
  const viz = chart.visualization ?? {};

  // Parse time function aliases
  const xAlias = groupKeys[0]?.match(/^(\w+)\(/) ? getAliasForFn(groupKeys[0]) : groupKeys[0];
  const yAlias = groupKeys[1]?.match(/^(\w+)\(/) ? getAliasForFn(groupKeys[1]) : groupKeys[1];

  const xSet = new Set<string>();
  const ySet = new Set<string>();
  for (const row of data) {
    xSet.add(String(row[xAlias] ?? ""));
    ySet.add(String(row[yAlias] ?? ""));
  }
  const xLabels = Array.from(xSet).sort();
  const yLabels = Array.from(ySet).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));

  const heatData: [number, number, number][] = data.map((row) => [
    xLabels.indexOf(String(row[xAlias])),
    yLabels.indexOf(String(row[yAlias])),
    Number(row[metricKey] ?? 0),
  ]);

  return {
    renderer: "heatmap",
    props: {
      data: heatData,
      xLabels: (viz.xLabels as string[]) ?? xLabels,
      yLabels: (viz.yLabels as string[]) ?? yLabels,
      tooltipTemplate: viz.tooltipTemplate,
      valueSlider: viz.valueSlider,
      visualMap: viz.visualMap,
    },
  };
}

function getAliasForFn(expr: string): string {
  const fnMatch = expr.match(/^(\w+)\(/);
  if (!fnMatch) return expr;
  const fn = fnMatch[1];
  if (["month", "week", "year", "day", "quarter"].includes(fn)) return "period";
  return fn;
}

// ── Treemap ──

function transformTreemap(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKey = getMetricKeys(chart)[0];
  const viz = chart.visualization ?? {};

  const treeData = data.map((row) => {
    const name = String(row[groupKey] ?? "");
    const node: { name: string; value: number; itemStyle?: { color: string } } = {
      name,
      value: Number(row[metricKey] ?? 0),
    };
    if (viz.colorOverrides?.[name]) {
      node.itemStyle = { color: viz.colorOverrides[name] };
    }
    return node;
  });

  return {
    renderer: "treemap",
    props: {
      data: treeData,
      colorOverrides: viz.colorOverrides,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

// ── Sunburst ──
//
// Multi-level: when transform.groupBy is an array of 2-3 columns, build a
// nested {name, value, children[]} tree (one ring per groupBy column).
// Single level: flat {name, value}[].

function transformSunburst(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const groupKeys = getGroupKeys(chart);
  const metricKey = getMetricKeys(chart)[0];
  const viz = chart.visualization ?? {};
  const overrides = viz.colorOverrides ?? {};

  type SunNode = {
    name: string;
    value?: number;
    children?: SunNode[];
    itemStyle?: { color: string };
  };

  function applyColor(name: string, node: SunNode): SunNode {
    if (overrides[name]) node.itemStyle = { color: overrides[name] };
    return node;
  }

  let sunburstData: SunNode[];

  if (groupKeys.length <= 1) {
    const groupKey = groupKeys[0] ?? "label";
    sunburstData = data.map((row) => {
      const name = String(row[groupKey] ?? "");
      return applyColor(name, { name, value: Number(row[metricKey] ?? 0) });
    });
  } else {
    // Nest by each groupBy key in order. Aggregate value at the leaf.
    const root = new Map<string, Map<string, Map<string, number> | number>>();
    for (const row of data) {
      const path = groupKeys.map((k) => String(row[k] ?? ""));
      const value = Number(row[metricKey] ?? 0);
      // Walk into nested maps — recursive Map nesting is inherently untyped
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let level: any = root;
      for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!level.has(key)) level.set(key, new Map());
        level = level.get(key);
      }
      const leafKey = path[path.length - 1];
      level.set(leafKey, (Number(level.get(leafKey)) || 0) + value);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive nested Map
    function mapToNodes(level: Map<string, any>): SunNode[] {
      return Array.from(level.entries()).map(([name, child]) => {
        if (typeof child === "number") {
          return applyColor(name, { name, value: child });
        }
        const children = mapToNodes(child as Map<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
        const value = children.reduce((s, c) => s + (c.value ?? 0), 0);
        return applyColor(name, { name, value, children });
      });
    }

    sunburstData = mapToNodes(root);
  }

  return {
    renderer: "sunburst",
    props: {
      data: sunburstData,
      depth: Math.max(1, groupKeys.length),
      colorOverrides: overrides,
      tooltipTemplate: viz.tooltipTemplate,
    },
  };
}

// ── ECharts (generic) ──

function transformECharts(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKey = getMetricKeys(chart)[0];
  const viz = chart.visualization ?? {};
  const preset = getPreset(chart.type);
  const defaults = preset?.defaults ?? {};
  const echartsType = (defaults.echartsType as string) ?? "bar";
  const overrides = (defaults.echartsOverrides as Record<string, unknown>) ?? {};

  const categories = data.map((row) => String(row[groupKey] ?? ""));
  const values = data.map((row) => Number(row[metricKey] ?? 0));

  const baseOption: Record<string, unknown> = {
    tooltip: { trigger: "item" },
    ...overrides,
  };

  // Build series based on chart type
  if (["pie", "gauge", "liquidFill"].includes(echartsType)) {
    const seriesOverrides = Array.isArray(overrides.series) ? overrides.series[0] : {};
    if (echartsType === "gauge") {
      baseOption.series = [{
        type: "gauge",
        data: [{ value: values[0] ?? 0, name: categories[0] ?? "" }],
        ...seriesOverrides,
      }];
    } else {
      baseOption.series = [{
        type: echartsType,
        data: data.map((row) => ({
          name: String(row[groupKey] ?? ""),
          value: Number(row[metricKey] ?? 0),
        })),
        ...seriesOverrides,
      }];
    }
  } else if (echartsType === "sankey") {
    // Sankey expects nodes + links — requires two groupBy columns
    const gb = chart.transform.groupBy;
    const groupKeys = Array.isArray(gb) ? gb : [];
    if (groupKeys.length >= 2) {
      const sourceKey = groupKeys[0].match(/^(\w+)\(/) ? getAliasForFn(groupKeys[0]) : groupKeys[0];
      const targetKey = groupKeys[1].match(/^(\w+)\(/) ? getAliasForFn(groupKeys[1]) : groupKeys[1];
      const nodeSet = new Set<string>();
      const links = data.map((row) => {
        const source = String(row[sourceKey] ?? "");
        const target = String(row[targetKey] ?? "");
        nodeSet.add(source);
        nodeSet.add(target);
        return { source, target, value: Number(row[metricKey] ?? 0) };
      });
      baseOption.series = [{
        type: "sankey",
        data: Array.from(nodeSet).map((name) => ({ name })),
        links,
      }];
    }
  } else if (echartsType === "wordCloud") {
    baseOption.series = [{
      type: "wordCloud",
      sizeRange: [14, 60],
      rotationRange: [0, 0],
      gridSize: 8,
      data: data.map((row) => ({
        name: String(row[groupKey] ?? ""),
        value: Number(row[metricKey] ?? 0),
      })),
    }];
  } else if (echartsType === "tree") {
    baseOption.series = [{
      type: "tree",
      data: [{
        name: chart.title,
        children: data.map((row) => ({
          name: String(row[groupKey] ?? ""),
          value: Number(row[metricKey] ?? 0),
        })),
      }],
      ...((overrides.series as unknown[])?.[0] ?? {}),
    }];
  } else if (echartsType === "boxplot") {
    baseOption.xAxis = { type: "category", data: categories };
    baseOption.yAxis = { type: "value" };
    baseOption.series = [{ type: "boxplot", data: values.map((v) => [v * 0.8, v * 0.9, v, v * 1.1, v * 1.2]) }];
  } else if (echartsType === "candlestick") {
    baseOption.xAxis = { type: "category", data: categories };
    baseOption.yAxis = { type: "value" };
    baseOption.series = [{ type: "candlestick", data: values.map((v) => [v * 0.95, v, v * 0.9, v * 1.05]) }];
  } else if (defaults.echartsBuilder === "calendar") {
    baseOption.calendar = { range: new Date().getFullYear().toString() };
    baseOption.visualMap = { min: 0, max: Math.max(...values, 1), show: false };
    baseOption.series = [{
      type: "heatmap",
      coordinateSystem: "calendar",
      data: data.map((row) => [String(row[groupKey] ?? ""), Number(row[metricKey] ?? 0)]),
    }];
  } else if (defaults.echartsBuilder === "waterfall") {
    let cumulative = 0;
    const waterfallData = values.map((v) => {
      const prev = cumulative;
      cumulative += v;
      return [prev, cumulative];
    });
    baseOption.xAxis = { type: "category", data: categories };
    baseOption.yAxis = { type: "value" };
    baseOption.series = [{ type: "bar", data: waterfallData.map(([start, end]) => ({ value: [start, end] })) }];
  } else if (overrides.polar) {
    // Polar charts
    baseOption.angleAxis = overrides.angleAxis ?? { type: "category", data: categories };
    baseOption.radiusAxis = overrides.radiusAxis ?? {};
    baseOption.polar = {};
    baseOption.series = [{
      type: echartsType,
      coordinateSystem: "polar",
      data: values,
      ...((overrides.series as unknown[])?.[0] ?? {}),
    }];
  } else {
    // Default: bar/line with cartesian
    baseOption.xAxis = { type: "category", data: categories };
    baseOption.yAxis = { type: "value" };
    baseOption.series = [{
      type: echartsType,
      data: values,
      ...((overrides.series as unknown[])?.[0] ?? {}),
    }];
  }

  // Apply user color overrides
  if (Array.isArray(viz.colors)) {
    baseOption.color = viz.colors;
  }

  return {
    renderer: "echarts",
    props: { option: baseOption, height: viz.height ?? 350 },
  };
}

// ── Table ──

function transformTable(chart: ChartDefinition, data: Row[]): TransformedData {
  const viz = chart.visualization ?? {};
  return {
    renderer: "table",
    props: {
      data,
      pageSize: viz.pageSize ?? 10,
      sortable: viz.sortable ?? true,
      striped: viz.striped ?? true,
      columnConfig: viz.columnConfig,
    },
  };
}

// ── KPI ──

function transformKPI(chart: ChartDefinition, data: Row[]): TransformedData {
  const metricKey = getMetricKeys(chart)[0];
  const value = data.length > 0 ? Number(data[0][metricKey] ?? 0) : 0;

  let thresholdColor: string | undefined;
  let thresholdLabel: string | undefined;
  if (chart.thresholds?.length) {
    for (const t of chart.thresholds) {
      if (t.above !== undefined && value > t.above) {
        thresholdColor = t.color;
        thresholdLabel = t.label;
      } else if (t.max !== undefined && t.min !== undefined && value >= t.min && value <= t.max) {
        thresholdColor = t.color;
        thresholdLabel = t.label;
      } else if (t.max !== undefined && t.min === undefined && value <= t.max) {
        thresholdColor = t.color;
        thresholdLabel = t.label;
      }
    }
  }

  return {
    renderer: "kpi",
    props: {
      value,
      format: chart.visualization?.format ?? "number",
      thresholdColor,
      thresholdLabel,
    },
  };
}

// ── HTML (progress bar, stat card, comparison card) ──

function transformHTML(chart: ChartDefinition, data: Row[]): TransformedData {
  const metricKey = getMetricKeys(chart)[0];
  const value = data.length > 0 ? Number(data[0][metricKey] ?? 0) : 0;

  return {
    renderer: "html",
    props: {
      chartType: chart.type,
      value,
      data,
      title: chart.title,
      format: chart.visualization?.format ?? "number",
    },
  };
}
