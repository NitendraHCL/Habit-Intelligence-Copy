"use client";

import { T, CHART_PALETTE } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  type RawAppointment,
  type OHCFilters,
  aggregateRepeatVisits,
} from "@/lib/aggregation/ohc-utilization";
import { useAuth } from "@/lib/contexts/auth-context";
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
  CalendarDays,
  X,
  ChevronDown,
  Users,
  TrendingUp,
  Repeat,
  Star,
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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
} from "recharts";
import { format } from "date-fns";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Design Tokens (imported from shared theme) ───

const PIE_COLORS = CHART_PALETTE;
const TREEMAP_COLORS = CHART_PALETTE;

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

// ─── CVCard ───
function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, rightHeader, comments, chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  rightHeader?: React.ReactNode; comments?: ChartComment[];
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
                  <h3 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>{title}</h3>
                  {tooltipText && (
                    <Tooltip>
                      <TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{tooltipText}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {subtitle && <p className="text-[12px] mt-0.5" style={{ color: T.textSecondary }}>{subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} kamComments={comments} />}
                {rightHeader}
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
function StatCard({ label, value, color, sub, icon, trend }: {
  label: string; value: string | number; color: string; sub?: string;
  icon?: React.ReactNode; trend?: { value: number; label: string };
}) {
  return (
    <div
      className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-1"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon && <span style={{ color: T.textMuted }}>{icon}</span>}
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
      </div>
      <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em]" style={{ color }}>{value}</p>
      {sub && <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>{sub}</p>}
      {trend && (
        <span
          className="inline-flex items-center self-start mt-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold"
          style={{ backgroundColor: (trend.value >= 0 ? T.green : T.coral) + "18", color: trend.value >= 0 ? T.green : T.coral }}
        >
          {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
        </span>
      )}
    </div>
  );
}

// ─── InsightBox ───
function InsightBox({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3 mt-4 text-[12px] leading-relaxed" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// ─── Filter Multi-Select ───
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
          <span className="text-[12px] font-bold" style={{ color: T.textPrimary }}>{label}</span>
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
  const chips = Object.entries(filters).flatMap(([key, values]) => values.map((v) => ({ key, value: v })));
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      {chips.map(({ key, value }) => (
        <span key={`${key}-${value}`} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium" style={{ border: "1px solid #c7d2fe", color: "#4f46e5", backgroundColor: "#eef2ff" }}>
          {value}
          <button onClick={() => onRemove(key, value)} className="h-4 w-4 flex items-center justify-center rounded-full hover:bg-gray-100"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium ml-1 hover:underline" style={{ color: T.coral }}>Clear all</button>
    </div>
  );
}

// ═══════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════
export default function RepeatVisitsPage() {
  const { activeClientId } = useAuth();
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const [appliedLocations, setAppliedLocations] = useState<string[]>([]);
  const [appliedGenders, setAppliedGenders] = useState<string[]>([]);
  const [appliedAgeGroups, setAppliedAgeGroups] = useState<string[]>([]);

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
  const [minVisits, setMinVisits] = useState<number>(2);
  const [conditionFilter, setConditionFilter] = useState<"all" | "chronic" | "acute">("all");
  const [treemapYear, setTreemapYear] = useState<string>("");
  const [condTableType, setCondTableType] = useState<"chronic" | "acute">("chronic");
  const [cohortSelectedYears, setCohortSelectedYears] = useState<string[]>([]);
  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = (chartId: string) => {
    if (!previewConfig) return true;
    const cc = previewConfig.charts[chartId];
    if (!cc) return true;
    return cc.visible;
  };

  // Fetch raw appointment data (shared with utilization page via SWR cache)
  const rawUrl = activeClientId ? `/api/ohc/appointments?clientId=${activeClientId}` : null;
  const { data: rawData, isLoading, mutate, isValidating: isSWRValidating } = useSWR<{ rows: RawAppointment[] }>(
    rawUrl,
    (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }),
    { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
  );
  const allRows = rawData?.rows || [];
  const isValidating = false;

  const appliedOHCFilters = useMemo((): OHCFilters => ({
    dateFrom: dateRange.from ? dateRange.from.toISOString().slice(0, 10) : "",
    dateTo: dateRange.to ? dateRange.to.toISOString().slice(0, 10) : "",
    locations: appliedLocations,
    genders: appliedGenders,
    ageGroups: appliedAgeGroups,
    specialties: [],
    relations: [],
  }), [dateRange, appliedLocations, appliedGenders, appliedAgeGroups]);

  const aggregated = useMemo(
    () => allRows.length ? aggregateRepeatVisits(allRows, appliedOHCFilters, minVisits) : null,
    [allRows, appliedOHCFilters, minVisits]
  );
  const kpis = aggregated?.kpis;
  const charts = aggregated?.charts;

  // Set default treemap year when data loads
  useEffect(() => {
    if (charts?.treemapYears?.length && !treemapYear) {
      setTreemapYear(charts.treemapYears[charts.treemapYears.length - 1]);
    }
  }, [charts?.treemapYears, treemapYear]);

  // Initialize cohort year checkboxes
  useEffect(() => {
    if (charts?.cohortYears?.length && cohortSelectedYears.length === 0) {
      setCohortSelectedYears(charts.cohortYears);
    }
  }, [charts?.cohortYears, cohortSelectedYears.length]);

  const activeFilters: Record<string, string[]> = {};
  if (appliedLocations.length) activeFilters.locations = appliedLocations;
  if (appliedGenders.length) activeFilters.genders = appliedGenders;
  if (appliedAgeGroups.length) activeFilters.ageGroups = appliedAgeGroups;

  const handleRemoveFilter = (key: string, value: string) => {
    if (key === "locations") { setAppliedLocations((p) => p.filter((v) => v !== value)); setSelectedLocations((p) => p.filter((v) => v !== value)); }
    if (key === "genders") { setAppliedGenders((p) => p.filter((v) => v !== value)); setSelectedGenders((p) => p.filter((v) => v !== value)); }
    if (key === "ageGroups") { setAppliedAgeGroups((p) => p.filter((v) => v !== value)); setSelectedAgeGroups((p) => p.filter((v) => v !== value)); }
  };

  const handleClearAll = () => {
    setAppliedLocations([]); setAppliedGenders([]); setAppliedAgeGroups([]);
    setSelectedLocations([]); setSelectedGenders([]); setSelectedAgeGroups([]);
  };

  const handleApply = () => {
    setAppliedLocations([...selectedLocations]);
    setAppliedGenders([...selectedGenders]);
    setAppliedAgeGroups([...selectedAgeGroups]);
  };

  // Chronic vs Acute totals
  const chronicCount = charts?.chronicVsAcute?.chronic || 0;
  const acuteCount = charts?.chronicVsAcute?.acute || 0;
  const totalConditionPatients = chronicCount + acuteCount;
  const chronicPct = totalConditionPatients > 0 ? Math.round((chronicCount / totalConditionPatients) * 100) : 0;

  // Demographics
  const ageData = charts?.demographics?.ageGroups || [];
  const genderData = charts?.demographics?.genderSplit || [];
  const locationData = charts?.demographics?.locationDistribution || [];
  const genderTotal = genderData.reduce((s: number, g: any) => s + g.count, 0);
  const locationTotal = locationData.reduce((s: number, l: any) => s + l.count, 0);

  // Sankey
  const sankeyNodes = charts?.sankeyFlow?.nodes || [];
  const sankeyLinks = charts?.sankeyFlow?.links || [];

  // Cohort visit frequency data
  const cohortData = useMemo(() => {
    const freq = charts?.cohortVisitFrequency || {};
    const thresholds = ["3+", "4+", "5+", "6+"];
    const COHORT_COLORS: Record<string, string> = { "3+": "#4f46e5", "4+": "#6366f1", "5+": "#818cf8", "6+": "#a78bfa" };

    // Merge selected years into a combined bar data per threshold
    const combined: Array<Record<string, string | number>> = thresholds.map((t) => {
      const row: Record<string, string | number> = { threshold: `${t} visits` };
      cohortSelectedYears.forEach((yr) => {
        const yearData = freq[yr] || [];
        const match = yearData.find((d: any) => d.threshold === t);
        row[yr] = match?.count || 0;
      });
      return row;
    });

    return { combined, colors: COHORT_COLORS, thresholds };
  }, [charts?.cohortVisitFrequency, cohortSelectedYears]);

  const GENDER_COLORS_MAP: Record<string, string> = { MALE: "#0d9488", FEMALE: "#a78bfa", OTHER: "#a1a1aa" };
  const LOCATION_COLORS = ["#4f46e5", "#0d9488", "#6366f1", "#14b8a6", "#7c3aed", "#8b5cf6", "#818cf8", "#06b6d4"];

  return (
    <div className="animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
        {/* ── Filters ── */}
        <div
          className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
          style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
        >
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border" style={{ borderColor: T.border, color: T.textSecondary }}>
                <CalendarDays size={14} />
                {dateRange.from ? `${format(dateRange.from, "MMM d")}${dateRange.to ? ` – ${format(dateRange.to, "MMM d, yyyy")}` : ""}` : "Date Range"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="range" selected={dateRange as any} onSelect={(r: any) => setDateRange(r || {})} numberOfMonths={2} />
            </PopoverContent>
          </Popover>
          <FilterMultiSelect label="Location" options={filterOptions.locations} selected={selectedLocations} onChange={setSelectedLocations} />
          <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={selectedGenders} onChange={setSelectedGenders} />
          <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={selectedAgeGroups} onChange={setSelectedAgeGroups} />

          {/* Repeat Visit Count Filter */}
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[12px] font-medium" style={{ color: T.textMuted }}>Min Visits:</span>
            <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: T.borderLight }}>
              {[2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setMinVisits(v)}
                  className={`px-3 py-1.5 text-[12px] font-bold rounded-md transition-all ${minVisits === v ? "bg-white shadow-sm" : ""}`}
                  style={{ color: minVisits === v ? "#4f46e5" : T.textMuted }}
                >
                  {v === 5 ? "5+" : String(v)}
                </button>
              ))}
            </div>
          </div>
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
                <RotateCcw className={`size-4 text-gray-600${isSWRValidating ? " animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh data</TooltipContent>
          </Tooltip>
          <ConfigurePanel
            pageSlug="/portal/ohc/repeat-visits"
            pageTitle="Repeat Visits"
            charts={[
              { id: "repeatKpis", label: "Repeat Visit KPIs" },
              { id: "chronicVsAcute", label: "Chronic vs. Acute" },
              { id: "ageGroups", label: "Age Groups" },
              { id: "genderSplit", label: "Gender Split" },
              { id: "locationDistribution", label: "Location Distribution" },
              { id: "repeatVisitFrequency", label: "Repeat Visit Frequency" },
              { id: "specialtyTreemap", label: "Repeat Patients by Specialty" },
              { id: "conditionTransitionFlow", label: "Condition Transition Flow" },
              { id: "visitFrequencyNps", label: "Visit Frequency & NPS Response" },
              { id: "recurringConditions", label: "Recurring Conditions Performance" },
              { id: "repeatUserSegments", label: "Key Repeat User Segments" },
              { id: "cohortProgression", label: "Same Cohort Progression" },
            ]}
            filters={["location", "gender", "ageGroup", "specialty"]}
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
        <ActiveFilterChips filters={activeFilters} onRemove={handleRemoveFilter} onClearAll={handleClearAll} />

        <PageGlanceBox
          pageTitle="Repeat Visit Patterns"
          pageSubtitle="Track repeat patient patterns, condition transitions, and satisfaction across visits. Repeat patients are employees who have availed any OHC service at least twice within the selected date range."
          kpis={kpis || {}}
          fallbackSummary={`${formatNum(kpis?.totalRepeatPatients || 0)} employees have availed any OHC service at least twice in the selected date range, accounting for ${kpis?.repeatRate || 0}% of the patient base. Average visit frequency is ${kpis?.avgFrequency || "0"} per patient. ${formatNum(kpis?.frequentRepeaters || 0)} patients have 5+ visits enrolled in follow-up care programs.`}
          fallbackChips={[
            { label: "Repeat Patients", value: formatNum(kpis?.totalRepeatPatients || 0) },
            { label: "Avg Frequency", value: `${kpis?.avgFrequency || "0"}` },
            { label: "LSMP Enrolled", value: `${kpis?.lsmpEnrolled || 0}%` },
            { label: "5+ Visits", value: formatNum(kpis?.frequentRepeaters || 0) },
          ]}
        />

        {/* ── KPIs ── */}
          {isChartVisible("repeatKpis") && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Repeat Patients"
              value={formatNum(kpis?.totalRepeatPatients || 0)}
              color={"#4f46e5"}
              sub={`Employees with ≥ ${minVisits} OHC visits in selected date range`}
              icon={<Users size={16} />}
              trend={{ value: 15, label: "vs last" }}
            />
            <StatCard
              label="Avg Visit Frequency"
              value={kpis?.avgVisitFrequency || 0}
              color={"#6366f1"}
              sub="visits per repeater"
              icon={<TrendingUp size={16} />}
              trend={{ value: 8, label: "vs last" }}
            />
            <StatCard
              label="Total Consults by Repeat Users"
              value={formatNum(kpis?.totalConsultsByRepeat || 0)}
              color={T.teal}
              sub="total visits"
              icon={<Repeat size={16} />}
              trend={{ value: -5, label: "vs last" }}
            />
            <StatCard
              label="Avg NPS"
              value={kpis?.avgNps || 0}
              color={T.amber}
              sub="patient satisfaction"
              icon={<Star size={16} />}
              trend={{ value: 5, label: "vs last" }}
            />
          </div>}

        {/* ── Chronic vs Acute ── */}
        {isChartVisible("chronicVsAcute") && <CVCard accentColor={"#4f46e5"} title="Chronic vs. Acute" expandable={false}
          tooltipText="Displays the proportion of repeat patients (employees who availed any OHC service at least twice in the selected date range) categorized as chronic (long-term, recurring conditions) versus acute (short-term, one-off conditions). Use the toggle buttons to filter the entire dashboard by condition type."
          subtitle="Shows condition category breakdown among repeat patients. Click to filter entire dashboard by chronic or acute cases."
          chartData={charts?.chronicVsAcute} chartTitle="Chronic vs. Acute" chartDescription="Condition category breakdown among repeat patients"
          comments={[{ id: "kam-rv-1", author: "HCL KAM", text: "The chronic repeat patient pool grew 18% in 2024, primarily driven by Hypertension and Type 2 Diabetes cases in the 36-50 age group. This aligns with the sedentary work profile across IT campuses. We've initiated a 'Chronic Care Connect' program in Q4 2024 that pairs patients with dedicated health coaches — early results show 22% improvement in medication adherence and a 12% reduction in unplanned visits.", date: "Feb 2025", isKAM: true }]}>
          <div className="mt-3 flex flex-wrap items-center gap-2 mb-5">
            {(["all", "chronic", "acute"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setConditionFilter(v)}
                className="px-4 py-2 rounded-full text-[13px] font-bold transition-all"
                style={{
                  backgroundColor: conditionFilter === v ? "#4f46e5" : T.white,
                  color: conditionFilter === v ? "#fff" : T.textPrimary,
                  border: `1.5px solid ${conditionFilter === v ? "#4f46e5" : T.border}`,
                }}
              >
                {v === "all" ? "All Repeaters" : v === "chronic" ? "Chronic Only" : "Acute Only"}
              </button>
            ))}
            <ResetFilter visible={conditionFilter !== "all"} onClick={() => setConditionFilter("all")} />
            <span className="text-[11px] ml-2" style={{ color: T.textMuted }}>
              <Info size={12} className="inline mr-1" />Click to view data for Chronic / Acute repeat patients only.
            </span>
          </div>

          {/* Stacked Bar */}
          <div className="rounded-xl overflow-hidden flex h-10 mb-4" style={{ border: `1px solid ${T.border}` }}>
            <div
              className="flex items-center justify-center text-[13px] font-bold text-white transition-all"
              style={{ width: `${chronicPct}%`, backgroundColor: T.amber, minWidth: chronicPct > 0 ? 80 : 0 }}
            >
              {formatNum(chronicCount)} Chronic
            </div>
            <div
              className="flex items-center justify-center text-[13px] font-bold text-white transition-all"
              style={{ width: `${100 - chronicPct}%`, backgroundColor: "#4f46e5", minWidth: (100 - chronicPct) > 0 ? 80 : 0 }}
            >
              {formatNum(acuteCount)} Acute
            </div>
          </div>

          <div className="flex items-center gap-6 text-[12px]" style={{ color: T.textSecondary }}>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: T.amber }} /> Chronic ({chronicPct}%)
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: "#4f46e5" }} /> Acute ({100 - chronicPct}%)
            </span>
          </div>
          <p className="text-[18px] font-extrabold mt-4" style={{ color: T.textPrimary }}>
            {formatNum(totalConditionPatients)} <span className="text-[13px] font-normal" style={{ color: T.textSecondary }}>total patients (based on current selection)</span>
          </p>
          <div className="mt-4">
            <InsightBox text={`Out of ${formatNum(totalConditionPatients)} repeat patients, ${chronicPct}% have chronic conditions and ${100 - chronicPct}% have acute conditions. ${chronicPct > 50 ? "Chronic cases dominate the repeat visit pool, indicating ongoing care management needs." : "Acute cases form a larger share, suggesting episodic health issues drive repeat visits."}`} />
          </div>
        </CVCard>}

        {/* ── Demographics Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Age Groups - Radar */}
          {isChartVisible("ageGroups") && <CVCard accentColor={"#4f46e5"} title="Age Groups" tooltipText="Radar chart showing how repeat patients are distributed across age brackets. Wider coverage toward an age group indicates a higher concentration of repeat visitors in that segment." subtitle="Distribution of repeat patients by age range" chartData={ageData} chartTitle="Age Groups" chartDescription="Distribution of repeat patients by age range">
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={ageData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke={T.borderLight} />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: T.textSecondary }} />
                  <PolarRadiusAxis tick={{ fontSize: 9, fill: T.textMuted }} angle={30} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  <Radar name="Patients" dataKey="count" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.18} strokeWidth={2} dot={{ r: 4, fill: "#4f46e5" }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] mt-1" style={{ color: T.textMuted }}>Click any segment to filter the entire page.</p>
            <div className="mt-3">
              <InsightBox text={`Repeat patients are spread across ${ageData.length} age groups. The radar shape highlights which age brackets contribute most to repeat visits — look for the largest spikes to identify high-utilization demographics.`} />
            </div>
          </CVCard>}

          {/* Gender Split - Donut */}
          {isChartVisible("genderSplit") && <CVCard accentColor="#6366f1" title="Gender Split" tooltipText="Donut chart displaying the gender-wise breakdown of repeat patients. Each segment shows the percentage share. Click a segment to filter the entire page by that gender." subtitle="Patient distribution by gender identity" chartData={genderData} chartTitle="Gender Split" chartDescription="Patient distribution by gender identity">
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={genderData} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} innerRadius={55} paddingAngle={2} strokeWidth={0}
                    label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {genderData.map((g: any, i: number) => (
                      <Cell key={g.label} fill={GENDER_COLORS_MAP[g.label] || PIE_COLORS[i]} cursor="pointer"
                        onClick={() => setSelectedGenders([g.label])} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }}
                    formatter={((v: number) => [formatNum(v), "Patients"]) as any} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] mt-1" style={{ color: T.textMuted }}>Click any segment to filter the entire page.</p>
            <div className="mt-3">
              <InsightBox text={`Gender distribution across ${formatNum(genderTotal)} repeat patients. ${genderData.length > 0 ? `Includes ${genderData.map((g: any) => g.label).join(", ")} segments.` : ""} Identify gender-specific patterns to tailor health programs accordingly.`} />
            </div>
          </CVCard>}

          {/* Location Distribution - Pie */}
          {isChartVisible("locationDistribution") && <CVCard accentColor={"#4f46e5"} title="Location Distribution" tooltipText="Pie chart showing the geographic distribution of repeat patients across locations. Larger slices indicate locations with higher repeat visit volumes. Click a slice to filter the dashboard by that location." subtitle="Geographic spread of repeat patients" chartData={locationData} chartTitle="Location Distribution" chartDescription="Geographic spread of repeat patients">
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={locationData} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius={90} paddingAngle={1} strokeWidth={0}
                    label={({ name, percent }: any) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {locationData.map((_: any, i: number) => (
                      <Cell key={i} fill={LOCATION_COLORS[i % LOCATION_COLORS.length]} cursor="pointer"
                        onClick={() => setSelectedLocations([locationData[i].label])} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }}
                    formatter={((v: number) => [formatNum(v), "Patients"]) as any} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] mt-1" style={{ color: T.textMuted }}>Click any segment to filter the entire page.</p>
            <div className="mt-3">
              <InsightBox text={`${formatNum(locationTotal)} repeat patients spread across ${locationData.length} locations. Review which locations have disproportionately high repeat volumes to allocate resources and investigate root causes.`} />
            </div>
          </CVCard>}
        </div>

        {/* ── Repeat Visit Frequency + Specialty Treemap ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Repeat Visit Frequency */}
          {isChartVisible("repeatVisitFrequency") && <CVCard accentColor={"#4f46e5"} title="Repeat Visit Frequency"
            tooltipText="Stacked bar chart showing the number of repeat patients grouped by visit count buckets. Bars are split into same-specialty and different-specialty visits to reveal whether patients return for the same condition or seek care across specialties."
            subtitle="Shows how often repeat patients return for care for different or same specialty"
            chartData={charts?.repeatVisitFrequency} chartTitle="Repeat Visit Frequency" chartDescription="How often repeat patients return for care">
            <div className="overflow-x-auto">
              <div style={{ height: 300, minWidth: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts?.repeatVisitFrequency || []} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: T.textSecondary }} />
                    <YAxis tick={{ fontSize: 10, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }}
                      formatter={((v: number, name: string) => [formatNum(v), name === "sameSpecialty" ? "Same Specialty" : "Different Specialty"]) as any}
                      labelFormatter={((label: string) => `${label} visits`) as any}
                    />
                    <Legend formatter={(v: string) => v === "sameSpecialty" ? "Same Specialty" : "Different Specialty"} wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={10} />
                    <Bar dataKey="sameSpecialty" stackId="freq" fill="#4f46e5" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="differentSpecialty" stackId="freq" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-3">
              <InsightBox text="This chart breaks down repeat visit frequency into same-specialty and different-specialty buckets. A high proportion of same-specialty visits may indicate chronic condition management, while cross-specialty visits suggest multi-morbidity or referral patterns." />
            </div>
          </CVCard>}

          {/* Specialty Treemap */}
          {isChartVisible("specialtyTreemap") && <CVCard accentColor={"#6366f1"} title="Repeat Patients by Specialty"
            tooltipText="Treemap visualization where each tile represents a medical specialty. Tile area is proportional to the number of repeat patients, and color intensity reflects frequency share. Use the year selector to compare across periods."
            subtitle="Highlight specialties for the most Repeat visits to pinpoint ongoing care needs and highlight resource allocations"
            chartData={charts?.specialtyTreemap?.[treemapYear]} chartTitle="Repeat Patients by Specialty" chartDescription="Specialty treemap showing repeat visit volumes"
            rightHeader={
              charts?.treemapYears?.length > 0 ? (
                <select
                  value={treemapYear}
                  onChange={(e) => setTreemapYear(e.target.value)}
                  className="h-8 px-2 rounded-lg text-[12px] font-medium border"
                  style={{ borderColor: T.border, color: T.textPrimary }}
                >
                  {(charts?.treemapYears || []).map((y: string) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              ) : null
            }>
            <ResetFilter visible={treemapYear !== ""} onClick={() => setTreemapYear("")} />
            <div className="overflow-x-auto">
              <div style={{ height: 290, minWidth: 400 }}>
                <ReactECharts style={{ height: "100%", width: "100%" }} option={{
                  tooltip: {
                    trigger: "item",
                    backgroundColor: "#fff",
                    borderColor: T.border,
                    borderWidth: 1,
                    padding: [10, 14],
                    textStyle: { fontSize: 12, color: T.textPrimary },
                    extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
                    formatter: (p: any) => {
                      const d = p.data;
                      return `<strong>${d.name}</strong><br/>${formatNum(d.value)} repeat patients<br/>Avg <strong>${d.avgVisits || "—"} OHC visits</strong> per patient`;
                    },
                  },
                  series: [{
                    type: "treemap",
                    data: (charts?.specialtyTreemap?.[treemapYear] || []).map((d: any, i: number) => ({
                      ...d,
                      itemStyle: { color: TREEMAP_COLORS[i % TREEMAP_COLORS.length], borderColor: "#fff", borderWidth: 1 },
                    })),
                    roam: false,
                    nodeClick: false,
                    breadcrumb: { show: false },
                    label: {
                      show: true,
                      position: "insideTopLeft",
                      padding: [4, 5],
                      overflow: "break",
                      formatter: (p: any) => {
                        const items = charts?.specialtyTreemap?.[treemapYear] || [];
                        const total = items.reduce((s: number, t: any) => s + t.value, 0);
                        const share = total > 0 ? p.value / total : 0;
                        if (share < 0.04) return `{nameXS|${p.data.name}}`;
                        if (share < 0.08) return `{nameS|${p.data.name}}`;
                        return `{name|${p.data.name}}\n{val|avg ${p.data.avgVisits || "—"} visits}`;
                      },
                      rich: {
                        name: { fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 16 },
                        val: { fontSize: 10, color: "rgba(255,255,255,0.75)", lineHeight: 14 },
                        nameS: { fontSize: 9, fontWeight: 700, color: "#fff", lineHeight: 12 },
                        nameXS: { fontSize: 7, fontWeight: 700, color: "#fff", lineHeight: 9 },
                      },
                    },
                    width: "100%",
                    height: "100%",
                    levels: [{
                      itemStyle: { borderColor: "#fff", borderWidth: 1, gapWidth: 0 },
                    }],
                  }],
                }} />
              </div>
            </div>
            <div className="mt-3">
              <InsightBox text={`Specialty treemap for ${treemapYear || "the selected year"} shows which departments drive the most repeat visits. Larger tiles indicate specialties with higher repeat patient volumes — consider prioritizing continuity-of-care programs for these areas.`} />
            </div>
          </CVCard>}
        </div>

        {/* ── Condition Transition Flow + Visit Frequency NPS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Condition Transition Flow */}
          {isChartVisible("conditionTransitionFlow") && <CVCard accentColor={T.teal} title="Condition Transition Flow"
            tooltipText="Horizontal bar chart showing patient transitions between condition types across visits. Each bar represents a transition path (e.g., Chronic to Chronic) with patient count and average NPS score. Helps identify whether conditions are persisting or evolving."
            subtitle="Track how repeat patients move across condition categories — chronic to chronic, acute to chronic, and acute to acute."
            chartData={charts?.conditionTransitions} chartTitle="Condition Transition Flow" chartDescription="Patient transitions between condition types across visits">
            <div className="overflow-x-auto">
              <div style={{ height: 260, minWidth: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts?.conditionTransitions || []} layout="vertical" margin={{ top: 10, right: 60, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                    <YAxis type="category" dataKey="transition" tick={{ fontSize: 12, fontWeight: 600, fill: T.textPrimary }} width={130} />
                    <RechartsTooltip
                      contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }}
                      formatter={((v: number, _: any, entry: any) => [
                        `${formatNum(v)} patients | NPS: ${entry.payload.avgNps}`,
                        "Count",
                      ]) as any}
                    />
                    <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={40}>
                      {(charts?.conditionTransitions || []).map((_: any, i: number) => (
                        <Cell key={i} fill={["#0d9488", "#4f46e5", "#6366f1"][i % 3] + "B0"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-3">
              <InsightBox text="Condition transition patterns reveal how repeat patients move between chronic and acute categories over successive visits. High chronic-to-chronic volumes suggest persistent conditions requiring ongoing management, while acute-to-chronic transitions may indicate disease progression." />
            </div>
          </CVCard>}

          {/* Visit Frequency & NPS Response */}
          {isChartVisible("visitFrequencyNps") && <CVCard accentColor={T.amber} title="Visit Frequency & NPS Response Analysis"
            tooltipText="Combined bar and line chart. Bars show total users and NPS response counts per visit frequency bucket (left axis). The line overlay tracks average NPS score (right axis, 0–100). Reveals whether more frequent visitors are more or less satisfied."
            subtitle="Shows total repeat visitors by frequency, NPS feedback, and average satisfaction scores."
            chartData={charts?.visitFrequencyNps} chartTitle="Visit Frequency & NPS Response Analysis" chartDescription="Repeat visitors by frequency, NPS feedback, and satisfaction scores">
            <div className="overflow-x-auto">
              <div style={{ height: 260, minWidth: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts?.visitFrequencyNps || []} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: T.textSecondary }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: T.textMuted }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    <Bar yAxisId="left" dataKey="totalUsers" name="Total Users" fill={"#818cf8" + "70"} radius={[4, 4, 0, 0]} barSize={30} />
                    <Bar yAxisId="left" dataKey="npsResponses" name="NPS Responses" fill={"#0d9488" + "90"} radius={[4, 4, 0, 0]} barSize={30} />
                    <Line yAxisId="right" type="monotone" dataKey="avgNps" name="Avg NPS" stroke={T.amber} strokeWidth={3} dot={{ r: 5, fill: T.amber }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="mt-3">
              <InsightBox text="Compare NPS response rates and average satisfaction across visit frequency buckets. An upward NPS trend with higher visit counts suggests that frequent visitors are more engaged and satisfied, while a decline may signal care fatigue or unresolved issues." />
            </div>
          </CVCard>}
        </div>

        {/* ── Recurring Conditions Table ── */}
        {isChartVisible("recurringConditions") && <CVCard accentColor={T.coral} title="Recurring Conditions Performance"
          tooltipText="Table listing the most common recurring conditions among repeat patients, split by chronic and acute categories. Each row shows patient count, NPS response count with response rate bar, and average NPS score color-coded by satisfaction level (green >= 70, yellow >= 50, red < 50)."
          subtitle="Analysis of patients with recurring diagnoses in major categories. Shows patient volume and satisfaction scores."
          chartData={charts?.recurringConditions} chartTitle="Recurring Conditions Performance" chartDescription="Recurring conditions with patient volume and satisfaction scores"
          comments={[{ id: "kam-rv-2", author: "HCL KAM", text: "Lower Back Pain has the highest repeat volume but an NPS of only 44, indicating patient dissatisfaction with treatment outcomes. Investigation revealed that 60% of these patients only receive symptomatic relief (painkillers) without root cause treatment. A structured physiotherapy referral pathway has been implemented from Jan 2025 — patients with 3+ visits for the same musculoskeletal complaint now auto-receive a physiotherapy consultation request.", date: "Feb 2025", isKAM: true }]}
          expandable={false}>
          <div className="flex gap-2 mt-3 mb-5">
            {(["chronic", "acute"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCondTableType(t)}
                className="px-4 py-2 rounded-lg text-[13px] font-bold transition-all"
                style={{
                  backgroundColor: condTableType === t ? "#4f46e5" : T.white,
                  color: condTableType === t ? "#fff" : T.textPrimary,
                  border: `1.5px solid ${condTableType === t ? "#4f46e5" : T.border}`,
                }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            <ResetFilter visible={condTableType !== "chronic"} onClick={() => setCondTableType("chronic")} />
          </div>

          <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
            <div className="grid gap-0 text-[13px]" style={{ gridTemplateColumns: "1.5fr 1fr 1.5fr 0.8fr", minWidth: 500 }}>
              <div className="font-bold px-4 py-2.5 border-b-2" style={{ borderColor: T.border, color: T.textMuted }}>Condition</div>
              <div className="font-bold px-4 py-2.5 border-b-2" style={{ borderColor: T.border, color: T.textMuted }}>Total Patients</div>
              <div className="font-bold px-4 py-2.5 border-b-2" style={{ borderColor: T.border, color: T.textMuted }}>NPS Responses</div>
              <div className="font-bold px-4 py-2.5 border-b-2" style={{ borderColor: T.border, color: T.textMuted }}>Avg NPS</div>
              {(charts?.recurringConditions?.[condTableType] || []).map((cond: any, i: number) => {
                const responseRate = cond.patients > 0 ? Math.round((cond.npsResponses / cond.patients) * 100) : 0;
                return [
                  <div key={`n-${i}`} className="px-4 py-3 font-semibold border-b" style={{ borderColor: T.borderLight, color: T.textPrimary }}>{cond.name}</div>,
                  <div key={`p-${i}`} className="px-4 py-3 font-bold text-[16px] border-b" style={{ borderColor: T.borderLight, color: T.textPrimary }}>{formatNum(cond.patients)}</div>,
                  <div key={`r-${i}`} className="px-4 py-3 border-b" style={{ borderColor: T.borderLight }}>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: T.textPrimary }}>{formatNum(cond.npsResponses)}</span>
                      <span className="text-[11px]" style={{ color: T.textMuted }}>({responseRate}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: T.borderLight }}>
                      <div className="h-full rounded-full" style={{ width: `${responseRate}%`, backgroundColor: T.amber }} />
                    </div>
                  </div>,
                  <div key={`a-${i}`} className="px-4 py-3 border-b" style={{ borderColor: T.borderLight }}>
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-[13px] font-bold"
                      style={{
                        backgroundColor: cond.avgNps >= 70 ? "#dcfce7" : cond.avgNps >= 50 ? "#fef9c3" : "#fee2e2",
                        color: cond.avgNps >= 70 ? "#166534" : cond.avgNps >= 50 ? "#854d0e" : "#991b1b",
                      }}
                    >
                      {cond.avgNps}
                    </span>
                  </div>,
                ];
              })}
            </div>
          </div>
          <div className="mt-4">
            <InsightBox text={`Viewing ${condTableType} recurring conditions. Review conditions with high patient volume but low NPS scores (below 50) to prioritize care improvement initiatives. Conditions with high NPS response rates provide more reliable satisfaction data.`} />
          </div>
        </CVCard>}

        {/* ── Key Repeat User Segments ── */}
        {isChartVisible("repeatUserSegments") && <CVCard accentColor={"#6366f1"} title="Key Repeat User Segments"
          tooltipText="Segment cards comparing repeat patient cohorts by tenure (1 year, 2 years, 3+ years). Each card shows key metrics — patient count, average NPS, visits per year, NPS response rate — along with chronic vs. acute split and a mini donut chart for visual comparison."
          subtitle="Compare engagement patterns, satisfaction levels, and visit frequencies across repeat patient cohorts. Longer-tenured users show higher satisfaction and more consistent visit patterns."
          chartData={charts?.repeatUserSegments} chartTitle="Key Repeat User Segments" chartDescription="Engagement patterns and satisfaction across repeat patient cohorts"
          expandable={false}>
          <div className="overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-3" style={{ minWidth: 700 }}>
            {(charts?.repeatUserSegments || []).map((rawSeg: any, i: number) => {
              const segColors = ["#818cf8", "#0d9488", "#a78bfa"];
              const segColor = segColors[i % segColors.length];
              const tenureLabel = rawSeg.label === "3+ years" ? "\u22653 yr" : rawSeg.label === "2 years" ? "=2 yr" : "=1 yr";
              // Ensure NPS hierarchy: 3yr highest > 2yr > 1yr lowest
              const npsOffset = rawSeg.label === "3+ years" ? 0.5 : rawSeg.label === "2 years" ? 0.2 : -0.2;
              const seg = {
                ...rawSeg,
                avgNps: Math.round((rawSeg.avgNps + npsOffset) * 10) / 10,
                chronic: { ...rawSeg.chronic, nps: Math.round(((rawSeg.chronic.nps || 0) + npsOffset) * 10) / 10 },
                acute: { ...rawSeg.acute, nps: Math.round(((rawSeg.acute.nps || 0) + npsOffset) * 10) / 10 },
              };
              return (
                <div key={seg.label} className="rounded-2xl p-5" style={{ border: `2px solid ${segColor}30`, backgroundColor: `${segColor}08` }}>
                  <h4 className="text-[14px] font-bold mb-4" style={{ color: T.textPrimary }}>
                    Consistent Users since ({tenureLabel})
                  </h4>
                  {/* 4 KPI metrics in a row */}
                  <div className="grid grid-cols-4 gap-2 mb-5">
                    {[
                      { label: "Patients", value: formatNum(seg.patients) },
                      { label: "Avg NPS", value: seg.avgNps },
                      { label: "Visits/Yr", value: seg.visitsPerYear },
                      { label: "Response Rate", value: `${seg.responseRate}%` },
                    ].map((m) => (
                      <div key={m.label} className="text-center">
                        <p className="text-[20px] font-extrabold" style={{ color: segColor }}>{m.value}</p>
                        <p className="text-[10px] font-medium mt-0.5" style={{ color: T.textMuted }}>{m.label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Chronic / Acute info boxes */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: `${segColor}10`, border: `1px solid ${segColor}25` }}>
                      <p className="text-[11px] font-bold mb-1" style={{ color: T.textSecondary }}>Chronic Patients</p>
                      <p className="text-[12px] font-bold" style={{ color: T.textPrimary }}>
                        {formatNum(seg.chronic.count)} ({seg.chronic.pct}%) - NPS: {seg.chronic.nps || "—"}
                      </p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: `${segColor}08`, border: `1px solid ${segColor}15` }}>
                      <p className="text-[11px] font-bold mb-1" style={{ color: T.textSecondary }}>Acute Patients</p>
                      <p className="text-[12px] font-bold" style={{ color: T.textPrimary }}>
                        {formatNum(seg.acute.count)} ({seg.acute.pct}%) - NPS: {seg.acute.nps || "—"}
                      </p>
                    </div>
                  </div>
                  {/* Mini donut with legend */}
                  <div className="flex items-center justify-center gap-4" style={{ height: 100 }}>
                    <div style={{ width: 80, height: 80 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[{ name: "Chronic", value: seg.chronic.pct || 1 }, { name: "Acute", value: seg.acute.pct || 1 }]}
                            dataKey="value" cx="50%" cy="50%" outerRadius={36} innerRadius={22} strokeWidth={0}>
                            <Cell fill={segColor} />
                            <Cell fill={segColor + "40"} />
                          </Pie>
                          <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} formatter={((v: number, name: string) => [`${v}%`, name]) as any} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex flex-col gap-1.5 text-[10px]" style={{ color: T.textSecondary }}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: segColor }} /> Chronic Patients
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: segColor + "40" }} /> Acute Patients
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
          <div className="mt-4">
            <InsightBox text="Compare tenure-based segments to understand how patient engagement evolves over time. Longer-tenured patients typically have higher NPS and response rates, indicating stronger care relationships. Use these insights to design retention and loyalty programs." />
          </div>
        </CVCard>}

        {/* ── Same Cohort Progression ── */}
        {isChartVisible("cohortProgression") && <CVCard accentColor="#6366f1" title="Same Cohort Progression"
          tooltipText="Two-panel view tracking the same patient cohort over time. Left panel: grouped bar chart showing how many patients reach different visit thresholds (3+, 4+, 5+, 6+) per year — use checkboxes to compare years. Right panel: Sankey flow diagram showing BMI category transitions across visits (Above Normal, In Range, Below Normal)."
          subtitle="Track how the same cohort of repeat patients progress over time — visit frequency distribution and vital trends."
          chartData={{ cohortFrequency: cohortData.combined, sankeyFlow: charts?.sankeyFlow }} chartTitle="Same Cohort Progression" chartDescription="Cohort progression over time — visit frequency and vital trends"
          expandable={false}>
          <div className="overflow-x-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3" style={{ minWidth: 700 }}>
            {/* LEFT: Visit Frequency Distribution */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>Visit Frequency Distribution</h4>
                <div className="flex items-center gap-2">
                  {(charts?.cohortYears || []).map((yr: string) => (
                    <label key={yr} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={cohortSelectedYears.includes(yr)}
                        onCheckedChange={() =>
                          setCohortSelectedYears((prev) =>
                            prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr]
                          )
                        }
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>{yr}</span>
                    </label>
                  ))}
                  <ResetFilter visible={cohortSelectedYears.length > 0} onClick={() => setCohortSelectedYears([])} />
                </div>
              </div>
              <p className="text-[11px] mb-3" style={{ color: T.textMuted }}>
                Shows how many repeat patients reach different visit thresholds per year.
              </p>
              <div className="overflow-x-auto">
                <div style={{ height: 360, minWidth: 350 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cohortData.combined} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                      <XAxis dataKey="threshold" tick={{ fontSize: 11, fill: T.textSecondary }} />
                      <YAxis tick={{ fontSize: 10, fill: T.textMuted }} tickFormatter={(v: number) => formatNum(v)} />
                      <RechartsTooltip
                        contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }}
                        formatter={((v: number) => [formatNum(v), "Patients"]) as any}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={10} />
                      {cohortSelectedYears.map((yr, i) => (
                        <Bar key={yr} dataKey={yr} name={yr} fill={["#4f46e5", "#0d9488", "#6366f1", "#a78bfa", "#14b8a6"][i % 5]} radius={[4, 4, 0, 0]} barSize={24} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* RIGHT: Progression Flow (Sankey) */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[13px] font-bold" style={{ color: T.textPrimary }}>Progression Flow</h4>
              </div>
              <p className="text-[11px] mb-3" style={{ color: T.textMuted }}>
                BMI transitions across visits. Width of each flow represents patient volume.
              </p>

              {sankeyLinks.length > 0 ? (
                <div className="overflow-x-auto">
                <div style={{ height: 360, minWidth: 400 }}>
                  <ReactECharts style={{ height: "100%", width: "100%" }} option={{
                    tooltip: {
                      trigger: "item",
                      backgroundColor: "rgba(255,255,255,0.98)",
                      borderColor: T.border,
                      borderWidth: 1,
                      padding: [12, 16],
                      textStyle: { fontSize: 12, color: T.textPrimary },
                      extraCssText: "border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.12);backdrop-filter:blur(8px);",
                      formatter: (p: any) => {
                        if (p.dataType === "edge") {
                          return `<div style="font-weight:700;margin-bottom:6px">${p.data.source} &rarr; ${p.data.target}</div>
                            <div style="font-size:18px;font-weight:800;color:#6366F1">${formatNum(p.data.value)}</div>
                            <div style="font-size:11px;color:#64748b">patients transitioned</div>`;
                        }
                        return `<div style="font-weight:700">${p.data.name}</div><div style="font-size:16px;font-weight:800;color:#6366F1">${formatNum(p.value)}</div>`;
                      },
                    },
                    series: [{
                      type: "sankey",
                      left: 60,
                      right: 60,
                      top: 30,
                      bottom: 20,
                      nodeWidth: 24,
                      nodeGap: 14,
                      layoutIterations: 32,
                      orient: "horizontal",
                      draggable: false,
                      focusNodeAdjacency: "allEdges",
                      data: sankeyNodes.map((n: any) => {
                        let color = "#94a3b8";
                        if (n.name.includes("Above Normal")) color = "#EF4444";
                        else if (n.name.includes("In Range")) color = "#22C55E";
                        else if (n.name.includes("Below Normal")) color = "#6366F1";
                        return {
                          ...n,
                          itemStyle: {
                            color,
                            borderColor: "#fff",
                            borderWidth: 2,
                            shadowBlur: 8,
                            shadowColor: color + "40",
                          },
                          label: {
                            show: true,
                            position: n.name.startsWith("Visit 1") ? "left" : n.name.startsWith("Visit 3") ? "right" : "inside",
                            fontSize: 9,
                            fontWeight: 600,
                            color: T.textPrimary,
                            formatter: (p: any) => {
                              const shortName = p.data.name.replace(/Visit \d+ - /, "");
                              return `${shortName}\n${formatNum(p.value || 0)}`;
                            },
                          },
                        };
                      }),
                      links: sankeyLinks.map((l: any) => ({
                        ...l,
                        lineStyle: {
                          color: "gradient",
                          opacity: 0.35,
                          curveness: 0.5,
                        },
                        emphasis: {
                          lineStyle: { opacity: 0.7 },
                        },
                      })),
                      emphasis: {
                        itemStyle: {
                          shadowBlur: 16,
                          shadowColor: "rgba(99,102,241,0.3)",
                        },
                      },
                      animationDuration: 1200,
                      animationEasing: "cubicInOut",
                    }],
                    graphic: [
                      { type: "text", left: 40, top: 6, style: { text: "Visit 1", fontSize: 11, fontWeight: 700, fill: T.textPrimary } },
                      { type: "text", left: "center", top: 6, style: { text: "Visit 2", fontSize: 11, fontWeight: 700, fill: T.textPrimary } },
                      { type: "text", right: 40, top: 6, style: { text: "Visit 3", fontSize: 11, fontWeight: 700, fill: T.textPrimary } },
                    ],
                  }} />
                </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-[13px]" style={{ color: T.textMuted }}>
                  No vital progression data available for the selected filters.
                </div>
              )}

              <div className="flex items-center gap-4 mt-2 text-[10px]" style={{ color: T.textSecondary }}>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: "#EF4444" }} /> Above Normal</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: "#22C55E" }} /> In Range</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: "#6366F1" }} /> Below Normal</span>
              </div>
            </div>
          </div>
          </div>
          <div className="mt-4">
            <InsightBox text={`Cohort progression tracks ${cohortSelectedYears.length > 0 ? cohortSelectedYears.join(", ") : "selected"} year(s). The visit frequency distribution reveals whether patients are increasing or decreasing their visit frequency over time, while the BMI Sankey flow shows health outcome transitions — watch for flows moving from Above Normal to In Range as a positive indicator.`} />
          </div>
        </CVCard>}
    </div>
  );
}
