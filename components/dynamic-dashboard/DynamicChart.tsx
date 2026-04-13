"use client";

import { useMemo } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import ChartCard from "@/components/charts/ChartCard";
import { transformForChart } from "@/lib/dashboard/transform";
import { useCrossFilter } from "./CrossFilterManager";
import type { ChartDefinition, QueryRequest } from "@/lib/dashboard/types";

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
      where: { ...chart.dataSource.where, ...crossFilterWhere },
    },
    transform: chart.transform,
    filters,
  }), [chart.dataSource, chart.transform, filters, crossFilterWhere]);

  const { data: response, isLoading, error } = useSWR(
    [`/api/data/query?clientId=${clientId}`, JSON.stringify(queryBody)],
    ([url]) => fetcher(url, queryBody),
    { revalidateOnFocus: false, dedupingInterval: 30000, errorRetryCount: 0 }
  );

  const transformed = useMemo(() => {
    if (!response?.data) return null;
    return transformForChart(chart, response.data);
  }, [chart, response?.data]);

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

  // KPI cards get a dedicated premium layout
  if (chart.type === "kpi" || chart.type === "stat_card") {
    return (
      <KPICardPremium
        chart={chart}
        data={response?.data}
        isLoading={isLoading && !error}
        error={!!error}
      />
    );
  }

  return (
    <ChartCard
      title={chart.title}
      description={chart.subtitle}
      height={chart.visualization?.height ?? 350}
      chartData={response?.data}
    >
      {isLoading && !error && (
        <div className="flex items-center justify-center h-full">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-full text-sm text-red-400">
          Query failed — check chart configuration
        </div>
      )}
      {!isLoading && !error && transformed && (
        <ChartRenderer
          transformed={transformed}
          onChartClick={chart.emitFilter ? handleClick : undefined}
        />
      )}
      {!isLoading && !error && !transformed && (
        <div className="flex items-center justify-center h-full text-sm text-gray-400">
          No data available
        </div>
      )}
    </ChartCard>
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

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(Math.round(n * 100) / 100);
}

function formatKPIValue(value: number, format?: string): string {
  switch (format) {
    case "percentage":
      return `${value.toFixed(1)}%`;
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

function KPICardPremium({
  chart,
  data,
  isLoading,
  error,
}: {
  chart: ChartDefinition;
  data?: Record<string, unknown>[];
  isLoading: boolean;
  error: boolean;
}) {
  const metricKey = chart.transform.metrics?.length
    ? chart.transform.metrics[0].key
    : "value";
  const value = data?.length ? Number(data[0][metricKey] ?? 0) : 0;
  const formatted = formatKPIValue(value, chart.visualization?.format as string);

  // Threshold evaluation
  let accentColor = "#4f46e5";
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

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px"
      style={{
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

        {/* Threshold badge */}
        {thresholdLabel && !isLoading && (
          <div className="flex items-center gap-1 mt-1.5">
            <span
              className="text-xs font-semibold"
              style={{ color: accentColor }}
            >
              {thresholdLabel}
            </span>
          </div>
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
