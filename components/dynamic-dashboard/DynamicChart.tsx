"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import CVCardDynamic from "./CVCardDynamic";
import { transformForChart } from "@/lib/dashboard/transform";
import { useCrossFilter } from "./CrossFilterManager";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info, TrendingUp, TrendingDown, ChevronLeft } from "lucide-react";
import { CHART_PALETTE } from "@/lib/design-tokens";
import { renderTemplate, safePct } from "@/lib/dashboard/render-helpers";
import type {
  ChartDefinition,
  QueryRequest,
  TransformConfig,
  ViewToggle,
  TabsFromColumn,
  WhereCondition,
  SummaryKpi,
  ToggleLayout,
  DrillDownConfig,
  DrillThroughConfig,
} from "@/lib/dashboard/types";

// Lazy-load renderers
const BarChartRenderer = dynamic(() => import("@/components/charts/renderers/BarChartRenderer"));
const LineChartRenderer = dynamic(() => import("@/components/charts/renderers/LineChartRenderer"));
const AreaChartRenderer = dynamic(() => import("@/components/charts/renderers/AreaChartRenderer"));
const PieChartRenderer = dynamic(() => import("@/components/charts/renderers/PieChartRenderer"));
const RadarChartRenderer = dynamic(() => import("@/components/charts/renderers/RadarChartRenderer"));
const ScatterChartRenderer = dynamic(() => import("@/components/charts/renderers/ScatterChartRenderer"));
const BubbleChartRenderer = dynamic(() => import("@/components/charts/renderers/BubbleChartRenderer"));
const ComposedChartRenderer = dynamic(() => import("@/components/charts/renderers/ComposedChartRenderer"));
const FunnelRenderer = dynamic(() => import("@/components/charts/renderers/FunnelRenderer"));
const HeatmapRenderer = dynamic(() => import("@/components/charts/renderers/HeatmapRenderer"));
const TreemapRenderer = dynamic(() => import("@/components/charts/renderers/TreemapRenderer"));
const SunburstRenderer = dynamic(() => import("@/components/charts/renderers/SunburstRenderer"));
const GenericEChartsRenderer = dynamic(() => import("@/components/charts/renderers/GenericEChartsRenderer"));
const TableRenderer = dynamic(() => import("@/components/charts/renderers/TableRenderer"));
const TileGridRenderer = dynamic(() => import("@/components/charts/renderers/TileGridRenderer"));
const NarrativeRenderer = dynamic(() => import("@/components/charts/renderers/NarrativeRenderer"));

const fetcher = async (url: string, body: QueryRequest) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Query failed");
  return res.json();
};

interface DynamicChartProps {
  chart: ChartDefinition;
  clientId: string;
  filters?: QueryRequest["filters"];
}

export default function DynamicChart({
  chart,
  clientId,
  filters,
}: DynamicChartProps) {
  const { getFilter, setFilter } = useCrossFilter();
  const router = useRouter();

  // ── PBI-2: drill-down state ──
  const drillDown = chart.visualization?.drillDown as DrillDownConfig | undefined;
  // Drill-path: each entry is a {column, value} pair selected by the user.
  const [drillPath, setDrillPath] = useState<{ column: string; value: string }[]>([]);
  const drillLevelIndex = drillPath.length;
  const drillCurrentColumn = drillDown?.levels?.[drillLevelIndex];

  const drillWhere: Record<string, WhereCondition> | undefined = useMemo(() => {
    if (!drillPath.length) return undefined;
    const out: Record<string, WhereCondition> = {};
    for (const step of drillPath) out[step.column] = { eq: step.value };
    return out;
  }, [drillPath]);

  // ── View-mode toggle state ──
  const toggles: ViewToggle[] = (chart.visualization?.toggles as ViewToggle[]) ?? [];
  const defaultToggleId = toggles.find((t) => t.default)?.id ?? toggles[0]?.id ?? null;
  const [activeToggleId, setActiveToggleId] = useState<string | null>(defaultToggleId);
  const activeToggle = toggles.find((t) => t.id === activeToggleId);

  // ── Auto-tabs from column ──
  const tabsCfg = chart.visualization?.tabsFromColumn as TabsFromColumn | undefined;
  const [tabValues, setTabValues] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Only refetch tab values when the *primitive* table identity changes,
  // not when the parent re-creates dataSource/transform objects on each render.
  const dataSourceTable = chart.dataSource?.table;
  useEffect(() => {
    if (!tabsCfg?.column || !clientId || !dataSourceTable) return;
    let cancelled = false;
    fetch(`/api/data/query?clientId=${clientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataSource: { table: dataSourceTable },
        transform: {
          groupBy: tabsCfg.column,
          metric: "count",
          sort: "desc",
          limit: tabsCfg.limit ?? 12,
        },
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.data?.length) return;
        const vals = d.data
          .map((r: Record<string, unknown>) => String(r[tabsCfg.column] ?? ""))
          .filter(Boolean);
        setTabValues(vals);
        if (tabsCfg.showAll !== false) {
          setActiveTab(null);
        } else if (vals.length) {
          setActiveTab(vals[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tabsCfg?.column, tabsCfg?.limit, tabsCfg?.showAll, clientId, dataSourceTable]);

  const tabWhere: Record<string, WhereCondition> | undefined = useMemo(() => {
    if (!tabsCfg?.column || !activeTab) return undefined;
    return { [tabsCfg.column]: { eq: activeTab } };
  }, [tabsCfg?.column, activeTab]);

  // Apply toggle action + drill-down to transform + dataSource.where
  const effectiveTransform: TransformConfig = useMemo(() => {
    let t: TransformConfig = chart.transform;
    if (activeToggle) {
      t = { ...t };
      if (activeToggle.action.regroup) t.groupBy = activeToggle.action.regroup;
      if (activeToggle.action.metric) t.metric = activeToggle.action.metric;
    }
    // Drill-down overrides groupBy with the current level's column.
    if (drillCurrentColumn) {
      t = { ...t, groupBy: drillCurrentColumn };
    }
    return t;
  }, [chart.transform, activeToggle, drillCurrentColumn]);

  const toggleWhere: Record<string, WhereCondition> | undefined = useMemo(() => {
    if (!activeToggle?.action.refilter) return undefined;
    const { column, value } = activeToggle.action.refilter;
    return { [column]: { eq: value } };
  }, [activeToggle]);

  // Build cross-filter WHERE additions
  const crossFilterWhere = useMemo(() => {
    if (!chart.receiveFilter?.length || !chart.linkGroup) return undefined;
    const linkFilter = getFilter(chart.linkGroup);
    if (!linkFilter) return undefined;
    if (!chart.receiveFilter.includes(linkFilter.column)) return undefined;
    return { [linkFilter.column]: { eq: linkFilter.value } };
  }, [chart.receiveFilter, chart.linkGroup, getFilter]);

  // Build query request
  const queryBody = useMemo<QueryRequest>(() => ({
    dataSource: {
      table: chart.dataSource.table,
      where: {
        ...chart.dataSource.where,
        ...toggleWhere,
        ...tabWhere,
        ...drillWhere,
        ...crossFilterWhere,
      },
    },
    transform: effectiveTransform,
    filters,
  }), [chart.dataSource, effectiveTransform, filters, crossFilterWhere, toggleWhere, tabWhere, drillWhere]);

  const { data: response, isLoading, error } = useSWR(
    [`/api/data/query?clientId=${clientId}`, JSON.stringify(queryBody)],
    ([url]) => fetcher(url, queryBody),
    { revalidateOnFocus: false, dedupingInterval: 30000, errorRetryCount: 0 }
  );

  const transformed = useMemo(() => {
    if (!response?.data) return null;
    // Pass effective transform so view-mode toggles affect chart shape
    return transformForChart(
      { ...chart, transform: effectiveTransform },
      response.data
    );
  }, [chart, effectiveTransform, response?.data]);

  const drillThrough = chart.visualization?.drillThrough as DrillThroughConfig | undefined;

  const handleClick = (params: Record<string, unknown>) => {
    const clickValue = String(params.name ?? "");

    // PBI-5: Drill-through — route to another page with the clicked value as a URL param.
    if (drillThrough && clickValue) {
      const valueCol = drillThrough.valueColumn ?? drillThrough.paramColumn;
      const raw = params[valueCol] ?? params.name ?? clickValue;
      const url = `${drillThrough.slug}?${encodeURIComponent(
        drillThrough.paramColumn
      )}=${encodeURIComponent(String(raw))}`;
      router.push(url);
      return;
    }

    // PBI-2: Drill-down — advance the path to the next level.
    if (drillDown?.levels?.length && drillCurrentColumn && clickValue) {
      setDrillPath((prev) => [...prev, { column: drillCurrentColumn, value: clickValue }]);
      return;
    }

    // Cross-filter behavior (existing)
    if (chart.emitFilter && chart.linkGroup) {
      const value = String(params.name ?? params[chart.emitFilter.column] ?? "");
      if (value) {
        setFilter(chart.linkGroup, {
          column: chart.emitFilter.column,
          value,
        });
      }
    }
  };

  // Generate auto-insight from data (honors visualization.insightTemplate;
  // empty string = suppress; undefined = default sentence)
  const autoInsight = useMemo(() => {
    if (!response?.data?.length || isLoading) return null;
    const template = chart.visualization?.insightTemplate;
    if (template === "") return null;
    return generateInsight(
      { ...chart, transform: effectiveTransform },
      response.data,
      typeof template === "string" ? template : undefined
    );
  }, [chart, effectiveTransform, response?.data, isLoading]);

  // G3: top-of-card insight slot
  const topInsight = useMemo(() => {
    if (!response?.data?.length || isLoading) return null;
    const template = chart.visualization?.topInsightTemplate as string | undefined;
    if (!template) return null;
    return generateInsight(
      { ...chart, transform: effectiveTransform },
      response.data,
      template
    );
  }, [chart, effectiveTransform, response?.data, isLoading]);

  // G8: sub-KPI strip below the chart inside the same card
  const summaryKpis = (chart.visualization?.summaryKpis as SummaryKpi[] | undefined) ?? [];
  const summaryStrip = useMemo(() => {
    if (!summaryKpis.length || !response?.data?.length) return null;
    return (
      <div
        className="grid gap-3 mt-4"
        style={{
          gridTemplateColumns: `repeat(${Math.min(summaryKpis.length, 4)}, minmax(0, 1fr))`,
        }}
      >
        {summaryKpis.map((kpi, i) => {
          const value = evaluateKpiExpr(kpi.expr, response.data ?? []);
          return (
            <div
              key={i}
              className="rounded-xl px-3 py-3 text-center"
              style={{ backgroundColor: kpi.bgColor ?? "#F5F6FA" }}
            >
              <p
                className="text-[16px] font-extrabold"
                style={{ color: kpi.color ?? "#111827" }}
              >
                {value}
              </p>
              <p className="text-[11px] font-medium" style={{ color: "#6B7280" }}>
                {kpi.label}
              </p>
              {kpi.sublabel && (
                <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                  {kpi.sublabel}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }, [summaryKpis, response?.data]);

  // Auto-generate interaction hint subtitle
  const interactionHint = useMemo(() => {
    if (chart.subtitle) return chart.subtitle;
    return getInteractionHint(chart.type);
  }, [chart.subtitle, chart.type]);

  // Accent color based on chart type
  const accentColor = (chart.visualization?.colors as string[])?.[0] ?? CHART_PALETTE[0];

  // KPI cards get a dedicated premium layout
  if (chart.type === "kpi" || chart.type === "stat_card") {
    return (
      <KPICardPremium
        chart={chart}
        data={response?.data}
        isLoading={isLoading && !error}
        error={!!error}
        clientId={clientId}
        filters={filters}
      />
    );
  }

  return (
    <CVCardDynamic
      title={chart.title}
      subtitle={interactionHint}
      tooltipText={chart.tooltipText}
      accentColor={accentColor}
      accentColorEnd={CHART_PALETTE[1]}
      chartData={response?.data}
      chartTitle={chart.title}
      chartDescription={interactionHint}
      insightText={autoInsight ?? undefined}
      topInsightText={topInsight ?? undefined}
      belowContent={summaryStrip}
    >
      {isLoading && !error && (
        <div className="flex items-center justify-center" style={{ height: chart.visualization?.height ?? 350 }}>
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center text-sm text-red-400" style={{ height: chart.visualization?.height ?? 350 }}>
          Query failed — check chart configuration
        </div>
      )}
      {toggles.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          {(chart.visualization?.toggleLayout as ToggleLayout) === "dropdown" ? (
            <select
              value={activeToggleId ?? ""}
              onChange={(e) => setActiveToggleId(e.target.value || null)}
              className="px-3 py-1.5 text-[11.5px] font-medium rounded-md border border-gray-200 bg-white"
            >
              {toggles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5"
              style={{ backgroundColor: "#F3F4F6" }}
            >
              {toggles.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveToggleId(t.id)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                    activeToggleId === t.id ? "bg-white shadow-sm" : ""
                  }`}
                  style={{
                    color: activeToggleId === t.id ? "#111827" : "#6B7280",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {tabsCfg?.column && tabValues.length > 0 && (
        <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
          {tabsCfg.showAll !== false && (
            <button
              onClick={() => setActiveTab(null)}
              className={`px-3 py-1.5 text-[11.5px] font-medium rounded-md whitespace-nowrap transition-all ${
                activeTab === null ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tabsCfg.allLabel ?? "All"}
            </button>
          )}
          {tabValues.map((v) => (
            <button
              key={v}
              onClick={() => setActiveTab(v)}
              className={`px-3 py-1.5 text-[11.5px] font-medium rounded-md whitespace-nowrap transition-all ${
                activeTab === v ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      {drillDown?.levels?.length && drillPath.length > 0 && (
        <div className="flex items-center gap-2 mb-3 text-[11.5px] text-gray-600">
          <button
            type="button"
            onClick={() => setDrillPath((p) => p.slice(0, -1))}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            <ChevronLeft className="size-3" /> Back
          </button>
          <span className="font-medium">Drill path:</span>
          <span className="text-gray-500">
            {drillPath.map((s) => `${s.column} = ${s.value}`).join(" → ")}
          </span>
        </div>
      )}
      {!isLoading && !error && transformed && (
        <div style={{ height: chart.visualization?.height ?? 350 }}>
          <ChartRenderer
            transformed={transformed}
            onChartClick={
              chart.emitFilter || drillDown?.levels?.length || drillThrough
                ? handleClick
                : undefined
            }
          />
        </div>
      )}
      {!isLoading && !error && !transformed && (
        <div className="flex items-center justify-center text-sm text-gray-400" style={{ height: chart.visualization?.height ?? 350 }}>
          No data available
        </div>
      )}
    </CVCardDynamic>
  );
}

// ── Renderer dispatcher ──

function ChartRenderer({
  transformed,
  onChartClick,
}: {
  transformed: { renderer: string; props: Record<string, unknown> };
  onChartClick?: (params: Record<string, unknown>) => void;
}) {
  const { renderer, props } = transformed;

  switch (renderer) {
    case "bar":
      return <BarChartRenderer {...(props as any)} onClick={onChartClick} />;
    case "line":
      return <LineChartRenderer {...(props as any)} />;
    case "area":
      return <AreaChartRenderer {...(props as any)} />;
    case "pie":
      return <PieChartRenderer {...(props as any)} />;
    case "radar":
      return <RadarChartRenderer {...(props as any)} />;
    case "scatter":
      return <ScatterChartRenderer {...(props as any)} />;
    case "bubble":
      return <BubbleChartRenderer {...(props as any)} />;
    case "composed":
      return <ComposedChartRenderer {...(props as any)} />;
    case "funnel":
      return <FunnelRenderer {...(props as any)} />;
    case "heatmap":
      return <HeatmapRenderer {...(props as any)} />;
    case "treemap":
      return <TreemapRenderer {...(props as any)} />;
    case "sunburst":
      return <SunburstRenderer {...(props as any)} />;
    case "echarts":
      return (
        <GenericEChartsRenderer
          {...(props as any)}
          onEvents={
            onChartClick
              ? { click: (p: unknown) => onChartClick(p as Record<string, unknown>) }
              : undefined
          }
        />
      );
    case "table":
      return <TableRenderer {...(props as any)} />;
    case "tile_grid":
      return <TileGridRenderer {...(props as any)} />;
    case "narrative":
      return <NarrativeRenderer {...(props as any)} />;
    case "kpi":
      return null; // KPIs handled by KPICardPremium before ChartRenderer
    case "html":
      return <HTMLRenderer {...(props as any)} />;
    default:
      return <div className="text-sm text-gray-400">Unsupported chart type</div>;
  }
}

// ── Premium KPI Card (matches hardcoded dashboard style) ──

function shiftYear(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(Math.round(n * 100) / 100);
}

function formatKPIValue(value: number, format?: string): string {
  switch (format) {
    case "percent":
    case "percentage":
      return `${value.toFixed(1)}%`;
    case "inr-lakhs":
      return `${(value / 100_000).toFixed(2)}L`;
    case "inr-crores":
      return `${(value / 10_000_000).toFixed(2)}Cr`;
    case "compact":
      return formatNum(value);
    case "currency":
      return `₹${formatNum(value)}`;
    case "decimal":
      return value.toFixed(2);
    default:
      return formatNum(value);
  }
}

// ── Auto-generate interaction hints ──

function getInteractionHint(chartType: string): string | undefined {
  const hints: Record<string, string> = {
    bar: "Hover a bar to see the exact count. Click to filter other charts.",
    line: "Hover a point to see the value. Trends show changes over time.",
    area: "Hover to see values. The filled area shows volume over time.",
    pie: "Hover a slice to see count and percentage.",
    donut: "Hover a slice to see count and percentage. Center shows total.",
    treemap: "Hover a rectangle to see count. Larger area = higher value.",
    sunburst: "Hover an arc to see breakdown. Click to drill down into a segment.",
    heatmap: "Darker cells indicate higher values. Hover for exact count.",
    radar: "Each axis represents a metric. Compare shapes across categories.",
    scatter: "Each dot represents a data point. Hover to see details.",
    bubble: "Bubble size represents the third dimension. Hover for details.",
    funnel: "Stages flow top to bottom. Width shows the drop-off at each stage.",
  };
  return hints[chartType];
}

// ── G8: evaluate a SummaryKpi expression against the chart's data rows ──
// Supported expressions:
//   - "sum:col"      → sum of column across rows
//   - "avg:col"      → average
//   - "max:col"      → max
//   - "min:col"      → min
//   - "count"        → row count
//   - "first.col"    → first row's column literal
//   - any other      → returned verbatim
function evaluateKpiExpr(expr: string, rows: Record<string, unknown>[]): string {
  if (!expr) return "";
  if (expr === "count") return formatNum(rows.length);
  const colonMatch = expr.match(/^(sum|avg|min|max|count_distinct):(.+)$/);
  if (colonMatch) {
    const [, fn, col] = colonMatch;
    const values = rows.map((r) => Number(r[col] ?? 0)).filter((n) => !isNaN(n));
    if (!values.length) return "0";
    switch (fn) {
      case "sum":
        return formatNum(values.reduce((a, b) => a + b, 0));
      case "avg":
        return formatNum(values.reduce((a, b) => a + b, 0) / values.length);
      case "min":
        return formatNum(Math.min(...values));
      case "max":
        return formatNum(Math.max(...values));
      case "count_distinct":
        return formatNum(new Set(rows.map((r) => r[col])).size);
    }
  }
  const firstMatch = expr.match(/^first\.(.+)$/);
  if (firstMatch && rows[0]) {
    const v = rows[0][firstMatch[1]];
    if (typeof v === "number") return formatNum(v);
    return String(v ?? "");
  }
  return expr;
}

// ── Auto-generate insight text from data ──

function generateInsight(
  chart: ChartDefinition,
  data: Record<string, unknown>[],
  template?: string
): string | null {
  if (data.length === 0) return null;

  const groupBy = chart.transform.groupBy;
  if (!groupBy) return null;
  const groupKey = typeof groupBy === "string"
    ? (groupBy.match(/^\w+\(/) ? "period" : groupBy)
    : (groupBy[0]?.match(/^\w+\(/) ? "period" : groupBy[0]);

  const metricKey = chart.transform.metrics?.length
    ? chart.transform.metrics[0].key
    : "value";

  // Find top and bottom entries
  const sorted = [...data].sort(
    (a, b) => Number(b[metricKey] ?? 0) - Number(a[metricKey] ?? 0)
  );

  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (!top || !bottom) return null;

  const topLabel = String(top[groupKey] ?? "");
  const topValueNum = Number(top[metricKey] ?? 0);
  const bottomLabel = String(bottom[groupKey] ?? "");
  const bottomValueNum = Number(bottom[metricKey] ?? 0);
  const total = data.reduce((s, r) => s + Number(r[metricKey] ?? 0), 0);
  const topPct = safePct(topValueNum, total);

  // Custom template wins
  if (template) {
    return renderTemplate(template, {
      topLabel,
      topValue: topValueNum,
      bottomLabel,
      bottomValue: bottomValueNum,
      total,
      count: data.length,
      topPct,
      title: chart.title,
    });
  }

  if (data.length === 1) {
    return `${topLabel} shows ${formatNum(topValueNum)} for ${chart.title.toLowerCase()}.`;
  }

  return `${topLabel} leads with ${formatNum(topValueNum)} (${topPct}% of total). ${bottomLabel} is lowest at ${formatNum(bottomValueNum)}. ${data.length} categories shown.`;
}

// ── KPI Card with YoY ──

function KPICardPremium({
  chart,
  data,
  isLoading,
  error,
  clientId,
  filters,
}: {
  chart: ChartDefinition;
  data?: Record<string, unknown>[];
  isLoading: boolean;
  error: boolean;
  clientId: string;
  filters?: QueryRequest["filters"];
}) {
  const metricKey = chart.transform.metrics?.length
    ? chart.transform.metrics[0].key
    : "value";
  const value = data?.length ? Number(data[0][metricKey] ?? 0) : 0;
  const statCardStyle = (chart.visualization?.statCard ?? {}) as {
    bgColor?: string;
    accentColor?: string;
    sublabelTemplate?: string;
    valueFormat?: string;
  };
  const effectiveFormat =
    statCardStyle.valueFormat ?? (chart.visualization?.format as string | undefined);
  const formatted = formatKPIValue(value, effectiveFormat);

  // YoY: fetch prior year data
  const [yoy, setYoy] = useState<number | null>(null);
  useEffect(() => {
    if (!filters?.dateFrom || !filters?.dateTo || !clientId) return;
    const priorFrom = shiftYear(filters.dateFrom, -1);
    const priorTo = shiftYear(filters.dateTo, -1);

    fetch(`/api/data/query?clientId=${clientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataSource: chart.dataSource,
        transform: chart.transform,
        filters: { ...filters, dateFrom: priorFrom, dateTo: priorTo },
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.data?.length) return;
        const prev = Number(d.data[0][metricKey] ?? 0);
        if (prev > 0) setYoy(Math.round(((value - prev) / prev) * 100));
      })
      .catch(() => {});
  }, [filters?.dateFrom, filters?.dateTo, value]);

  // Threshold evaluation
  let accentColor = statCardStyle.accentColor ?? "#4f46e5";
  let thresholdLabel = "";
  if (chart.thresholds?.length) {
    for (const t of chart.thresholds) {
      if (t.above !== undefined && value > t.above) {
        accentColor = t.color;
        thresholdLabel = t.label;
      } else if (t.max !== undefined && t.min !== undefined && value >= t.min && value <= t.max) {
        accentColor = t.color;
        thresholdLabel = t.label;
      } else if (t.max !== undefined && t.min === undefined && value <= t.max) {
        accentColor = t.color;
        thresholdLabel = t.label;
      }
    }
  }

  const sublabel = statCardStyle.sublabelTemplate
    ? renderTemplate(statCardStyle.sublabelTemplate, {
        value,
        formatted,
      })
    : null;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all hover:-translate-y-px"
      style={{
        backgroundColor: statCardStyle.bgColor ?? "#FFFFFF",
        border: "1px solid #E5E7EB",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)",
      }}
    >
      <div className="p-6">
        {/* Label */}
        <div className="flex items-center gap-1.5">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: "#9CA3AF" }}
          >
            {chart.title}
          </p>
          {chart.tooltipText && (
            <Tooltip>
              <TooltipTrigger>
                <Info size={13} style={{ color: "#9CA3AF" }} />
              </TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">
                {chart.tooltipText}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Value */}
        {isLoading ? (
          <div className="h-11 w-28 bg-gray-100 rounded animate-pulse mt-2.5" />
        ) : error ? (
          <p className="text-sm text-red-400 mt-2.5">Error</p>
        ) : (
          <p
            className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em]"
            style={{ color: accentColor }}
          >
            {formatted}
          </p>
        )}

        {/* YoY comparison */}
        {yoy !== null && !isLoading && (
          <div className="flex items-center gap-1 mt-1.5">
            {yoy >= 0 ? (
              <TrendingUp size={12} style={{ color: "#059669" }} />
            ) : (
              <TrendingDown size={12} style={{ color: "#e11d48" }} />
            )}
            <span
              className="text-xs font-semibold"
              style={{ color: yoy >= 0 ? "#059669" : "#e11d48" }}
            >
              {yoy >= 0 ? "+" : ""}{yoy}% vs Last Year
            </span>
          </div>
        )}

        {/* Sublabel from template */}
        {sublabel && (
          <p className="text-xs mt-1.5" style={{ color: "#6B7280" }}>
            {sublabel}
          </p>
        )}

        {/* Description in blue info box */}
        {chart.subtitle && (
          <p
            className="text-xs mt-3.5 leading-relaxed rounded-xl px-3 py-2"
            style={{
              backgroundColor: "#eef2ff",
              color: "#4B5563",
              border: "1px solid #c7d2fe",
            }}
          >
            {chart.subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Inline HTML renderer (progress bar, stat card, comparison card) ──

function HTMLRenderer({
  chartType,
  value,
  title,
  format,
}: {
  chartType: string;
  value: number;
  data?: Record<string, unknown>[];
  title?: string;
  format?: string;
}) {
  const formatted = formatKPIValue(value, format);

  if (chartType === "progress_bar") {
    const pct = Math.min(100, Math.max(0, value));
    return (
      <div className="flex flex-col gap-2 px-4 py-6">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">{title}</span>
          <span className="font-semibold">{formatted}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (chartType === "stat_card") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1">
        <span className="text-3xl font-bold text-gray-900">{formatted}</span>
        <span className="text-sm text-gray-500">{title}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-2xl font-bold">{formatted}</span>
    </div>
  );
}
