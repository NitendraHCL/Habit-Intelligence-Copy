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
type Col = { label: string; pct: number; count: number; n: number; color: string; delta: number | null }; // delta = relative % vs previous bar; n = cohort measured

const C_BASE = "#cbd5e1", C_DOWN = "#0d9488", C_UP = "#dc2626", C_FLAT = "#94a3b8";

// Plain-English definition of Then vs Now, shown on every then-vs-now chart. Key terms in solid black for legibility.
function ThenNowDefn({ cmp }: { cmp: "yearly" | "window" }) {
  const bk = { color: "#000" } as const;
  return (
    <div className="rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: "#EEF2FF", border: "1px solid #dfe3fb" }}>
      <p className="text-[12.5px] leading-[1.65]" style={{ color: "#1f2937" }}>
        {cmp === "yearly" ? (
          <>
            Each line shows, for one parameter, the <b style={bk}>% of that year&apos;s measured members who are above the threshold</b> (e.g. % diabetic, % obese), across the years of the <b style={bk}>past (old) data</b>.{" "}
            Every year has a <b style={bk}>different population</b>, so we use a <b style={bk}>percentage</b> (not raw counts) to compare years fairly. <b style={bk}>Hover any point</b> to see that year&apos;s member count (n).
          </>
        ) : (
          <>
            <b style={bk}>Jun &apos;24 – July &apos;25</b> = each member&apos;s most-recent reading inside that <b style={bk}>window</b> (15 Jun 2024 – 31 Jul 2025).{" "}
            <b style={bk}>Aug &apos;25 onwards</b> = the <b style={bk}>same</b> member&apos;s most-recent reading from the <b style={bk}>current health check</b>. We only count <b style={bk}>members with a reading in BOTH periods</b> (matched by UHID) — the <b style={bk}>same people</b> over time.
          </>
        )}
      </p>
    </div>
  );
}

// Vertical column chart: every bar shows count + %, a vs-previous-bar delta, and is coloured by that comparison.
function ColumnChart({ columns }: { columns: Col[] }) {
  const max = Math.max(1, ...columns.map((c) => c.pct));
  const maxW = columns.length <= 2 ? 240 : undefined; // center the 2-bar (Then/Now) view
  return (
    <div className="mx-auto w-full" style={{ maxWidth: maxW }}>
      <div className="flex justify-around gap-2">
        {columns.map((col, i) => (
          <div key={i} className="flex-1 flex flex-col items-center" title={`${col.label}: ${fmt(col.count)} members (${col.pct}%)`}>
            {/* numbers block (fixed height so bars align): % above threshold + n only */}
            <div className="h-[40px] flex flex-col items-center justify-end leading-none">
              <span className="text-[15px] font-extrabold tabular-nums" style={{ color: T.textPrimary }}>{col.pct}%</span>
              <span className="text-[9.5px] tabular-nums mt-1" style={{ color: T.textMuted }}>n={fmt(col.n)}</span>
            </div>
            {/* bar zone (fixed height) */}
            <div className="w-full flex items-end justify-center" style={{ height: 82 }}>
              <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(3, (col.pct / max) * 100)}%`, maxWidth: 60, backgroundColor: col.color }} />
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

function JourneyCard({ c, cmp, baselineLabel }: { c: any; cmp: "total" | "window"; baselineLabel: string }) {
  const d = cmp === "total" ? c.total : c.window;
  const then = d?.then, now = d?.now;
  const empty = !then || !now || (then.total === 0 && now.total === 0);

  const columns: Col[] = [];
  if (!empty) {
    columns.push({ label: baselineLabel, pct: then.pct, count: then.positive, n: then.total, color: C_BASE, delta: null });
    const col: Col = { label: "Aug'25 onwards", pct: now.pct, count: now.positive, n: now.total, color: C_BASE, delta: null };
    col.delta = then.pct > 0 ? ((now.pct - then.pct) / then.pct) * 100 : (now.pct > 0 ? 100 : 0);
    col.color = now.pct < then.pct ? C_DOWN : now.pct > then.pct ? C_UP : C_FLAT;
    columns.push(col);
  }

  // Overall headline badge (fewer/more members above the threshold, baseline → Now).
  const overall = empty ? 0 : then.positive - now.positive;
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
      {empty ? (
        <div className="text-[12px] py-6 text-center" style={{ color: T.textMuted }}>No data yet.</div>
      ) : (
        <ColumnChart columns={columns} />
      )}
    </div>
  );
}

// One parameter/condition's yearly trend: a compact % (or avg) line across OLD-data years, with n.
function YearlyTrendCard({ title, threshold, points, isPct, suffix = "", color = "#8e9bc4" }: {
  title: string; threshold?: string;
  points: { year: string; value: number; n: number }[]; isPct: boolean; suffix?: string; color?: string;
}) {
  const empty = points.length === 0;
  const vals = points.map((p) => p.value);
  const vmax = (Math.max(isPct ? 1 : 0, ...vals) || 1) * 1.05; // bars from 0, small headroom
  const h = (v: number) => Math.max(2, (v / vmax) * 100);
  const fmtV = (v: number) => (isPct ? `${Math.round(v * 10) / 10}%` : num1(v));
  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fff" }}>
      <div className="mb-2">
        <div className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{title}{suffix ? <span className="text-[10.5px] font-medium" style={{ color: T.textMuted }}> · {suffix}</span> : null}</div>
        {threshold && <span className="inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded mt-1 tabular-nums" style={{ color: "#4338ca", backgroundColor: "#EEF2FF" }}>{threshold}</span>}
      </div>
      {empty ? <div className="text-[12px] py-8 text-center" style={{ color: T.textMuted }}>No data.</div> : (
        <>
          {/* % + n above each bar */}
          <div className="flex gap-1">
            {points.map((p, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end leading-tight" style={{ height: 32 }}>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: T.textPrimary }}>{fmtV(p.value)}</span>
                <span className="text-[8px] tabular-nums" style={{ color: T.textMuted }}>n={fmt(p.n)}</span>
              </div>
            ))}
          </div>
          {/* bars (from zero) */}
          <div className="flex items-end gap-1" style={{ height: 84 }}>
            {points.map((p, i) => (
              <div key={i} className="flex-1 flex items-end justify-center h-full" title={`${p.year}: ${fmtV(p.value)} (n=${fmt(p.n)})`}>
                <div className="w-full rounded-t-[2px]" style={{ height: `${h(p.value)}%`, maxWidth: 26, backgroundColor: color }} />
              </div>
            ))}
          </div>
          {/* full-year labels */}
          <div className="flex gap-1 mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${T.border}` }}>
            {points.map((p, i) => (
              <span key={i} className="flex-1 text-center text-[9px] font-semibold tabular-nums" style={{ color: T.textSecondary }}>{p.year}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// "How to read" for the yearly bar charts (shown once above each yearly grid).
function YearlyHowToRead({ color = "#8e9bc4" }: { color?: string }) {
  return (
    <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}` }}>
      <div className="text-[12px] font-bold mb-2.5" style={{ color: T.textPrimary }}>How to read</div>
      <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
            <td className="py-2 pr-4 w-[120px]"><span className="inline-block w-3.5 h-5 rounded-sm align-middle" style={{ backgroundColor: color }} /> <span className="text-[12px] font-bold align-middle" style={{ color: T.textPrimary }}>21.5%</span></td>
            <td className="py-2" style={{ color: T.textSecondary }}>Each <b>bar = one year</b> of past data. Its height and the bold number = <b>% of that year&apos;s measured members above the threshold</b> (e.g. % diabetic). For parameters with no threshold, the bar shows the <b>yearly average</b> instead.</td>
          </tr>
          <tr style={{ borderBottom: `1px solid ${T.borderLight}` }}>
            <td className="py-2 pr-4"><span className="text-[11px] font-semibold tabular-nums" style={{ color: T.textMuted }}>n=209</span></td>
            <td className="py-2" style={{ color: T.textSecondary }}>The small number under each bar = <b>n</b>, how many members were measured that year — the base the % is calculated from.</td>
          </tr>
          <tr>
            <td className="py-2 pr-4"><span className="text-[11px] font-semibold tabular-nums" style={{ color: T.textSecondary }}>2021 → 2025</span></td>
            <td className="py-2" style={{ color: T.textSecondary }}>Years run <b>left → right</b>. Each year had a <b>different population</b>, so we compare a <b>%</b> (not raw counts) to keep the years fair.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MemberJourney({ journey }: { journey: any[] }) {
  const [cmp, setCmp] = useState<"yearly" | "window">("yearly");
  const list = journey ?? [];

  const CmpBtn = ({ id, label }: { id: "yearly" | "window"; label: string }) => (
    <button onClick={() => setCmp(id)} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors" style={cmp === id ? { backgroundColor: "#4f46e5", color: "#fff" } : { backgroundColor: "#F1F3F9", color: T.textSecondary }}>{label}</button>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CmpBtn id="yearly" label="Yearly Trend (Old Data)" />
          <CmpBtn id="window" label="Jun '24 – July '25 → Aug '25 onwards" />
        </div>
      </div>
      <ThenNowDefn cmp={cmp} />
      {cmp === "yearly" && <YearlyHowToRead />}

      {cmp === "yearly" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((c) => (
            <YearlyTrendCard key={c.key} title={c.label} threshold={c.threshold} isPct
              points={(c.yearly ?? []).map((y: any) => ({ year: y.year, value: y.pct, n: y.total }))} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {list.map((c) => <JourneyCard key={c.key} c={c} cmp="window" baselineLabel="Jun'24–Jul'25" />)}
        </div>
      )}
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
  "LDL": { unit: "mg/dL", normal: 130 },
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
  "SGPT / ALT": { unit: "U/L", normal: 50 },
  "SGOT / AST": { unit: "U/L", normal: 50 },
  "Alk. Phosphatase": { unit: "U/L", normal: 120 },
  "GGTP": { unit: "U/L", normal: 85 },
  "Creatinine": { unit: "mg/dL", normal: 1.2 },
  "Blood Urea": { unit: "mg/dL", normal: 40 },
  "BUN": { unit: "mg/dL", normal: 20 },
  "Uric Acid": { unit: "mg/dL", normal: 7 },
  "Haemoglobin": { unit: "g/dL", normal: 12 },
  "WBC": { unit: "/µL" },
  "BMI": { unit: "", normal: 23 },
  "BP (Systolic)": { unit: "mmHg", normal: 120 },
  "BP (Diastolic)": { unit: "mmHg", normal: 80 },
  "Weight": { unit: "kg" },
  "SPO2": { unit: "%", normal: 94 },
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
  // Bars start from 0 so heights show true proportion (no zoomed/exaggerated scale).
  const hi0 = Math.max(...vals, normal ?? 0);
  const yMin = 0, yMax = Math.max(1, hi0 * 1.12); // 12% headroom above the tallest bar / normal line
  const h = (v: number) => Math.max(2, ((v - yMin) / (yMax - yMin)) * 100);
  const barH = large ? 200 : 80, numH = large ? 52 : 40, maxBarW = large ? 80 : 60;
  // With only Then/Now (2 bars), constrain + center so they don't fling to the card edges.
  const maxW = columns.length <= 2 ? (large ? 320 : 240) : undefined;
  return (
    <div className="mx-auto w-full" style={{ maxWidth: maxW }}>
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

function ValueCard({ p, large, baselineLabel = "Then" }: { p: any; large?: boolean; baselineLabel?: string }) {
  const dir: string = p.direction || "neutral";
  const meta = PARAM_META[p.param] || {};
  const total = Number(p.baselineN) || 0;
  const titleEl = (
    <div className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{p.param} {meta.unit ? <span className="text-[10.5px] font-medium" style={{ color: T.textMuted }}>· {meta.unit}</span> : null}</div>
  );
  const hasThr = p.baselineThenAbove != null && p.baselineOld != null && p.baselineNew != null;

  // Thresholded params: % of members above the threshold (outside normal) + n — same as Member Health Journey.
  if (hasThr) {
    const outThen = Number(p.baselineThenAbove), outNow = Number(p.baselineNowAbove);
    const opct = (x: number) => (total ? Math.round((x / total) * 1000) / 10 : 0);
    const outColor = outThen === outNow ? C_FLAT : outThen > outNow ? C_DOWN : C_UP; // fewer outside now = better
    const cols: Col[] = [
      { label: baselineLabel, pct: opct(outThen), count: outThen, n: total, color: C_BASE, delta: null },
      { label: "Aug'25 onwards", pct: opct(outNow), count: outNow, n: total, color: outColor, delta: null },
    ];
    const outDiff = outThen - outNow;
    const badge = outDiff === 0 ? { t: "no change", c: T.textMuted, b: "#F1F3F9" } : outDiff > 0 ? { t: `${fmt(outDiff)} fewer ✓`, c: "#0f766e", b: "#ecfdf5" } : { t: `${fmt(-outDiff)} more`, c: "#b91c1c", b: "#fef2f2" };
    const atRisk = meta.normal == null ? null : `at risk: ${dir === "higher" ? "≤" : "≥"} ${num1(meta.normal)}${meta.unit ? " " + meta.unit : ""}`;
    return (
      <div className="rounded-xl p-4 flex flex-col" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fff" }}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            {titleEl}
            {atRisk && <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 tabular-nums" style={{ color: "#4338ca", backgroundColor: "#EEF2FF" }}>{atRisk}</span>}
          </div>
          {total > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0" style={{ color: badge.c, backgroundColor: badge.b }}>{badge.t}</span>}
        </div>
        {total === 0 ? <div className="text-[12px] py-6 text-center" style={{ color: T.textMuted }}>No data yet.</div> : <ColumnChart columns={cols} />}
      </div>
    );
  }

  // No-threshold params (TSH, WBC, Weight…): % above threshold doesn't apply, so show the average value + n.
  const normalText = meta.normal == null ? undefined : `${dir === "higher" ? "≥" : "≤"} ${num1(meta.normal)}`;
  const seq: VCol[] = [];
  if (p.baselineOld != null) seq.push({ label: baselineLabel, value: Number(p.baselineOld), n: total, color: C_BASE, delta: null });
  if (p.baselineNew != null) seq.push({ label: "Aug'25 onwards", value: Number(p.baselineNew), n: total, color: C_BASE, delta: null });
  seq.forEach((col, i) => { if (i > 0) { const change = col.value - seq[i - 1].value; col.delta = change; col.color = dirColor(change, dir); } });
  const empty = seq.length < 2;
  return (
    <div className="rounded-xl p-4 flex flex-col" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fff" }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          {titleEl}
          <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded mt-1" style={{ color: T.textSecondary, backgroundColor: "#F1F3F9" }}>average · no threshold</span>
        </div>
      </div>
      {empty ? <div className="text-[12px] py-6 text-center" style={{ color: T.textMuted }}>No data yet.</div> : <ValueColumnChart columns={seq} normal={meta.normal} normalText={normalText} large={large} />}
    </div>
  );
}

function ValueJourney({ paramsWindow, paramsYearly }: { paramsWindow: any[]; paramsYearly: any[] }) {
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const [cmp, setCmp] = useState<"yearly" | "window">("yearly");
  const list = (cmp === "yearly" ? paramsYearly : paramsWindow) ?? [];
  const byPanel = PANEL_ORDER.map((panel) => ({ panel, items: list.filter((p) => p.panel === panel) })).filter((g) => g.items.length);
  const curPanel = byPanel.find((g) => g.panel === selectedPanel) || byPanel[0];
  const items: any[] = curPanel?.items ?? [];

  const CmpBtn = ({ id, label }: { id: "yearly" | "window"; label: string }) => (
    <button onClick={() => setCmp(id)} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors" style={cmp === id ? { backgroundColor: "#4f46e5", color: "#fff" } : { backgroundColor: "#F1F3F9", color: T.textSecondary }}>{label}</button>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold" style={{ color: T.textSecondary }}>Panel</span>
          <select value={curPanel?.panel ?? ""} onChange={(e) => { setSelectedPanel(e.target.value); }} className="h-8 px-2.5 rounded-lg border text-[12.5px] font-medium bg-white outline-none cursor-pointer" style={{ borderColor: T.border, color: T.textPrimary, minWidth: 190 }}>
            {byPanel.map((g) => <option key={g.panel} value={g.panel}>{g.panel} ({g.items.length})</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <CmpBtn id="yearly" label="Yearly Trend (Old Data)" />
          <CmpBtn id="window" label="Jun '24 – July '25 → Aug '25 onwards" />
        </div>
      </div>
      <ThenNowDefn cmp={cmp} />
      {cmp === "yearly" && <YearlyHowToRead color="#5fa3a0" />}

      {items.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((p) => cmp === "yearly"
            ? <YearlyTrendCard key={p.param} title={p.param} isPct={p.hasThreshold} suffix={PARAM_META[p.param]?.unit ?? ""} color="#5fa3a0"
                threshold={p.hasThreshold ? `at risk ${p.direction === "higher" ? "≤" : "≥"} ${num1(Number(p.normal))} ${PARAM_META[p.param]?.unit ?? ""}`.trim() : undefined}
                points={(p.years ?? []).map((y: any) => ({ year: y.year, value: p.hasThreshold ? y.pct : (y.avg ?? 0), n: y.total }))} />
            : <ValueCard key={p.param} p={p} baselineLabel="Jun'24–Jul'25" />)}
        </div>
      ) : <div className="text-[13px] py-8 text-center" style={{ color: T.textMuted }}>No parameters available.</div>}
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

function BandSection({ metric, cmp }: { metric: any; cmp: "total" | "window" }) {
  const points: any[] = (cmp === "total" ? metric.total : metric.window) ?? [];
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
        <div className="flex items-start justify-center gap-10 sm:gap-16">
          <Waffle point={points[0]} categories={metric.categories} />
          {points.slice(1).map((p, i) => (
            <div key={i} className="flex items-start gap-10 sm:gap-16">
              <span className="text-[22px]" style={{ color: "#cbd5e1", marginTop: 64 }}>→</span>
              <Waffle point={p} categories={metric.categories} />
            </div>
          ))}
        </div>
      ) : <div className="text-[12px] py-4" style={{ color: T.textMuted }}>No data yet.</div>}
    </div>
  );
}

// Friendly "abnormal" label per band metric (the categories that count as above the healthy band).
const BAND_ABNORMAL: Record<string, string> = { glycemic: "% not normal (pre-diabetic + diabetic)", bmi: "% overweight + obese", bp: "% elevated + hypertension" };

function BandJourney({ bands }: { bands: any[] }) {
  const [cmp, setCmp] = useState<"yearly" | "window">("yearly");
  const [selected, setSelected] = useState<string | null>(null);
  const current = bands.find((m) => m.key === selected) || bands[0];
  const CmpBtn = ({ id, label }: { id: "yearly" | "window"; label: string }) => (
    <button onClick={() => setCmp(id)} className="px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold transition-colors" style={cmp === id ? { backgroundColor: "#4f46e5", color: "#fff" } : { backgroundColor: "#F1F3F9", color: T.textSecondary }}>{label}</button>
  );
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        {cmp === "window" ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold" style={{ color: T.textSecondary }}>Metric</span>
            <select value={current?.key ?? ""} onChange={(e) => { setSelected(e.target.value); }} className="h-8 px-2.5 rounded-lg border text-[12.5px] font-medium bg-white outline-none cursor-pointer" style={{ borderColor: T.border, color: T.textPrimary, minWidth: 190 }}>
              {bands.map((m) => <option key={m.key} value={m.key}>{m.title}</option>)}
            </select>
          </div>
        ) : <div />}
        <div className="flex items-center gap-2">
          <CmpBtn id="yearly" label="Yearly Trend (Old Data)" />
          <CmpBtn id="window" label="Jun '24 – July '25 → Aug '25 onwards" />
        </div>
      </div>
      <ThenNowDefn cmp={cmp} />
      {cmp === "yearly" && <YearlyHowToRead color="#b08fc0" />}
      {cmp === "yearly" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bands.map((m) => (
            <YearlyTrendCard key={m.key} title={m.title} threshold={BAND_ABNORMAL[m.key]} isPct color="#b08fc0"
              points={(m.yearly ?? []).map((y: any) => ({ year: y.year, value: y.pct, n: y.total }))} />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-xl p-3.5 mb-5 text-[12px]" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}`, color: T.textSecondary }}>
            <b style={{ color: T.textPrimary }}>How to read:</b> each grid = <b>100 members</b> at that point; each dot = <b>1%</b>, coloured by band. The green block is the healthy share — compare it between the two grids. Hover a grid for the exact split.
          </div>
          {current ? <BandSection metric={current} cmp="window" /> : <div className="text-[13px] py-8 text-center" style={{ color: T.textMuted }}>No metric available.</div>}
        </>
      )}
    </div>
  );
}

// ─── Appointment Outcomes: absolute stacked columns per quarter + Total Booked line ───
function ApptOutcomes({ data }: { data: any }) {
  const cats: string[] = data?.categories ?? [];
  const quarters: any[] = data?.quarters ?? [];
  if (!quarters.length) return <div className="text-[13px] py-8 text-center" style={{ color: T.textMuted }}>No appointment data.</div>;
  const xLabels = quarters.map((q) => q.label);
  const totals = quarters.map((q) => q.total);
  const barSeries = cats.map((cat, ci) => ({
    name: cat, type: "bar", stack: "appt", barMaxWidth: 46,
    itemStyle: { color: BAND_COLOR[cat] || "#cbd5e1" }, emphasis: { focus: "series" },
    data: quarters.map((q) => q.counts[ci]),
  }));
  const totalSeries = {
    name: "Total Booked", type: "line", data: totals, z: 5, symbol: "circle", symbolSize: 6, smooth: false,
    lineStyle: { width: 2, color: "#4f46e5" }, itemStyle: { color: "#4f46e5" },
    label: { show: true, position: "top", fontSize: 11, fontWeight: "bold", color: "#4f46e5", formatter: (p: any) => fmt(p.value) },
    tooltip: { valueFormatter: (v: number) => fmt(v) },
  };
  const option = {
    tooltip: {
      trigger: "axis", axisPointer: { type: "shadow" },
      valueFormatter: (v: number) => fmt(v),
    },
    legend: { data: [...cats, "Total Booked"], bottom: 0, icon: "circle", itemWidth: 9, itemHeight: 9, textStyle: { fontSize: 11, color: T.textSecondary } },
    grid: { left: 52, right: 18, top: 22, bottom: 44 },
    xAxis: { type: "category", data: xLabels, axisLabel: { fontSize: 11, color: T.textSecondary }, axisLine: { lineStyle: { color: T.border } } },
    yAxis: { type: "value", min: 0, name: "appointments", nameTextStyle: { fontSize: 10, color: T.textMuted, align: "left" }, axisLabel: { fontSize: 11, color: T.textSecondary }, splitLine: { lineStyle: { color: T.borderLight } } },
    series: [...barSeries, totalSeries],
  };
  const latest = quarters[quarters.length - 1];
  return (
    <div>
      <div className="rounded-xl p-3.5 mb-4 text-[12px]" style={{ backgroundColor: "#F8FAFC", border: `1px solid ${T.border}`, color: T.textSecondary }}>
        <b style={{ color: T.textPrimary }}>How to read:</b> each column is a quarter's appointments split by outcome — <b>absolute counts</b>, so the column height is that quarter's <b>Total Booked</b> (also shown as the <span style={{ color: "#4f46e5", fontWeight: 700 }}>indigo line</span> + number on top). Latest quarter: <b>{fmt(latest?.total || 0)}</b> booked, <span style={{ color: "#059669", fontWeight: 700 }}>{fmt(latest?.counts?.[0] || 0)} completed</span>. Hover a quarter for the full split.
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
        fallbackSummary={`For the Jun '24 – July '25 → Aug '25 onwards comparison, ${fmt(kpis?.labWindowTracked || 0)} members have lab data in both the window and the current check, and ${fmt(kpis?.vitalsWindowTracked || 0)} have vitals in both. ${fmt(kpis?.conditionsMonitored || 0)} clinical conditions are monitored.`}
        fallbackChips={[
          { label: "Tracked (Labs)", value: `${fmt(kpis?.labWindowTracked || 0)} / ${fmt(4162)}` },
          { label: "Tracked (Vitals)", value: `${fmt(kpis?.vitalsWindowTracked || 0)} / ${fmt(7460)}` },
          { label: "Conditions", value: fmt(kpis?.conditionsMonitored || 0) },
        ]}
      />

      {/* ── KPI tiles (Jun'24–Jul'25 → Aug'25 onwards) ── */}
      {isChartVisible("kpis") && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "Members Tracked (Labs) · Jun '24–Jul '25 → Aug '25 onwards", value: `${fmt(kpis?.labWindowTracked || 0)} / ${fmt(4162)}`, hint: "tracked of unique lab members in the window", tip: "Members who have a lab reading in both the Jun '24 – July '25 window and the current health check (present in old and new), out of the 4,162 unique members with labs in that window.", color: "#4f46e5" },
            { label: "Members Tracked (Vitals) · Jun '24–Jul '25 → Aug '25 onwards", value: `${fmt(kpis?.vitalsWindowTracked || 0)} / ${fmt(7460)}`, hint: "tracked of unique vitals members in the window", tip: "Members who have a vitals reading in both the Jun '24 – July '25 window and the current health check (present in old and new), out of the 7,460 unique members with vitals in that window.", color: "#0d9488" },
            { label: "Conditions Monitored", value: fmt(kpis?.conditionsMonitored || 0), hint: "clinical conditions tracked", tip: `Conditions tracked across the page: ${(kpis?.conditionsList ?? []).join(" · ")}.`, color: "#f59e0b" },
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
        <CVCard accentColor="#4f46e5" title="Member Health Journey" subtitle="% of each year's measured members above each clinical threshold, year by year. Thresholds follow the reference workbook." tooltipText="Yearly trend: for each condition, the % of that year's measured members above the threshold (e.g. % diabetic), across the past-data years. Each year has a different population, so % keeps years comparable; hover a point for n. A condition can be governed by multiple rules (Diabetes = FBS ≥126 OR HbA1c ≥6.5) and gender-specific cutoffs (Anaemia). Switch to 'Jun '24 – July '25 → Aug '25 onwards' for the last-window-vs-after comparison." chartId="conditionPrevalence" chartData={data?.conditionJourney} chartTitle="Member Health Journey" chartDescription="Condition prevalence — yearly % above threshold, and Jun'24–Jul'25 vs Aug'25 onwards">
          <MemberJourney journey={data?.conditionJourney ?? []} />
        </CVCard>
      )}

      {/* ── Value Progression (quarter-by-quarter, by panel) ── */}
      {(isChartVisible("labProgression") || isChartVisible("vitalsProgression")) && (
        <CVCard accentColor="#4f46e5" title="Value Progression" subtitle="% of each year's members outside the normal range, year by year, grouped by clinical panel." tooltipText="Yearly trend: for each parameter, the % of that year's measured members outside the normal range (above/below the threshold), across the past-data years; hover a point for n. Parameters with no threshold (TSH, WBC, Weight…) show the yearly average instead. Switch to 'Jun '24 – July '25 → Aug '25 onwards' for the last-window-vs-after bars." chartId="labProgression" chartData={{ labYearly: data?.labYearly, vitalsYearly: data?.vitalsYearly }} chartTitle="Value Progression" chartDescription="Yearly % above threshold per parameter, and Jun'24–Jul'25 vs Aug'25 onwards">
          <ValueJourney
            paramsYearly={[...(isChartVisible("labProgression") ? (data?.labYearly ?? []) : []), ...(isChartVisible("vitalsProgression") ? (data?.vitalsYearly ?? []) : [])]}
            paramsWindow={[...(isChartVisible("labProgression") ? (data?.labWindow ?? []) : []), ...(isChartVisible("vitalsProgression") ? (data?.vitalsWindow ?? []) : [])]}
          />
        </CVCard>
      )}

      {/* ── Health Band Distribution (waffle grids, Then → quarterly) ── */}
      {(isChartVisible("glycemicTransition") || isChartVisible("bmiTransition") || isChartVisible("bpTransition")) && (
        <CVCard accentColor="#0d9488" title="Health Band Distribution" subtitle="% of each year's members in the abnormal band, year by year (Glycemic / BMI / BP)." tooltipText="Yearly trend: for each metric, the % of that year's measured members in the abnormal bands (e.g. pre-diabetic + diabetic, overweight + obese, elevated + hypertension), across the past-data years; hover a point for n. Switch to 'Jun '24 – July '25 → Aug '25 onwards' for the waffle-grid comparison. BP band uses systolic thresholds." chartId="glycemicTransition" chartData={data?.bandJourney} chartTitle="Health Band Distribution" chartDescription="Glycemic / BMI / BP yearly % abnormal, and Jun'24–Jul'25 vs Aug'25 onwards">
          <BandJourney bands={[
            isChartVisible("glycemicTransition") && data?.bandJourney?.glycemic,
            isChartVisible("bmiTransition") && data?.bandJourney?.bmi,
            isChartVisible("bpTransition") && data?.bandJourney?.bp,
          ].filter(Boolean)} />
        </CVCard>
      )}

      {/* ── Appointment Outcomes (waffle per quarter) ── */}
      {isChartVisible("apptOutcomes") && (
        <CVCard accentColor="#6366f1" title="Appointment Outcomes — by quarter" subtitle="Appointments by outcome each quarter — absolute counts; column height = Total Booked that quarter." tooltipText="Each stacked column is a quarter's appointments by outcome (absolute counts); the indigo line + number on top is the quarter's Total Booked. The 12 raw stages collapse to 4: Completed (+ Prescription Sent, Re Open), Pending (Rescheduled, Nurse Ack*, Started, Checked In), No Show (No Show + NoShow), Cancelled. Note: the newer scheduling system logs No-shows more, so the mix shifts partly for that reason." chartId="apptOutcomes" chartData={data?.apptOutcomes} chartTitle="Appointment Outcomes" chartDescription="Quarterly appointment outcomes — absolute counts + Total Booked">
          <ApptOutcomes data={data?.apptOutcomes} />
        </CVCard>
      )}

      {/* Data Audit — superadmin-only source + extraction logic per chart */}
      <DataAuditSection provenance={(data as any)?._meta?.provenance} />
    </div>
  );
}
