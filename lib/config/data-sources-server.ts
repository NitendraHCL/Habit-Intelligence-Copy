// ── Server-only Prisma loader for the data source registry ──
// Reads the DataSourceRegistry rows from the app's Postgres and pushes them
// into the in-memory registry exposed by lib/config/data-sources.ts.
//
// Import this file ONLY from server code (route handlers, server components).

import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { DataSourceEntry } from "@/lib/dashboard/types";
import { replaceRegistry } from "./data-sources";

let lastLoadAt = 0;
const TTL_MS = 30_000;
let inflight: Promise<void> | null = null;

/** Refresh the in-memory registry from the DB. Memoized — safe to call on
 * every request; only hits Postgres once per TTL. Pass force=true after an
 * admin mutation. */
export async function refreshRegistryFromDB(force = false): Promise<void> {
  if (!force && Date.now() - lastLoadAt < TTL_MS) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const rows = await prisma.dataSourceRegistry.findMany({
        where: { enabled: true },
      });
      if (rows.length === 0) {
        // DB empty — keep existing in-memory defaults.
        return;
      }
      const next: Record<string, DataSourceEntry> = {};
      for (const r of rows) {
        next[r.table] = {
          label: r.label,
          cugColumn: r.cugColumn,
          columns: r.columns as unknown as DataSourceEntry["columns"],
          joins: (r.joins ?? undefined) as unknown as DataSourceEntry["joins"],
        };
      }
      replaceRegistry(next);
      lastLoadAt = Date.now();
    } catch (e) {
      console.error("[data-source-registry] DB refresh failed:", e);
      // keep existing in-memory state
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
