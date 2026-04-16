"use client";

// ── Smart Chart Picker ── data-first chart type selection.
// 1. User picks Data Source → Group By → Metric
// 2. Rule engine scores all 74 chart types against the data shape
// 3. Top 8 rendered as live mini-previews with fit scores
// 4. Click one → returns chart type + data config to the parent

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { transformForChart } from "@/lib/dashboard/transform";
import { getPreset } from "@/lib/config/chart-presets";
import { CHART_USE_CASES } from "./chart-use-cases";
import {
  getAllDataSourceOptions,
  getGroupableColumns,
  getAggregatableColumns,
} from "@/lib/config/data-sources";
import type {
  ChartDefinition,
  ChartTypeId,
  ChartPreset,
  QueryRequest,
} from "@/lib/dashboard/types";
import { Sparkles, ArrowLeft } from "lucide-react";

const BarChartRenderer = dynamic(() => import("@/components/charts/renderers/BarChartRenderer"));
const LineChartRenderer = dynamic(() => import("@/components/charts/renderers/LineChartRenderer"));
const AreaChartRenderer = dynamic(() => import("@/components/charts/renderers/AreaChartRenderer"));
const PieChartRenderer = dynamic(() => import("@/components/charts/renderers/PieChartRenderer"));
const HeatmapRenderer = dynamic(() => import("@/components/charts/renderers/HeatmapRenderer"));
const TreemapRenderer = dynamic(() => import("@/components/charts/renderers/TreemapRenderer"));
const SunburstRenderer = dynamic(() => import("@/components/charts/renderers/SunburstRenderer"));
const RadarChartRenderer = dynamic(() => import("@/components/charts/renderers/RadarChartRenderer"));
const FunnelRenderer = dynamic(() => import("@/components/charts/renderers/FunnelRenderer"));
const ComposedChartRenderer = dynamic(() => import("@/components/charts/renderers/ComposedChartRenderer"));
const GenericEChartsRenderer = dynamic(() => import("@/components/charts/renderers/GenericEChartsRenderer"));

interface SmartChartPickerProps {
  clientId: string;
  onSelect: (type: ChartTypeId, dataConfig: { table: string; groupBy?: string; metric: string }) => void;
  onCancel: () => void;
}

interface Suggestion {
  type: ChartTypeId;
  label: string;
  reason: string;
  score: number;
}

const TIME_FUNCTIONS = [
  { value: "", label: "None" },
  { value: "month", label: "Monthly" },
  { value: "week", label: "Weekly" },
  { value: "year", label: "Yearly" },
  { value: "quarter", label: "Quarterly" },
  { value: "day", label: "Daily" },
];

function suggestAll(
  groupBy: string | undefined,
  groupByCount: number,
  metricCount: number,
  metric: string
): Suggestion[] {
  const hasTimeGroupBy = groupBy ? /^(month|week|day|year|quarter|hour)\(/.test(groupBy) : false;
  const isCountOnly = metric === "count" && metricCount <= 1;

  const results: Suggestion[] = [];
  function add(type: ChartTypeId, score: number, reason: string) {
    const preset = getPreset(type);
    if (preset) results.push({ type, label: preset.label, reason, score });
  }

  // ── No groupBy: single value charts ──
  if (!groupBy || groupByCount === 0) {
    add("kpi", 100, "Single headline number");
    add("gauge", 85, "Single value as a dial");
    add("progress_ring", 80, "Circular progress");
    add("liquid_fill", 75, "Animated fill level");
    add("stat_card", 70, "Compact stat with label");
    add("progress_bar", 65, "Linear progress bar");
    return results.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  // ── Time-based, single metric ──
  if (hasTimeGroupBy && metricCount <= 1) {
    add("line", 100, "Classic time trend");
    add("area", 95, "Time trend with volume fill");
    add("bar", 85, "Discrete time periods as bars");
    add("sparkline", 80, "Compact micro-trend");
    add("step_line", 70, "Discrete state changes");
    add("bump", 60, "Rank position over time");
    add("sparkline_kpi", 55, "KPI card with embedded trend");
    add("calendar_heatmap", 50, "Daily calendar view");
  }

  // ── Time-based, multi-metric ──
  if (hasTimeGroupBy && metricCount >= 2) {
    add("composed", 100, "Bar + line combo over time");
    add("stacked_area", 95, "Cumulative volume split");
    add("line", 90, "Multi-series line comparison");
    add("stacked_bar", 80, "Stacked per period");
    add("stacked_area_100", 75, "Proportional change over time");
    add("slope", 65, "Before → after for 2 periods");
    add("ribbon", 55, "Rank-shift ribbons");
    add("small_multiples", 50, "One mini-chart per metric");
  }

  // ── Categorical, single metric ──
  if (!hasTimeGroupBy && groupByCount === 1 && metricCount <= 1) {
    add("bar", 100, "Universal category comparison");
    add("horizontal_bar", 95, "Better for long labels");
    add("pie", 85, "Proportional split (<8 cats)");
    add("donut", 83, "Proportional with center hole");
    add("treemap", 80, "Area-based proportional");
    add("lollipop", 78, "Clean ranking dots");
    add("nightingale", 65, "Rose chart — radius = value");
    add("funnel", 60, "Sequential stage drop-off");
    add("radial_bar", 55, "Circular horizontal bars");
    add("word_cloud", 45, "Text frequency cloud");
    add("aster_plot", 40, "Pie with varying radius");
    add("infographic", 35, "Data as repeated icons");
    add("tile_grid", 30, "N-tile colored grid");
  }

  // ── Categorical, multi-metric ──
  if (!hasTimeGroupBy && groupByCount === 1 && metricCount >= 2) {
    add("grouped_bar", 100, "Side-by-side bars");
    add("stacked_bar", 95, "Composition within category");
    add("stacked_bar_100", 85, "Proportional composition");
    add("radar", 80, "Multi-metric profile");
    add("composed", 75, "Mixed bar + line");
    add("dumbbell", 70, "Two-value comparison");
    add("tornado", 65, "Back-to-back bars");
    add("diverging_bar", 60, "±zero diverging");
    add("variance", 55, "Actual vs target");
    add("marimekko", 45, "Variable-width stacked");
    add("bullet", 40, "Actual vs target compact");
  }

  // ── Two groupBys ──
  if (groupByCount === 2) {
    add("heatmap", 100, "Two-dimensional intensity");
    add("sunburst", 95, "Nested hierarchical rings");
    add("stacked_bar", 85, "First as X, second as stack");
    add("sankey", 80, "Flow between categories");
    add("treemap", 70, "Nested rectangles");
    add("correlation_matrix", 55, "Pairwise correlation");
  }

  // ── Three+ groupBys ──
  if (groupByCount >= 3) {
    add("sunburst", 100, "3-level hierarchical rings");
    add("treemap", 85, "Nested rectangles");
  }

  // ── Always available ──
  add("data_table", 30, "Raw data in a table");
  add("narrative", 20, "Rich text summary");

  // Deduplicate
  const seen = new Map<ChartTypeId, Suggestion>();
  for (const s of results) {
    if (!seen.has(s.type) || seen.get(s.type)!.score < s.score) {
      seen.set(s.type, s);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MiniRenderer({ renderer, props }: { renderer: string; props: any }) {
  switch (renderer) {
    case "bar": return <BarChartRenderer {...props} />;
    case "line": return <LineChartRenderer {...props} />;
    case "area": return <AreaChartRenderer {...props} />;
    case "pie": return <PieChartRenderer {...props} />;
    case "heatmap": return <HeatmapRenderer {...props} />;
    case "treemap": return <TreemapRenderer {...props} />;
    case "sunburst": return <SunburstRenderer {...props} />;
    case "radar": return <RadarChartRenderer {...props} />;
    case "funnel": return <FunnelRenderer {...props} />;
    case "composed": return <ComposedChartRenderer {...props} />;
    case "echarts": return <GenericEChartsRenderer {...props} />;
    default: return <div className="flex items-center justify-center h-full text-[10px] text-gray-400">Preview</div>;
  }
}

export default function SmartChartPicker({ clientId, onSelect, onCancel }: SmartChartPickerProps) {
  const [table, setTable] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [metric, setMetric] = useState("count");
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  const dataSources = getAllDataSourceOptions();
  const groupableCols = table ? getGroupableColumns(table) : [];
  const aggregatableCols = table ? getAggregatableColumns(table) : [];
  const timestampCols = groupableCols.filter((c) => c.type === "timestamp");
  const hasTimestamp = timestampCols.length > 0;

  const metricOptions = [
    { value: "count", label: "Count" },
    ...aggregatableCols
      .filter((c) => c.type === "number")
      .flatMap((c) => [
        { value: `sum:${c.key}`, label: `Sum of ${c.label}` },
        { value: `avg:${c.key}`, label: `Avg ${c.label}` },
      ]),
  ];

  const groupByArr = groupBy ? [groupBy] : [];
  const suggestions = useMemo(
    () => table ? suggestAll(groupBy || undefined, groupByArr.length, 1, metric) : [],
    [table, groupBy, metric]
  );

  // Fetch data when config is ready
  useEffect(() => {
    if (!table || !clientId) return;
    let cancelled = false;
    setLoading(true);
    const body: QueryRequest = {
      dataSource: { table },
      transform: {
        ...(groupBy ? { groupBy } : {}),
        metric,
        limit: 30,
      },
    };
    fetch(`/api/data/query?clientId=${clientId}&testMode=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.data) setData(d.data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, groupBy, metric, clientId]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-500" />
              Smart Chart Picker
            </h3>
            <p className="text-[11px] text-gray-500">
              Set your data — we&apos;ll suggest the best chart
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Step 1: Data Source */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700">1. Data Source</label>
          <select
            value={table}
            onChange={(e) => { setTable(e.target.value); setGroupBy(""); }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          >
            <option value="">Pick a table…</option>
            {dataSources.map((ds) => (
              <option key={ds.value} value={ds.value}>{ds.label}</option>
            ))}
          </select>
        </div>

        {/* Step 2: Group By */}
        {table && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">2. Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">(none — single value)</option>
              {groupableCols
                .filter((c) => c.type !== "timestamp")
                .map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              {hasTimestamp &&
                timestampCols.flatMap((col) =>
                  TIME_FUNCTIONS.filter((tf) => tf.value).map((tf) => (
                    <option key={`${tf.value}(${col.key})`} value={`${tf.value}(${col.key})`}>
                      {col.label} ({tf.label})
                    </option>
                  ))
                )}
            </select>
          </div>
        )}

        {/* Step 3: Metric */}
        {table && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">3. Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {metricOptions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-semibold text-gray-800 mb-2">
              Recommended charts ({suggestions.length})
            </p>

            {/* Ranked list */}
            <div className="space-y-1 mb-3">
              {suggestions.map((s, i) => {
                const useCase = CHART_USE_CASES[s.type];
                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => onSelect(s.type, { table, groupBy, metric })}
                    className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors"
                  >
                    <span className="text-[11px] font-bold text-amber-700 w-4 shrink-0 mt-0.5">
                      {i + 1}.
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-[12px] font-semibold text-gray-900 block">
                        {s.label}
                        <span className="ml-1.5 text-[10px] font-mono text-amber-600/60">
                          {s.score}%
                        </span>
                      </span>
                      <span className="text-[10.5px] text-gray-600 block leading-snug">
                        {s.reason}
                      </span>
                      {useCase && (
                        <span className="text-[10px] text-gray-500 block leading-snug mt-0.5">
                          e.g. {useCase.example.slice(0, 80)}…
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Live mini-previews */}
            {loading && (
              <div className="flex items-center justify-center py-6">
                <div className="size-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loading && data && data.length > 0 && (
              <div>
                <p className="text-[10.5px] font-semibold text-gray-700 mb-1.5">
                  Live previews with your data
                </p>
                <div className="space-y-2">
                  {suggestions.slice(0, 3).map((s) => {
                    const preset = getPreset(s.type);
                    if (!preset) return null;
                    const fakeChart = {
                      id: `smart-${s.type}`,
                      type: s.type,
                      title: s.label,
                      dataSource: { table },
                      transform: { groupBy: groupBy || undefined, metric },
                      visualization: { ...(preset.defaults ?? {}), height: 160, showLegend: false, showGrid: false },
                    } as ChartDefinition;
                    const transformed = transformForChart(fakeChart, data);
                    return (
                      <button
                        key={s.type}
                        type="button"
                        onClick={() => onSelect(s.type, { table, groupBy, metric })}
                        className="w-full rounded-lg border border-gray-200 overflow-hidden text-left transition-all hover:shadow-md hover:border-amber-300"
                      >
                        <div className="h-[120px] bg-white p-2">
                          <MiniRenderer renderer={transformed.renderer} props={transformed.props} />
                        </div>
                        <div className="px-2.5 py-2 bg-gray-50 border-t border-gray-100">
                          <p className="text-[11px] font-semibold text-gray-800">
                            {s.label}
                            <span className="ml-1.5 text-amber-600/60 font-mono text-[10px]">{s.score}% fit</span>
                          </p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{s.reason}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
