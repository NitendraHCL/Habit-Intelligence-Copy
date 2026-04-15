"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { transformForChart } from "@/lib/dashboard/transform";
import type { ChartDefinition, QueryRequest } from "@/lib/dashboard/types";

const BarChartRenderer = dynamic(() => import("@/components/charts/renderers/BarChartRenderer"));
const LineChartRenderer = dynamic(() => import("@/components/charts/renderers/LineChartRenderer"));
const AreaChartRenderer = dynamic(() => import("@/components/charts/renderers/AreaChartRenderer"));
const PieChartRenderer = dynamic(() => import("@/components/charts/renderers/PieChartRenderer"));
const TreemapRenderer = dynamic(() => import("@/components/charts/renderers/TreemapRenderer"));
const SunburstRenderer = dynamic(() => import("@/components/charts/renderers/SunburstRenderer"));
const HeatmapRenderer = dynamic(() => import("@/components/charts/renderers/HeatmapRenderer"));
const TableRenderer = dynamic(() => import("@/components/charts/renderers/TableRenderer"));
const FunnelRenderer = dynamic(() => import("@/components/charts/renderers/FunnelRenderer"));
const RadarChartRenderer = dynamic(() => import("@/components/charts/renderers/RadarChartRenderer"));
const ComposedChartRenderer = dynamic(() => import("@/components/charts/renderers/ComposedChartRenderer"));
const GenericEChartsRenderer = dynamic(() => import("@/components/charts/renderers/GenericEChartsRenderer"));

interface ChartPreviewProps {
  chart: Partial<ChartDefinition>;
  clientId: string;
  /** When true, only fetches if all required fields are present. */
  enabled?: boolean;
}

/**
 * Live preview of a chart inside the configurator. Refetches when the chart
 * config changes (debounced) and re-renders the same component the page
 * would render at runtime.
 */
export default function ChartPreview({ chart, clientId, enabled = true }: ChartPreviewProps) {
  const [data, setData] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = useMemo(() => {
    if (!enabled) return false;
    if (!clientId) return false;
    if (!chart.type) return false;
    if (!chart.dataSource?.table) return false;
    return true;
  }, [chart.type, chart.dataSource?.table, clientId, enabled]);

  // Debounce: only refetch 400ms after the last change to dataSource/transform
  const queryKey = useMemo(
    () => JSON.stringify({ ds: chart.dataSource, tf: chart.transform }),
    [chart.dataSource, chart.transform]
  );

  useEffect(() => {
    if (!ready || !chart.dataSource) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const handle = setTimeout(async () => {
      try {
        const body: QueryRequest = {
          dataSource: chart.dataSource!,
          transform: { ...(chart.transform ?? {}), limit: 50 },
        };
        const res = await fetch(`/api/data/query?clientId=${clientId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `Query failed (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) setData(json.data ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Query failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [queryKey, clientId, ready]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-gray-400">
        Pick a chart type and data source to preview
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="size-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-red-500 px-3 text-center">
        {err}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs text-gray-400">
        No data
      </div>
    );
  }

  // Build a complete ChartDefinition for transform
  const completeChart = {
    id: chart.id ?? "preview",
    type: chart.type!,
    title: chart.title ?? "",
    subtitle: chart.subtitle,
    dataSource: chart.dataSource!,
    transform: chart.transform ?? {},
    visualization: chart.visualization,
    thresholds: chart.thresholds,
  } as ChartDefinition;

  const transformed = transformForChart(completeChart, data);

  const height = (chart.visualization?.height as number) ?? 280;

  return (
    <div style={{ height }} className="relative">
      <RendererSwitch
        renderer={transformed.renderer}
        props={transformed.props as Record<string, unknown>}
      />
      {loading && (
        <div className="absolute top-2 right-2 size-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RendererSwitch({ renderer, props }: { renderer: string; props: any }) {
  switch (renderer) {
    case "bar":
      return <BarChartRenderer {...props} />;
    case "line":
      return <LineChartRenderer {...props} />;
    case "area":
      return <AreaChartRenderer {...props} />;
    case "pie":
      return <PieChartRenderer {...props} />;
    case "radar":
      return <RadarChartRenderer {...props} />;
    case "composed":
      return <ComposedChartRenderer {...props} />;
    case "funnel":
      return <FunnelRenderer {...props} />;
    case "heatmap":
      return <HeatmapRenderer {...props} />;
    case "treemap":
      return <TreemapRenderer {...props} />;
    case "sunburst":
      return <SunburstRenderer {...props} />;
    case "echarts":
      return <GenericEChartsRenderer {...props} />;
    case "table":
      return <TableRenderer {...props} />;
    default:
      return (
        <div className="text-xs text-gray-400 flex items-center justify-center h-full">
          Preview not available for this chart type
        </div>
      );
  }
}
