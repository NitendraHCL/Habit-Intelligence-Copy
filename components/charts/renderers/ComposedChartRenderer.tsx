"use client";

import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { CHART_PALETTE } from "@/lib/design-tokens";

interface SeriesConfig {
  key: string;
  name?: string;
  type: "bar" | "line" | "area";
  color?: string;
  yAxisId?: string;
  stackId?: string;
  dashed?: boolean;
  filled?: boolean;
}

interface ComposedChartRendererProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesConfig[];
  showGrid?: boolean;
  showLegend?: boolean;
  dualAxis?: boolean;
}

export default function ComposedChartRenderer({
  data,
  xKey,
  series,
  showGrid = true,
  showLegend = true,
  dualAxis = false,
}: ComposedChartRendererProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
        {dualAxis && (
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
        )}
        <Tooltip
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            fontSize: 12,
          }}
        />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s, i) => {
          const color = s.color || CHART_PALETTE[i % CHART_PALETTE.length];
          const yId = s.yAxisId || "left";
          switch (s.type) {
            case "bar":
              return (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name || s.key}
                  fill={color}
                  yAxisId={yId}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                  stackId={s.stackId}
                />
              );
            case "line":
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name || s.key}
                  stroke={color}
                  yAxisId={yId}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "5 5" : undefined}
                  dot={{ r: 3 }}
                />
              );
            case "area":
              return (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name || s.key}
                  stroke={color}
                  fill={s.filled !== false ? color : "transparent"}
                  fillOpacity={s.filled !== false ? 0.15 : 0}
                  yAxisId={yId}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? "5 5" : undefined}
                />
              );
          }
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
