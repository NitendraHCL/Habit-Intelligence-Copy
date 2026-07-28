// @ts-nocheck
"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo } from "react";
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

const PAGE_SLUG = "/portal/compliance/site-performance";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  return Number(n).toLocaleString("en-IN");
}

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card (LOCAL copy — chart/table toggle, expand, AskAI, comments) ───
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
  const [view, setView] = useState<"chart" | "table">("table");
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
            <div className="overflow-auto" style={{ maxHeight: expanded ? undefined : 520 }}>
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

// ─── Multi-select filter (LOCAL copy) ───
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

// ─── Active Filter Chips (LOCAL copy) ───
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

const EMPTY_FILTERS = {
  months: [] as string[],
  sites: [] as string[],
  packageTypes: [] as string[],
  genders: [] as string[],
  bookingStatuses: [] as string[],
};

// ─── Main Page ───
export default function SitePerformancePage() {
  usePageAccess(PAGE_SLUG);
  const { activeClientId } = useAuth();

  // pending (in the bar) vs applied (sent to API on Apply).
  const [pageFilters, setPageFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);

  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility(PAGE_SLUG, previewConfig);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (activeClientId && activeClientId !== "all") p.set("clientId", activeClientId);
    if (appliedFilters.months.length) p.set("months", appliedFilters.months.join(","));
    if (appliedFilters.sites.length) p.set("sites", appliedFilters.sites.join(","));
    if (appliedFilters.packageTypes.length) p.set("packageTypes", appliedFilters.packageTypes.join(","));
    if (appliedFilters.genders.length) p.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.bookingStatuses.length) p.set("bookingStatuses", appliedFilters.bookingStatuses.join(","));
    return p.toString();
  }, [activeClientId, appliedFilters]);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `/api/compliance/site-performance?${query}`,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60000 },
  );

  const kpis = data?.kpis;
  const charts = data?.charts;
  const filterOptions = data?.filterOptions || {
    months: [], sites: [], packageTypes: ["Base Package", "Vaccination", "Additional Test"], genders: [], bookingStatuses: [],
  };

  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: p[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: p[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => { setAppliedFilters(EMPTY_FILTERS); setPageFilters(EMPTY_FILTERS); };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);
  const handleApply = () => setAppliedFilters({ ...pageFilters });

  // ── Site Performance table (grouped by DC_Name, + grand-total row) ──
  const sitePerformance: Array<{ site: string; completed: number; overdue: number; total: number }> =
    charts?.sitePerformance || [];

  const sitePerformanceTable: CVTableData = useMemo(() => {
    const items = [...sitePerformance].sort((a, b) => b.total - a.total);
    const rows: Record<string, React.ReactNode>[] = items.map((s) => ({
      site: s.site,
      completed: formatNum(s.completed),
      overdue: formatNum(s.overdue),
      total: formatNum(s.total),
    }));
    const tc = items.reduce((a, s) => a + (s.completed || 0), 0);
    const to = items.reduce((a, s) => a + (s.overdue || 0), 0);
    const tt = items.reduce((a, s) => a + (s.total || 0), 0);
    rows.push({ __group: true, site: "Total", completed: formatNum(tc), overdue: formatNum(to), total: formatNum(tt) });
    return {
      columns: [
        { key: "site", label: "DC_Name", align: "left" },
        { key: "completed", label: "Completed_Site", align: "right" },
        { key: "overdue", label: "Overdue Health Checks", align: "right" },
        { key: "total", label: "Total", align: "right" },
      ],
      rows,
    };
  }, [sitePerformance]);

  // Top ~15 sites by total for the bar view.
  const topSitesBar = useMemo(
    () =>
      [...sitePerformance]
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
        .map((s) => ({ site: s.site, Completed: s.completed, Overdue: s.overdue })),
    [sitePerformance],
  );

  if (!data && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="h-[520px] bg-white rounded-2xl border animate-pulse" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* ── Page Filters (Month · Site · Package Type · Gender · Booking Status) ── */}
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
                onClick={async () => {
                  setIsRefreshing(true);
                  await mutate();
                  setIsRefreshing(false);
                  setShowRefreshToast(true);
                  setTimeout(() => setShowRefreshToast(false), 3000);
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
          pageSlug={PAGE_SLUG}
          pageTitle="Site Performance"
          charts={[
            { id: "totalEmployees", label: "Total Employees in Site KPI" },
            { id: "completedInSite", label: "Completed in Site KPI" },
            { id: "overdueInSite", label: "Overdue in Site KPI" },
            { id: "sitePerformance", label: "Site Performance" },
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
          {isLoading ? "Loading..." : "Apply"}
        </Button>
      </div>
      {hasActiveFilters && (
        <ActiveFilterChips filters={appliedFilters} onRemove={handleRemoveChip} onClearAll={handleClearAll} />
      )}

      {/* ── Page Header + AI Summary (Blue Box) ── */}
      <PageGlanceBox
        pageTitle="Site Performance"
        pageSubtitle="Health-check completion vs. overdue across every Sodexo site"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalEmployees || 0)} employees across the selected sites. ${formatNum(kpis?.completedCount || 0)} health checks completed and ${formatNum(kpis?.overdueCount || 0)} overdue (derived from the Completed logic).`}
        fallbackChips={[
          { label: "Total Employees in Site", value: formatNum(kpis?.totalEmployees || 0) },
          { label: "Completed in Site", value: formatNum(kpis?.completedCount || 0) },
          { label: "Overdue in Site", value: formatNum(kpis?.overdueCount || 0) },
        ]}
      />

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isChartVisible("totalEmployees") && (
          <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Employees in Site</p>
                <Tooltip>
                  <TooltipTrigger><Info size={12} style={{ color: T.textMuted }} /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">Distinct employees (COUNT DISTINCT employee_id) across all rows for the selected sites and filters.</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.totalEmployees || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Unique employees on record across the selected sites</p>
            </div>
          </div>
        )}
        {isChartVisible("completedInSite") && (
          <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Completed in Site</p>
                <Tooltip>
                  <TooltipTrigger><Info size={12} style={{ color: T.textMuted }} /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">Rows where the health check is completed (Completed__Logic = &lsquo;completed&rsquo;).</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.teal }}>{formatNum(kpis?.completedCount || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Completed health checks across the selected sites</p>
            </div>
          </div>
        )}
        {isChartVisible("overdueInSite") && (
          <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Overdue in Site</p>
                <Tooltip>
                  <TooltipTrigger><Info size={12} style={{ color: T.textMuted }} /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">Rows NOT completed, derived from Completed__Logic. Note: the client&rsquo;s Power BI &ldquo;overdue&rdquo; figure may use a different rule (e.g. a Due Date cutoff) — this stays transparent to the completion logic pending confirmation.</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.coral }}>{formatNum(kpis?.overdueCount || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Health checks still outstanding across the selected sites</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Site Performance (hero table ⇄ bar) ── */}
      {isChartVisible("sitePerformance") && (
        <CVCard
          accentColor={"#4f46e5"}
          title="Site Performance"
          subtitle="Completed vs. overdue health checks for every site, ranked by volume"
          tooltipText="Grouped by DC_Name. Completed_Site = completed rows; Overdue Health Checks = not-completed rows; Total = all rows. Toggle the bar view to compare the top 15 sites."
          chartId="sitePerformance"
          chartData={sitePerformance}
          chartTitle="Site Performance"
          chartDescription="Per-site completed vs overdue health checks"
          tableData={sitePerformanceTable}
        >
          <div style={{ height: 480 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSitesBar} margin={{ top: 8, right: 16, left: 8, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} vertical={false} />
                <XAxis dataKey="site" tick={{ fontSize: 11, fill: T.textSecondary }} interval={0} angle={-40} textAnchor="end" height={90} />
                <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} tickFormatter={(v) => formatNum(v)} />
                <RechartsTooltip formatter={(v: number) => formatNum(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Completed" stackId="a" fill={T.teal} radius={[0, 0, 0, 0]} />
                <Bar dataKey="Overdue" stackId="a" fill={T.coral} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CVCard>
      )}

      {/* ── Data audit (SUPER_ADMIN only) ── */}
      <DataAuditSection provenance={data?._meta?.provenance} />
    </div>
  );
}
