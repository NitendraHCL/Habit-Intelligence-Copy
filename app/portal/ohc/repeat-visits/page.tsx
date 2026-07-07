"use client";

import { T, CHART_PALETTE, GENDER_COLORS } from "@/lib/ui/theme";
import { interpolateHex } from "@/lib/dashboard/render-helpers";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/contexts/auth-context";
import { useDateRange } from "@/lib/date-range-context";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { useChartVisibility } from "@/lib/hooks/useChartVisibility";
import DataAuditSection from "@/components/audit/DataAuditSection";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ChartComments } from "@/components/ui/chart-comments";
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
  Table2,
  BarChart3,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PageDownload from "@/components/shared/PageDownload";
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
  LabelList,
  ReferenceLine,
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

// Strip ICD-10 boilerplate that adds noise to condition labels:
//   "Hyperlipidemia, unspecified"     → "Hyperlipidemia"
//   "Hypothyroidism, unspecified"     → "Hypothyroidism"
//   "Type 2 diabetes mellitus without complications" → "Type 2 diabetes mellitus"
//   "Diabetes mellitus due to underlying condition"  → "Diabetes mellitus"
function cleanIcdLabel(name: string): string {
  if (!name) return name;
  return name
    .replace(/,\s*unspecified\b/i, "")
    .replace(/,\s*not elsewhere classified\b/i, "")
    .replace(/\s+without\s+(?:other\s+)?complications?\b.*$/i, "")
    .replace(/\s+due to\s+underlying\s+condition\b.*$/i, "")
    .replace(/\s+\(unspecified\)/i, "")
    .trim();
}

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── CVCard ───
type CVTableData = {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
  controls?: React.ReactNode;
};

function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, rightHeader, chartId, chartData, chartTitle, chartDescription, tableData,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  rightHeader?: React.ReactNode; chartId?: string;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
  tableData?: CVTableData | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"chart" | "table">("chart");
  const showTable = !!tableData && view === "table";
  return (
    <div
      data-chart-card
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
                {rightHeader}
                {chartId && <ChartComments chartId={chartId} pageSlug="/portal/ohc/repeat-visits" />}
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
      <div data-chart-body className="px-6 pb-5 flex-1 flex flex-col">
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

// ─── Stat Card ───
// Mirrors the KPI cards on /portal/ohc/utilization: card is `h-full flex flex-col`,
// inner padded body is `flex-1 flex flex-col` so the optional insight blob can be
// bottom-pinned via `mt-auto pt-4`.
function StatCard({ label, value, color, sub, icon, trend, tooltip, insight }: {
  label: string; value: string | number; color: string; sub?: string;
  icon?: React.ReactNode; trend?: { value: number; label: string };
  tooltip?: string; insight?: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5">
          {icon && <span style={{ color: T.textMuted }}>{icon}</span>}
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{value}</p>
        {trend && (
          <span
            className="inline-flex items-center self-start mt-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-bold"
            style={{ backgroundColor: (trend.value >= 0 ? T.green : T.coral) + "18", color: trend.value >= 0 ? T.green : T.coral }}
          >
            {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
          </span>
        )}
        {sub && <p className="text-xs mt-2" style={{ color: T.textSecondary }}>{sub}</p>}
        {insight && (
          <div className="mt-auto pt-4">
            <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>{insight}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InsightBox ───
// Bottom-pinned to its parent card via `mt-auto pt-4`. Requires the parent
// CVCard body to be `flex-1 flex flex-col` so the auto margin has room to push.
function InsightBox({ text }: { text: string }) {
  return (
    <div className="mt-auto pt-4">
      <div className="rounded-[14px] px-4 py-3.5 text-[12px] leading-[1.7] font-medium" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
        {text}
      </div>
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
        <ScrollArea className="h-52 overflow-hidden">
          <div className="space-y-0.5 pr-3">
            {options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-[12px]" style={{ color: T.textPrimary }}>
                <Checkbox checked={selected.includes(opt)} onCheckedChange={() =>
                  onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt])
                } className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate" title={opt}>{opt}</span>
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
  usePageAccess("/portal/ohc/repeat-visits");
  const { activeClientId, activeClient } = useAuth();
  // Date range + filter state — single source of truth, no selected/applied
  // split. Every change applies immediately, mirroring the Utilization page
  // so the refresh button + filters behave the same way on both pages.
  // Default `from` is Jan 1, 2024 so the chronic cohort lines up with
  // Health Insights, which uses the same start date.
  // Applied range is the shared, persisted global date range.
  const { dateRange: appliedDateRange, setDateRange: setAppliedDateRange } = useDateRange();
  // Draft range edited by the date inputs; committed to appliedDateRange on Apply.
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(appliedDateRange);
  // Keep the draft in sync if the global range changes (e.g. from another page).
  useEffect(() => { setDateRange(appliedDateRange); }, [appliedDateRange]);
  const [appliedLocations, setAppliedLocations] = useState<string[]>([]);
  const [appliedGenders, setAppliedGenders] = useState<string[]>([]);
  const [appliedAgeGroups, setAppliedAgeGroups] = useState<string[]>([]);
  // Draft filters — edited in the bar, committed to the applied set on Apply.
  const [draftLocations, setDraftLocations] = useState<string[]>([]);
  const [draftGenders, setDraftGenders] = useState<string[]>([]);
  const [draftAgeGroups, setDraftAgeGroups] = useState<string[]>([]);
  const [draftMinVisits, setDraftMinVisits] = useState<number>(2);

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
  const [treemapYear, setTreemapYear] = useState<string>("");
  const [cohortSelectedYears, setCohortSelectedYears] = useState<string[]>([]);
  const [othersModalOpen, setOthersModalOpen] = useState(false);
  const [othersSearch, setOthersSearch] = useState("");
  const [spOthersModalOpen, setSpOthersModalOpen] = useState(false);
  const [spOthersSearch, setSpOthersSearch] = useState("");
  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility("/portal/ohc/repeat-visits", previewConfig);

  // Sourced from /api/ohc/repeat-visits. Every filter — date range,
  // location, gender, age group, AND minVisits — flows into the API
  // query params so the server-side cohort is recomputed and every chart
  // reflects the active filter set. No more client-side slice picking.
  const repeatExtraParams = useMemo(() => ({
    dateFrom: format(appliedDateRange.from, "yyyy-MM-dd"),
    dateTo: format(appliedDateRange.to, "yyyy-MM-dd"),
    minVisits: String(minVisits),
    ...(appliedLocations.length ? { locations: appliedLocations.join(",") } : {}),
    ...(appliedGenders.length ? { genders: appliedGenders.join(",") } : {}),
    ...(appliedAgeGroups.length ? { ageGroups: appliedAgeGroups.join(",") } : {}),
  }), [appliedDateRange, appliedLocations, appliedGenders, appliedAgeGroups, minVisits]);

  // Commit all draft filters at once (matches the other pages — nothing
  // filters until Apply).
  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedLocations(draftLocations);
    setAppliedGenders(draftGenders);
    setAppliedAgeGroups(draftAgeGroups);
    setMinVisits(draftMinVisits);
  };

  const { data: repeatApi, isLoading, isValidating, refresh, isRefreshing } = useDashboardData<any>("ohc/repeat-visits", repeatExtraParams);

  const kpis = repeatApi?.kpis;
  const charts = repeatApi?.charts;
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  // Set default treemap year when data loads — default to "All" (the first
  // entry the API returns) so the chart shows aggregated data on first paint.
  useEffect(() => {
    if (charts?.treemapYears?.length && !treemapYear) {
      setTreemapYear(charts.treemapYears[0]);
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
    if (key === "locations") setAppliedLocations((p) => p.filter((v) => v !== value));
    if (key === "genders") setAppliedGenders((p) => p.filter((v) => v !== value));
    if (key === "ageGroups") setAppliedAgeGroups((p) => p.filter((v) => v !== value));
  };

  const handleClearAll = () => {
    setAppliedLocations([]);
    setAppliedGenders([]);
    setAppliedAgeGroups([]);
  };

  // ── Export to Excel ──
  // Serialises every data cut on the page into a styled workbook, straight
  // from the already-fetched in-memory API data (no extra request). Respects
  // the applied filters via `meta`. exceljs is dynamically imported on click
  // so it stays out of the main bundle.
  const [isExporting, setIsExporting] = useState(false);
  const handleExcelExport = async () => {
    if (!charts || isExporting) return;
    setIsExporting(true);
    try {
      const { exportRepeatVisitsWorkbook } = await import("@/lib/exports/repeat-visits-excel");
      await exportRepeatVisitsWorkbook({
        charts,
        kpis,
        meta: {
          clientName: activeClient?.cugName,
          cugCode: activeClient?.cugCode,
          dateFrom: format(appliedDateRange.from, "yyyy-MM-dd"),
          dateTo: format(appliedDateRange.to, "yyyy-MM-dd"),
          generatedAt: new Date().toISOString(),
          filters: activeFilters,
        },
      });
    } catch (e) {
      console.error("Excel export failed:", e);
    } finally {
      setIsExporting(false);
    }
  };

  // Chronic count drives the Chronic Repeat Patients card. The companion
  // acute count is kept so we can show "X of N repeaters are chronic" as
  // context, but the page no longer filters by it.
  const chronicCountRaw = charts?.chronicVsAcute?.chronic || 0;
  const acuteCountRaw = charts?.chronicVsAcute?.acute || 0;
  const totalRepeatersForRatio = chronicCountRaw + acuteCountRaw;
  const chronicPctOfRepeaters =
    totalRepeatersForRatio > 0
      ? Math.round((chronicCountRaw / totalRepeatersForRatio) * 100)
      : 0;

  // Demographics — always use the combined repeat-patient slice. The page-
  // level chronic/acute toggle that previously gated this was removed.
  const demoSource = charts?.demographics;
  const ageData = demoSource?.ageGroups || [];
  const genderData = demoSource?.genderSplit || [];
  const locationData = demoSource?.locationDistribution || [];
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

  // Use the portal-wide theme palette (Male = teal, Female = lilac, Others
  // = gray). Same scheme used on Utilization / Health Insights / EWB.
  // Includes an `Others` alias on top of the theme's `Other`.
  const GENDER_COLORS_MAP: Record<string, string> = {
    ...GENDER_COLORS,
    Others: GENDER_COLORS.Other,
    OTHERS: GENDER_COLORS.Other,
  };
  const LOCATION_COLORS = ["#4f46e5", "#0d9488", "#6366f1", "#14b8a6", "#7c3aed", "#8b5cf6", "#818cf8", "#06b6d4"];

  // ── Table-view data for each chart (Chart ⇄ Table toggle) — plain consts ──
  const pctOf = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "0%");
  const lcTable = (items: { label: string; count: number }[], labelHeader: string, valueHeader = "Patients"): CVTableData => {
    const arr = items || [];
    const total = arr.reduce((s, i) => s + Number(i.count || 0), 0);
    const rows: Record<string, React.ReactNode>[] = arr.map((i) => ({ label: i.label, count: formatNum(i.count), pct: pctOf(Number(i.count || 0), total) }));
    rows.push({ __group: true, label: "Total", count: formatNum(total), pct: "100%" });
    return { columns: [{ key: "label", label: labelHeader, align: "left" }, { key: "count", label: valueHeader, align: "right" }, { key: "pct", label: "% of Total", align: "right" }], rows };
  };

  // Chronic Repeat Patients: chronic vs non-chronic among repeat patients.
  const chronicTable: CVTableData = (() => {
    const chronic = Number(chronicCountRaw || 0), nonChronic = Number(acuteCountRaw || 0);
    const total = chronic + nonChronic;
    return {
      columns: [{ key: "k", label: "Cohort", align: "left" }, { key: "n", label: "Patients", align: "right" }, { key: "pct", label: "% of Repeat", align: "right" }],
      rows: [
        { k: "Chronic", n: formatNum(chronic), pct: pctOf(chronic, total) },
        { k: "Non-chronic", n: formatNum(nonChronic), pct: pctOf(nonChronic, total) },
        { __group: true, k: "Total repeat patients", n: formatNum(total), pct: "100%" },
      ],
    };
  })();

  // Age × Gender Pyramid → crosstab.
  const ageGenderTable: CVTableData = (() => {
    const data = (demoSource?.ageGenderPyramid || []) as any[];
    let tm = 0, tf = 0, to = 0, tt = 0;
    const hasOthers = data.some((r) => Number(r.others || 0) > 0);
    const rows: Record<string, React.ReactNode>[] = data.map((r) => {
      const m = Number(r.male || 0), f = Number(r.female || 0), o = Number(r.others || 0), t = Number(r.total || (m + f + o));
      tm += m; tf += f; to += o; tt += t;
      return { ageGroup: r.ageGroup, male: formatNum(m), female: formatNum(f), others: formatNum(o), total: formatNum(t) };
    });
    rows.push({ __group: true, ageGroup: "Total", male: formatNum(tm), female: formatNum(tf), others: formatNum(to), total: formatNum(tt) });
    return {
      columns: [
        { key: "ageGroup", label: "Age Group", align: "left" },
        { key: "male", label: "Male", align: "right" },
        { key: "female", label: "Female", align: "right" },
        ...(hasOthers ? [{ key: "others", label: "Others", align: "right" as const }] : []),
        { key: "total", label: "Total", align: "right" },
      ], rows,
    };
  })();

  // Repeat Visit Frequency: same vs different specialty per visit bucket.
  const visitFreqTable: CVTableData = (() => {
    const data = (charts?.repeatVisitFrequency || []) as any[];
    let tt = 0, ts = 0, td = 0;
    const rows: Record<string, React.ReactNode>[] = data.map((r) => {
      const c = Number(r.count || 0), s = Number(r.sameSpecialty || 0), d = Number(r.differentSpecialty || 0);
      tt += c; ts += s; td += d;
      return { bucket: r.bucket || r.label, count: formatNum(c), same: formatNum(s), diff: formatNum(d) };
    });
    rows.push({ __group: true, bucket: "Total", count: formatNum(tt), same: formatNum(ts), diff: formatNum(td) });
    return {
      columns: [
        { key: "bucket", label: "Visits", align: "left" },
        { key: "count", label: "Patients", align: "right" },
        { key: "same", label: "Same Specialty", align: "right" },
        { key: "diff", label: "Different Specialty", align: "right" },
      ], rows,
    };
  })();

  // Recurring Conditions (chronic): condition × patients × occurrences.
  const recurringTable: CVTableData = (() => {
    const data = (charts?.recurringConditions?.chronic || []) as any[];
    const rows: Record<string, React.ReactNode>[] = data.map((r) => ({
      name: r.name, patients: formatNum(r.patients), count: formatNum(r.count),
    }));
    return {
      columns: [
        { key: "name", label: "Condition", align: "left" },
        { key: "patients", label: "Patients", align: "right" },
        { key: "count", label: "Occurrences", align: "right" },
      ], rows,
    };
  })();

  // Key Repeat User Segments: tenure cohorts.
  const segmentsTable: CVTableData = (() => {
    const data = (charts?.repeatUserSegments || []) as any[];
    const rows: Record<string, React.ReactNode>[] = data.map((s) => ({
      label: s.label,
      patients: formatNum(s.patients || 0),
      vpy: (s.visitsPerYear ?? 0),
      chronic: formatNum(s.chronic?.count || 0),
      chronicPct: `${Math.round(Number(s.chronic?.pct || 0))}%`,
    }));
    return {
      columns: [
        { key: "label", label: "Segment", align: "left" },
        { key: "patients", label: "Patients", align: "right" },
        { key: "vpy", label: "Visits / Year", align: "right" },
        { key: "chronic", label: "Chronic", align: "right" },
        { key: "chronicPct", label: "Chronic %", align: "right" },
      ], rows,
    };
  })();

  // Repeat Patients by Specialty (active treemap year): specialty × consults.
  const specialtyTable = lcTable(((charts?.specialtyTreemap?.[treemapYear] || []) as { name: string; value: number }[]).map((x) => ({ label: x.name, count: x.value })), "Specialty", "Consults");

  // Same Cohort Progression: visit-frequency crosstab (threshold × selected years).
  const cohortTable: CVTableData = (() => {
    const years = cohortSelectedYears;
    const rows: Record<string, React.ReactNode>[] = (cohortData.combined as any[]).map((r) => {
      const row: Record<string, React.ReactNode> = { threshold: r.threshold };
      for (const y of years) row[y] = formatNum(Number(r[y] || 0));
      return row;
    });
    return {
      columns: [
        { key: "threshold", label: "Visit Frequency", align: "left" },
        ...years.map((y) => ({ key: y, label: y, align: "right" as const })),
      ], rows,
    };
  })();

  const genderTable = lcTable(genderData as { label: string; count: number }[], "Gender");
  const locationTable = lcTable(locationData as { label: string; count: number }[], "Location");

  if (isLoading && !repeatApi) {
    return (
      <div className="flex flex-col items-center justify-center gap-3" style={{ minHeight: "60vh" }}>
        <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none" style={{ color: "#4f46e5" }}>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-[15px] font-semibold" style={{ color: T.textPrimary }}>Loading data…</p>
        <p className="text-[12.5px]" style={{ color: T.textMuted }}>Crunching repeat-visit data for the selected filters.</p>
      </div>
    );
  }

  return (
    <div className="animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
        {/* ── Filters ── */}
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
                  const d = new Date(v + "T00:00:00");
                  if (isNaN(d.getTime())) return;
                  const to = d > dateRange.to ? d : dateRange.to;
                  setDateRange({ from: d, to });
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
                  const d = new Date(v + "T00:00:00");
                  if (isNaN(d.getTime())) return;
                  const from = d < dateRange.from ? d : dateRange.from;
                  setDateRange({ from, to: d });
                }}
                aria-label="End date"
                className="h-7 w-[112px] bg-transparent text-[12.5px] font-medium outline-none border-none p-0"
                style={{ color: T.textPrimary }}
              />
            </div>
          </div>
          <FilterMultiSelect label="Location" options={filterOptions.locations} selected={draftLocations} onChange={setDraftLocations} />
          <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={draftGenders} onChange={setDraftGenders} />
          <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={draftAgeGroups} onChange={setDraftAgeGroups} />

          {/* Repeat Visit Count Filter */}
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[12px] font-medium" style={{ color: T.textMuted }}>Min Visits:</span>
            <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: T.borderLight }}>
              {[2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => setDraftMinVisits(v)}
                  className={`px-3 py-1.5 text-[12px] font-bold rounded-md transition-all ${draftMinVisits === v ? "bg-white shadow-sm" : ""}`}
                  style={{ color: draftMinVisits === v ? "#4f46e5" : T.textMuted }}
                >
                  {v === 5 ? "5+" : String(v)}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleApply}
            className="h-9 px-5 rounded-lg text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 ml-2"
            style={{ background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)" }}
          >
            Apply
          </button>
          <div className="flex-1" />
          <Button
            onClick={handleExcelExport}
            disabled={isExporting || isLoading || !charts}
            title="Export every table on this page to a styled Excel workbook (respects current filters)"
            variant="outline"
            className="h-9 px-3.5 rounded-lg text-[13px] font-semibold gap-1.5"
            style={{ borderColor: "#c7d2fe", color: "#4338ca", backgroundColor: "#eef2ff" }}
          >
            <FileSpreadsheet size={15} />
            {isExporting ? "Exporting…" : "Export to Excel"}
          </Button>
          <PageDownload pageTitle="Repeat Visit Analysis" />
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
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors disabled:opacity-60"
                  style={{ borderColor: T.border, color: T.textMuted }}
                >
                  <RotateCcw size={15} className={isRefreshing ? "animate-spin" : ""} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh data</TooltipContent>
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
            pageSlug="/portal/ohc/repeat-visits"
            pageTitle="Repeat Visits"
            charts={[
              { id: "repeatKpis", label: "Repeat Visit KPIs" },
              { id: "chronicVsAcute", label: "Chronic Repeat Patients" },
              { id: "ageGroups", label: "Age Groups" },
              { id: "genderSplit", label: "Gender Split" },
              { id: "locationDistribution", label: "Location Distribution" },
              { id: "repeatVisitFrequency", label: "Repeat Visit Frequency" },
              { id: "specialtyTreemap", label: "Repeat Patients by Specialty" },
              { id: "recurringConditions", label: "Recurring Conditions Performance" },
              { id: "repeatUserSegments", label: "Key Repeat User Segments" },
              { id: "cohortProgression", label: "Same Cohort Progression" },
            ]}
            filters={["location", "gender", "ageGroup", "specialty"]}
            onPreview={setPreviewConfig}
            isPreview={isPreview}
          />
        </div>
        <ActiveFilterChips filters={activeFilters} onRemove={handleRemoveFilter} onClearAll={handleClearAll} />

        <PageGlanceBox
          pageTitle="Repeat Visit Patterns"
          pageSubtitle="Track repeat patient patterns, condition transitions, and satisfaction across visits. Repeat patients are employees who visited OHC on at least two different days within the selected date range (multiple services on the same day count as one visit)."
          kpis={kpis || {}}
          fallbackSummary={`${formatNum(kpis?.totalRepeatPatients || 0)} employees came back to OHC at least twice, a ${kpis?.repeatRate || 0}% repeat rate. Average visits per patient: ${kpis?.avgFrequency || "0"}. ${formatNum(kpis?.frequentRepeaters || 0)} patients have made 5 or more visits.`}
          fallbackChips={[
            { label: "Repeat Patients", value: formatNum(kpis?.totalRepeatPatients || 0) },
            { label: "Avg Frequency", value: `${kpis?.avgFrequency || "0"}` },
            { label: "LSMP Enrolled", value: `${kpis?.lsmpEnrolled || 0}%` },
            { label: "5+ Visits", value: formatNum(kpis?.frequentRepeaters || 0) },
          ]}
        />

        {/* ── KPIs ── */}
          {isChartVisible("repeatKpis") && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Repeat Patients"
              value={formatNum(kpis?.totalRepeatPatients || 0)}
              color={"#4f46e5"}
              sub={`Employees with ≥ ${minVisits} OHC visits in selected date range`}
              icon={<Users size={16} />}
              trend={{ value: 15, label: "vs last" }}
              tooltip={`Distinct employees who visited OHC on at least ${minVisits} different days in the selected period (same-day multi-service counts as one visit)`}
              insight={`Employees who came back on ${minVisits}+ separate days — a strong signal for ongoing care needs`}
            />
            <StatCard
              label="Avg Visit Frequency"
              value={kpis?.avgVisitFrequency || 0}
              color={"#6366f1"}
              sub="visits per repeater"
              icon={<TrendingUp size={16} />}
              trend={{ value: 8, label: "vs last" }}
              tooltip="Average number of distinct visit days per repeat patient"
              insight="Higher frequency typically reflects chronic management or active treatment plans"
            />
            <StatCard
              label="Total Consults by Repeat Users"
              value={formatNum(kpis?.totalConsultsByRepeat || 0)}
              color={T.teal}
              sub="total visits"
              icon={<Repeat size={16} />}
              trend={{ value: -5, label: "vs last" }}
              tooltip="Sum of all consultations contributed by the repeat-patient cohort"
              insight="Volume driven by repeaters — lever for capacity and bundled care planning"
            />
          </div>}

        {/* ── Chronic Repeat Patients ── */}
        {isChartVisible("chronicVsAcute") && <CVCard accentColor={"#4f46e5"} title="Chronic Repeat Patients" expandable={false} chartId="chronicVsAcute"
          tooltipText="Repeat patients (≥2 OHC service visits in the selected window) flagged with at least one chronic condition. The donut shows the chronic share of repeaters; the side panel lists the top chronic disease groups in this cohort."
          subtitle="Chronic share of repeaters, plus the disease groups they're managing"
          chartData={charts?.chronicVsAcute} chartTitle="Chronic Repeat Patients" chartDescription="Donut of chronic share + top chronic disease groups" tableData={chronicTable}
>
          {(() => {
            const chronic = chronicCountRaw;
            const nonChronic = Math.max(0, totalRepeatersForRatio - chronicCountRaw);
            const donutData = [
              { name: "Chronic", value: chronic },
              { name: "Non-chronic", value: nonChronic },
            ];
            return (
              <div className="mt-3">
                {/* Top row — donut sits beside the two headline KPIs so the
                    whitespace beside the chart gets used. */}
                <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_1fr] gap-4 items-stretch">
                  {/* Donut */}
                  <div className="relative" style={{ height: 220 }}>
                    {totalRepeatersForRatio > 0 ? (
                      <>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={donutData}
                              dataKey="value"
                              cx="50%"
                              cy="50%"
                              innerRadius={62}
                              outerRadius={92}
                              startAngle={90}
                              endAngle={-270}
                              strokeWidth={0}
                              isAnimationActive={false}
                            >
                              <Cell fill="#4f46e5" />
                              <Cell fill="#E5E7EB" />
                            </Pie>
                            <RechartsTooltip
                              contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${T.border}` }}
                              formatter={((v: number, name: string) => [formatNum(v), name]) as any}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        {/* Centre label */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <p
                            className="text-[30px] font-extrabold leading-none tabular-nums"
                            style={{ color: "#4f46e5" }}
                          >
                            {chronicPctOfRepeaters}%
                          </p>
                          <p
                            className="text-[10.5px] font-semibold mt-1 leading-tight text-center"
                            style={{ color: T.textSecondary }}
                          >
                            of repeaters<br />are chronic
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-center h-full text-[12px]" style={{ color: T.textMuted }}>
                        No repeat patients in window
                      </div>
                    )}
                  </div>

                  {/* Chronic repeaters KPI */}
                  <div
                    className="rounded-xl px-5 py-4 flex flex-col justify-center"
                    style={{ backgroundColor: "#4f46e515", border: `1px solid #4f46e525` }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>
                      Chronic repeaters
                    </p>
                    <p
                      className="text-[34px] font-extrabold leading-none tracking-[-0.02em] mt-2 tabular-nums"
                      style={{ color: "#4f46e5" }}
                    >
                      {formatNum(chronic)}
                    </p>
                    <p className="text-[11.5px] mt-2 leading-snug" style={{ color: T.textSecondary }}>
                      Patients managing at least one chronic condition.
                    </p>
                  </div>

                  {/* Total repeaters KPI */}
                  <div
                    className="rounded-xl px-5 py-4 flex flex-col justify-center"
                    style={{ backgroundColor: T.warmBg, border: `1px solid ${T.border}` }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>
                      Total repeaters
                    </p>
                    <p
                      className="text-[34px] font-extrabold leading-none tracking-[-0.02em] mt-2 tabular-nums"
                      style={{ color: T.textPrimary }}
                    >
                      {formatNum(totalRepeatersForRatio)}
                    </p>
                    <p className="text-[11.5px] mt-2 leading-snug" style={{ color: T.textSecondary }}>
                      Employees with ≥2 OHC visits in the selected window.
                    </p>
                  </div>
                </div>

              </div>
            );
          })()}

          <InsightBox text={
            totalRepeatersForRatio > 0
              ? `${formatNum(chronicCountRaw)} of ${formatNum(totalRepeatersForRatio)} repeat patients (${chronicPctOfRepeaters}%) are managing chronic conditions. ${chronicPctOfRepeaters >= 50 ? "Chronic cases dominate the repeat-visit pool — ongoing care management is the primary driver of repeat traffic." : "Chronic patients are a meaningful slice of repeaters and the strongest candidates for proactive, longitudinal care plans."}`
              : "No chronic repeat patients in the selected window."
          } />
        </CVCard>}

        {/* ── Demographics Row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Age × Gender — Population Pyramid */}
          {isChartVisible("ageGroups") && <CVCard accentColor={"#4f46e5"} title="Age × Gender Pyramid" tooltipText="Population pyramid showing repeat-patient distribution across age bands, split by gender. Male counts extend left, female counts extend right; bar length is proportional to the patient count in each age × gender cell. Click any bar to filter the dashboard." subtitle="Repeat patients by age band, split by gender (male ← → female)" chartId="ageGroups" chartData={demoSource?.ageGenderPyramid || []} chartTitle="Age × Gender Pyramid" chartDescription="Repeat-patient distribution by age band split by gender" tableData={ageGenderTable}>
            {(() => {
              const pyramid: Array<{ ageGroup: string; male: number; female: number; others: number; total: number }>
                = demoSource?.ageGenderPyramid || [];
              if (!pyramid.length) {
                return <div className="flex-1 flex items-center justify-center text-[12px]" style={{ color: T.textMuted }}>No data available for the selected filters.</div>;
              }
              const maxAbs = Math.max(1, ...pyramid.flatMap((r) => [r.male, r.female]));
              // Symmetric domain so the visual scale on each side is identical
              const data = pyramid.map((r) => ({
                ...r,
                maleNeg: -r.male,
              }));
              const totalAll = pyramid.reduce((s, r) => s + r.total, 0) || 1;
              const dominantAge = pyramid.reduce((acc, r) => (r.total > acc.total ? r : acc), pyramid[0]);
              return (
                <div className="flex-1 flex flex-col mt-2">
                  {/* Hero row */}
                  <div className="flex items-end justify-between gap-4 mb-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Repeat Patients</p>
                      <p className="text-[28px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(totalAll)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Top Age Band</p>
                      <p className="text-[16px] font-extrabold leading-tight" style={{ color: "#4f46e5" }}>{dominantAge?.ageGroup} <span className="text-[12px] font-medium" style={{ color: T.textSecondary }}>({Math.round((dominantAge.total / totalAll) * 100)}%)</span></p>
                    </div>
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mb-2 text-[11px]" style={{ color: T.textSecondary }}>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: GENDER_COLORS_MAP.Male }} /> Male</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: GENDER_COLORS_MAP.Female }} /> Female</span>
                  </div>
                  {/* Pyramid */}
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ top: 4, right: 24, left: 24, bottom: 4 }} barCategoryGap="22%">
                        <CartesianGrid horizontal={false} stroke={T.borderLight} strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          domain={[-maxAbs, maxAbs]}
                          tickFormatter={(v: number) => formatNum(Math.abs(v))}
                          tick={{ fontSize: 10, fill: T.textMuted }}
                        />
                        <YAxis
                          type="category"
                          dataKey="ageGroup"
                          tick={{ fontSize: 12, fill: T.textPrimary, fontWeight: 600 }}
                          width={50}
                        />
                        <ReferenceLine x={0} stroke={T.border} />
                        <RechartsTooltip
                          contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }}
                          formatter={((v: number, name: string) => {
                            const abs = Math.abs(v);
                            const label = name === "maleNeg" ? "Male" : name === "female" ? "Female" : name;
                            return [formatNum(abs), label];
                          }) as any}
                          labelFormatter={((label: string) => `Age ${label}`) as any}
                        />
                        <Bar
                          dataKey="maleNeg"
                          name="Male"
                          fill={GENDER_COLORS_MAP.Male}
                          radius={[6, 0, 0, 6]}
                          onClick={(d: any) => { setAppliedAgeGroups([d.ageGroup]); setAppliedGenders(["Male"]); }}
                          cursor="pointer"
                        >
                          <LabelList
                            dataKey="male"
                            position="left"
                            formatter={((v: number) => v > 0 ? formatNum(v) : "") as any}
                            style={{ fontSize: 11, fontWeight: 700, fill: T.textPrimary }}
                          />
                        </Bar>
                        <Bar
                          dataKey="female"
                          name="Female"
                          fill={GENDER_COLORS_MAP.Female}
                          radius={[0, 6, 6, 0]}
                          onClick={(d: any) => { setAppliedAgeGroups([d.ageGroup]); setAppliedGenders(["Female"]); }}
                          cursor="pointer"
                        >
                          <LabelList
                            dataKey="female"
                            position="right"
                            formatter={((v: number) => v > 0 ? formatNum(v) : "") as any}
                            style={{ fontSize: 11, fontWeight: 700, fill: T.textPrimary }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] mt-2" style={{ color: T.textMuted }}>Click a bar to filter by that age × gender cohort.</p>
                  <InsightBox text={`The ${dominantAge?.ageGroup} band carries the largest share of repeat patients (${formatNum(dominantAge?.total || 0)} — ${Math.round((dominantAge.total / totalAll) * 100)}% of total). ${dominantAge.male > dominantAge.female ? `Within this band, Male leads with ${formatNum(dominantAge.male)} vs. Female at ${formatNum(dominantAge.female)}.` : `Within this band, Female leads with ${formatNum(dominantAge.female)} vs. Male at ${formatNum(dominantAge.male)}.`} Use the asymmetry to spot age × gender cohorts that need targeted screening or outreach.`} />
                </div>
              );
            })()}
          </CVCard>}

          {/* Gender Split - Horizontal 100% stacked bar */}
          {isChartVisible("genderSplit") && <CVCard accentColor="#6366f1" title="Gender Split" tooltipText="Single horizontal 100% stacked bar — each colored segment is a gender, sized by share of repeat patients. Click a segment to filter the entire page by that gender." subtitle="Patient distribution by gender identity" chartId="genderSplit" chartData={genderData} chartTitle="Gender Split" chartDescription="Patient distribution by gender identity" tableData={genderTable}>
            {(() => {
              const total = genderTotal || 1;
              const segments = genderData
                .map((g: any) => ({
                  label: g.label,
                  count: g.count,
                  pct: Math.round((g.count / total) * 1000) / 10,
                  color: GENDER_COLORS_MAP[g.label] || PIE_COLORS[0],
                }))
                .sort((a: any, b: any) => b.count - a.count);
              const top = segments[0];
              const second = segments[1];
              const ratio = top && second && second.count > 0
                ? `${(top.count / second.count).toFixed(2)} : 1`
                : "—";
              return (
                <div className="flex-1 flex flex-col mt-3">
                  {/* Hero stat row: total + dominant ratio */}
                  <div className="flex items-end justify-between gap-4 mb-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Repeat Patients</p>
                      <p className="text-[36px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(genderTotal)}</p>
                    </div>
                    {top && second && (
                      <div className="text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{top.label} : {second.label}</p>
                        <p className="text-[28px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: top.color, fontVariantNumeric: "tabular-nums" }}>{ratio}</p>
                      </div>
                    )}
                  </div>
                  {/* Stacked bar */}
                  <div className="w-full h-14 rounded-xl overflow-hidden flex" style={{ border: `1px solid ${T.borderLight}` }}>
                    {segments.map((s: any) => (
                      <button
                        key={s.label}
                        onClick={() => setAppliedGenders([s.label])}
                        className="flex flex-col items-center justify-center text-white transition-all hover:brightness-110"
                        style={{ width: `${s.pct}%`, backgroundColor: s.color, minWidth: s.count > 0 ? 56 : 0 }}
                        title={`${s.label}: ${formatNum(s.count)} (${s.pct}%)`}
                      >
                        {s.pct >= 8 && (
                          <>
                            <span className="text-[15px] font-extrabold leading-none">{s.pct}%</span>
                            <span className="text-[10px] font-medium opacity-90 mt-1">{s.label}</span>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                  {/* Per-gender tiles — column count adapts to segment count
                      so tiles span the full width even when only Male/Female
                      are present (no awkward empty third slot). */}
                  <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, segments.length)}, minmax(0, 1fr))` }}>
                    {segments.map((s: any) => (
                      <button
                        key={s.label}
                        onClick={() => setAppliedGenders([s.label])}
                        className="flex flex-col gap-1.5 rounded-xl px-4 py-3.5 text-left transition-all hover:-translate-y-px"
                        style={{ border: `1px solid ${s.color}30`, backgroundColor: `${s.color}0a` }}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                          <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>{s.label}</span>
                        </div>
                        <span className="text-[22px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: s.color, fontVariantNumeric: "tabular-nums" }}>{formatNum(s.count)}</span>
                        <span className="text-[11px]" style={{ color: T.textSecondary }}>{s.pct}% of repeat pool</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] mt-3" style={{ color: T.textMuted }}>Click any segment or tile to filter the entire page.</p>

                  {/* Top Cohort tile — fills the gap when the card stretches to
                      match the Pyramid's height. Computed from ageGenderPyramid
                      so no API change. */}
                  {(() => {
                    const pyramid: Array<{ ageGroup: string; male: number; female: number; others: number; total: number }> =
                      demoSource?.ageGenderPyramid || [];
                    if (!pyramid.length) return null;
                    let bestAge = "";
                    let bestGender: "Male" | "Female" | "Others" = "Male";
                    let bestCount = 0;
                    for (const row of pyramid) {
                      if (row.male > bestCount) { bestCount = row.male; bestAge = row.ageGroup; bestGender = "Male"; }
                      if (row.female > bestCount) { bestCount = row.female; bestAge = row.ageGroup; bestGender = "Female"; }
                      if ((row.others || 0) > bestCount) { bestCount = row.others; bestAge = row.ageGroup; bestGender = "Others"; }
                    }
                    if (bestCount === 0 || !bestAge) return null;
                    const cohortColor = GENDER_COLORS_MAP[bestGender] || PIE_COLORS[0];
                    const cohortPct = Math.round((bestCount / total) * 1000) / 10;
                    return (
                      <div
                        className="mt-4 rounded-xl px-4 py-3.5 flex items-center gap-4"
                        style={{ border: `1px solid ${cohortColor}30`, backgroundColor: `${cohortColor}08` }}
                      >
                        <div className="flex flex-col">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Top Cohort</p>
                          <p className="text-[15px] font-extrabold leading-tight tracking-[-0.01em] mt-0.5" style={{ color: T.textPrimary }}>
                            {bestGender} <span style={{ color: cohortColor }}>{bestAge}</span>
                          </p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-[20px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: cohortColor, fontVariantNumeric: "tabular-nums" }}>{formatNum(bestCount)}</p>
                          <p className="text-[10.5px] mt-1" style={{ color: T.textSecondary }}>{cohortPct}% of repeat pool</p>
                        </div>
                      </div>
                    );
                  })()}

                  <InsightBox text={`Across ${formatNum(genderTotal)} repeat patients, ${top?.label || "the largest cohort"} accounts for ${top?.pct || 0}% of visits${second ? `, with ${second.label} at ${second.pct}% (${ratio} ratio)` : ""}. Use this split to tailor program outreach and screening priorities.`} />
                </div>
              );
            })()}
          </CVCard>}

          {/* Location Distribution - Lollipop chart with Others rollup */}
          {isChartVisible("locationDistribution") && <CVCard accentColor={"#4f46e5"} title="Location Distribution" tooltipText="Lollipop chart of the top 10 locations by repeat-patient volume. Each row's stem length is proportional to patient count; the dot at the end carries the exact number. Smaller sites are rolled into an 'Others' bucket — click the pill below the chart to see the full breakdown." subtitle="Top 10 locations by repeat-patient volume" chartId="locationDistribution" chartData={locationData} chartTitle="Location Distribution" chartDescription="Top 10 locations as a lollipop chart, with smaller sites rolled into 'Others'" tableData={locationTable}>
            {(() => {
              const rawRows: Array<{ label: string; count: number }> = locationData;
              const othersBreakdown: Array<{ location: string; total: number }> = demoSource?.othersBreakdown || [];
              const grandTotal = rawRows.reduce((s: number, r: any) => s + r.count, 0) || 1;
              // Hide trivial entries (<0.5% AND not the synthetic "Others" row).
              // They go into a footnote instead so the chart isn't dominated
              // by zero-percent rows for tiny tenants like Cisco.
              const NOISE_THRESHOLD = 0.005; // 0.5%
              const negligible = rawRows.filter((r) => r.label !== "Others" && (r.count / grandTotal) < NOISE_THRESHOLD && r.count > 0);
              const rows = rawRows.filter((r) => !negligible.includes(r));
              const maxCount = Math.max(1, ...rows.map((r) => r.count));
              const visibleRows = rows.filter((r) => r.label !== "Others");
              const othersRow = rows.find((r) => r.label === "Others");
              const negligibleTotal = negligible.reduce((s, r) => s + r.count, 0);
              // Adaptive layout — compact "stat strip" for tiny tenants
              // (≤3 real locations OR fewer than 50 total patients). The
              // lollipop only earns its keep when there are ≥4 rows.
              const useCompactLayout = visibleRows.length <= 3 && !othersRow;
              return (
                <div className="flex-1 flex flex-col mt-3">
                  {/* Hero */}
                  <div className="flex items-end justify-between gap-4 mb-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Repeat Patients</p>
                      <p className="text-[28px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(locationTotal)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Locations</p>
                      <p className="text-[16px] font-extrabold leading-tight" style={{ color: "#4f46e5" }}>
                        {visibleRows.length}{othersRow ? ` + ${othersBreakdown.length}` : ""}
                        <span className="text-[12px] font-medium ml-1" style={{ color: T.textSecondary }}>{othersRow ? "(Others rolled-up)" : ""}</span>
                      </p>
                    </div>
                  </div>
                  {/* Compact stat strip — used for small tenants */}
                  {useCompactLayout && (
                    <>
                      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, visibleRows.length)}, minmax(0, 1fr))` }}>
                        {visibleRows.map((r: any, i: number) => {
                          const pct = Math.round((r.count / grandTotal) * 1000) / 10;
                          const dotColor = LOCATION_COLORS[i % LOCATION_COLORS.length];
                          return (
                            <button
                              key={r.label}
                              onClick={() => setAppliedLocations([r.label])}
                              className="flex flex-col gap-1.5 rounded-xl px-4 py-3.5 text-left transition-all hover:-translate-y-px"
                              style={{ border: `1px solid ${dotColor}30`, backgroundColor: `${dotColor}0a` }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
                                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] truncate" style={{ color: T.textMuted }}>{r.label}</span>
                              </div>
                              <span className="text-[22px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: dotColor, fontVariantNumeric: "tabular-nums" }}>{formatNum(r.count)}</span>
                              <span className="text-[11px]" style={{ color: T.textSecondary }}>{pct}% of repeat pool</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[11px] mt-3" style={{ color: T.textMuted }}>Click any tile to filter the entire page by that location.</p>
                      {negligible.length > 0 && (
                        <p className="text-[10px] mt-1.5" style={{ color: T.textMuted }}>+ {negligible.length} negligible site{negligible.length > 1 ? "s" : ""} (&lt;0.5% share, {formatNum(negligibleTotal)} patients combined)</p>
                      )}

                      {/* Single-location bonus content — top specialty
                          mini-rollup at that one site. Reuses specialtyTreemap
                          data already on the page. */}
                      {visibleRows.length === 1 && (() => {
                        const allSpecs: Array<{ name: string; value: number }> =
                          (charts?.specialtyTreemap?.[treemapYear] || []) as Array<{ name: string; value: number }>;
                        const realSpecs = allSpecs
                          .filter((s) => s.name && s.name !== "Others")
                          .sort((a, b) => b.value - a.value);
                        const totalSpecConsults = realSpecs.reduce((s, r) => s + r.value, 0) || 1;
                        const top5 = realSpecs.slice(0, 5);
                        if (top5.length === 0) return null;
                        return (
                          <div className="mt-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: T.textMuted }}>
                              Top Specialties at {visibleRows[0].label}
                            </p>
                            <div className="flex flex-col gap-1.5">
                              {top5.map((s) => {
                                const pct = Math.round((s.value / totalSpecConsults) * 1000) / 10;
                                const widthPct = Math.max(2, (s.value / (top5[0].value || 1)) * 100);
                                return (
                                  <div key={s.name} className="grid items-center gap-2.5" style={{ gridTemplateColumns: "minmax(110px, 36%) 1fr auto" }}>
                                    <span className="text-[11.5px] font-medium truncate" style={{ color: T.textPrimary }} title={s.name}>{s.name}</span>
                                    <span className="relative h-1.5 rounded-full" style={{ backgroundColor: "#F1F5F9" }}>
                                      <span className="absolute left-0 top-0 h-1.5 rounded-full" style={{ width: `${widthPct}%`, backgroundColor: "#4f46e5" }} />
                                    </span>
                                    <span className="text-[11px] font-bold tabular-nums whitespace-nowrap" style={{ color: T.textPrimary }}>
                                      {formatNum(s.value)} <span className="text-[10px] font-medium" style={{ color: T.textMuted }}>· {pct}%</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      <InsightBox text={`${formatNum(locationTotal)} repeat patients across ${visibleRows.length} location${visibleRows.length > 1 ? "s" : ""}. ${visibleRows[0] ? `${visibleRows[0].label} carries ${Math.round(visibleRows[0].count / grandTotal * 100)}% of the repeat pool.` : ""}`} />
                    </>
                  )}
                  {!useCompactLayout && <>
                  {/* Lollipop list — top 10 + Others row in-chart */}
                  <div className="flex flex-col gap-2.5">
                    {rows.map((r: any, i: number) => {
                      const isOthers = r.label === "Others";
                      const pct = Math.round((r.count / grandTotal) * 1000) / 10;
                      const widthPct = Math.max(2, (r.count / maxCount) * 100);
                      const dotColor = isOthers ? "#a1a1aa" : LOCATION_COLORS[i % LOCATION_COLORS.length];
                      const labelText = isOthers
                        ? `Others (${othersBreakdown.length})`
                        : r.label;
                      return (
                        <button
                          key={r.label}
                          onClick={() => {
                            if (isOthers) {
                              setOthersSearch("");
                              setOthersModalOpen(true);
                            } else {
                              setAppliedLocations([r.label]);
                            }
                          }}
                          className="grid items-center gap-3 text-left transition-opacity hover:opacity-90"
                          style={{ gridTemplateColumns: "minmax(140px, 28%) 1fr auto" }}
                          title={isOthers
                            ? `Others: ${othersBreakdown.length} smaller sites · ${formatNum(r.count)} patients (${pct}%) — click to view breakdown`
                            : `${r.label}: ${formatNum(r.count)} (${pct}%)`}
                        >
                          <span className="text-[12px] font-semibold truncate flex items-center gap-1.5" style={{ color: isOthers ? T.textSecondary : T.textPrimary, fontStyle: isOthers ? "italic" : "normal" }}>
                            {labelText}
                            {isOthers && <span className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#eef2ff", color: "#4f46e5" }}>roll-up</span>}
                          </span>
                          <span className="relative h-3 flex items-center">
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full"
                              style={{ height: 2, width: `${widthPct}%`, backgroundColor: `${dotColor}66`, ...(isOthers ? { backgroundImage: `repeating-linear-gradient(90deg, ${dotColor}aa 0 4px, transparent 4px 8px)`, backgroundColor: "transparent", height: 2 } : {}) }}
                            />
                            <span
                              className="absolute top-1/2 -translate-y-1/2 rounded-full"
                              style={{ left: `calc(${widthPct}% - 6px)`, width: 12, height: 12, backgroundColor: dotColor, boxShadow: `0 0 0 3px ${dotColor}25` }}
                            />
                          </span>
                          <span className="text-[12px] font-bold tabular-nums whitespace-nowrap" style={{ color: T.textPrimary }}>
                            {formatNum(r.count)} <span className="text-[10.5px] font-medium" style={{ color: T.textMuted }}>· {pct}%</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Others pill (matches Utilization page) */}
                  {othersRow && (
                    <button
                      onClick={() => { setOthersSearch(""); setOthersModalOpen(true); }}
                      className="mt-3 w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition hover:shadow-sm hover:border-indigo-300"
                      style={{ borderColor: T.border, background: "#fafafa" }}
                    >
                      <div className="flex items-center gap-2 text-xs" style={{ color: T.textSecondary }}>
                        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#a1a1aa" }} />
                        <span>
                          <strong style={{ color: T.textPrimary }}>Others:</strong> {othersBreakdown.length} smaller sites · <strong style={{ color: T.textPrimary }}>{formatNum(othersRow.count)}</strong> patients
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold" style={{ color: "#4f46e5" }}>View breakdown →</span>
                    </button>
                  )}
                  <p className="text-[11px] mt-3" style={{ color: T.textMuted }}>Click any row to filter the entire page by that location.</p>
                  {negligible.length > 0 && (
                    <p className="text-[10px] mt-1.5" style={{ color: T.textMuted }}>+ {negligible.length} negligible site{negligible.length > 1 ? "s" : ""} (&lt;0.5% share, {formatNum(negligibleTotal)} patients combined)</p>
                  )}
                  <InsightBox text={`${formatNum(locationTotal)} repeat patients across ${visibleRows.length}${othersRow ? ` + ${othersBreakdown.length}` : ""} locations. ${visibleRows[0] ? `${visibleRows[0].label} leads with ${formatNum(visibleRows[0].count)} patients (${Math.round(visibleRows[0].count / grandTotal * 100)}%).` : ""} Review locations with disproportionately high repeat volumes to allocate resources and investigate root causes.`} />
                  </>}
                </div>
              );
            })()}
          </CVCard>}
        </div>

        {/* ── Repeat Visit Frequency + Specialty Treemap ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Repeat Visit Frequency */}
          {isChartVisible("repeatVisitFrequency") && <CVCard accentColor={"#4f46e5"} title="Repeat Visit Frequency" chartId="repeatVisitFrequency"
            tooltipText="Stacked bar chart showing the number of repeat patients grouped by visit count buckets. Bars are split into same-specialty and different-specialty visits to reveal whether patients return for the same condition or seek care across specialties."
            subtitle="Shows how often repeat patients return for care for different or same specialty"
            chartData={charts?.repeatVisitFrequency} chartTitle="Repeat Visit Frequency" chartDescription="How often repeat patients return for care" tableData={visitFreqTable}>
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
            <InsightBox text="This chart breaks down repeat visit frequency into same-specialty and different-specialty buckets. A high proportion of same-specialty visits may indicate chronic condition management, while cross-specialty visits suggest multi-morbidity or referral patterns." />
          </CVCard>}

          {/* Specialty — Modern Treemap (rank-graded single-color, soft tiles) */}
          {isChartVisible("specialtyTreemap") && <CVCard accentColor={"#6366f1"} title="Repeat Patients by Specialty" chartId="specialtyTreemap"
            tooltipText="Horizontal ranked bar chart of specialties by repeat-patient consult volume. Bar length is proportional to the largest specialty; the count and % share render at the end of each bar. Smaller specialties roll into an 'Others' row — click it (or the pill below) to see the breakdown."
            subtitle="Top specialties ranked by consult volume; bar length scales to the leader"
            chartData={charts?.specialtyTreemap?.[treemapYear]} chartTitle="Repeat Patients by Specialty" chartDescription="Horizontal ranked bar of specialties by repeat-patient consult volume with Others rollup" tableData={specialtyTable}
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
            {(() => {
              const raw: Array<{ name: string; value: number }> = (charts?.specialtyTreemap?.[treemapYear] || []);
              const sorted = [...raw].sort((a, b) => b.value - a.value);
              const TOP_N = 10;
              const top = sorted.slice(0, TOP_N);
              const tail = sorted.slice(TOP_N);
              const tailSum = tail.reduce((s, r) => s + r.value, 0);
              const grandTotal = sorted.reduce((s, r) => s + r.value, 0) || 1;
              const topShown = top.reduce((s, r) => s + r.value, 0);
              const topShownPct = Math.round((topShown / grandTotal) * 100);
              const tailPct = Math.round((tailSum / grandTotal) * 100);
              const dominant = sorted[0];
              const dominantPct = Math.round((dominant?.value || 0) / grandTotal * 100);
              const RAMP_FROM = "#3730a3";
              const RAMP_TO = "#c7d2fe";
              // Top N rows + an in-chart Others row (matches Utilization /
              // Location Distribution pattern). Clicking the Others row opens
              // the same modal the pill below the chart opens.
              const rows: Array<{ name: string; value: number; isOthers: boolean }> = [
                ...top.map((r) => ({ ...r, isOthers: false })),
                ...(tailSum > 0 ? [{ name: `Others (${tail.length})`, value: tailSum, isOthers: true }] : []),
              ];
              const maxValue = Math.max(1, ...rows.map((r) => r.value));
              return (
                <div className="flex-1 flex flex-col">
                  {/* Hero strip */}
                  <div className="flex items-end justify-between gap-4 mb-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Consults (top {top.length})</p>
                      <p className="text-[24px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>
                        {formatNum(topShown)}
                        <span className="text-[12px] font-medium ml-1.5" style={{ color: T.textSecondary }}>· {topShownPct}% of pool</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Top Specialty</p>
                      <p className="text-[13px] font-extrabold leading-tight truncate max-w-[220px]" style={{ color: RAMP_FROM }}>
                        {dominant?.name || "—"}
                        <span className="text-[11px] font-medium ml-1" style={{ color: T.textSecondary }}>· {dominantPct}%</span>
                      </p>
                    </div>
                  </div>
                  {/* Horizontal ranked bars */}
                  <div className="flex flex-col gap-2.5">
                    {rows.map((r, i) => {
                      const isOthers = r.isOthers;
                      const t = top.length === 1 ? 0 : Math.min(i, top.length - 1) / Math.max(1, top.length - 1);
                      const fill = isOthers ? "#9ca3af" : interpolateHex(RAMP_FROM, RAMP_TO, t);
                      const widthPct = Math.max(2, (r.value / maxValue) * 100);
                      const sharePct = Math.round((r.value / grandTotal) * 1000) / 10;
                      return (
                        <button
                          key={r.name}
                          onClick={() => {
                            if (isOthers) { setSpOthersSearch(""); setSpOthersModalOpen(true); }
                          }}
                          className="grid items-center gap-3 text-left transition-opacity hover:opacity-95"
                          style={{ gridTemplateColumns: "20px minmax(160px, 26%) 1fr auto", cursor: isOthers ? "pointer" : "default" }}
                          title={isOthers
                            ? `Others — ${tail.length} smaller specialties · ${formatNum(r.value)} consults (${sharePct}%) — click for breakdown`
                            : `${r.name}: ${formatNum(r.value)} (${sharePct}%)`}
                        >
                          {/* Rank pill */}
                          <span
                            className="inline-flex items-center justify-center text-[10px] font-bold rounded-full"
                            style={{ backgroundColor: isOthers ? "#e5e7eb" : `${RAMP_FROM}15`, color: isOthers ? T.textMuted : RAMP_FROM, width: 20, height: 20 }}
                          >
                            {isOthers ? "•" : i + 1}
                          </span>
                          {/* Label */}
                          <span className="text-[12px] font-semibold truncate flex items-center gap-1.5" style={{ color: isOthers ? T.textSecondary : T.textPrimary, fontStyle: isOthers ? "italic" : "normal" }}>
                            {r.name}
                            {isOthers && <span className="text-[9px] font-bold uppercase tracking-[0.06em] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#eef2ff", color: "#4f46e5" }}>roll-up</span>}
                          </span>
                          {/* Bar */}
                          <span className="relative h-6 flex items-center">
                            <span
                              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-md transition-all"
                              style={{
                                height: 20,
                                width: `${widthPct}%`,
                                backgroundColor: fill,
                                ...(isOthers ? { backgroundImage: `repeating-linear-gradient(45deg, ${fill} 0 6px, ${fill}cc 6px 12px)` } : {}),
                              }}
                            />
                          </span>
                          {/* Count + pct */}
                          <span className="text-[12px] font-bold tabular-nums whitespace-nowrap" style={{ color: T.textPrimary }}>
                            {formatNum(r.value)}
                            <span className="ml-1 text-[10.5px] font-medium" style={{ color: T.textMuted }}>· {sharePct}%</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Footer: Others pill (clickable → modal) + gradient legend */}
                  <div className="flex items-center justify-between gap-3 mt-3 text-[10.5px]" style={{ color: T.textMuted }}>
                    {tail.length > 0 ? (
                      <button
                        onClick={() => { setSpOthersSearch(""); setSpOthersModalOpen(true); }}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 transition hover:shadow-sm hover:border-indigo-300"
                        style={{ background: "#f3f4f6", border: `1px solid ${T.borderLight}` }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ background: "#9ca3af" }} />
                        <span><strong style={{ color: T.textPrimary }}>+ {tail.length}</strong> smaller specialties · <strong style={{ color: T.textPrimary }}>{formatNum(tailSum)}</strong> consults ({tailPct}%)</span>
                        <span className="text-[10px] font-semibold ml-1" style={{ color: "#4f46e5" }}>View →</span>
                      </button>
                    ) : <span />}
                    <div className="flex items-center gap-2 shrink-0">
                      <span>Largest</span>
                      <span className="w-12 h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${RAMP_FROM}, ${RAMP_TO})` }} />
                      <span>Smallest</span>
                    </div>
                  </div>
                  <InsightBox text={`${formatNum(grandTotal)} consults across ${sorted.length} specialties — top ${top.length} carry ${topShownPct}% of the repeat pool${tail.length > 0 ? `; the remaining ${tail.length} smaller specialties combine to ${tailPct}%` : ""}. ${dominant ? `${dominant.name} leads with ${formatNum(dominant.value)} consults (${dominantPct}%).` : ""} Bar length is scaled to the leader — quickly spot which departments anchor your repeat-care load.`} />
                </div>
              );
            })()}
          </CVCard>}
        </div>

        {/* ── Recurring Conditions Table — Chronic only ── */}
        {isChartVisible("recurringConditions") && <CVCard accentColor={T.coral} title="Recurring Conditions Performance" chartId="recurringConditions"
          tooltipText="Ranked table of chronic conditions that recur across repeat patients (≥2 occurrences per patient). Rows are ordered by distinct patient count; the volume bar is sized relative to the top condition. The Avg / Patient column shows how many times the average affected patient comes back for the same condition."
          subtitle="Chronic conditions recurring across repeat patients — volume, occurrences, and recurrence intensity per patient"
          chartData={charts?.recurringConditions} chartTitle="Recurring Conditions Performance" chartDescription="Ranked chronic recurring conditions by patient volume and recurrence intensity" tableData={recurringTable}
          expandable={false}>
          {(() => {
            const rows: Array<{ name: string; count: number; patients: number }>
              = (charts?.recurringConditions?.chronic || []);
            const maxPatients = Math.max(1, ...rows.map((r) => r.patients));
            const totalPatients = rows.reduce((s, r) => s + r.patients, 0);
            const totalOccurrences = rows.reduce((s, r) => s + r.count, 0);
            const accent = "#4f46e5";
            const accentSoft = "#4f46e515";
            return (
              <div className="flex-1 flex flex-col mt-3">
                {/* Hero stat tiles — 3 separate KPIs in soft accent-tinted cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Conditions Tracked", value: formatNum(rows.length), sub: "long-term recurring" },
                    { label: "Distinct Patients", value: formatNum(totalPatients), sub: "with recurring diagnoses" },
                    { label: "Total Occurrences", value: formatNum(totalOccurrences), sub: `${rows.length > 0 ? (totalOccurrences / Math.max(1, totalPatients)).toFixed(1) : 0}× avg per patient` },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl px-4 py-3 transition-all hover:-translate-y-px"
                      style={{ backgroundColor: accentSoft, border: `1px solid ${accent}25` }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{m.label}</p>
                      <p className="text-[26px] font-extrabold leading-none tracking-[-0.02em] mt-1.5 font-[var(--font-inter)]" style={{ color: accent, fontVariantNumeric: "tabular-nums" }}>{m.value}</p>
                      <p className="text-[10.5px] mt-1" style={{ color: T.textSecondary }}>{m.sub}</p>
                    </div>
                  ))}
                </div>
                {/* Table */}
                <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${T.border}` }}>
                  <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
                    <table className="w-full text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead className="sticky top-0 z-10" style={{ backgroundColor: T.warmBg }}>
                        <tr>
                          <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] w-[44px]" style={{ color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>#</th>
                          <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>Condition</th>
                          <th className="text-left px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: T.textMuted, borderBottom: `1px solid ${T.border}`, minWidth: 220 }}>Patients</th>
                          <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>Total Occurrences</th>
                          <th className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.06em] whitespace-nowrap" style={{ color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>Avg / Patient</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-10 text-[12px]" style={{ color: T.textMuted }}>
                              No recurring chronic conditions found for the current selection.
                            </td>
                          </tr>
                        ) : rows.map((cond, i) => {
                          const widthPct = Math.max(2, (cond.patients / maxPatients) * 100);
                          const avgPerPatient = cond.patients > 0 ? cond.count / cond.patients : 0;
                          const sharePct = totalPatients > 0 ? Math.round((cond.patients / totalPatients) * 1000) / 10 : 0;
                          return (
                            <tr key={cond.name} className="transition-colors hover:bg-gray-50">
                              <td className="px-3 py-3 align-middle" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                                <span
                                  className="inline-flex items-center justify-center text-[11px] font-bold rounded-full"
                                  style={{ backgroundColor: i < 3 ? accentSoft : T.borderLight, color: i < 3 ? accent : T.textMuted, width: 26, height: 26 }}
                                >
                                  {i + 1}
                                </span>
                              </td>
                              <td className="px-3 py-3 align-middle font-semibold" style={{ borderBottom: `1px solid ${T.borderLight}`, color: T.textPrimary }} title={cond.name}>
                                {cleanIcdLabel(cond.name)}
                              </td>
                              <td className="px-3 py-3 align-middle" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                                <div className="flex items-center gap-3">
                                  <div className="relative h-2 rounded-full flex-1 overflow-hidden" style={{ backgroundColor: T.borderLight, minWidth: 80 }}>
                                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${widthPct}%`, backgroundColor: accent }} />
                                  </div>
                                  <span className="font-bold tabular-nums whitespace-nowrap text-[13px]" style={{ color: T.textPrimary }}>
                                    {formatNum(cond.patients)}
                                    <span className="ml-1 text-[10.5px] font-medium" style={{ color: T.textMuted }}>· {sharePct}%</span>
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3 align-middle text-right tabular-nums font-semibold whitespace-nowrap" style={{ borderBottom: `1px solid ${T.borderLight}`, color: T.textPrimary }}>
                                {formatNum(cond.count)}
                              </td>
                              <td className="px-3 py-3 align-middle text-right" style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                                <span
                                  className="inline-flex items-center justify-end px-2.5 py-0.5 rounded-md text-[12px] font-bold tabular-nums"
                                  style={{ backgroundColor: accentSoft, color: accent }}
                                >
                                  {avgPerPatient.toFixed(1)}×
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <InsightBox text={`Viewing chronic recurring conditions — ${rows.length} conditions affecting ${formatNum(totalPatients)} repeat patients with ${formatNum(totalOccurrences)} total occurrences. ${rows[0] ? `${cleanIcdLabel(rows[0].name)} leads with ${formatNum(rows[0].patients)} patients (${(rows[0].count / Math.max(1, rows[0].patients)).toFixed(1)}× avg recurrence).` : ""} Higher avg-per-patient indicates conditions where individual patients return repeatedly — strong candidates for proactive care management.`} />
              </div>
            );
          })()}
        </CVCard>}

        {/* ── Key Repeat User Segments ── */}
        {isChartVisible("repeatUserSegments") && <CVCard accentColor={"#6366f1"} title="Key Repeat User Segments" chartId="repeatUserSegments"
          tooltipText="Segment cards comparing repeat patient cohorts by tenure (1 year, 2 years, 3+ years). Each card shows patient count, visits-per-year, and the chronic-patient share of the cohort."
          subtitle="Compare engagement patterns and visit frequencies across repeat patient cohorts grouped by tenure."
          chartData={charts?.repeatUserSegments} chartTitle="Key Repeat User Segments" chartDescription="Engagement patterns across repeat patient cohorts" tableData={segmentsTable}
          expandable={false}>
          <div className="overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-3" style={{ minWidth: 700 }}>
            {(() => {
              // Active date range in years — used to tell whether an empty
              // tenure card is empty because the filter window is too
              // narrow to ever populate it, or because no patients qualify.
              const rangeYears =
                (appliedDateRange.to.getTime() - appliedDateRange.from.getTime()) /
                (365.25 * 24 * 60 * 60 * 1000);
              return (charts?.repeatUserSegments || []).map((rawSeg: any, i: number) => {
              const segColors = ["#818cf8", "#0d9488", "#a78bfa"];
              const segColor = segColors[i % segColors.length];
              const tenureLabel = rawSeg?.label === "3+ years" ? "\u22653 yr" : rawSeg?.label === "2 years" ? "=2 yr" : "=1 yr";
              const rawChronic = rawSeg?.chronic ?? { count: 0, pct: 0 };
              const seg = {
                label: rawSeg?.label ?? "",
                patients: rawSeg?.patients ?? 0,
                visitsPerYear: rawSeg?.visitsPerYear ?? 0,
                chronic: rawChronic,
              };
              const chronicPctClamped = Math.max(0, Math.min(100, Number(seg.chronic.pct) || 0));
              // Min date-range span (in years) needed for this tenure
              // bucket to be reachable at all. "1 year" is always
              // reachable; "2 years" needs ≥1yr span; "3+ years" needs
              // ≥2yr span.
              const minRangeYears = seg.label === "3+ years" ? 2 : seg.label === "2 years" ? 1 : 0;
              const isEmpty = seg.patients === 0;
              const windowTooNarrow = isEmpty && rangeYears < minRangeYears;
              return (
                <div key={seg.label} className="rounded-2xl p-5 flex flex-col" style={{ border: `2px solid ${segColor}30`, backgroundColor: `${segColor}08` }}>
                  <h4 className="text-[14px] font-bold mb-4" style={{ color: T.textPrimary }}>
                    Consistent Users since ({tenureLabel})
                  </h4>
                  {isEmpty ? (
                    // Hint card replaces the zero-filled stats — users
                    // get an explanation instead of a row of "0".
                    <div
                      className="flex-1 flex flex-col items-center justify-center text-center rounded-xl px-4 py-6"
                      style={{ backgroundColor: `${segColor}12`, border: `1px dashed ${segColor}40`, minHeight: 180 }}
                    >
                      <div
                        className="flex items-center justify-center rounded-full mb-3"
                        style={{ width: 36, height: 36, backgroundColor: `${segColor}20` }}
                      >
                        <Info size={18} style={{ color: segColor }} />
                      </div>
                      {windowTooNarrow ? (
                        <>
                          <p className="text-[12.5px] font-semibold" style={{ color: T.textPrimary }}>
                            Date range too narrow
                          </p>
                          <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: T.textSecondary, maxWidth: 220 }}>
                            Expand the date filter to at least {minRangeYears} year{minRangeYears === 1 ? "" : "s"} to see patients in this tenure bucket.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-[12.5px] font-semibold" style={{ color: T.textPrimary }}>
                            No patients in this tenure
                          </p>
                          <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: T.textSecondary, maxWidth: 220 }}>
                            No repeat patients match this tenure bucket for the current filters.
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* 2 KPI metrics in a row */}
                      <div className="grid grid-cols-2 gap-2 mb-5">
                        {[
                          { label: "Patients", value: formatNum(seg.patients) },
                          { label: "Visits / Yr", value: seg.visitsPerYear },
                        ].map((m) => (
                          <div key={m.label} className="text-center">
                            <p className="text-[24px] font-extrabold" style={{ color: segColor }}>{m.value}</p>
                            <p className="text-[10px] font-medium mt-0.5" style={{ color: T.textMuted }}>{m.label}</p>
                          </div>
                        ))}
                      </div>
                      {/* Chronic stat — single box now that acute is gone. */}
                      <div className="rounded-xl px-4 py-3" style={{ backgroundColor: `${segColor}12`, border: `1px solid ${segColor}30` }}>
                        <div className="flex items-end justify-between gap-3 mb-2">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Chronic Patients</p>
                            <p className="text-[22px] font-extrabold leading-none mt-1.5 tabular-nums" style={{ color: segColor }}>
                              {formatNum(seg.chronic.count)}
                            </p>
                          </div>
                          <p className="text-[13px] font-bold tabular-nums" style={{ color: segColor }}>
                            {chronicPctClamped}%
                          </p>
                        </div>
                        {/* Slim bar showing chronic share of this tenure segment. */}
                        <div className="rounded-full overflow-hidden h-1.5" style={{ backgroundColor: `${segColor}25` }}>
                          <div
                            className="h-full transition-all"
                            style={{ width: `${chronicPctClamped}%`, backgroundColor: segColor }}
                          />
                        </div>
                        <p className="text-[10.5px] mt-1.5" style={{ color: T.textSecondary }}>of {formatNum(seg.patients)} repeaters in this tenure</p>
                      </div>
                    </>
                  )}
                </div>
              );
            });
            })()}
          </div>
          </div>
          <InsightBox text="Compare tenure-based segments to understand how patient engagement evolves over time. Longer-tenured patients typically visit more consistently per year and a larger share carry chronic conditions, signalling stronger care relationships. Use these insights to design retention and continuity-of-care programs." />
        </CVCard>}

        {/* ── Same Cohort Progression ── */}
        {isChartVisible("cohortProgression") && <CVCard accentColor="#6366f1" title="Same Cohort Progression" chartId="cohortProgression"
          tooltipText="Two-panel view tracking the same patient cohort over time. Left panel: grouped bar chart showing how many patients reach different visit thresholds (3+, 4+, 5+, 6+) per year — use checkboxes to compare years. Right panel: Sankey flow diagram showing BMI category transitions across visits (Above Normal, In Range, Below Normal)."
          subtitle="Track how the same cohort of repeat patients progress over time — visit frequency distribution and vital trends."
          chartData={{ cohortFrequency: cohortData.combined, sankeyFlow: charts?.sankeyFlow }} chartTitle="Same Cohort Progression" chartDescription="Cohort progression over time — visit frequency and vital trends" tableData={cohortTable}
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
          <InsightBox text={`Cohort progression tracks ${cohortSelectedYears.length > 0 ? cohortSelectedYears.join(", ") : "selected"} year(s). The visit frequency distribution reveals whether patients are increasing or decreasing their visit frequency over time, while the BMI Sankey flow shows health outcome transitions — watch for flows moving from Above Normal to In Range as a positive indicator.`} />
        </CVCard>}

        {/* Data Audit — superadmin-only source + extraction logic per chart.
            Renders to null for every other role; provenance only arrives in
            the API payload for SUPER_ADMIN callers. */}
        <DataAuditSection provenance={repeatApi?._meta?.provenance} />

        {/* Others (Specialty) breakdown modal */}
        <Dialog open={spOthersModalOpen} onOpenChange={setSpOthersModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Others — Specialty Breakdown</DialogTitle>
            </DialogHeader>
            {(() => {
              const all: Array<{ name: string; value: number; avgVisits?: number }> = (charts?.specialtyTreemap?.[treemapYear] || []);
              const sorted = [...all].sort((a, b) => b.value - a.value);
              // Must match TOP_N used in the chart above (10) — otherwise the
              // modal would skip the 11th/12th specialties that the chart
              // already rolled into Others.
              const tail = sorted.slice(10);
              const tailTotal = tail.reduce((s, r) => s + r.value, 0);
              const grandTotal = sorted.reduce((s, r) => s + r.value, 0) || 1;
              const q = spOthersSearch.trim().toLowerCase();
              const filtered = q ? tail.filter((b) => b.name.toLowerCase().includes(q)) : tail;
              return (
                <>
                  <div className="text-xs mb-3" style={{ color: T.textSecondary }}>
                    <strong>{tail.length}</strong> smaller specialties grouped · <strong>{formatNum(tailTotal)}</strong> total patients · <strong>{Math.round(tailTotal / grandTotal * 100)}%</strong> of pool
                  </div>
                  <Input placeholder="Search specialty…" value={spOthersSearch} onChange={(e) => setSpOthersSearch(e.target.value)} className="mb-3" />
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-1">
                      {filtered.map((b) => {
                        const pct = Math.round((b.value / grandTotal) * 1000) / 10;
                        const sharePct = Math.round((b.value / tailTotal) * 1000) / 10;
                        return (
                          <div key={b.name} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                            <span className="truncate" style={{ color: T.textSecondary }}>{b.name}</span>
                            <span className="flex items-baseline gap-2 shrink-0">
                              <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(b.value)}</span>
                              <span className="text-[11px] tabular-nums" style={{ color: T.textMuted }}>{pct}% pool · {sharePct}% of others</span>
                            </span>
                          </div>
                        );
                      })}
                      {filtered.length === 0 && (
                        <div className="text-xs text-center py-6" style={{ color: T.textMuted }}>No specialties match &ldquo;{spOthersSearch}&rdquo;</div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Others (Location) breakdown modal */}
        <Dialog open={othersModalOpen} onOpenChange={setOthersModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Others — Location Breakdown</DialogTitle>
            </DialogHeader>
            {(() => {
              const list: Array<{ location: string; total: number }> = demoSource?.othersBreakdown || [];
              const total = list.reduce((s: number, b: any) => s + (b.total || 0), 0);
              const q = othersSearch.trim().toLowerCase();
              const filtered = q ? list.filter((b: any) => b.location.toLowerCase().includes(q)) : list;
              return (
                <>
                  <div className="text-xs mb-3" style={{ color: T.textSecondary }}>
                    <strong>{list.length}</strong> smaller sites grouped · <strong>{formatNum(total)}</strong> total patients
                  </div>
                  <Input placeholder="Search location…" value={othersSearch} onChange={(e) => setOthersSearch(e.target.value)} className="mb-3" />
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-1">
                      {filtered.map((b: any) => (
                        <button
                          key={b.location}
                          onClick={() => { setAppliedLocations([b.location]); setOthersModalOpen(false); }}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm text-left"
                        >
                          <span style={{ color: T.textSecondary }}>{b.location}</span>
                          <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(b.total)}</span>
                        </button>
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
    </div>
  );
}
