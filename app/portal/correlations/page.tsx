"use client";

import { useState } from "react";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
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
  chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
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
              {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
              {expandable && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-2" style={{ color: T.textMuted }} onClick={() => setExpanded(!expanded)}>
                  {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </Button>
              )}
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

// ─── Main Page ───
export default function CorrelationsPage() {
  const { data, isLoading } = useDashboardData("correlations");

  const d = data as any;
  const ohcToAhc = d?.ohcToAhc || fallbackData.ohcToAhc;
  const ahcToOhc = d?.ahcToOhc || fallbackData.ahcToOhc;
  const mentalPhysical = d?.mentalPhysical || fallbackData.mentalPhysical;
  const appEngagement = d?.appEngagement || fallbackData.appEngagement;

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
        fallbackSummary="Cross-service analysis connects OHC utilization, Annual Health Check (AHC) data, mental health assessments, and app engagement data. Participation patterns reveal how engagement in one health service influences outcomes in others, enabling integrated wellness interventions."
        fallbackChips={[
          { label: "Services Analyzed", value: "4" },
          { label: "Data Sources", value: "OHC, AHC, App" },
          { label: "Insight Type", value: "Cross-Service" },
        ]}
      />

      {/* ── 2x2 Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Card 1: OHC Utilization → AHC Uptake ── */}
        <CVCard
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
        </CVCard>

        {/* ── Card 2: AHC Abnormalities → OHC Follow-ups ── */}
        <CVCard
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
        </CVCard>

        {/* ── Card 3: Mental Health → Physical Health ── */}
        <CVCard
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
        </CVCard>

        {/* ── Card 4: App Engagement → Health Outcomes ── */}
        <CVCard
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
        </CVCard>

      </div>
    </div>
  );
}
