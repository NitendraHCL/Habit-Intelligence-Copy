"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { transformForChart } from "@/lib/dashboard/transform";
import { getPreset } from "@/lib/config/chart-presets";
import { CHART_USE_CASES } from "./chart-use-cases";
import type { ChartDefinition, ChartTypeId, QueryRequest } from "@/lib/dashboard/types";
import { Sparkles } from "lucide-react";

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

interface ChartSuggestorProps {
  chart: Partial<ChartDefinition>;
  clientId: string;
  onSelectType: (type: ChartTypeId) => void;
}

interface Suggestion {
  type: ChartTypeId;
  label: string;
  reason: string;
  score: number;
}

function suggestChartTypes(chart: Partial<ChartDefinition>): Suggestion[] {
  const gb = chart.transform?.groupBy;
  const groupBys = gb ? (Array.isArray(gb) ? gb : [gb]) : [];
  const groupByCount = groupBys.length;
  const hasTimeGroupBy = groupBys.some((g) => /^(month|week|day|year|quarter|hour)\(/.test(g));
  const metricCount = chart.transform?.metrics?.length ?? 1;
  const metric = chart.transform?.metric ?? "count";
  const isCountOnly = metric === "count" && !chart.transform?.metrics?.length;

  const suggestions: Suggestion[] = [];

  function add(type: ChartTypeId, score: number, reason: string) {
    const preset = getPreset(type);
    if (preset) suggestions.push({ type, label: preset.label, reason, score });
  }

  if (groupByCount === 0 && metricCount === 1) {
    add("kpi", 100, "Single value — perfect for a KPI card");
    add("gauge", 80, "Single value shown as a dial");
    add("progress_ring", 75, "Circular progress visualization");
    add("stat_card", 70, "Compact stat with label");
    return suggestions;
  }

  if (hasTimeGroupBy && metricCount === 1) {
    add("line", 100, "Time trend — line shows changes over time");
    add("area", 90, "Time trend with filled volume emphasis");
    add("bar", 80, "Time periods as discrete bars");
    add("sparkline", 70, "Compact micro-trend");
    add("step_line", 60, "Discrete step changes over time");
  }

  if (hasTimeGroupBy && metricCount >= 2) {
    add("composed", 100, "Multiple metrics over time — bar + line combo");
    add("stacked_area", 90, "Cumulative volume split over time");
    add("line", 85, "Multi-series line comparison");
    add("stacked_bar", 75, "Stacked composition per period");
    add("slope", 60, "Before→after comparison for 2 periods");
  }

  if (!hasTimeGroupBy && groupByCount === 1 && metricCount === 1) {
    add("bar", 100, "Category comparison — clear and universal");
    add("horizontal_bar", 90, "Better for long category labels");
    add("pie", 80, "Proportional split (best with <8 categories)");
    add("donut", 78, "Proportional split with center hole");
    add("treemap", 75, "Area-based proportional view");
    add("lollipop", 70, "Cleaner bar alternative for rankings");
    add("funnel", 55, "If data represents sequential stages");
  }

  if (!hasTimeGroupBy && groupByCount === 1 && metricCount >= 2) {
    add("grouped_bar", 100, "Side-by-side metric comparison per category");
    add("stacked_bar", 90, "Composition within each category");
    add("radar", 80, "Multi-metric profile per category");
    add("composed", 75, "Mixed bar + line for different scales");
    add("dumbbell", 65, "Two-value comparison per category");
    add("tornado", 60, "Back-to-back comparison (e.g. Male vs Female)");
  }

  if (groupByCount === 2) {
    add("heatmap", 100, "Two-dimensional intensity matrix");
    add("sunburst", 90, "Nested hierarchical rings");
    add("stacked_bar", 80, "First group as X, second as stack");
    add("sankey", 70, "Flow between two categorical dimensions");
    add("treemap", 65, "Nested rectangles for hierarchical data");
  }

  if (groupByCount >= 3) {
    add("sunburst", 100, "3-level hierarchical rings");
    add("treemap", 80, "Nested rectangles");
  }

  if (isCountOnly && groupByCount === 1) {
    add("word_cloud", 50, "If categories are text/tags");
    add("nightingale", 50, "Rose chart — radius encodes value");
  }

  // Deduplicate by type (keep highest score)
  const seen = new Map<ChartTypeId, Suggestion>();
  for (const s of suggestions) {
    if (!seen.has(s.type) || seen.get(s.type)!.score < s.score) {
      seen.set(s.type, s);
    }
  }

  return Array.from(seen.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
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
    default: return <div className="flex items-center justify-center h-full text-[10px] text-gray-400">Preview N/A</div>;
  }
}

export default function ChartSuggestor({ chart, clientId, onSelectType }: ChartSuggestorProps) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  const suggestions = useMemo(() => suggestChartTypes(chart), [chart]);

  const canSuggest = !!chart.dataSource?.table && !!(chart.transform?.groupBy || chart.transform?.metric);

  useEffect(() => {
    if (!open || !canSuggest || !chart.dataSource?.table) return;
    let cancelled = false;
    setLoading(true);
    const body: QueryRequest = {
      dataSource: chart.dataSource!,
      transform: { ...(chart.transform ?? {}), limit: 30 },
    };
    fetch(`/api/data/query?clientId=${clientId}&testMode=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.data) setData(d.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canSuggest, chart.dataSource?.table, JSON.stringify(chart.transform)]);

  if (!canSuggest || suggestions.length === 0) return null;

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-50"
      >
        <Sparkles className="size-3.5 text-amber-600 shrink-0" />
        <span className="text-[11.5px] font-semibold text-amber-900">
          {open ? "Suggested Charts" : "Which chart fits this data best?"}
        </span>
        <span className="text-[11px] text-amber-700/70 ml-auto">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* Suggestion list */}
          <div className="space-y-1">
            {suggestions.map((s, i) => (
              <button
                key={s.type}
                type="button"
                onClick={() => {
                  onSelectType(s.type);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                  chart.type === s.type
                    ? "bg-amber-200/50 border border-amber-300"
                    : "hover:bg-amber-100/50 border border-transparent"
                }`}
              >
                <span className="text-[11px] font-bold text-amber-700 w-4 shrink-0 mt-0.5">
                  {i + 1}.
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[12px] font-semibold text-amber-900 block">
                    {s.label}
                  </span>
                  <span className="text-[10.5px] text-amber-700/80 block leading-snug">
                    {s.reason}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[10px] font-mono text-amber-600/60 mt-0.5"
                  title="Fit score"
                >
                  {s.score}%
                </span>
              </button>
            ))}
          </div>

          {/* Live mini-previews */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="size-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && data && data.length > 0 && (
            <div>
              <p className="text-[10.5px] font-semibold text-amber-800 mb-1.5">
                Live previews with your data
              </p>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.slice(0, 4).map((s) => {
                  const preset = getPreset(s.type);
                  if (!preset) return null;
                  const fakeChart = {
                    id: `preview-${s.type}`,
                    type: s.type,
                    title: s.label,
                    dataSource: chart.dataSource!,
                    transform: chart.transform ?? {},
                    visualization: {
                      ...(preset.defaults ?? {}),
                      ...(chart.visualization ?? {}),
                      height: 120,
                      showLegend: false,
                    },
                  } as ChartDefinition;
                  const transformed = transformForChart(fakeChart, data);
                  const useCase = CHART_USE_CASES[s.type];
                  return (
                    <button
                      key={s.type}
                      type="button"
                      onClick={() => {
                        onSelectType(s.type);
                        setOpen(false);
                      }}
                      className={`rounded-lg border overflow-hidden text-left transition-all hover:shadow ${
                        chart.type === s.type
                          ? "border-amber-400 ring-2 ring-amber-200"
                          : "border-gray-200 hover:border-amber-300"
                      }`}
                    >
                      <div className="h-[100px] bg-white p-1">
                        <MiniRenderer
                          renderer={transformed.renderer}
                          props={transformed.props}
                        />
                      </div>
                      <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-100">
                        <p className="text-[10.5px] font-semibold text-gray-800 truncate">
                          {s.label}
                        </p>
                        {useCase && (
                          <p className="text-[9.5px] text-gray-500 truncate">
                            {useCase.bestFor.slice(0, 60)}…
                          </p>
                        )}
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
  );
}
