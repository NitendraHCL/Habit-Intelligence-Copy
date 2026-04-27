"use client";

import { T, HEATMAP_GRADIENT } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChartComments } from "@/components/ui/chart-comments";
import {
  Info,
  Maximize2,
  Minimize2,
  CalendarDays,
  X,
  ChevronDown,

  RotateCcw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PageDownload from "@/components/shared/PageDownload";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  LabelList,
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

// Shared specialty palette — matches Utilization page so the same specialty
// renders in the same color across both pages.
const SPECIALTY_COLORS: Record<string, string> = {
  "General Physician": "#4f46e5", Dietetics: "#6366f1", "Internal Medicine": "#0d9488",
  Dental: "#14b8a6", Physiotherapy: "#8b5cf6", Cardiology: "#a78bfa",
  Dermatology: "#818cf8", ENT: "#7c3aed", Ophthalmology: "#c4b5fd",
  Nutrition: "#34d399", Others: "#a1a1aa",
};
const TREEMAP_COLORS = [
  "#4f46e5", "#6366f1", "#818cf8", "#0d9488", "#14b8a6", "#7c3aed",
  "#8b5cf6", "#a78bfa", "#06b6d4", "#34d399", "#a1a1aa", "#c4b5fd",
];

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
      className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col ${expanded ? "col-span-full" : ""} ${className}`}
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
                {chartId && <ChartComments chartId={chartId} pageSlug="/portal/ohc/referral" />}
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
      <div className="px-6 pb-5 flex-1 flex flex-col">{children}</div>
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
// mt-auto pushes the box to the bottom of its flex parent so every chart's
// insight blob sits at the same height across a row, regardless of the
// chart visualization above it.
function InsightBox({ text }: { text: string }) {
  return (
    <div className="mt-auto pt-4">
      <div className="rounded-[14px] px-4 py-3.5 text-[12px] leading-[1.7] font-medium" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
        {text}
      </div>
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
      <PopoverContent className="w-64 max-w-[280px] p-2 overflow-hidden" align="start">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[12px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{label}</span>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="text-[10px] font-medium hover:underline" style={{ color: T.coral }}>Clear</button>
          )}
        </div>
        <ScrollArea className="h-52 overflow-hidden">
          <div className="space-y-0.5 pr-2">
            {options.map((opt) => (
              <label key={opt} className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-[12px]" style={{ color: T.textPrimary }}>
                <Checkbox checked={selected.includes(opt)} onCheckedChange={() =>
                  onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
                } className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words leading-snug min-w-0 flex-1">{opt}</span>
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
  usePageAccess("/portal/ohc/referral");
  const { activeClientId } = useAuth();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });

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

  const { data, isLoading, isValidating, refresh, isRefreshing } = useDashboardData("ohc/referral", extraParams);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [othersModalOpen, setOthersModalOpen] = useState(false);
  const [othersSearch, setOthersSearch] = useState("");
  const [trendView, setTrendView] = useState<"monthly" | "yearly">("monthly");

  // When the applied date range is ≤ 31 days, the API returns trend points
  // bucketed by day (YYYY-MM-DD) instead of month (YYYY-MM). Mirror the same
  // toggle behaviour Visit Trends uses on /portal/ohc/utilization.
  const isDailyView = useMemo(() => {
    const days = Math.round((appliedDateRange.to.getTime() - appliedDateRange.from.getTime()) / 86400000) + 1;
    return days > 0 && days <= 31;
  }, [appliedDateRange]);

  const d = data as any;
  const kpis = d?.kpis;
  const charts = d?.charts;

  // The /api/ohc/referral response now ships its own filterOptions for
  // locations + specialties (sourced from agg_referral_matrix so dropdown
  // values always match what's actually filterable). When those arrive,
  // overlay them on top of whatever /api/filters provided — without
  // disturbing genders/ageGroups, which still come from /api/filters.
  useEffect(() => {
    const apiLocs: string[] | undefined = d?.filterOptions?.locations;
    const apiSpecs: string[] | undefined = d?.filterOptions?.specialties;
    if (!apiLocs && !apiSpecs) return;
    setFilterOptions((prev) => ({
      ...prev,
      ...(apiLocs && apiLocs.length ? { locations: apiLocs } : {}),
      ...(apiSpecs && apiSpecs.length ? { specialties: apiSpecs } : {}),
    }));
  }, [d?.filterOptions?.locations, d?.filterOptions?.specialties]);

  // Roll the per-period referral trends into per-year totals + YoY % deltas.
  // Period from the API is now machine format ("YYYY-MM" or "YYYY-MM-DD"),
  // so year is the first 4 chars regardless of bucket size.
  const referralYearlyTrends = useMemo(() => {
    const trends = (charts?.referralTrends || []) as Array<{ period: string; totalReferrals?: number; inClinicConversions?: number }>;
    if (trends.length === 0) {
      return [] as Array<{ period: string; totalReferrals: number; conversions: number; conversionRate: number; yoy: number | null; convYoy: number | null; isYtd: boolean }>;
    }
    const byYear: Record<string, { totalReferrals: number; conversions: number }> = {};
    for (const t of trends) {
      const yr = String(t.period || "").slice(0, 4);
      if (!/^\d{4}$/.test(yr)) continue;
      if (!byYear[yr]) byYear[yr] = { totalReferrals: 0, conversions: 0 };
      byYear[yr].totalReferrals += t.totalReferrals || 0;
      byYear[yr].conversions += t.inClinicConversions || 0;
    }
    const currentYear = String(new Date().getFullYear());
    const years = Object.keys(byYear).sort();
    return years.map((yr, i) => {
      const prev = i > 0 ? byYear[years[i - 1]] : null;
      const yoy = prev && prev.totalReferrals > 0
        ? Math.round(((byYear[yr].totalReferrals - prev.totalReferrals) / prev.totalReferrals) * 100)
        : null;
      const convYoy = prev && prev.conversions > 0
        ? Math.round(((byYear[yr].conversions - prev.conversions) / prev.conversions) * 100)
        : null;
      const conversionRate = byYear[yr].totalReferrals > 0
        ? Math.round((byYear[yr].conversions / byYear[yr].totalReferrals) * 100)
        : 0;
      return {
        period: yr,
        totalReferrals: byYear[yr].totalReferrals,
        conversions: byYear[yr].conversions,
        conversionRate,
        yoy,
        convYoy,
        isYtd: yr === currentYear,
      };
    });
  }, [charts?.referralTrends]);

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

  // Specialty details — external-only specialties are hidden on this page
  // (external data is out of scope for now), so the table only shows
  // specialties available in-clinic.
  const filteredSpecDetails = useMemo(() => {
    const details: any[] = charts?.specialtyDetails || [];
    return details
      .filter((s: any) => s.isAvailableInClinic)
      .sort((a: any, b: any) => (b.referrals || 0) - (a.referrals || 0));
  }, [charts?.specialtyDetails]);

  // Max referrals — drives the relative-volume mini bar in the table
  const maxSpecRefs = useMemo(
    () => filteredSpecDetails.reduce((m: number, s: any) => Math.max(m, s.referrals || 0), 0) || 1,
    [filteredSpecDetails]
  );

  // Demographics data for polar radial
  const demoData: Array<{ ageGroup: string; male: number; female: number }> = charts?.demographics || [];
  const demoStats = charts?.demographicStats;

  // Location stacked bar
  const topBarSpecs: string[] = charts?.topBarSpecialties || [];
  const specAvailability: Record<string, boolean> = charts?.specAvailability || {};
  const locationBySpecialtyData = (charts?.locationBySpecialty || []).map((r: any) => ({
    ...r,
    __total: topBarSpecs.reduce((s: number, k: string) => s + (Number(r[k]) || 0), 0),
  }));

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
          <div className="inline-flex items-center gap-1">
            <div className="inline-flex items-center gap-1 h-9 px-2 rounded-lg border bg-white" style={{ borderColor: T.border }}>
              <CalendarDays size={13} style={{ color: T.textMuted }} />
              <input
                type="date"
                value={format(dateRange.from, "yyyy-MM-dd")}
                max={format(dateRange.to, "yyyy-MM-dd")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const dt = new Date(v + "T00:00:00");
                  if (isNaN(dt.getTime())) return;
                  const to = dt > dateRange.to ? dt : dateRange.to;
                  setDateRange({ from: dt, to });
                }}
                aria-label="Start date"
                className="h-7 w-[112px] bg-transparent text-[12.5px] font-medium outline-none border-none p-0"
                style={{ color: T.textPrimary }}
              />
            </div>
            <span className="text-[12.5px]" style={{ color: T.textMuted }}>–</span>
            <div className="inline-flex items-center h-9 px-2 rounded-lg border bg-white" style={{ borderColor: T.border }}>
              <input
                type="date"
                value={format(dateRange.to, "yyyy-MM-dd")}
                min={format(dateRange.from, "yyyy-MM-dd")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const dt = new Date(v + "T00:00:00");
                  if (isNaN(dt.getTime())) return;
                  const from = dt < dateRange.from ? dt : dateRange.from;
                  setDateRange({ from, to: dt });
                }}
                aria-label="End date"
                className="h-7 w-[112px] bg-transparent text-[12.5px] font-medium outline-none border-none p-0"
                style={{ color: T.textPrimary }}
              />
            </div>
          </div>
          <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
          <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
          <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
          <FilterMultiSelect label="Specialty" options={filterOptions.specialties} selected={pageFilters.specialties} onChange={(v) => setPageFilters((p) => ({ ...p, specialties: v }))} />

        <div className="flex-1" />
        <PageDownload pageTitle="OHC Referral Analytics" />
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={async () => {
                  const ok = await refresh();
                  if (ok) {
                    setShowRefreshToast(true);
                    setTimeout(() => setShowRefreshToast(false), 3000);
                  }
                }}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
              >
                <RotateCcw className={`size-4 text-gray-600${isRefreshing || isValidating ? " animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh data</TooltipContent>
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
          pageSlug="/portal/ohc/referral"
          pageTitle="Referral Analytics"
          charts={[
            { id: "totalReferrals", label: "Total Referrals KPI" },
            { id: "inClinicConversions", label: "Conversions KPI" },
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
        pageSubtitle="How specialist referrals flow through the OHC — issuance, conversion, and the cohorts driving demand"
        kpis={kpis || {}}
        fallbackSummary={`The OHC referral system has processed ${formatNum(kpis?.totalReferrals || 0)} referrals with a ${kpis?.conversionPct || 0}% conversion rate. In-clinic availability stands at ${kpis?.availableInClinicPct || 0}% of referrals. ${formatNum(kpis?.convertedCount || 0)} referrals have been successfully converted to specialist consultations.`}
        fallbackChips={[
          { label: "Total Referrals", value: formatNum(kpis?.totalReferrals || 0) },
          { label: "Conversion Rate", value: `${kpis?.conversionPct || 0}%` },
          { label: "In-Clinic", value: `${kpis?.availableInClinicPct || 0}%` },
        ]}
      />

      {/* ── KPIs: Referral v/s Consumption ── */}
      <WarmSection>
        <AccentBar color={"#4f46e5"} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Referral v/s Consumption</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>How many referrals were issued and how many actually closed the loop with a consultation</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

          {/* Card 1 — Total Referrals (baseline) */}
          {isChartVisible("totalReferrals") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Referrals</p>
              <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.totalReferrals || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Times the OHC routed an employee on for specialist care</p>
              <div className="mt-auto pt-4">
                <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>
                  The 100% baseline. Every conversion rate, specialty ranking and demographic split on this page measures back to this number.
                </p>
              </div>
            </div>
          </div>}

          {/* Card 2 — Conversions */}
          {isChartVisible("inClinicConversions") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Conversions</p>
              <div className="flex items-baseline gap-2 mt-2.5">
                <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.teal }}>{formatNum(kpis?.convertedCount || 0)}</p>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-bold" style={{ backgroundColor: "rgba(13,148,136,0.08)", color: T.teal }}>
                  {kpis?.conversionPct || 0}% conversion rate
                </span>
              </div>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Hand-offs that reached the specialist's chair</p>
              <div className="mt-auto pt-4">
                <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>
                  <span className="font-semibold" style={{ color: T.teal }}>{kpis?.conversionPct || 0}%</span> of the <span className="font-semibold" style={{ color: T.textPrimary }}>{formatNum(kpis?.totalReferrals || 0)}</span> referrals issued were acted on — the share of physician recommendations the workforce actually followed through.
                </p>
              </div>
            </div>
          </div>}

        </div>

        {/* ── Referral Trends (Monthly area / Yearly bar+line) ── */}
        {isChartVisible("referralTrends") && <CVCard
          accentColor={"#4f46e5"}
          title="Referral Trends"
          subtitle={trendView === "monthly"
            ? (isDailyView
                ? "Day-by-day referral demand and follow-through across the selected window"
                : "Whether referral demand is rising — and whether follow-through is keeping pace, month over month")
            : "Year-over-year referral volume + conversions, with the conversion rate trend overlaid"}
          expandable={false}
          tooltipText={trendView === "monthly"
            ? (isDailyView
                ? "Two stacked area lines per day: referrals issued and conversions. Spot which day in the window saw the most demand or biggest follow-through gap."
                : "Two stacked area lines per month: referrals issued and conversions. Spot demand spikes and any month where follow-through dipped.")
            : "Bars show total referrals + actual conversions for each year; the line traces the conversion rate (%). YoY change in referrals appears above each bar."}
          chartId="referralTrends"
          chartData={trendView === "yearly" ? referralYearlyTrends : charts?.referralTrends}
          chartTitle="Referral Trends"
          chartDescription={`${trendView} view of referral volume vs. conversion`}>
          <div className="flex justify-end mb-2">
            <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: T.borderLight }}>
              {(["monthly", "yearly"] as const).map((v) => (
                <button key={v} onClick={() => setTrendView(v)} className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${trendView === v ? "bg-white shadow-sm" : ""}`} style={{ color: trendView === v ? T.textPrimary : T.textMuted }}>
                  {v === "monthly" && isDailyView ? "Daily" : v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
            <ResetFilter visible={trendView !== "monthly"} onClick={() => setTrendView("monthly")} />
          </div>
          {trendView === "yearly" ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={referralYearlyTrends} margin={{ top: 40, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} vertical={false} />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 11, fill: T.textMuted }}
                    tickFormatter={(v: string) => {
                      const d = referralYearlyTrends.find((y) => y.period === v);
                      return d?.isYtd ? `${v} (YTD)` : v;
                    }}
                  />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: T.textMuted }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10, fill: T.textMuted }} unit="%" />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}{dd?.isYtd ? " (YTD)" : ""}</p>
                        <p style={{ color: "#4f46e5" }}>Total Referrals: <strong>{formatNum(dd?.totalReferrals)}</strong>{dd?.yoy != null ? <span className="ml-2 text-[10px]" style={{ color: dd.yoy >= 0 ? "#16a34a" : "#dc2626" }}>{dd.yoy >= 0 ? "+" : ""}{dd.yoy}% YoY</span> : null}</p>
                        <p style={{ color: "#059669" }}>Conversions: <strong>{formatNum(dd?.conversions)}</strong>{dd?.convYoy != null ? <span className="ml-2 text-[10px]" style={{ color: dd.convYoy >= 0 ? "#16a34a" : "#dc2626" }}>{dd.convYoy >= 0 ? "+" : ""}{dd.convYoy}% YoY</span> : null}</p>
                        <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: T.borderLight }}>
                          <p style={{ color: "#f59e0b" }}>Conversion Rate: <strong>{dd?.conversionRate}%</strong></p>
                        </div>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar yAxisId="left" dataKey="totalReferrals" name="Total Referrals" fill="#4f46e5" radius={[4, 4, 0, 0]} minPointSize={4}>
                    <LabelList content={(props: any) => {
                      const { x, y, width, index } = props;
                      const d = referralYearlyTrends[index];
                      if (!d) return null;
                      const yoyPart = d.yoy != null ? ` ${d.yoy >= 0 ? "+" : ""}${d.yoy}%` : "";
                      const yoyColor = d.yoy != null && d.yoy >= 0 ? "#16a34a" : "#dc2626";
                      return (
                        <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fontWeight={600}>
                          <tspan fill={T.textPrimary}>{formatNum(d.totalReferrals)}</tspan>
                          {yoyPart && <tspan fill={yoyColor} dx={4}>{yoyPart.trim()}</tspan>}
                        </text>
                      );
                    }} />
                  </Bar>
                  <Bar yAxisId="left" dataKey="conversions" name="Conversions" fill="#059669" radius={[4, 4, 0, 0]} minPointSize={4}>
                    <LabelList dataKey="conversions" position="top" fontSize={10} fontWeight={600} fill={T.textSecondary} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v)) : "")} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conversion Rate" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: "#fff", stroke: "#f59e0b", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#f59e0b" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ height: 300, minWidth: Math.max(500, (charts?.referralTrends?.length || 0) * 60) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts?.referralTrends || []} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <defs>
                      <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={"#4f46e5"} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={"#4f46e5"} stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gradConversions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={"#059669"} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={"#059669"} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis
                      dataKey="period"
                      tick={{ fontSize: 10, fill: T.textMuted }}
                      tickFormatter={(v: string) => {
                        const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [, m, day] = v.split("-"); return `${MONTHS[Number(m) - 1]} ${day}`; }
                        if (/^\d{4}-\d{2}$/.test(v)) { const [y, m] = v.split("-"); return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`; }
                        return v;
                      }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: T.textMuted }} />
                    <RechartsTooltip content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const dd = payload[0]?.payload;
                      const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                      const v = String(label);
                      const prettyLabel = /^\d{4}-\d{2}-\d{2}$/.test(v)
                        ? (() => { const [y, m, day] = v.split("-"); return `${MONTHS[Number(m) - 1]} ${day}, ${y}`; })()
                        : /^\d{4}-\d{2}$/.test(v)
                          ? (() => { const [y, m] = v.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; })()
                          : v;
                      return (
                        <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                          <p className="font-bold mb-1.5" style={{ color: T.textPrimary }}>{prettyLabel}</p>
                          <p style={{ color: "#4f46e5" }}>Total Referrals : <strong>{formatNum(dd?.totalReferrals)}</strong></p>
                          <p style={{ color: "#059669" }}>Conversions : <strong>{formatNum(dd?.inClinicConversions)}</strong></p>
                        </div>
                      );
                    }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" iconSize={7} />
                    <Area type="monotone" dataKey="totalReferrals" name="Total Referrals" stroke={"#4f46e5"} fill="url(#gradTotal)" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#4f46e5", strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="inClinicConversions" name="Conversions" stroke={"#059669"} fill="url(#gradConversions)" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#059669", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          <InsightBox text={trendView === "yearly"
            ? (() => {
                if (referralYearlyTrends.length === 0) return "No yearly referral data available for the selected period.";
                if (referralYearlyTrends.length === 1) {
                  const y = referralYearlyTrends[0];
                  return `${y.period}${y.isYtd ? " (YTD)" : ""}: ${formatNum(y.totalReferrals)} referrals at a ${y.conversionRate}% conversion rate. Widen the date range to compare year over year.`;
                }
                const lastFull = [...referralYearlyTrends].reverse().find((y) => !y.isYtd && y.yoy != null);
                const ytd = referralYearlyTrends.find((y) => y.isYtd);
                const base = lastFull ? `Referrals ${lastFull.yoy! >= 0 ? "grew" : "declined"} ${Math.abs(lastFull.yoy!)}% YoY in ${lastFull.period} at a ${lastFull.conversionRate}% conversion rate.` : "";
                const ytdPart = ytd ? ` ${ytd.period} is currently at ${formatNum(ytd.totalReferrals)} referrals (YTD), converting at ${ytd.conversionRate}%.` : "";
                return (base + ytdPart).trim() || "Insufficient history for a year-over-year comparison.";
              })()
            : (() => {
                const trends: any[] = charts?.referralTrends || [];
                if (trends.length === 0) return "Referral trend data will appear once loaded.";
                const peak = trends.reduce((a: any, b: any) => ((b.totalReferrals || 0) > (a.totalReferrals || 0) ? b : a));
                const totalRefs = trends.reduce((s: number, t: any) => s + (t.totalReferrals || 0), 0);
                const totalConv = trends.reduce((s: number, t: any) => s + (t.inClinicConversions || 0), 0);
                const avgRate = totalRefs > 0 ? Math.round((totalConv / totalRefs) * 100) : 0;
                const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                const v = String(peak.period || "");
                const peakLabel = /^\d{4}-\d{2}-\d{2}$/.test(v)
                  ? (() => { const [y, m, day] = v.split("-"); return `${MONTHS[Number(m) - 1]} ${day}, ${y}`; })()
                  : /^\d{4}-\d{2}$/.test(v)
                    ? (() => { const [y, m] = v.split("-"); return `${MONTHS[Number(m) - 1]} ${y}`; })()
                    : v;
                const peakWord = isDailyView ? "Peak referral day" : "Peak referral month";
                return `${peakWord}: ${peakLabel} with ${formatNum(peak.totalReferrals || 0)} referrals. Across the selected window, ${formatNum(totalRefs)} referrals converted at ${avgRate}%.`;
              })()} />
        </CVCard>}
      </WarmSection>

      {/* ── Referral Availability & Conversion by Specialty ── */}
      {isChartVisible("specialtyConversion") && <CVCard accentColor={"#4f46e5"} title="In-Clinic Specialty Conversion" subtitle="Which specialties draw the most referrals — and which actually convert them into a consult"
        tooltipText="Each row is a specialty patients were referred to. Volume bar shows relative referral demand; the colored conversion bar shows the share that became a real consult. Green ≥ 70%, amber 1-69%, red 0%."
        chartId="specialtyConversion"
        chartData={filteredSpecDetails} chartTitle="In-Clinic Specialty Conversion" chartDescription="Specialty referral volume vs. real conversion rate">
        {/* Summary strip */}
        {filteredSpecDetails.length > 0 && (() => {
          const totalRefs = filteredSpecDetails.reduce((s: number, r: any) => s + (r.referrals || 0), 0);
          const avgConv = Math.round(filteredSpecDetails.reduce((s: number, r: any) => s + (r.conversionRate || 0), 0) / filteredSpecDetails.length);
          const stats = [
            { label: "Specialties", value: formatNum(filteredSpecDetails.length) },
            { label: "Total Referrals", value: formatNum(totalRefs) },
            { label: "Avg Conversion", value: `${avgConv}%`, accent: avgConv >= 70 ? T.teal : avgConv > 0 ? T.amber : T.coral },
          ];
          return (
            <div className="flex flex-wrap gap-2 mb-3">
              {stats.map((st) => (
                <div key={st.label} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: "#F5F6FB", border: `1px solid ${T.borderLight}` }}>
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>{st.label}</span>
                  <span className="text-[12.5px] font-bold tabular-nums" style={{ color: st.accent || T.textPrimary }}>{st.value}</span>
                </div>
              ))}
            </div>
          );
        })()}

        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}`, backgroundColor: T.white, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
          <div className="overflow-x-auto">
          {/* Table Header — sticky within the scroll container */}
          <div className="grid items-center py-3 px-5 sticky top-0 z-10" style={{ gridTemplateColumns: "0.5fr 1.7fr 1.3fr 1.6fr", borderBottom: `1px solid ${T.border}`, background: "linear-gradient(180deg, #FAFBFC 0%, #F3F4F8 100%)", minWidth: 520 }}>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>#</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Referred Specialty</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Referral Volume</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Conversion</span>
          </div>
          {/* Rows */}
          <div className="overflow-y-auto max-h-[440px]">
          {filteredSpecDetails.map((s: any, idx: number) => {
            const barColor = s.conversionRate >= 70 ? T.teal : s.conversionRate > 0 ? T.amber : T.coral;
            const barBg = s.conversionRate >= 70 ? "#E6F9F5" : s.conversionRate > 0 ? "#FFF6E6" : "#FDE8E8";
            const barColorEnd = s.conversionRate >= 70 ? "#0D9488" : s.conversionRate > 0 ? "#D97706" : "#DC2626";
            const volumePct = Math.max(2, Math.round(((s.referrals || 0) / maxSpecRefs) * 100));
            const isMedal = idx < 3;
            const medalBg = idx === 0 ? "#FEF3C7" : idx === 1 ? "#E5E7EB" : idx === 2 ? "#FED7AA" : "transparent";
            const medalRing = idx === 0 ? "#F59E0B" : idx === 1 ? "#9CA3AF" : idx === 2 ? "#F97316" : "transparent";
            const medalText = idx === 0 ? "#92400E" : idx === 1 ? "#374151" : idx === 2 ? "#9A3412" : T.textMuted;
            const zebra = idx % 2 === 1 ? "#FBFCFD" : T.white;
            return (
              <div
                key={s.specialty}
                className="group grid items-center py-3.5 px-5 transition-all duration-150 hover:bg-[#F4F6FB] relative"
                style={{ gridTemplateColumns: "0.5fr 1.7fr 1.3fr 1.6fr", borderBottom: `1px solid ${T.borderLight}`, minWidth: 520, backgroundColor: zebra }}
              >
                {/* Hover left-edge accent */}
                <span className="absolute left-0 top-0 bottom-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: "#4f46e5" }} />
                {/* Rank */}
                <div>
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11.5px] font-bold tabular-nums"
                    style={{
                      backgroundColor: isMedal ? medalBg : "#F5F6FB",
                      color: isMedal ? medalText : T.textMuted,
                      boxShadow: isMedal ? `inset 0 0 0 1.5px ${medalRing}` : "none",
                    }}
                  >
                    {idx + 1}
                  </span>
                </div>
                {/* Specialty name */}
                <div className="pr-3">
                  <p className="text-[13.5px] font-semibold leading-tight" style={{ color: T.textPrimary }}>{s.specialty}</p>
                </div>
                {/* Referral volume — number + gradient bar */}
                <div className="flex items-center gap-3 pr-4">
                  <span className="text-[15px] font-bold tabular-nums w-14 text-right" style={{ color: T.textPrimary }}>{formatNum(s.referrals)}</span>
                  <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: "#EEF1F8" }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${volumePct}%`, background: "linear-gradient(90deg, #6366f1 0%, #4f46e5 100%)" }}
                    />
                  </div>
                </div>
                {/* Conversion — gradient bar + colored pill */}
                <div className="flex items-center gap-3 pr-1">
                  <div className="flex-1 h-[8px] rounded-full overflow-hidden" style={{ backgroundColor: barBg }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(s.conversionRate, 100)}%`, background: `linear-gradient(90deg, ${barColor} 0%, ${barColorEnd} 100%)` }}
                    />
                  </div>
                  <span
                    className="inline-flex items-center justify-center min-w-[46px] h-[24px] px-2.5 rounded-full text-[11.5px] font-bold tabular-nums"
                    style={{ backgroundColor: barBg, color: barColor, boxShadow: `inset 0 0 0 1px ${barColor}22` }}
                  >
                    {s.conversionRate}%
                  </span>
                </div>
              </div>
            );
          })}
          {filteredSpecDetails.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#F5F6FB" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              </div>
              <p className="text-[13px] font-medium" style={{ color: T.textMuted }}>No specialties match the current filters</p>
            </div>
          )}
          </div>
          </div>
        </div>
        {filteredSpecDetails.length > 0 && (
          <InsightBox text={`${filteredSpecDetails.length} specialties are available in-clinic. ${(() => {
            const top = filteredSpecDetails.find((s: any) => s.conversionRate > 0);
            return top ? `${top.specialty} leads in-clinic conversions with ${formatNum(top.inClinicConsults)} consults.` : "";
          })()}`} />
        )}
      </CVCard>}

      {/* ── Who Refers to Whom (Heatmap Matrix) ── */}
      {isChartVisible("referralMatrix") && <CVCard accentColor={T.amber} title="Referral Matrix: Who Refers to Whom?" subtitle="The hand-off paths between specialties — rows are the source, columns the destination" tooltipText="Heatmap of cross-specialty referral flow. Rows are the originating specialty, columns are the destination — darker cells signal stronger pathways. Use the year toggle to track how relationships shift over time." chartId="referralMatrix" chartData={matrixData} chartTitle="Referral Matrix: Who Refers to Whom?" chartDescription="Cross-specialty referral pathways heatmap">
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
        <InsightBox text="The referral matrix reveals the strongest inter-specialty referral pathways. Use the year and view toggles to track how referral patterns evolve over time." />
      </CVCard>}

      {/* ── Demographics + Location Bar ── */}
      {(isChartVisible("referralDemographics") || isChartVisible("locationBySpecialty")) && <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Referral Demographics (Sunburst) */}
        {isChartVisible("referralDemographics") && <CVCard accentColor={T.amber} title="Referral Demographics" subtitle="Which age and gender cohorts are drawing the most specialist care" tooltipText="Sunburst showing the referred population. Inner ring is gender, outer ring is the age-group split within each gender. Surfaces which segments of the workforce drive the most onward referrals." chartId="referralDemographics" chartData={demoData} chartTitle="Referral Demographics" chartDescription="Age and gender split of the referred population">
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
                {
                  type: "text",
                  left: "center",
                  top: "center",
                  style: {
                    text: "Referrals",
                    fontSize: 11,
                    fontWeight: 500,
                    fill: T.textMuted,
                    textAlign: "center",
                    textVerticalAlign: "middle",
                  },
                },
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
          <InsightBox text={demoStats ? `${demoStats.topAgeGroup?.ageGroup || ''} is the most referred age group with ${formatNum(demoStats.topAgeGroup?.total || 0)} referrals. ${demoStats.topGender?.gender || ''} patients account for the majority of referrals.` : 'Loading demographic insights...'} />
        </CVCard>}

        {/* Referral Volume by Specialty & Location */}
        {isChartVisible("locationBySpecialty") && <CVCard
          accentColor={"#4f46e5"}
          title="Referral Volume by Specialty & Location"
          subtitle="Where the referral pressure sits — per-clinic volume split by destination specialty"
          tooltipText="Stacked bar per clinic. Each colored segment is a destination specialty; darker segments inside a bar carry higher referral volume at that site. Useful for matching specialist allocation to the locations that actually need them."
          chartId="locationBySpecialty"
          chartData={charts?.locationBySpecialty}
          chartTitle="Referral Volume by Specialty & Location"
          chartDescription="Per-clinic referral volume by destination specialty"

        >
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 mt-2">
            {topBarSpecs.map((spec: string, i: number) => (
              <div key={spec} className="flex items-center gap-1">
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: SPECIALTY_COLORS[spec] || TREEMAP_COLORS[i % TREEMAP_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: T.textMuted }}>{spec}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <div style={{ height: 420, minWidth: Math.max(600, (charts?.locationBySpecialty?.length || 6) * 80) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationBySpecialtyData} margin={{ top: 56, right: 10, left: 0, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="location" tick={{ fontSize: 10, fill: T.textMuted }} interval={0} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: T.textMuted }} domain={[0, (dataMax: number) => { const padded = dataMax * 1.1; const mag = Math.pow(10, Math.floor(Math.log10(padded))); return Math.ceil(padded / mag) * mag; }]} />
                  <RechartsTooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const isOthers = label === "Others";
                      const breakdown = isOthers ? (charts?.othersBreakdown || []) : [];
                      const othersTotal = breakdown.reduce((s: number, b: any) => s + (b.total || 0), 0);
                      return (
                        <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxWidth: 260 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                          {payload.filter((p: any) => p.value > 0).map((p: any) => (
                            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
                              <span style={{ color: p.color }}>{p.name}</span>
                              <span style={{ fontWeight: 600 }}>{formatNum(p.value)}</span>
                            </div>
                          ))}
                          {isOthers && breakdown.length > 0 && (
                            <div style={{ borderTop: `1px solid ${T.borderLight}`, marginTop: 6, paddingTop: 6, fontSize: 11, color: T.textSecondary }}>
                              <div><strong>{breakdown.length}</strong> locations · <strong>{formatNum(othersTotal)}</strong> referrals</div>
                              <div style={{ marginTop: 4, color: T.textMuted }}>See breakdown panel below ↓</div>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {topBarSpecs.map((spec: string, i: number) => {
                    const isLast = i === topBarSpecs.length - 1;
                    return (
                      <Bar
                        key={spec}
                        dataKey={spec}
                        name={spec}
                        stackId="a"
                        fill={SPECIALTY_COLORS[spec] || TREEMAP_COLORS[i % TREEMAP_COLORS.length]}
                        maxBarSize={50}
                        minPointSize={2}
                        radius={isLast ? [3, 3, 0, 0] : undefined}
                        onClick={(d: any) => { if (d?.location === "Others") { setOthersSearch(""); setOthersModalOpen(true); } }}
                        style={{ cursor: "pointer" }}
                      >
                        {isLast && (
                          <LabelList
                            dataKey="__total"
                            content={(props: any) => {
                              const { x, y, width, value } = props;
                              const n = Number(value);
                              if (!n || n <= 0) return null;
                              const text = formatNum(n);
                              const cx = Number(x) + Number(width) / 2;
                              const barTop = Number(y);
                              const h = 18;
                              const gap = 10;
                              const w = Math.max(36, text.length * 6 + 14);
                              const rectY = barTop - h - gap;
                              const textY = rectY + h / 2 + 4;
                              return (
                                <g>
                                  <rect x={cx - w / 2} y={rectY} width={w} height={h} rx={4} ry={4} fill="#fff" stroke={T.borderLight} />
                                  <text x={cx} y={textY} textAnchor="middle" fontSize={11} fontWeight={700} fill={T.textPrimary}>{text}</text>
                                </g>
                              );
                            }}
                          />
                        )}
                      </Bar>
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {(charts?.othersBreakdown?.length ?? 0) > 0 && (() => {
            const list = charts?.othersBreakdown || [];
            const total = list.reduce((s: number, b: any) => s + (b.total || 0), 0);
            return (
              <button
                onClick={() => { setOthersSearch(""); setOthersModalOpen(true); }}
                className="mt-3 w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition hover:shadow-sm hover:border-indigo-300"
                style={{ borderColor: T.border, background: "#fafafa" }}
              >
                <div className="flex items-center gap-2 text-xs" style={{ color: T.textSecondary }}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#a1a1aa" }} />
                  <span>
                    <strong style={{ color: T.textPrimary }}>Others:</strong> {list.length} smaller sites · <strong style={{ color: T.textPrimary }}>{formatNum(total)}</strong> referrals
                  </span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: "#4f46e5" }}>View breakdown →</span>
              </button>
            );
          })()}
          <InsightBox text="Compare referral volumes across clinics to identify high-demand sites. Each bar segment is a destination specialty — total per clinic appears in the pill above the bar." />
        </CVCard>}
        <Dialog open={othersModalOpen} onOpenChange={setOthersModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Others — Location Breakdown</DialogTitle>
            </DialogHeader>
            {(() => {
              const list = charts?.othersBreakdown || [];
              const total = list.reduce((s: number, b: any) => s + (b.total || 0), 0);
              const q = othersSearch.trim().toLowerCase();
              const filtered = q ? list.filter((b: any) => b.location.toLowerCase().includes(q)) : list;
              return (
                <>
                  <div className="text-xs mb-3" style={{ color: T.textSecondary }}>
                    <strong>{list.length}</strong> smaller sites grouped · <strong>{formatNum(total)}</strong> total referrals
                  </div>
                  <Input placeholder="Search location…" value={othersSearch} onChange={(e) => setOthersSearch(e.target.value)} className="mb-3" />
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-1">
                      {filtered.map((b: any) => (
                        <div key={b.location} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                          <span style={{ color: T.textSecondary }}>{b.location}</span>
                          <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(b.total)}</span>
                        </div>
                      ))}
                      {filtered.length === 0 && (
                        <div className="text-xs text-center py-6" style={{ color: T.textMuted }}>No locations match &ldquo;{othersSearch}&rdquo;</div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </div>}
    </div>
  );
}
