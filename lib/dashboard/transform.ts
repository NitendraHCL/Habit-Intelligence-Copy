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
    default:
      return { renderer: "table", props: { data } };
  }
}

// ── Helpers ──

function getGroupKey(chart: ChartDefinition): string {
  const gb = chart.transform.groupBy;
  if (!gb) return "label";
  const expr = Array.isArray(gb) ? gb[0] : gb;
  const fnMatch = expr.match(/^(\w+)\((\w+)\)$/);
  return fnMatch ? "period" : expr;
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

  const lines = metricKeys.map((key, i) => ({
    key,
    name: labels[key] ?? key,
    color: colors[i % colors.length],
    ...(viz.stepped ? { type: "step" as const } : {}),
  }));

  return {
    renderer: "line",
    props: {
      data,
      xKey,
      lines,
      showGrid: viz.showGrid ?? true,
      showLegend: viz.showLegend ?? metricKeys.length > 1,
      strokeWidth: viz.strokeWidth ?? 2,
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

  const treeData = data.map((row) => ({
    name: String(row[groupKey] ?? ""),
    value: Number(row[metricKey] ?? 0),
  }));

  return { renderer: "treemap", props: { data: treeData } };
}

// ── Sunburst ──

function transformSunburst(
  chart: ChartDefinition,
  data: Row[]
): TransformedData {
  const groupKey = getGroupKey(chart);
  const metricKey = getMetricKeys(chart)[0];

  const sunburstData = data.map((row) => ({
    name: String(row[groupKey] ?? ""),
    value: Number(row[metricKey] ?? 0),
  }));

  return { renderer: "sunburst", props: { data: sunburstData } };
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
