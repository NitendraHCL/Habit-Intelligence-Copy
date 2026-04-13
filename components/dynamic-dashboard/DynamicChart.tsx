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
      return <KPIRenderer {...(props as any)} />;
    case "html":
      return <HTMLRenderer {...(props as any)} />;
    default:
      return <div className="text-sm text-gray-400">Unsupported chart type</div>;
  }
}

// ── Inline KPI renderer ──

function KPIRenderer({
  value,
  format,
  thresholdColor,
  thresholdLabel,
}: {
  value: number;
  format?: string;
  thresholdColor?: string;
  thresholdLabel?: string;
}) {
  const formatted =
    format === "percentage"
      ? `${value.toFixed(1)}%`
      : value.toLocaleString("en-IN");

  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <span className="text-3xl font-bold" style={{ color: thresholdColor }}>
        {formatted}
      </span>
      {thresholdLabel && (
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: thresholdColor ? `${thresholdColor}20` : undefined,
            color: thresholdColor,
          }}
        >
          {thresholdLabel}
        </span>
      )}
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
  const formatted =
    format === "percentage"
      ? `${value.toFixed(1)}%`
      : value.toLocaleString("en-IN");

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

  // comparison_card or fallback
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-2xl font-bold">{formatted}</span>
    </div>
  );
}
