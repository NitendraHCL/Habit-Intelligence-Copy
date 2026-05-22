"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { useConfig } from "@/lib/contexts/config-context";
import { RotateCcw } from "lucide-react";
import type { PageConfig } from "@/lib/types/dashboard-config";
import {
  Info,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { T } from "@/lib/ui/theme";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ChartComments } from "@/components/ui/chart-comments";

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(n);
}

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card ───
function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true,
  chartData, chartTitle, chartDescription, chartId, pageSlug,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
  /** Pass both chartId + pageSlug to expose the chart-comments thread (KAMs, super-admins, etc.) on this card. */
  chartId?: string; pageSlug?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden transition-all ${expanded ? "col-span-full" : ""} ${className}`}
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
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
                {chartId && pageSlug && <ChartComments chartId={chartId} pageSlug={pageSlug} />}
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
      <div className="px-6 pb-5">{children}</div>
    </div>
  );
}

// ─── Stat Pill ───
function StatPill({ value, label, color, count }: { value: string; label: string; color: string; count?: string }) {
  return (
    <div
      className="rounded-2xl px-5 py-4 flex flex-col items-center gap-1 flex-1"
      style={{ backgroundColor: color + "0D", border: `1px solid ${color}22` }}
    >
      <p className="text-[32px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{value}</p>
      {count && <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{count}</p>}
      <p className="text-[12px] font-medium text-center" style={{ color: T.textSecondary }}>{label}</p>
    </div>
  );
}

// ─── Insight Box ───
function InsightBox({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3 text-[12px] leading-relaxed mt-4" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// ─── Correlation Pair Row ───
function CorrelationPair({ left, right, strength, value, color }: {
  left: string; right: string; strength: string; value: number; color: string;
}) {
  const barWidth = Math.round(value * 100);
  return (
    <div className="flex items-center gap-4 py-3" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{left}</span>
        <span className="text-[13px]" style={{ color: T.textMuted }}>&#8596;</span>
        <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{right}</span>
      </div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.borderLight }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: color }} />
      </div>
      <div className="text-right min-w-[110px]">
        <span className="text-[12px] font-bold" style={{ color }}>{strength}</span>
        <span className="text-[11px] ml-1" style={{ color: T.textMuted }}>({value.toFixed(2)})</span>
      </div>
    </div>
  );
}

// ─── Impact Row ───
function ImpactRow({ label, impact, positive }: { label: string; impact: string; positive: boolean }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
      <span className="text-[13px] font-medium" style={{ color: T.textPrimary }}>{label}</span>
      <span className="text-[13px] font-bold" style={{ color: positive ? "#2D8C5A" : "#6366f1" }}>{impact}</span>
    </div>
  );
}

// No fallback data — all data comes from API
const fallbackData = {
  ohcToAhc: { ohcActiveUsersPct: 0, ohcActiveUsers: 0, totalEmployees: 0, ahcCompletionPct: 0, ahcCompleted: 0, ahcEligible: 0 },
  ahcToOhc: { abnormalFindings: 0, ohcFollowUpPct: 0 },
  mentalPhysical: [] as Array<{ left: string; right: string; strength: string; value: number }>,
  appEngagement: [] as Array<{ label: string; impact: string; positive: boolean }>,
};

// ─── Engagement-Mix types (mirror the API response) ───
interface CohortStats {
  patients: number;
  shareOfBase: number;
  gender: { male: number; female: number; other: number; malePct: number; femalePct: number };
  ageGroup: Array<{ label: string; count: number; pct: number }>;
  chronicShare: number;
  topConditions: Array<{ disease: string; patients: number; share: number }>;
}
interface BiggestDiff { disease: string; engagedPct: number; notEngagedPct: number; gap: number }
interface EngagementMix {
  engaged: CohortStats;
  notEngaged: CohortStats;
  biggestDifferences: BiggestDiff[];
  insights: { clinical: string[]; operational: string[] };
  actionPlan: {
    clinical: { title: string; rationale: string; specialties: string[] }[];
    operational: { title: string; rationale: string; specialties: string[] }[];
  };
  availableSpecialtyCount: number;
}

// Slim parenthetical detail off long disease names for compact rendering.
function shortDisease(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, "").trim();
}

// ─── Mini horizontal bar used inside cohort breakdowns ───
function MiniBar({ pct, color, width = 96 }: { pct: number; color: string; width?: number }) {
  return (
    <div className="rounded-full overflow-hidden" style={{ height: 6, width, backgroundColor: T.borderLight }}>
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Compact hero pill used in the strip at the top of the card ───
function HeroPill({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#fff", border: `1px solid ${T.border}` }}>
      <span className="text-[15px] font-extrabold tabular-nums" style={{ color: accent }}>{value}</span>
      <span className="text-[11.5px]" style={{ color: T.textSecondary }}>{label}</span>
    </div>
  );
}

// ─── Cohort column — count + gender stacked bar + age bars + chronic share + top conditions ───
function CohortColumn({ cohort, label, accent }: { cohort: CohortStats; label: string; accent: string }) {
  const MALE = "#4f46e5";
  const FEMALE = "#c026d3";
  const OTHER = "#94a3b8";
  const malePct = cohort.gender.malePct;
  const femalePct = cohort.gender.femalePct;
  const otherPct = Math.max(0, 100 - malePct - femalePct);
  const maxTop = Math.max(...cohort.topConditions.map((c) => c.share), 1);

  return (
    <div className="rounded-2xl px-5 py-4 flex flex-col gap-4" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fafafa" }}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-1.5 h-4 rounded-sm" style={{ backgroundColor: accent }} />
          <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{label}</p>
        </div>
        <p className="text-[20px] font-extrabold tabular-nums mt-1.5" style={{ color: T.textPrimary }}>
          {cohort.patients.toLocaleString("en-IN")}
          <span className="text-[12px] font-semibold ml-1.5" style={{ color: T.textSecondary }}>patients · {cohort.shareOfBase}% of OHC</span>
        </p>
      </div>

      {/* Gender stacked bar */}
      <div>
        <p className="text-[11px] font-semibold mb-1" style={{ color: T.textSecondary }}>Gender</p>
        <div className="flex h-2 rounded-full overflow-hidden" style={{ backgroundColor: T.borderLight }}>
          {malePct > 0 && <div style={{ width: `${malePct}%`, backgroundColor: MALE }} />}
          {femalePct > 0 && <div style={{ width: `${femalePct}%`, backgroundColor: FEMALE }} />}
          {otherPct > 0 && <div style={{ width: `${otherPct}%`, backgroundColor: OTHER }} />}
        </div>
        <div className="flex items-center justify-between mt-1 text-[11px]" style={{ color: T.textSecondary }}>
          <span><span style={{ color: MALE }}>● </span>Male {malePct}%</span>
          <span><span style={{ color: FEMALE }}>● </span>Female {femalePct}%</span>
        </div>
      </div>

      {/* Age bars */}
      <div>
        <p className="text-[11px] font-semibold mb-1" style={{ color: T.textSecondary }}>Age group</p>
        <div className="space-y-0.5">
          {cohort.ageGroup.map((a) => (
            <div key={a.label} className="flex items-center gap-2 text-[11px]">
              <span className="tabular-nums" style={{ color: T.textSecondary, width: 40 }}>{a.label}</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, backgroundColor: T.borderLight }}>
                <div style={{ width: `${Math.max(0, Math.min(100, a.pct))}%`, height: "100%", backgroundColor: "#0d9488" }} />
              </div>
              <span className="tabular-nums font-semibold text-right" style={{ color: T.textPrimary, width: 30 }}>{a.pct}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chronic share */}
      <div className="flex items-baseline justify-between pt-2" style={{ borderTop: `1px solid ${T.borderLight}` }}>
        <p className="text-[11.5px] font-semibold" style={{ color: T.textSecondary }}>Chronic share</p>
        <p className="text-[16px] font-extrabold tabular-nums" style={{ color: T.textPrimary }}>{cohort.chronicShare}%</p>
      </div>

      {/* Top conditions — bars sized by share, ranked */}
      <div>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: T.textSecondary }}>Top conditions in this group</p>
        <div className="space-y-1">
          {cohort.topConditions.map((c) => {
            const w = Math.max(4, Math.round((c.share / maxTop) * 100));
            return (
              <div key={c.disease} className="flex items-center gap-2 text-[11.5px]" title={c.disease}>
                <span className="truncate" style={{ color: T.textPrimary, width: 110 }}>{shortDisease(c.disease)}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, backgroundColor: T.borderLight }}>
                  <div style={{ width: `${w}%`, height: "100%", backgroundColor: accent }} />
                </div>
                <span className="tabular-nums font-semibold text-right" style={{ color: T.textPrimary, width: 32 }}>{Math.round(c.share)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── AI Insights & Action Plan combined column ───
// Renders insights (always visible) plus an action-plan section that's
// capped to a small number of cards by default — anything beyond that
// is revealed by a "View more" toggle, so the column doesn't push the
// adjacent cohort columns into an awkward whitespace shape.
function AIColumn({ insights, actionPlan }: { insights: { clinical: string[]; operational: string[] }; actionPlan: { clinical: { title: string; rationale: string; specialties: string[] }[]; operational: { title: string; rationale: string; specialties: string[] }[] } }) {
  const [expanded, setExpanded] = useState(false);
  const COLLAPSED = 3;

  const totalPlan = actionPlan.clinical.length + actionPlan.operational.length;
  // When collapsed, show the first COLLAPSED clinical actions, then fill the
  // remaining slots with operational actions. Expanded shows everything.
  const visibleClinical = expanded ? actionPlan.clinical : actionPlan.clinical.slice(0, COLLAPSED);
  const remaining = expanded ? Infinity : Math.max(0, COLLAPSED - visibleClinical.length);
  const visibleOperational = expanded ? actionPlan.operational : actionPlan.operational.slice(0, remaining);
  const hiddenCount = totalPlan - (visibleClinical.length + visibleOperational.length);
  const isPlanEmpty = totalPlan === 0;

  return (
    <div className="rounded-2xl px-5 py-4 flex flex-col gap-4" style={{ border: "1px solid #c7d2fe", backgroundColor: "#f5f3ff" }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="inline-block w-1.5 h-4 rounded-sm" style={{ backgroundColor: "#4f46e5" }} />
        <p className="text-[13px] font-bold" style={{ color: T.textPrimary }}>AI Insights & Action Plan</p>
        <span className="text-[9px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#c7d2fe", color: "#3730a3" }}>✦ AI</span>
      </div>

      {/* Insights */}
      <div>
        <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#4338ca" }}>Clinical insights</p>
        <ul className="space-y-1">
          {insights.clinical.map((s, i) => (
            <li key={i} className="text-[12px] leading-snug flex gap-1.5" style={{ color: T.textPrimary }}>
              <span style={{ color: "#6366f1" }}>•</span><span>{s}</span>
            </li>
          ))}
        </ul>
        <p className="text-[11px] font-semibold mt-2.5 mb-1.5" style={{ color: "#4338ca" }}>Operational insights</p>
        <ul className="space-y-1">
          {insights.operational.map((s, i) => (
            <li key={i} className="text-[12px] leading-snug flex gap-1.5" style={{ color: T.textPrimary }}>
              <span style={{ color: "#6366f1" }}>•</span><span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action plan — mini-cards each with title + specialties chips + rationale */}
      <div className="pt-3 flex flex-col gap-2" style={{ borderTop: "1px solid #c7d2fe" }}>
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-[11px] font-semibold" style={{ color: "#4338ca" }}>Action plan</p>
          <p className="text-[10px] italic" style={{ color: "#6366f1" }}>uses only specialties at this clinic</p>
        </div>
        {isPlanEmpty ? (
          <p className="text-[11.5px] italic" style={{ color: T.textSecondary }}>
            No camps to recommend — the engaged cohort isn&apos;t over-indexing on a condition this clinic can address.
          </p>
        ) : (
          <>
            {visibleClinical.map((a) => <PlanCard key={a.title} item={a} kind="clinical" />)}
            {visibleOperational.length > 0 && visibleClinical.length > 0 && (
              <div className="my-0.5" style={{ borderTop: "1px dashed #c7d2fe" }} />
            )}
            {visibleOperational.map((a) => <PlanCard key={a.title} item={a} kind="operational" />)}

            {/* View more / View less affordance */}
            {(hiddenCount > 0 || expanded) && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 self-start text-[11.5px] font-bold inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
                style={{ color: "#4338ca", backgroundColor: "#e0e7ff" }}
              >
                {expanded
                  ? "View less"
                  : `View ${hiddenCount} more action${hiddenCount === 1 ? "" : "s"}`}
                <span className="text-[10px]">{expanded ? "▲" : "▼"}</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlanCard({ item, kind }: { item: { title: string; rationale: string; specialties: string[] }; kind: "clinical" | "operational" }) {
  const accent = kind === "clinical" ? "#4338ca" : "#0d9488";
  return (
    <div className="rounded-lg px-3 py-2" style={{ backgroundColor: "#fff", border: "1px solid #e0e7ff" }}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-bold leading-snug" style={{ color: T.textPrimary }}>{item.title}</p>
        <div className="flex flex-wrap gap-1 justify-end">
          {item.specialties.map((s) => (
            <span key={s} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: "#eef2ff", color: accent }}>{s}</span>
          ))}
        </div>
      </div>
      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: T.textSecondary }}>{item.rationale}</p>
    </div>
  );
}

// ─── Compact conditions comparison strip at the bottom of the card ───
// True side-by-side: each cohort gets its own column with bars sharing the
// same max-value scale, so bar-length difference is the gap. A "diverging"
// layout would have been confusing here — two parallel columns are clearer.
function ConditionsStrip({ rows }: { rows: BiggestDiff[] }) {
  if (rows.length === 0) return null;
  const maxPct = Math.max(...rows.flatMap((r) => [r.engagedPct, r.notEngagedPct]), 1);
  const ENG = "#4f46e5";
  const NEG = "#94a3b8";
  const COLS = "minmax(170px, 1.4fr) minmax(0, 2fr) minmax(0, 2fr) 130px";

  return (
    <div className="rounded-2xl px-5 py-4 mt-4" style={{ border: `1px solid ${T.border}`, backgroundColor: "#fff" }}>
      <p className="text-[12px] font-bold mb-3" style={{ color: T.textPrimary }}>Conditions where the two groups differ most</p>

      {/* Column headers */}
      <div className="grid items-center gap-4 pb-2 mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ gridTemplateColumns: COLS, borderBottom: `1px solid ${T.borderLight}` }}>
        <span style={{ color: T.textMuted }}>Condition</span>
        <span className="inline-flex items-center gap-1.5" style={{ color: ENG }}>
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: ENG }} />
          Engaged
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: T.textSecondary }}>
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: NEG }} />
          Not Yet Engaged
        </span>
        <span className="text-right" style={{ color: T.textMuted }}>Gap</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const eWidth = Math.max(2, Math.round((r.engagedPct / maxPct) * 100));
          const nWidth = Math.max(2, Math.round((r.notEngagedPct / maxPct) * 100));
          const gapColor = r.gap > 0 ? "#dc2626" : r.gap < 0 ? "#0d9488" : T.textMuted;
          const gapArrow = r.gap > 0 ? "▲" : r.gap < 0 ? "▼" : "•";
          return (
            <div key={r.disease} className="grid items-center gap-4 py-1.5" style={{ gridTemplateColumns: COLS }}>
              <div className="text-[12px] font-semibold truncate" style={{ color: T.textPrimary }} title={r.disease}>
                {shortDisease(r.disease)}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: T.borderLight }}>
                  <div style={{ width: `${eWidth}%`, height: "100%", backgroundColor: ENG, borderRadius: 999, transition: "width 200ms ease" }} />
                </div>
                <span className="text-[11.5px] tabular-nums font-bold" style={{ color: T.textPrimary, width: 42, textAlign: "right" }}>{r.engagedPct}%</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 8, backgroundColor: T.borderLight }}>
                  <div style={{ width: `${nWidth}%`, height: "100%", backgroundColor: NEG, borderRadius: 999, transition: "width 200ms ease" }} />
                </div>
                <span className="text-[11.5px] tabular-nums" style={{ color: T.textSecondary, width: 42, textAlign: "right" }}>{r.notEngagedPct}%</span>
              </div>

              <div className="text-[12px] font-bold tabular-nums text-right" style={{ color: gapColor }}>
                {gapArrow} {Math.abs(r.gap)}% {r.gap >= 0 ? "higher" : "lower"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Emotional Wellbeing → Chronic Care Insights Card ───
function WorkforceEngagementMix({ data }: { data: EngagementMix }) {
  const { engaged, notEngaged, biggestDifferences, insights, actionPlan } = data;
  const totalUsers = engaged.patients + notEngaged.patients;

  if (engaged.patients === 0) {
    return (
      <CVCard
        accentColor="#4f46e5"
        title="Emotional Wellbeing → Chronic Care Insights"
        subtitle="Compares patients who have completed an Emotional Wellbeing assessment against the rest of the workforce."
        tooltipText="No Emotional Wellbeing assessments are recorded for this client yet, so there is nothing to compare."
        chartData={data}
        chartTitle="Emotional Wellbeing → Chronic Care Insights"
        chartDescription="Compares Emotional Wellbeing assessed patients against the rest of the OHC user base."
        chartId="engagementMix"
        pageSlug="/portal/correlations"
      >
        <div className="px-2 py-10 text-center text-[13px]" style={{ color: T.textMuted }}>
          No Emotional Wellbeing assessments recorded for this client yet.
        </div>
      </CVCard>
    );
  }

  const femaleSkew = engaged.gender.femalePct - notEngaged.gender.femalePct;
  const chronicGap = engaged.chronicShare - notEngaged.chronicShare;
  const topGap = [...biggestDifferences].sort((a, b) => b.gap - a.gap)[0];

  return (
    <CVCard
      accentColor="#4f46e5"
      title="Emotional Wellbeing → Chronic Care Insights"
      subtitle={`Maps mental-health engagement to chronic-disease patterns across the workforce. ${engaged.patients.toLocaleString("en-IN")} of ${totalUsers.toLocaleString("en-IN")} OHC patients have completed an Emotional Wellbeing assessment. All percentages below are within their group.`}
      tooltipText="Compares Emotional Wellbeing assessed patients against the rest of the OHC user base and maps each cohort's chronic-disease profile. The AI column proposes only camps the clinic can actually run with its current specialties."
      chartData={data}
      chartTitle="Emotional Wellbeing → Chronic Care Insights"
      chartDescription="Maps mental-health engagement (Emotional Wellbeing assessments) against chronic-disease patterns, and generates an AI clinical + operational action plan from the data."
      chartId="engagementMix"
      pageSlug="/portal/correlations"
    >
      {/* Compact hero strip — one-line summary of the four anchor numbers */}
      <div className="flex flex-wrap gap-2 mt-3 mb-4">
        <HeroPill value={`${engaged.shareOfBase}%`} label="of OHC users assessed" accent="#4f46e5" />
        <HeroPill
          value={`${femaleSkew >= 0 ? "+" : ""}${femaleSkew}%`}
          label={femaleSkew >= 0 ? "more female than workforce" : "less female than workforce"}
          accent={femaleSkew >= 0 ? "#c026d3" : "#0d9488"}
        />
        <HeroPill
          value={`${chronicGap >= 0 ? "+" : ""}${chronicGap}%`}
          label={chronicGap >= 0 ? "higher chronic share" : "lower chronic share"}
          accent={chronicGap >= 0 ? "#dc2626" : "#0d9488"}
        />
        {topGap && (
          <HeroPill
            value={`${topGap.gap >= 0 ? "+" : ""}${topGap.gap}%`}
            label={`${shortDisease(topGap.disease)} gap`}
            accent={topGap.gap >= 0 ? "#dc2626" : "#0d9488"}
          />
        )}
      </div>

      {/* Three-column main grid — Engaged | Not Yet Engaged | AI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <CohortColumn cohort={engaged} label="Engaged" accent="#4f46e5" />
        <CohortColumn cohort={notEngaged} label="Not Yet Engaged" accent="#94a3b8" />
        <AIColumn insights={insights} actionPlan={actionPlan} />
      </div>

      {/* Compact conditions comparison strip at the bottom */}
      <ConditionsStrip rows={biggestDifferences} />
    </CVCard>
  );
}

// ─── Main Page ───
export default function CorrelationsPage() {
  usePageAccess("/portal/correlations");
  const { data, isLoading, mutate } = useDashboardData("correlations");
  const { user } = useAuth();
  const { isChartVisible: globalVisible } = useConfig();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [previewConfig, setPreviewConfig] = useState<PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = (chartId: string) => {
    if (isPreview && previewConfig?.charts) {
      const cc = previewConfig.charts[chartId];
      return cc ? cc.visible !== false : true;
    }
    return globalVisible("/portal/correlations", chartId);
  };
  const [isRefreshing, setIsRefreshing] = useState(false);

  const d = data as any;
  const ohcToAhc = d?.ohcToAhc || fallbackData.ohcToAhc;
  const ahcToOhc = d?.ahcToOhc || fallbackData.ahcToOhc;
  const mentalPhysical = d?.mentalPhysical || fallbackData.mentalPhysical;
  const appEngagement = d?.appEngagement || fallbackData.appEngagement;
  const engagementMix: EngagementMix | undefined = d?.engagementMix;

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-56 bg-white rounded-2xl border animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-stagger space-y-6">
      <PageGlanceBox
        pageTitle="Correlations Dashboard"
        pageSubtitle="Cross-service insights connecting OHC, Annual Health Checks (AHC), and App data"
        kpis={{}}
        fallbackSummary="Cross-service analysis connects OHC, Annual Health Checks, mental health screenings, and app engagement. The matrix below shows how participation in one service relates to outcomes in another."
        fallbackChips={[
          { label: "Services Analyzed", value: "4" },
          { label: "Data Sources", value: "OHC, AHC, App" },
          { label: "Insight Type", value: "Cross-Service" },
        ]}
      />

      <div className="flex items-center justify-end gap-2 mb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={async () => { setIsRefreshing(true); await mutate(); setIsRefreshing(false); }}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <RotateCcw className={`size-4 text-gray-600 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
        {isSuperAdmin && (
          <ConfigurePanel
            pageSlug="/portal/correlations"
            pageTitle="Correlations"
            charts={[
              { id: "engagementMix", label: "Emotional Wellbeing → Chronic Care Insights" },
              { id: "ohcToAhc", label: "OHC Utilization → AHC Uptake" },
              { id: "ahcToOhc", label: "AHC Abnormalities → OHC Follow-ups" },
              { id: "mentalPhysical", label: "Mental Health → Physical Health" },
              { id: "appEngagement", label: "App Engagement → Health Outcomes" },
            ]}
            onPreview={setPreviewConfig}
            isPreview={isPreview}
          />
        )}
      </div>

      {isPreview && (
        <div className="px-4 py-2 rounded-xl text-sm font-medium text-center mb-4" style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          Preview Mode — changes not saved yet
        </div>
      )}

      {/* ── Emotional Wellbeing → Chronic Care Insights (full-row, above grid) ── */}
      {isChartVisible("engagementMix") && engagementMix && (
        <WorkforceEngagementMix data={engagementMix} />
      )}

      {/* ── 2x2 Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Card 1: OHC Utilization → AHC Uptake ── */}
        {isChartVisible("ohcToAhc") && <CVCard
          accentColor={"#4f46e5"}
          title="OHC Utilization → Annual Health Check Uptake"
          subtitle="Percentage and count of employees actively using OHC services, and the AHC completion rate among those active users — showing how regular OHC engagement drives preventive health check participation"
          tooltipText="Two stat pills showing OHC active user percentage alongside AHC completion rate. A higher AHC completion rate among frequent OHC visitors indicates that occupational health engagement drives preventive health check-up participation."
          chartData={ohcToAhc}
          chartTitle="OHC Utilization → Annual Health Check Uptake"
          chartDescription="Two KPI metrics showing what percentage of registered employees actively use OHC services, and the AHC completion rate among those users — demonstrating how regular occupational health engagement drives preventive health check participation."
        >
          <div className="flex gap-3 mt-3">
            <StatPill value={`${ohcToAhc.ohcActiveUsersPct}%`} label="OHC Active Users" color="#4f46e5" count={`${formatNum(ohcToAhc.ohcActiveUsers || 0)} / ${formatNum(ohcToAhc.totalEmployees || 0)}`} />
            <StatPill value={`${ohcToAhc.ahcCompletionPct}%`} label="AHC Completion" color="#2D8C5A" count={`${formatNum(ohcToAhc.ahcCompleted || 0)} / ${formatNum(ohcToAhc.ahcEligible || 0)}`} />
          </div>

          <InsightBox text="Employees who visited OHC 3+ times are 25% more likely to complete their AHC." />
        </CVCard>}

        {/* ── Card 2: AHC Abnormalities → OHC Follow-ups ── */}
        {isChartVisible("ahcToOhc") && <CVCard
          accentColor={T.coral}
          title="Annual Health Check Abnormalities → OHC Follow-ups"
          subtitle="Are employees with flagged health risks following up at the clinic?"
          tooltipText="Shows the total number of abnormal AHC findings alongside the percentage of those employees who followed up at OHC. A low follow-up rate highlights a care gap — employees flagged with health risks are not seeking timely clinical follow-up."
          chartData={ahcToOhc}
          chartTitle="Annual Health Check Abnormalities → OHC Follow-ups"
          chartDescription="Total abnormal AHC findings alongside the OHC follow-up rate among flagged employees — quantifying the care gap between preventive screening results and timely clinical follow-through."
        >
          <div className="flex gap-3 mt-3">
            <StatPill value={formatNum(ahcToOhc.abnormalFindings)} label="Abnormal Findings" color="#d97706" />
            <StatPill value={`${ahcToOhc.ohcFollowUpPct}%`} label="OHC Follow-up" color="#6366f1" />
          </div>

          <InsightBox text="38% gap in follow-up care presents an opportunity for intervention." />
        </CVCard>}

        {/* ── Card 3: Mental Health → Physical Health ── */}
        {isChartVisible("mentalPhysical") && <CVCard
          accentColor={"#6366f1"}
          title="Mental Health → Physical Health"
          subtitle="Correlation between mental and physical conditions"
          tooltipText="Correlation bars showing pairs of mental and physical health conditions. Bar length and color indicate strength — red for strong (0.7+), amber for moderate (0.5–0.7), teal for mild. Higher correlation means employees with the mental health condition are significantly more likely to also have the physical condition."
          chartData={mentalPhysical}
          chartTitle="Mental Health → Physical Health Correlations"
          chartDescription="Correlation strength bars for paired mental and physical health conditions — bar length and value indicate how frequently two conditions co-occur across the workforce. Strong correlations (0.7+) suggest that addressing the mental health condition may reduce the physical burden."
        >
          <div className="mt-3">
            {mentalPhysical.map((pair: any, i: number) => {
              const color = pair.value >= 0.7 ? "#6B4C3B" : pair.value >= 0.5 ? "#D4A574" : "#2D8C5A";
              return (
                <CorrelationPair
                  key={i}
                  left={pair.left}
                  right={pair.right}
                  strength={pair.strength}
                  value={pair.value}
                  color={color}
                />
              );
            })}
          </div>
          <InsightBox text={`${mentalPhysical.length > 0 ? `The strongest correlation is between ${mentalPhysical[0].left} and ${mentalPhysical[0].right} (${mentalPhysical[0].value.toFixed(2)}). ` : ''}Addressing mental health conditions may reduce the burden of co-occurring physical conditions.`} />
        </CVCard>}

        {/* ── Card 4: App Engagement → Health Outcomes ── */}
        {isChartVisible("appEngagement") && <CVCard
          accentColor={T.teal}
          title="App Engagement → Health Outcomes"
          subtitle="Impact of wellness app usage on health metrics"
          tooltipText="Lists key app engagement activities (daily active usage, challenge participation, HRA completion) alongside their measured impact on health outcomes. Green indicators show positive health improvements associated with each activity. Use this to understand which app features drive the most meaningful wellness gains."
          chartData={appEngagement}
          chartTitle="App Engagement → Health Outcomes"
          chartDescription="Measured health outcome improvements linked to specific wellness app engagement behaviours — daily active usage, challenge participation, and HRA completion. Each row shows the activity and its observed impact on employee health metrics."
        >
          <div className="mt-3">
            {appEngagement.map((item: any, i: number) => (
              <ImpactRow key={i} label={item.label} impact={item.impact} positive={item.positive} />
            ))}
          </div>
          <InsightBox text="Active app users show measurable health improvements across multiple metrics. Promoting daily app usage and challenge participation can amplify wellness program ROI." />
        </CVCard>}

      </div>
    </div>
  );
}
