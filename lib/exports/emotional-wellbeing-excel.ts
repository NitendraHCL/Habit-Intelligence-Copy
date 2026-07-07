/**
 * Excel exporter for the OHC Emotional Wellbeing page.
 *
 * Builds one styled .xlsx workbook with a sheet per data cut rendered on the
 * page, straight from the raw API numbers (not the on-screen formatted
 * strings) so the values stay pivot-friendly. Every figure reflects the page
 * filters + date range at export time (passed through in `meta`).
 *
 * Uses the shared styled-Excel engine (`excel-workbook.ts`) for consistent
 * accent bars, coloured headers, frozen panes, number formats and heat cells.
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

// Shape of the page's in-memory `charts` object (all fields optional/guarded).
type LC = { label: string; count: number };
type EwbCharts = {
  demographics?: {
    age?: LC[];
    gender?: LC[];
    location?: LC[];
    shift?: LC[];
    ageGender?: Array<{ ageGroup: string; male: number; female: number; others: number; total: number }>;
  };
  consultTrends?: Array<{ period: string; totalConsults: number; uniquePatients: number }>;
  criticalRisk?: { suicidalThoughts: number; attemptedSelfHarm: number; previousAttempts: number; totalCases: number };
  substanceUsePct?: number;
  sleepQuality?: LC[];
  sleepDuration?: LC[];
  alcoholHabit?: LC[];
  smokingHabit?: LC[];
  smokingTrend?: Array<{ period: string; pct: number }>;
  visitPattern?: LC[];
  impressions?: Array<{ label?: string; category?: string; count: number }>;
  impressionSubcategories?: Record<string, Array<{ label?: string; subcategory?: string; count: number }>>;
  impressionsByVisitBucket?: Record<string, Array<{ label?: string; category?: string; count: number }>>;
  anxietyScale?: LC[];
  depressionScale?: LC[];
  selfEsteemScale?: LC[];
};

type EwbKpis = {
  totalConsults?: number;
  uniquePatients?: number;
  repeatPatients?: number;
  totalEwbAssessed?: number;
};

export type EmotionalWellbeingExportInput = {
  charts: EwbCharts;
  kpis: EwbKpis;
  meta: ExportMeta;
};

const num = (v: unknown) => Number(v || 0);
const sum = (arr: LC[]) => arr.reduce((s, r) => s + num(r.count), 0);

// A simple label/count sheet with a "% of Total" column + total row. Used by
// most EWB distribution charts (sleep / alcohol / smoking / scales / …).
function addLabelCountSheet(
  wb: ReturnType<typeof createWorkbook>,
  opts: { name: string; accent: string; title: string; subtitle?: string; labelHeader: string; valueHeader?: string; rows: LC[] },
) {
  const total = sum(opts.rows);
  addTableSheet(wb, {
    name: opts.name,
    accent: opts.accent,
    title: opts.title,
    subtitle: opts.subtitle,
    columns: [
      { key: "label", label: opts.labelHeader, type: "text", width: 26 },
      { key: "count", label: opts.valueHeader ?? "Patients", type: "int" },
      { key: "pct", label: "% of Total", type: "pct1" },
    ],
    rows: opts.rows.map((r) => ({ label: r.label, count: num(r.count), pct: total > 0 ? Math.round((num(r.count) / total) * 1000) / 10 : 0 })),
    totalRow: { label: "Total", count: total, pct: total > 0 ? 100 : 0 },
  });
}

export async function exportEmotionalWellbeingWorkbook({ charts, kpis, meta }: EmotionalWellbeingExportInput) {
  const wb = createWorkbook();

  // ── Overview (context/filters) ──
  addOverviewSheet(wb, {
    title: "OHC Emotional Wellbeing — Data Export",
    accent: "#4f46e5",
    meta,
  });

  // ── KPIs (mixed int + count formats) ──
  if (kpis) {
    addTableSheet(wb, {
      name: "KPIs",
      accent: "#4f46e5",
      title: "Key Metrics",
      subtitle: "Headline totals for the selected range (Psychologist consults).",
      columns: [
        { key: "metric", label: "KPI", type: "text", width: 26 },
        { key: "value", label: "Value", cellType: (r) => (r.type as ColType) ?? "int" },
      ],
      rows: [
        { metric: "Total Consults", value: num(kpis.totalConsults), type: "int" },
        { metric: "Unique Patients", value: num(kpis.uniquePatients), type: "int" },
        { metric: "Repeat Patients", value: num(kpis.repeatPatients), type: "int" },
        { metric: "Total EWB Assessed", value: num(kpis.totalEwbAssessed), type: "int" },
      ],
    });
  }

  // ── Demographics — Age ──
  const age = charts?.demographics?.age ?? [];
  if (age.length) {
    addLabelCountSheet(wb, {
      name: "Demographics Age",
      accent: "#0d9488",
      title: "Patient Demographics — Age Groups",
      subtitle: "Consults per age band.",
      labelHeader: "Age Group",
      valueHeader: "Consults",
      rows: age,
    });
  }

  // ── Demographics — Gender ──
  const gender = charts?.demographics?.gender ?? [];
  if (gender.length) {
    addLabelCountSheet(wb, {
      name: "Demographics Gender",
      accent: "#0d9488",
      title: "Patient Demographics — Gender Split",
      subtitle: "Consults per gender.",
      labelHeader: "Gender",
      valueHeader: "Consults",
      rows: gender,
    });
  }

  // ── Demographics — Location ──
  const location = charts?.demographics?.location ?? [];
  if (location.length) {
    addLabelCountSheet(wb, {
      name: "Demographics Location",
      accent: "#0d9488",
      title: "Patient Demographics — Location",
      subtitle: "Consults per facility.",
      labelHeader: "Location",
      valueHeader: "Consults",
      rows: location,
    });
  }

  // ── Demographics — Age × Gender ──
  const ageGender = charts?.demographics?.ageGender ?? [];
  if (ageGender.length) {
    const t = ageGender.reduce(
      (s, r) => ({ male: s.male + num(r.male), female: s.female + num(r.female), others: s.others + num(r.others), total: s.total + num(r.total) }),
      { male: 0, female: 0, others: 0, total: 0 },
    );
    const hasOthers = t.others > 0;
    addTableSheet(wb, {
      name: "Demographics Age x Gender",
      accent: "#0d9488",
      title: "Patient Demographics — Age × Gender",
      subtitle: "Consults cross-tabbed by age band and gender.",
      columns: [
        { key: "ageGroup", label: "Age Group", type: "text" },
        { key: "male", label: "Male", type: "int" },
        { key: "female", label: "Female", type: "int" },
        ...(hasOthers ? [{ key: "others", label: "Others", type: "int" as ColType }] : []),
        { key: "total", label: "Total", type: "int" },
      ],
      rows: ageGender.map((r) => ({ ageGroup: r.ageGroup, male: num(r.male), female: num(r.female), others: num(r.others), total: num(r.total) })),
      totalRow: { ageGroup: "Total", ...t },
    });
  }

  // ── Consult Trends (monthly) ──
  const trends = charts?.consultTrends ?? [];
  if (trends.length) {
    addTableSheet(wb, {
      name: "Consult Trends",
      accent: "#6366f1",
      title: "Consult Trends (Monthly)",
      subtitle: "Total consults and unique patients per month.",
      columns: [
        { key: "period", label: "Month", type: "text" },
        { key: "totalConsults", label: "Total Consults", type: "int" },
        { key: "uniquePatients", label: "Unique Patients", type: "int" },
      ],
      rows: trends.map((r) => ({ period: r.period, totalConsults: num(r.totalConsults), uniquePatients: num(r.uniquePatients) })),
      totalRow: {
        period: "Total",
        totalConsults: trends.reduce((s, r) => s + num(r.totalConsults), 0),
        uniquePatients: trends.reduce((s, r) => s + num(r.uniquePatients), 0),
      },
    });
  }

  // ── Critical Risk (Self Harm) ──
  const cr = charts?.criticalRisk;
  if (cr && (cr.suicidalThoughts || cr.attemptedSelfHarm || cr.previousAttempts || cr.totalCases)) {
    addTableSheet(wb, {
      name: "Critical Risk",
      accent: "#dc2626",
      title: "Critical Risk (Self Harm)",
      subtitle: "Patients flagged on each self-harm indicator (latest session).",
      columns: [
        { key: "indicator", label: "Indicator", type: "text", width: 26 },
        { key: "cases", label: "Cases", type: "int" },
      ],
      rows: [
        { indicator: "Suicidal Thoughts", cases: num(cr.suicidalThoughts) },
        { indicator: "Attempted Self Harm", cases: num(cr.attemptedSelfHarm) },
        { indicator: "Previous Attempts", cases: num(cr.previousAttempts) },
      ],
      totalRow: { indicator: "Total Cases (any indicator)", cases: num(cr.totalCases) },
    });
  }

  // ── Substance Use (reported vs not, derived from % + assessed total) ──
  const substancePct = num(charts?.substanceUsePct);
  const assessed = num(kpis?.totalEwbAssessed);
  if (assessed > 0) {
    const reported = Math.round((substancePct / 100) * assessed);
    const notReported = Math.max(0, assessed - reported);
    addTableSheet(wb, {
      name: "Substance Use",
      accent: "#b45309",
      title: "Substance Use",
      subtitle: "Share of assessed patients flagged for smoking / alcohol / other substance use.",
      columns: [
        { key: "status", label: "Status", type: "text", width: 28 },
        { key: "patients", label: "Patients", type: "int" },
        { key: "pct", label: "% of Assessed", type: "pct1" },
      ],
      rows: [
        { status: "Reported substance use", patients: reported, pct: substancePct },
        { status: "No / not reported", patients: notReported, pct: Math.max(0, 100 - substancePct) },
      ],
      totalRow: { status: "Total assessed", patients: assessed, pct: 100 },
    });
  }

  // ── Sleep Quality ──
  const sleepQuality = charts?.sleepQuality ?? [];
  if (sleepQuality.length) {
    addLabelCountSheet(wb, { name: "Sleep Quality", accent: "#0ea5e9", title: "Sleep Quality", labelHeader: "Sleep Quality", rows: sleepQuality });
  }

  // ── Sleep Duration ──
  const sleepDuration = charts?.sleepDuration ?? [];
  if (sleepDuration.length) {
    addLabelCountSheet(wb, { name: "Sleep Duration", accent: "#0ea5e9", title: "Sleep Duration", labelHeader: "Sleep Duration", rows: sleepDuration });
  }

  // ── Alcohol Habit ──
  const alcohol = charts?.alcoholHabit ?? [];
  if (alcohol.length) {
    addLabelCountSheet(wb, { name: "Alcohol Habit", accent: "#a855f7", title: "Alcohol Habit", labelHeader: "Alcohol Intake", rows: alcohol });
  }

  // ── Smoking Habit ──
  const smoking = charts?.smokingHabit ?? [];
  if (smoking.length) {
    addLabelCountSheet(wb, { name: "Smoking Habit", accent: "#a855f7", title: "Smoking Habit", labelHeader: "Smoking Status", rows: smoking });
  }

  // ── Smoking Trend (monthly current-smoker share) ──
  const smokingTrend = charts?.smokingTrend ?? [];
  if (smokingTrend.length) {
    addTableSheet(wb, {
      name: "Smoking Trend",
      accent: "#a855f7",
      title: "Smoking Trend (Monthly)",
      subtitle: "Share of assessed patients flagged as current smokers, per month.",
      columns: [
        { key: "period", label: "Month", type: "text" },
        { key: "pct", label: "Current Smokers", type: "pct", heat: true },
      ],
      rows: smokingTrend.map((r) => ({ period: r.period, pct: num(r.pct) })),
    });
  }

  // ── Visit Pattern ──
  const visitPattern = charts?.visitPattern ?? [];
  if (visitPattern.length) {
    addLabelCountSheet(wb, { name: "Visit Pattern", accent: "#6366f1", title: "Visit Pattern", labelHeader: "Visits", rows: visitPattern });
  }

  // ── Impressions Analysis (overall category flag counts) ──
  const impressions = (charts?.impressions ?? []).map((i) => ({ label: i.category ?? i.label ?? "Unknown", count: num(i.count) }));
  if (impressions.length) {
    addLabelCountSheet(wb, {
      name: "Impressions",
      accent: "#5B6FCC",
      title: "Impressions Analysis",
      subtitle: "Patients flagged per impression category.",
      labelHeader: "Impression",
      rows: impressions,
    });
  }

  // ── Impressions by Visit Bucket (bucket × category matrix) ──
  const byBucket = charts?.impressionsByVisitBucket ?? {};
  const bucketKeys = Object.keys(byBucket);
  if (bucketKeys.length) {
    // Collect every category present across buckets to form stable columns.
    const cats: string[] = [];
    const rowMap: Record<string, Record<string, number>> = {};
    for (const bucket of bucketKeys) {
      rowMap[bucket] = {};
      for (const item of byBucket[bucket] || []) {
        const cat = item.category ?? item.label ?? "Unknown";
        if (!cats.includes(cat)) cats.push(cat);
        rowMap[bucket][cat] = num(item.count);
      }
    }
    const VISIT_ORDER = ["1 Visit", "2 Visits", "3 Visits", "4 Visits", "5+ Visits"];
    const orderedBuckets = [...bucketKeys].sort((a, b) => VISIT_ORDER.indexOf(a) - VISIT_ORDER.indexOf(b));
    const columns: Col[] = [
      { key: "bucket", label: "Visit Bucket", type: "text", width: 14 },
      ...cats.map((c) => ({ key: `c__${c}`, label: c, type: "int" as ColType })),
      { key: "rowTotal", label: "Total", type: "int" },
    ];
    const rows = orderedBuckets.map((bucket) => {
      const out: Record<string, unknown> = { bucket };
      let rowTotal = 0;
      for (const c of cats) {
        const v = num(rowMap[bucket][c]);
        out[`c__${c}`] = v;
        rowTotal += v;
      }
      out.rowTotal = rowTotal;
      return out;
    });
    const totalRow: Record<string, unknown> = { bucket: "Total" };
    let grand = 0;
    for (const c of cats) {
      const colSum = rows.reduce((s, r) => s + num(r[`c__${c}`]), 0);
      totalRow[`c__${c}`] = colSum;
      grand += colSum;
    }
    totalRow.rowTotal = grand;
    addTableSheet(wb, {
      name: "Impressions by Visit",
      accent: "#5B6FCC",
      title: "Impressions Analysis by Visit Bucket",
      subtitle: "Flagged patients per impression category within each visit-count bucket.",
      columns,
      rows,
      totalRow,
      freezeFirstCol: true,
    });
  }

  // ── Impression Subcategories (drill-down) ──
  const subs = charts?.impressionSubcategories ?? {};
  const subRows: Record<string, unknown>[] = [];
  for (const [category, arr] of Object.entries(subs)) {
    for (const item of arr || []) {
      subRows.push({ category, subcategory: item.subcategory ?? item.label ?? "Unknown", count: num(item.count) });
    }
  }
  if (subRows.length) {
    addTableSheet(wb, {
      name: "Impression Subcategories",
      accent: "#7E68B5",
      title: "Impressions Analysis — Subcategory Drill-down",
      subtitle: "Patients per (impression category × recorded subcategory value).",
      columns: [
        { key: "category", label: "Category", type: "text", width: 24 },
        { key: "subcategory", label: "Subcategory", type: "text", width: 34 },
        { key: "count", label: "Patients", type: "int" },
      ],
      rows: subRows,
    });
  }

  // ── Anxiety Scale ──
  const anxiety = charts?.anxietyScale ?? [];
  if (anxiety.length) {
    addLabelCountSheet(wb, { name: "Anxiety Scale", accent: "#ec4899", title: "Anxiety Scale", labelHeader: "Anxiety Level", rows: anxiety });
  }

  // ── Depression Scale ──
  const depression = charts?.depressionScale ?? [];
  if (depression.length) {
    addLabelCountSheet(wb, { name: "Depression Scale", accent: "#ec4899", title: "Depression Scale", labelHeader: "Depression Level", rows: depression });
  }

  // ── Self Esteem Scale ──
  const selfEsteem = charts?.selfEsteemScale ?? [];
  if (selfEsteem.length) {
    addLabelCountSheet(wb, { name: "Self Esteem Scale", accent: "#ec4899", title: "Self Esteem Scale", labelHeader: "Self-Esteem Level", rows: selfEsteem });
  }

  // ── download ──
  const tag = [meta.cugCode || "ewb", meta.dateFrom, meta.dateTo].filter(Boolean).join("_");
  await downloadWorkbook(wb, `EmotionalWellbeing_${tag || "export"}.xlsx`);
}
