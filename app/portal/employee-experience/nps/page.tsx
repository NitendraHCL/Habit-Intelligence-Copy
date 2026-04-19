"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
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
import {
  Info,
  Maximize2,
  Minimize2,
  CalendarDays,
  X,
  ChevronDown,
  TrendingUp,
  TrendingDown,
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
  LineChart,
  Line,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ComposedChart,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { ChartComments } from "@/components/ui/chart-comments";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { T } from "@/lib/ui/theme";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactECharts = dynamic(
  () => import("echarts-wordcloud").then(() => import("echarts-for-react")),
  { ssr: false }
);

const NPS_COLORS = { promoter: "#0d9488", passive: "#818cf8", detractor: "#a1a1aa" };

const TREEMAP_COLORS = [
  "#4f46e5", "#6366f1", "#818cf8", "#0d9488", "#14b8a6", "#7c3aed",
  "#8b5cf6", "#a78bfa", "#06b6d4", "#34d399", "#a1a1aa", "#c4b5fd",
  "#67e8f9", "#5eead4", "#c7d2fe", "#e0e7ff",
  "#ddd6fe", "#a5b4fc", "#99f6e4", "#bfdbfe",
];

const PIE_COLORS = ["#4f46e5", "#0d9488", "#818cf8", "#a78bfa", "#6366f1", "#14b8a6", "#c4b5fd", "#7c3aed", "#8b5cf6", "#34d399"];

const DEMO_COLORS: Record<string, string> = {
  MALE: "#0d9488",
  Male: "#0d9488",
  FEMALE: "#a78bfa",
  Female: "#a78bfa",
  OTHER: "#a1a1aa",
  Other: "#a1a1aa",
  "Online / WC": "#4f46e5",
  "In-Clinic": "#0d9488",
};

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
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, chartId, chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; chartId?: string;
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
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
                {chartId && <ChartComments chartId={chartId} pageSlug="/portal/employee-experience/nps" />}
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

// ─── Multi-select Filter ───
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
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border"
          style={{ borderColor: T.border, color: T.textPrimary, backgroundColor: T.white }}
        >
          {chip.value}
          <button onClick={() => onRemove(chip.key, chip.value)} className="hover:text-red-500">
            <X size={10} />
          </button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium hover:underline ml-1" style={{ color: T.coral }}>
        Clear all
      </button>
    </div>
  );
}

// ─── Insight Box ───
function InsightBox({ text }: { text: string; color?: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3 mt-4 text-[12px] leading-relaxed" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// No fallback data — all data comes from API

const QUARTER_MAP: Record<string, string> = {
  Jan: "Q1", Feb: "Q1", Mar: "Q1", Apr: "Q2", May: "Q2", Jun: "Q2",
  Jul: "Q3", Aug: "Q3", Sep: "Q3", Oct: "Q4", Nov: "Q4", Dec: "Q4",
};

// ─── Main Page ───
export default function NPSPage() {
  usePageAccess("/portal/employee-experience/nps");
  const { activeClientId } = useAuth();
  const [trendView, setTrendView] = useState<"yearly" | "quarterly" | "monthly">("monthly");

  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [dateOpen, setDateOpen] = useState(false);

  const [pageFilters, setPageFilters] = useState({
    locations: [] as string[],
    serviceLines: [] as string[],
    ageGroups: [] as string[],
    genders: [] as string[],
  });

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const [appliedDateRange, setAppliedDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [appliedFilters, setAppliedFilters] = useState({
    locations: [] as string[],
    serviceLines: [] as string[],
    ageGroups: [] as string[],
    genders: [] as string[],
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
    if (appliedFilters.locations.length) p.locations = appliedFilters.locations.join(",");
    if (appliedFilters.serviceLines.length) p.serviceLines = appliedFilters.serviceLines.join(",");
    if (appliedFilters.ageGroups.length) p.ageGroups = appliedFilters.ageGroups.join(",");
    if (appliedFilters.genders.length) p.genders = appliedFilters.genders.join(",");
    return p;
  }, [appliedDateRange, appliedFilters]);

  const { data, isLoading, isValidating, mutate } = useDashboardData("nps", extraParams);

  const d = data as any;
  const kpis = d?.kpis || {};
  const charts = d?.charts || {};

  const npsTrends: any[] = charts.npsTrends || [];
  const bySpecialty: any[] = charts.bySpecialty || [];
  const byServiceCategory: any[] = charts.byServiceCategory || [];
  const byDiagnosisCategory: any[] = charts.byDiagnosisCategory || [];
  const demographics: any[] = charts.demographics || [];
  const demoSummary = charts.demoSummary || { highestCount: 0, highestAgeGroup: "", highestGender: "", topGender: "", topGenderCount: 0, topAgeGroup: "", topAgeGroupCount: 0 };
  const byVisitFrequency: any[] = charts.byVisitFrequency || [];
  const wordCloud: any[] = charts.wordCloud || [];
  const topPositive = charts.topPositive || null;
  const topConcern = charts.topConcern || null;

  const overallNPS = kpis.overallNPS ?? 0;
  const totalResponses = kpis.totalResponses ?? 0;
  const promotersPct = kpis.promotersPct ?? 0;
  const passivesPct = kpis.passivesPct ?? 0;
  const detractorsPct = kpis.detractorsPct ?? 0;
  const yoyChange = kpis.yoyChange ?? 0;

  // Trend view aggregation
  const trendData = useMemo(() => {
    if (trendView === "monthly") return npsTrends;
    if (trendView === "quarterly") {
      const qMap: Record<string, { npsSum: number; respSum: number; count: number }> = {};
      npsTrends.forEach((t: any) => {
        const q = QUARTER_MAP[t.month] || "Q1";
        if (!qMap[q]) qMap[q] = { npsSum: 0, respSum: 0, count: 0 };
        qMap[q].npsSum += t.nps;
        qMap[q].respSum += t.responses;
        qMap[q].count++;
      });
      return ["Q1", "Q2", "Q3", "Q4"]
        .filter((q) => qMap[q])
        .map((q) => ({
          month: q,
          nps: Math.round(qMap[q].npsSum / qMap[q].count),
          responses: qMap[q].respSum,
        }));
    }
    // yearly - single point
    const total = npsTrends.reduce((acc: any, t: any) => {
      acc.npsSum += t.nps;
      acc.respSum += t.responses;
      acc.count++;
      return acc;
    }, { npsSum: 0, respSum: 0, count: 0 });
    return [{ month: "2024-25", nps: Math.round(total.npsSum / total.count), responses: total.respSum }];
  }, [npsTrends, trendView]);

  // Avg NPS for reference line
  const avgNPS = useMemo(() => {
    if (!trendData.length) return 0;
    return Math.round(trendData.reduce((s: number, t: any) => s + t.nps, 0) / trendData.length);
  }, [trendData]);

  // Demographics: separate by feedback channel for scatter
  const demoOnline = demographics.filter((d: any) => ["WC", "ONLINE", "HSC", "HOMECARE", "DEFAULT"].includes(d.gender));
  const demoInClinic = demographics.filter((d: any) => ["INCLINIC", "IN_CLINIC"].includes(d.gender));

  // Location index mapping for scatter x-axis
  const allLocations = useMemo(() => {
    const locs = [...new Set(demographics.map((d: any) => d.ageGroup))].filter(Boolean).slice(0, 8);
    return locs;
  }, [demographics]);
  const LOC_INDEX: Record<string, number> = {};
  allLocations.forEach((loc, i) => { LOC_INDEX[loc] = i + 1; });
  const LOC_LABELS = ["", ...allLocations];

  const mapDemoData = (items: any[]) =>
    items.map((d: any) => ({
      x: LOC_INDEX[d.ageGroup] || 1,
      y: d.responses,
      z: d.responses,
      ageGroup: d.ageGroup,
      gender: d.gender,
    }));

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { locations: [] as string[], serviceLines: [] as string[], ageGroups: [] as string[], genders: [] as string[] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedFilters({ ...pageFilters });
  };

  // Treemap ECharts option
  const treemapOption = useMemo(() => ({
    tooltip: {
      formatter: (params: any) => `${params.name}<br/>Responses: ${params.value}<br/>NPS: ${params.data?.nps ?? "—"}`,
    },
    series: [{
      type: "treemap",
      data: bySpecialty.map((s: any, i: number) => ({
        name: `${s.name}\n${s.pct || Math.round((s.value / bySpecialty.reduce((a: number, b: any) => a + b.value, 0)) * 100)}%`,
        value: s.value,
        nps: s.nps,
        itemStyle: { color: TREEMAP_COLORS[i % TREEMAP_COLORS.length] },
      })),
      roam: false,
      breadcrumb: { show: false },
      label: { show: true, fontSize: 11, fontWeight: "bold" as const, color: "#fff", lineHeight: 16 },
      upperLabel: { show: false },
      itemStyle: { borderColor: "#fff", borderWidth: 1, gapWidth: 0 },
      levels: [{ itemStyle: { borderColor: "#fff", borderWidth: 1, gapWidth: 0 } }],
    }],
  }), [bySpecialty]);

  if (!d && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
        </div>
        <div className="h-12 bg-white rounded-2xl border animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-72 bg-white rounded-2xl border animate-pulse" />)}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-72 bg-white rounded-2xl border animate-pulse" />)}
        </div>
        <div className="h-80 bg-white rounded-2xl border animate-pulse" />
        <div className="h-80 bg-white rounded-2xl border animate-pulse" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* ── Filters ── */}
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
        <FilterMultiSelect label="Service Line" options={["Health Check", "CarePlan", "Dental", "Specialist Consult", "Emotional Wellbeing", "Physiotheraphy", "Value Added Services", "NCV"]} selected={pageFilters.serviceLines} onChange={(v) => setPageFilters((p) => ({ ...p, serviceLines: v }))} />

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
          pageSlug="/portal/employee-experience/nps"
          pageTitle="Net Promoter Score"
          charts={[
            { id: "npsScore", label: "NPS Score Card" },
            { id: "npsTrends", label: "NPS Trends Over Time" },
            { id: "npsServiceCategory", label: "NPS by Service Category" },
            { id: "npsSpecialty", label: "NPS by Specialty" },
            { id: "npsLocation", label: "NPS by Location" },
            { id: "npsSubmissions", label: "NPS Submissions Breakdown" },
            { id: "npsVisitFrequency", label: "NPS by Visit Frequency" },
            { id: "feedbackWordCloud", label: "Feedback Word Cloud" },
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
        pageTitle="Net Promoter Score"
        pageSubtitle="Measures patient satisfaction and likelihood to recommend services."
        kpis={{}}
        fallbackSummary="Patient satisfaction is tracked through NPS methodology across service categories, specialties, and locations. Scores are compared year-over-year with breakdown by feedback channel and visit frequency to identify satisfaction drivers and improvement areas."
        fallbackChips={[
          { label: "Service Lines", value: "8 Categories" },
          { label: "Locations", value: "11 Sites" },
          { label: "Methodology", value: "NPS" },
        ]}
      />

      {/* ── Row 1: NPS Score + Trends ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* NPS Score Card */}
        {isChartVisible("npsScore") && <CVCard className="lg:col-span-4" expandable={false} chartId="npsScore" tooltipText="Overall NPS score calculated as % Promoters minus % Detractors. Scores above 50 are considered excellent, 30-50 good, and below 30 need attention.">
          <div className="flex flex-col items-center text-center pt-1">
            <h3 className="text-[14px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>
              Net Promoter Score (NPS)
            </h3>
            <p className="text-[56px] font-black leading-none mt-1.5 font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>
              {overallNPS}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {yoyChange >= 0 ? (
                <TrendingUp size={13} style={{ color: T.green }} />
              ) : (
                <TrendingDown size={13} style={{ color: T.coral }} />
              )}
              <span className="text-[12px] font-bold" style={{ color: yoyChange >= 0 ? T.green : T.coral }}>
                {yoyChange >= 0 ? "↑" : "↓"} {Math.abs(yoyChange)}% vs Last Year
              </span>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: T.textMuted }}>
              {formatNum(totalResponses)} responses
            </p>
            {/* Stacked Bar */}
            <div className="w-full mt-2.5 rounded-full overflow-hidden h-4 flex">
              <div style={{ width: `${promotersPct}%`, backgroundColor: NPS_COLORS.promoter }} />
              <div style={{ width: `${passivesPct}%`, backgroundColor: NPS_COLORS.passive }} />
              <div style={{ width: `${detractorsPct}%`, backgroundColor: NPS_COLORS.detractor }} />
            </div>
            <div className="flex items-center justify-center gap-4 mt-2 text-[11px]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: NPS_COLORS.promoter }} />
                <span style={{ color: T.textSecondary }}>Promoters</span>
                <strong style={{ color: NPS_COLORS.promoter }}>({promotersPct}%)</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: NPS_COLORS.passive }} />
                <span style={{ color: T.textSecondary }}>Passives</span>
                <strong style={{ color: T.textMuted }}>({passivesPct}%)</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: NPS_COLORS.detractor }} />
                <span style={{ color: T.textSecondary }}>Detractors</span>
                <strong style={{ color: NPS_COLORS.detractor }}>({detractorsPct}%)</strong>
              </span>
            </div>
            {/* NPS Explanation */}
            <div className="w-full mt-3 rounded-xl p-3 text-left" style={{ backgroundColor: T.pageBg }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: T.textSecondary }}>
                NPS measures patient loyalty on a 0–10 scale. Score = % Promoters − % Detractors.
              </p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <span className="mt-[3px] w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: NPS_COLORS.promoter }} />
                  <p className="text-[11px] leading-snug" style={{ color: T.textMuted }}>
                    <strong style={{ color: NPS_COLORS.promoter }}>Promoters (9–10)</strong> — Highly satisfied, likely to recommend
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-[3px] w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: NPS_COLORS.passive }} />
                  <p className="text-[11px] leading-snug" style={{ color: T.textMuted }}>
                    <strong style={{ color: NPS_COLORS.passive }}>Passives (7–8)</strong> — Satisfied but not enthusiastic
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-[3px] w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: NPS_COLORS.detractor }} />
                  <p className="text-[11px] leading-snug" style={{ color: T.textMuted }}>
                    <strong style={{ color: NPS_COLORS.detractor }}>Detractors (0–6)</strong> — Unhappy, may discourage others
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CVCard>}

        {/* NPS Trends Over Time */}
        {isChartVisible("npsTrends") && <CVCard
          className="lg:col-span-8"
          title="NPS Trends Over Time"
          subtitle="Tracks changes in patient satisfaction across months."
          tooltipText="Line chart tracking NPS score changes over time. Larger dots highlight significant shifts (5+ points). Green dots indicate improvement, red dots indicate decline. The dashed line shows the average NPS."
          chartId="npsTrends"
          chartData={trendData}
          chartDescription="Tracks changes in patient satisfaction across months."
        >
          {/* Toggle */}
          <div className="flex justify-end mb-2">
            <div className="inline-flex rounded-lg border overflow-hidden" style={{ borderColor: T.border }}>
              {(["yearly", "quarterly", "monthly"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTrendView(v)}
                  className="px-3 py-1.5 text-[11px] font-bold capitalize transition-colors"
                  style={{
                    backgroundColor: trendView === v ? "#4f46e5" : T.white,
                    color: trendView === v ? "#fff" : T.textSecondary,
                  }}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <ResetFilter visible={trendView !== "monthly"} onClick={() => setTrendView("monthly")} />
          </div>

          <div className="overflow-x-auto">
          <div style={{ height: 260, minWidth: Math.max(400, (trendData?.length || 12) * 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: T.textMuted }} />
                <ReferenceLine y={avgNPS} stroke={T.green} strokeDasharray="6 4" strokeOpacity={0.6} />
                <RechartsTooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{dd?.month}</p>
                        <p style={{ color: "#4f46e5" }}>NPS Score: <strong>{dd?.nps}</strong></p>
                        <p>Total Responses: <strong>{dd?.responses}</strong></p>
                        {dd?.promotersPct !== undefined && (
                          <>
                            <p style={{ color: NPS_COLORS.promoter }}>Promoters: {dd.promotersPct}%</p>
                            <p style={{ color: T.textMuted }}>Passives: {dd.passivesPct}%</p>
                            <p style={{ color: NPS_COLORS.detractor }}>Detractors: {dd.detractorsPct}%</p>
                          </>
                        )}
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="nps"
                  stroke={"#4f46e5"}
                  strokeWidth={2.5}
                  dot={(props: any) => {
                    const { cx, cy, index } = props;
                    const curr = trendData[index]?.nps ?? 0;
                    const prev = index > 0 ? trendData[index - 1]?.nps ?? curr : curr;
                    const diff = curr - prev;
                    const isSignificant = Math.abs(diff) >= 5;
                    const dotColor = isSignificant ? (diff > 0 ? T.green : T.coral) : "#4f46e5";
                    const dotR = isSignificant ? 6 : 4;
                    return <circle key={index} cx={cx} cy={cy} r={dotR} fill={dotColor} stroke="#fff" strokeWidth={2} />;
                  }}
                  activeDot={{ r: 6, strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          </div>
          <p className="text-[11px] text-center mt-2" style={{ color: T.textMuted }}>
            Larger dots indicate significant changes (&plusmn;5 points). Green = rise, Red = dip.
          </p>
          <div className="mt-3">
            <InsightBox text={`Overall NPS is ${overallNPS} based on ${formatNum(totalResponses)} responses. ${promotersPct}% are promoters, ${passivesPct}% passives, and ${detractorsPct}% detractors. ${avgNPS > 50 ? 'The score indicates excellent patient satisfaction.' : avgNPS > 30 ? 'The score is good but there is room for improvement.' : 'Focus on reducing detractor percentage to improve NPS.'}`} />
          </div>
        </CVCard>}
      </div>

      {/* ── Row 2: Service Category + Specialty + Condition ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* NPS by Service Category - Radar */}
        {isChartVisible("npsServiceCategory") && <CVCard
          title="NPS by Service Category"
          accentColor={"#4f46e5"}
          tooltipText="Radar chart comparing NPS scores across different service categories. Larger area coverage indicates higher satisfaction. Identify which services lead or lag in patient satisfaction."
          chartId="npsServiceCategory"
          chartData={byServiceCategory}
          chartDescription="Radar chart comparing NPS scores across different service categories."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={byServiceCategory} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 10, fill: T.textPrimary }} />
                <PolarRadiusAxis tick={{ fontSize: 9 }} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: "8px", border: `1px solid ${T.border}`, fontSize: 12 }}
                />
                <Radar
                  name="NPS Score"
                  dataKey="nps"
                  stroke={"#4f46e5"}
                  fill={"#4f46e5"}
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <InsightBox text={`NPS scores vary across service categories. ${byServiceCategory.length > 0 ? `${byServiceCategory.reduce((a: any, b: any) => a.nps > b.nps ? a : b).category} leads with the highest NPS.` : ''} Compare radar coverage to identify underperforming service lines.`} />
        </CVCard>}

        {/* NPS by Specialty - Treemap */}
        {isChartVisible("npsSpecialty") && <CVCard
          title="NPS by Specialty"
          subtitle="Shows average NPS for consultations across medical specialties."
          accentColor={T.amber}
          tooltipText="Treemap showing NPS scores by medical specialty. Tile size represents response volume, colors represent different specialties. Hover to see exact NPS score and response count."
          chartId="npsSpecialty"
          chartData={bySpecialty}
          chartDescription="Treemap of average NPS scores by medical specialty — tile size represents response volume, so larger tiles provide more statistically reliable scores. Hover any tile to see exact NPS and response count."

        >
          <div style={{ height: 300 }}>
            <ReactECharts option={treemapOption} style={{ height: "100%", width: "100%" }} />
          </div>
          <InsightBox text="Specialty-level NPS highlights which medical departments deliver the best patient experience. Larger tiles indicate more responses, providing more statistically significant scores." />
        </CVCard>}

        {/* NPS by Location - Donut */}
        {isChartVisible("npsLocation") && <CVCard
          title="NPS by Location"
          accentColor={"#6366f1"}
          tooltipText="Donut chart showing NPS distribution across locations. Each segment represents a location with its response count and NPS score. Hover for details."
          chartId="npsLocation"
          chartData={byDiagnosisCategory}
          chartDescription="Donut chart showing NPS distribution across locations."
        >
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byDiagnosisCategory}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, nps }: any) => {
                    const short = name.length > 14 ? name.slice(0, 12) + ".." : name;
                    return `${short}: ${nps}`;
                  }}
                  labelLine={{ stroke: T.textMuted, strokeWidth: 1 }}
                >
                  {byDiagnosisCategory.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: any, name: any, props: any) => [
                    `Responses: ${value}, NPS: ${props.payload.nps}`,
                    name,
                  ]}
                  contentStyle={{ borderRadius: "8px", border: `1px solid ${T.border}`, fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <InsightBox text="Location-wise NPS distribution helps identify regional variations in patient satisfaction. Focus improvement efforts on locations with lower scores relative to response volume." />
        </CVCard>}
      </div>

      {/* ── Row 3: NPS Submissions Breakdown by Location ── */}
      {isChartVisible("npsSubmissions") && <CVCard
        title="NPS Submissions Breakdown"
        subtitle="Distribution of NPS responses across locations and feedback channels."
        accentColor={"#6366f1"}
        tooltipText="Scatter plot showing NPS submission volumes across locations, split by feedback channel (Online/WC vs In-Clinic). Bubble size indicates response volume. Summary cards below highlight top segments."
        chartId="npsSubmissions"
        chartData={demographics}
        chartDescription="Distribution of NPS responses across locations and feedback channels."
      >
        <div className="flex items-center gap-4 mb-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: DEMO_COLORS.Female }} />
            Online / WC
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: DEMO_COLORS.Male }} />
            In-Clinic
          </span>
        </div>
        <div className="overflow-x-auto">
        <div style={{ height: 280, minWidth: Math.max(500, allLocations.length * 60) }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0.5, allLocations.length + 0.5]}
                ticks={allLocations.map((_, i) => i + 1)}
                tickFormatter={(v: number) => {
                  const lbl = LOC_LABELS[v] || "";
                  return lbl.length > 12 ? lbl.slice(0, 10) + ".." : lbl;
                }}
                tick={{ fontSize: 9, fill: T.textMuted }}
                name="Location"
              />
              <YAxis type="number" dataKey="y" tick={{ fontSize: 11, fill: T.textMuted }} name="Responses" />
              <ZAxis type="number" dataKey="z" range={[60, 600]} />
              <RechartsTooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload?.length) return null;
                  const dd = payload[0]?.payload;
                  return (
                    <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                      <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{dd?.ageGroup} &middot; {dd?.gender}</p>
                      <p>Responses: <strong>{dd?.y}</strong></p>
                    </div>
                  );
                }}
              />
              <Scatter name="Online / WC" data={mapDemoData(demoOnline)} fill={DEMO_COLORS.Female} opacity={0.8} />
              <Scatter name="In-Clinic" data={mapDemoData(demoInClinic)} fill={DEMO_COLORS.Male} opacity={0.8} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "#eef2ff", border: `1px solid ${T.border}` }}>
            <p className="text-[26px] font-black font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{demoSummary.highestCount}</p>
            <p className="text-[11px] font-bold mt-1" style={{ color: T.textSecondary }}>Highest</p>
            <p className="text-[11px]" style={{ color: T.textMuted }}>{demoSummary.highestAgeGroup} &nbsp; {demoSummary.highestGender}</p>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "#f0fdf4", border: `1px solid ${T.border}` }}>
            <p className="text-[26px] font-black font-[var(--font-inter)]" style={{ color: "#6366f1" }}>{demoSummary.topGenderCount}</p>
            <p className="text-[11px] font-bold mt-1" style={{ color: "#6366f1" }}>Top Channel</p>
            <p className="text-[11px]" style={{ color: T.textMuted }}>{demoSummary.topGender}</p>
          </div>
          <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "#f5f3ff", border: `1px solid ${T.border}` }}>
            <p className="text-[26px] font-black font-[var(--font-inter)]" style={{ color: T.amber }}>{demoSummary.topAgeGroupCount}</p>
            <p className="text-[11px] font-bold mt-1" style={{ color: T.amber }}>Top Location</p>
            <p className="text-[11px]" style={{ color: T.textMuted }}>{demoSummary.topAgeGroup}</p>
          </div>
        </div>
        <div className="mt-3">
          <InsightBox text={`${demoSummary.highestAgeGroup} ${demoSummary.highestGender} segment leads with ${demoSummary.highestCount} submissions. ${demoSummary.topGender} is the dominant feedback channel with ${demoSummary.topGenderCount} responses.`} />
        </div>
      </CVCard>}

      {/* ── Row 4: NPS by User Visits + Feedback Word Cloud (50:50) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {isChartVisible("npsVisitFrequency") && <CVCard
        title="NPS by Visit Frequency"
        subtitle="How does satisfaction change as employees visit the OHC more often?"
        accentColor={"#4f46e5"}
        tooltipText="Bar chart showing total NPS feedback volume per visit-frequency bucket with a line overlay showing NPS score. Employees are grouped by how many times they visited the OHC — e.g. '3 Visits' means employees who had exactly 3 NPS-rated consultations. Rising NPS with more visits suggests continuity of care drives satisfaction."
        chartId="npsVisitFrequency"
        chartData={byVisitFrequency}
        chartTitle="NPS by Visit Frequency"
        chartDescription="Bar chart showing NPS feedback volume and NPS % by employee visit frequency. Helps assess whether repeat visits improve or worsen satisfaction."
      >
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={byVisitFrequency} margin={{ top: 24, right: 8, left: -10, bottom: 0 }} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="visits" tick={{ fontSize: 11, fill: T.textSecondary, fontWeight: 500 }} axisLine={{ stroke: T.border }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: T.textMuted }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
              <RechartsTooltip
                contentStyle={{ borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                formatter={(value: unknown, name: unknown) => { const v = Number(value); const n = String(name); return [n === "NPS %" ? `${v}%` : v.toLocaleString(), n]; }}
              />
              <Bar
                yAxisId="left"
                dataKey="feedbacks"
                name="Feedbacks"
                fill="#6366f1"
                fillOpacity={0.18}
                stroke="#6366f1"
                strokeWidth={1}
                radius={[5, 5, 0, 0]}
                maxBarSize={48}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="npsPct"
                name="NPS %"
                stroke={T.teal}
                strokeWidth={2.5}
                dot={{ r: 5, fill: "#fff", stroke: T.teal, strokeWidth: 2.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-5 mt-2 text-[11px]" style={{ color: T.textSecondary }}>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: "rgba(99,102,241,0.18)", border: "1px solid #6366f1" }} />
            Feedbacks
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 rounded" style={{ backgroundColor: T.teal }} />
            NPS %
          </span>
        </div>
        <div className="mt-2">
          <InsightBox text="Employees grouped by visit frequency. Rising NPS with more visits suggests continuity of care improves satisfaction." />
        </div>
      </CVCard>}

      {isChartVisible("feedbackWordCloud") && <CVCard
        title="Feedback Word Cloud"
        subtitle="Most frequent themes from open-ended feedback"
        accentColor={T.coral}
        tooltipText="Visual representation of the most frequent words from open-ended patient feedback. Larger words appear more often. Green words indicate positive sentiment, red indicates areas for improvement."
        chartId="feedbackWordCloud"
        chartData={wordCloud}
        chartDescription="Word cloud built from open-ended patient feedback — word size reflects mention frequency. Green words represent positive themes (e.g. 'helpful', 'professional'), red words flag areas needing attention (e.g. 'wait', 'slow')."

      >
        {/* Word cloud — ECharts wordCloud with spiral placement */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#FAFBFD", height: 420 }}>
          <ReactECharts
            option={{
              tooltip: {
                show: true,
                formatter: (p: any) => `<strong>${p.name}</strong><br/>${p.value} mentions`,
                backgroundColor: "#fff",
                borderColor: T.border,
                borderWidth: 1,
                padding: [8, 12],
                textStyle: { fontSize: 12, color: T.textPrimary },
                extraCssText: "border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
              },
              series: [{
                type: "wordCloud",
                shape: "circle",
                gridSize: 8,
                sizeRange: [28, 96],
                rotationRange: [-45, 45],
                rotationStep: 45,
                drawOutOfBound: false,
                layoutAnimation: true,
                textStyle: {
                  fontFamily: "var(--font-inter), system-ui, sans-serif",
                  fontWeight: "bold",
                },
                emphasis: {
                  textStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" },
                },
                data: [...wordCloud]
                  .sort((a: any, b: any) => b.count - a.count)
                  .map((w: any, i: number) => {
                    const POSITIVE_COLORS = ["#4f46e5", "#0d9488", "#6366f1", "#14b8a6", "#818cf8", "#7c3aed", "#34d399"];
                    const NEGATIVE_COLORS = ["#a1a1aa", "#d4d4d8", "#9ca3af", "#c4b5fd", "#e5e7eb"];
                    const seed = (i * 137 + 41) % 100;
                    return {
                      name: w.word,
                      value: w.count,
                      textStyle: {
                        color: w.sentiment === "negative"
                          ? NEGATIVE_COLORS[seed % NEGATIVE_COLORS.length]
                          : POSITIVE_COLORS[seed % POSITIVE_COLORS.length],
                      },
                    };
                  }),
              }],
            }}
            style={{ height: "100%", width: "100%" }}
          />
        </div>

        {/* Legend + Top words */}
        <div className="flex items-center justify-between mt-4 px-1">
          <div className="flex items-center gap-5 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#4f46e5" }} />
              <span style={{ color: T.textSecondary }}>Positive</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#a1a1aa" }} />
              <span style={{ color: T.textSecondary }}>Needs improvement</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-[12px]">
            {topPositive && (
              <span><strong style={{ color: "#4f46e5" }}>Top:</strong> <span style={{ color: T.textPrimary }}>{topPositive.word} ({topPositive.count})</span></span>
            )}
            {topConcern && (
              <span><strong style={{ color: "#a1a1aa" }}>Concern:</strong> <span style={{ color: T.textPrimary }}>{topConcern.word} ({topConcern.count})</span></span>
            )}
          </div>
        </div>
        <div className="mt-3">
          <InsightBox text={`${topPositive ? `"${topPositive.word}" is the most mentioned positive theme (${topPositive.count} mentions).` : ''} ${topConcern ? `"${topConcern.word}" is the top area of concern (${topConcern.count} mentions). Consider targeted interventions to address this feedback.` : ''}`} />
        </div>
      </CVCard>}
      </div>
    </div>
  );
}
