/**
 * Excel exporter for the OHC Utilization page.
 *
 * Builds a single, styled .xlsx workbook with one sheet per data cut on the
 * page, straight from the raw API numbers (not the on-screen formatted
 * strings) so the values stay pivot-friendly. Uses exceljs for cell styling
 * (header fills, borders, frozen panes, number formats, colour coding).
 *
 * This module is meant to be dynamically imported on click so exceljs stays
 * out of the main bundle.
 */
import ExcelJS from "exceljs";

// ── palette ──────────────────────────────────────────────────────────────
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const INK = argb("#1f2937");
const WHITE = argb("#ffffff");
const GRID = argb("#d1d5db");
const ZEBRA = argb("#f6f7fb");
const TOTAL_BG = argb("#eef0f5");
const thin = { style: "thin" as const, color: { argb: GRID } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

// good/warn/bad tints for % heat cells
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

type ColType = "text" | "int" | "dec" | "pct" | "pct1";
type Col = { key: string; label: string; type?: ColType; width?: number; heat?: boolean };

const numFmt: Record<ColType, string | undefined> = {
  text: undefined,
  int: "#,##0",
  dec: "#,##0.0",
  pct: '0"%"',
  pct1: '0.0"%"',
};

// ── generic styled table sheet ─────────────────────────────────────────────
function addTableSheet(
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
) {
  const { name, accent, title, columns, rows } = opts;
  const accentArgb = argb(accent);
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [] });
  const nCols = columns.length;

  // Row 1 — title bar
  ws.mergeCells(1, 1, 1, nCols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: WHITE } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentArgb } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 26;

  // Row 2 — subtitle
  ws.mergeCells(2, 1, 2, nCols);
  const s = ws.getCell(2, 1);
  s.value = opts.subtitle ?? `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  s.font = { italic: true, size: 10, color: { argb: argb("#6b7280") } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 16;

  // Row 3 — header
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

  // data rows
  rows.forEach((r, ri) => {
    const row = ws.getRow(HEADER + 1 + ri);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = r[c.key];
      cell.value = (v === undefined || v === null ? (c.type && c.type !== "text" ? 0 : "") : v) as ExcelJS.CellValue;
      if (c.type && numFmt[c.type]) cell.numFmt = numFmt[c.type]!;
      cell.alignment = { horizontal: c.type && c.type !== "text" ? "right" : "left" };
      cell.border = border;
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      if (c.heat && typeof v === "number") {
        const h = heatOf(v);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: h.bg } };
        cell.font = { color: { argb: h.fg }, bold: true };
      }
    });
  });

  // total row
  if (opts.totalRow) {
    const row = ws.getRow(HEADER + 1 + rows.length);
    columns.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const v = opts.totalRow![c.key];
      cell.value = (v === undefined || v === null ? "" : v) as ExcelJS.CellValue;
      if (c.type && numFmt[c.type] && typeof v === "number") cell.numFmt = numFmt[c.type]!;
      cell.font = { bold: true, color: { argb: INK } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_BG } };
      cell.alignment = { horizontal: c.type && c.type !== "text" ? "right" : "left" };
      cell.border = { ...border, top: { style: "medium", color: { argb: argb("#9ca3af") } } };
    });
  }

  // column widths
  columns.forEach((c, i) => {
    let w = c.width;
    if (!w) {
      const dataMax = Math.max(
        c.label.length,
        ...rows.map((r) => String(r[c.key] ?? "").length),
      );
      w = Math.min(42, Math.max(11, dataMax + 3));
    }
    ws.getColumn(i + 1).width = w;
  });

  ws.views = [{ state: "frozen", xSplit: opts.freezeFirstCol ? 1 : 0, ySplit: HEADER }];
  return ws;
}

// ── main export ─────────────────────────────────────────────────────────
export type UtilizationExportInput = {
  charts: any;
  kpis: any;
  meta: {
    clientName?: string;
    cugCode?: string;
    dateFrom?: string;
    dateTo?: string;
    generatedAt: string;
    filters: Record<string, string[]>;
  };
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_NAMES = ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"];
const genderName = (g: string) => (g === "M" ? "Male" : g === "F" ? "Female" : "Others");
const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export async function exportUtilizationWorkbook({ charts, kpis, meta }: UtilizationExportInput) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Habit Intelligence";
  wb.created = new Date(meta.generatedAt);

  // ── Overview ──────────────────────────────────────────────────────────
  const filterLines = Object.entries(meta.filters)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => ({ metric: k.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase()), value: (v as string[]).join(", ") }));

  const overviewRows: Record<string, unknown>[] = [
    { metric: "Client", value: meta.clientName ? `${meta.clientName}${meta.cugCode ? ` (${meta.cugCode})` : ""}` : (meta.cugCode ?? "—") },
    { metric: "Date range", value: meta.dateFrom && meta.dateTo ? `${meta.dateFrom} → ${meta.dateTo}` : "All available" },
    { metric: "Generated", value: meta.generatedAt },
    { metric: "Active filters", value: filterLines.length ? "" : "None" },
    ...filterLines.map((f) => ({ metric: `  • ${f.metric}`, value: f.value })),
  ];
  addTableSheet(wb, {
    name: "Overview",
    accent: "#4f46e5",
    title: "OHC Utilization — Data Export",
    subtitle: "Every figure below reflects the filters applied on the page at export time.",
    columns: [
      { key: "metric", label: "Field", type: "text", width: 22 },
      { key: "value", label: "Value", type: "text", width: 60 },
    ],
    rows: overviewRows,
  });

  // KPI summary — its own sheet (mixed value formats, so a dedicated renderer)
  if (kpis) {
    addKpiSheet(wb, [
      { metric: "Total Footfall", value: Number(kpis.totalBooked || 0), type: "int" },
      { metric: "Cancelled", value: Number(kpis.cancelled || 0), type: "int" },
      { metric: "Total Consults", value: Number(kpis.totalConsults || 0), type: "int" },
      { metric: "Unique Patients", value: Number(kpis.uniquePatients || 0), type: "int" },
      { metric: "Repeat Patients", value: Number(kpis.repeatPatients || 0), type: "int" },
      { metric: "Repeat Rate", value: Number(kpis.repeatRate || 0), type: "pct1" },
      { metric: "Locations", value: Number(kpis.locationCount || 0), type: "int" },
    ], kpis);
  }

  // ── Provider Visit Trend ──────────────────────────────────────────────
  const vt: any[] = charts?.visitTrends ?? [];
  if (vt.length) {
    const total = vt.reduce(
      (s, r) => ({
        completed: s.completed + Number(r.completed || 0),
        cancelled: s.cancelled + Number(r.cancelled || 0),
        noShow: s.noShow + Number(r.noShow || 0),
        uniquePatients: s.uniquePatients + Number(r.uniquePatients || 0),
      }),
      { completed: 0, cancelled: 0, noShow: 0, uniquePatients: 0 },
    );
    addTableSheet(wb, {
      name: "Provider Visit Trend",
      accent: "#4f46e5",
      title: "Provider Visit Trend",
      subtitle: "Consults per period by stage (excludes Care Coordinator).",
      columns: [
        { key: "period", label: "Period", type: "text" },
        { key: "completed", label: "Completed", type: "int" },
        { key: "cancelled", label: "Cancelled", type: "int" },
        { key: "noShow", label: "No-Show", type: "int" },
        { key: "uniquePatients", label: "Unique Patients", type: "int" },
      ],
      rows: vt.map((r) => ({
        period: r.period,
        completed: Number(r.completed || 0),
        cancelled: Number(r.cancelled || 0),
        noShow: Number(r.noShow || 0),
        uniquePatients: Number(r.uniquePatients || 0),
      })),
      totalRow: { period: "Total", ...total },
    });
  }

  // ── Visits by Specialty ───────────────────────────────────────────────
  const spec: any[] = charts?.specialtyTreemap ?? [];
  if (spec.length) {
    const totalConsults = spec.reduce((s, r) => s + Number(r.value || 0), 0);
    addTableSheet(wb, {
      name: "Visits by Specialty",
      accent: "#0d9488",
      title: "Visits by Specialty",
      subtitle: "Consult volume and unique patients per specialty.",
      columns: [
        { key: "specialty", label: "Specialty", type: "text", width: 26 },
        { key: "consults", label: "Consults", type: "int" },
        { key: "uniquePatients", label: "Unique Patients", type: "int" },
        { key: "share", label: "Share of Consults", type: "pct1" },
      ],
      rows: spec.map((r) => ({
        specialty: r.name,
        consults: Number(r.value || 0),
        uniquePatients: Number(r.uniquePatients || 0),
        share: pctOf(Number(r.value || 0), totalConsults),
      })),
      totalRow: {
        specialty: "Total",
        consults: totalConsults,
        uniquePatients: spec.reduce((s, r) => s + Number(r.uniquePatients || 0), 0),
        share: 100,
      },
    });
  }

  // ── Clinic Utilization (location × specialty crosstab) ────────────────
  const locFull: any[] = charts?.locationBySpecialtyFull ?? [];
  const allSpecs: string[] = charts?.allSpecialties ?? [];
  if (locFull.length && allSpecs.length) {
    const columns: Col[] = [
      { key: "location", label: "Location", type: "text", width: 24 },
      { key: "uniquePatients", label: "Unique Patients", type: "int" },
      ...allSpecs.map((sp) => ({ key: `sp__${sp}`, label: sp, type: "int" as ColType })),
      { key: "rowTotal", label: "Total Consults", type: "int" },
    ];
    const rows = locFull.map((r) => {
      const out: Record<string, unknown> = { location: r.location, uniquePatients: Number(r.uniquePatients || 0) };
      let rowTotal = 0;
      for (const sp of allSpecs) {
        const val = Number(r[sp] || 0);
        out[`sp__${sp}`] = val;
        rowTotal += val;
      }
      out.rowTotal = rowTotal;
      return out;
    });
    const totalRow: Record<string, unknown> = { location: "Total", uniquePatients: rows.reduce((s, r) => s + Number(r.uniquePatients || 0), 0) };
    let grand = 0;
    for (const sp of allSpecs) {
      const colSum = rows.reduce((s, r) => s + Number(r[`sp__${sp}`] || 0), 0);
      totalRow[`sp__${sp}`] = colSum;
      grand += colSum;
    }
    totalRow.rowTotal = grand;
    addTableSheet(wb, {
      name: "Clinic Utilization",
      accent: "#6366f1",
      title: "Clinic Utilization by Location & Specialty",
      subtitle: "Consults per location broken out by specialty.",
      columns,
      rows,
      totalRow,
      freezeFirstCol: true,
    });
  }

  // ── Capacity vs Booked vs Completed ───────────────────────────────────
  const cap: any[] = charts?.capacityBookedCompleted ?? [];
  if (cap.length) {
    const rows = cap.map((r) => {
      const capacity = Number(r.capacity || 0);
      const booked = Number(r.booked || 0);
      const completed = Number(r.completed || 0);
      return { specialty: r.specialty, capacity, booked, completed, util: pctOf(booked, capacity), show: pctOf(completed, booked) };
    });
    const tc = rows.reduce((s, r) => s + r.capacity, 0);
    const tb = rows.reduce((s, r) => s + r.booked, 0);
    const tp = rows.reduce((s, r) => s + r.completed, 0);
    addTableSheet(wb, {
      name: "Capacity Booked Completed",
      accent: "#6366f1",
      title: "Capacity vs Booked vs Completed",
      subtitle: "By specialty (all months in range). Utilisation = Booked ÷ Capacity; Show Rate = Completed ÷ Booked.",
      columns: [
        { key: "specialty", label: "Specialty", type: "text", width: 26 },
        { key: "capacity", label: "Capacity", type: "dec" },
        { key: "booked", label: "Booked", type: "int" },
        { key: "completed", label: "Completed", type: "int" },
        { key: "util", label: "Utilisation", type: "pct1", heat: true },
        { key: "show", label: "Show Rate", type: "pct1", heat: true },
      ],
      rows,
      totalRow: { specialty: "Total", capacity: tc, booked: tb, completed: tp, util: pctOf(tb, tc), show: pctOf(tp, tb) },
    });
  }

  // ── Demographics (age group × gender) ─────────────────────────────────
  const sun: any[] = charts?.demographicSunburst ?? [];
  if (sun.length) {
    const rows = sun.map((ag) => {
      const kids: Record<string, number> = {};
      for (const ch of ag.children || []) kids[ch.name] = Number(ch.value || 0);
      const male = kids.M || 0, female = kids.F || 0, others = kids.O || 0;
      return { ageGroup: ag.name, male, female, others, total: male + female + others };
    });
    const t = rows.reduce((s, r) => ({ male: s.male + r.male, female: s.female + r.female, others: s.others + r.others, total: s.total + r.total }), { male: 0, female: 0, others: 0, total: 0 });
    const hasOthers = t.others > 0;
    addTableSheet(wb, {
      name: "Demographics",
      accent: "#a855f7",
      title: "Demographic Consult Breakdown",
      subtitle: "Consults by age group and gender.",
      columns: [
        { key: "ageGroup", label: "Age Group", type: "text" },
        { key: "male", label: "Male", type: "int" },
        { key: "female", label: "Female", type: "int" },
        ...(hasOthers ? [{ key: "others", label: "Others", type: "int" as ColType }] : []),
        { key: "total", label: "Total", type: "int" },
      ],
      rows,
      totalRow: { ageGroup: "Total", ...t },
    });
  }

  // ── Consult Distribution (bubble) ─────────────────────────────────────
  const bubble: Record<string, any[]> = charts?.bubbleBySpecialty ?? {};
  const bubbleSpecs: string[] = charts?.bubbleSpecialties ?? Object.keys(bubble);
  const bubbleRows: Record<string, unknown>[] = [];
  for (const sp of bubbleSpecs) {
    for (const cell of bubble[sp] || []) {
      bubbleRows.push({
        specialty: sp,
        location: cell.location,
        ageGroup: cell.ageGroup,
        total: Number(cell.total || 0),
        male: Number(cell.male || 0),
        female: Number(cell.female || 0),
        malePct: Number(cell.malePercent || 0),
      });
    }
  }
  if (bubbleRows.length) {
    addTableSheet(wb, {
      name: "Consult Distribution",
      accent: "#0ea5e9",
      title: "Consult Distribution by Specialty & Location",
      subtitle: "One row per specialty × location × age group.",
      columns: [
        { key: "specialty", label: "Specialty", type: "text", width: 24 },
        { key: "location", label: "Location", type: "text", width: 22 },
        { key: "ageGroup", label: "Age Group", type: "text" },
        { key: "total", label: "Total", type: "int" },
        { key: "male", label: "Male", type: "int" },
        { key: "female", label: "Female", type: "int" },
        { key: "malePct", label: "Male %", type: "pct" },
      ],
      rows: bubbleRows,
    });
  }

  // ── Peak Hours (weekday × hour heatmap) ───────────────────────────────
  const peak: [number, number, number][] = charts?.peakHours?.data ?? [];
  if (peak.length) {
    const grid: number[][] = DAY_NAMES.map(() => HOUR_NAMES.map(() => 0));
    for (const [hourIdx, dayIdx, count] of peak) {
      if (grid[dayIdx] && hourIdx >= 0 && hourIdx < HOUR_NAMES.length) grid[dayIdx][hourIdx] = Number(count || 0);
    }
    const columns: Col[] = [
      { key: "day", label: "Weekday", type: "text", width: 12 },
      ...HOUR_NAMES.map((h) => ({ key: `h__${h}`, label: h, type: "int" as ColType, width: 8 })),
    ];
    const rows = DAY_NAMES.map((d, di) => {
      const out: Record<string, unknown> = { day: d };
      HOUR_NAMES.forEach((h, hi) => (out[`h__${h}`] = grid[di][hi]));
      return out;
    });
    const ws = addTableSheet(wb, {
      name: "Peak Hours",
      accent: "#f59e0b",
      title: "Peak Hours — Volume by Weekday & Hour",
      subtitle: "Consults per weekday × hour of day. Darker = busier.",
      columns,
      rows,
      freezeFirstCol: true,
    });
    // colour scale across the count cells (first data row = 4, first count col = 2)
    const firstRow = 4;
    const lastRow = firstRow + DAY_NAMES.length - 1;
    const lastCol = ws.getColumn(HOUR_NAMES.length + 1).letter;
    ws.addConditionalFormatting({
      ref: `B${firstRow}:${lastCol}${lastRow}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
          color: [{ argb: argb("#fffbeb") }, { argb: argb("#fcd34d") }, { argb: argb("#b45309") }],
        } as ExcelJS.ConditionalFormattingRule,
      ],
    });
  }

  // ── Service Categories ────────────────────────────────────────────────
  const svc: any[] = charts?.serviceCategories ?? [];
  if (svc.length) {
    addTableSheet(wb, {
      name: "Service Categories",
      accent: "#ec4899",
      title: "Service Categories — Booked vs Completed",
      subtitle: "Booked, completed and completion rate per service category.",
      columns: [
        { key: "category", label: "Category", type: "text", width: 28 },
        { key: "booked", label: "Booked", type: "int" },
        { key: "completed", label: "Completed", type: "int" },
        { key: "rate", label: "Completion", type: "pct", heat: true },
      ],
      rows: svc.map((r) => ({ category: r.category, booked: Number(r.booked || 0), completed: Number(r.completed || 0), rate: Number(r.completionRate || 0) })),
      totalRow: (() => {
        const b = svc.reduce((s, r) => s + Number(r.booked || 0), 0);
        const c = svc.reduce((s, r) => s + Number(r.completed || 0), 0);
        return { category: "Total", booked: b, completed: c, rate: pctOf(c, b) };
      })(),
    });
  }

  // ── Service Line Items ────────────────────────────────────────────────
  const svcLines: Record<string, { packages: any[]; tests: any[] }> = charts?.serviceCategoryLineItems ?? {};
  const lineRows: Record<string, unknown>[] = [];
  for (const [category, groups] of Object.entries(svcLines)) {
    for (const kind of ["packages", "tests"] as const) {
      for (const li of groups[kind] || []) {
        lineRows.push({
          category,
          type: kind === "packages" ? "Package" : "Test",
          service: li.serviceName,
          booked: Number(li.booked || 0),
          completed: Number(li.completed || 0),
          rate: Number(li.completionRate || 0),
        });
      }
    }
  }
  if (lineRows.length) {
    addTableSheet(wb, {
      name: "Service Line Items",
      accent: "#ec4899",
      title: "Service Line Items",
      subtitle: "Individual packages and tests within each service category.",
      columns: [
        { key: "category", label: "Category", type: "text", width: 24 },
        { key: "type", label: "Type", type: "text", width: 12 },
        { key: "service", label: "Service", type: "text", width: 34 },
        { key: "booked", label: "Booked", type: "int" },
        { key: "completed", label: "Completed", type: "int" },
        { key: "rate", label: "Completion", type: "pct", heat: true },
      ],
      rows: lineRows,
    });
  }

  // ── download ──────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const tag = [meta.cugCode || "utilization", meta.dateFrom, meta.dateTo].filter(Boolean).join("_");
  a.href = url;
  a.download = `Utilization_${tag || "export"}.xlsx`.replace(/[^\w.\-]+/g, "_");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// KPI sheet uses a mixed-type value column, so it gets its own tiny renderer.
function addKpiSheet(wb: ExcelJS.Workbook, kpiRows: { metric: string; value: number; type: ColType }[], kpis: any) {
  const accentArgb = argb("#4f46e5");
  const ws = wb.addWorksheet("KPIs");
  ws.mergeCells(1, 1, 1, 3);
  const t = ws.getCell(1, 1);
  t.value = "Key Metrics";
  t.font = { bold: true, size: 14, color: { argb: WHITE } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentArgb } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, 3);
  const s = ws.getCell(2, 1);
  s.value = kpis?.yoyLabel ? `Year-over-year basis: ${kpis.yoyLabel}` : "Headline totals for the selected range.";
  s.font = { italic: true, size: 10, color: { argb: argb("#6b7280") } };
  s.alignment = { indent: 1 };
  const header = ["KPI", "Value", "YoY %"];
  const yoyMap: Record<string, number | null> = {
    "Total Footfall": kpis?.yoyBooked ?? null,
    "Total Consults": kpis?.yoyConsults ?? null,
    "Unique Patients": kpis?.yoyUnique ?? null,
    "Repeat Patients": kpis?.yoyRepeat ?? null,
  };
  header.forEach((h, i) => {
    const cell = ws.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentArgb } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right" };
    cell.border = border;
  });
  ws.getRow(3).height = 20;
  kpiRows.forEach((r, ri) => {
    const row = ws.getRow(4 + ri);
    const c1 = row.getCell(1); c1.value = r.metric; c1.border = border;
    const c2 = row.getCell(2); c2.value = r.value; c2.numFmt = numFmt[r.type]!; c2.alignment = { horizontal: "right" }; c2.border = border;
    const yoy = yoyMap[r.metric];
    const c3 = row.getCell(3);
    if (yoy != null) {
      c3.value = yoy / 100;
      c3.numFmt = "+0.0%;-0.0%";
      c3.font = { color: { argb: yoy >= 0 ? argb("#166534") : argb("#991b1b") }, bold: true };
    } else c3.value = "—";
    c3.alignment = { horizontal: "right" };
    c3.border = border;
    if (ri % 2 === 1) [c1, c2, c3].forEach((c) => { if (!c.fill || (c.fill as any).pattern === undefined) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }; });
  });
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 12;
  ws.views = [{ state: "frozen", ySplit: 3 }];
}
