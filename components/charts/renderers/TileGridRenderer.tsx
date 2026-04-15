"use client";

import { renderTemplate } from "@/lib/dashboard/render-helpers";
import type { TileGridConfig } from "@/lib/dashboard/types";

interface TileGridRendererProps {
  data: Record<string, unknown>[];
  groupKey: string;
  metricKey: string;
  config?: TileGridConfig;
  /** Optional click handler (cross-filter / drill-down). */
  onTileClick?: (label: string) => void;
}

export default function TileGridRenderer({
  data,
  groupKey,
  metricKey,
  config = {},
  onTileClick,
}: TileGridRendererProps) {
  const cols = config.columns ?? 4;

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {data.map((row, i) => {
        const name = String(row[groupKey] ?? "");
        const value = Number(row[metricKey] ?? 0);
        const caption = config.captionColumn
          ? String(row[config.captionColumn] ?? "")
          : null;
        const colorKey = config.colorColumn
          ? String(row[config.colorColumn] ?? caption ?? name)
          : caption ?? name;
        const bgColor = config.colorMap?.[colorKey] ?? "#F5F6FA";
        const sublabel = config.sublabelTemplate
          ? renderTemplate(config.sublabelTemplate, { value, name, ...row })
          : `${value} cases`;

        return (
          <button
            key={i}
            type="button"
            onClick={() => onTileClick?.(name)}
            className="rounded-xl px-3 py-3 text-left transition-all hover:shadow-sm"
            style={{
              backgroundColor: bgColor,
              border: "1px solid rgba(0,0,0,0.05)",
            }}
          >
            <p className="text-[13px] font-bold text-gray-900">{name}</p>
            {caption && (
              <p className="text-[10.5px] font-medium text-gray-600 mt-0.5">
                {caption}
              </p>
            )}
            <p className="text-[11px] text-gray-700 mt-1">{sublabel}</p>
          </button>
        );
      })}
    </div>
  );
}
