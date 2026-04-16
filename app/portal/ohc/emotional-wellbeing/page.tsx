"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import {
  type RawAppointment,
  type OHCFilters,
  aggregateEmotionalWellbeing,
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
import {
  Info,
  Maximize2,
  Minimize2,
  CalendarDays,
  X,
  ChevronDown,
  TrendingUp,
  Users,
  Repeat,
  Download,
  Bell,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { format } from "date-fns";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ChartComments, type ChartComment } from "@/components/ui/chart-comments";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Design Tokens (imported from shared theme) ───

const IMPRESSION_PALETTE = [
  "#4f46e5", "#0d9488", "#818cf8", "#14b8a6", "#7c3aed", "#8b5cf6",
  "#a78bfa", "#06b6d4", "#34d399", "#6366f1", "#c4b5fd", "#a1a1aa",
];

function getImpressionColor(index: number): string {
  return IMPRESSION_PALETTE[index % IMPRESSION_PALETTE.length];
}

const SCALE_COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#a78bfa", "#c4b5fd"];

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(n);
}

function formatK(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card ───
function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, rightHeader, comments, chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; rightHeader?: React.ReactNode; comments?: ChartComment[];
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

// ─── Warm Section ───
function WarmSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-5 sm:p-6 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>{children}</div>;
}

// ─── Insight Box ───
function InsightBox({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3 mt-4 text-[12px] leading-relaxed" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// ─── Multi-select filter ───
function FilterMultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium transition-colors border hover:border-gray-300"
          style={{ borderColor: T.border, color: selected.length > 0 ? T.textPrimary : T.textSecondary, backgroundColor: T.white }}>
          {label}
          {selected.length > 0 && (
            <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: "#4f46e5" }}>{selected.length}</span>
          )}
          <ChevronDown size={13} style={{ color: T.textMuted }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2 max-h-72 overflow-hidden" align="start">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[12px] font-bold" style={{ color: T.textPrimary }}>{label}</span>
          {selected.length > 0 && <button onClick={() => onChange([])} className="text-[10px] font-medium hover:underline" style={{ color: T.coral }}>Clear</button>}
        </div>
        <ScrollArea className="max-h-56 overflow-y-auto">
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
function ActiveFilterChips({ filters, onRemove, onClearAll }: {
  filters: Record<string, string[]>; onRemove: (key: string, value: string) => void; onClearAll: () => void;
}) {
  const allChips = Object.entries(filters).flatMap(([key, values]) => values.map((v) => ({ key, value: v })));
  if (allChips.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-3">
      {allChips.map((chip) => (
        <span key={`${chip.key}-${chip.value}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium"
          style={{ backgroundColor: "#4f46e5" + "12", color: "#4f46e5", border: `1px solid ${"#4f46e5"}22` }}>
          {chip.value}
          <button onClick={() => onRemove(chip.key, chip.value)} className="hover:opacity-70 rounded-full p-0.5"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium ml-1 hover:underline" style={{ color: T.coral }}>Clear all</button>
    </div>
  );
}

// ─── Filter Options (defaults — overridden by /api/filters) ───

// ─── Stacked Percentage Bar ───
function StackedPercentBar({ data, colors }: { data: Array<{ label: string; count: number }>; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div className="text-[12px]" style={{ color: T.textMuted }}>No data</div>;
  return (
    <div>
      <div className="flex h-8 rounded-lg overflow-hidden mb-3">
        {data.map((d, i) => {
          const pct = Math.round((d.count / total) * 10000) / 100;
          if (pct < 1) return null;
          return (
            <div key={d.label} className="flex items-center justify-center text-[11px] font-bold text-white transition-all"
              style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length], minWidth: pct > 3 ? 40 : 0 }}>
              {pct > 5 ? `${pct.toFixed(pct >= 10 ? 0 : 1)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: T.textMuted }}>
        <span>0%</span><span>50%</span><span>100%</span>
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {data.map((d, i) => {
          const pct = Math.round((d.count / total) * 10000) / 100;
          return (
            <div key={d.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate max-w-[120px]">{d.label}</span>
              <span className="font-semibold" style={{ color: T.textPrimary }}>{formatNum(d.count)}</span>
              <span style={{ color: T.textMuted }}>({pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════
export default function EmotionalWellbeingPage() {
  const { activeClientId } = useAuth();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1), to: new Date(2026, 2, 31),
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [pageFilters, setPageFilters] = useState({
    ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], relations: [] as string[],
  });

  // "applied" state — what's actually used for aggregation (only updates on Apply click)
  const [appliedDateRange, setAppliedDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1), to: new Date(2026, 2, 31),
  });
  const [appliedFilters, setAppliedFilters] = useState({
    ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], relations: [] as string[],
  });

  const [demoTab, setDemoTab] = useState<"age" | "gender">("age");
  const [trendView, setTrendView] = useState<"year" | "month">("month");
  const [activeImpression, setActiveImpression] = useState<string>("");
  const [selectedVisitBucket, setSelectedVisitBucket] = useState<string>("");
  const [indiaMapReady, setIndiaMapReady] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = (chartId: string) => {
    if (!previewConfig) return true;
    const cc = previewConfig.charts[chartId];
    if (!cc) return true;
    return cc.visible;
  };

  useEffect(() => {
    Promise.all([
      import("echarts"),
      fetch("/geo/india.json").then((r) => r.json()),
    ])
      .then(([ec, geoJson]) => {
        ec.registerMap("india", geoJson as any);
        setIndiaMapReady(true);
      })
      .catch(() => setIndiaMapReady(true));
  }, []);

  // Fetch raw appointment data (shared with utilization page via SWR cache)
  const rawUrl = activeClientId ? `/api/ohc/appointments?clientId=${activeClientId}` : null;
  const { data: rawData, isLoading } = useSWR<{ rows: RawAppointment[] }>(
    rawUrl,
    (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }),
    { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
  );
  const allRows = rawData?.rows || [];
  const isValidating = false;

  // Derive filter options from raw data (Psychologist rows only)
  const filterOptions = useMemo(() => {
    const psychRows = allRows.filter((r) => r.speciality_name === "Psychologist");
    const locations = new Set<string>();
    const relations = new Set<string>();
    for (const r of psychRows) {
      if (r.facility_name?.trim()) locations.add(r.facility_name);
      if (r.relationship?.trim()) relations.add(r.relationship);
    }
    return {
      locations: Array.from(locations).sort(),
      genders: ["Male", "Female", "Others"],
      ageGroups: ["<20", "20-35", "36-40", "41-60", "61+"],
      specialties: [] as string[],
      relations: Array.from(relations).sort(),
    };
  }, [allRows]);

  const appliedOHCFilters = useMemo((): OHCFilters => ({
    dateFrom: format(appliedDateRange.from, "yyyy-MM-dd"),
    dateTo: format(appliedDateRange.to, "yyyy-MM-dd"),
    locations: appliedFilters.locations,
    genders: appliedFilters.genders,
    ageGroups: appliedFilters.ageGroups,
    specialties: [],
    relations: appliedFilters.relations,
  }), [appliedDateRange, appliedFilters]);

  const aggregated = useMemo(
    () => allRows.length ? aggregateEmotionalWellbeing(allRows, appliedOHCFilters) : null,
    [allRows, appliedOHCFilters]
  );
  const kpis = aggregated?.kpis;
  const charts = aggregated?.charts;

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], relations: [] as string[] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedFilters({ ...pageFilters });
  };

  // Trend data transformation
  const trendData = useMemo(() => {
    const raw: Array<{ period: string; totalConsults: number; uniquePatients: number }> = charts?.consultTrends || [];
    if (trendView === "year") {
      const byYear: Record<string, { totalConsults: number; uniquePatients: number }> = {};
      raw.forEach((r) => {
        const yr = r.period.substring(0, 4);
        if (!byYear[yr]) byYear[yr] = { totalConsults: 0, uniquePatients: 0 };
        byYear[yr].totalConsults += r.totalConsults;
        byYear[yr].uniquePatients += r.uniquePatients;
      });
      return Object.entries(byYear).map(([period, v]) => ({ period, ...v }));
    }
    return raw;
  }, [charts?.consultTrends, trendView]);

  // Demographics data
  const demoData: Array<{ label: string; count: number }> = charts?.demographics?.[demoTab] || [];

  // Impressions — filtered by selected visit bucket
  const allImpressions: Array<{ category: string; count: number }> = charts?.impressions || [];
  const impressionsByBucket: Record<string, Array<{ category: string; count: number }>> = charts?.impressionsByVisitBucket || {};
  const impressions = selectedVisitBucket && impressionsByBucket[selectedVisitBucket]
    ? impressionsByBucket[selectedVisitBucket]
    : allImpressions;
  const totalImpressions = impressions.reduce((s, i) => s + i.count, 0);
  const impressionColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    allImpressions.forEach((im, i) => { map[im.category] = getImpressionColor(i); });
    return map;
  }, [allImpressions]);
  const selectedImpression = activeImpression || impressions[0]?.category || "";
  const subcategories: Array<{ subcategory: string; count: number }> = charts?.impressionSubcategories?.[selectedImpression] || [];

  // Scales
  const anxietyScale: Array<{ label: string; count: number }> = charts?.anxietyScale || [];
  const depressionScale: Array<{ label: string; count: number }> = charts?.depressionScale || [];
  const selfEsteemScale: Array<{ label: string; count: number }> = charts?.selfEsteemScale || [];

  // Sleep, Alcohol, Smoking, Visit Pattern, Critical Risk, Substance Use
  const sleepQuality: Array<{ label: string; count: number }> = charts?.sleepQuality || [];
  const sleepDuration: Array<{ label: string; count: number }> = charts?.sleepDuration || [];
  const alcoholHabit: Array<{ label: string; count: number }> = charts?.alcoholHabit || [];
  const smokingHabit: Array<{ label: string; count: number }> = charts?.smokingHabit || [];
  const visitPattern: Array<{ label: string; count: number }> = charts?.visitPattern || [];
  const criticalRisk = charts?.criticalRisk || { suicidalThoughts: 0, attemptedSelfHarm: 0, previousAttempts: 0, totalCases: 0 };
  const totalEwbAssessed: number = kpis?.totalEwbAssessed || 0;
  const substanceUsePct: number = charts?.substanceUsePct || 0;

  const maxCritical = Math.max(criticalRisk.suicidalThoughts, criticalRisk.attemptedSelfHarm, criticalRisk.previousAttempts, 1);

  // Donut colors
  const SLEEP_DURATION_COLORS = ["#4f46e5", "#0d9488", "#818cf8"];
  const ALCOHOL_COLORS = ["#6366f1", "#a78bfa", "#0d9488", "#818cf8", "#a1a1aa"];
  // Semantic sleep quality colours: Good=teal, Average=amber, Poor=red
  const SLEEP_Q_ORDER = ["Good", "Average", "Poor"];
  const SLEEP_Q_COLORS: Record<string, string> = { Good: "#0d9488", Average: "#f59e0b", Poor: "#dc2626" };
  const sleepQualitySorted = SLEEP_Q_ORDER
    .map((label) => sleepQuality.find((s) => s.label === label))
    .filter(Boolean) as Array<{ label: string; count: number }>;

  if (!aggregated && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium border hover:border-gray-300 transition-colors"
              style={{ borderColor: T.border, color: T.textPrimary, backgroundColor: T.white }}>
              <CalendarDays size={14} style={{ color: T.textMuted }} />
              {format(dateRange.from, "dd-MM-yyyy")} &mdash; {format(dateRange.to, "dd-MM-yyyy")}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <Calendar mode="range" selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => { if (range?.from && range?.to) setDateRange({ from: range.from, to: range.to }); }}
              numberOfMonths={2} defaultMonth={dateRange.from} />
          </PopoverContent>
        </Popover>
        <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
        <FilterMultiSelect label="Relationship" options={filterOptions.relations} selected={pageFilters.relations} onChange={(v) => setPageFilters((p) => ({ ...p, relations: v }))} />
        <div className="flex-1" />
        <button className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Download size={15} />
        </button>
        <button className="relative h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Bell size={15} />
          <span className="absolute -right-1 -top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#DC2626] text-[8px] font-bold text-white">3</span>
        </button>
        <ConfigurePanel
          pageSlug="/portal/ohc/emotional-wellbeing"
          pageTitle="Emotional Wellbeing"
          charts={[
            { id: "ewbKpis", label: "Emotional Wellbeing KPIs" },
            { id: "ewbDemographics", label: "Patient Demographics" },
            { id: "ewbTrends", label: "Consult Trends" },
            { id: "criticalRisk", label: "Critical Risk (Self Harm)" },
            { id: "substanceUse", label: "Substance Use" },
            { id: "sleepQuality", label: "Sleep Quality" },
            { id: "sleepDuration", label: "Sleep Duration" },
            { id: "alcoholHabit", label: "Alcohol Habit" },
            { id: "smokingHabit", label: "Smoking Habit" },
            { id: "visitPatternImpressions", label: "Visit Patterns & Impressions" },
            { id: "anxietyScale", label: "Anxiety Scale" },
            { id: "selfEsteemScale", label: "Self Esteem Scale" },
            { id: "depressionScale", label: "Depression Scale" },
            { id: "impressionsDetail", label: "Impressions Analysis Detail" },
          ]}
          filters={["location", "gender", "ageGroup", "relationship"]}
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
      {hasActiveFilters && <ActiveFilterChips filters={appliedFilters} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      {/* ── Page At-a-Glance ── */}
      <PageGlanceBox
        pageTitle="Emotional Wellbeing Overview"
        pageSubtitle="Mental health assessment analytics, risk indicators and lifestyle insights"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalConsults || 0)} emotional wellbeing consultations recorded with ${formatNum(kpis?.uniquePatients || 0)} unique patients. ${formatNum(kpis?.repeatPatients || 0)} patients have availed emotional wellbeing services at least twice in the selected date range. Anxiety and depression screenings identify at-risk populations across locations for targeted mental health support programs.`}
        fallbackChips={[
          { label: "Total Consults", value: formatNum(kpis?.totalConsults || 0) },
          { label: "Unique Patients", value: formatNum(kpis?.uniquePatients || 0) },
          { label: "Repeat Patients", value: formatNum(kpis?.repeatPatients || 0) },
        ]}
      />

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 1: KPIs + Demographics + Trends   */}
      {/* ══════════════════════════════════════════ */}
      {isChartVisible("ewbKpis") && <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Total Consults", value: kpis?.totalConsults || 0, icon: <TrendingUp size={18} />, color: T.teal },
          { label: "Unique Patients", value: kpis?.uniquePatients || 0, icon: <Users size={18} />, color: "#4f46e5" },
          { label: "Repeat Patients", value: kpis?.repeatPatients || 0, icon: <Repeat size={18} />, color: T.teal },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl px-5 py-4" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-medium tracking-[0.08em]" style={{ color: T.textSecondary }}>{k.label}</p>
              <span style={{ color: T.textMuted }}>{k.icon}</span>
            </div>
            <p className="text-[34px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: k.color }}>{formatNum(k.value)}</p>
          </div>
        ))}
      </div>}

      {(isChartVisible("ewbDemographics") || isChartVisible("ewbTrends")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Patient Demographics */}
        {isChartVisible("ewbDemographics") && <CVCard accentColor={T.teal} title="Patient Demographics" subtitle="Demographic distribution of patients" tooltipText="Tabbed view showing patient distribution across four dimensions — Age, Gender, Location, and Shift. Switch between tabs to see horizontal bar charts for each dimension. Taller bars indicate segments with more emotional wellbeing consults, helping identify which groups need the most support." chartData={demoData} chartTitle="Patient Demographics" chartDescription="Demographic distribution of patients">
          <div className="flex gap-0 border-b mb-4" style={{ borderColor: T.border }}>
            {(["age", "gender"] as const).map((tab) => (
              <button key={tab} onClick={() => setDemoTab(tab)}
                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-all ${demoTab === tab ? "border-current" : "border-transparent"}`}
                style={{ color: demoTab === tab ? T.teal : T.textMuted }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
            <ResetFilter visible={demoTab !== "age"} onClick={() => setDemoTab("age")} />
          </div>
          <div className="overflow-y-auto max-h-[400px]" style={{ height: 280 }}>
            {/* ── Age: Bar Chart ── */}
            {demoTab === "age" && (
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(demoData.length * 60, 300), height: 270 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demoData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.textMuted }} />
                      <YAxis tick={{ fontSize: 10, fill: T.textMuted }} />
                      <RechartsTooltip content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                            <p>Patients: <strong>{formatNum(payload[0]?.value)}</strong></p>
                          </div>
                        );
                      }} />
                      <Bar dataKey="count" name="Patients" fill={"#4f46e5"} maxBarSize={50} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── Gender: Bubble Chart (two proportional circles) ── */}
            {demoTab === "gender" && (() => {
              const genderData: Array<{ label: string; count: number }> = charts?.demographics?.gender || [];
              const total = genderData.reduce((s, g) => s + g.count, 0);
              const maxCount = Math.max(...genderData.map((g) => g.count), 1);
              const genderColorMap: Record<string, string> = { MALE: "#0d9488", FEMALE: "#a78bfa", Male: "#0d9488", Female: "#a78bfa", Other: "#a1a1aa" };
              return (
                <div className="flex items-center justify-center gap-8 h-full">
                  {genderData.map((g) => {
                    const size = 80 + (g.count / maxCount) * 100;
                    const pct = total > 0 ? Math.round((g.count / total) * 100) : 0;
                    const color = genderColorMap[g.label] || "#4f46e5";
                    return (
                      <div key={g.label} className="flex flex-col items-center gap-3">
                        <div className="rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
                          style={{ width: size, height: size, backgroundColor: color, opacity: 0.85 }}>
                          <div className="text-center text-white">
                            <p className="text-[22px] font-extrabold leading-none">{formatNum(g.count)}</p>
                            <p className="text-[11px] font-medium mt-0.5 opacity-80">{pct}%</p>
                          </div>
                        </div>
                        <span className="text-[13px] font-semibold" style={{ color }}>{g.label}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Location: Map-style bubble layout ── */}
            {demoTab === "location" && (() => {
              const locData: Array<{ label: string; count: number }> = charts?.demographics?.location || [];
              const cityCoords: Record<string, [number, number]> = {
                Delhi: [77.2, 28.6], Noida: [77.4, 28.5], Mumbai: [72.9, 19.1], Pune: [73.9, 18.5],
                Bangalore: [77.6, 13.0], Chennai: [80.3, 13.1], Hyderabad: [78.5, 17.4], Kolkata: [88.4, 22.6],
                Ahmedabad: [72.6, 23.0], Jaipur: [75.8, 26.9], Lucknow: [81.0, 26.8], Chandigarh: [76.8, 30.7],
                Bhopal: [77.4, 23.3], Kochi: [76.3, 10.0], Gurgaon: [77.0, 28.5], Guwahati: [91.7, 26.1],
              };
              if (!indiaMapReady) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}><span style={{ color: T.textMuted, fontSize: 12 }}>Loading map...</span></div>;
              return (
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
                      if (p.seriesType === "effectScatter") return `<strong>${p.data.name}</strong><br/>Patients: ${formatNum(p.data.value[2])}`;
                      return "";
                    },
                  },
                  geo: {
                    map: "india",
                    roam: false,
                    zoom: 1.15,
                    center: [82, 22],
                    itemStyle: {
                      areaColor: {
                        type: "linear",
                        x: 0.5, y: 0, x2: 0.5, y2: 1,
                        colorStops: [
                          { offset: 0, color: "#c7d2fe" },
                          { offset: 0.5, color: "#818cf8" },
                          { offset: 1, color: "#4f46e5" },
                        ],
                      },
                      borderColor: "#6366f1",
                      borderWidth: 1.5,
                      shadowColor: "rgba(0,0,0,0.15)",
                      shadowBlur: 10,
                    },
                    emphasis: { disabled: true },
                    silent: true,
                  },
                  series: [{
                    type: "effectScatter",
                    coordinateSystem: "geo",
                    data: locData.map((l) => ({
                      name: l.label,
                      value: [...(cityCoords[l.label] || [80, 20]), l.count],
                    })),
                    symbolSize: 14,
                    rippleEffect: { brushType: "stroke", scale: 3, period: 4 },
                    itemStyle: { color: "#4f46e5", shadowBlur: 4, shadowColor: "rgba(79,70,229,0.4)" },
                    label: {
                      show: true,
                      formatter: "{b}",
                      position: "right",
                      distance: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      color: T.textPrimary,
                    },
                    emphasis: { scale: true, itemStyle: { color: "#3730a3" } },
                  },
                  {
                    type: "scatter",
                    coordinateSystem: "geo",
                    data: locData.map((l) => ({
                      name: l.label,
                      value: [...(cityCoords[l.label] || [80, 20]), l.count],
                    })),
                    symbol: "pin",
                    symbolSize: 32,
                    itemStyle: { color: "#4f46e5", borderColor: "#fff", borderWidth: 1.5 },
                    label: {
                      show: true,
                      formatter: (p: any) => formatK(p.data.value[2]),
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 700,
                      offset: [0, -2],
                    },
                    emphasis: { disabled: true },
                    silent: true,
                    z: 10,
                  }],
                }} />
              );
            })()}

            {/* ── Shift: Radar Chart ── */}
            {demoTab === "shift" && (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={demoData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid stroke={T.borderLight} />
                  <PolarAngleAxis dataKey="label" tick={{ fontSize: 11, fill: T.textSecondary }} />
                  <PolarRadiusAxis tick={{ fontSize: 9, fill: T.textMuted }} angle={30} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }} />
                  <Radar name="Patients" dataKey="count" stroke={T.teal} fill={T.teal} fillOpacity={0.3} strokeWidth={2} dot={{ r: 4, fill: T.teal }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
          <InsightBox text="Review the demographic breakdown to identify which age groups, genders, or locations have the highest patient volumes. Over-represented segments may need targeted wellbeing programs or additional counselling resources." />
        </CVCard>}

        {/* Consult Trends */}
        {isChartVisible("ewbTrends") && <CVCard accentColor={T.teal} title="Consult Trends" subtitle="View of total and unique consults" tooltipText="Line chart tracking total consults and unique patients over time. Toggle between yearly and monthly views. The gap between total and unique lines reveals repeat visit frequency (employees who availed the service at least twice in the selected date range) — a wider gap means more patients are returning for multiple sessions, which may indicate ongoing mental health needs."
          chartData={trendData} chartTitle="Consult Trends" chartDescription="View of total and unique consults"
          comments={[{ id: "kam-ew-1", author: "HCL KAM", text: "Emotional wellbeing consults rose 42% between Q1 and Q3 2024, driven by increased awareness campaigns and the launch of anonymous counseling services. The gap between total and unique consults widened from Q2, indicating more employees are returning for follow-up sessions — a positive sign of treatment adherence. Recommend expanding counselor availability at Pune and Hyderabad where wait times exceed 5 days.", date: "Jan 2025", isKAM: true }]}
          rightHeader={
            <div className="inline-flex items-center gap-1">
              <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: T.borderLight }}>
                {(["year", "month"] as const).map((v) => (
                  <button key={v} onClick={() => setTrendView(v)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${trendView === v ? "bg-white shadow-sm" : ""}`}
                    style={{ color: trendView === v ? T.textPrimary : T.textMuted }}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <ResetFilter visible={trendView !== "month"} onClick={() => setTrendView("month")} />
            </div>
          }>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(trendData.length * 50, 400), height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: T.textMuted }} />
                  <YAxis tick={{ fontSize: 10, fill: T.textMuted }} />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                        <p style={{ color: "#4f46e5" }}>Total Consults : <strong>{formatNum(dd?.totalConsults)}</strong></p>
                        <p style={{ color: T.teal }}>Unique Patients : <strong>{formatNum(dd?.uniquePatients)}</strong></p>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="totalConsults" name="Total Consults" stroke={"#4f46e5"} strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#4f46e5", strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="uniquePatients" name="Unique Patients" stroke={T.teal} strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: T.teal, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <InsightBox text="Compare total consults against unique patients to gauge repeat visit rates. A widening gap between the two lines suggests more patients are returning for follow-up sessions, which may indicate ongoing mental health needs or effective engagement." />
        </CVCard>}
      </div>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 2: Critical Risk + Substance Use  */}
      {/* ══════════════════════════════════════════ */}
      {(isChartVisible("criticalRisk") || isChartVisible("substanceUse")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isChartVisible("criticalRisk") && <CVCard accentColor={"#4f46e5"} title="Critical Risk (Self Harm)" tooltipText="Displays three critical risk indicators — Suicidal Thoughts, Attempted Self Harm, and Previous Attempts — as progress bars with patient counts. Higher values signal urgent need for intervention programs. This section requires immediate clinical attention for any non-zero values."
          chartData={criticalRisk} chartTitle="Critical Risk (Self Harm)" chartDescription="Critical risk indicators for self harm"
          comments={[{ id: "kam-ew-2", author: "HCL KAM", text: "All critical risk cases were flagged and escalated within 24 hours per the emergency protocol. The 3 self-harm attempt cases in Q3 2024 were traced to work-related stress in the night shift operations team at Chennai. Immediate interventions included shift rotation adjustments, peer support groups, and dedicated EAP counselor deployment. Zero incidents reported since Oct 2024.", date: "Feb 2025", isKAM: true }]}>
          {totalEwbAssessed > 0 && (
            <p className="text-[11.5px] mb-4 mt-1" style={{ color: T.textSecondary }}>
              Out of <strong style={{ color: T.textPrimary }}>{formatNum(totalEwbAssessed)}</strong> emotional wellbeing assessments conducted
            </p>
          )}
          <div className="space-y-5 mt-2">
            {[
              { label: "Suicidal Thoughts", value: criticalRisk.suicidalThoughts },
              { label: "Attempted Self Harm", value: criticalRisk.attemptedSelfHarm },
              { label: "Other Critical Cases", value: criticalRisk.previousAttempts },
            ].map((item) => {
              const pctOfTotal = totalEwbAssessed > 0 ? (item.value / totalEwbAssessed) * 100 : 0;
              // Bar width: scaled so the largest value fills 60% of the bar (prevents all-full look)
              const barWidth = maxCritical > 0 ? Math.min((item.value / maxCritical) * 60, 100) : 0;
              return (
              <div key={item.label}>
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className="font-medium" style={{ color: T.textPrimary }}>{item.label}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold" style={{ color: "#dc2626" }}>{item.value}</span>
                    {totalEwbAssessed > 0 && (
                      <span className="text-[11px] font-medium" style={{ color: "#dc262680" }}>
                        ({pctOfTotal < 0.1 ? pctOfTotal.toFixed(2) : pctOfTotal.toFixed(1)}% of assessed)
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#fee2e2" }}>
                  <div className="h-full rounded-full" style={{ width: `${barWidth}%`, backgroundColor: "#dc2626" }} />
                </div>
              </div>
            );
            })}
            <div className="flex justify-between text-[14px] pt-3 border-t" style={{ borderColor: T.border }}>
              <span className="font-semibold" style={{ color: T.textPrimary }}>Total Critical Cases</span>
              <span className="font-extrabold text-[16px]" style={{ color: "#dc2626" }}>{criticalRisk.totalCases}</span>
            </div>
          </div>
          <InsightBox text="Any non-zero count in suicidal thoughts, attempted self harm, or previous attempts demands immediate clinical attention. Track these numbers closely and ensure each flagged individual is connected with crisis support resources." />
        </CVCard>}

        {isChartVisible("substanceUse") && <CVCard accentColor={T.amber} title="Substance Use" subtitle={`${substanceUsePct}% of the ${formatNum(totalEwbAssessed)} employees assessed reported substance use`} tooltipText="Gauge showing the percentage of employees who completed an emotional wellbeing assessment and reported substance use (alcohol, tobacco, or other substances). The denominator is the total number of emotional wellbeing assessments conducted in the selected date range." chartData={{ substanceUsePct }} chartTitle="Substance Use" chartDescription="Percentage of assessed employees reporting substance use">
          <div className="flex items-center justify-center" style={{ height: 200 }}>
            <ReactECharts style={{ height: "100%", width: "100%" }} option={{
              series: [{
                type: "gauge",
                startAngle: 180,
                endAngle: 0,
                min: 0,
                max: 100,
                pointer: { show: false },
                progress: { show: true, width: 20, roundCap: true, itemStyle: { color: T.amber } },
                axisLine: { lineStyle: { width: 20, color: [[1, "#E8E8E8"]] } },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                detail: { fontSize: 36, fontWeight: 800, color: T.textPrimary, offsetCenter: [0, "10%"], formatter: "{value}%" },
                data: [{ value: substanceUsePct }],
              }],
              graphic: [
                { type: "text", left: "8%", bottom: "22%", style: { text: "0%", fontSize: 11, fill: T.textMuted } },
                { type: "text", right: "8%", bottom: "22%", style: { text: "100%", fontSize: 11, fill: T.textMuted } },
              ],
            }} />
          </div>
          <InsightBox text="Substance use prevalence is a key risk factor for emotional wellbeing. If this percentage is trending upward, consider introducing substance abuse awareness workshops and confidential counselling services." />
        </CVCard>}
      </div>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 3: Sleep + Habits (Lavender)      */}
      {/* ══════════════════════════════════════════ */}
      {(isChartVisible("sleepQuality") || isChartVisible("sleepDuration")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sleep Quality */}
        {isChartVisible("sleepQuality") && <CVCard accentColor={"#6366f1"} title="Sleep Quality" subtitle="Sleep Quality Analysis" tooltipText="Bar chart showing the distribution of sleep quality ratings (e.g., Good, Average, Poor). Taller bars indicate more patients in that category. A high count in Poor sleep quality may correlate with elevated anxiety or depression scores." chartData={sleepQuality} chartTitle="Sleep Quality" chartDescription="Sleep Quality Analysis">
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(sleepQualitySorted.length * 70, 300), height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sleepQualitySorted} margin={{ top: 20, right: 10, left: 0, bottom: 20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.textSecondary }} />
                  <YAxis tick={{ fontSize: 10, fill: T.textMuted }} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  <Bar dataKey="count" maxBarSize={60} radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 12, fontWeight: 700, fill: T.textPrimary }}>
                    {sleepQualitySorted.map((d) => <Cell key={d.label} fill={SLEEP_Q_COLORS[d.label] || "#818cf8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <InsightBox text="Poor sleep quality is strongly linked to anxiety and depression. If the majority of patients report average or poor sleep, consider sleep hygiene workshops and integrating sleep screening into routine assessments." />
        </CVCard>}

        {/* Sleep Duration */}
        {isChartVisible("sleepDuration") && <CVCard accentColor={"#6366f1"} title="Sleep Duration" subtitle="Sleep Duration Analysis" tooltipText="Donut chart displaying the proportion of patients by sleep duration buckets. Each slice represents a duration range. Larger slices for shorter sleep durations may signal sleep deprivation trends in the population." chartData={sleepDuration} chartTitle="Sleep Duration" chartDescription="Sleep Duration Analysis">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 300, height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sleepDuration.map((d) => ({ name: d.label, value: d.count }))} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value"
                    label={({ percent }: any) => `${((percent || 0) * 100).toFixed(0)}%`} labelLine={{ stroke: T.textMuted, strokeWidth: 1 }}>
                    {sleepDuration.map((_, i) => <Cell key={i} fill={SLEEP_DURATION_COLORS[i % SLEEP_DURATION_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <InsightBox text="Employees sleeping less than 7 hours are at higher risk for burnout and reduced cognitive function. If a significant proportion falls in the 'Less than 7 hrs' bucket, consider flexible scheduling or workload reviews." />
        </CVCard>}
      </div>}

      {(isChartVisible("alcoholHabit") || isChartVisible("smokingHabit")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alcohol Habit */}
        {isChartVisible("alcoholHabit") && <CVCard accentColor={"#6366f1"} title="Alcohol Habit" subtitle="Alcohol Habit Analysis" tooltipText="Donut chart showing the distribution of alcohol consumption habits (e.g., Never, Occasional, Regular). Larger slices for frequent use categories may indicate a need for alcohol awareness programs." chartData={alcoholHabit} chartTitle="Alcohol Habit" chartDescription="Alcohol Habit Analysis">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 300, height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={alcoholHabit.map((d) => ({ name: d.label, value: d.count }))} cx="50%" cy="50%"
                    innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value"
                    label={({ percent }: any) => `${((percent || 0) * 100).toFixed(1)}%`} labelLine={{ stroke: T.textMuted, strokeWidth: 1 }}>
                    {alcoholHabit.map((_, i) => <Cell key={i} fill={ALCOHOL_COLORS[i % ALCOHOL_COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <InsightBox text="Regular or heavy alcohol consumption often co-occurs with anxiety and depression. Cross-reference alcohol habit data with mental health scale results to identify high-risk groups for integrated intervention." />
        </CVCard>}

        {/* Smoking Habit */}
        {isChartVisible("smokingHabit") && <CVCard accentColor={"#6366f1"} title="Smoking Habit" subtitle="Smoking frequency distribution" tooltipText="Line chart showing patient counts across smoking frequency categories. Peaks at higher frequency labels suggest a significant smoking population. Use this to prioritize cessation programs." chartData={smokingHabit} chartTitle="Smoking Habit" chartDescription="Smoking frequency distribution">
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(smokingHabit.length * 80, 300), height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={smokingHabit} margin={{ top: 20, right: 20, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.textMuted }} angle={-20} textAnchor="end" height={55} />
                  <YAxis tick={{ fontSize: 10, fill: T.textMuted }} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  <Bar dataKey="count" fill={"#6366f1"} maxBarSize={56} radius={[4, 4, 0, 0]}
                    label={{ position: "top", fontSize: 11, fontWeight: 700, fill: T.textPrimary }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <InsightBox text="Smoking is a modifiable lifestyle factor that impacts both physical and emotional health. A high count of daily or frequent smokers warrants targeted smoking cessation support and nicotine replacement therapy programs." />
        </CVCard>}
      </div>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 4: Visit Pattern + Impressions    */}
      {/* ══════════════════════════════════════════ */}
      {isChartVisible("visitPatternImpressions") && <WarmSection>
        <AccentBar color={T.amber} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Visit Patterns & Impressions</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Patient visit frequency and problem category analysis</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Visit Pattern */}
          <CVCard accentColor={T.amber} title="Visit Pattern" expandable={false} tooltipText="Shows how many patients fall into each visit frequency bucket (e.g., 1 visit, 2-3 visits, 4+ visits). Click a bar to filter the adjacent Impressions chart by that visit bucket." chartData={visitPattern} chartTitle="Visit Pattern" chartDescription="Patient visit frequency distribution">
            <p className="text-[11px] mb-2" style={{ color: T.textMuted }}>Click a bar to filter Impressions chart</p>
            <div className="overflow-x-auto">
              <div className="flex items-end justify-center gap-3 mt-1" style={{ height: 200, minWidth: Math.max(visitPattern.length * 85, 250) }}>
                {[...visitPattern].sort((a, b) => {
                  const order = ["1 Visit", "2 Visits", "3 Visits", "4 Visits", "5+ Visits"];
                  return order.indexOf(a.label) - order.indexOf(b.label);
                }).map((v) => {
                  const maxV = Math.max(...visitPattern.map((p) => p.count), 1);
                  const h = Math.max((v.count / maxV) * 160, 30);
                  const isSelected = selectedVisitBucket === v.label;
                  return (
                    <div key={v.label} className="flex flex-col items-center gap-1.5 cursor-pointer"
                      onClick={() => setSelectedVisitBucket(isSelected ? "" : v.label)}>
                      <div className="rounded-lg flex items-end justify-center transition-all" style={{
                        width: 70, height: h,
                        backgroundColor: isSelected ? "#4f46e5" : selectedVisitBucket ? "#c7d2fe60" : "#c7d2fe",
                        border: isSelected ? `3px solid #4f46e5` : "2px solid #a5b4fc",
                        transform: isSelected ? "scale(1.08)" : "scale(1)",
                        boxShadow: isSelected ? "0 4px 12px rgba(212,160,23,0.4)" : "none",
                      }}>
                        <span className="text-[13px] font-bold pb-1.5" style={{ color: "#4f46e5" }}>{formatNum(v.count)}</span>
                      </div>
                      <span className="text-[10px] font-medium text-center" style={{ color: isSelected ? T.textPrimary : T.textSecondary, fontWeight: isSelected ? 700 : 500 }}>{v.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <ResetFilter visible={selectedVisitBucket !== ""} onClick={() => setSelectedVisitBucket("")} />
            <InsightBox text="Patients with higher visit frequencies may have more complex or persistent emotional health issues. Click a visit bucket to explore which problem categories dominate for that group and allocate specialist resources accordingly." />
          </CVCard>

          {/* Impressions Analysis Pie */}
          <CVCard accentColor={T.amber} title={selectedVisitBucket ? `Impressions Analysis — ${selectedVisitBucket}` : "Impressions Analysis"} expandable={false} tooltipText="Pie chart displaying the proportion of impressions (problem categories) across all consults. When a visit bucket is selected, it filters to show only impressions for that visit frequency group." chartData={impressions} chartTitle="Impressions Analysis" chartDescription="Problem category distribution">
            <div className="overflow-x-auto">
              <div style={{ minWidth: 320, height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={impressions.map((i) => ({ name: i.category, value: i.count }))} cx="50%" cy="50%"
                      outerRadius={90} paddingAngle={1} dataKey="value"
                      label={({ value, percent }: any) => `${formatK(value)} (${((percent || 0) * 100).toFixed(1)}%)`}
                      labelLine={{ stroke: T.textMuted, strokeWidth: 1 }}>
                      {impressions.map((im) => <Cell key={im.category} fill={impressionColorMap[im.category] || "#9399AB"} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={7} />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <InsightBox text="The largest pie slice reveals the most common problem category among patients. Use this distribution to allocate counselling specializations and design targeted wellbeing programs for the dominant categories." />
          </CVCard>
        </div>
      </WarmSection>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 5: Scales                         */}
      {/* ══════════════════════════════════════════ */}
      {(isChartVisible("anxietyScale") || isChartVisible("selfEsteemScale")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isChartVisible("anxietyScale") && <CVCard accentColor={"#6366f1"} title="Anxiety Scale" expandable={false} tooltipText="Stacked percentage bar showing the severity distribution of anxiety assessments (e.g., Minimal, Mild, Moderate, Severe). Wider segments for Moderate/Severe indicate a higher proportion of employees with significant anxiety levels." chartData={anxietyScale} chartTitle="Anxiety Scale" chartDescription="Severity distribution of anxiety assessments">
          <StackedPercentBar data={anxietyScale} colors={SCALE_COLORS} />
          <InsightBox text="Focus on the Moderate and Severe segments. If combined they exceed 20%, consider scaling up access to anxiety management workshops, cognitive behavioral therapy resources, and stress reduction programs." />
        </CVCard>}
        {isChartVisible("selfEsteemScale") && <CVCard accentColor={"#6366f1"} title="Self Esteem Scale" expandable={false} tooltipText="Stacked percentage bar showing self-esteem assessment results (e.g., Low, Normal). A larger Low segment suggests more employees may benefit from confidence-building and self-esteem support initiatives." chartData={selfEsteemScale} chartTitle="Self Esteem Scale" chartDescription="Self-esteem assessment results">
          <StackedPercentBar data={selfEsteemScale} colors={["#4f46e5", "#0d9488"]} />
          <InsightBox text="Low self-esteem often underlies both anxiety and depression. A dominant Low segment suggests employees may benefit from mentorship programs, positive feedback culture initiatives, and confidence-building workshops." />
        </CVCard>}
      </div>}
      {isChartVisible("depressionScale") && <CVCard accentColor={"#6366f1"} title="Depression Scale" expandable={false} tooltipText="Stacked percentage bar showing the severity distribution of depression assessments (e.g., Minimal, Mild, Moderate, Moderately Severe, Severe). Wider segments for higher severity levels indicate a greater proportion needing clinical attention." chartData={depressionScale} chartTitle="Depression Scale" chartDescription="Severity distribution of depression assessments">
        <StackedPercentBar data={depressionScale} colors={SCALE_COLORS} />
        <InsightBox text="Pay close attention to the Moderately Severe and Severe segments. Even small percentages here represent individuals who may need immediate professional support. Ensure follow-up protocols are in place for these cases." />
      </CVCard>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 6: Impressions Detail (clickable) */}
      {/* ══════════════════════════════════════════ */}
      {isChartVisible("impressionsDetail") && <CVCard accentColor={"#4f46e5"} title="Impressions Analysis" subtitle="Click a category to see subcategory breakdown" tooltipText="Interactive breakdown of problem categories. The stacked bar at top shows overall proportions. Click any category tab to drill into its subcategories displayed as horizontal bars." chartData={impressions} chartTitle="Impressions Analysis" chartDescription="Problem category breakdown with subcategories">
        {/* Stacked bar at top */}
        <div className="mb-4">
          <div className="flex h-8 rounded-lg overflow-hidden">
            {impressions.map((im) => {
              const pct = totalImpressions > 0 ? (im.count / totalImpressions) * 100 : 0;
              return (
                <div key={im.category} className="flex items-center justify-center text-[10px] font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ width: `${pct}%`, backgroundColor: impressionColorMap[im.category] || "#9399AB", minWidth: pct > 3 ? 40 : 0 }}
                  onClick={() => setActiveImpression(im.category)}>
                  {pct > 5 ? `${pct.toFixed(1)}%` : ""}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {impressions.map((im) => (
              <div key={im.category} className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: impressionColorMap[im.category] || "#9399AB" }} />
                {im.category}
              </div>
            ))}
          </div>
        </div>

        {/* Clickable tabs */}
        <div className="flex flex-wrap gap-2 mb-5 items-center">
          {impressions.map((im) => (
            <button key={im.category} onClick={() => setActiveImpression(im.category)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold border-2 transition-all ${selectedImpression === im.category ? "shadow-sm" : ""}`}
              style={{
                borderColor: selectedImpression === im.category ? (impressionColorMap[im.category] || "#4f46e5") : T.border,
                backgroundColor: selectedImpression === im.category ? (impressionColorMap[im.category] || "#4f46e5") + "10" : T.white,
                color: selectedImpression === im.category ? (impressionColorMap[im.category] || "#4f46e5") : T.textSecondary,
              }}>
              {im.category}
            </button>
          ))}
          <ResetFilter visible={activeImpression !== ""} onClick={() => setActiveImpression("")} />
        </div>

        {/* Subcategory horizontal bar */}
        {selectedImpression && (
          <div>
            <h4 className="text-[15px] font-bold mb-1" style={{ color: T.textPrimary }}>{selectedImpression} Impression</h4>
            <p className="text-[12px] mb-4" style={{ color: T.textSecondary }}>Distribution by major reason categories and sub categories</p>
            <div className="overflow-y-auto max-h-[400px] space-y-3">
              {subcategories.map((sub) => {
                const maxSub = Math.max(...subcategories.map((s) => s.count), 1);
                return (
                  <div key={sub.subcategory} className="flex items-center gap-3">
                    <span className="text-[12px] font-medium w-[160px] text-right truncate shrink-0" style={{ color: T.textPrimary }}>{sub.subcategory}</span>
                    <div className="flex-1 h-5 rounded overflow-hidden" style={{ backgroundColor: T.borderLight }}>
                      <div className="h-full rounded" style={{ width: `${(sub.count / maxSub) * 100}%`, backgroundColor: impressionColorMap[selectedImpression] || "#6366f1" }} />
                    </div>
                    <span className="text-[11px] font-bold shrink-0 w-[32px] text-right" style={{ color: T.textSecondary }}>{formatNum(sub.count)}</span>
                  </div>
                );
              })}
              {subcategories.length === 0 && (
                <p className="text-[12px] py-4 text-center" style={{ color: T.textMuted }}>No subcategory data available</p>
              )}
            </div>
          </div>
        )}
        <InsightBox text="Drill into each impression category to understand the specific subcategories driving patient visits. The longest bars reveal the most frequent concerns within each category, helping prioritize counsellor training and resource allocation." />
      </CVCard>}
    </div>
  );
}
