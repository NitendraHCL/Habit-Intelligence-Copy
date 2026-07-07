/**
 * Excel exporter for the OHC Health Insights page.
 *
 * Builds a single, styled .xlsx workbook with one sheet per data cut on the
 * page, straight from the raw API numbers (not the on-screen formatted
 * strings) so the values stay pivot-friendly. Uses the shared styled-Excel
 * engine in `./excel-workbook` for consistent title bars, headers, borders,
 * frozen panes, number formats and traffic-light heat cells.
 *
 * Source: /api/ohc/health-insights (aggregated_table.agg_diagnosis). Row grain
 * is one diagnosis record per encounter, so "count" / "diagnoses" = COUNT(*)
 * and "patients" = COUNT(DISTINCT uhid). The demographic, trends, seasonal
 * pattern and combination cuts are chronic-only per the API.
 *
 * Dynamically imported on click so exceljs stays out of the main bundle.
 */
import {
  createWorkbook,
  addOverviewSheet,
  addTableSheet,
  downloadWorkbook,
  type Col,
  type ColType,
  type ExportMeta,
} from "./excel-workbook";

// ── input shape ──────────────────────────────────────────────────────────
// `data` is the raw JSON payload from /api/ohc/health-insights (the page's
// `d`). We read every array/object cut off it directly.
export type HealthInsightsExportInput = {
  data: any;
  meta: ExportMeta;
};

const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const num = (v: unknown) => Number(v || 0);

export async function exportHealthInsightsWorkbook({ data, meta }: HealthInsightsExportInput) {
  const wb = createWorkbook();
  wb.created = new Date(meta.generatedAt);

  // ── Overview ───────────────────────────────────────────────────────────
  addOverviewSheet(wb, {
    title: "OHC Health Insights — Data Export",
    accent: "#4f46e5",
    meta,
  });

  // ── KPIs (mixed int / % formats via per-row cellType) ────────────────────
  const ca = data?.chronicAcute;
  const categoryTreemap: any[] = Array.isArray(data?.categoryTreemap) ? data.categoryTreemap : [];
  const conditionBreakdown: any[] = Array.isArray(data?.conditionBreakdown) ? data.conditionBreakdown : [];
  if (ca || categoryTreemap.length || conditionBreakdown.length) {
    const chronicCount = num(ca?.chronicCount);
    const acuteCount = num(ca?.acuteCount);
    const chronicPatients = num(ca?.chronicPatients);
    const acutePatients = num(ca?.acutePatients);
    const totalDiagnoses = chronicCount + acuteCount;
    const kpiRows: Record<string, unknown>[] = [
      { metric: "Total Diagnoses", value: totalDiagnoses, kind: "int" },
      { metric: "Chronic Diagnoses", value: chronicCount, kind: "int" },
      { metric: "Acute Diagnoses", value: acuteCount, kind: "int" },
      { metric: "Chronic Share of Diagnoses", value: pctOf(chronicCount, totalDiagnoses), kind: "pct1" },
      { metric: "Patients with a Chronic Diagnosis", value: chronicPatients, kind: "int" },
      { metric: "Patients with an Acute Diagnosis", value: acutePatients, kind: "int" },
      { metric: "Disease Groups", value: categoryTreemap.length, kind: "int" },
      { metric: "Distinct Conditions (top 20 shown)", value: conditionBreakdown.length, kind: "int" },
    ];
    addTableSheet(wb, {
      name: "KPIs",
      accent: "#4f46e5",
      title: "Key Metrics",
      subtitle: "Chronic flag = status in ('Chronic','Acute or Chronic'). Counts are diagnosis records; patients are distinct.",
      columns: [
        { key: "metric", label: "KPI", type: "text", width: 34 },
        { key: "value", label: "Value", cellType: (r) => (r.kind as ColType) ?? "int", width: 16 },
      ],
      rows: kpiRows,
    });
  }

  // ── Disease Group Breakdown (categoryTreemap) ────────────────────────────
  if (categoryTreemap.length) {
    const totalV = categoryTreemap.reduce((s, r) => s + num(r.value), 0);
    const totalP = categoryTreemap.reduce((s, r) => s + num(r.uniquePatients), 0);
    addTableSheet(wb, {
      name: "Disease Groups",
      accent: "#0d9488",
      title: "Disease Group Breakdown",
      subtitle: "Diagnoses and unique patients per curated disease group. Non-blank ICD description only.",
      columns: [
        { key: "name", label: "Disease Group", type: "text", width: 34 },
        { key: "value", label: "Diagnoses", type: "int" },
        { key: "uniquePatients", label: "Unique Patients", type: "int" },
        { key: "share", label: "Share of Diagnoses", type: "pct1" },
      ],
      rows: categoryTreemap.map((r) => ({
        name: r.name,
        value: num(r.value),
        uniquePatients: num(r.uniquePatients),
        share: pctOf(num(r.value), totalV),
      })),
      totalRow: { name: "Total", value: totalV, uniquePatients: totalP, share: 100 },
      freezeFirstCol: true,
    });
  }

  // ── Top Conditions (conditionBreakdown) ──────────────────────────────────
  if (conditionBreakdown.length) {
    const totalV = conditionBreakdown.reduce((s, r) => s + num(r.value ?? r.count), 0);
    addTableSheet(wb, {
      name: "Top Conditions",
      accent: "#6366f1",
      title: "Top Conditions",
      subtitle: "Top 20 ICD conditions by diagnosis count, with unique patients.",
      columns: [
        { key: "name", label: "Condition", type: "text", width: 40 },
        { key: "value", label: "Diagnoses", type: "int" },
        { key: "patients", label: "Unique Patients", type: "int" },
        { key: "share", label: "Share of Diagnoses", type: "pct1" },
      ],
      rows: conditionBreakdown.map((r) => {
        const v = num(r.value ?? r.count);
        return { name: r.name, value: v, patients: num(r.uniquePatients ?? r.patients), share: pctOf(v, totalV) };
      }),
      freezeFirstCol: true,
    });
  }

  // ── Conditions by Disease Group (conditionsByCategory) ───────────────────
  const cbc: Record<string, Array<{ name: string; value: number; uniquePatients: number }>> =
    data?.conditionsByCategory && typeof data.conditionsByCategory === "object" ? data.conditionsByCategory : {};
  const cbcRows: Record<string, unknown>[] = [];
  for (const [category, conds] of Object.entries(cbc)) {
    for (const c of conds || []) {
      cbcRows.push({
        category,
        condition: c.name,
        value: num(c.value),
        patients: num(c.uniquePatients),
      });
    }
  }
  if (cbcRows.length) {
    addTableSheet(wb, {
      name: "Conditions by Group",
      accent: "#8b5cf6",
      title: "Conditions by Disease Group",
      subtitle: "Every disease group × condition combination with diagnoses and unique patients.",
      columns: [
        { key: "category", label: "Disease Group", type: "text", width: 30 },
        { key: "condition", label: "Condition", type: "text", width: 40 },
        { key: "value", label: "Diagnoses", type: "int" },
        { key: "patients", label: "Unique Patients", type: "int" },
      ],
      rows: cbcRows,
      totalRow: {
        category: "Total",
        condition: "",
        value: cbcRows.reduce((s, r) => s + num(r.value), 0),
        patients: cbcRows.reduce((s, r) => s + num(r.patients), 0),
      },
      freezeFirstCol: true,
    });
  }

  // ── Chronic vs Acute (chronicAcute) ──────────────────────────────────────
  if (ca) {
    const cCount = num(ca.chronicCount);
    const aCount = num(ca.acuteCount);
    const totC = cCount + aCount;
    addTableSheet(wb, {
      name: "Chronic vs Acute",
      accent: "#0ea5e9",
      title: "Chronic vs Acute Split",
      subtitle: "Chronic = status in ('Chronic','Acute or Chronic'). Patients are distinct within each flag (a patient can appear in both).",
      columns: [
        { key: "type", label: "Type", type: "text", width: 16 },
        { key: "count", label: "Diagnoses", type: "int" },
        { key: "patients", label: "Patients", type: "int" },
        { key: "share", label: "Share of Diagnoses", type: "pct1" },
      ],
      rows: [
        { type: "Chronic", count: cCount, patients: num(ca.chronicPatients), share: pctOf(cCount, totC) },
        { type: "Acute", count: aCount, patients: num(ca.acutePatients), share: pctOf(aCount, totC) },
      ],
      totalRow: { type: "Total", count: totC, patients: num(ca.chronicPatients) + num(ca.acutePatients), share: 100 },
    });
  }

  // ── Demographic matrices (demoAge / demoGender / demoLocation) ────────────
  // Shape: { [conditionOrGroup]: { [bucket]: { count } } }. Emit each as its
  // own crosstab sheet (rows = key, columns = buckets), chronic-only.
  const emitDemo = (
    obj: Record<string, Record<string, { count: number }>> | undefined,
    sheetName: string,
    title: string,
    subtitle: string,
    accent: string,
    bucketLabel: string,
  ) => {
    if (!obj || typeof obj !== "object") return;
    const keys = Object.keys(obj);
    if (!keys.length) return;
    // Union of all buckets across keys, preserving first-seen order.
    const buckets: string[] = [];
    for (const k of keys) for (const b of Object.keys(obj[k] || {})) if (!buckets.includes(b)) buckets.push(b);
    if (!buckets.length) return;
    const columns: Col[] = [
      { key: "key", label: bucketLabel, type: "text", width: 30 },
      ...buckets.map((b) => ({ key: `b__${b}`, label: b, type: "int" as ColType })),
      { key: "rowTotal", label: "Total", type: "int" },
    ];
    const rows = keys.map((k) => {
      const out: Record<string, unknown> = { key: k };
      let rowTotal = 0;
      for (const b of buckets) {
        const v = num(obj[k]?.[b]?.count);
        out[`b__${b}`] = v;
        rowTotal += v;
      }
      out.rowTotal = rowTotal;
      return out;
    });
    const totalRow: Record<string, unknown> = { key: "Total" };
    let grand = 0;
    for (const b of buckets) {
      const colSum = rows.reduce((s, r) => s + num(r[`b__${b}`]), 0);
      totalRow[`b__${b}`] = colSum;
      grand += colSum;
    }
    totalRow.rowTotal = grand;
    addTableSheet(wb, { name: sheetName, accent, title, subtitle, columns, rows, totalRow, freezeFirstCol: true });
  };

  emitDemo(
    data?.demoAge,
    "Demographics by Age",
    "Demographic Breakdown — Age Group",
    "Chronic-only diagnoses by disease group / condition across age bands.",
    "#a855f7",
    "Disease Group / Condition",
  );
  emitDemo(
    data?.demoGender,
    "Demographics by Gender",
    "Demographic Breakdown — Gender",
    "Chronic-only diagnoses by disease group / condition across gender.",
    "#c026d3",
    "Disease Group / Condition",
  );
  emitDemo(
    data?.demoLocation,
    "Demographics by Location",
    "Demographic Breakdown — Location",
    "Chronic-only diagnoses by disease group / condition across facilities.",
    "#7c3aed",
    "Disease Group / Condition",
  );

  // ── Disease Combinations (diseaseCombinations) ───────────────────────────
  const combos: any[] = Array.isArray(data?.diseaseCombinations) ? data.diseaseCombinations : [];
  if (combos.length) {
    addTableSheet(wb, {
      name: "Disease Combinations",
      accent: "#ec4899",
      title: "Chronic Disease Combinations",
      subtitle: "Chronic condition pairs co-occurring on the same patient (≥5 patients, top 12). Male/Female = gender of the paired patients.",
      columns: [
        { key: "conditionA", label: "Condition A", type: "text", width: 34 },
        { key: "conditionB", label: "Condition B", type: "text", width: 34 },
        { key: "patients", label: "Patients", type: "int" },
        { key: "male", label: "Male", type: "int" },
        { key: "female", label: "Female", type: "int" },
      ],
      rows: combos.map((r) => ({
        conditionA: r.conditionA,
        conditionB: r.conditionB,
        patients: num(r.patients ?? r.total),
        male: num(r.male),
        female: num(r.female),
      })),
    });
  }

  // ── Condition Trends — monthly (conditionTrends) ─────────────────────────
  const trendsM: any[] = Array.isArray(data?.conditionTrends) ? data.conditionTrends : [];
  if (trendsM.length) {
    addTableSheet(wb, {
      name: "Trends Monthly",
      accent: "#f59e0b",
      title: "Condition Trends — Monthly",
      subtitle: "Chronic-only diagnoses per month. Unique patients are distinct within each month.",
      columns: [
        { key: "period", label: "Month", type: "text", width: 14 },
        { key: "count", label: "Diagnoses", type: "int" },
        { key: "uniquePatients", label: "Unique Patients", type: "int" },
      ],
      rows: trendsM.map((r) => ({ period: r.period, count: num(r.count), uniquePatients: num(r.uniquePatients) })),
      totalRow: {
        period: "Total",
        count: trendsM.reduce((s, r) => s + num(r.count), 0),
        uniquePatients: trendsM.reduce((s, r) => s + num(r.uniquePatients), 0),
      },
    });
  }

  // ── Condition Trends — yearly (conditionTrendsYearly) ────────────────────
  const trendsY: any[] = Array.isArray(data?.conditionTrendsYearly) ? data.conditionTrendsYearly : [];
  if (trendsY.length) {
    addTableSheet(wb, {
      name: "Trends Yearly",
      accent: "#d97706",
      title: "Condition Trends — Yearly",
      subtitle: "Chronic-only diagnoses per year (rolled up from monthly). Unique patients are summed across months and may over-count returning patients.",
      columns: [
        { key: "period", label: "Year", type: "text", width: 12 },
        { key: "count", label: "Diagnoses", type: "int" },
        { key: "uniquePatients", label: "Unique Patients (approx.)", type: "int" },
      ],
      rows: trendsY.map((r) => ({ period: r.period, count: num(r.count), uniquePatients: num(r.uniquePatients) })),
      totalRow: {
        period: "Total",
        count: trendsY.reduce((s, r) => s + num(r.count), 0),
        uniquePatients: trendsY.reduce((s, r) => s + num(r.uniquePatients), 0),
      },
    });
  }

  // ── Seasonal Split (seasonalData) ────────────────────────────────────────
  const sd = data?.seasonalData;
  if (sd) {
    const sc = num(sd.seasonalCount);
    const nsc = num(sd.nonSeasonalCount);
    const tot = sc + nsc;
    addTableSheet(wb, {
      name: "Seasonal Split",
      accent: "#14b8a6",
      title: "Seasonal Split",
      subtitle: "Mar–Aug vs Sep–Feb. Counts are diagnoses; patients are distinct within each window.",
      columns: [
        { key: "window", label: "Window", type: "text", width: 20 },
        { key: "count", label: "Diagnoses", type: "int" },
        { key: "patients", label: "Patients", type: "int" },
        { key: "share", label: "Share of Diagnoses", type: "pct1" },
      ],
      rows: [
        { window: "Mar–Aug", count: sc, patients: num(sd.seasonalPatients), share: pctOf(sc, tot) },
        { window: "Sep–Feb", count: nsc, patients: num(sd.nonSeasonalPatients), share: pctOf(nsc, tot) },
      ],
      totalRow: { window: "Total", count: tot, patients: num(sd.seasonalPatients) + num(sd.nonSeasonalPatients), share: 100 },
    });
  }

  // ── Monthly Condition Patterns (seasonalTrends) ──────────────────────────
  // Shape: { [diseaseGroup]: [{ period 'YYYY-MM', count }] } — chronic-only.
  // Emit long-form: one row per group × month.
  const st: Record<string, Array<{ period: string; count: number }>> =
    data?.seasonalTrends && typeof data.seasonalTrends === "object" ? data.seasonalTrends : {};
  const stRows: Record<string, unknown>[] = [];
  for (const [group, pts] of Object.entries(st)) {
    for (const p of pts || []) {
      stRows.push({ group, period: p.period, count: num(p.count) });
    }
  }
  if (stRows.length) {
    addTableSheet(wb, {
      name: "Monthly Patterns",
      accent: "#0d9488",
      title: "Monthly Condition Patterns",
      subtitle: "Chronic-only diagnoses per disease group per month (YYYY-MM).",
      columns: [
        { key: "group", label: "Disease Group", type: "text", width: 30 },
        { key: "period", label: "Month", type: "text", width: 14 },
        { key: "count", label: "Diagnoses", type: "int" },
      ],
      rows: stRows,
      totalRow: { group: "Total", period: "", count: stRows.reduce((s, r) => s + num(r.count), 0) },
      freezeFirstCol: true,
    });
  }

  // ── Co-Occurrence (coOccurrenceVenn) ─────────────────────────────────────
  // Only present when the user picked ≥1 disease group for the venn. subsets
  // is keyed by a bitmask over the selected categories.
  const venn = data?.coOccurrenceVenn;
  const vennCats: string[] = Array.isArray(venn?.categories) ? venn.categories : [];
  const subsets: Record<string, number> = venn?.subsets && typeof venn.subsets === "object" ? venn.subsets : {};
  const subsetRows = Object.entries(subsets)
    .filter(([, v]) => num(v) > 0)
    .map(([mask, v]) => {
      const m = Number(mask);
      const combo = vennCats.filter((_, i) => m & (1 << i)).join(" + ") || "—";
      return { combo, patients: num(v) };
    })
    .sort((a, b) => b.patients - a.patients);
  if (subsetRows.length) {
    addTableSheet(wb, {
      name: "Co-Occurrence",
      accent: "#4338ca",
      title: "Chronic Disease Co-Occurrence",
      subtitle: `Unique patients per combination of the selected disease groups: ${vennCats.join(", ")}.`,
      columns: [
        { key: "combo", label: "Disease Group Combination", type: "text", width: 44 },
        { key: "patients", label: "Patients", type: "int" },
      ],
      rows: subsetRows,
      totalRow: { combo: "Total (any of the selected)", patients: subsetRows.reduce((s, r) => s + num(r.patients), 0) },
      freezeFirstCol: true,
    });
  }

  // ── download ─────────────────────────────────────────────────────────────
  const tag = [meta.cugCode || "health-insights", meta.dateFrom, meta.dateTo].filter(Boolean).join("_");
  await downloadWorkbook(wb, `HealthInsights_${tag || "export"}.xlsx`);
}
