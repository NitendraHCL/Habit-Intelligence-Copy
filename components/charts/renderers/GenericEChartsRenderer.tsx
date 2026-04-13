"use client";

import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface GenericEChartsRendererProps {
  option: EChartsOption;
  height?: number;
  theme?: "light" | "dark";
  onEvents?: Record<string, (params: unknown) => void>;
}

export default function GenericEChartsRenderer({
  option,
  height = 350,
  theme = "light",
  onEvents,
}: GenericEChartsRendererProps) {
  const mergedOption: EChartsOption = {
    tooltip: { trigger: "item" },
    animation: true,
    animationDuration: 600,
    ...option,
  };

  return (
    <ReactECharts
      option={mergedOption}
      style={{ height, width: "100%" }}
      theme={theme}
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
    />
  );
}
