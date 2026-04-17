"use client";

import dynamic from "next/dynamic";
import type { ColorByValueRange, BackgroundOverlay } from "@/lib/dashboard/types";
import { CHART_PALETTE } from "@/lib/design-tokens";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface CategoricalBubbleRendererProps {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  sizeKey: string;
  colorKey?: string;
  xLabels?: string[];
  yLabels?: string[];
  colorByValueRange?: ColorByValueRange;
  background?: BackgroundOverlay;
  tooltipTemplate?: string;
}

function bucketColor(
  value: number,
  total: number,
  cfg: ColorByValueRange | undefined,
  fallback: string
): string {
  if (!cfg) return fallback;
  const v = cfg.source === "pct" ? (total > 0 ? (value / total) * 100 : 0) : value;
  for (const b of cfg.buckets) {
    const okMin = b.from === undefined || v >= b.from;
    const okMax = b.to === undefined || v < b.to;
    if (okMin && okMax) return b.color;
  }
  return fallback;
}

export default function CategoricalBubbleRenderer({
  data,
  xKey,
  yKey,
  sizeKey,
  colorKey,
  xLabels: xLabelsOverride,
  yLabels: yLabelsOverride,
  colorByValueRange,
  background,
}: CategoricalBubbleRendererProps) {
  // Derive category labels from data
  const xSet = new Set<string>();
  const ySet = new Set<string>();
  for (const row of data) {
    xSet.add(String(row[xKey] ?? ""));
    ySet.add(String(row[yKey] ?? ""));
  }
  const xLabels = xLabelsOverride ?? Array.from(xSet);
  const yLabels = yLabelsOverride ?? Array.from(ySet);

  // Size range
  const sizeValues = data.map((r) => Number(r[sizeKey] ?? 0));
  const maxSize = Math.max(...sizeValues, 1);

  // Build scatter data: [xIndex, yIndex, sizeValue, colorValue, rawRow]
  const scatterData = data.map((row) => {
    const xi = xLabels.indexOf(String(row[xKey] ?? ""));
    const yi = yLabels.indexOf(String(row[yKey] ?? ""));
    const size = Number(row[sizeKey] ?? 0);
    const colorVal = colorKey ? Number(row[colorKey] ?? 0) : size;
    return [xi, yi, size, colorVal, row];
  });

  // Alternating vertical band markAreas
  const markAreaData: { xAxis: number }[][] = [];
  if (background?.type === "vertical_bands") {
    for (let i = 0; i < xLabels.length; i += 2) {
      markAreaData.push([
        { xAxis: i - 0.5 } as { xAxis: number },
        { xAxis: i + 0.5 } as { xAxis: number },
      ]);
    }
  }

  const bandColor = background?.color ?? "#F3F4F6";
  const bandOpacity = background?.opacity ?? 0.5;

  const option = {
    tooltip: {
      trigger: "item" as const,
      formatter: (params: { data: unknown[] }) => {
        const d = params.data;
        if (!Array.isArray(d) || d.length < 5) return "";
        const row = d[4] as Record<string, unknown>;
        const x = xLabels[d[0] as number] ?? "";
        const y = yLabels[d[1] as number] ?? "";
        const size = Number(d[2]);
        const lines = [
          `<strong>${x}</strong> — ${y}`,
          `Volume: <strong>${size.toLocaleString("en-IN")}</strong>`,
        ];
        if (colorKey && row[colorKey] !== undefined) {
          lines.push(`${colorKey}: <strong>${Number(row[colorKey]).toFixed(1)}</strong>`);
        }
        return lines.join("<br/>");
      },
    },
    grid: {
      left: 120,
      right: 30,
      top: 20,
      bottom: 50,
    },
    xAxis: {
      type: "category" as const,
      data: xLabels,
      axisLabel: {
        fontSize: 11,
        rotate: xLabels.some((l) => l.length > 12) ? 25 : 0,
        fontWeight: 500,
      },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category" as const,
      data: yLabels,
      axisLabel: { fontSize: 11, fontWeight: 500 },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        type: "scatter",
        data: scatterData,
        symbolSize: (val: number[]) => {
          const ratio = val[2] / maxSize;
          return Math.max(8, Math.min(50, ratio * 50));
        },
        itemStyle: {
          color: (params: { data: unknown[] }) => {
            const d = params.data;
            if (!Array.isArray(d)) return CHART_PALETTE[0];
            const colorVal = Number(d[3] ?? 0);
            const size = Number(d[2] ?? 0);
            return bucketColor(colorVal, size, colorByValueRange, CHART_PALETTE[0]);
          },
          opacity: 0.85,
          borderColor: "#fff",
          borderWidth: 1.5,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0,0,0,0.2)",
          },
        },
        ...(markAreaData.length > 0 && {
          markArea: {
            silent: true,
            itemStyle: {
              color: bandColor,
              opacity: bandOpacity,
            },
            data: markAreaData,
          },
        }),
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />;
}
