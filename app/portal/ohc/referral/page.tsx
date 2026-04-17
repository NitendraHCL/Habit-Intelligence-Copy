"use client";

import { T, HEATMAP_GRADIENT } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
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
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });


const MATRIX_COLORS = HEATMAP_GRADIENT;

function getMatrixColor(value: number, max: number) {
  if (max === 0) return MATRIX_COLORS[0];
  const idx = Math.min(Math.floor((value / max) * (MATRIX_COLORS.length - 1)), MATRIX_COLORS.length - 1);
  return MATRIX_COLORS[idx];
}

function getMatrixTextColor(value: number, max: number) {
  if (max === 0) return T.textPrimary;
  return (value / max) > 0.5 ? "#fff" : T.textPrimary;
}

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
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, comments, chartData, chartTitle, chartDescription,
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

// ─── Warm Section ───
function WarmSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-5 sm:p-6 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>
      {children}
    </div>
  );
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

// ─── Filter Options (defaults — overridden by /api/filters) ───

// ─── Main Page ───
export default function ReferralAnalyticsPage() {
  const { activeClientId } = useAuth();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [dateOpen, setDateOpen] = useState(false);

  const [pageFilters, setPageFilters] = useState({
    ageGroups: [] as string[],
    genders: [] as string[],
    specialties: [] as string[],
    locations: [] as string[],
  });

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const [appliedDateRange, setAppliedDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [appliedFilters, setAppliedFilters] = useState({
    ageGroups: [] as string[],
    genders: [] as string[],
    specialties: [] as string[],
    locations: [] as string[],
  });

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

  const [matrixYear, setMatrixYear] = useState<string>("");
  const [matrixView, setMatrixView] = useState<"absolute" | "percent">("absolute");
  const [specFilter, setSpecFilter] = useState<"all" | "available" | "external">("all");
  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = (chartId: string) => {
    if (!previewConfig) return true;
    const cc = previewConfig.charts[chartId];
    if (!cc) return true;
    return cc.visible;
  };

  const extraParams = useMemo(() => {
    const p: Record<string, string> = {};
    p.dateFrom = format(appliedDateRange.from, "yyyy-MM-dd");
    p.dateTo = format(appliedDateRange.to, "yyyy-MM-dd");
    if (appliedFilters.ageGroups.length) p.ageGroups = appliedFilters.ageGroups.join(",");
    if (appliedFilters.genders.length) p.genders = appliedFilters.genders.join(",");
    if (appliedFilters.specialties.length) p.specialties = appliedFilters.specialties.join(",");
    if (appliedFilters.locations.length) p.locations = appliedFilters.locations.join(",");
    return p;
  }, [appliedDateRange, appliedFilters]);

  const { data, isLoading, isValidating, mutate } = useDashboardData("ohc/referral", extraParams);

  const d = data as any;
  const kpis = d?.kpis;
  const charts = d?.charts;

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { ageGroups: [] as string[], genders: [] as string[], specialties: [] as string[], locations: [] as string[] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedFilters({ ...pageFilters });
  };

  // Matrix data
  const years: string[] = charts?.matrixYears || [];
  const activeYear = matrixYear || years[years.length - 1] || "";
  const matrixData: Array<{ referredFrom: string; referredTo: string; count: number }> = charts?.matrixByYear?.[activeYear] || [];

  const referringSpecs = [...new Set(matrixData.map((m) => m.referredFrom))];
  const referredSpecs = [...new Set(matrixData.map((m) => m.referredTo))];
  const matrixLookup: Record<string, number> = {};
  let matrixMax = 0;
  matrixData.forEach((m) => {
    matrixLookup[`${m.referredFrom}|${m.referredTo}`] = m.count;
    if (m.count > matrixMax) matrixMax = m.count;
  });
  // Row totals for percent view
  const rowTotals: Record<string, number> = {};
  referringSpecs.forEach((from) => {
    rowTotals[from] = referredSpecs.reduce((s, to) => s + (matrixLookup[`${from}|${to}`] || 0), 0);
  });

  // Specialty detail filter
  const filteredSpecDetails = useMemo(() => {
    const details: any[] = charts?.specialtyDetails || [];
    if (specFilter === "available") return details.filter((s: any) => s.isAvailableInClinic);
    if (specFilter === "external") return details.filter((s: any) => !s.isAvailableInClinic);
    return details;
  }, [charts?.specialtyDetails, specFilter]);

  // Demographics data for polar radial
  const demoData: Array<{ ageGroup: string; male: number; female: number }> = charts?.demographics || [];
  const demoStats = charts?.demographicStats;

  // Location stacked bar
  const topBarSpecs: string[] = charts?.topBarSpecialties || [];
  const specAvailability: Record<string, boolean> = charts?.specAvailability || {};

  if (!d && isLoading) {
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
      {/* ── Page Filters ── */}
      <div
        className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
      >
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
          <FilterMultiSelect label="Specialty" options={filterOptions.specialties} selected={pageFilters.specialties} onChange={(v) => setPageFilters((p) => ({ ...p, specialties: v }))} />

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
          pageSlug="/portal/ohc/referral"
          pageTitle="Referral Analytics"
          charts={[
            { id: "referralKpis", label: "Referral v/s Consumption KPIs" },
            { id: "referralTrends", label: "Referral Trends" },
            { id: "specialtyConversion", label: "Referral Availability & Conversion by Specialty" },
            { id: "referralMatrix", label: "Referral Matrix: Who Refers to Whom?" },
            { id: "referralDemographics", label: "Referral Demographics" },
            { id: "locationBySpecialty", label: "Referral Volume by Specialty & Clinic Availability" },
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
      {hasActiveFilters && (
        <ActiveFilterChips filters={appliedFilters} onRemove={handleRemoveChip} onClearAll={handleClearAll} />
      )}

      {/* ── Page Header + AI Summary (Blue Box) ── */}
      <PageGlanceBox
        pageTitle="Referral Analytics"
        pageSubtitle="OHC referral patterns, specialist conversion rates and availability insights"
        kpis={kpis || {}}
        fallbackSummary={`The OHC referral system has processed ${formatNum(kpis?.totalReferrals || 0)} referrals with a ${kpis?.conversionPct || 0}% conversion rate. In-clinic availability stands at ${kpis?.availableInClinicPct || 0}% of referrals. ${formatNum(kpis?.convertedCount || 0)} referrals have been successfully converted to specialist consultations.`}
        fallbackChips={[
          { label: "Total Referrals", value: formatNum(kpis?.totalReferrals || 0) },
          { label: "Conversion Rate", value: `${kpis?.conversionPct || 0}%` },
          { label: "In-Clinic", value: `${kpis?.availableInClinicPct || 0}%` },
        ]}
      />

      {/* ── KPIs: Referral v/s Consumption ── */}
      {(isChartVisible("referralKpis") || isChartVisible("referralTrends")) && <WarmSection>
        <AccentBar color={"#4f46e5"} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Referral v/s Consumption</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Summary of referral volumes, in-clinic availability and conversion rates</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">

          {/* Card 1 — Total Referrals (baseline) */}
          <div className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-2" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Referrals</p>
            <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.totalReferrals || 0)}</p>
            <p className="text-[12px] leading-snug" style={{ color: T.textSecondary }}>
              All specialist referrals issued — this is the <span className="font-semibold" style={{ color: T.textPrimary }}>baseline (100%)</span> from which the cards below are calculated.
            </p>
          </div>

          {/* Card 2 — In-Clinic Available */}
          <div className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-2" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Referred to an In-Clinic Specialty</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.availableInClinicCount || 0)}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-bold" style={{ backgroundColor: "rgba(79,70,229,0.08)", color: "#4f46e5" }}>
                {kpis?.availableInClinicPct || 0}% of total referrals
              </span>
            </div>
            <p className="text-[12px] leading-snug" style={{ color: T.textSecondary }}>
              Out of {formatNum(kpis?.totalReferrals || 0)} referrals, <span className="font-semibold" style={{ color: T.textPrimary }}>{kpis?.availableInClinicPct || 0}%</span> were referred to a specialty that is available within the OHC facility.
            </p>
          </div>

          {/* Card 3 — In-Clinic Conversions */}
          <div className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-2" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>In-Clinic Conversions</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.teal }}>{formatNum(kpis?.convertedCount || 0)}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-bold" style={{ backgroundColor: "rgba(13,148,136,0.08)", color: T.teal }}>
                {kpis?.conversionPct || 0}% conversion rate
              </span>
            </div>
            <p className="text-[12px] leading-snug" style={{ color: T.textSecondary }}>
              Of the <span className="font-semibold" style={{ color: T.textPrimary }}>{formatNum(kpis?.availableInClinicCount || 0)}</span> in-clinic-available referrals, <span className="font-semibold" style={{ color: T.teal }}>{kpis?.conversionPct || 0}%</span> were actually consulted in-clinic.
            </p>
          </div>

        </div>

        {/* ── Referral Trends (Area Chart) ── */}
        {isChartVisible("referralTrends") && <CVCard accentColor={"#4f46e5"} title="Referral Trends" subtitle="Monthly referral volumes with in-clinic availability and conversions" expandable={false} tooltipText="Area chart showing monthly referral volumes split by total referrals, in-clinic available specialties, and actual conversions. Tracks referral pipeline health over time." chartData={charts?.referralTrends} chartTitle="Referral Trends" chartDescription="Monthly referral volumes with in-clinic availability and conversions">
          <div className="overflow-x-auto">
          <div style={{ height: 300, minWidth: Math.max(500, (charts?.referralTrends?.length || 0) * 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts?.referralTrends || []} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={"#4f46e5"} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={"#4f46e5"} stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gradAvailable" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={"#0891b2"} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={"#0891b2"} stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gradConversions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={"#059669"} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={"#059669"} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: T.textMuted }} />
                <YAxis tick={{ fontSize: 10, fill: T.textMuted }} />
                <RechartsTooltip content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  const dd = payload[0]?.payload;
                  return (
                    <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                      <p className="font-bold mb-1.5" style={{ color: T.textPrimary }}>{label}</p>
                      <p style={{ color: "#4f46e5" }}>Total Referrals : <strong>{formatNum(dd?.totalReferrals)}</strong></p>
                      <p style={{ color: "#0891b2" }}>Referrals for specialty available in clinic : <strong>{formatNum(dd?.availableInClinic)}</strong></p>
                      <p style={{ color: "#059669" }}>In-Clinic Conversions (for available specialties) : <strong>{formatNum(dd?.inClinicConversions)}</strong></p>
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={7} />
                <Area type="monotone" dataKey="totalReferrals" name="Total Referrals" stroke={"#4f46e5"} fill="url(#gradTotal)" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#4f46e5", strokeWidth: 2 }} />
                <Area type="monotone" dataKey="availableInClinic" name="Referrals for specialty available in clinic" stroke={"#0891b2"} fill="url(#gradAvailable)" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#0891b2", strokeWidth: 2 }} />
                <Area type="monotone" dataKey="inClinicConversions" name="In-Clinic Conversions (for available specialties)" stroke={"#059669"} fill="url(#gradConversions)" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#059669", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </div>
        </CVCard>}
      </WarmSection>}

      {/* ── Referral Availability & Conversion by Specialty ── */}
      {isChartVisible("specialtyConversion") && <CVCard accentColor={"#4f46e5"} title="Referral Availability & Conversion by Specialty" subtitle="Which specialties are available in-clinic vs. external, and their conversion rates" tooltipText="Table listing each referred specialty with availability status, referral count, conversion progress bar, and in-clinic consult counts. Filter between all, available, or external specialties."
        comments={[{ id: "kam-ref-1", author: "HCL KAM", text: "Dermatology and Ophthalmology referrals show 0% in-clinic conversion since these specialties are entirely external. Cost analysis shows that bringing a visiting Dermatologist twice a week would serve 78% of referral demand and save ~18% on external referral costs. A pilot visiting specialist program is planned for Bangalore and Chennai from Q2 2025.", date: "Jan 2025", isKAM: true }]}
        chartData={filteredSpecDetails} chartTitle="Referral Availability & Conversion by Specialty" chartDescription="Which specialties are available in-clinic vs. external, and their conversion rates">
        <div className="flex items-center justify-end gap-2 mb-3">
          <div className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5" style={{ backgroundColor: T.borderLight }}>
            {([["all", "All Specialties"], ["available", "Available in Clinic"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSpecFilter(key)}
                className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${specFilter === key ? "bg-white shadow-sm" : ""}`}
                style={{ color: specFilter === key ? T.textPrimary : T.textMuted }}>
                {label}
              </button>
            ))}
          </div>
          <ResetFilter visible={specFilter !== "all"} onClick={() => setSpecFilter("all")} />
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white }}>
          <div className="overflow-x-auto">
          {/* Table Header */}
          <div className="grid items-center py-3 px-5" style={{ gridTemplateColumns: "1.8fr 1.2fr 1fr 1.4fr 1fr 0.9fr", borderBottom: `2px solid ${T.border}`, backgroundColor: "#FAFBFC", minWidth: 700 }}>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: T.textSecondary }}>Referred Specialty</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: T.textSecondary }}>Availability</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-center" style={{ color: T.textSecondary }}>Referrals</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-center" style={{ color: T.textSecondary }}>Conversion</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-center" style={{ color: T.textSecondary }}>In-clinic Consults</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-center" style={{ color: T.textSecondary }}>Rate</span>
          </div>
          {/* Rows */}
          <div className="overflow-y-auto max-h-[400px]">
          {filteredSpecDetails.map((s: any) => {
            const barColor = s.conversionRate >= 70 ? T.teal : s.conversionRate > 0 ? T.amber : T.coral;
            const barBg = s.conversionRate >= 70 ? "#E6F9F5" : s.conversionRate > 0 ? "#FFF6E6" : "#FDE8E8";
            return (
              <div key={s.specialty} className="grid items-center py-4 px-5" style={{ gridTemplateColumns: "1.8fr 1.2fr 1fr 1.4fr 1fr 0.9fr", borderBottom: `1px solid ${T.borderLight}`, minWidth: 700 }}>
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>{s.specialty}</p>
                </div>
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10.5px] font-semibold ${
                    s.isAvailableInClinic
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-orange-50 text-orange-600 border border-orange-200"
                  }`}>
                    {s.isAvailableInClinic ? "Available in Clinic" : "External Only"}
                  </span>
                </div>
                <div className="text-center">
                  <span className="text-[16px] font-bold" style={{ color: T.textPrimary }}>{formatNum(s.referrals)}</span>
                </div>
                <div className="flex items-center gap-2.5 px-1">
                  <div className="flex-1 h-[7px] rounded-full overflow-hidden" style={{ backgroundColor: barBg }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(s.conversionRate, 100)}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="text-[12px] font-bold w-10 text-right" style={{ color: barColor }}>{s.conversionRate}%</span>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center justify-center min-w-[36px] h-[26px] px-2 rounded-full text-[13px] font-bold" style={{
                    backgroundColor: s.inClinicConsults > 0 ? "#E6F9F5" : "#FDE8E8",
                    color: s.inClinicConsults > 0 ? T.teal : T.coral,
                  }}>
                    {formatNum(s.inClinicConsults)}
                  </span>
                </div>
                <div className="text-center">
                  <span className="inline-flex items-center justify-center min-w-[36px] h-[26px] px-2 rounded-full text-[13px] font-bold" style={{
                    backgroundColor: s.conversionRate >= 70 ? "#E6F9F5" : s.conversionRate > 0 ? "#FFF6E6" : "#FDE8E8",
                    color: s.conversionRate >= 70 ? T.teal : s.conversionRate > 0 ? T.amber : T.coral,
                  }}>
                    {s.conversionRate > 0 ? `${s.conversionRate}%` : "0%"}
                  </span>
                </div>
              </div>
            );
          })}
          {filteredSpecDetails.length === 0 && (
            <div className="py-10 text-center text-[13px]" style={{ color: T.textMuted }}>No specialties found</div>
          )}
          </div>
          </div>
        </div>
        {filteredSpecDetails.length > 0 && (
          <div className="mt-4">
            <InsightBox text={`${filteredSpecDetails.filter((s: any) => s.isAvailableInClinic).length} specialties are available in-clinic. ${(() => {
              const top = filteredSpecDetails.find((s: any) => s.isAvailableInClinic && s.conversionRate > 0);
              return top ? `${top.specialty} leads in-clinic conversions with ${formatNum(top.inClinicConsults)} consults.` : "";
            })()}${(() => {
              const extCount = filteredSpecDetails.filter((s: any) => !s.isAvailableInClinic).length;
              return extCount > 0 ? ` ${extCount} specialties are external-only with 0% in-clinic conversion.` : "";
            })()}`} />
          </div>
        )}
      </CVCard>}

      {/* ── Who Refers to Whom (Heatmap Matrix) ── */}
      {isChartVisible("referralMatrix") && <CVCard accentColor={T.amber} title="Referral Matrix: Who Refers to Whom?" subtitle="See which specialties refer patients to each other most frequently" tooltipText="Heatmap matrix showing referral flows between specialties. Rows represent referring specialties and columns show receiving specialties. Darker cells indicate higher referral volumes." chartData={matrixData} chartTitle="Referral Matrix: Who Refers to Whom?" chartDescription="See which specialties refer patients to each other most frequently">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: T.textSecondary }}>Year:</span>
            <select value={activeYear} onChange={(e) => setMatrixYear(e.target.value)}
              className="h-8 px-2 rounded-lg border text-[12px]" style={{ borderColor: T.border, color: T.textPrimary }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium" style={{ color: T.textSecondary }}>View:</span>
            <select value={matrixView} onChange={(e) => setMatrixView(e.target.value as any)}
              className="h-8 px-2 rounded-lg border text-[12px]" style={{ borderColor: T.border, color: T.textPrimary }}>
              <option value="absolute">Absolute Count</option>
              <option value="percent">Percentage</option>
            </select>
          </div>
          <ResetFilter visible={matrixYear !== "" || matrixView !== "absolute"} onClick={() => { setMatrixYear(""); setMatrixView("absolute"); }} />
        </div>
        {matrixView === "percent" && (
          <div className="flex items-start gap-2 mb-3 px-3.5 py-2.5 rounded-lg text-[11.5px]" style={{ backgroundColor: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)", color: T.textSecondary }}>
            <span style={{ color: "#d97706", fontWeight: 700, flexShrink: 0 }}>%</span>
            <span>Each % shows <strong style={{ color: T.textPrimary }}>what share of that column specialty&apos;s total outgoing referrals</strong> went to the row specialty. Read column-by-column — each column sums to ~100%.</span>
          </div>
        )}
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr>
                <th className="py-2.5 px-3 text-left font-semibold text-[11px]" style={{ color: T.textSecondary, minWidth: 140 }}>
                  Referring &rarr;<br/>Referred &darr;
                </th>
                {referringSpecs.map((from) => (
                  <th key={from} className="py-2.5 px-3 text-center font-bold text-[11px]" style={{ color: T.textPrimary, minWidth: 100 }}>
                    {from}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referredSpecs.map((to) => (
                <tr key={to}>
                  <td className="py-2.5 px-3 font-semibold" style={{ color: T.textPrimary }}>{to}</td>
                  {referringSpecs.map((from) => {
                    const val = matrixLookup[`${from}|${to}`] || 0;
                    const display = matrixView === "percent" && rowTotals[from] > 0
                      ? `${Math.round((val / rowTotals[from]) * 100)}%`
                      : formatNum(val);
                    return (
                      <td key={from} className="py-2.5 px-3 text-center font-bold text-[12px]" style={{
                        backgroundColor: val > 0 ? getMatrixColor(val, matrixMax) : T.borderLight,
                        color: val > 0 ? getMatrixTextColor(val, matrixMax) : T.textMuted,
                        borderRadius: 4,
                        border: "2px solid #fff",
                      }}>
                        {val > 0 ? display : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-4 text-[11px]" style={{ color: T.textSecondary }}>
          <span className="font-semibold">Intensity:</span>
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: MATRIX_COLORS[0] }} /> <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: MATRIX_COLORS[3] }} /> <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: MATRIX_COLORS[7] }} /> <span>High</span>
          </div>
        </div>
        <div className="mt-4">
          <InsightBox text="The referral matrix reveals the strongest inter-specialty referral pathways. Use the year and view toggles to track how referral patterns evolve over time." />
        </div>
      </CVCard>}

      {/* ── Demographics + Location Bar ── */}
      {(isChartVisible("referralDemographics") || isChartVisible("locationBySpecialty")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Referral Demographics (Sunburst) */}
        {isChartVisible("referralDemographics") && <CVCard accentColor={T.amber} title="Referral Demographics" subtitle="Gender distribution across age groups for specialty referrals" tooltipText="Sunburst chart showing gender distribution across age groups for specialty referrals. Inner ring shows male/female split, outer ring breaks down by age." chartData={demoData} chartTitle="Referral Demographics" chartDescription="Gender distribution across age groups for specialty referrals">
          <div style={{ height: 340 }}>
            <ReactECharts style={{ height: "100%", width: "100%" }} option={{
              tooltip: {
                trigger: "item",
                backgroundColor: "#fff",
                borderColor: T.border,
                borderWidth: 1,
                padding: [10, 14],
                textStyle: { fontSize: 12, color: T.textPrimary },
                extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
                formatter: (p: any) => p.data ? `<strong>${p.data.name}</strong><br/>Referrals: ${formatNum(p.data.value || p.value)}` : "",
              },
              series: [{
                type: "sunburst",
                data: (() => {
                  const maleChildren = demoData.map((d) => ({
                    name: d.ageGroup,
                    value: d.male,
                    itemStyle: { color: (() => {
                      const shades: Record<string, string> = { "<20": "#3B5998", "20-35": "#7B9BD2", "36-40": "#A8C4E6", "41-60": "#5A7DB5", "61+": "#2C4A7C", "18-25": "#3B5998", "26-35": "#7B9BD2", "36-45": "#A8C4E6", "36-44": "#A8C4E6", "45-59": "#5A7DB5", "46-55": "#5A7DB5", "46-60": "#5A7DB5", "56-65": "#3B5998", "60+": "#2C4A7C", "65+": "#1E3A6E" };
                      return shades[d.ageGroup] || "#7B9BD2";
                    })() },
                  })).filter((c) => c.value > 0);
                  const femaleChildren = demoData.map((d) => ({
                    name: d.ageGroup,
                    value: d.female,
                    itemStyle: { color: (() => {
                      const shades: Record<string, string> = { "<20": "#E84393", "20-35": "#F8A5C2", "36-40": "#FDA7DF", "41-60": "#D63384", "61+": "#C02070", "18-25": "#E84393", "26-35": "#F8A5C2", "36-45": "#FDA7DF", "36-44": "#FDA7DF", "45-59": "#D63384", "46-55": "#D63384", "46-60": "#B83280", "56-65": "#E84393", "60+": "#C02070", "65+": "#A01858" };
                      return shades[d.ageGroup] || "#F8A5C2";
                    })() },
                  })).filter((c) => c.value > 0);
                  return [
                    { name: "Male", itemStyle: { color: "#4A6FA5" }, children: maleChildren },
                    { name: "Female", itemStyle: { color: "#E75480" }, children: femaleChildren },
                  ];
                })(),
                radius: ["18%", "88%"],
                sort: undefined,
                emphasis: { focus: "ancestor", itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" } },
                label: {
                  show: true,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  minAngle: 15,
                },
                levels: [
                  {},
                  {
                    r0: "18%", r: "48%",
                    label: { fontSize: 13, fontWeight: 700, rotate: 0 },
                    itemStyle: { borderWidth: 3, borderColor: "#fff", borderRadius: 4 },
                  },
                  {
                    r0: "50%", r: "88%",
                    label: { fontSize: 11, fontWeight: 500, rotate: 0, align: "center" },
                    itemStyle: { borderWidth: 2, borderColor: "#fff", borderRadius: 4 },
                  },
                ],
              }],
              graphic: [
                { type: "text", left: "center", top: "44%", style: { text: "Referrals", fontSize: 11, fontWeight: 500, fill: T.textMuted, textAlign: "center" } },
              ],
            }} />
          </div>
          {demoStats && (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: "#FFF5E6" }}>
                <p className="text-[16px] font-extrabold" style={{ color: "#8B6914" }}>{demoStats.topAgeGroup?.ageGroup || "—"}</p>
                <p className="text-[11px] font-medium" style={{ color: "#A0845C" }}>{formatNum(demoStats.topAgeGroup?.total || 0)} referrals</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: T.textMuted }}>Top Age Group</p>
              </div>
              <div className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: "#F9F0FF" }}>
                <p className="text-[16px] font-extrabold" style={{ color: "#7B2D9B" }}>{demoStats.topGender?.gender || "—"}</p>
                <p className="text-[11px] font-medium" style={{ color: "#9B59B6" }}>{formatNum(demoStats.topGender?.count || 0)} referrals</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: T.textMuted }}>Top Gender</p>
              </div>
              <div className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: "#FFF0F0" }}>
                <p className="text-[16px] font-extrabold" style={{ color: "#8B4513" }}>{demoStats.topCombo?.ageGroup} {demoStats.topCombo?.gender}</p>
                <p className="text-[11px] font-medium" style={{ color: "#A0845C" }}>{formatNum(demoStats.topCombo?.count || 0)} referrals</p>
                <p className="text-[10px] font-semibold mt-0.5" style={{ color: T.textMuted }}>Top Combo</p>
              </div>
            </div>
          )}
          <div className="mt-4">
            <InsightBox text={demoStats ? `${demoStats.topAgeGroup?.ageGroup || ''} is the most referred age group with ${formatNum(demoStats.topAgeGroup?.total || 0)} referrals. ${demoStats.topGender?.gender || ''} patients account for the majority of referrals.` : 'Loading demographic insights...'} />
          </div>
        </CVCard>}

        {/* Referral Volume by Specialty & Clinic Availability */}
        {isChartVisible("locationBySpecialty") && <CVCard
          accentColor={"#4f46e5"}
          title="Referral Volume by Specialty & Clinic Availability"
          subtitle="Per-Location Referral Counts: In-Clinic vs. Out-of-Clinic Specialties"
          tooltipText="Stacked bar chart showing referral volume per location. Each bar is stacked by specialty — purple-toned segments are specialties available in-clinic, warm-toned (brown/orange/gold) segments are external-only referrals. This helps identify which locations depend most on external providers and where in-clinic expansion could reduce referral leakage."
          chartData={charts?.locationBySpecialty}
          chartTitle="Referral Volume by Specialty & Clinic Availability"
          chartDescription="Stacked bar chart showing per-location referral counts broken down by specialty. Purple-toned bars = in-clinic specialties; warm-toned bars = external-only. Helps identify referral leakage and expansion opportunities."
          comments={[{ id: "kam-locspec-1", author: "HCL KAM", text: "Pune leads in total referral volume, driven largely by Physiotherapy and Orthopaedics. External-only specialties like Psychiatry and Radiology present expansion opportunities — adding even part-time on-site coverage at high-volume locations could improve conversion rates by 15-20%.", date: "Feb 2025", isKAM: true }]}
        >
          {(() => {
            const locations = (charts?.locationBySpecialty || []).map((d: any) => d.location);
            const locData = charts?.locationBySpecialty || [];

            const clinicSpecs = topBarSpecs.filter((s) => specAvailability[s]);
            const externalSpecs = topBarSpecs.filter((s) => !specAvailability[s]);

            // Interpolate hex colors for a dark→light gradient palette of n steps
            const buildPalette = (darkHex: string, lightHex: string, n: number): string[] => {
              if (n === 0) return [];
              const parse = (h: string) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
              const toHex = (v: number) => v.toString(16).padStart(2,"0");
              const [r1,g1,b1] = parse(darkHex);
              const [r2,g2,b2] = parse(lightHex);
              return Array.from({length:n}, (_,i) => {
                const t = n===1 ? 0 : i/(n-1);
                return `#${toHex(Math.round(r1+(r2-r1)*t))}${toHex(Math.round(g1+(g2-g1)*t))}${toHex(Math.round(b1+(b2-b1)*t))}`;
              });
            };

            const CLINIC_PALETTE  = buildPalette("#3730A3", "#C7D2FE", clinicSpecs.length);
            const EXTERNAL_PALETTE = buildPalette("#92400E", "#FDE8C8", externalSpecs.length);

            // Per-location sorted specialty lists: index 0 = highest volume = bottom of stack = darkest
            const clinicByRank: string[][] = locData.map((d: any) =>
              [...clinicSpecs].sort((a, b) => (d[b] || 0) - (d[a] || 0))
            );
            const externalByRank: string[][] = locData.map((d: any) =>
              [...externalSpecs].sort((a, b) => (d[b] || 0) - (d[a] || 0))
            );

            // Build rank-slot series: series[rank] carries the value of whichever specialty
            // occupies that rank slot in each location — so physical position = volume rank
            const series: any[] = [
              ...Array.from({ length: clinicSpecs.length }, (_, rank) => ({
                name: `clinic_r${rank}`,
                type: "bar",
                stack: "clinic",
                barMaxWidth: 48,
                barGap: "20%",
                legendHoverLink: false,
                emphasis: { disabled: true },
                itemStyle: { color: CLINIC_PALETTE[rank] },
                data: locData.map((d: any, j: number) => {
                  const spec = clinicByRank[j][rank];
                  return spec ? { value: d[spec] || 0, specName: spec } : { value: 0, specName: "" };
                }),
              })),
              ...Array.from({ length: externalSpecs.length }, (_, rank) => ({
                name: `external_r${rank}`,
                type: "bar",
                stack: "external",
                barMaxWidth: 48,
                legendHoverLink: false,
                emphasis: { disabled: true },
                itemStyle: { color: EXTERNAL_PALETTE[rank] },
                data: locData.map((d: any, j: number) => {
                  const spec = externalByRank[j][rank];
                  return spec ? { value: d[spec] || 0, specName: spec } : { value: 0, specName: "" };
                }),
              })),
            ];

            return (
              <div className="overflow-x-auto">
                <div style={{ height: 400, minWidth: Math.max(600, locations.length * 130) }}>
                  <ReactECharts
                    style={{ height: "100%", width: "100%" }}
                    option={{
                      tooltip: {
                        trigger: "item",
                        backgroundColor: "#fff",
                        borderColor: T.border,
                        borderWidth: 1,
                        padding: [12, 16],
                        textStyle: { fontSize: 12, fontFamily: "var(--font-inter), system-ui, sans-serif", color: T.textPrimary },
                        extraCssText: "border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.10);",
                        formatter: (params: any) => {
                          const val = params?.data?.value ?? params?.value ?? 0;
                          if (!params || val === 0) return "";
                          const specName: string = params?.data?.specName || "";
                          const isClinic = params.seriesName?.startsWith("clinic_");
                          const accentColor = isClinic ? "#4338CA" : "#92400E";
                          const tag = isClinic ? "Available in Clinic" : "External Only";
                          // rank is encoded in series name as clinic_r0, clinic_r1, etc.
                          const rank = parseInt(params.seriesName?.split("_r")[1] ?? "0", 10);
                          const groupSize = isClinic ? clinicSpecs.length : externalSpecs.length;
                          const rankLabel = rank === 0 ? "Highest volume in location" : rank === groupSize - 1 ? "Lowest volume in location" : `#${rank + 1} by volume`;
                          return (
                            `<div style="font-weight:700;font-size:13px;margin-bottom:6px;color:${T.textPrimary}">${params.name}</div>` +
                            `<div style="color:${accentColor};margin-bottom:4px;font-weight:600">${specName}</div>` +
                            `<div style="display:flex;justify-content:space-between;gap:16px">` +
                            `<span style="color:${T.textMuted};font-size:11px">${tag}</span>` +
                            `<span style="font-weight:700;font-size:13px;color:${accentColor}">${formatNum(val)}</span>` +
                            `</div>` +
                            `<div style="font-size:10px;color:${T.textMuted};margin-top:4px">${rankLabel}</div>`
                          );
                        },
                      },
                      legend: { show: false },
                      grid: { left: 60, right: 16, top: 16, bottom: 40 },
                      xAxis: {
                        type: "category",
                        data: locations,
                        axisLabel: { fontSize: 11, fontFamily: "var(--font-inter), system-ui, sans-serif", color: T.textSecondary, fontWeight: 500 },
                        axisTick: { show: false },
                        axisLine: { lineStyle: { color: T.border } },
                      },
                      yAxis: {
                        type: "value",
                        name: "Referral Count",
                        nameTextStyle: { fontSize: 11, color: T.textMuted, fontFamily: "var(--font-inter), system-ui, sans-serif", padding: [0, 0, 8, 0] },
                        axisLabel: { fontSize: 11, fontFamily: "var(--font-inter), system-ui, sans-serif", color: T.textMuted },
                        splitLine: { lineStyle: { color: T.borderLight, type: "dashed" } },
                        axisLine: { show: false },
                        axisTick: { show: false },
                      },
                      series,
                    }}
                  />
                </div>
              </div>
            );
          })()}
          <div className="flex items-center gap-6 mt-3 text-[12px] font-medium" style={{ color: T.textSecondary }}>
            <div className="flex items-center gap-2">
              <div className="w-10 h-3 rounded-sm" style={{ background: "linear-gradient(90deg, #3730A3, #C7D2FE)" }} />
              <span>Available in Clinic — dark = highest volume</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-3 rounded-sm" style={{ background: "linear-gradient(90deg, #92400E, #FDE8C8)" }} />
              <span>External Only — dark = highest volume</span>
            </div>
          </div>
          <div className="mt-4">
            <InsightBox text="Compare referral volumes across locations to identify high-demand areas. Each location has two bars — the purple-toned left bar shows in-clinic specialties, the warm-toned right bar shows external-only referrals. Tall right bars indicate locations heavily dependent on external providers." />
          </div>
        </CVCard>}
      </div>}
    </div>
  );
}
