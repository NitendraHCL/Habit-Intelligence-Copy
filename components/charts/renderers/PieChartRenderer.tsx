"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type PieLabelRenderProps,
} from "recharts";
import { CHART_PALETTE } from "@/lib/design-tokens";
import { renderTemplate, resolveColor, safePct } from "@/lib/dashboard/render-helpers";

interface PieChartRendererProps {
  data: { name: string; value: number }[];
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  showLabel?: boolean;
  colors?: string[];
  colorOverrides?: Record<string, string>;
  tooltipTemplate?: string;
}

export default function PieChartRenderer({
  data,
  innerRadius = 0,
  outerRadius = 80,
  showLegend = true,
  showLabel = true,
  colors = CHART_PALETTE,
  colorOverrides,
  tooltipTemplate,
}: PieChartRendererProps) {
  const renderLabel = (props: PieLabelRenderProps) => {
    const name = String(props.name ?? "");
    const percent = Number(props.percent ?? 0);
    return `${name} ${(percent * 100).toFixed(0)}%`;
  };

  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);

  // Recharts Tooltip's `formatter` is a strictly-typed generic. Build the
  // callback as `unknown` so we can pass it through without per-call casts.
  const formatter = tooltipTemplate
    ? ((value: unknown, name: unknown) => [
        renderTemplate(tooltipTemplate, {
          name: String(name ?? ""),
          value: Number(value ?? 0),
          pct: safePct(Number(value ?? 0), total),
        }),
        "",
      ])
    : undefined;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          dataKey="value"
          label={showLabel ? renderLabel : undefined}
          labelLine={showLabel}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={resolveColor(d.name, colors[i % colors.length], colorOverrides)}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            fontSize: 12,
          }}
          formatter={formatter as never}
        />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            layout="horizontal"
            verticalAlign="bottom"
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
