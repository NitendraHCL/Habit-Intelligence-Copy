// @ts-nocheck
"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { useChartVisibility } from "@/lib/hooks/useChartVisibility";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartComments } from "@/components/ui/chart-comments";
import {
  Info,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  Table2,
  BarChart3,
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
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import DataAuditSection from "@/components/audit/DataAuditSection";

const ReactEChartsBase = dynamic(() => import("echarts-for-react"), { ssr: false });
const ReactECharts = ReactEChartsBase as any;

const PAGE_SLUG = "/portal/compliance/health-check";

const COMPLETED_COLOR = "#0d9488"; // teal
const OVERDUE_COLOR = "#f97316"; // coral / orange

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  return Number(n).toLocaleString("en-IN");
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card (chart ⇄ table toggle, expand, Ask AI, comments) ───
type CVTableData = {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
  controls?: React.ReactNode;
};

function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, chartId, chartData, chartTitle, chartDescription, tableData,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; chartId?: string;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
  tableData?: CVTableData | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");
  const showTable = !!tableData && view === "table";
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
                {tableData && (
                  <div className="inline-flex rounded-lg p-0.5 mr-0.5" style={{ backgroundColor: T.borderLight }}>
                    <button onClick={() => setView("chart")} title="Chart view" className={`flex items-center justify-center h-6 w-6 rounded-md transition-all ${view === "chart" ? "bg-white shadow-sm" : ""}`} style={{ color: view === "chart" ? T.textPrimary : T.textMuted }}>
                      <BarChart3 size={13} />
                    </button>
                    <button onClick={() => setView("table")} title="Table view" className={`flex items-center justify-center h-6 w-6 rounded-md transition-all ${view === "table" ? "bg-white shadow-sm" : ""}`} style={{ color: view === "table" ? T.textPrimary : T.textMuted }}>
                      <Table2 size={13} />
                    </button>
                  </div>
                )}
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
                {chartId && <ChartComments chartId={chartId} pageSlug={PAGE_SLUG} />}
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
      <div className="px-6 pb-5 flex-1 flex flex-col">
        {showTable ? (
          <div>
            {tableData!.controls}
            <div className="overflow-auto" style={{ maxHeight: expanded ? undefined : 420 }}>
              <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {tableData!.columns.map((c) => (
                      <th key={c.key} className={`py-2 px-3 font-semibold whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`} style={{ color: T.textSecondary }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData!.rows.map((row, i) => {
                    const isGroup = !!(row as Record<string, unknown>).__group;
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}`, backgroundColor: isGroup ? "#F5F6FA" : undefined }}>
                        {tableData!.columns.map((c) => (
                          <td key={c.key} className={`py-2 px-3 tabular-nums ${c.align === "right" ? "text-right" : "text-left"} ${isGroup ? "font-bold" : ""}`} style={{ color: isGroup ? T.textPrimary : T.textSecondary }}>{row[c.key]}</td>
                        ))}
                      </tr>
                    );
                  })}
                  {tableData!.rows.length === 0 && (
                    <tr><td colSpan={tableData!.columns.length} className="py-6 text-center text-[13px]" style={{ color: T.textMuted }}>No data for the selected filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : children}
      </div>
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
            {options.length === 0 && (
              <div className="text-[11px] px-1.5 py-2" style={{ color: T.textMuted }}>No options</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ─── Active Filter Chips ───
function ActiveFilterChips({
  filters, labels, onRemove, onClearAll,
}: {
  filters: Record<string, string[]>; labels: Record<string, string>; onRemove: (key: string, value: string) => void; onClearAll: () => void;
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
          <span style={{ opacity: 0.7 }}>{labels[chip.key]}:</span> {chip.value}
          <button onClick={() => onRemove(chip.key, chip.value)} className="hover:opacity-70 rounded-full p-0.5"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium ml-1 hover:underline" style={{ color: T.coral }}>Clear all</button>
    </div>
  );
}

// ─── KPI stat card ───
function StatCard({ label, value, sub, color = "#4f46e5", pill }: {
  label: string; value: number; sub?: string; color?: string; pill?: string;
}) {
  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
      <div className="px-5 pt-5 pb-4 flex-1 flex flex-col">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
        <div className="flex items-baseline gap-2 mt-2">
          <p className="text-[30px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{formatNum(value)}</p>
          {pill && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${color}14`, color }}>{pill}</span>
          )}
        </div>
        {sub && <p className="text-xs mt-2" style={{ color: T.textSecondary }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function HealthCheckCompliancePage() {
  usePageAccess(PAGE_SLUG);
  const { activeClientId } = useAuth();

  // Local (pending) filter state + applied state (only pushed on Apply).
  const emptyFilters = {
    months: [] as string[],
    sites: [] as string[],
    packageTypes: [] as string[],
    genders: [] as string[],
    bookingStatuses: [] as string[],
  };
  const [pageFilters, setPageFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);

  const [filterOptions, setFilterOptions] = useState({
    months: [] as string[],
    sites: [] as string[],
    packageTypes: ["Base Package", "Vaccination", "Additional Test"] as string[],
    genders: [] as string[],
    bookingStatuses: [] as string[],
  });

  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility(PAGE_SLUG, previewConfig);

  // Build the request URL from applied filters.
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (activeClientId && activeClientId !== "all") p.set("clientId", activeClientId);
    if (appliedFilters.months.length) p.set("months", appliedFilters.months.join(","));
    if (appliedFilters.sites.length) p.set("sites", appliedFilters.sites.join(","));
    if (appliedFilters.packageTypes.length) p.set("packageTypes", appliedFilters.packageTypes.join(","));
    if (appliedFilters.genders.length) p.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.bookingStatuses.length) p.set("bookingStatuses", appliedFilters.bookingStatuses.join(","));
    return `/api/compliance/health-check?${p.toString()}`;
  }, [activeClientId, appliedFilters]);

  const { data, isLoading, isValidating, mutate } = useSWR<any>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
    keepPreviousData: true,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = url + (url.includes("?") ? "&" : "?") + "nocache=1";
      const res = await fetch(fresh);
      if (!res.ok) return;
      const fresh_data = await res.json();
      await mutate(fresh_data, { revalidate: false });
      setShowRefreshToast(true);
      setTimeout(() => setShowRefreshToast(false), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const d = data as any;
  const kpis = d?.kpis;
  const charts = d?.charts;

  // Overlay API-provided dropdown options once they arrive.
  useEffect(() => {
    const fo = d?.filterOptions;
    if (!fo) return;
    setFilterOptions((prev) => ({
      months: fo.months?.length ? fo.months : prev.months,
      sites: fo.sites?.length ? fo.sites : prev.sites,
      packageTypes: fo.packageTypes?.length ? fo.packageTypes : prev.packageTypes,
      genders: fo.genders?.length ? fo.genders : prev.genders,
      bookingStatuses: fo.bookingStatuses?.length ? fo.bookingStatuses : prev.bookingStatuses,
    }));
  }, [d?.filterOptions]);

  const handleApply = () => setAppliedFilters({ ...pageFilters });
  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => { setAppliedFilters(emptyFilters); setPageFilters(emptyFilters); };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  // ── Loading skeleton ──
  if (!d && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-64 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-4 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-32 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  // ── Derived chart data ──
  const cvo = charts?.completedVsOverdue || { completed: 0, overdue: 0 };
  const cvoTotal = (cvo.completed || 0) + (cvo.overdue || 0);
  const completePct = cvoTotal > 0 ? Math.round((cvo.completed / cvoTotal) * 100) : 0;

  const donutOption = {
    tooltip: { trigger: "item", formatter: (p: any) => `${p.name}: ${formatNum(p.value)} (${p.percent}%)` },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 12, color: T.textSecondary } },
    series: [{
      type: "pie", radius: ["55%", "78%"], center: ["50%", "44%"], avoidLabelOverlap: false,
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: [
        { name: "Completed", value: cvo.completed || 0, itemStyle: { color: COMPLETED_COLOR } },
        { name: "Overdue", value: cvo.overdue || 0, itemStyle: { color: OVERDUE_COLOR } },
      ],
    }],
  };

  const completedVsOverdueTable: CVTableData = {
    columns: [
      { key: "status", label: "Status", align: "left" },
      { key: "count", label: "Count", align: "right" },
      { key: "share", label: "Share", align: "right" },
    ],
    rows: [
      { status: "Completed", count: formatNum(cvo.completed || 0), share: `${cvoTotal > 0 ? Math.round((cvo.completed / cvoTotal) * 100) : 0}%` },
      { status: "Overdue", count: formatNum(cvo.overdue || 0), share: `${cvoTotal > 0 ? Math.round((cvo.overdue / cvoTotal) * 100) : 0}%` },
      { __group: true, status: "Total", count: formatNum(cvoTotal), share: "100%" },
    ],
  };

  const trend: Array<{ month: string; completions: number }> = charts?.monthlyTrend || [];
  const trendTable: CVTableData = {
    columns: [
      { key: "month", label: "Month", align: "left" },
      { key: "completions", label: "Completions", align: "right" },
    ],
    rows: (() => {
      const rows: Record<string, React.ReactNode>[] = trend.map((t) => ({ month: t.month, completions: formatNum(t.completions) }));
      const total = trend.reduce((s, t) => s + (t.completions || 0), 0);
      rows.push({ __group: true, month: "Total", completions: formatNum(total) });
      return rows;
    })(),
  };

  const bySite: Array<{ site: string; completed: number; overdue: number; total: number }> = charts?.completedVsPendingBySite || [];
  const bySiteTable: CVTableData = {
    columns: [
      { key: "site", label: "Site", align: "left" },
      { key: "completed", label: "Completed", align: "right" },
      { key: "overdue", label: "Overdue", align: "right" },
      { key: "total", label: "Total", align: "right" },
    ],
    rows: (() => {
      const rows: Record<string, React.ReactNode>[] = bySite.map((s) => ({
        site: s.site, completed: formatNum(s.completed), overdue: formatNum(s.overdue), total: formatNum(s.total),
      }));
      const tc = bySite.reduce((a, s) => a + (s.completed || 0), 0);
      const to = bySite.reduce((a, s) => a + (s.overdue || 0), 0);
      rows.push({ __group: true, site: "Total", completed: formatNum(tc), overdue: formatNum(to), total: formatNum(tc + to) });
      return rows;
    })(),
  };

  const filterLabels = { months: "Month", sites: "Site", packageTypes: "Package", genders: "Gender", bookingStatuses: "Booking Status" };

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* ── Page Filters ── */}
      <div
        className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
      >
        <FilterMultiSelect label="Month" options={filterOptions.months} selected={pageFilters.months} onChange={(v) => setPageFilters((p) => ({ ...p, months: v }))} />
        <FilterMultiSelect label="Site" options={filterOptions.sites} selected={pageFilters.sites} onChange={(v) => setPageFilters((p) => ({ ...p, sites: v }))} />
        <FilterMultiSelect label="Package Type" options={filterOptions.packageTypes} selected={pageFilters.packageTypes} onChange={(v) => setPageFilters((p) => ({ ...p, packageTypes: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Booking Status" options={filterOptions.bookingStatuses} selected={pageFilters.bookingStatuses} onChange={(v) => setPageFilters((p) => ({ ...p, bookingStatuses: v }))} />

        <div className="flex-1" />
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={refresh}
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
          pageSlug={PAGE_SLUG}
          pageTitle="Health Check Compliance"
          charts={[
            { id: "completedVsOverdue", label: "Completed vs Overdue" },
            { id: "monthlyTrend", label: "Monthly Trend — Health Check Completions" },
            { id: "completedVsPendingBySite", label: "Completed vs Pending by Site" },
          ]}
          filters={["month", "site", "packageType", "gender", "bookingStatus"]}
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
        <ActiveFilterChips filters={appliedFilters} labels={filterLabels} onRemove={handleRemoveChip} onClearAll={handleClearAll} />
      )}

      {/* ── Page Header + AI Summary (Blue Box) ── */}
      <PageGlanceBox
        pageTitle="Health Check Compliance"
        pageSubtitle="Sodexo (SOD001) periodic health-check and vaccination compliance — completions, overdue employees, and what's due next"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalEmployees || 0)} employees are enrolled in the base health-check package. ${formatNum(kpis?.completeHealthcheck || 0)} health checks are complete (${completePct}%) and ${formatNum(kpis?.overdueHealthcheck || 0)} are overdue. ${formatNum(kpis?.pending30 || 0)} fall due in the next 30 days. On vaccinations, ${formatNum(kpis?.completeVaccination || 0)} are complete across ${formatNum(kpis?.uniqueEmployeesVaccinated || 0)} unique employees, with ${formatNum(kpis?.vaccinationsOverdue || 0)} overdue.`}
        fallbackChips={[
          { label: "Total Employees", value: formatNum(kpis?.totalEmployees || 0) },
          { label: "Completed", value: `${completePct}%` },
          { label: "Overdue", value: formatNum(kpis?.overdueHealthcheck || 0) },
          { label: "Due in 30d", value: formatNum(kpis?.pending30 || 0) },
        ]}
      />

      {/* ── Health-check KPIs ── */}
      <WarmSection>
        <AccentBar color={"#4f46e5"} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Health Check Compliance</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Base-package completion status and what's coming due across the Sodexo workforce</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Employees" value={kpis?.totalEmployees || 0} sub="Enrolled in the base health-check package" color="#4f46e5" />
          <StatCard label="Complete Healthcheck" value={kpis?.completeHealthcheck || 0} sub="Base-package health checks on record" color={COMPLETED_COLOR} pill={`${completePct}%`} />
          <StatCard label="Overdue Healthcheck" value={kpis?.overdueHealthcheck || 0} sub="Base-package, not yet completed" color={OVERDUE_COLOR} />
          <StatCard label="Pending — Next 30 days" value={kpis?.pending30 || 0} sub="Due within 30 days, not completed" color="#6366f1" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <StatCard label="Pending — Next 45 days" value={kpis?.pending45 || 0} sub="Due within 45 days, not completed" color="#8b5cf6" />
          <StatCard label="Complete Vaccination" value={kpis?.completeVaccination || 0} sub="Vaccination-package records" color="#0ea5e9" />
          <StatCard label="Unique Employees Vaccinated" value={kpis?.uniqueEmployeesVaccinated || 0} sub="Distinct employees with a vaccination" color="#14b8a6" />
          <StatCard label="Vaccinations Overdue" value={kpis?.vaccinationsOverdue || 0} sub="Vaccination-package, not completed" color={OVERDUE_COLOR} />
        </div>
      </WarmSection>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Chart 1 — Completed vs Overdue (donut) */}
        {isChartVisible("completedVsOverdue") && <CVCard
          accentColor={COMPLETED_COLOR}
          title="Completed vs Overdue"
          subtitle="Share of base-package health checks completed against those still overdue"
          tooltipText="Base-package rows split into Completed (health-check logic = completed) and Overdue (everything else)."
          chartId="completedVsOverdue"
          chartData={{ completed: cvo.completed, overdue: cvo.overdue, completePct }}
          chartTitle="Completed vs Overdue"
          chartDescription="Health-check completion status for base-package employees"
          tableData={completedVsOverdueTable}
        >
          <div className="h-[320px] relative">
            <ReactECharts option={donutOption} style={{ height: "100%", width: "100%" }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: "-14%" }}>
              <span className="text-[28px] font-extrabold" style={{ color: COMPLETED_COLOR }}>{completePct}%</span>
              <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>Completed</span>
            </div>
          </div>
          <InsightBox text={`${formatNum(cvo.completed)} of ${formatNum(cvoTotal)} base-package health checks are complete; ${formatNum(cvo.overdue)} remain overdue.`} />
        </CVCard>}

        {/* Chart 2 — Monthly Trend (line) */}
        {isChartVisible("monthlyTrend") && <CVCard
          accentColor={"#4f46e5"}
          title="Monthly Trend — Health Check Completions"
          subtitle="Completed base-package health checks by month"
          tooltipText="Base-package rows that are completed, grouped by the MONTH column and ordered chronologically."
          chartId="monthlyTrend"
          chartData={trend}
          chartTitle="Monthly Trend — Health Check Completions"
          chartDescription="Completed health checks over time"
          tableData={trendTable}
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} tickLine={false} axisLine={{ stroke: T.border }} />
                <YAxis tick={{ fontSize: 11, fill: T.textMuted }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNum(v)} />
                <RechartsTooltip formatter={(v: any) => [formatNum(Number(v)), "Completions"]} />
                <Line type="monotone" dataKey="completions" name="Completions" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#4f46e5" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <InsightBox text={`${formatNum(trend.reduce((s, t) => s + (t.completions || 0), 0))} health checks completed across ${trend.length} month${trend.length === 1 ? "" : "s"}.`} />
        </CVCard>}

        {/* Chart 3 — Completed vs Pending by Site (grouped bar) */}
        {isChartVisible("completedVsPendingBySite") && <CVCard
          className="lg:col-span-2"
          accentColor={OVERDUE_COLOR}
          title="Completed vs Pending by Site"
          subtitle="Top sites by base-package volume, each split into completed and overdue"
          tooltipText="Base-package rows grouped by DC_Name; top ~12 sites by total volume, each split Completed vs Overdue."
          chartId="completedVsPendingBySite"
          chartData={bySite}
          chartTitle="Completed vs Pending by Site"
          chartDescription="Per-site health-check completion vs overdue"
          tableData={bySiteTable}
        >
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySite} margin={{ top: 12, right: 16, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} vertical={false} />
                <XAxis dataKey="site" tick={{ fontSize: 10, fill: T.textMuted }} tickLine={false} axisLine={{ stroke: T.border }} interval={0} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11, fill: T.textMuted }} tickLine={false} axisLine={false} tickFormatter={(v) => formatNum(v)} />
                <RechartsTooltip formatter={(v: any, n: any) => [formatNum(Number(v)), n]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="completed" name="Completed" fill={COMPLETED_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="overdue" name="Overdue" fill={OVERDUE_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <InsightBox text="Each pair of bars is a site — teal is completed, orange is overdue base-package health checks." />
        </CVCard>}

        {/* Data Audit — superadmin-only source + extraction logic per chart. */}
        <div className="lg:col-span-2">
          <DataAuditSection provenance={data?._meta?.provenance} />
        </div>
      </div>
    </div>
  );
}
