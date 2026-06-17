"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { T } from "@/lib/ui/theme";
import { useAuth } from "@/lib/contexts/auth-context";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { useChartVisibility } from "@/lib/hooks/useChartVisibility";
import { ChartComments } from "@/components/ui/chart-comments";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import DataAuditSection from "@/components/audit/DataAuditSection";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Maximize2, Minimize2, Table2, BarChart3, RotateCcw } from "lucide-react";
import type { PageConfig } from "@/lib/types/dashboard-config";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const SLUG = "/portal/past-data";
const fmt = (n: number) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-IN"));
const PANELS = ["Glycemic", "Lipid Profile", "Thyroid", "Liver Function", "Kidney Function", "Haematology", "Vitals"];

type Prog = { param: string; panel: string; direction: string; cohort: number; avgOld: number; avgNew: number; delta: number; pctChange: number; improved: boolean | null };

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5" }: { color?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${color})` }} />;
}

// ─── Card (matches OHC Utilization CVCard) ───
function CVCard({
  children, accentColor, title, subtitle, tooltipText, expandable = true, chartId, chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; accentColor?: string; title?: string; subtitle?: string; tooltipText?: string;
  expandable?: boolean; chartId?: string; chartData?: unknown; chartTitle?: string; chartDescription?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div data-chart-card className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col ${expanded ? "col-span-full" : ""}`} style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
      {(title || accentColor) && (
        <div className="px-6 pt-5 pb-1">
          {accentColor && <AccentBar color={accentColor} />}
          {title && (
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{title}</h3>
                  {tooltipText && (
                    <Tooltip>
                      <TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{tooltipText}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {subtitle && <p className="text-[13px] mt-0.5" style={{ color: T.textSecondary }}>{subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {chartId && <ChartComments chartId={chartId} pageSlug={SLUG} />}
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
                {expandable && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: T.textMuted }} onClick={() => setExpanded(!expanded)}>
                    {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div data-chart-body className="px-6 pb-5 pt-3 flex-1 flex flex-col">{children}</div>
    </div>
  );
}

function WarmSection({ children }: { children: React.ReactNode }) {
  return <div className="p-6 sm:p-7" style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>{children}</div>;
}

// % change bars + grouped table for a value-progression set.
function ProgressionPanel({ rows }: { rows: Prog[] }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pctChange)));
  const color = (r: Prog) => (r.improved == null ? "#9CA3AF" : r.improved ? "#0d9488" : "#dc2626");
  const byPanel = PANELS.map((p) => ({ panel: p, items: rows.filter((r) => r.panel === p) })).filter((g) => g.items.length);
  return (
    <div className="space-y-5">
      {byPanel.map((g) => (
        <div key={g.panel}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#4f46e5" }}>{g.panel}</span>
            <span className="text-[10px]" style={{ color: T.textMuted }}>{g.items.length} parameters</span>
          </div>
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                <th className="text-left py-1.5 pr-3 font-semibold" style={{ color: T.textSecondary }}>Parameter</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ color: T.textSecondary }}>Then</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ color: T.textSecondary }}>Now</th>
                <th className="text-right py-1.5 px-2 font-semibold" style={{ color: T.textSecondary }}>Δ%</th>
                <th className="py-1.5 px-2 font-semibold text-left" style={{ color: T.textSecondary, width: 160 }}>Change</th>
                <th className="text-right py-1.5 pl-2 font-semibold" style={{ color: T.textMuted }}>n</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((r) => {
                const w = (Math.abs(r.pctChange) / maxAbs) * 100;
                return (
                  <tr key={r.param} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                    <td className="py-1.5 pr-3" style={{ color: T.textPrimary }}>{r.param}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums" style={{ color: T.textSecondary }}>{r.avgOld}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: T.textPrimary }}>{r.avgNew}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold" style={{ color: color(r) }}>{r.pctChange > 0 ? "+" : ""}{r.pctChange}%</td>
                    <td className="py-1.5 px-2">
                      <div className="relative h-[7px] rounded" style={{ backgroundColor: "#F1F3F9" }}>
                        <div className="absolute top-0 h-[7px] rounded" style={{ left: "50%", width: `${w / 2}%`, transform: r.pctChange < 0 ? "translateX(-100%)" : "none", backgroundColor: color(r) }} />
                      </div>
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums" style={{ color: T.textMuted }}>{fmt(r.cohort)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-[11px]" style={{ color: T.textMuted }}>Green = improved · Red = worsened · Grey = no clear better-direction (e.g. TSH, WBC). Then = most-recent old reading, Now = most-recent new, per patient with both.</p>
    </div>
  );
}

// Band transition body: Sankey + matrix table.
function TransitionBody({ m }: { m: any }) {
  const cats: string[] = m?.categories || [];
  const matrix: number[][] = m?.matrix || [];
  const palette = ["#0d9488", "#6366f1", "#f59e0b", "#dc2626"];
  const nodes = [...cats.map((c) => ({ name: `Then: ${c}` })), ...cats.map((c) => ({ name: `Now: ${c}` }))];
  const links: { source: number; target: number; value: number }[] = [];
  cats.forEach((_, i) => cats.forEach((__, j) => { const v = matrix[i]?.[j] || 0; if (v > 0) links.push({ source: i, target: cats.length + j, value: v }); }));
  const option = {
    tooltip: { trigger: "item", triggerOn: "mousemove" },
    series: [{ type: "sankey", left: 8, right: 8, top: 10, bottom: 10, nodeWidth: 14, nodeGap: 12, emphasis: { focus: "adjacency" },
      data: nodes.map((n, i) => ({ name: n.name, itemStyle: { color: palette[(i % cats.length) % palette.length] } })),
      links, lineStyle: { color: "gradient", opacity: 0.4 }, label: { fontSize: 11, color: T.textPrimary } }],
  };
  if ((m?.total || 0) === 0) return <div className="flex items-center justify-center h-40 text-[13px]" style={{ color: T.textMuted }}>No data for this metric.</div>;
  return (
    <>
      <div style={{ height: 260 }}><ReactECharts option={option} style={{ height: "100%", width: "100%" }} /></div>
      <div className="overflow-auto mt-3">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <th className="text-left py-2 px-3 font-semibold" style={{ color: T.textSecondary }}>Then ↓ / Now →</th>
              {cats.map((c) => <th key={c} className="text-right py-2 px-3 font-semibold whitespace-nowrap" style={{ color: T.textSecondary }}>{c}</th>)}
              <th className="text-right py-2 px-3 font-semibold" style={{ color: T.textMuted }}>Then total</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((rc, i) => (
              <tr key={rc} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                <td className="py-2 px-3 font-semibold" style={{ color: T.textPrimary }}>{rc}</td>
                {cats.map((__, j) => <td key={j} className="py-2 px-3 text-right tabular-nums" style={{ color: i === j ? T.textMuted : T.textPrimary, fontWeight: i === j ? 400 : 600 }}>{fmt(matrix[i]?.[j] || 0)}</td>)}
                <td className="py-2 px-3 text-right tabular-nums" style={{ color: T.textSecondary }}>{fmt(m.thenTotals[i])}</td>
              </tr>
            ))}
            <tr style={{ backgroundColor: "#F5F6FA" }}>
              <td className="py-2 px-3 font-bold" style={{ color: T.textPrimary }}>Now total</td>
              {cats.map((__, j) => <td key={j} className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: T.textPrimary }}>{fmt(m.nowTotals[j])}</td>)}
              <td className="py-2 px-3 text-right tabular-nums font-bold" style={{ color: T.textPrimary }}>{fmt(m.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Member Health Journey: column mini-charts per condition, paged quarters ───
const QPAGE = 3; // quarters shown per page (oldest first); "Then" stays pinned
const shortQ = (q: string) => { const [y, qq] = (q || "").split("-"); return qq ? `${qq}'${y.slice(2)}` : q; }; // 2026-Q1 → Q1'26
type Col = { label: string; pct: number; count: number; color: string; delta: number | null }; // delta = relative % vs previous bar

const C_BASE = "#cbd5e1", C_DOWN = "#0d9488", C_UP = "#dc2626", C_FLAT = "#94a3b8";

// Vertical column chart: every bar shows count + %, a vs-previous-bar delta, and is coloured by that comparison.
function ColumnChart({ columns }: { columns: Col[] }) {
  const max = Math.max(1, ...columns.map((c) => c.pct));
  return (
    <div>
      <div className="flex justify-around gap-2">
        {columns.map((col, i) => (
          <div key={i} className="flex-1 flex flex-col items-center" title={`${col.label}: ${fmt(col.count)} members (${col.pct}%)`}>
            {/* numbers block (fixed height so bars align) */}
            <div className="h-[40px] flex flex-col items-center justify-end leading-none">
              {col.delta != null ? (
                <span className="text-[10px] font-bold mb-1" style={{ color: col.delta < 0 ? C_DOWN : col.delta > 0 ? C_UP : C_FLAT }}>
                  {col.delta < 0 ? "▼" : col.delta > 0 ? "▲" : ""}{Math.abs(Math.round(col.delta))}%
                </span>
              ) : <span className="text-[9px] mb-1" style={{ color: T.textMuted }}>baseline</span>}
              <span className="text-[13px] font-extrabold tabular-nums" style={{ color: T.textPrimary }}>{fmt(col.count)}</span>
              <span className="text-[9.5px] tabular-nums" style={{ color: T.textMuted }}>{col.pct}%</span>
            </div>
            {/* bar zone (fixed height) */}
            <div className="w-full flex items-end justify-center" style={{ height: 82 }}>
              <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(3, (col.pct / max) * 100)}%`, maxWidth: 40, backgroundColor: col.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-around gap-2 mt-2 pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
        {columns.map((col, i) => <span key={i} className="flex-1 text-center text-[10px] font-semibold tabular-nums" style={{ color: T.textSecondary }}>{col.label}</span>)}
      </div>
    </div>
  );
}

function JourneyCard({ c, tab, offset }: { c: any; tab: "tracked" | "new"; offset: number }) {
  const allQ: any[] = (tab === "tracked" ? c.tracked?.quarters : c.new?.quarters) ?? [];

  // Full chronological sequence (Then pinned for tracked), so vs-previous deltas/colours
  // stay correct even when the visible window is paged forward.
  const seq: Col[] = [];
  if (tab === "tracked") seq.push({ label: "Then", pct: c.tracked.then.pct, count: c.tracked.then.positive, color: C_BASE, delta: null });
  allQ.forEach((q) => seq.push({ label: shortQ(q.quarter), pct: q.pct, count: q.positive, color: C_BASE, delta: null }));
  // Now = most-recent-new per patient over the both-cohort (pinned at the end, tracked tab).
  if (tab === "tracked") seq.push({ label: "Now", pct: c.tracked.now.pct, count: c.tracked.now.positive, color: C_BASE, delta: null });
  seq.forEach((col, i) => {
    if (i === 0) { col.color = C_BASE; col.delta = null; return; }
    const prev = seq[i - 1];
    col.delta = prev.pct > 0 ? ((col.pct - prev.pct) / prev.pct) * 100 : (col.pct > 0 ? 100 : 0);
    col.color = col.pct < prev.pct ? C_DOWN : col.pct > prev.pct ? C_UP : C_FLAT;
  });

  // Visible window: Then + paged quarters + Now, with Then and Now pinned (tracked).
  const quartersOnly = tab === "tracked" ? seq.slice(1, seq.length - 1) : seq;
  const nowCol = tab === "tracked" ? seq[seq.length - 1] : null;
  const columns: Col[] = [
    ...(tab === "tracked" ? [seq[0]] : []),
    ...quartersOnly.slice(offset, offset + QPAGE),
    ...(nowCol ? [nowCol] : []),
  ];

  // Overall headline badge (Then→Now for tracked; first→latest quarter for new).
  const start = tab === "tracked" ? c.tracked.then : allQ[0];
  const end = tab === "tracked" ? c.tracked.now : allQ[allQ.length - 1];
  const empty = !start || !end || quartersOnly.length === 0;
  const overall = empty ? 0 : start.positive - end.positive;
  const badge = empty ? null : overall === 0 ? { t: "no change", c: T.textMuted, b: "#F1F3F9" } : overall > 0 ? { t: `${fmt(overall)} fewer ✓`, c: "#0f766e", b: "#ecfdf5" } : { t: `${fmt(-overall)} more`, c: "#b91c1c", b: "#fef2f2" };

  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fff" }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{c.label}</div>
          <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-md mt-1 tabular-nums" style={{ color: "#4338ca", backgroundColor: "#EEF2FF" }}>{c.threshold}</span>
        </div>
        {badge && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ color: badge.c, backgroundColor: badge.b }}>{badge.t}</span>}
      </div>
      {empty || columns.length === 0 ? (
        <div className="text-[12px] py-6 text-center" style={{ color: T.textMuted }}>No new-member readings yet.</div>
      ) : (
        <ColumnChart columns={columns} />
      )}
    </div>
  );
}

function MemberJourney({ journey }: { journey: any[] }) {
  const [tab, setTab] = useState<"tracked" | "new">("tracked");
  const [offset, setOffset] = useState(0);
  const list = journey ?? [];
  const maxQ = Math.max(0, ...list.map((c) => ((tab === "tracked" ? c.tracked?.quarters : c.new?.quarters) ?? []).length));
  const canPrev = offset > 0;
  const canNext = offset + QPAGE < maxQ;

  const TabBtn = ({ id, label }: { id: "tracked" | "new"; label: string }) => (
    <button onClick={() => { setTab(id); setOffset(0); }} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors" style={tab === id ? { backgroundColor: "#4f46e5", color: "#fff" } : { backgroundColor: "#F1F3F9", color: T.textSecondary }}>{label}</button>
  );
  const PageBtn = ({ dir, disabled, children }: { dir: "prev" | "next"; disabled: boolean; children: React.ReactNode }) => (
    <button disabled={disabled} onClick={() => setOffset((o) => Math.max(0, o + (dir === "next" ? QPAGE : -QPAGE)))}
      className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ backgroundColor: "#F1F3F9", color: T.textSecondary }}>{children}</button>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <TabBtn id="tracked" label="Then → Now" />
          <TabBtn id="new" label="New members only" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: T.textMuted }}>{maxQ > QPAGE ? `quarters ${offset + 1}–${Math.min(offset + QPAGE, maxQ)} of ${maxQ}` : "quarterly"}</span>
          <PageBtn dir="prev" disabled={!canPrev}>◂ Prev</PageBtn>
          <PageBtn dir="next" disabled={!canNext}>Next ▸</PageBtn>
        </div>
      </div>
      {tab === "new" && <p className="text-[12px] mb-3" style={{ color: T.textMuted }}>New members have no past baseline — columns show their quarterly progression (oldest first).</p>}

      {/* How to read each bar */}
      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}` }}>
        <div className="text-[12px] font-bold mb-2.5" style={{ color: T.textPrimary }}>How to read each bar</div>
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              <th className="text-left font-semibold py-1.5 pr-4 w-[120px]" style={{ color: T.textSecondary }}>What you see</th>
              <th className="text-left font-semibold py-1.5" style={{ color: T.textSecondary }}>Means</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td className="py-2 pr-4"><span className="text-[15px] font-extrabold tabular-nums" style={{ color: T.textPrimary }}>175</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}>The <b>number of members</b> above the threshold (i.e. who have the condition) at that point.</td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td className="py-2 pr-4"><span className="text-[13px] font-bold tabular-nums" style={{ color: T.textMuted }}>16.3%</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}>That count as a <b>share of the members measured</b> (e.g. 175 of 1,075 tracked = 16.3%). The bar height tracks this.</td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td className="py-2 pr-4"><span className="text-[12px] font-bold" style={{ color: C_DOWN }}>▼12%</span> <span className="text-[12px] font-bold" style={{ color: C_UP }}>▲8%</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}><b>Change vs the previous bar</b> — <span style={{ color: C_DOWN }}>teal ▼ = fewer (better)</span>, <span style={{ color: C_UP }}>red ▲ = more</span>. The bar takes that colour too.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4"><span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>baseline</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}>The first <b>"Then"</b> bar (each member's most-recent past reading) — nothing earlier to compare against.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {list.map((c) => <JourneyCard key={c.key} c={c} tab={tab} offset={offset} />)}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 text-[11px]" style={{ color: T.textMuted, borderTop: `1px solid ${T.borderLight}` }}>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#cbd5e1" }} /> baseline</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#0d9488" }} /> ▼ fewer than previous bar (better)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#dc2626" }} /> ▲ more than previous bar</span>
        <span>· each bar = members above the threshold (count + %); ▲▼ = change vs the previous bar</span>
      </div>
    </div>
  );
}

// ─── Value Progression: quarter-by-quarter average values (zoomed bars + normal line) ───
const PANEL_ORDER = ["Glycemic", "Lipid Profile", "Thyroid", "Liver Function", "Kidney Function", "Haematology", "Vitals"];
// Per-parameter unit + healthy threshold (line). Comparator derived from the param's better-direction.
const PARAM_META: Record<string, { unit?: string; normal?: number }> = {
  "HbA1c": { unit: "%", normal: 5.7 },
  "Glucose (Fasting)": { unit: "mg/dL", normal: 100 },
  "Glucose (PP)": { unit: "mg/dL", normal: 140 },
  "Cholesterol (Total)": { unit: "mg/dL", normal: 200 },
  "LDL": { unit: "mg/dL", normal: 100 },
  "HDL": { unit: "mg/dL", normal: 40 },
  "VLDL": { unit: "mg/dL", normal: 30 },
  "Triglycerides": { unit: "mg/dL", normal: 150 },
  "LDL/HDL Ratio": { unit: "", normal: 3.5 },
  "TSH": { unit: "mIU/L" },
  "Thyroxine (T4)": { unit: "µg/dL" },
  "T3 Uptake": { unit: "%" },
  "Albumin": { unit: "g/dL", normal: 3.5 },
  "Globulin": { unit: "g/dL" },
  "Total Proteins": { unit: "g/dL" },
  "Bilirubin (Total)": { unit: "mg/dL", normal: 1.2 },
  "SGPT / ALT": { unit: "U/L", normal: 45 },
  "SGOT / AST": { unit: "U/L", normal: 40 },
  "Alk. Phosphatase": { unit: "U/L", normal: 120 },
  "GGTP": { unit: "U/L", normal: 55 },
  "Creatinine": { unit: "mg/dL", normal: 1.3 },
  "Blood Urea": { unit: "mg/dL", normal: 40 },
  "BUN": { unit: "mg/dL", normal: 20 },
  "Uric Acid": { unit: "mg/dL", normal: 7 },
  "Haemoglobin": { unit: "g/dL", normal: 12 },
  "WBC": { unit: "/µL" },
  "BMI": { unit: "", normal: 25 },
  "BP (Systolic)": { unit: "mmHg", normal: 130 },
  "BP (Diastolic)": { unit: "mmHg", normal: 85 },
  "Weight": { unit: "kg" },
  "SPO2": { unit: "%", normal: 95 },
};
const dirColor = (change: number, dir: string) => {
  if (dir === "neutral" || change === 0) return C_FLAT;
  const improved = dir === "lower" ? change < 0 : change > 0;
  return improved ? C_DOWN : C_UP;
};
const num1 = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1));

type VCol = { label: string; value: number; n: number; color: string; delta: number | null };

function ValueColumnChart({ columns, normal, normalText, large }: { columns: VCol[]; normal?: number; normalText?: string; large?: boolean }) {
  const vals = columns.map((c) => c.value);
  const lo0 = Math.min(...vals, normal ?? Infinity);
  const hi0 = Math.max(...vals, normal ?? -Infinity);
  const pad = Math.max(0.4, (hi0 - lo0) * 0.18);
  const yMin = lo0 - pad, yMax = hi0 + pad;
  const h = (v: number) => Math.max(2, ((v - yMin) / (yMax - yMin)) * 100);
  const barH = large ? 200 : 80, numH = large ? 52 : 40, maxBarW = large ? 64 : 40;
  return (
    <div>
      <div className="flex justify-around gap-2">
        {columns.map((col, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end leading-none" style={{ height: numH }}>
            {col.delta != null ? (
              <span className={`${large ? "text-[12px]" : "text-[10px]"} font-bold mb-1`} style={{ color: col.color }}>{col.delta < 0 ? "▼" : col.delta > 0 ? "▲" : ""}{num1(Math.abs(col.delta))}</span>
            ) : <span className={`${large ? "text-[10px]" : "text-[9px]"} mb-1`} style={{ color: T.textMuted }}>baseline</span>}
            <span className={`${large ? "text-[18px]" : "text-[13px]"} font-extrabold tabular-nums`} style={{ color: T.textPrimary }}>{num1(col.value)}</span>
            <span className={`${large ? "text-[10.5px]" : "text-[9px]"} tabular-nums`} style={{ color: T.textMuted }}>n={fmt(col.n)}</span>
          </div>
        ))}
      </div>
      <div className="relative" style={{ height: barH }}>
        {normal != null && (
          <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ bottom: `${Math.max(0, Math.min(100, ((normal - yMin) / (yMax - yMin)) * 100))}%`, borderTop: "1px dashed #94a3b8" }}>
            <span className="absolute right-0 -top-[7px] text-[9px] px-1 font-semibold" style={{ color: "#64748b", backgroundColor: "#fff" }}>normal {normalText}</span>
          </div>
        )}
        <div className="flex items-end justify-around gap-2 h-full">
          {columns.map((col, i) => (
            <div key={i} className="flex-1 flex items-end justify-center h-full" title={`${col.label}: ${num1(col.value)} (n=${fmt(col.n)})`}>
              <div className="w-full rounded-t-[3px]" style={{ height: `${h(col.value)}%`, maxWidth: maxBarW, backgroundColor: col.color }} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-around gap-2 mt-2 pt-2" style={{ borderTop: `1px solid ${T.border}` }}>
        {columns.map((col, i) => <span key={i} className={`flex-1 text-center ${large ? "text-[11px]" : "text-[10px]"} font-semibold tabular-nums`} style={{ color: T.textSecondary }}>{col.label}</span>)}
      </div>
    </div>
  );
}

function ValueCard({ p, tab, offset, large }: { p: any; tab: "tracked" | "new"; offset: number; large?: boolean }) {
  const allQ: any[] = (tab === "tracked" ? p.series?.tracked : p.series?.new) ?? [];
  const dir: string = p.direction || "neutral";
  const meta = PARAM_META[p.param] || {};
  const normalText = meta.normal == null ? undefined : `${dir === "higher" ? "≥" : "≤"} ${num1(meta.normal)}`;

  // Full chronological sequence (Then pinned for tracked), deltas vs previous bar.
  const hasThen = tab === "tracked" && p.baselineOld != null;
  const hasNow = tab === "tracked" && p.baselineNew != null;
  const seq: VCol[] = [];
  if (hasThen) seq.push({ label: "Then", value: Number(p.baselineOld), n: Number(p.baselineN) || 0, color: C_BASE, delta: null });
  allQ.forEach((q) => seq.push({ label: shortQ(q.quarter), value: Number(q.avg), n: Number(q.n), color: C_BASE, delta: null }));
  // Now = mean of each patient's most-recent NEW value over the both-cohort (pinned at end).
  if (hasNow) seq.push({ label: "Now", value: Number(p.baselineNew), n: Number(p.baselineN) || 0, color: C_BASE, delta: null });
  seq.forEach((col, i) => {
    if (i === 0) { col.color = C_BASE; col.delta = null; return; }
    const change = col.value - seq[i - 1].value;
    col.delta = change;
    col.color = dirColor(change, dir);
  });

  const quartersOnly = seq.slice(hasThen ? 1 : 0, hasNow ? seq.length - 1 : seq.length);
  const nowCol = hasNow ? seq[seq.length - 1] : null;
  const columns: VCol[] = [
    ...(hasThen ? [seq[0]] : []),
    ...quartersOnly.slice(offset, offset + QPAGE),
    ...(nowCol ? [nowCol] : []),
  ];
  const empty = seq.length < (tab === "tracked" ? 2 : 1) || quartersOnly.length === 0;

  // Overall first→last badge.
  const first = seq[0], last = seq[seq.length - 1];
  const oChange = empty ? 0 : last.value - first.value;
  const oColor = dirColor(oChange, dir);
  const dirChip = dir === "neutral" ? null : dir === "lower" ? "lower is better" : "higher is better";

  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fff" }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{p.param} {meta.unit ? <span className="text-[10.5px] font-medium" style={{ color: T.textMuted }}>· {meta.unit}</span> : null}</div>
          {dirChip && <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1" style={{ color: "#4338ca", backgroundColor: "#EEF2FF" }}>{dirChip}</span>}
        </div>
        {!empty && oChange !== 0 && dir !== "neutral" && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ color: oColor === C_DOWN ? "#0f766e" : "#b91c1c", backgroundColor: oColor === C_DOWN ? "#ecfdf5" : "#fef2f2" }}>
            {oChange < 0 ? "▼" : "▲"}{num1(Math.abs(oChange))} {oColor === C_DOWN ? "better" : "worse"}
          </span>
        )}
      </div>
      {empty || columns.length === 0 ? (
        <div className="text-[12px] py-6 text-center" style={{ color: T.textMuted }}>No data yet.</div>
      ) : (
        <ValueColumnChart columns={columns} normal={meta.normal} normalText={normalText} large={large} />
      )}
    </div>
  );
}

function ValueJourney({ params }: { params: any[] }) {
  const [tab, setTab] = useState<"tracked" | "new">("tracked");
  const [offset, setOffset] = useState(0);
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const list = params ?? [];
  const byPanel = PANEL_ORDER.map((panel) => ({ panel, items: list.filter((p) => p.panel === panel) })).filter((g) => g.items.length);
  const curPanel = byPanel.find((g) => g.panel === selectedPanel) || byPanel[0];
  const items: any[] = curPanel?.items ?? [];
  const maxQ = Math.max(0, ...items.map((p) => ((tab === "tracked" ? p.series?.tracked : p.series?.new) ?? []).length));
  const canPrev = offset > 0;
  const canNext = offset + QPAGE < maxQ;

  const TabBtn = ({ id, label }: { id: "tracked" | "new"; label: string }) => (
    <button onClick={() => { setTab(id); setOffset(0); }} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors" style={tab === id ? { backgroundColor: "#4f46e5", color: "#fff" } : { backgroundColor: "#F1F3F9", color: T.textSecondary }}>{label}</button>
  );
  const PageBtn = ({ dir, disabled, children }: { dir: "prev" | "next"; disabled: boolean; children: React.ReactNode }) => (
    <button disabled={disabled} onClick={() => setOffset((o) => Math.max(0, o + (dir === "next" ? QPAGE : -QPAGE)))} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: "#F1F3F9", color: T.textSecondary }}>{children}</button>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold" style={{ color: T.textSecondary }}>Panel</span>
          <select value={curPanel?.panel ?? ""} onChange={(e) => { setSelectedPanel(e.target.value); setOffset(0); }} className="h-8 px-2.5 rounded-lg border text-[12.5px] font-medium bg-white outline-none cursor-pointer" style={{ borderColor: T.border, color: T.textPrimary, minWidth: 190 }}>
            {byPanel.map((g) => <option key={g.panel} value={g.panel}>{g.panel} ({g.items.length})</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <TabBtn id="tracked" label="Then → Now" />
          <TabBtn id="new" label="New members only" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: T.textMuted }}>{maxQ > QPAGE ? `quarters ${offset + 1}–${Math.min(offset + QPAGE, maxQ)} of ${maxQ}` : "quarterly"}</span>
          <PageBtn dir="prev" disabled={!canPrev}>◂ Prev</PageBtn>
          <PageBtn dir="next" disabled={!canNext}>Next ▸</PageBtn>
        </div>
      </div>
      {tab === "new" && <p className="text-[12px] mb-3" style={{ color: T.textMuted }}>New members have no past baseline — columns show their quarterly average (oldest first).</p>}

      {/* How to read each bar */}
      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}` }}>
        <div className="text-[12px] font-bold mb-2.5" style={{ color: T.textPrimary }}>How to read each bar</div>
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td className="py-2 pr-4 w-[120px]"><span className="text-[15px] font-extrabold tabular-nums" style={{ color: T.textPrimary }}>5.9</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}>The <b>average value</b> for that group at that point (e.g. average HbA1c). <span style={{ color: T.textMuted }}>n = members measured.</span></td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td className="py-2 pr-4"><span className="text-[12px] font-bold" style={{ color: C_DOWN }}>▼0.2</span> <span className="text-[12px] font-bold" style={{ color: C_UP }}>▲0.3</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}><b>Change vs the previous bar</b>, coloured by the <b>healthy direction</b> for that metric — <span style={{ color: C_DOWN }}>teal = moved the right way</span>, <span style={{ color: C_UP }}>red = wrong way</span>. The bar takes that colour.</td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
              <td className="py-2 pr-4"><span className="text-[11px] font-semibold" style={{ color: "#64748b" }}>- - normal</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}>The <b>healthy threshold</b> line — bars on the at-risk side of it are outside the normal range.</td>
            </tr>
            <tr>
              <td className="py-2 pr-4"><span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>baseline</span></td>
              <td className="py-2" style={{ color: T.textSecondary }}>The first <b>"Then"</b> bar (each member's most-recent past reading) — nothing earlier to compare against.</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[10.5px] mt-2" style={{ color: T.textMuted }}>Bars are zoomed to show movement (the value labels are exact); the normal line keeps the scale honest.</p>
      </div>

      {items.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((p) => <ValueCard key={p.param} p={p} tab={tab} offset={offset} />)}
        </div>
      ) : <div className="text-[13px] py-8 text-center" style={{ color: T.textMuted }}>No parameters available.</div>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 text-[11px]" style={{ color: T.textMuted, borderTop: `1px solid ${T.borderLight}` }}>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#cbd5e1" }} /> baseline</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#0d9488" }} /> moved the healthy way</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#dc2626" }} /> moved the wrong way</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#94a3b8" }} /> neutral metric</span>
      </div>
    </div>
  );
}

// ─── Band Distribution: waffle (100-dot) grids across Then → quarters ───
const BAND_COLOR: Record<string, string> = {
  Normal: "#10b981", Underweight: "#60a5fa",
  "Pre-diabetic": "#f59e0b", Overweight: "#f59e0b", Elevated: "#f59e0b",
  Diabetic: "#ef4444", Obese: "#ef4444", Hypertension: "#ef4444",
  // appointment statuses
  Completed: "#10b981", Pending: "#f59e0b", "No Show": "#ef4444", Cancelled: "#64748b",
};
// 100-dot allocation by largest-remainder so dots sum to exactly 100.
function allocate(counts: number[], total: number, dots = 100): number[] {
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * dots);
  const floors = raw.map(Math.floor);
  const rem = dots - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem && order.length; k++) floors[order[k % order.length].i]++;
  return floors;
}

function Waffle({ point, categories, healthyLabel = "Normal", healthyWord = "normal" }: { point: any; categories: string[]; healthyLabel?: string; healthyWord?: string }) {
  const alloc = allocate(point.counts, point.total);
  const dots: string[] = [];
  categories.forEach((cat, ci) => { for (let k = 0; k < alloc[ci]; k++) dots.push(BAND_COLOR[cat] || "#cbd5e1"); });
  while (dots.length < 100) dots.push("#e5e7eb");
  const normIdx = Math.max(0, categories.indexOf(healthyLabel));
  const healthyPct = point.total ? Math.round((point.counts[normIdx] / point.total) * 100) : 0;
  const tip = categories.map((c, i) => `${c}: ${fmt(point.counts[i])} (${point.total ? Math.round((point.counts[i] / point.total) * 100) : 0}%)`).join("\n");
  return (
    <div className="flex flex-col items-center shrink-0" title={tip}>
      <div className="grid" style={{ gridTemplateColumns: "repeat(10, 13px)", gap: 2.5 }}>
        {dots.map((c, i) => <div key={i} style={{ width: 13, height: 13, borderRadius: "50%", backgroundColor: c }} />)}
      </div>
      <span className="text-[12px] font-bold mt-2.5 tabular-nums" style={{ color: T.textSecondary }}>{point.label}</span>
      <span className="text-[13px] font-extrabold tabular-nums" style={{ color: "#0d9488" }}>{healthyPct}% {healthyWord}</span>
      <span className="text-[10px] tabular-nums" style={{ color: T.textMuted }}>n={fmt(point.total)}</span>
    </div>
  );
}

function BandSection({ metric, tab, offset }: { metric: any; tab: "tracked" | "new"; offset: number }) {
  const all: any[] = (tab === "tracked" ? metric.tracked : metric.new) ?? [];
  const isThen = tab === "tracked" && all[0]?.label === "Then";
  const isNow = tab === "tracked" && all[all.length - 1]?.label === "Now";
  const quarters = all.slice(isThen ? 1 : 0, isNow ? all.length - 1 : all.length);
  const points = [
    ...(isThen ? [all[0]] : []),
    ...quarters.slice(offset, offset + QPAGE),
    ...(isNow ? [all[all.length - 1]] : []),
  ];
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[14px] font-bold" style={{ color: T.textPrimary }}>{metric.title}</span>
        <span className="text-[11px]" style={{ color: T.textMuted }}>{metric.note}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mb-4">
        {metric.categories.map((c: string) => (
          <span key={c} className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: BAND_COLOR[c] || "#cbd5e1", display: "inline-block" }} />{c}
          </span>
        ))}
      </div>
      {points.length ? (
        <div className="flex items-start">
          <Waffle point={points[0]} categories={metric.categories} />
          {points.slice(1).map((p, i) => (
            <div key={i} className="flex items-start flex-1 min-w-[40px]">
              <div className="flex-1 flex justify-center" style={{ marginTop: 66 }}><span className="text-[18px]" style={{ color: "#cbd5e1" }}>→</span></div>
              <Waffle point={p} categories={metric.categories} />
            </div>
          ))}
        </div>
      ) : <div className="text-[12px] py-4" style={{ color: T.textMuted }}>No data yet.</div>}
    </div>
  );
}

function BandJourney({ bands }: { bands: any[] }) {
  const [tab, setTab] = useState<"tracked" | "new">("tracked");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const current = bands.find((m) => m.key === selected) || bands[0];
  const quartersLen = (m: any) => {
    const all = (tab === "tracked" ? m.tracked : m.new) ?? [];
    let n = all.length;
    if (tab === "tracked") { if (all[0]?.label === "Then") n--; if (all[all.length - 1]?.label === "Now") n--; }
    return Math.max(0, n);
  };
  const maxQ = current ? quartersLen(current) : 0;
  const canPrev = offset > 0, canNext = offset + QPAGE < maxQ;
  const TabBtn = ({ id, label }: { id: "tracked" | "new"; label: string }) => (
    <button onClick={() => { setTab(id); setOffset(0); }} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors" style={tab === id ? { backgroundColor: "#4f46e5", color: "#fff" } : { backgroundColor: "#F1F3F9", color: T.textSecondary }}>{label}</button>
  );
  const PageBtn = ({ dir, disabled, children }: { dir: "prev" | "next"; disabled: boolean; children: React.ReactNode }) => (
    <button disabled={disabled} onClick={() => setOffset((o) => Math.max(0, o + (dir === "next" ? QPAGE : -QPAGE)))} className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed" style={{ backgroundColor: "#F1F3F9", color: T.textSecondary }}>{children}</button>
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold" style={{ color: T.textSecondary }}>Metric</span>
          <select value={current?.key ?? ""} onChange={(e) => { setSelected(e.target.value); setOffset(0); }} className="h-8 px-2.5 rounded-lg border text-[12.5px] font-medium bg-white outline-none cursor-pointer" style={{ borderColor: T.border, color: T.textPrimary, minWidth: 190 }}>
            {bands.map((m) => <option key={m.key} value={m.key}>{m.title}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <TabBtn id="tracked" label="Then → Now" />
          <TabBtn id="new" label="New members only" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: T.textMuted }}>{maxQ > QPAGE ? `quarters ${offset + 1}–${Math.min(offset + QPAGE, maxQ)} of ${maxQ}` : "quarterly"}</span>
          <PageBtn dir="prev" disabled={!canPrev}>◂ Prev</PageBtn>
          <PageBtn dir="next" disabled={!canNext}>Next ▸</PageBtn>
        </div>
      </div>
      <div className="rounded-xl p-3.5 mb-5 text-[12px]" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}`, color: T.textSecondary }}>
        <b style={{ color: T.textPrimary }}>How to read:</b> each grid = <b>100 members</b> at that point; each dot = <b>1%</b>, coloured by band. The green block is the healthy share — watch it grow across <b>Then → quarters</b>. Hover a grid for the exact split.
      </div>
      {current ? <BandSection metric={current} tab={tab} offset={offset} /> : <div className="text-[13px] py-8 text-center" style={{ color: T.textMuted }}>No metric available.</div>}
    </div>
  );
}

// ─── Appointment Outcomes: 100% stacked-area "outcome flow" over quarters ───
function ApptOutcomes({ data }: { data: any }) {
  const cats: string[] = data?.categories ?? [];
  const quarters: any[] = data?.quarters ?? [];
  if (!quarters.length) return <div className="text-[13px] py-8 text-center" style={{ color: T.textMuted }}>No appointment data.</div>;
  const xLabels = quarters.map((q) => q.label);
  const pct = (ci: number) => quarters.map((q) => (q.total ? Math.round((q.counts[ci] / q.total) * 1000) / 10 : 0));
  const series = cats.map((cat, ci) => ({
    name: cat, type: "line", smooth: true, symbol: "circle", symbolSize: 5,
    lineStyle: { width: cat === "Completed" ? 3 : 2 }, itemStyle: { color: BAND_COLOR[cat] || "#cbd5e1" },
    emphasis: { focus: "series" }, data: pct(ci),
  }));
  const option = {
    tooltip: { trigger: "axis", valueFormatter: (v: number) => `${v}%` },
    legend: { data: cats, bottom: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11, color: T.textSecondary } },
    grid: { left: 42, right: 18, top: 14, bottom: 44 },
    xAxis: { type: "category", boundaryGap: false, data: xLabels, axisLabel: { fontSize: 11, color: T.textSecondary }, axisLine: { lineStyle: { color: T.border } } },
    yAxis: { type: "value", min: 0, axisLabel: { formatter: "{value}%", fontSize: 11, color: T.textSecondary }, splitLine: { lineStyle: { color: T.borderLight } } },
    series,
  };
  const latest = quarters[quarters.length - 1];
  const latestShow = latest?.total ? Math.round((latest.counts[0] / latest.total) * 100) : 0;
  return (
    <div>
      <div className="rounded-xl p-3.5 mb-4 text-[12px]" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}`, color: T.textSecondary }}>
        <b style={{ color: T.textPrimary }}>How to read:</b> each line is an outcome's <b>share of appointments</b> that quarter. The <span style={{ color: "#059669", fontWeight: 700 }}>green Completed</span> line is the <b>show-up rate</b> — latest <b>{latestShow}%</b>. Hover any quarter for the full split.
      </div>
      <div style={{ height: 340 }}><ReactECharts option={option} style={{ height: "100%", width: "100%" }} /></div>
    </div>
  );
}

export default function PastDataPage() {
  const { activeClient } = useAuth();
  const { data, isLoading, isValidating, refresh, isRefreshing } = useDashboardData<any>("cisco/past-data");
  const [previewConfig, setPreviewConfig] = useState<PageConfig | null>(null);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const isChartVisible = useChartVisibility(SLUG, previewConfig);
  const isPreview = previewConfig != null;

  const isCisco = !activeClient || activeClient.cugCode === "CISCO01";
  const kpis = data?.kpis;

  if (!isCisco) {
    return <div className="p-10 text-center text-[14px]" style={{ color: T.textMuted }}>The Past Data dashboard is available for CISCO only.</div>;
  }
  if (isLoading && !data) {
    return <div className="animate-fade-in space-y-5"><div className="h-8 w-56 bg-gray-200 rounded animate-pulse" /><div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}</div><div className="h-[400px] bg-white rounded-2xl border animate-pulse" /></div>;
  }

  return (
    <div className="animate-fade-in animate-stagger space-y-6 relative" style={{ opacity: isValidating && !isLoading ? 0.7 : 1, transition: "opacity .2s ease" }}>
      {/* ── Toolbar (refresh + Configure), matching OHC Utilization ── */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl" style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <span className="text-[13px] font-medium" style={{ color: T.textSecondary }}>CISCO — old vs new health progression</span>
        <div className="flex-1" />
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={async () => { const ok = await refresh(); if (ok) { setShowRefreshToast(true); setTimeout(() => setShowRefreshToast(false), 3000); } }}
                disabled={isRefreshing}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors"
                style={{ borderColor: T.border, color: T.textMuted }}
              >
                <RotateCcw size={15} className={isRefreshing ? "animate-spin" : ""} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh data</TooltipContent>
          </Tooltip>
          {showRefreshToast && (
            <div className="absolute top-full right-0 mt-2 z-50 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="flex items-center gap-2 rounded-lg bg-[#111827] px-3 py-2 text-white shadow-lg whitespace-nowrap">
                <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                <span className="text-[12px] font-medium">Data refreshed</span>
              </div>
            </div>
          )}
        </div>
        <ConfigurePanel
          pageSlug={SLUG}
          pageTitle="Past Data"
          charts={[
            { id: "kpis", label: "Summary KPIs" },
            { id: "conditionPrevalence", label: "Member Health Journey" },
            { id: "labProgression", label: "Lab Value Progression" },
            { id: "vitalsProgression", label: "Vitals Value Progression" },
            { id: "glycemicTransition", label: "Glycemic Status Transition" },
            { id: "bmiTransition", label: "BMI Band Transition" },
            { id: "bpTransition", label: "Blood Pressure Stage Transition" },
            { id: "apptOutcomes", label: "Appointment Outcomes" },
          ]}
          filters={[]}
          onPreview={setPreviewConfig}
          isPreview={isPreview}
        />
      </div>

      {/* ── AI Summary card ── */}
      <PageGlanceBox
        pageTitle="Past Data — Health Progression"
        pageSubtitle="How CISCO employees' labs & vitals changed from their earlier records to now"
        kpis={kpis || {}}
        fallbackSummary={`${fmt(kpis?.labCohort || 0)} members have both past and present lab records and ${fmt(kpis?.vitalsCohort || 0)} have both for vitals — the basis for the then→now comparison. A further ${fmt(kpis?.newMembers || 0)} new members completed their first health check now, setting a baseline. ${fmt(kpis?.conditionsMonitored || 0)} clinical conditions are tracked across the cohort.`}
        fallbackChips={[
          { label: "Tracked (Labs)", value: fmt(kpis?.labCohort || 0) },
          { label: "Tracked (Vitals)", value: fmt(kpis?.vitalsCohort || 0) },
          { label: "New Members", value: fmt(kpis?.newMembers || 0) },
          { label: "Conditions", value: fmt(kpis?.conditionsMonitored || 0) },
        ]}
      />

      {/* ── KPI tiles ── */}
      {isChartVisible("kpis") && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Patients Tracked (Labs)", value: fmt(kpis?.labCohort || 0), hint: "both past & present lab records", tip: "Members with at least one lab result from before and after — the basis for every then-vs-now lab comparison (glucose, cholesterol, HbA1c, etc.).", color: "#4f46e5" },
            { label: "Patients Tracked (Vitals)", value: fmt(kpis?.vitalsCohort || 0), hint: "both past & present vitals", tip: "Members with BMI, blood-pressure or weight captured both in the past and in the current health check — the basis for the vitals then-vs-now comparison.", color: "#0d9488" },
            { label: "New Members", value: fmt(kpis?.newMembers || 0), hint: "first health check now", tip: "Members assessed for the first time in the current campaign — no past record yet, so this visit sets their baseline. Counted on vitals (broadest reach).", color: "#6366f1" },
            { label: "Conditions Monitored", value: fmt(kpis?.conditionsMonitored || 0), hint: "clinical conditions, then → now", tip: `Conditions compared past vs present: ${(kpis?.conditionsList ?? []).join(" · ")}.`, color: "#f59e0b" },
          ].map((k) => (
            <div key={k.label} className="bg-white rounded-2xl px-5 py-4" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
              <div className="flex items-center gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{k.label}</p>
                <Tooltip>
                  <TooltipTrigger className="shrink-0 inline-flex"><Info size={12} style={{ color: T.textMuted }} /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">{k.tip}</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[30px] font-extrabold mt-1.5 leading-none" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[11px] mt-1.5" style={{ color: T.textSecondary }}>{k.hint}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Member Health Journey ── */}
      {isChartVisible("conditionPrevalence") && (
        <CVCard accentColor="#4f46e5" title="Member Health Journey" subtitle="How many members are above each clinical threshold — from their past baseline, through each quarter, to now." tooltipText="Then = each member's most-recent past reading; Now = most-recent current reading; quarters in between show the path. 'New members only' shows the new cohort's progression from their first quarter (they have no past baseline)." chartId="conditionPrevalence" chartData={data?.conditionJourney} chartTitle="Member Health Journey" chartDescription="Condition prevalence then → quarterly → now, tracked & new cohorts">
          <MemberJourney journey={data?.conditionJourney ?? []} />
        </CVCard>
      )}

      {/* ── Value Progression (quarter-by-quarter, by panel) ── */}
      {(isChartVisible("labProgression") || isChartVisible("vitalsProgression")) && (
        <CVCard accentColor="#4f46e5" title="Value Progression" subtitle="Average lab & vital values, quarter by quarter, grouped by clinical panel." tooltipText="Each card is one parameter: 'Then' = most-recent past reading; then one bar per quarter. Bars are zoomed to show movement; colour follows the healthy direction for that metric." chartId="labProgression" chartData={{ labQuarterly: data?.labQuarterly, vitalsQuarterly: data?.vitalsQuarterly }} chartTitle="Value Progression" chartDescription="Quarter-by-quarter average lab & vital values, tracked & new cohorts">
          <ValueJourney params={[...(isChartVisible("labProgression") ? (data?.labQuarterly ?? []) : []), ...(isChartVisible("vitalsProgression") ? (data?.vitalsQuarterly ?? []) : [])]} />
        </CVCard>
      )}

      {/* ── Health Band Distribution (waffle grids, Then → quarterly) ── */}
      {(isChartVisible("glycemicTransition") || isChartVisible("bmiTransition") || isChartVisible("bpTransition")) && (
        <CVCard accentColor="#0d9488" title="Health Band Distribution — Then → Now" subtitle="Share of members in each health band, quarter by quarter. Each grid is 100 members; the green block is the healthy share." tooltipText="Each dot = 1% of the members measured at that point, coloured by band. Watch the green (normal) block grow across Then → quarters. BP band uses systolic thresholds." chartId="glycemicTransition" chartData={data?.bandJourney} chartTitle="Health Band Distribution" chartDescription="Glycemic / BMI / BP band share over Then and quarters">
          <BandJourney bands={[
            isChartVisible("glycemicTransition") && data?.bandJourney?.glycemic,
            isChartVisible("bmiTransition") && data?.bandJourney?.bmi,
            isChartVisible("bpTransition") && data?.bandJourney?.bp,
          ].filter(Boolean)} />
        </CVCard>
      )}

      {/* ── Appointment Outcomes (waffle per quarter) ── */}
      {isChartVisible("apptOutcomes") && (
        <CVCard accentColor="#6366f1" title="Appointment Outcomes — by quarter" subtitle="Share of appointments by outcome each quarter — the green Completed line is the show-up rate." tooltipText="Each line is a status's share of that quarter's appointments. The 12 raw stages collapse to 4: Completed (+ Prescription Sent, Re Open), Pending (Rescheduled, Nurse Ack*, Started, Checked In), No Show (No Show + NoShow), Cancelled. Note: the newer scheduling system logs No-shows more, so the mix shifts partly for that reason." chartId="apptOutcomes" chartData={data?.apptOutcomes} chartTitle="Appointment Outcomes" chartDescription="Quarterly appointment outcome distribution (show-up rate)">
          <ApptOutcomes data={data?.apptOutcomes} />
        </CVCard>
      )}

      {/* Data Audit — superadmin-only source + extraction logic per chart */}
      <DataAuditSection provenance={(data as any)?._meta?.provenance} />
    </div>
  );
}
