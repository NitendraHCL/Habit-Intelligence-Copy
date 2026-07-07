/**
 * Excel exporter for the OHC Repeat Visits page.
 *
 * Builds one styled .xlsx workbook with a sheet per data cut on the page,
 * straight from the raw API numbers (not the on-screen formatted strings)
 * so the values stay pivot-friendly.
 *
 * IMPORTANT domain note: a "repeat visit" here counts DISTINCT visit DAYS
 * (one calendar day at the clinic), NOT individual consults/services —
 * same-day multi-service counts once. Sheet titles/subtitles reflect that.
 *
 * Uses the shared styled-Excel engine in `./excel-workbook`. Meant to be
 * dynamically imported on click so exceljs stays out of the main bundle.
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

export type RepeatVisitsExportInput = {
  charts: any;
  kpis: any;
  meta: ExportMeta;
};

const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
const num = (v: unknown) => Number(v ?? 0) || 0;

export async function exportRepeatVisitsWorkbook({ charts, kpis, meta }: RepeatVisitsExportInput) {
  const wb = createWorkbook();
  wb.created = new Date(meta.generatedAt);

  // ── Overview ──────────────────────────────────────────────────────────
  addOverviewSheet(wb, {
    title: "OHC Repeat Visits — Data Export",
    accent: "#4f46e5",
    meta,
  });

  // ── KPIs (mixed int / decimal formats via cellType) ───────────────────
  if (kpis) {
    const kpiRows: { metric: string; value: number; fmt: ColType }[] = [
      { metric: "Total Repeat Patients", value: num(kpis.totalRepeatPatients), fmt: "int" },
      { metric: "Avg Visit Frequency (distinct days / patient)", value: num(kpis.avgVisitFrequency), fmt: "dec" },
      { metric: "Total Consults by Repeat Users", value: num(kpis.totalConsultsByRepeat), fmt: "int" },
      { metric: "Frequent Repeaters (≥5 visit days)", value: num(kpis.frequentRepeaters), fmt: "int" },
    ];
    addTableSheet(wb, {
      name: "KPIs",
      accent: "#4f46e5",
      title: "Repeat Visits — Key Metrics",
      subtitle: "A repeat patient visited OHC on ≥ Min Visits distinct days; same-day multi-service counts once.",
      columns: [
        { key: "metric", label: "KPI", type: "text", width: 42 },
        { key: "value", label: "Value", width: 16, cellType: (r) => (r.fmt as ColType) ?? "int" },
      ],
      rows: kpiRows,
    });
  }

  // ── Chronic Repeat Patients (chronic vs non-chronic) ──────────────────
  const ca = charts?.chronicVsAcute;
  if (ca && (num(ca.chronic) > 0 || num(ca.acute) > 0)) {
    const chronic = num(ca.chronic);
    const nonChronic = num(ca.acute);
    const total = chronic + nonChronic;
    addTableSheet(wb, {
      name: "Chronic Repeat Patients",
      accent: "#4f46e5",
      title: "Chronic Repeat Patients",
      subtitle: "Repeat patients (≥ Min Visits distinct visit days) split by chronic vs non-chronic condition status.",
      columns: [
        { key: "cohort", label: "Cohort", type: "text", width: 22 },
        { key: "patients", label: "Patients", type: "int" },
        { key: "share", label: "% of Repeaters", type: "pct1", heat: true },
      ],
      rows: [
        { cohort: "Chronic", patients: chronic, share: pctOf(chronic, total) },
        { cohort: "Non-chronic", patients: nonChronic, share: pctOf(nonChronic, total) },
      ],
      totalRow: { cohort: "Total repeat patients", patients: total, share: 100 },
    });
  }

  // ── Demographics — Age Groups ─────────────────────────────────────────
  const ageGroups: any[] = charts?.demographics?.ageGroups ?? [];
  if (ageGroups.length) {
    const total = ageGroups.reduce((s, r) => s + num(r.count), 0);
    addTableSheet(wb, {
      name: "Age Groups",
      accent: "#0d9488",
      title: "Repeat Patients by Age Group",
      subtitle: "Distinct repeat patients per age band.",
      columns: [
        { key: "label", label: "Age Group", type: "text", width: 16 },
        { key: "count", label: "Patients", type: "int" },
        { key: "share", label: "% of Total", type: "pct1" },
      ],
      rows: ageGroups.map((r) => ({ label: r.label, count: num(r.count), share: pctOf(num(r.count), total) })),
      totalRow: { label: "Total", count: total, share: 100 },
    });
  }

  // ── Demographics — Gender Split ───────────────────────────────────────
  const genderSplit: any[] = charts?.demographics?.genderSplit ?? [];
  if (genderSplit.length) {
    const total = genderSplit.reduce((s, r) => s + num(r.count), 0);
    addTableSheet(wb, {
      name: "Gender Split",
      accent: "#0d9488",
      title: "Repeat Patients by Gender",
      subtitle: "Distinct repeat patients per gender.",
      columns: [
        { key: "label", label: "Gender", type: "text", width: 16 },
        { key: "count", label: "Patients", type: "int" },
        { key: "share", label: "% of Total", type: "pct1" },
      ],
      rows: genderSplit.map((r) => ({ label: r.label, count: num(r.count), share: pctOf(num(r.count), total) })),
      totalRow: { label: "Total", count: total, share: 100 },
    });
  }

  // ── Demographics — Location Distribution ──────────────────────────────
  const locationDist: any[] = charts?.demographics?.locationDistribution ?? [];
  if (locationDist.length) {
    const total = locationDist.reduce((s, r) => s + num(r.count), 0);
    addTableSheet(wb, {
      name: "Location Distribution",
      accent: "#0d9488",
      title: "Repeat Patients by Location",
      subtitle: "Distinct repeat patients per facility (top 10; remainder rolled into 'Others').",
      columns: [
        { key: "label", label: "Location", type: "text", width: 30 },
        { key: "count", label: "Patients", type: "int" },
        { key: "share", label: "% of Total", type: "pct1" },
      ],
      rows: locationDist.map((r) => ({ label: r.label, count: num(r.count), share: pctOf(num(r.count), total) })),
      totalRow: { label: "Total", count: total, share: 100 },
    });
  }

  // ── Location 'Others' breakdown (facilities rolled into Others) ────────
  const othersBreakdown: any[] = charts?.demographics?.othersBreakdown ?? [];
  if (othersBreakdown.length) {
    const total = othersBreakdown.reduce((s, r) => s + num(r.total), 0);
    addTableSheet(wb, {
      name: "Location Others Breakdown",
      accent: "#14b8a6",
      title: "Location Distribution — 'Others' Breakdown",
      subtitle: "Facilities outside the top 10, itemised (repeat patients).",
      columns: [
        { key: "location", label: "Location", type: "text", width: 30 },
        { key: "total", label: "Patients", type: "int" },
        { key: "share", label: "% of Others", type: "pct1" },
      ],
      rows: othersBreakdown.map((r) => ({ location: r.location, total: num(r.total), share: pctOf(num(r.total), total) })),
      totalRow: { location: "Total (Others)", total, share: 100 },
    });
  }

  // ── Age × Gender Pyramid ──────────────────────────────────────────────
  const pyramid: any[] = charts?.demographics?.ageGenderPyramid ?? [];
  if (pyramid.length) {
    const hasOthers = pyramid.some((r) => num(r.others) > 0);
    const t = pyramid.reduce(
      (s, r) => ({
        male: s.male + num(r.male),
        female: s.female + num(r.female),
        others: s.others + num(r.others),
        total: s.total + num(r.total ?? num(r.male) + num(r.female) + num(r.others)),
      }),
      { male: 0, female: 0, others: 0, total: 0 },
    );
    const columns: Col[] = [
      { key: "ageGroup", label: "Age Group", type: "text", width: 16 },
      { key: "male", label: "Male", type: "int" },
      { key: "female", label: "Female", type: "int" },
      ...(hasOthers ? [{ key: "others", label: "Others", type: "int" as ColType }] : []),
      { key: "total", label: "Total", type: "int" },
    ];
    addTableSheet(wb, {
      name: "Age x Gender Pyramid",
      accent: "#a855f7",
      title: "Age × Gender Pyramid",
      subtitle: "Repeat patients per age band, split by gender.",
      columns,
      rows: pyramid.map((r) => ({
        ageGroup: r.ageGroup,
        male: num(r.male),
        female: num(r.female),
        others: num(r.others),
        total: num(r.total ?? num(r.male) + num(r.female) + num(r.others)),
      })),
      totalRow: { ageGroup: "Total", ...t },
    });
  }

  // ── Repeat Visit Frequency (same vs different specialty) ──────────────
  const rvf: any[] = charts?.repeatVisitFrequency ?? [];
  if (rvf.length) {
    const t = rvf.reduce(
      (s, r) => ({
        count: s.count + num(r.count),
        same: s.same + num(r.sameSpecialty),
        diff: s.diff + num(r.differentSpecialty),
      }),
      { count: 0, same: 0, diff: 0 },
    );
    addTableSheet(wb, {
      name: "Repeat Visit Frequency",
      accent: "#6366f1",
      title: "Repeat Visit Frequency",
      subtitle: "Repeat patients bucketed by number of distinct visit days, split by whether they saw one vs multiple specialties.",
      columns: [
        { key: "bucket", label: "Visits", type: "text", width: 16 },
        { key: "count", label: "Patients", type: "int" },
        { key: "same", label: "Same Specialty", type: "int" },
        { key: "diff", label: "Different Specialty", type: "int" },
      ],
      rows: rvf.map((r) => ({
        bucket: r.bucket ?? r.label,
        count: num(r.count),
        same: num(r.sameSpecialty),
        diff: num(r.differentSpecialty),
      })),
      totalRow: { bucket: "Total", count: t.count, same: t.same, diff: t.diff },
    });
  }

  // ── Key Repeat User Segments (tenure cohorts) ─────────────────────────
  const segments: any[] = charts?.repeatUserSegments ?? [];
  if (segments.length) {
    const t = segments.reduce(
      (s, r) => ({
        patients: s.patients + num(r.patients),
        chronic: s.chronic + num(r.chronic?.count),
      }),
      { patients: 0, chronic: 0 },
    );
    addTableSheet(wb, {
      name: "Repeat User Segments",
      accent: "#6366f1",
      title: "Key Repeat User Segments by Tenure",
      subtitle: "Repeat patients grouped by tenure (first→last visit span). Visits/Year uses distinct visit days.",
      columns: [
        { key: "label", label: "Segment", type: "text", width: 16 },
        { key: "patients", label: "Patients", type: "int" },
        { key: "vpy", label: "Visits / Year", type: "dec" },
        { key: "chronic", label: "Chronic", type: "int" },
        { key: "chronicPct", label: "Chronic %", type: "pct", heat: true },
      ],
      rows: segments.map((r) => ({
        label: r.label,
        patients: num(r.patients),
        vpy: num(r.visitsPerYear),
        chronic: num(r.chronic?.count),
        chronicPct: num(r.chronic?.pct),
      })),
      totalRow: {
        label: "Total",
        patients: t.patients,
        chronic: t.chronic,
        chronicPct: pctOf(t.chronic, t.patients),
      },
    });
  }

  // ── Repeat Patients by Specialty (per treemap year) ───────────────────
  const treemap: Record<string, Array<{ name: string; value: number }>> = charts?.specialtyTreemap ?? {};
  const treemapYears: string[] = charts?.treemapYears ?? Object.keys(treemap);
  for (const yr of treemapYears) {
    const items = treemap[yr] ?? [];
    if (!items.length) continue;
    const total = items.reduce((s, r) => s + num(r.value), 0);
    addTableSheet(wb, {
      name: `Specialty ${yr}`,
      accent: "#0ea5e9",
      title: `Repeat Patients by Specialty — ${yr}`,
      subtitle: "Consults contributed by the repeat-patient cohort, by specialty (top 25).",
      columns: [
        { key: "name", label: "Specialty", type: "text", width: 28 },
        { key: "value", label: "Consults", type: "int" },
        { key: "share", label: "% of Consults", type: "pct1" },
      ],
      rows: items.map((r) => ({ name: r.name, value: num(r.value), share: pctOf(num(r.value), total) })),
      totalRow: { name: "Total", value: total, share: 100 },
    });
  }

  // ── Recurring Conditions Performance (chronic) ────────────────────────
  const recurring: any[] = charts?.recurringConditions?.chronic ?? [];
  if (recurring.length) {
    addTableSheet(wb, {
      name: "Recurring Conditions",
      accent: "#ec4899",
      title: "Recurring Conditions Performance (Chronic)",
      subtitle: "Top chronic conditions across the repeat-patient cohort, by distinct patients.",
      columns: [
        { key: "name", label: "Condition", type: "text", width: 40 },
        { key: "patients", label: "Patients", type: "int" },
        { key: "count", label: "Occurrences", type: "int" },
      ],
      rows: recurring.map((r) => ({ name: r.name, patients: num(r.patients), count: num(r.count) })),
      totalRow: {
        name: "Total",
        patients: recurring.reduce((s, r) => s + num(r.patients), 0),
        count: recurring.reduce((s, r) => s + num(r.count), 0),
      },
    });
  }

  // ── Same Cohort Progression — Visit Frequency by Year (crosstab) ──────
  const cohortFreq: Record<string, Array<{ threshold: string; count: number }>> = charts?.cohortVisitFrequency ?? {};
  const cohortYears: string[] = (charts?.cohortYears ?? Object.keys(cohortFreq))
    .slice()
    .sort((a: string, b: string) => Number(b) - Number(a));
  if (cohortYears.length) {
    const thresholds = ["3+", "4+", "5+", "6+"];
    const columns: Col[] = [
      { key: "threshold", label: "Visit Frequency", type: "text", width: 18 },
      ...cohortYears.map((y) => ({ key: `y__${y}`, label: y, type: "int" as ColType })),
    ];
    const rows = thresholds.map((th) => {
      const out: Record<string, unknown> = { threshold: `${th} visits` };
      for (const y of cohortYears) {
        const match = (cohortFreq[y] ?? []).find((d) => d.threshold === th);
        out[`y__${y}`] = num(match?.count);
      }
      return out;
    });
    // Only emit if at least one value is non-zero.
    const anyData = rows.some((r) => cohortYears.some((y) => num(r[`y__${y}`]) > 0));
    if (anyData) {
      addTableSheet(wb, {
        name: "Cohort Visit Frequency",
        accent: "#f59e0b",
        title: "Same Cohort Progression — Visit Frequency by Year",
        subtitle: "Repeat patients clearing each distinct-visit-day threshold within each year.",
        columns,
        rows,
        freezeFirstCol: true,
      });
    }
  }

  // ── Same Cohort Progression — BMI Sankey (Visit 1→2→3) ────────────────
  const nodes: Array<{ name: string }> = charts?.sankeyFlow?.nodes ?? [];
  const links: Array<{ source: number; target: number; value: number }> = charts?.sankeyFlow?.links ?? [];
  if (links.length && nodes.length) {
    const nameOf = (i: number) => nodes[i]?.name ?? String(i);
    const rows = links
      .map((l) => ({ from: nameOf(l.source), to: nameOf(l.target), value: num(l.value) }))
      .filter((r) => r.value > 0);
    if (rows.length) {
      addTableSheet(wb, {
        name: "BMI Sankey",
        accent: "#f59e0b",
        title: "Same Cohort Progression — BMI Transitions (Visit 1→2→3)",
        subtitle: "Patient counts moving between BMI bands (WHO cut-offs) across their first 3 visit-day readings.",
        columns: [
          { key: "from", label: "From (Visit · Band)", type: "text", width: 26 },
          { key: "to", label: "To (Visit · Band)", type: "text", width: 26 },
          { key: "value", label: "Patients", type: "int" },
        ],
        rows,
        totalRow: { from: "Total transitions", to: "", value: rows.reduce((s, r) => s + r.value, 0) },
      });
    }
  }

  // ── download ──────────────────────────────────────────────────────────
  const tag = [meta.cugCode || "RepeatVisits", meta.dateFrom, meta.dateTo].filter(Boolean).join("_");
  await downloadWorkbook(wb, `RepeatVisits_${tag || "export"}.xlsx`);
}
