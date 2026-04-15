"use client";

// ── Client-side bootstrap for the data source registry ──
// Fetches the current DB state via /api/admin/data-sources on mount and
// swaps the in-memory registry (see lib/config/data-sources.ts) so that
// synchronous callers inside ChartConfigurator, the preset gallery, etc.
// see the latest whitelisted tables without a page refresh.

import { useEffect } from "react";
import useSWR from "swr";
import type { DataSourceEntry } from "@/lib/dashboard/types";
import { replaceRegistry } from "@/lib/config/data-sources";

interface Row {
  id: string;
  table: string;
  label: string;
  cugColumn: string;
  columns: DataSourceEntry["columns"];
  joins: DataSourceEntry["joins"] | null;
  enabled: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DataSourceRegistryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = useSWR<{ dataSources: Row[] }>(
    "/api/admin/data-sources",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  useEffect(() => {
    if (!data?.dataSources?.length) return;
    const next: Record<string, DataSourceEntry> = {};
    for (const r of data.dataSources) {
      if (!r.enabled) continue;
      next[r.table] = {
        label: r.label,
        cugColumn: r.cugColumn,
        columns: r.columns,
        joins: r.joins ?? undefined,
      };
    }
    if (Object.keys(next).length) replaceRegistry(next);
  }, [data]);

  return <>{children}</>;
}
