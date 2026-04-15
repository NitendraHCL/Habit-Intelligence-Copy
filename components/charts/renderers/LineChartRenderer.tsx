"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_PALETTE } from "@/lib/design-tokens";
import { renderTemplate, safePct } from "@/lib/dashboard/render-helpers";

interface LineChartRendererProps {
  data: Record<string, unknown>[];
  xKey: string;
  lines: { key: string; name?: string; color?: string; dashed?: boolean }[];
  showGrid?: boolean;
  showLegend?: boolean;
  showDots?: boolean;
  tooltipTemplate?: string;
}

export default function LineChartRenderer({
  data,
  xKey,
  lines,
  showGrid = true,
  showLegend = true,
  showDots = true,
  tooltipTemplate,
}: LineChartRendererProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            fontSize: 12,
          }}
          formatter={
            (tooltipTemplate
              ? (value: unknown, name: unknown, ctx: { payload?: Record<string, unknown> }) => {
                  const v = Number(value ?? 0);
                  const n = String(name ?? "");
                  const total = lines.reduce(
                    (s, l) => s + (Number(ctx.payload?.[l.key]) || 0),
                    0
                  );
                  return [
                    renderTemplate(tooltipTemplate, {
                      name: n,
                      value: v,
                      pct: safePct(v, total),
                      seriesName: n,
                    }),
                    "",
                  ];
                }
              : undefined) as never
          }
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {lines.map((line, i) => (
          <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            name={line.name || line.key}
            stroke={line.color || CHART_PALETTE[i % CHART_PALETTE.length]}
            strokeWidth={2}
            dot={showDots ? { r: 3 } : false}
            strokeDasharray={line.dashed ? "5 5" : undefined}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
