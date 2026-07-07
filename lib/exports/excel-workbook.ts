/**
 * Shared styled-Excel engine for portal page exporters.
 *
 * Provides a small, reusable set of helpers so every page's "Export to Excel"
 * produces a consistently styled workbook: accent title bars, coloured header
 * rows, frozen panes, borders, zebra striping, number formats, traffic-light
 * heat cells and optional colour-scale heatmaps.
 *
 * Import this from a per-page `*-excel.ts` module that maps that page's raw
 * API data into sheet specs. Keep exceljs behind a dynamic import at the call
 * site so it stays out of the main bundle.
 */
import ExcelJS from "exceljs";

// ── palette ────────────────────────────────────────────────────────────────
export const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
export const INK = argb("#1f2937");
export const WHITE = argb("#ffffff");
export const MUTED = argb("#6b7280");
const GRID = argb("#d1d5db");
const ZEBRA = argb("#f6f7fb");
const TOTAL_BG = argb("#eef0f5");
const thin = { style: "thin" as const, color: { argb: GRID } };
export const border = { top: thin, left: thin, bottom: thin, right: thin };

const HEAT = {
  good: { bg: argb("#dcfce7"), fg: argb("#166534") },
  warn: { bg: argb("#fef9c3"), fg: argb("#854d0e") },
  bad: { bg: argb("#fee2e2"), fg: argb("#991b1b") },
};
function heatOf(v: number) {
  if (v >= 90) return HEAT.good;
  if (v >= 70) return HEAT.warn;
  return HEAT.bad;
}

// ── column model ────────────────────────────────────────────────────────────
export type ColType = "text" | "int" | "dec" | "pct" | "pct1";
export type Col = {
  key: string;
  label: string;
  type?: ColType;
  width?: number;
  /** traffic-light fill by numeric value (green ≥90 / amber ≥70 / red below) */
  heat?: boolean;
  /** per-row number format override (e.g. KPI sheets that mix int & %) */
  cellType?: (row: Record<string, unknown>) => ColType;
};

export const numFmt: Record<ColType, string | undefined> = {
  text: undefined,
  int: "#,##0",
  dec: "#,##0.0",
  pct: '0"%"',
  pct1: '0.0"%"',
};

export function createWorkbook(creator = "Habit Intelligence"): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  return wb;
}

// ── generic styled table sheet ──────────────────────────────────────────────
export function addTableSheet(
  wb: ExcelJS.Workbook,
  opts: {
    name: string;
    accent: string;
    title: string;
    subtitle?: string;
    columns: Col[];
    rows: Record<string, unknown>[];
    totalRow?: Record<string, unknown>;
    freezeFirstCol?: boolean;
  },
): ExcelJS.Worksheet {
  const { name, accent, title, columns, rows } = opts;
  const accentArgb = argb(accent);
  // Excel sheet names: ≤31 chars, no []:*?/\ — sanitise.
  const safeName = name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim() || "Sheet";
  const ws = wb.addWorksheet(safeName);
  const nCols = columns.length;

  ws.mergeCells(1, 1, 1, nCols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: WHITE } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentArgb } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, nCols);
  const s = ws.getCell(2, 1);
  s.value = opts.subtitle ?? `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  s.font = { italic: true, size: 10, color: { argb: MUTED } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 16;

  const HEADER = 3;
  const headerRow = ws.getRow(HEADER);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentArgb } };
    cell.alignment = { vertical: "middle", horizontal: c.type && c.type !== "text" ? "right" : "left", wrapText: true };
    cell.border = border;
  });
  headerRow.height = 22;

  rows.forEach((r, ri) => {
    const row = ws.getRow(HEADER + 1 + ri);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = r[c.key];
      const type: ColType | undefined = c.cellType ? c.cellType(r) : c.type;
      cell.value = (v === undefined || v === null ? (type && type !== "text" ? 0 : "") : v) as ExcelJS.CellValue;
      if (type && numFmt[type]) cell.numFmt = numFmt[type]!;
      cell.alignment = { horizontal: type && type !== "text" ? "right" : "left" };
      cell.border = border;
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      if (c.heat && typeof v === "number") {
        const h = heatOf(v);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: h.bg } };
        cell.font = { color: { argb: h.fg }, bold: true };
      }
    });
  });

  if (opts.totalRow) {
    const row = ws.getRow(HEADER + 1 + rows.length);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = opts.totalRow![c.key];
      const type: ColType | undefined = c.cellType ? c.cellType(opts.totalRow!) : c.type;
      cell.value = (v === undefined || v === null ? "" : v) as ExcelJS.CellValue;
      if (type && numFmt[type] && typeof v === "number") cell.numFmt = numFmt[type]!;
      cell.font = { bold: true, color: { argb: INK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      cell.alignment = { horizontal: type && type !== "text" ? "right" : "left" };
      cell.border = { ...border, top: { style: "medium", color: { argb: argb("#9ca3af") } } };
    });
  }

  columns.forEach((c, i) => {
    let w = c.width;
    if (!w) {
      const dataMax = Math.max(c.label.length, ...rows.map((r) => String(r[c.key] ?? "").length));
      w = Math.min(42, Math.max(11, dataMax + 3));
    }
    ws.getColumn(i + 1).width = w;
  });

  ws.views = [{ state: "frozen", xSplit: opts.freezeFirstCol ? 1 : 0, ySplit: HEADER }];
  return ws;
}

/** Apply a white→accent colour scale over a rectangular data range (heatmaps). */
export function addColorScale(ws: ExcelJS.Worksheet, ref: string, lo = "#fffbeb", mid = "#fcd34d", hi = "#b45309") {
  ws.addConditionalFormatting({
    ref,
    rules: [
      {
        type: "colorScale",
        priority: 1,
        cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
        color: [{ argb: argb(lo) }, { argb: argb(mid) }, { argb: argb(hi) }],
      } as ExcelJS.ConditionalFormattingRule,
    ],
  });
}

/** Build an "Overview" sheet from export context + optional KPI rows. */
export function addOverviewSheet(
  wb: ExcelJS.Workbook,
  opts: {
    title: string;
    accent?: string;
    meta: { clientName?: string; cugCode?: string; dateFrom?: string; dateTo?: string; generatedAt: string; filters?: Record<string, string[]> };
  },
) {
  const filterLines = Object.entries(opts.meta.filters ?? {})
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => ({ metric: `  • ${k.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase())}`, value: (v as string[]).join(", ") }));
  const rows: Record<string, unknown>[] = [
    { metric: "Client", value: opts.meta.clientName ? `${opts.meta.clientName}${opts.meta.cugCode ? ` (${opts.meta.cugCode})` : ""}` : (opts.meta.cugCode ?? "—") },
    { metric: "Date range", value: opts.meta.dateFrom && opts.meta.dateTo ? `${opts.meta.dateFrom} → ${opts.meta.dateTo}` : "All available" },
    { metric: "Generated", value: opts.meta.generatedAt },
    { metric: "Active filters", value: filterLines.length ? "" : "None" },
    ...filterLines,
  ];
  return addTableSheet(wb, {
    name: "Overview",
    accent: opts.accent ?? "#4f46e5",
    title: opts.title,
    subtitle: "Every figure below reflects the filters applied on the page at export time.",
    columns: [
      { key: "metric", label: "Field", type: "text", width: 24 },
      { key: "value", label: "Value", type: "text", width: 60 },
    ],
    rows,
  });
}

/** Serialise + trigger a browser download. */
export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^\w.\-]+/g, "_");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type ExportMeta = {
  clientName?: string;
  cugCode?: string;
  dateFrom?: string;
  dateTo?: string;
  generatedAt: string;
  filters?: Record<string, string[]>;
};
