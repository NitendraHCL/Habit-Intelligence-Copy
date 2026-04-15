"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { renderTemplate } from "@/lib/dashboard/render-helpers";
import type { ValueSlider, VisualMapConfig } from "@/lib/dashboard/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface HeatmapRendererProps {
  data: [number, number, number][];
  xLabels: string[];
  yLabels: string[];
  title?: string;
  minColor?: string;
  maxColor?: string;
  tooltipTemplate?: string;
  valueSlider?: ValueSlider;
  visualMap?: VisualMapConfig;
}

export default function HeatmapRenderer({
  data,
  xLabels,
  yLabels,
  title,
  minColor = "#f3e8ff",
  maxColor = "#7C3AED",
  tooltipTemplate,
  valueSlider,
  visualMap,
}: HeatmapRendererProps) {
  const dataMin = useMemo(() => data.reduce((m, d) => Math.min(m, d[2]), Infinity), [data]);
  const dataMax = useMemo(() => data.reduce((m, d) => Math.max(m, d[2]), -Infinity), [data]);
  const sliderEnabled = valueSlider?.enabled === true;
  const sliderMin = valueSlider?.min ?? (isFinite(dataMin) ? dataMin : 0);
  const sliderMax = valueSlider?.max ?? (isFinite(dataMax) ? dataMax : 0);
  const [range, setRange] = useState<[number, number]>([sliderMin, sliderMax]);

  const filteredData = sliderEnabled
    ? data.filter(([, , v]) => v >= range[0] && v <= range[1])
    : data;

  const vmMin = visualMap?.min ?? 0;
  const vmMax = visualMap?.max ?? Math.max(...data.map((d) => d[2]), 1);
  const vmMinColor = visualMap?.minColor ?? minColor;
  const vmMaxColor = visualMap?.maxColor ?? maxColor;

  const option = {
    tooltip: {
      position: "top" as const,
      formatter: (params: { value: number[] }) => {
        const [x, y, val] = params.value;
        if (tooltipTemplate) {
          return renderTemplate(tooltipTemplate, {
            name: `${xLabels[x]} × ${yLabels[y]}`,
            value: val,
            x: xLabels[x],
            y: yLabels[y],
          });
        }
        return `${xLabels[x]} x ${yLabels[y]}: <strong>${val}</strong>`;
      },
    },
    grid: {
      top: title ? 40 : 20,
      left: 80,
      right: 40,
      bottom: 60,
    },
    xAxis: {
      type: "category" as const,
      data: xLabels,
      axisLabel: { fontSize: 10, rotate: 30 },
      splitArea: { show: true },
    },
    yAxis: {
      type: "category" as const,
      data: yLabels,
      axisLabel: { fontSize: 10 },
      splitArea: { show: true },
    },
    visualMap: {
      min: vmMin,
      max: vmMax,
      calculable: true,
      orient: "horizontal" as const,
      left: visualMap?.position === "left" ? "left" : visualMap?.position === "right" ? "right" : "center",
      bottom: visualMap?.position === "top" ? undefined : 0,
      top: visualMap?.position === "top" ? 0 : undefined,
      inRange: { color: [vmMinColor, vmMaxColor] },
      textStyle: { fontSize: 10 },
    },
    series: [
      {
        type: "heatmap",
        data: filteredData,
        label: { show: true, fontSize: 9 },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.3)" },
        },
        ...(visualMap?.markerValue !== undefined && {
          markPoint: {
            symbol: "pin",
            symbolSize: 28,
            label: {
              show: true,
              formatter: visualMap.markerLabel ?? `Peak: ${visualMap.markerValue}`,
              fontSize: 10,
              color: "#fff",
            },
            data: [{ name: "marker", value: visualMap.markerValue, xAxis: 0, yAxis: 0 }],
          },
        }),
      },
    ],
  };

  return (
    <div className="flex flex-col h-full">
      {sliderEnabled && (
        <div className="flex items-center gap-3 px-2 py-1.5 mb-2 bg-gray-50 rounded">
          <span className="text-[10.5px] font-medium text-gray-600 whitespace-nowrap">
            Volume range:
          </span>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            value={range[0]}
            onChange={(e) => setRange([Number(e.target.value), range[1]])}
            className="flex-1 h-1 accent-indigo-500"
          />
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            value={range[1]}
            onChange={(e) => setRange([range[0], Number(e.target.value)])}
            className="flex-1 h-1 accent-indigo-500"
          />
          <span className="text-[10.5px] font-mono text-gray-700 whitespace-nowrap min-w-[80px]">
            {range[0]} – {range[1]}
          </span>
        </div>
      )}
      <div className="flex-1">
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
