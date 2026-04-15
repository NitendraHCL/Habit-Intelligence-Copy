"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { CHART_PALETTE } from "@/lib/design-tokens";
import {
  renderTemplate,
  resolveColor,
  interpolateHex,
  safePct,
  type ColorByColumn,
  type RankPalette,
} from "@/lib/dashboard/render-helpers";

interface BarChartRendererProps {
  data: Record<string, unknown>[];
  xKey: string;
  bars: { key: string; name?: string; color?: string; stackId?: string }[];
  layout?: "horizontal" | "vertical";
  showGrid?: boolean;
  showLegend?: boolean;
  colorByIndex?: boolean;
  colorOverrides?: Record<string, string>;
  colorByColumn?: ColorByColumn;
  rankPalette?: RankPalette;
  tooltipTemplate?: string;
  basePalette?: string[];
}

export default function BarChartRenderer({
  data,
  xKey,
  bars,
  layout = "vertical",
  showGrid = true,
  showLegend = true,
  colorByIndex = false,
  colorOverrides,
  colorByColumn,
  rankPalette,
  tooltipTemplate,
  basePalette = CHART_PALETTE,
}: BarChartRendererProps) {
  // Pre-compute per-row, per-bar color when colorByColumn or rankPalette is set.
  // Shape: cellColors[barIndex][rowIndex] = hex
  const cellColors: (string | undefined)[][] = bars.map((bar, barIdx) => {
    return data.map((row, rowIdx) => {
      // colorByColumn — palette routed by a categorical column on the row
      if (colorByColumn) {
        const tag = String(row[colorByColumn.column] ?? "");
        const palette = colorByColumn.palettes[tag];
        if (palette?.length) {
          return palette[barIdx % palette.length];
        }
      }
      // rankPalette — per bar (per-row in single-series, per-stack-bar in multi)
      if (rankPalette && bars.length > 1) {
        // Per-row sort: rank each row's bar segments by value
        const valuesInRow = bars.map((b) => Number(row[b.key] ?? 0));
        const sortedIdx = [...valuesInRow.keys()].sort((a, b) => valuesInRow[b] - valuesInRow[a]);
        const rank = sortedIdx.indexOf(barIdx);
        const t = bars.length === 1 ? 0 : rank / (bars.length - 1);
        return interpolateHex(rankPalette.gradient[0], rankPalette.gradient[1], t);
      }
      if (rankPalette && bars.length === 1) {
        // Single-series: rank rows by metric value
        const values = data.map((r) => Number(r[bar.key] ?? 0));
        const sortedIdx = [...values.keys()].sort((a, b) => values[b] - values[a]);
        const rank = sortedIdx.indexOf(rowIdx);
        const t = data.length === 1 ? 0 : rank / (data.length - 1);
        return interpolateHex(rankPalette.gradient[0], rankPalette.gradient[1], t);
      }
      return undefined;
    });
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={layout === "horizontal" ? "vertical" : "horizontal"}
        margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
      >
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
        {layout === "horizontal" ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis
              dataKey={xKey}
              type="category"
              tick={{ fontSize: 11 }}
              width={100}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
          </>
        )}
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
                  const total = bars.reduce(
                    (s, b) => s + (Number(ctx.payload?.[b.key]) || 0),
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
        {bars.map((bar, i) => {
          const seriesFallback =
            bar.color || basePalette[i % basePalette.length];
          const hasCellColors = cellColors[i].some((c) => c !== undefined);
          const useOverridesByX = !!colorOverrides && colorByIndex;
          return (
            <Bar
              key={bar.key}
              dataKey={bar.key}
              name={bar.name || bar.key}
              fill={seriesFallback}
              stackId={bar.stackId}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            >
              {(hasCellColors || colorByIndex) &&
                data.map((row, idx) => {
                  const xName = String(row[xKey] ?? "");
                  const overridden = useOverridesByX
                    ? resolveColor(xName, "", colorOverrides)
                    : "";
                  const fill =
                    overridden ||
                    cellColors[i][idx] ||
                    (colorByIndex
                      ? basePalette[idx % basePalette.length]
                      : seriesFallback);
                  return <Cell key={idx} fill={fill} />;
                })}
            </Bar>
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}
