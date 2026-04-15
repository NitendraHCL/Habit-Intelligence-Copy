"use client";

import dynamic from "next/dynamic";
import { renderTemplate } from "@/lib/dashboard/render-helpers";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface HeatmapRendererProps {
  data: [number, number, number][];
  xLabels: string[];
  yLabels: string[];
  title?: string;
  minColor?: string;
  maxColor?: string;
  tooltipTemplate?: string;
}

export default function HeatmapRenderer({
  data,
  xLabels,
  yLabels,
  title,
  minColor = "#f3e8ff",
  maxColor = "#7C3AED",
  tooltipTemplate,
}: HeatmapRendererProps) {
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
      min: 0,
      max: Math.max(...data.map((d) => d[2]), 1),
      calculable: true,
      orient: "horizontal" as const,
      left: "center",
      bottom: 0,
      inRange: { color: [minColor, maxColor] },
      textStyle: { fontSize: 10 },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: { show: true, fontSize: 9 },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.3)" },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />;
}
