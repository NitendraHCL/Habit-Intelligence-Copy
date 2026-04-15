"use client";

import { useState, useMemo } from "react";
import type { CellRendererConfig } from "@/lib/dashboard/types";

interface TableColumn {
  key: string;
  label: string;
  format?: "number" | "percentage" | "currency" | "decimal";
  align?: "left" | "center" | "right";
}

interface TableRendererProps {
  data: Record<string, unknown>[];
  columns?: TableColumn[];
  pageSize?: number;
  sortable?: boolean;
  striped?: boolean;
  /** G6: per-column cell renderer config (badge/progress_bar/pill/threshold_pill). */
  columnConfig?: Record<string, CellRendererConfig>;
}

function thresholdColor(
  value: number,
  thresholds: { from?: number; to?: number; color: string }[] | undefined,
  fallback: string
): string {
  if (!thresholds?.length) return fallback;
  for (const t of thresholds) {
    const okMin = t.from === undefined || value >= t.from;
    const okMax = t.to === undefined || value < t.to;
    if (okMin && okMax) return t.color;
  }
  return fallback;
}

function formatNumberDisplay(value: number, format?: string): string {
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "inr-lakhs":
      return `${(value / 100_000).toFixed(2)}L`;
    case "inr-crores":
      return `${(value / 10_000_000).toFixed(2)}Cr`;
    default:
      return value.toLocaleString("en-IN");
  }
}

function CustomCell({
  value,
  config,
  rowMax,
}: {
  value: unknown;
  config: CellRendererConfig;
  rowMax: number;
}) {
  const num = Number(value ?? 0);
  switch (config.renderer) {
    case "badge": {
      const color = (config.colorMap?.[String(value ?? "")]) ?? "#E0E7FF";
      return (
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px] font-semibold border"
          style={{
            backgroundColor: color + "22",
            color,
            borderColor: color + "55",
          }}
        >
          {String(value ?? "—")}
        </span>
      );
    }
    case "pill": {
      const color = config.colorMap?.[String(value ?? "")] ?? "#4f46e5";
      return (
        <span
          className="inline-flex items-center justify-center min-w-[36px] h-[26px] px-2 rounded-full text-[12px] font-bold"
          style={{ backgroundColor: color + "22", color }}
        >
          {typeof value === "number" ? formatNumberDisplay(num, config.format) : String(value ?? "—")}
        </span>
      );
    }
    case "threshold_pill": {
      const fallback = "#6B7280";
      const color = thresholdColor(num, config.thresholds, fallback);
      return (
        <span
          className="inline-flex items-center justify-center min-w-[36px] h-[26px] px-2 rounded-full text-[12px] font-bold"
          style={{ backgroundColor: color + "22", color }}
        >
          {formatNumberDisplay(num, config.format)}
        </span>
      );
    }
    case "progress_bar": {
      const max = config.max ?? rowMax;
      const pct = max > 0 ? Math.min(100, (num / max) * 100) : 0;
      const color = thresholdColor(num, config.thresholds, "#4f46e5");
      return (
        <div className="flex items-center gap-2 px-1">
          <div
            className="flex-1 h-[7px] rounded-full overflow-hidden"
            style={{ backgroundColor: color + "22" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
          <span
            className="text-[12px] font-bold w-12 text-right"
            style={{ color }}
          >
            {formatNumberDisplay(num, config.format)}
          </span>
        </div>
      );
    }
    case "text":
    default:
      return <span>{value == null ? "—" : String(value)}</span>;
  }
}

function formatValue(
  value: unknown,
  format?: string
): string {
  if (value == null) return "—";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  switch (format) {
    case "percentage":
      return `${num.toFixed(1)}%`;
    case "currency":
      return `₹${num.toLocaleString("en-IN")}`;
    case "decimal":
      return num.toFixed(2);
    case "number":
      return num.toLocaleString("en-IN");
    default:
      return String(value);
  }
}

export default function TableRenderer({
  data,
  columns,
  pageSize = 10,
  sortable = true,
  striped = true,
  columnConfig,
}: TableRendererProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const cols: TableColumn[] = useMemo(() => {
    if (columns?.length) return columns;
    if (data.length === 0) return [];
    return Object.keys(data[0]).map((key) => ({
      key,
      label:
        columnConfig?.[key]?.label ??
        key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }, [columns, data, columnConfig]);

  // Pre-compute per-column max for progress_bar renderer.
  const colMax = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of cols) {
      out[c.key] = data.reduce((m, r) => Math.max(m, Number(r[c.key] ?? 0)), 0);
    }
    return out;
  }, [cols, data]);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = Number(av);
      const bn = Number(bv);
      if (!isNaN(an) && !isNaN(bn)) {
        return sortDir === "asc" ? an - bn : bn - an;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key: string) {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (cols.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No data
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            {cols.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium text-gray-600 text-${col.align ?? "left"} ${sortable ? "cursor-pointer hover:text-gray-900 select-none" : ""}`}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-xs">
                    {sortDir === "asc" ? "▲" : "▼"}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-gray-100 ${striped && i % 2 === 1 ? "bg-gray-50/50" : ""}`}
            >
              {cols.map((col) => {
                const cfg = columnConfig?.[col.key];
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 text-${col.align ?? "left"}`}
                  >
                    {cfg ? (
                      <CustomCell
                        value={row[col.key]}
                        config={cfg}
                        rowMax={colMax[col.key] ?? 0}
                      />
                    ) : (
                      formatValue(row[col.key], col.format)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)}{" "}
            of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
