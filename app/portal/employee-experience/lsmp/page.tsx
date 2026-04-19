"use client";

import { useState, useMemo, useEffect } from "react";
// dynamic import removed — no longer using echarts-for-react
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartComments, type ChartComment } from "@/components/ui/chart-comments";
import {
  Info,
  Maximize2,
  Minimize2,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  ChevronDown,
  X,
  Download,
  Bell,
  RotateCcw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { T } from "@/lib/ui/theme";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

// ECharts removed — using Recharts PieChart for donut charts (echarts-for-react 3.x + echarts 6 compat issue)

const AGE_COLORS = ["#818cf8", "#0d9488", "#4f46e5", "#14b8a6", "#a78bfa"];
const COMPLIANCE_COLORS = ["#a78bfa", "#0d9488", "#818cf8"];
const PLAN_COLORS = ["#4f46e5", "#0d9488", "#818cf8", "#6366f1", "#14b8a6"];
const GENDER_COLORS = ["#0d9488", "#a78bfa", "#a1a1aa"];
const IMPROVEMENT_COLORS: Record<string, string> = {
  "Significant Improvement": "#0d9488",
  "Moderate Improvement": "#14b8a6",
  "Slight Improvement": "#818cf8",
  "No Change": "#a78bfa",
  "Declined": "#a1a1aa",
};
const LOCATION_COLORS = ["#4f46e5", "#0d9488", "#818cf8", "#14b8a6", "#6366f1", "#a78bfa", "#7c3aed", "#34d399"];

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(n);
}

function getComplianceCellBg(value: number): string {
  if (value >= 80) return "#0d9488";
  if (value >= 70) return "#818cf8";
  return "#a78bfa";
}

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card ───
function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, comments,
  chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; comments?: ChartComment[];
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
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} kamComments={comments} />}
                {comments && comments.length > 0 && <ChartComments comments={comments} />}
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

// ─── Stat Card ───
function StatCard({ label, value, color, sub, trend, tooltipText }: {
  label: string; value: string | number; color: string; sub?: string;
  trend?: { value: number; label: string }; tooltipText?: string;
}) {
  const isUp = trend && trend.value > 0;
  const TrendIcon = isUp ? TrendingUp : TrendingDown;
  const trendColor = isUp ? T.green : T.coral;
  return (
    <div
      className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-1"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
        {tooltipText && (
          <Tooltip>
            <TooltipTrigger><Info size={12} style={{ color: T.textMuted }} /></TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">{tooltipText}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{value}</p>
      {sub && <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>{sub}</p>}
      {trend && (
        <span className="inline-flex items-center gap-1 self-start mt-1 text-[11px] font-bold" style={{ color: trendColor }}>
          <TrendIcon size={12} />
          {isUp ? "+" : ""}{trend.value}% {trend.label}
        </span>
      )}
    </div>
  );
}

// ─── Filter Options (defaults — overridden by /api/filters) ───
const PLAN_OPTIONS = ["Prime Health", "Supreme Health", "Calorie Fit Care", "Pro Health", "Others"];

// ─── Multi-select filter ───
function FilterMultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium transition-colors border hover:border-gray-300"
          style={{ borderColor: T.border, color: selected.length > 0 ? T.textPrimary : T.textSecondary, backgroundColor: T.white }}
        >
          {label}
          {selected.length > 0 && (
            <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: "#4f46e5" }}>
              {selected.length}
            </span>
          )}
          <ChevronDown size={13} style={{ color: T.textMuted }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[12px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{label}</span>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="text-[10px] font-medium hover:underline" style={{ color: T.coral }}>Clear</button>
          )}
        </div>
        <ScrollArea className="max-h-52">
          <div className="space-y-0.5">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-[12px]" style={{ color: T.textPrimary }}>
                <Checkbox checked={selected.includes(opt)} onCheckedChange={() =>
                  onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
                } className="h-3.5 w-3.5" />
                {opt}
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ─── Active Filter Chips ───
function ActiveFilterChips({
  filters, onRemove, onClearAll,
}: {
  filters: Record<string, string[]>; onRemove: (key: string, value: string) => void; onClearAll: () => void;
}) {
  const allChips = Object.entries(filters).flatMap(([key, values]) =>
    values.map((v) => ({ key, value: v }))
  );
  if (allChips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-3">
      {allChips.map((chip) => (
        <span
          key={`${chip.key}-${chip.value}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
          style={{ backgroundColor: "#4f46e512", color: "#4f46e5", border: "1px solid #4f46e522" }}
        >
          {chip.value}
          <button onClick={() => onRemove(chip.key, chip.value)} className="hover:opacity-70 rounded-full p-0.5"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium ml-1 hover:underline" style={{ color: T.coral }}>Clear all</button>
    </div>
  );
}

// ─── Types ───
interface LsmpData {
  kpis: {
    totalEnrollments: { value: number; trend: number; trendLabel: string };
    activeInCarePlan: { value: number; trend: number; trendLabel: string };
    completionRate: { value: number; trend: number; trendLabel: string };
    overallImprovement: { value: number; trend: number; trendLabel: string };
    avgDuration: { value: number; trend: number; trendLabel: string };
  };
  carePlanDistribution: { plan: string; enrolled: number }[];
  ageGroupDistribution: { name: string; value: number }[];
  genderDistribution: { gender: string; value: number }[];
  improvementStatus: { status: string; count: number }[];
  complianceStatus: { name: string; value: number }[];
  locationDistribution: { location: string; patients: number }[];
  carePlanTrends: Record<string, unknown>[];
  improvementVsDuration: Record<string, unknown>[];
  complianceTriggerPattern: {
    rows: string[];
    columns: string[];
    data: number[][];
  };
}

// ─── Main Page ───
export default function LSMPPage() {
  usePageAccess("/portal/employee-experience/lsmp");
  const { activeClientId } = useAuth();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [dateOpen, setDateOpen] = useState(false);

  const [pageFilters, setPageFilters] = useState({
    ageGroups: [] as string[],
    genders: [] as string[],
    locations: [] as string[],
    plans: [] as string[],
  });

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const [appliedDateRange, setAppliedDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [appliedFilters, setAppliedFilters] = useState({
    ageGroups: [] as string[],
    genders: [] as string[],
    locations: [] as string[],
    plans: [] as string[],
  });

  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = (chartId: string) => {
    if (!previewConfig) return true;
    const cc = previewConfig.charts[chartId];
    if (!cc) return true;
    return cc.visible;
  };

  // Fetch real filter options from API
  const [filterOptions, setFilterOptions] = useState({
    locations: [] as string[],
    genders: ["Male", "Female", "Others"],
    ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
    specialties: [] as string[],
  });
  useEffect(() => {
    const params = activeClientId && activeClientId !== "all" ? `?clientId=${activeClientId}` : "";
    fetch(`/api/filters${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.locations || data.specialties || data.genders || data.ageGroups) {
          setFilterOptions((prev) => ({
            ...prev,
            ...(data.locations && { locations: data.locations }),
            ...(data.genders && { genders: data.genders }),
            ...(data.ageGroups && { ageGroups: data.ageGroups }),
            ...(data.specialties && { specialties: data.specialties }),
          }));
        }
      })
      .catch(() => {});
  }, [activeClientId]);

  const extraParams = useMemo(() => {
    const p: Record<string, string> = {};
    p.dateFrom = format(appliedDateRange.from, "yyyy-MM-dd");
    p.dateTo = format(appliedDateRange.to, "yyyy-MM-dd");
    if (appliedFilters.ageGroups.length) p.ageGroups = appliedFilters.ageGroups.join(",");
    if (appliedFilters.genders.length) p.genders = appliedFilters.genders.join(",");
    if (appliedFilters.locations.length) p.locations = appliedFilters.locations.join(",");
    if (appliedFilters.plans.length) p.plans = appliedFilters.plans.join(",");
    return p;
  }, [appliedDateRange, appliedFilters]);

  const { data, isLoading, isValidating, mutate } = useDashboardData<LsmpData>("lsmp", extraParams);

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], plans: [] as string[] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedFilters({ ...pageFilters });
  };

  if (!data) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-12 bg-white rounded-xl border animate-pulse" />
        <div className="grid grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 bg-white rounded-2xl border animate-pulse" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-[360px] bg-white rounded-2xl border animate-pulse" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-[360px] bg-white rounded-2xl border animate-pulse" />)}
        </div>
      </div>
    );
  }

  const { kpis } = data;

  // Donut chart data prepared for Recharts PieChart
  const ageDonutData = data.ageGroupDistribution.map((d: any, i: number) => ({
    name: d.name,
    value: d.value,
    fill: AGE_COLORS[i % AGE_COLORS.length],
  }));

  const genderDonutData = data.genderDistribution.map((d: any, i: number) => ({
    name: d.gender,
    value: d.value,
    fill: GENDER_COLORS[i % GENDER_COLORS.length],
  }));

  const complianceDonutData = data.complianceStatus.map((d: any, i: number) => ({
    name: d.name,
    value: d.value,
    fill: COMPLIANCE_COLORS[i % COMPLIANCE_COLORS.length],
  }));

  const tooltipStyle = {
    borderRadius: 12,
    border: `1px solid ${T.border}`,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    fontSize: 12,
  };

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* Filters */}
      <div
        className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
      >
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border hover:border-gray-300 transition-colors"
              style={{ borderColor: T.border, color: T.textPrimary, backgroundColor: T.white }}
            >
              <CalendarDays size={14} style={{ color: T.textMuted }} />
              {format(dateRange.from, "dd-MM-yyyy")} &mdash; {format(dateRange.to, "dd-MM-yyyy")}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to });
              }}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
        <FilterMultiSelect label="Plan" options={PLAN_OPTIONS} selected={pageFilters.plans} onChange={(v) => setPageFilters((p) => ({ ...p, plans: v }))} />

        <div className="flex-1" />
        <button className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Download size={15} />
        </button>
        <button className="relative h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Bell size={15} />
          <span className="absolute -right-1 -top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#DC2626] text-[8px] font-bold text-white">3</span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => mutate()} className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50">
              <RotateCcw className={`size-4 text-gray-600${isValidating ? " animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
        <ConfigurePanel
          pageSlug="/portal/employee-experience/lsmp"
          pageTitle="Care Plan Dashboard"
          charts={[
            { id: "lsmpKpis", label: "LSMP KPI Cards" },
            { id: "carePlanDistribution", label: "Care Plan Distribution" },
            { id: "ageGroupDistribution", label: "Age Group Distribution" },
            { id: "genderDistribution", label: "Gender Distribution" },
            { id: "improvementStatus", label: "Patient Improvement Status" },
            { id: "complianceLocation", label: "Compliance Status & Location Distribution" },
            { id: "carePlanTrends", label: "Care Plan Trends" },
            { id: "improvementVsDuration", label: "Improvement vs Duration" },
            { id: "complianceTrigger", label: "Compliance Trigger Pattern Analysis" },
          ]}
          filters={["location"]}
          onPreview={setPreviewConfig}
          isPreview={isPreview}
        />
        <Button
          onClick={handleApply}
          disabled={isLoading}
          className="h-9 px-5 rounded-lg text-[13px] font-bold min-w-[90px]"
          style={{ background: isLoading ? "#9CA3AF" : "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", boxShadow: isLoading ? "none" : "0 2px 8px rgba(79,70,229,0.25)" }}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Loading...
            </span>
          ) : (
            "Apply"
          )}
        </Button>
      </div>

      {hasActiveFilters && (
        <ActiveFilterChips filters={appliedFilters} onRemove={handleRemoveChip} onClearAll={handleClearAll} />
      )}

      <PageGlanceBox
        pageTitle="Care Plan Dashboard"
        pageSubtitle="Lifestyle Management Programs Participation and Outcomes"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalEnrollments?.value || 0)} total enrollments across lifestyle management programs with ${formatNum(kpis?.activeInCarePlan?.value || 0)} currently active in care plans. Completion rate stands at ${kpis?.completionRate?.value || 0}% with ${kpis?.overallImprovement?.value || 0}% showing health improvement.`}
        fallbackChips={[
          { label: "Enrollments", value: formatNum(kpis?.totalEnrollments?.value || 0) },
          { label: "Active", value: formatNum(kpis?.activeInCarePlan?.value || 0) },
          { label: "Completion", value: `${kpis?.completionRate?.value || 0}%` },
          { label: "Improvement", value: `${kpis?.overallImprovement?.value || 0}%` },
        ]}
      />

      {/* KPI Cards */}
      {isChartVisible("lsmpKpis") && <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Enrollments"
          value={formatNum(kpis.totalEnrollments.value)}
          color={"#4f46e5"}
          trend={{ value: kpis.totalEnrollments.trend, label: kpis.totalEnrollments.trendLabel }}
          tooltipText="Total number of employees enrolled across all lifestyle management care plans (Prime Health, Supreme Health, Calorie Fit Care, Pro Health, and Others) within the selected date range."
        />
        <StatCard
          label="Active in Care Plan"
          value={formatNum(kpis.activeInCarePlan.value)}
          color={T.teal}
          trend={{ value: kpis.activeInCarePlan.trend, label: kpis.activeInCarePlan.trendLabel }}
          tooltipText="Number of employees currently active in a care plan — i.e., enrolled and not yet completed or exited. Indicates ongoing program participation."
        />
        <StatCard
          label="Completion Rate"
          value={`${kpis.completionRate.value}%`}
          color={T.green}
          trend={{ value: kpis.completionRate.trend, label: kpis.completionRate.trendLabel }}
          tooltipText="Percentage of enrolled employees who have successfully completed their care plan program within the expected duration."
        />
        <StatCard
          label="Overall Improvement"
          value={`${kpis.overallImprovement.value}%`}
          color={"#6366f1"}
          trend={{ value: kpis.overallImprovement.trend, label: kpis.overallImprovement.trendLabel }}
          tooltipText="Percentage of care plan participants showing measurable health improvement based on clinical assessments and follow-up evaluations."
        />
      </div>}

      {/* Row 1: Care Plan Distribution + Age Group + Gender */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Care Plan Distribution - Horizontal Bar */}
        {isChartVisible("carePlanDistribution") && <CVCard
          className="lg:col-span-5"
          accentColor={"#4f46e5"}
          title="Care Plan Distribution"
          subtitle="Shows total number of enrollments across different care plan packages."
          tooltipText="Horizontal bar chart showing enrollment counts per care plan type. Longer bars indicate higher enrollment."
          chartData={data.carePlanDistribution}
          chartDescription="Enrollment counts across the four LSMP care plan types — Prime Health, Supreme Health, Calorie Fit, and Pro Health — showing which plans have the highest and lowest participation."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.carePlanDistribution} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                <XAxis type="number" tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                <YAxis dataKey="plan" type="category" tick={{ fontSize: 11, fill: T.textMuted }} width={100} />
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => [formatNum(Number(v)), "Enrolled"]} />
                <Bar dataKey="enrolled" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {data.carePlanDistribution.map((_: any, i: number) => (
                    <Cell key={i} fill={PLAN_COLORS[i % PLAN_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CVCard>}

        {/* Age Group Distribution - Donut */}
        {isChartVisible("ageGroupDistribution") && <CVCard
          className="lg:col-span-4"
          accentColor={"#6366f1"}
          title="Age Group Distribution"
          subtitle="Displays patient distribution by age brackets."
          tooltipText="Donut chart showing enrolled patients broken down by age group."
          chartData={data.ageGroupDistribution}
          chartDescription="Donut chart showing how enrolled LSMP patients are distributed across age brackets — reveals which age cohorts drive the most care plan participation."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ageDonutData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
                  {ageDonutData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [`${v}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CVCard>}

        {/* Gender Distribution - Donut */}
        {isChartVisible("genderDistribution") && <CVCard
          className="lg:col-span-3"
          accentColor={T.coral}
          title="Gender Distribution"
          subtitle="Shows male, female, and unspecified gender breakdown."
          tooltipText="Donut chart displaying gender-wise breakdown of enrolled patients."
          chartData={data.genderDistribution}
          chartDescription="Gender breakdown of enrolled LSMP patients — shows the proportion of male, female, and other gender identities participating in lifestyle management programs."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderDonutData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius="45%" outerRadius="75%" paddingAngle={2}>
                  {genderDonutData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [`${v}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={10} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CVCard>}
      </div>

      {/* Row 2: Patient Improvement Status + Compliance & Location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Patient Improvement Status - Horizontal Bar */}
        {isChartVisible("improvementStatus") && <CVCard
          accentColor={T.teal}
          title="Patient Improvement Status"
          subtitle="Displays outcome categories for patients in care plans."
          tooltipText="Horizontal bar chart showing patient counts by improvement status — Improvement, Eligible for Exit, Intermediate, Completed, and No Improvement. Sorted by count to highlight the most common outcomes. Use this to assess program effectiveness and identify cohorts needing additional support."

          chartData={data.improvementStatus}
          chartDescription="Patient outcome distribution across care plans — shows how many enrolled employees fall into Improvement, Eligible for Exit, Intermediate, Completed, and No Improvement categories, enabling program effectiveness assessment."
        >
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...data.improvementStatus].sort((a: any, b: any) => b.count - a.count)} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                <XAxis type="number" tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                <YAxis dataKey="status" type="category" tick={{ fontSize: 11, fill: T.textMuted }} width={110} />
                <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => [formatNum(Number(v)), "Patients"]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {[...data.improvementStatus].sort((a: any, b: any) => b.count - a.count).map((s: any, i: number) => (
                    <Cell key={i} fill={IMPROVEMENT_COLORS[s.status] || T.textMuted} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CVCard>}

        {/* Compliance Status & Location Distribution */}
        {isChartVisible("complianceLocation") && <CVCard
          accentColor={"#6366f1"}
          title="Compliance Status & Location Distribution"
          subtitle="Shows compliance rates alongside geographical distribution of patients."
          tooltipText="Left: donut chart with compliance status breakdown. Right: horizontal bar chart ranking locations by patient count."
          chartData={{ complianceStatus: data.complianceStatus, locationDistribution: data.locationDistribution }}
          chartDescription="Two-panel view: compliance status donut (proportion of Compliant, Partially Compliant, Non-Compliant patients) alongside a location bar chart showing which sites have the highest LSMP patient volumes."
        >
          <div className="grid grid-cols-12 gap-2" style={{ height: 300 }}>
            <div className="col-span-5 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={complianceDonutData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius="40%" outerRadius="70%" paddingAngle={2}>
                    {complianceDonutData.map((d: any, i: number) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [`${v}%`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={10} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-7 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.locationDistribution} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                  <YAxis dataKey="location" type="category" tick={{ fontSize: 10, fill: T.textMuted }} width={70} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any) => [formatNum(Number(v)), "Patients"]} />
                  <Bar dataKey="patients" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {data.locationDistribution.map((_: any, i: number) => (
                      <Cell key={i} fill={LOCATION_COLORS[i % LOCATION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CVCard>}
      </div>

      {/* Row 3: Care Plan Trends + Improvement vs Duration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Care Plan Trends - Multi-line Chart */}
        {isChartVisible("carePlanTrends") && <CVCard
          accentColor={"#4f46e5"}
          title="Care Plan Trends"
          subtitle="Shows monthly enrollment trends across different care plan types."
          tooltipText="Multi-line chart tracking monthly enrollment trends for each care plan type (Prime Health, Supreme Health, Calorie Fit, Pro Health). Dots mark data points. Use this to identify seasonal patterns, growth trajectories, and plan popularity over time."
          chartData={data.carePlanTrends}
          chartDescription="Monthly enrollment trends for each LSMP care plan type over time — reveals which plans are growing, seasonal enrollment patterns, and which plan type needs intervention to sustain participation."

        >
          <div className="overflow-x-auto">
            <div style={{ height: 300, minWidth: Math.max(500, ((data.carePlanTrends as any[])?.length || 12) * 50) }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.carePlanTrends as any[]} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: T.textMuted }} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [formatNum(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="primeHealth" name="Prime Health" stroke="#4f46e5" strokeWidth={2} dot={{ r: 4, fill: "#4f46e5" }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="supremeHealth" name="Supreme Health" stroke="#0d9488" strokeWidth={2} dot={{ r: 4, fill: "#0d9488" }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="calorieFit" name="Calorie Fit" stroke="#818cf8" strokeWidth={2} dot={{ r: 4, fill: "#818cf8" }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="proHealth" name="Pro Health" stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: "#a78bfa" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CVCard>}

        {/* Improvement vs Duration - Grouped Bar Chart */}
        {isChartVisible("improvementVsDuration") && <CVCard
          accentColor={T.teal}
          title="Improvement vs Duration"
          subtitle="Compares improvement outcomes against time spent in care plan."
          tooltipText="Grouped bar chart showing patient outcomes (Improvement, Partial, No Change, Inconclusive) across care plan duration brackets (<3M, 3-6M, 6-12M, >12M). Reveals whether longer engagement leads to better health outcomes."
          chartData={data.improvementVsDuration}
          chartDescription="Grouped bar chart comparing health improvement outcomes across care plan duration brackets (<3 months, 3–6 months, 6–12 months, >12 months) — answers whether staying enrolled longer produces meaningfully better outcomes."
        >
          <div className="overflow-x-auto">
            <div style={{ height: 300, minWidth: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.improvementVsDuration as any[]} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="duration" tick={{ fontSize: 11, fill: T.textMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                  <RechartsTooltip contentStyle={tooltipStyle} formatter={(v: any, name: any) => [formatNum(Number(v)), String(name)]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="improvement" name="Improvement" fill="#0d9488" radius={[3, 3, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="partial" name="Partial" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="noChange" name="No Change" fill="#a78bfa" radius={[3, 3, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="inconclusive" name="Inconclusive" fill="#a1a1aa" radius={[3, 3, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CVCard>}
      </div>

      {/* Row 4: Compliance Trigger Pattern Analysis - Table */}
      {isChartVisible("complianceTrigger") && <CVCard
        accentColor={"#6366f1"}
        title="Compliance Trigger Pattern Analysis"
        subtitle="Shows compliance rates by age group, gender, and facility."
        tooltipText="Color-coded table showing compliance percentages across demographic segments and facilities. Green (80%+) = high, Blue (70-79%) = medium, Purple (<70%) = low."
        chartData={data.complianceTriggerPattern}
        chartDescription="Heat-map table showing care plan compliance rates across age group, gender, and facility dimensions — green cells (80%+) indicate high compliance, while purple cells (<70%) flag specific demographic-facility combinations that need targeted intervention."

      >
        <div className="overflow-x-auto mt-3">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[12px] font-bold py-3 px-4" style={{ color: T.textPrimary }}>Demographics</th>
                {data.complianceTriggerPattern.columns.map((col: string) => (
                  <th key={col} className="text-left text-[12px] font-bold py-3 px-4" style={{ color: T.textPrimary }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.complianceTriggerPattern.rows.map((row: string, ri: number) => (
                <tr key={row}>
                  <td className="text-[12px] font-medium py-3 px-4" style={{ color: T.textPrimary, borderTop: `1px solid ${T.borderLight}` }}>{row}</td>
                  {data.complianceTriggerPattern.data[ri].map((val: number, ci: number) => (
                    <td
                      key={ci}
                      className="text-[13px] font-bold py-3 px-4 text-white text-center"
                      style={{ backgroundColor: getComplianceCellBg(val), borderTop: "2px solid #fff" }}
                    >
                      {val}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-5 mt-4 px-2">
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: "#0d9488" }} />
              <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>Green (high): 80%+</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: "#818cf8" }} />
              <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>Cream (medium): 70-79%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: "#a78bfa" }} />
              <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>Lavender (low): &lt;70%</span>
            </div>
          </div>
        </div>
      </CVCard>}
    </div>
  );
}
