/* ────────────────────────────────────────────────────────────────────
 * Data-audit provenance types.
 *
 * Each dashboard API route declares a `DashboardProvenance` map — one
 * entry per chart, keyed by the SAME key the route uses inside its
 * `charts` response object. The route only ships this block to
 * SUPER_ADMIN callers (see the route's `isSuperAdmin` gate), and the
 * <DataAuditSection> component renders it at the bottom of the page.
 *
 * Because the provenance entry lives in the same file as the SQL that
 * produces the chart, changing a query's source table naturally means
 * editing the entry sitting right next to it — the audit panel cannot
 * silently drift from reality.
 * ──────────────────────────────────────────────────────────────────── */

export interface ChartProvenance {
  /** Human-facing chart name, e.g. "Chronic Repeat Patients". */
  chart: string;
  /** Warehouse table(s) the chart reads from, fully qualified. */
  sources: string[];
  /** Plain-English extraction / aggregation rule for this chart. */
  logic: string;
  /** Optional: the key aggregation snippet, for the audit detail view. */
  sql?: string;
}

/** Keyed by the chart key used in the route's `charts` response object. */
export type DashboardProvenance = Record<string, ChartProvenance>;
