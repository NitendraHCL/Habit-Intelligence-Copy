"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChartDefinition } from "@/lib/dashboard/types";

interface DataPreviewProps {
  chart: Partial<ChartDefinition>;
  clientId: string;
  /** Called when user clicks a value to add it as a color override / etc. */
  onPickValue?: (label: string) => void;
}

/**
 * Compact data-sample table inside the configurator. Refetches a 10-row sample
 * on dataSource/transform change. Click a categorical value to bubble it to
 * the Color Overrides editor (or wherever onPickValue routes it).
 */
export default function DataPreview({ chart, clientId, onPickValue }: DataPreviewProps) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = !!clientId && !!chart.dataSource?.table;

  const queryKey = useMemo(
    () => JSON.stringify({ ds: chart.dataSource, tf: chart.transform }),
    [chart.dataSource, chart.transform]
  );

  useEffect(() => {
    if (!ready || !chart.dataSource) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/data/query?clientId=${clientId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataSource: chart.dataSource,
            transform: { ...(chart.transform ?? {}), limit: 10 },
          }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `Query failed (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) setRows(json.data ?? []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Query failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey stringifies dataSource+transform; raw objects change identity each render
  }, [queryKey, clientId, ready]);

  if (!ready) {
    return (
      <p className="text-[11px] text-gray-400">
        Pick a data source and Group By to see a sample.
      </p>
    );
  }

  if (loading && !rows) {
    return (
      <p className="text-[11px] text-gray-400">Loading sample…</p>
    );
  }

  if (err) {
    return (
      <p className="text-[11px] text-red-500">{err}</p>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <p className="text-[11px] text-gray-400">No rows returned.</p>
    );
  }

  const cols = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto rounded border border-gray-200">
      <table className="w-full text-[11px]">
        <thead className="bg-gray-50">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="text-left px-2 py-1.5 font-semibold text-gray-700 border-b border-gray-200"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-b-0">
              {cols.map((c) => {
                const raw = row[c];
                const display =
                  raw === null || raw === undefined ? "—" : String(raw);
                const isCategorical =
                  typeof raw === "string" && raw.length > 0 && raw.length < 40;
                return (
                  <td key={c} className="px-2 py-1 text-gray-800">
                    {isCategorical && onPickValue ? (
                      <button
                        type="button"
                        onClick={() => onPickValue(display)}
                        className="hover:bg-indigo-50 hover:text-indigo-700 px-1 rounded"
                        title="Click to add as a color override"
                      >
                        {display}
                      </button>
                    ) : (
                      display
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
