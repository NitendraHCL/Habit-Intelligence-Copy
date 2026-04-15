"use client";

import { useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  Cell,
} from "recharts";
import { CHART_PALETTE } from "@/lib/design-tokens";
import type {
  BackgroundOverlay,
  ColorByValueRange,
  ValueSlider,
} from "@/lib/dashboard/types";

interface BubbleChartRendererProps {
  datasets: {
    name: string;
    data: Record<string, unknown>[];
    color?: string;
  }[];
  xKey: string;
  yKey: string;
  zKey: string;
  xLabel?: string;
  yLabel?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  background?: BackgroundOverlay;
  colorByValueRange?: ColorByValueRange;
  valueSlider?: ValueSlider;
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
    const aboveMin = b.from === undefined || v >= b.from;
    const belowMax = b.to === undefined || v < b.to;
    if (aboveMin && belowMax) return b.color;
  }
  return fallback;
}

export default function BubbleChartRenderer({
  datasets,
  xKey,
  yKey,
  zKey,
  xLabel,
  yLabel,
  showGrid = true,
  showLegend = true,
  background,
  colorByValueRange,
  valueSlider,
}: BubbleChartRendererProps) {
  const allRows = useMemo(() => datasets.flatMap((d) => d.data), [datasets]);
  const zMin = useMemo(() => allRows.reduce((m, r) => Math.min(m, Number(r[zKey] ?? 0)), Infinity), [allRows, zKey]);
  const zMax = useMemo(() => allRows.reduce((m, r) => Math.max(m, Number(r[zKey] ?? 0)), -Infinity), [allRows, zKey]);
  const sliderEnabled = valueSlider?.enabled === true;
  const sliderMin = valueSlider?.min ?? (isFinite(zMin) ? zMin : 0);
  const sliderMax = valueSlider?.max ?? (isFinite(zMax) ? zMax : 0);
  const [range, setRange] = useState<[number, number]>([sliderMin, sliderMax]);

  const filteredDatasets = sliderEnabled
    ? datasets.map((ds) => ({
        ...ds,
        data: ds.data.filter((row) => {
          const v = Number(row[zKey] ?? 0);
          return v >= range[0] && v <= range[1];
        }),
      }))
    : datasets;

  return (
    <div className="flex flex-col h-full">
      {sliderEnabled && (
        <div className="flex items-center gap-3 px-2 py-1.5 mb-2 bg-gray-50 rounded">
          <span className="text-[10.5px] font-medium text-gray-600 whitespace-nowrap">
            Value range:
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
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />}
            <XAxis
              dataKey={xKey}
              type="number"
              name={xLabel || xKey}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              dataKey={yKey}
              type="number"
              name={yLabel || yKey}
              tick={{ fontSize: 11 }}
            />
            <ZAxis dataKey={zKey} range={[40, 400]} />
            {/* Background overlay: faint horizontal bars per row using ReferenceArea */}
            {background?.type === "horizontal_bar" &&
              allRows.map((row, idx) => {
                const w = Number(row[background.column] ?? 0);
                if (!w) return null;
                const yVal = Number(row[yKey] ?? 0);
                return (
                  <ReferenceArea
                    key={`bg-${idx}`}
                    x1={0}
                    x2={w}
                    y1={yVal - 0.4}
                    y2={yVal + 0.4}
                    fill={background.color ?? "#E0E7FF"}
                    fillOpacity={background.opacity ?? 0.35}
                    stroke="none"
                  />
                );
              })}
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                fontSize: 12,
              }}
              cursor={{ strokeDasharray: "3 3" }}
            />
            {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {filteredDatasets.map((ds, i) => {
              const seriesColor = ds.color || CHART_PALETTE[i % CHART_PALETTE.length];
              return (
                <Scatter
                  key={ds.name}
                  name={ds.name}
                  data={ds.data}
                  fill={seriesColor}
                  opacity={0.7}
                >
                  {colorByValueRange &&
                    ds.data.map((row, idx) => {
                      const v = Number(row[zKey] ?? 0);
                      const total = ds.data.reduce(
                        (s, r) => s + Number(r[zKey] ?? 0),
                        0
                      );
                      return (
                        <Cell
                          key={idx}
                          fill={bucketColor(v, total, colorByValueRange, seriesColor)}
                        />
                      );
                    })}
                </Scatter>
              );
            })}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
