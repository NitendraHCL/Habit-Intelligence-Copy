/**
 * Excel exporter for the OHC Referral page.
 *
 * Builds a single, styled .xlsx workbook with one sheet per data cut on the
 * page, straight from the raw API numbers (not the on-screen formatted
 * strings) so the values stay pivot-friendly. Uses the shared styled-Excel
 * engine in `./excel-workbook`.
 *
 * This module is meant to be dynamically imported on click so exceljs stays
 * out of the main bundle.
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

export type ReferralExportInput = {
  charts: any;
  kpis: any;
  meta: ExportMeta;
};

const pctOf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export async function exportReferralWorkbook({ charts, kpis, meta }: ReferralExportInput) {
  const wb = createWorkbook();
  wb.created = new Date(meta.generatedAt);

  // ── Overview (context + active filters) ─────────────────────────────────
  addOverviewSheet(wb, {
    title: "OHC Referral — Data Export",
    accent: "#4f46e5",
    meta,
  });

  // ── KPIs (mixed int / % formats → per-row cellType) ─────────────────────
  if (kpis) {
    const kpiRows: Record<string, unknown>[] = [
      { metric: "Total Referrals", value: Number(kpis.totalReferrals || 0), fmt: "int" },
      { metric: "Converted", value: Number(kpis.convertedCount || 0), fmt: "int" },
      { metric: "Conversion Rate", value: Number(kpis.conversionPct || 0), fmt: "pct" },
    ];
    addTableSheet(wb, {
      name: "KPIs",
      accent: "#4f46e5",
      title: "Key Metrics",
      subtitle: "Headline referral totals for the selected range.",
      columns: [
        { key: "metric", label: "KPI", type: "text", width: 24 },
        { key: "value", label: "Value", width: 16, cellType: (r) => (r.fmt as ColType) ?? "int" },
      ],
      rows: kpiRows,
    });
  }

  // ── Referral Trends (per period) ────────────────────────────────────────
  const trends: any[] = charts?.referralTrends ?? [];
  if (trends.length) {
    const rows = trends.map((t) => {
      const referrals = Number(t.totalReferrals || 0);
      const conversions = Number(t.inClinicConversions || 0);
      return { period: t.period, referrals, conversions, rate: pctOf(conversions, referrals) };
    });
    const tr = rows.reduce((s, r) => s + r.referrals, 0);
    const tc = rows.reduce((s, r) => s + r.conversions, 0);
    addTableSheet(wb, {
      name: "Referral Trends",
      accent: "#4f46e5",
      title: "Referral Trends",
      subtitle: "Referrals issued and conversions per period (day for ≤31-day windows, else month).",
      columns: [
        { key: "period", label: "Period", type: "text", width: 16 },
        { key: "referrals", label: "Referrals", type: "int" },
        { key: "conversions", label: "Conversions", type: "int" },
        { key: "rate", label: "Conversion Rate", type: "pct1", heat: true },
      ],
      rows,
      totalRow: { period: "Total", referrals: tr, conversions: tc, rate: pctOf(tc, tr) },
    });
  }

  // ── Specialty Details (referrals · conversions · conversion rate) ───────
  const specDetails: any[] = (charts?.specialtyDetails ?? []).filter((s: any) => s.isAvailableInClinic);
  if (specDetails.length) {
    const rows = specDetails
      .map((s) => {
        const referrals = Number(s.referrals || 0);
        const conversions = Number(s.inClinicConsults || 0);
        return { specialty: s.specialty, referrals, conversions, rate: Number(s.conversionRate || 0) };
      })
      .sort((a, b) => b.conversions - a.conversions || b.referrals - a.referrals);
    const tr = rows.reduce((s, r) => s + r.referrals, 0);
    const tc = rows.reduce((s, r) => s + r.conversions, 0);
    addTableSheet(wb, {
      name: "Specialty Conversion",
      accent: "#0d9488",
      title: "Referral Conversion by Specialty",
      subtitle: "Referrals, in-clinic conversions and conversion rate per receiving specialty.",
      columns: [
        { key: "specialty", label: "Specialty", type: "text", width: 26 },
        { key: "referrals", label: "Referrals", type: "int" },
        { key: "conversions", label: "Conversions", type: "int" },
        { key: "rate", label: "Conversion Rate", type: "pct", heat: true },
      ],
      rows,
      totalRow: { specialty: "Total", referrals: tr, conversions: tc, rate: pctOf(tc, tr) },
    });
  }

  // ── Specialty × Referrer breakdown (byReferrer, with SLA windows) ───────
  const byRefRows: Record<string, unknown>[] = [];
  for (const s of specDetails) {
    for (const b of (s.byReferrer as any[]) || []) {
      byRefRows.push({
        toSpecialty: s.specialty,
        fromSpecialty: b.from,
        referrals: Number(b.referrals || 0),
        conversions: Number(b.conversions || 0),
        rate: Number(b.rate || 0),
        within90: Number(b.within90 || 0),
        mid: Number(b.mid || 0),
        late: Number(b.late || 0),
      });
    }
  }
  if (byRefRows.length) {
    addTableSheet(wb, {
      name: "Referrer Breakdown",
      accent: "#6366f1",
      title: "Conversions by Referring Specialty",
      subtitle: "For each receiving specialty, who referred in — split by time-to-conversion window.",
      columns: [
        { key: "toSpecialty", label: "Referred To", type: "text", width: 24 },
        { key: "fromSpecialty", label: "Referred From", type: "text", width: 24 },
        { key: "referrals", label: "Referrals", type: "int" },
        { key: "conversions", label: "Conversions", type: "int" },
        { key: "rate", label: "Conversion Rate", type: "pct", heat: true },
        { key: "within90", label: "≤90 days", type: "int" },
        { key: "mid", label: "90–180 days", type: "int" },
        { key: "late", label: ">180 days", type: "int" },
      ],
      rows: byRefRows,
      freezeFirstCol: true,
    });
  }

  // ── Referral Matrix (From-specialty → To-specialty) ─────────────────────
  const matrix: any[] = charts?.matrix ?? [];
  if (matrix.length) {
    const rows = [...matrix]
      .map((m) => ({ from: m.referredFrom, to: m.referredTo, count: Number(m.count || 0) }))
      .sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    addTableSheet(wb, {
      name: "Referral Matrix",
      accent: "#7c3aed",
      title: "Referral Matrix — Who Refers to Whom",
      subtitle: "Converted referrals by referring specialty → receiving specialty, over the selected range.",
      columns: [
        { key: "from", label: "Referred From", type: "text", width: 26 },
        { key: "to", label: "Referred To", type: "text", width: 26 },
        { key: "count", label: "Referrals", type: "int" },
      ],
      rows,
      totalRow: { from: "Total", to: "", count: total },
    });
  }

  // ── Demographics (age group × gender) ───────────────────────────────────
  const demo: any[] = charts?.demographics ?? [];
  if (demo.length) {
    const rows = demo.map((d) => {
      const male = Number(d.male || 0);
      const female = Number(d.female || 0);
      return { ageGroup: d.ageGroup, male, female, total: male + female };
    });
    const t = rows.reduce(
      (s, r) => ({ male: s.male + r.male, female: s.female + r.female, total: s.total + r.total }),
      { male: 0, female: 0, total: 0 },
    );
    addTableSheet(wb, {
      name: "Demographics",
      accent: "#a855f7",
      title: "Referral Demographics",
      subtitle: "Referrals by age group and gender.",
      columns: [
        { key: "ageGroup", label: "Age Group", type: "text" },
        { key: "male", label: "Male", type: "int" },
        { key: "female", label: "Female", type: "int" },
        { key: "total", label: "Total", type: "int" },
      ],
      rows,
      totalRow: { ageGroup: "Total", ...t },
    });
  }

  // ── Location × Specialty (crosstab, top-N specialties) ──────────────────
  const locData: any[] = charts?.locationBySpecialty ?? [];
  const topSpecs: string[] = charts?.topBarSpecialties ?? [];
  if (locData.length && topSpecs.length) {
    const columns: Col[] = [
      { key: "location", label: "Location", type: "text", width: 24 },
      ...topSpecs.map((sp) => ({ key: `sp__${sp}`, label: sp, type: "int" as ColType })),
      { key: "rowTotal", label: "Total", type: "int" },
    ];
    const rows = locData.map((r) => {
      const out: Record<string, unknown> = { location: r.location };
      let rowTotal = 0;
      for (const sp of topSpecs) {
        const v = Number(r[sp] || 0);
        out[`sp__${sp}`] = v;
        rowTotal += v;
      }
      out.rowTotal = rowTotal;
      return out;
    });
    const totalRow: Record<string, unknown> = { location: "Total" };
    let grand = 0;
    for (const sp of topSpecs) {
      const colSum = rows.reduce((s, r) => s + Number(r[`sp__${sp}`] || 0), 0);
      totalRow[`sp__${sp}`] = colSum;
      grand += colSum;
    }
    totalRow.rowTotal = grand;
    addTableSheet(wb, {
      name: "Location by Specialty",
      accent: "#0ea5e9",
      title: "Referral Volume by Location & Specialty",
      subtitle: "Referrals per location broken out by specialty (top specialties; remaining locations rolled into 'Others').",
      columns,
      rows,
      totalRow,
      freezeFirstCol: true,
    });
  }

  // ── "Others" location breakdown (rolled-up tail) ────────────────────────
  const others: any[] = charts?.othersBreakdown ?? [];
  if (others.length) {
    const rows = others.map((o) => ({ location: o.location, total: Number(o.total || 0) }));
    addTableSheet(wb, {
      name: "Others Locations",
      accent: "#f59e0b",
      title: "Others — Location Breakdown",
      subtitle: "Individual locations rolled into the 'Others' bucket on the Location × Specialty chart.",
      columns: [
        { key: "location", label: "Location", type: "text", width: 30 },
        { key: "total", label: "Referrals", type: "int" },
      ],
      rows,
      totalRow: { location: "Total", total: rows.reduce((s, r) => s + r.total, 0) },
    });
  }

  // ── download ────────────────────────────────────────────────────────────
  const tag = [meta.cugCode || "referral", meta.dateFrom, meta.dateTo].filter(Boolean).join("_");
  await downloadWorkbook(wb, `Referral_${tag || "export"}.xlsx`);
}
