"use client";

import dynamic from "next/dynamic";
import { renderTemplate } from "@/lib/dashboard/render-helpers";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface SunburstNode {
  name: string;
  value?: number;
  children?: SunburstNode[];
  itemStyle?: { color?: string };
}

interface SunburstRendererProps {
  data: SunburstNode[];
  title?: string;
  /** Number of rings (1-3). Drives the radial level layout. */
  depth?: number;
  tooltipTemplate?: string;
  /** Reserved — colors are baked into node.itemStyle by the transform layer. */
  colorOverrides?: Record<string, string>;
}

const LEVELS_BY_DEPTH: Record<number, Record<string, unknown>[]> = {
  1: [
    {},
    {
      r0: "20%",
      r: "90%",
      label: { fontSize: 11, fontWeight: 600 },
      itemStyle: { borderWidth: 2, borderColor: "#fff" },
    },
  ],
  2: [
    {},
    {
      r0: "20%",
      r: "55%",
      label: { fontSize: 12, fontWeight: 700 },
      itemStyle: { borderWidth: 3, borderColor: "#fff" },
    },
    {
      r0: "55%",
      r: "90%",
      label: { fontSize: 10, fontWeight: 500 },
      itemStyle: { borderWidth: 2, borderColor: "#fff" },
    },
  ],
  3: [
    {},
    {
      r0: "15%",
      r: "45%",
      label: { fontSize: 12, fontWeight: 700 },
      itemStyle: { borderWidth: 3, borderColor: "#fff" },
    },
    {
      r0: "45%",
      r: "72%",
      label: { fontSize: 10, fontWeight: 500 },
      itemStyle: { borderWidth: 2, borderColor: "#fff" },
    },
    {
      r0: "72%",
      r: "92%",
      label: { fontSize: 9, position: "outside" as const },
      itemStyle: { borderWidth: 1, borderColor: "#fff" },
    },
  ],
};

export default function SunburstRenderer({
  data,
  depth = 1,
  tooltipTemplate,
}: SunburstRendererProps) {
  const clampedDepth = Math.max(1, Math.min(3, depth));
  const levels = LEVELS_BY_DEPTH[clampedDepth];

  const option = {
    tooltip: {
      trigger: "item",
      formatter: (params: { name: string; value: number; data?: { value?: number } }) => {
        const value = params.data?.value ?? params.value;
        if (tooltipTemplate) {
          return renderTemplate(tooltipTemplate, { name: params.name, value });
        }
        return `${params.name}: ${value}`;
      },
    },
    series: [
      {
        type: "sunburst",
        data,
        radius: ["15%", "92%"],
        sort: undefined,
        emphasis: { focus: "ancestor", itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" } },
        levels,
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />;
}
