"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import CVCardDynamic from "./CVCardDynamic";
import { transformForChart } from "@/lib/dashboard/transform";
import { useCrossFilter } from "./CrossFilterManager";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import { CHART_PALETTE } from "@/lib/design-tokens";
import { renderTemplate, safePct } from "@/lib/dashboard/render-helpers";
import type {
  ChartDefinition,
  QueryRequest,
  TransformConfig,
  ViewToggle,
  WhereCondition,
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

  // ── View-mode toggle state ──
  const toggles: ViewToggle[] = (chart.visualization?.toggles as ViewToggle[]) ?? [];
  const defaultToggleId = toggles.find((t) => t.default)?.id ?? toggles[0]?.id ?? null;
  const [activeToggleId, setActiveToggleId] = useState<string | null>(defaultToggleId);
  const activeToggle = toggles.find((t) => t.id === activeToggleId);

  // Apply toggle action to transform + dataSource.where
  const effectiveTransform: TransformConfig = useMemo(() => {
    if (!activeToggle) return chart.transform;
    const t = { ...chart.transform };
    if (activeToggle.action.regroup) t.groupBy = activeToggle.action.regroup;
    if (activeToggle.action.metric) t.metric = activeToggle.action.metric;
    return t;
  }, [chart.transform, activeToggle]);

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
      where: { ...chart.dataSource.where, ...toggleWhere, ...crossFilterWhere },
    },
    transform: effectiveTransform,
    filters,
  }), [chart.dataSource, effectiveTransform, filters, crossFilterWhere, toggleWhere]);

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

  const handleClick = (params: Record<string, unknown>) => {
    if (!chart.emitFilter || !chart.linkGroup) return;
    const value = String(params.name ?? params[chart.emitFilter.column] ?? "");
    if (value) {
      setFilter(chart.linkGroup, {
        column: chart.emitFilter.column,
        value,
      });
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
        </div>
      )}
      {!isLoading && !error && transformed && (
        <div style={{ height: chart.visualization?.height ?? 350 }}>
          <ChartRenderer
            transformed={transformed}
            onChartClick={chart.emitFilter ? handleClick : undefined}
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
      return <BarChartRenderer {...(props as any)} />;
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
