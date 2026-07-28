// @ts-nocheck
"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
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
import { AskAIButton } from "@/components/ai/AskAIButton";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactEChartsBase = dynamic(() => import("echarts-for-react"), { ssr: false });
const ReactECharts = ReactEChartsBase as any;

const PAGE_SLUG = "/portal/compliance/vaccinations";

// Brand palette for categorical charts (indigo/teal/violet family).
const PALETTE = [
  "#4f46e5", "#0d9488", "#8b5cf6", "#14b8a6", "#6366f1",
  "#a78bfa", "#06b6d4", "#7c3aed", "#34d399", "#818cf8",
];

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

// ─── Card (chart / table toggle) ───
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
            {options.length === 0 && <p className="text-[11px] px-1.5 py-2" style={{ color: T.textMuted }}>No options.</p>}
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
        <span key={`${chip.key}-${chip.value}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ backgroundColor: "#4f46e512", color: "#4f46e5", border: "1px solid #4f46e522" }}>
          {chip.value}
          <button onClick={() => onRemove(chip.key, chip.value)} className="hover:opacity-70 rounded-full p-0.5"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium ml-1 hover:underline" style={{ color: T.coral }}>Clear all</button>
    </div>
  );
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function prettyMonth(v: string): string {
  // "Apr-25" → "Apr '25"; leave anything else untouched.
  const m = /^([A-Za-z]{3})-(\d{2})$/.exec(String(v || ""));
  return m ? `${m[1]} '${m[2]}` : String(v || "");
}

// ─── Main Page ───
export default function VaccinationsCompliancePage() {
  usePageAccess(PAGE_SLUG);
  const { activeClientId } = useAuth();

  const [pageFilters, setPageFilters] = useState({
    months: [] as string[],
    sites: [] as string[],
    packageTypes: [] as string[],
    genders: [] as string[],
    bookingStatuses: [] as string[],
  });
  const [appliedFilters, setAppliedFilters] = useState({
    months: [] as string[],
    sites: [] as string[],
    packageTypes: [] as string[],
    genders: [] as string[],
    bookingStatuses: [] as string[],
  });

  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility(PAGE_SLUG, previewConfig);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (activeClientId && activeClientId !== "all") params.set("clientId", activeClientId);
    if (appliedFilters.months.length) params.set("months", appliedFilters.months.join(","));
    if (appliedFilters.sites.length) params.set("sites", appliedFilters.sites.join(","));
    if (appliedFilters.packageTypes.length) params.set("packageTypes", appliedFilters.packageTypes.join(","));
    if (appliedFilters.genders.length) params.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.bookingStatuses.length) params.set("bookingStatuses", appliedFilters.bookingStatuses.join(","));
    const qs = params.toString();
    return `/api/compliance/vaccinations${qs ? `?${qs}` : ""}`;
  }, [activeClientId, appliedFilters]);

  const { data, isLoading, isValidating, mutate } = useSWR(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
    keepPreviousData: true,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = url + (url.includes("?") ? "&" : "?") + "nocache=1";
      const res = await fetch(fresh);
      if (res.ok) await mutate(await res.json(), { revalidate: false });
    } catch { /* noop */ } finally { setIsRefreshing(false); }
  };

  const d = data as any;
  const kpis = d?.kpis;
  const charts = d?.charts;
  const fo = d?.filterOptions || {};

  const filterOptions = {
    months: fo.months || [],
    sites: fo.sites || [],
    packageTypes: fo.packageTypes || ["Base Package", "Vaccination", "Additional Test"],
    genders: fo.genders || [],
    bookingStatuses: fo.bookingStatuses || [],
  };

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { months: [], sites: [], packageTypes: [], genders: [], bookingStatuses: [] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);
  const handleApply = () => setAppliedFilters({ ...pageFilters });

  // ── Chart data ──
  const diagnostics: Array<{ name: string; count: number }> = charts?.additionalDiagnostics || [];
  const vaxTypes: Array<{ name: string; count: number }> = charts?.vaccinationTypes || [];
  const overTime: Array<{ month: string; count: number }> = charts?.vaccinationsOverTime || [];
  const status: Array<{ name: string; count: number }> = charts?.vaccinationStatus || [];

  const diagnosticsTotal = diagnostics.reduce((s, r) => s + (r.count || 0), 0);
  const vaxTotal = vaxTypes.reduce((s, r) => s + (r.count || 0), 0);
  const statusTotal = status.reduce((s, r) => s + (r.count || 0), 0);
  const completedCount = status.find((r) => r.name === "Completed")?.count || 0;
  const completionPct = statusTotal > 0 ? Math.round((completedCount / statusTotal) * 100) : 0;

  // ── ECharts options ──
  const diagnosticsPieOption = {
    tooltip: { trigger: "item", formatter: (p: any) => `${p.name}<br/><b>${formatNum(p.value)}</b> (${p.percent}%)` },
    legend: { type: "scroll", orient: "vertical", right: 4, top: "middle", textStyle: { fontSize: 11, color: T.textSecondary } },
    series: [{
      type: "pie", radius: ["0%", "68%"], center: ["38%", "50%"],
      data: diagnostics.map((r, i) => ({ name: r.name, value: r.count, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
      label: { show: false }, labelLine: { show: false },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" } },
    }],
  };

  const vaxBarOption = {
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (p: any) => `${p[0].name}<br/><b>${formatNum(p[0].value)}</b>` },
    xAxis: { type: "value", axisLabel: { fontSize: 10, color: T.textMuted }, splitLine: { lineStyle: { color: T.borderLight } } },
    yAxis: { type: "category", inverse: true, data: vaxTypes.map((r) => r.name), axisLabel: { fontSize: 11, color: T.textSecondary }, axisTick: { show: false } },
    series: [{
      type: "bar", data: vaxTypes.map((r) => r.count), barMaxWidth: 26,
      itemStyle: { color: "#4f46e5", borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: "right", fontSize: 11, fontWeight: 600, color: T.textSecondary, formatter: (p: any) => formatNum(p.value) },
    }],
  };

  const overTimeOption = {
    grid: { left: 8, right: 20, top: 20, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", formatter: (p: any) => `${p[0].axisValue}<br/><b>${formatNum(p[0].value)}</b> vaccinations` },
    xAxis: { type: "category", data: overTime.map((r) => prettyMonth(r.month)), boundaryGap: false, axisLabel: { fontSize: 10, color: T.textMuted }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: { fontSize: 10, color: T.textMuted }, splitLine: { lineStyle: { color: T.borderLight } } },
    series: [{
      type: "line", smooth: true, data: overTime.map((r) => r.count),
      symbol: "circle", symbolSize: 6, lineStyle: { color: "#4f46e5", width: 2.5 },
      itemStyle: { color: "#4f46e5" },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(79,70,229,0.28)" }, { offset: 1, color: "rgba(79,70,229,0.02)" }] } },
    }],
  };

  const statusDonutOption = {
    tooltip: { trigger: "item", formatter: (p: any) => `${p.name}<br/><b>${formatNum(p.value)}</b> (${p.percent}%)` },
    legend: { bottom: 0, textStyle: { fontSize: 11, color: T.textSecondary } },
    series: [{
      type: "pie", radius: ["52%", "74%"], center: ["50%", "44%"], avoidLabelOverlap: false,
      data: [
        { name: "Completed", value: completedCount, itemStyle: { color: "#0d9488" } },
        { name: "Pending / Overdue", value: (status.find((r) => r.name !== "Completed")?.count || 0), itemStyle: { color: "#F5A623" } },
      ],
      label: { show: true, position: "center", formatter: () => `${completionPct}%\nComplete`, fontSize: 15, fontWeight: 700, color: T.textPrimary, lineHeight: 18 },
      labelLine: { show: false },
    }],
  };

  // ── Table views ──
  const pctOf = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "0%");

  const diagnosticsTable: CVTableData = {
    columns: [
      { key: "name", label: "Test Type", align: "left" },
      { key: "count", label: "Tests", align: "right" },
      { key: "share", label: "Share", align: "right" },
    ],
    rows: [
      ...diagnostics.map((r) => ({ name: r.name, count: formatNum(r.count), share: pctOf(r.count, diagnosticsTotal) })),
      { __group: true, name: "Total", count: formatNum(diagnosticsTotal), share: "100%" },
    ],
  };

  const vaxTypesTable: CVTableData = {
    columns: [
      { key: "name", label: "Vaccination", align: "left" },
      { key: "count", label: "Count", align: "right" },
      { key: "share", label: "Share", align: "right" },
    ],
    rows: [
      ...vaxTypes.map((r) => ({ name: r.name, count: formatNum(r.count), share: pctOf(r.count, vaxTotal) })),
      { __group: true, name: "Total", count: formatNum(vaxTotal), share: "100%" },
    ],
  };

  const overTimeTable: CVTableData = {
    columns: [
      { key: "month", label: "Month", align: "left" },
      { key: "count", label: "Vaccinations", align: "right" },
    ],
    rows: [
      ...overTime.map((r) => ({ month: prettyMonth(r.month), count: formatNum(r.count) })),
      { __group: true, month: "Total", count: formatNum(overTime.reduce((s, r) => s + (r.count || 0), 0)) },
    ],
  };

  const statusTable: CVTableData = {
    columns: [
      { key: "name", label: "Status", align: "left" },
      { key: "count", label: "Vaccinations", align: "right" },
      { key: "share", label: "Share", align: "right" },
    ],
    rows: [
      ...status.map((r) => ({ name: r.name, count: formatNum(r.count), share: pctOf(r.count, statusTotal) })),
      { __group: true, name: "Total", count: formatNum(statusTotal), share: "100%" },
    ],
  };

  if (!d && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-64 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-2 gap-4">{[1, 2].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* ── Page Filters ── */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl" style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <FilterMultiSelect label="Month" options={filterOptions.months} selected={pageFilters.months} onChange={(v) => setPageFilters((p) => ({ ...p, months: v }))} />
        <FilterMultiSelect label="Site" options={filterOptions.sites} selected={pageFilters.sites} onChange={(v) => setPageFilters((p) => ({ ...p, sites: v }))} />
        <FilterMultiSelect label="Package Type" options={filterOptions.packageTypes} selected={pageFilters.packageTypes} onChange={(v) => setPageFilters((p) => ({ ...p, packageTypes: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Booking Status" options={filterOptions.bookingStatuses} selected={pageFilters.bookingStatuses} onChange={(v) => setPageFilters((p) => ({ ...p, bookingStatuses: v }))} />

        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={refresh} disabled={isRefreshing} className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60">
              <RotateCcw className={`size-4 text-gray-600${isRefreshing || isValidating ? " animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
        <ConfigurePanel
          pageSlug={PAGE_SLUG}
          pageTitle="Vaccinations & Additional Tests"
          charts={[
            { id: "completeVaccination", label: "Complete Vaccination KPI" },
            { id: "totalTests", label: "Total Additional Tests KPI" },
            { id: "additionalDiagnostics", label: "Additional Diagnostics by Type" },
            { id: "vaccinationTypes", label: "Vaccination Type Distribution" },
            { id: "vaccinationsOverTime", label: "Vaccinations over time" },
            { id: "vaccinationStatus", label: "Completed vs Pending Vaccination" },
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
      {hasActiveFilters && <ActiveFilterChips filters={appliedFilters} onRemove={handleRemoveChip} onClearAll={handleClearAll} />}

      {/* ── Page Header + AI Summary ── */}
      <PageGlanceBox
        pageTitle="Vaccinations & Additional Tests"
        pageSubtitle="Preventive vaccination coverage and the additional diagnostics run alongside the Sodexo health-check programme"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.completeVaccination || 0)} vaccinations have been administered, ${completionPct}% of which are marked complete. Alongside them, ${formatNum(kpis?.totalTests || 0)} additional diagnostic tests were run across ${formatNum(diagnostics.length)} test types.`}
        fallbackChips={[
          { label: "Complete Vaccination", value: formatNum(kpis?.completeVaccination || 0) },
          { label: "Total Tests", value: formatNum(kpis?.totalTests || 0) },
          { label: "Completion", value: `${completionPct}%` },
        ]}
      />

      {/* ── KPIs ── */}
      <WarmSection>
        <AccentBar color={"#4f46e5"} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Vaccinations & Additional Tests</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Preventive vaccinations administered and the additional diagnostic tests run alongside the core health check</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isChartVisible("completeVaccination") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Complete Vaccination</p>
              <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.completeVaccination || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Vaccination doses recorded across all vaccination packages</p>
              <div className="mt-auto pt-4">
                <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>
                  <span className="font-semibold" style={{ color: "#4f46e5" }}>{completionPct}%</span> of these are marked complete.
                </p>
              </div>
            </div>
          </div>}

          {isChartVisible("totalTests") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Additional Tests</p>
              <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.teal }}>{formatNum(kpis?.totalTests || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Additional diagnostic tests run outside the base package and vaccinations</p>
              <div className="mt-auto pt-4">
                <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>
                  Spread across <span className="font-semibold" style={{ color: T.textPrimary }}>{formatNum(diagnostics.length)}</span> distinct test types.
                </p>
              </div>
            </div>
          </div>}
        </div>
      </WarmSection>

      {/* ── Charts row 1: Diagnostics pie + Vaccination bar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isChartVisible("additionalDiagnostics") && <CVCard
          accentColor={"#4f46e5"}
          title="Additional Diagnostics by Type"
          subtitle="Which additional diagnostic tests are run most often alongside the core health check"
          tooltipText="Every 'Additional Test' row (any package that isn't the base package or a vaccination), grouped by test name. Slice size = number of tests of that type."
          chartId="additionalDiagnostics"
          chartData={diagnostics} chartTitle="Additional Diagnostics by Type" chartDescription="Distribution of additional diagnostic tests by type"
          tableData={diagnosticsTable}
        >
          <div style={{ height: 320 }}>
            {diagnostics.length > 0 ? <ReactECharts option={diagnosticsPieOption} style={{ height: "100%", width: "100%" }} /> : <div className="h-full flex items-center justify-center text-[13px]" style={{ color: T.textMuted }}>No additional tests for the selected filters.</div>}
          </div>
          <InsightBox text={diagnostics.length > 0
            ? `${formatNum(diagnosticsTotal)} additional tests across ${diagnostics.length} types. ${diagnostics[0]?.name} leads with ${formatNum(diagnostics[0]?.count || 0)} (${pctOf(diagnostics[0]?.count || 0, diagnosticsTotal)} of all additional tests).`
            : "No additional diagnostic tests match the current filters."} />
        </CVCard>}

        {isChartVisible("vaccinationTypes") && <CVCard
          accentColor={"#4f46e5"}
          title="Vaccination Type Distribution"
          subtitle="How the vaccination doses break down across the different vaccine types offered"
          tooltipText="Each vaccination-package row grouped by vaccine name, counted and ranked highest to lowest."
          chartId="vaccinationTypes"
          chartData={vaxTypes} chartTitle="Vaccination Type Distribution" chartDescription="Vaccination doses by vaccine type"
          tableData={vaxTypesTable}
        >
          <div style={{ height: 320 }}>
            {vaxTypes.length > 0 ? <ReactECharts option={vaxBarOption} style={{ height: "100%", width: "100%" }} /> : <div className="h-full flex items-center justify-center text-[13px]" style={{ color: T.textMuted }}>No vaccinations for the selected filters.</div>}
          </div>
          <InsightBox text={vaxTypes.length > 0
            ? `${formatNum(vaxTotal)} vaccination doses across ${vaxTypes.length} types. ${vaxTypes[0]?.name} is the most administered at ${formatNum(vaxTypes[0]?.count || 0)} doses.`
            : "No vaccination doses match the current filters."} />
        </CVCard>}
      </div>

      {/* ── Charts row 2: Over time (area) + Status (donut) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isChartVisible("vaccinationsOverTime") && <CVCard
          accentColor={"#4f46e5"}
          title="Vaccinations over time"
          subtitle="Month-by-month vaccination volume across the programme"
          tooltipText="Vaccination-package rows counted per calendar month (ordered chronologically). Shows whether vaccination activity is rising or tapering off."
          chartId="vaccinationsOverTime"
          chartData={overTime} chartTitle="Vaccinations over time" chartDescription="Monthly vaccination volume"
          tableData={overTimeTable}
        >
          <div style={{ height: 320 }}>
            {overTime.length > 0 ? <ReactECharts option={overTimeOption} style={{ height: "100%", width: "100%" }} /> : <div className="h-full flex items-center justify-center text-[13px]" style={{ color: T.textMuted }}>No vaccination trend for the selected filters.</div>}
          </div>
          <InsightBox text={overTime.length > 0
            ? (() => {
                const peak = overTime.reduce((a, b) => ((b.count || 0) > (a.count || 0) ? b : a));
                const total = overTime.reduce((s, r) => s + (r.count || 0), 0);
                return `${formatNum(total)} vaccinations over ${overTime.length} months. The busiest month was ${prettyMonth(peak.month)} with ${formatNum(peak.count)} doses.`;
              })()
            : "No vaccination activity matches the current filters."} />
        </CVCard>}

        {isChartVisible("vaccinationStatus") && <CVCard
          accentColor={"#4f46e5"}
          title="Completed vs Pending Vaccination"
          subtitle="Share of vaccination records marked complete versus still pending or overdue"
          tooltipText="Vaccination-package rows split on the completion flag: Completed = marked completed, Pending / Overdue = everything else."
          chartId="vaccinationStatus"
          chartData={status} chartTitle="Completed vs Pending Vaccination" chartDescription="Vaccination completion status split"
          tableData={statusTable}
        >
          <div style={{ height: 320 }}>
            {statusTotal > 0 ? <ReactECharts option={statusDonutOption} style={{ height: "100%", width: "100%" }} /> : <div className="h-full flex items-center justify-center text-[13px]" style={{ color: T.textMuted }}>No vaccination records for the selected filters.</div>}
          </div>
          <InsightBox text={statusTotal > 0
            ? `${completionPct}% of ${formatNum(statusTotal)} vaccination records are complete (${formatNum(completedCount)}); ${formatNum(statusTotal - completedCount)} remain pending or overdue.`
            : "No vaccination records match the current filters."} />
        </CVCard>}
      </div>
    </div>
  );
}
