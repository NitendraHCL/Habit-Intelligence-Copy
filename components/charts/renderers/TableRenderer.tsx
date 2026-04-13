"use client";

import { useState, useMemo } from "react";

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
}: TableRendererProps) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const cols: TableColumn[] = useMemo(() => {
    if (columns?.length) return columns;
    if (data.length === 0) return [];
    return Object.keys(data[0]).map((key) => ({
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
  }, [columns, data]);

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
              {cols.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 text-${col.align ?? "left"}`}
                >
                  {formatValue(row[col.key], col.format)}
                </td>
              ))}
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
