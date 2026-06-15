// @ts-nocheck — Copied from client, ECharts ref type mismatch with React 19
"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
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
import { AskAIButton } from "@/components/ai/AskAIButton";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { useAuth } from "@/lib/contexts/auth-context";
import { useDateRange } from "@/lib/date-range-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { useChartVisibility } from "@/lib/hooks/useChartVisibility";
import {
  Info,
  Maximize2,
  Minimize2,
  CalendarDays,
  X,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Table2,
  BarChart3,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PageDownload from "@/components/shared/PageDownload";
import DataAuditSection from "@/components/audit/DataAuditSection";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
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
  LabelList,
  ResponsiveContainer,
  ReferenceLine,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from "recharts";
import { format } from "date-fns";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * In-chart data labels for a multi-line trend: shows EVERY series value at
 * EVERY point, but runs a per-x vertical de-collision pass over the real
 * pixel positions (from recharts v3 hooks) so no two numbers overlap, and the
 * stack stays inside the plot (off the lines and both axes). Render as a child
 * of the LineChart, after the <Line>s.
 */
function LineValueLabels({
  data, xKey, series,
}: {
  data: any[];
  xKey: string;
  series: { key: string; color: string }[];
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale() as any;
  const yScale = useYAxisScale() as any;
  if (!plot || !xScale || !yScale || !data?.length) return null;
  const compact = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
  const GAP = 13;
  const top = plot.y + 4, bottom = plot.y + plot.height - 4;
  const els: React.ReactNode[] = [];
  data.forEach((d, idx) => {
    const xPos = xScale(d[xKey]);
    if (xPos == null) return;
    const lab = series
      .map((s) => ({ value: Number(d[s.key] || 0), color: s.color }))
      .filter((it) => it.value > 0)
      .map((it) => ({ ...it, y: Number(yScale(it.value)) }))
      .sort((a, b) => a.y - b.y);
    const n = lab.length;
    if (!n) return;
    // Place just above each point, then pack within the plot band by GAP.
    const y = lab.map((l) => l.y - 7);
    for (let i = 1; i < n; i++) if (y[i] < y[i - 1] + GAP) y[i] = y[i - 1] + GAP;
    const overflow = y[n - 1] - bottom;
    if (overflow > 0) for (let i = 0; i < n; i++) y[i] -= overflow;
    for (let i = n - 2; i >= 0; i--) if (y[i] > y[i + 1] - GAP) y[i] = y[i + 1] - GAP;
    if (y[0] < top) { const dd = top - y[0]; for (let i = 0; i < n; i++) y[i] += dd; }
    const atStart = idx === 0, atEnd = idx === data.length - 1;
    const anchor = atStart ? "start" : atEnd ? "end" : "middle";
    const dx = atStart ? 5 : atEnd ? -5 : 0;
    lab.forEach((l, i) => {
      els.push(
        <text key={`${idx}-${i}`} x={xPos + dx} y={y[i]} textAnchor={anchor} dominantBaseline="middle" fontSize={9.5} fontWeight={700} fill={l.color}>{compact(l.value)}</text>
      );
    });
  });
  return <g>{els}</g>;
}


const SUNBURST_COLORS: Record<string, string> = {
  "<20": "#818cf8",
  "20-35": "#0d9488",
  "36-40": "#d4d4d8",
  "41-60": "#a78bfa",
  "61+": "#6366f1",
};
// Kept in sync with the GENDER_COLORS map in app/api/ohc/utilization/route.ts —
// the API bakes these colors into demographicSunburst data, and we restate them
// here for the chart legend. Chosen to be distinct from SUNBURST_COLORS so the
// inner-ring (age group) and outer-ring (gender) don't share hues.
const GENDER_COLORS: Record<string, string> = { M: "#4f46e5", F: "#e879f9", O: "#a1a1aa" };

const SPECIALTY_COLORS: Record<string, string> = {
  "General Physician": "#4f46e5", Dietetics: "#6366f1", "Internal Medicine": "#0d9488",
  Dental: "#14b8a6", Physiotherapy: "#8b5cf6", Cardiology: "#a78bfa",
  Dermatology: "#818cf8", ENT: "#7c3aed", Ophthalmology: "#c4b5fd",
  Nutrition: "#34d399", Others: "#a1a1aa",
};

const TREEMAP_COLORS = [
  "#4f46e5", "#6366f1", "#818cf8", "#0d9488", "#14b8a6", "#7c3aed",
  "#8b5cf6", "#a78bfa", "#06b6d4", "#34d399", "#a1a1aa", "#c4b5fd",
  "#67e8f9", "#5eead4", "#c7d2fe", "#e0e7ff",
  "#ddd6fe", "#a5b4fc", "#99f6e4", "#bfdbfe",
];

const BUBBLE_GENDER = {
  predominantlyFemale: "#c026d3", femaleMajority: "#e879f9",
  balanced: "#a1a1aa", maleMajority: "#818cf8", predominantlyMale: "#4f46e5",
};

function getBubbleColor(mp: number) {
  if (mp > 75) return BUBBLE_GENDER.predominantlyMale;
  if (mp > 50) return BUBBLE_GENDER.maleMajority;
  if (mp > 45) return BUBBLE_GENDER.balanced;
  if (mp > 25) return BUBBLE_GENDER.femaleMajority;
  return BUBBLE_GENDER.predominantlyFemale;
}

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 100000) return `${(n / 100000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(n);
}

// Period label formatter — used by both the X-axis tick formatter and the
// tooltip header so the period displayed on hover matches the axis label.
// "2025-03"     → "Mar '25"
// "2025-03-15"  → "Mar 15"
// anything else → returned as-is.
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatPeriodLabel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, m, d] = value.split("-");
    return `${MONTH_LABELS[Number(m) - 1]} ${d}`;
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-");
    return `${MONTH_LABELS[Number(m) - 1]} '${y.slice(2)}`;
  }
  return value;
}

// ─── Accent Bar ───
function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card (Critical Values style) ───
/** Optional tabular view of a chart's data. When passed to CVCard, a
 *  Chart/Table toggle appears in the card header and the table renders in
 *  place of the chart. Numbers are pre-formatted strings/nodes. */
type CVTableData = {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
  /** Optional control(s) rendered above the table (e.g. a filter dropdown). */
  controls?: React.ReactNode;
};

function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, chartId, chartData, chartTitle, chartDescription, dataPoints, tableData,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; chartId?: string;
  chartData?: unknown; chartTitle?: string; chartDescription?: string; dataPoints?: string[];
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
                {chartId && <ChartComments chartId={chartId} pageSlug="/portal/ohc/utilization" dataPoints={dataPoints} />}
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
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
                  // Rows flagged with __group render as a bold subtotal band
                  // (used for hierarchical tables, e.g. age-group totals).
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

// ─── Warm Section Wrapper ───
function WarmSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-6 sm:p-7 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>
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
      <PopoverContent className="w-52 p-2" align="start">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[12px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{label}</span>
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

// ─── Main Page ───
export default function OHCUtilizationPage() {
  usePageAccess("/portal/ohc/utilization");
  const { user, activeClientId, activeClient } = useAuth();
  // Per-tenant date floor for the Utilization page only. CISCO01's data
  // before 2026-01-01 is not in scope, so the picker can't go earlier.
  const dateMin = activeClient?.cugCode === "CISCO01" ? "2026-01-01" : undefined;
  const dateMinTs = dateMin ? new Date(dateMin + "T00:00:00").getTime() : 0;
  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility("/portal/ohc/utilization", previewConfig);
  const [trendView, setTrendView] = useState<"monthly" | "yearly">("monthly");
  const [selectedBubbleSpec, setSelectedBubbleSpec] = useState<string>("");
  const [selectedSvcCategory, setSelectedSvcCategory] = useState<string>("");
  const [repeatView, setRepeatView] = useState<"monthly" | "yearly">("monthly");
  const [sunburstDrilled, setSunburstDrilled] = useState(false);
  const [othersModalOpen, setOthersModalOpen] = useState(false);
  const [othersSearch, setOthersSearch] = useState("");
  const [otherSpecModalOpen, setOtherSpecModalOpen] = useState(false);
  const [otherSpecSearch, setOtherSpecSearch] = useState("");
  const [specOthersModalOpen, setSpecOthersModalOpen] = useState(false);
  const [specOthersSearch, setSpecOthersSearch] = useState("");
  const sunburstRef = useRef<any>(null);

  const handleSunburstReset = useCallback(() => {
    const instance = sunburstRef.current?.getEchartsInstance();
    if (instance) {
      instance.dispatchAction({ type: "sunburstRootToNode", targetNodeId: undefined });
    }
    setSunburstDrilled(false);
  }, []);

  const sunburstContainerRef = useRef<HTMLDivElement>(null);
  const [sunburstChartSize, setSunburstChartSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!sunburstContainerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSunburstChartSize({ w: width, h: height });
    });
    ro.observe(sunburstContainerRef.current);
    return () => ro.disconnect();
  }, []);

  // Page-level filters (including date range)
  // "draft" state — what the user is selecting in the filter dropdowns
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(() => {
    const today = new Date();
    return { from: new Date(today.getFullYear() - 1, 0, 1), to: today };
  });

  const [pageFilters, setPageFilters] = useState({
    ageGroups: [] as string[],
    genders: [] as string[],
    specialties: [] as string[],
    consultationTypes: [] as string[],
    locations: [] as string[],
    relations: [] as string[],
    shifts: [] as string[],
  });

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const { dateRange: appliedDateRange, setDateRange: setAppliedDateRange } = useDateRange();
  useEffect(() => { setDateRange(appliedDateRange); }, [appliedDateRange]);
  const [appliedFilters, setAppliedFilters] = useState({
    ageGroups: [] as string[],
    genders: [] as string[],
    specialties: [] as string[],
    consultationTypes: [] as string[],
    locations: [] as string[],
    relations: [] as string[],
    shifts: [] as string[],
  });

  // Push the picker forward if the active tenant has a date floor
  // (e.g. CISCO01 only has data from 2026-01-01). Runs once when
  // activeClient resolves so existing draft + applied ranges that
  // start earlier get bumped to the floor.
  useEffect(() => {
    if (!dateMinTs) return;
    setDateRange((prev) => {
      const fromTs = prev.from.getTime();
      const toTs = prev.to.getTime();
      if (fromTs >= dateMinTs && toTs >= dateMinTs) return prev;
      const floor = new Date(dateMinTs);
      const newTo = toTs < dateMinTs ? floor : prev.to;
      return { from: floor, to: newTo };
    });
    {
      const fromTs = appliedDateRange.from.getTime();
      const toTs = appliedDateRange.to.getTime();
      if (!(fromTs >= dateMinTs && toTs >= dateMinTs)) {
        const floor = new Date(dateMinTs);
        const newTo = toTs < dateMinTs ? floor : appliedDateRange.to;
        setAppliedDateRange({ from: floor, to: newTo });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMinTs]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  // ── Build API URL with all applied filters ──
  const utilizationUrl = useMemo(() => {
    if (!activeClientId) return null;
    const p = new URLSearchParams();
    p.set("clientId", activeClientId);
    p.set("dateFrom", format(appliedDateRange.from, "yyyy-MM-dd"));
    p.set("dateTo", format(appliedDateRange.to, "yyyy-MM-dd"));
    if (appliedFilters.locations.length) p.set("locations", appliedFilters.locations.join(","));
    if (appliedFilters.genders.length) p.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.ageGroups.length) p.set("ageGroups", appliedFilters.ageGroups.join(","));
    if (appliedFilters.specialties.length) p.set("specialties", appliedFilters.specialties.join(","));
    if (appliedFilters.relations.length) p.set("relations", appliedFilters.relations.join(","));
    if (appliedFilters.shifts.length) p.set("shifts", appliedFilters.shifts.join(","));
    return `/api/ohc/utilization?${p.toString()}`;
  }, [activeClientId, appliedDateRange, appliedFilters]);

  const { data: utilizationData, isLoading, isValidating, mutate: refreshData } = useSWR<any>(
    utilizationUrl,
    (url: string) => fetch(url).then((r) => { if (!r.ok) throw new Error(`API ${r.status}`); return r.json(); }),
    { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true, shouldRetryOnError: false }
  );

  const filterOptions = utilizationData?.filterOptions ?? { locations: [], specialties: [], genders: [], ageGroups: [], relations: [] };
  const kpis = utilizationData?.kpis;
  const charts = utilizationData?.charts;

  const visitTrends = charts?.visitTrends ?? [];
  const avgConsults = visitTrends.length > 0
    ? Math.round(visitTrends.reduce((s: number, v: any) => s + v.completed, 0) / visitTrends.length)
    : 0;

  const yearlyTrends = useMemo(() => {
    if (visitTrends.length === 0) return [] as Array<{ period: string; completed: number; cancelled: number; noShow: number; yoy: number | null; isYtd: boolean }>;
    const byYear: Record<string, { completed: number; cancelled: number; noShow: number }> = {};
    for (const v of visitTrends as Array<{ period: string; completed?: number; cancelled?: number; noShow?: number }>) {
      const yr = String(v.period).slice(0, 4);
      if (!byYear[yr]) byYear[yr] = { completed: 0, cancelled: 0, noShow: 0 };
      byYear[yr].completed += v.completed || 0;
      byYear[yr].cancelled += v.cancelled || 0;
      byYear[yr].noShow += v.noShow || 0;
    }
    const currentYear = String(new Date().getFullYear());
    const years = Object.keys(byYear).sort();
    return years.map((yr, i) => {
      const prev = i > 0 ? byYear[years[i - 1]].completed : 0;
      const yoy = i > 0 && prev > 0 ? Math.round(((byYear[yr].completed - prev) / prev) * 100) : null;
      return { period: yr, ...byYear[yr], yoy, isYtd: yr === currentYear };
    });
  }, [visitTrends]);

  const isDailyView = useMemo(() => {
    const days = Math.round((appliedDateRange.to.getTime() - appliedDateRange.from.getTime()) / 86400000) + 1;
    return days > 0 && days <= 31;
  }, [appliedDateRange]);

  const specialtyPareto = useMemo(() => {
    const raw = (charts?.specialtyTreemap || []) as Array<{ name: string; value: number }>;
    const total = raw.reduce((s, d) => s + (Number(d.value) || 0), 0);
    let cum = 0;
    return raw.map((d) => {
      const v = Number(d.value) || 0;
      cum += v;
      return {
        name: d.name,
        value: v,
        sharePct: total > 0 ? (v / total) * 100 : 0,
        cumulativePct: total > 0 ? (cum / total) * 100 : 0,
      };
    });
  }, [charts?.specialtyTreemap]);

  const repeatTrendData = charts?.repeatTrends ?? [];

  // Capacity vs Booked vs Completed — grouped bar by specialty (doctor_capacity).
  const capacityData: Array<{ specialty: string; capacity: number; booked: number; completed: number }> =
    charts?.capacityBookedCompleted ?? [];
  // Sort state for the Capacity vs Booked vs Completed table.
  const [capacitySort, setCapacitySort] = useState<{ key: "specialty" | "capacity" | "booked" | "completed" | "util"; dir: "asc" | "desc" }>({ key: "capacity", dir: "desc" });
  // Location filter for the Consult Distribution table view ("all" = every location).
  const [bubbleTableLoc, setBubbleTableLoc] = useState<string>("all");
  // Expanded years in the Visit Trends table view (year → period drill-down).
  const [expandedVTYears, setExpandedVTYears] = useState<Set<string>>(new Set());

  // Table view for the Demographic Consult Breakdown sunburst. Pivoted as a
  // crosstab: one row per age group with gender as columns (Male / Female /
  // Others / Total), plus a bold grand-total row. The Others column is only
  // shown when there are any non-binary/unknown-gender consults.
  const demographicTableData = useMemo(() => {
    const tree: any[] = (charts?.demographicSunburst as any[]) || [];
    const GKEY: Record<string, "male" | "female" | "others"> = { M: "male", F: "female", O: "others" };
    const totals = { male: 0, female: 0, others: 0, total: 0 };
    const groups = tree.map((ag) => {
      const cell = { male: 0, female: 0, others: 0 };
      for (const ch of (ag.children || [])) {
        const k = GKEY[ch.name as string];
        if (k) cell[k] += Number(ch.value) || 0;
      }
      const total = cell.male + cell.female + cell.others;
      totals.male += cell.male; totals.female += cell.female; totals.others += cell.others; totals.total += total;
      return { ageGroup: ag.name as string, ...cell, total };
    });
    const hasOthers = totals.others > 0;

    const columns = [
      { key: "ageGroup", label: "Age Group", align: "left" as const },
      { key: "male", label: "Male", align: "right" as const },
      { key: "female", label: "Female", align: "right" as const },
      ...(hasOthers ? [{ key: "others", label: "Others", align: "right" as const }] : []),
      { key: "total", label: "Total", align: "right" as const },
    ];
    const rows: Record<string, React.ReactNode>[] = groups.map((g) => ({
      ageGroup: g.ageGroup,
      male: formatNum(g.male),
      female: formatNum(g.female),
      others: formatNum(g.others),
      total: formatNum(g.total),
    }));
    // Grand-total row (bold band).
    rows.push({
      __group: true,
      ageGroup: "Total",
      male: formatNum(totals.male),
      female: formatNum(totals.female),
      others: formatNum(totals.others),
      total: formatNum(totals.total),
    });
    return { columns, rows };
  }, [charts?.demographicSunburst]);

  const repeatYearlyTrends = useMemo(() => {
    const rows = repeatTrendData as Array<{ label: string; repeatVisits?: number; repeatPatients?: number }>;
    if (rows.length === 0) return [] as Array<{ period: string; repeatVisits: number; repeatPatients: number; yoy: number | null; isYtd: boolean }>;
    const byYear: Record<string, { visits: number; patients: number }> = {};
    for (const r of rows) {
      const yr = String(r.label).slice(0, 4);
      if (!byYear[yr]) byYear[yr] = { visits: 0, patients: 0 };
      byYear[yr].visits += r.repeatVisits || 0;
      byYear[yr].patients += r.repeatPatients || 0;
    }
    const currentYear = String(new Date().getFullYear());
    const years = Object.keys(byYear).sort();
    return years.map((yr, i) => {
      const prev = i > 0 ? byYear[years[i - 1]].visits : 0;
      const yoy = i > 0 && prev > 0 ? Math.round(((byYear[yr].visits - prev) / prev) * 100) : null;
      return { period: yr, repeatVisits: byYear[yr].visits, repeatPatients: byYear[yr].patients, yoy, isYtd: yr === currentYear };
    });
  }, [repeatTrendData]);
  const serviceCategories = charts?.serviceCategories ?? [];
  type SvcLineItem = { serviceName: string; booked: number; completed: number; completionRate: number };
  const serviceCategoryLineItems: Record<string, { packages: SvcLineItem[]; tests: SvcLineItem[] }> =
    (charts as any)?.serviceCategoryLineItems ?? {};

  const bubbleSpecs: string[] = charts?.bubbleSpecialties || [];
  const activeBubbleSpec = selectedBubbleSpec || bubbleSpecs[0] || "";

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { ageGroups: [], genders: [], specialties: [], consultationTypes: [], locations: [], relations: [], shifts: [] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedFilters({ ...pageFilters });
  };

  // ─── Sunburst alternating ring-sector fills ───
  // Declared before any early return to satisfy Rules of Hooks.
  // Draws annular sectors (ring only — no lines from centre, no spokes through hole).
  // Sunburst radii: inner=30%, outer=85% of Math.min(w,h)/2.
  const sunburstSeparatorLines = useMemo(() => {
    const { w, h } = sunburstChartSize;
    if (!w || !h) return null;
    const data: any[] = charts?.demographicSunburst || [];
    if (!data.length) return null;
    const total = data.reduce((s: number, ag: any) =>
      s + ag.children.reduce((cs: number, c: any) => cs + (c.value || 0), 0), 0);
    if (total === 0) return null;

    const cx = w / 2;
    const cy = h / 2;
    const half = Math.min(w, h) / 2;
    // Match ECharts sunburst radii exactly
    const innerR = half * 0.30;
    const outerR = half * 0.87;

    // Build cumulative fraction boundaries [0, …, 1]
    const boundaries: number[] = [0];
    data.forEach((ag: any) => {
      const last = boundaries[boundaries.length - 1];
      const agTotal = ag.children.reduce((s: number, c: any) => s + (c.value || 0), 0);
      boundaries.push(last + agTotal / total);
    });

    // Convert a fraction [0,1] to an SVG coordinate on a given radius.
    // ECharts sunburst: startAngle=90°, clockwise.
    // In SVG (y-down): clockwise = sweep-flag 1.
    const pt = (frac: number, radius: number) => {
      const rad = (90 - frac * 360) * (Math.PI / 180);
      return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
    };

    return data.map((_ag: any, i: number) => {
      if (i % 2 === 0) return null; // shade every other age-group band only

      const f1 = boundaries[i];
      const f2 = boundaries[i + 1];
      const span = (f2 - f1) * 360;
      const large = span > 180 ? 1 : 0;

      // Outer arc start → end (clockwise, sweep=1)
      const o1 = pt(f1, outerR);
      const o2 = pt(f2, outerR);
      // Inner arc end → start (counter-clockwise, sweep=0) to close the annular sector
      const i1 = pt(f1, innerR);
      const i2 = pt(f2, innerR);

      const d = [
        `M ${o1.x} ${o1.y}`,
        `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x} ${o2.y}`,
        `L ${i2.x} ${i2.y}`,
        `A ${innerR} ${innerR} 0 ${large} 0 ${i1.x} ${i1.y}`,
        `Z`,
      ].join(" ");

      return <path key={`band-${i}`} d={d} fill="rgba(80,80,120,0.07)" />;
    });
  }, [sunburstChartSize, charts?.demographicSunburst]);

  // Derive top locations from bubble data (must be before early return to satisfy Rules of Hooks)
  const bubbleData = charts?.bubbleBySpecialty?.[activeBubbleSpec] || [];
  const locationOrder = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const b of bubbleData) totals[b.location] = (totals[b.location] || 0) + b.total;
    return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l]) => l);
  }, [bubbleData]);

  if (!utilizationData && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  // ─── Sunburst Option ───
  // Compact label formatter for ON-CHART data labels — short forms (12.3K /
  // 1.5L) keep slice labels clean; hover tooltips still show the full number.
  const compactLabel = (n: number) => {
    const v = Number(n) || 0;
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return String(v);
  };
  const sunburstOption = {
    tooltip: {
      trigger: "item",
      // Keep the tooltip inside the chart so the overflow-hidden card
      // boundary doesn't clip it when hovering the left-side slices.
      confine: true,
      backgroundColor: "#fff",
      borderColor: T.border,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { fontSize: 12, fontFamily: "var(--font-inter), system-ui, sans-serif", color: T.textPrimary },
      extraCssText: "border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,0.10);max-width:320px;white-space:normal;",
      formatter: (p: any) => {
        if (!p.data) return "";
        type SunburstNode = { name: string; value?: number; children?: SunburstNode[] };
        const tree = (charts?.demographicSunburst || []) as SunburstNode[];
        // ECharts top-level nodes only carry `children` (it sums on render),
        // so derive node values manually for the percentage math.
        const nodeValue = (n: SunburstNode | undefined): number => {
          if (!n) return 0;
          if (typeof n.value === "number") return n.value;
          return (n.children || []).reduce((s, c) => s + nodeValue(c), 0);
        };
        const grandTotal = tree.reduce((s, n) => s + nodeValue(n), 0);
        const genderOf = (v: unknown) => v === "M" ? "Male" : v === "F" ? "Female" : v === "O" ? "Others" : "";
        const path: string[] = (p.treePathInfo || []).map((n: any) => n?.name).filter(Boolean);
        const [ageGroup, gender] = path;
        const value = Number(p.data.value || p.value || 0);
        const pctTotal = grandTotal > 0 ? Math.round((value / grandTotal) * 100) : 0;
        const muted = `color:${T.textPrimary};font-size:11px;`;
        if (ageGroup && gender) {
          const ageTotal = nodeValue(tree.find((n) => n.name === ageGroup));
          const pctAge = ageTotal > 0 ? Math.round((value / ageTotal) * 100) : 0;
          return `<strong>${ageGroup} years · ${genderOf(gender)}</strong><div style="margin-top:4px;">${formatNum(value)} consults</div><div style="${muted}">${pctAge}% of the ${ageGroup} group</div><div style="${muted}">${pctTotal}% of all consults</div>`;
        }
        if (ageGroup) {
          const isGenderRoot = ["M", "F", "O"].includes(ageGroup);
          const label = isGenderRoot ? genderOf(ageGroup) : `${ageGroup} years`;
          return `<strong>${label}</strong><div style="margin-top:4px;">${formatNum(value)} consults</div><div style="${muted}">${pctTotal}% of all consults</div>`;
        }
        return `<strong>← Back</strong><br/><span style="font-size:11px;color:#6B7280">Click to zoom out</span>`;
      },
    },
    series: [{
      type: "sunburst",
      data: charts?.demographicSunburst || [],
      radius: ["30%", "85%"],
      sort: undefined,
      emphasis: { focus: "ancestor", itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" } },
      label: {
        show: true,
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        color: "#fff",
        fontSize: 11,
        fontWeight: 600,
        minAngle: 15,
      },
      levels: [
        {
          // Drill-up "back" node (ECharts synthetic root shown after a click)
          itemStyle: {
            color: "#eef2ff",
            borderColor: "#c7d2fe",
            borderWidth: 2,
          },
          label: {
            show: true,
            rotate: 0,
            color: "#4f46e5",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "var(--font-inter), system-ui, sans-serif",
            formatter: "← Back",
          },
          emphasis: {
            itemStyle: { color: "#e0e7ff", borderColor: "#818cf8" },
          },
        },
        {
          // Inner ring (age group). Band name (bold) on top, consult count
          // (lighter) beneath. minAngle (series) hides labels on thin slices.
          r0: "30%", r: "60%",
          label: {
            rotate: 0, color: "#fff", lineHeight: 16,
            formatter: (p: any) => `{n|${p.name}}\n{v|${compactLabel(p.value)}}`,
            rich: {
              n: { fontSize: 15, fontWeight: "bold", color: "#fff" },
              v: { fontSize: 9.5, fontWeight: "normal", color: "rgba(255,255,255,0.6)", padding: [2, 0, 0, 0] },
            },
          },
          itemStyle: { borderWidth: 3, borderColor: "#fff", borderRadius: 4 },
        },
        {
          // Outer ring (gender). Gender letter (bold) + consult count (lighter).
          r0: "62%", r: "85%",
          label: {
            rotate: 0, align: "center", color: "#fff", lineHeight: 14,
            formatter: (p: any) => `{n|${p.name}}\n{v|${compactLabel(p.value)}}`,
            rich: {
              n: { fontSize: 13, fontWeight: "bold", color: "#fff" },
              v: { fontSize: 9, fontWeight: "normal", color: "rgba(255,255,255,0.6)", padding: [1, 0, 0, 0] },
            },
          },
          itemStyle: { borderWidth: 2, borderColor: "#fff", borderRadius: 4 },
        },
      ],
    }],
    graphic: [],
  };

  // ─── Treemap Option ───
  const treemapTotal = (charts?.specialtyTreemap || []).reduce((s: number, t: any) => s + t.value, 0);
  const treemapOption = {
    tooltip: {
      backgroundColor: "#fff",
      borderColor: T.border,
      borderWidth: 1,
      padding: [14, 18],
      textStyle: { fontSize: 12, fontFamily: "Inter, system-ui, sans-serif", color: T.textPrimary },
      extraCssText: "border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.12);",
      formatter: (p: any) => {
        const pct = treemapTotal > 0 ? ((p.value / treemapTotal) * 100).toFixed(1) : "0";
        return `<div style="min-width:160px"><div style="font-size:14px;font-weight:700;margin-bottom:6px;color:#111827">${p.name}</div><div style="font-size:22px;font-weight:800;color:#111827;margin-bottom:4px">${formatNum(p.value)}</div><div style="font-size:12px;color:#6B7280">${pct}% of total consultations</div></div>`;
      },
    },
    series: [{
      type: "treemap",
      data: (charts?.specialtyTreemap || []).map((dd: any, i: number) => ({
        ...dd,
        itemStyle: {
          color: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
          borderColor: "#fff",
          borderWidth: 3,
          borderRadius: 8,
        },
      })),
      roam: false, nodeClick: false, breadcrumb: { show: false },
      width: "96%", height: "94%",
      left: "2%", top: "3%",
      label: {
        show: true,
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#fff",
        position: "insideTopLeft",
        padding: [10, 12],
        overflow: "truncate",
        ellipsis: "",
        formatter: (p: any) => {
          const pct = treemapTotal > 0 ? ((p.value / treemapTotal) * 100).toFixed(0) : "0";
          const share = treemapTotal > 0 ? p.value / treemapTotal : 0;
          if (share < 0.03) return "";
          if (share < 0.07) return `{nameS|${p.name}}`;
          return `{name|${p.name}}\n{val|${formatNum(p.value)}  ·  ${pct}%}`;
        },
        rich: {
          name: { fontSize: 14, fontWeight: 700, fontFamily: "Inter, system-ui, sans-serif", color: "#fff", lineHeight: 22, textShadowColor: "rgba(0,0,0,0.2)", textShadowBlur: 2 },
          val: { fontSize: 12, fontWeight: 500, fontFamily: "Inter, system-ui, sans-serif", color: "rgba(255,255,255,0.9)", lineHeight: 20 },
          nameS: { fontSize: 11, fontWeight: 700, fontFamily: "Inter, system-ui, sans-serif", color: "#fff", lineHeight: 16, textShadowColor: "rgba(0,0,0,0.2)", textShadowBlur: 2 },
        },
      },
      upperLabel: { show: false },
      itemStyle: { borderColor: "#fff", borderWidth: 3, gapWidth: 2, borderRadius: 8 },
      emphasis: {
        itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.15)", borderColor: "#fff", borderWidth: 4 },
        label: { fontSize: 15, fontWeight: 800 },
      },
      levels: [{ itemStyle: { borderColor: "#fff", borderWidth: 3, gapWidth: 2, borderRadius: 8 } }],
      animationDuration: 600,
      animationEasing: "cubicOut",
    }],
  };

  // ─── Bubble ───
  const ageGroupOrder = ["<20", "20-35", "36-40", "41-60", "61+"];
  const bubbleValues = bubbleData.map((b: any) => b.total);
  const bubbleMax = Math.max(...bubbleValues, 1);
  const bubbleMin = Math.min(...bubbleValues, 0);

  const bubbleOption = {
    tooltip: {
      trigger: "item",
      backgroundColor: "#fff",
      borderColor: T.border,
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { fontSize: 12, fontFamily: "Inter, sans-serif", color: T.textPrimary },
      extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
      formatter: (p: any) => {
        const dd = p.data;
        if (!dd) return "";
        const mp = dd[3];
        const fp = 100 - mp;
        return `
          <div style="min-width:180px">
            <div style="font-weight:700;font-size:13px;color:${T.textPrimary};margin-bottom:6px">${dd[4]} &middot; ${dd[5]}</div>
            <div style="font-size:11px;color:${T.textSecondary};margin-bottom:4px">Specialty: <span style="font-weight:600;color:#4f46e5">${activeBubbleSpec}</span></div>
            <div style="font-size:22px;font-weight:800;color:${T.textPrimary};margin-bottom:8px">${formatNum(dd[2])} <span style="font-size:11px;font-weight:400;color:${T.textMuted}">consultations</span></div>
            <div style="border-top:1px solid ${T.borderLight};padding-top:8px">
              <div style="display:flex;gap:4px;height:6px;border-radius:3px;overflow:hidden;margin-bottom:6px">
                <div style="width:${fp}%;background:#e11d48;border-radius:3px"></div>
                <div style="width:${mp}%;background:#4f46e5;border-radius:3px"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11px">
                <span style="color:#e11d48;font-weight:600">F: ${dd[6]} (${fp}%)</span>
                <span style="color:#4f46e5;font-weight:600">M: ${dd[7]} (${mp}%)</span>
              </div>
            </div>
          </div>`;
      },
    },
    grid: { left: 70, right: 40, top: 20, bottom: 80 },
    xAxis: {
      type: "category", data: locationOrder,
      axisLabel: { fontSize: 11, fontFamily: "Inter, sans-serif", color: T.textSecondary, interval: 0, rotate: 25 },
      axisTick: { show: false }, axisLine: { lineStyle: { color: T.border } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "category", data: ageGroupOrder,
      axisLabel: { fontSize: 11, fontFamily: "Inter, sans-serif", color: T.textSecondary },
      axisTick: { show: false }, axisLine: { lineStyle: { color: T.border } },
      splitLine: { show: true, lineStyle: { color: T.borderLight, type: "dashed" } },
      // Alternating row bands per age group — each row a single uniform
      // colour edge-to-edge. Column banding is intentionally OFF so the
      // x-axis doesn't break the row stripes into a checkerboard.
      splitArea: {
        show: true,
        areaStyle: {
          color: ["rgba(245,246,250,0.85)", "rgba(255,255,255,0)"],
        },
      },
    },
    series: [{
      type: "scatter",
      symbolSize: (val: number[]) => {
        if (bubbleMax === bubbleMin) return 30;
        const normalized = (val[2] - bubbleMin) / (bubbleMax - bubbleMin);
        return 14 + normalized * 42;
      },
      data: bubbleData.filter((b: any) => locationOrder.includes(b.location)).map((b: any) => [
        locationOrder.indexOf(b.location),
        Math.max(ageGroupOrder.indexOf(b.ageGroup), 0),
        b.total, b.malePercent, b.location, b.ageGroup, b.female, b.male,
      ]),
      itemStyle: {
        color: (p: any) => getBubbleColor(p.data[3]),
        opacity: 0.82, borderColor: "#fff", borderWidth: 1.5,
        shadowBlur: 4, shadowColor: "rgba(0,0,0,0.08)",
      },
      emphasis: { itemStyle: { opacity: 1, borderWidth: 2, shadowBlur: 10, shadowColor: "rgba(0,0,0,0.15)" } },
    }],
  };

  const stackSpecialties: string[] = charts?.topSpecialties || [];
  const locationBySpecialtyData = (charts?.locationBySpecialty || []).map((r: any) => ({
    ...r,
    __total: stackSpecialties.reduce((s: number, k: string) => s + (Number(r[k]) || 0), 0),
  }));
  // Real clinic count excludes the synthetic "Others" pseudo-row that bundles
  // long-tail locations on multi-site clients.
  const realClinicCount = locationBySpecialtyData.filter((r: any) => r.location !== "Others").length;
  const clinicChartMode: "bar" | "heatmap" | "specialtyOnly" =
    realClinicCount <= 1 ? "specialtyOnly" : realClinicCount < 5 ? "heatmap" : "bar";

  const radarData = (serviceCategories || [])
    .filter((sc: any) => sc.category?.toLowerCase() !== "consultation")
    .map((sc: any) => ({
      category: sc.category, booked: sc.booked, completed: sc.completed,
    }));

  // ── Table-view data for each chart (Chart ⇄ Table toggle) ──────────────
  // ── Table-view data built as PLAIN CONSTS (not hooks). These sit after the
  // page's early loading-return, so they must NOT be useMemo — calling a hook
  // after a conditional return breaks the Rules of Hooks. They're cheap.

  // Series config for the Visit Trends on-chart labels (see LineValueLabels).
  const VT_LABEL_SERIES = [
    { key: "completed", color: "#4f46e5" },
    { key: "uniquePatients", color: "#0d9488" },
    { key: "cancelled", color: "#d97706" },
    { key: "noShow", color: "#dc2626" },
  ];

  // Visit Trends: clubbed by year (bold, clickable band); click a year to
  // drill into its periods — months normally, or per-date when the range is
  // small enough that the data is bucketed daily. Counts (Completed/Cancelled/
  // No-Show) are summed; Unique Patients shows only on leaf rows since summing
  // distinct patients across periods would double-count.
  const VT_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const toggleVTYear = (y: string) => setExpandedVTYears((prev) => {
    const next = new Set(prev);
    if (next.has(y)) next.delete(y); else next.add(y);
    return next;
  });
  const vtPeriodLabel = (period: string, year: string) => {
    if (period.length === 10) { const [, m, dd] = period.split("-"); return `${VT_MONTH_ABBR[Number(m) - 1] || m} ${Number(dd)}, ${year}`; }
    if (period.length === 7) { const m = period.slice(5, 7); return `${VT_MONTH_ABBR[Number(m) - 1] || m} ${year}`; }
    return period;
  };
  const visitTrendsTable = (() => {
    const items = visitTrends as any[];
    const byYear: Record<string, { completed: number; cancelled: number; noShow: number; items: any[] }> = {};
    for (const v of items) {
      const period = String(v.period || "");
      const year = period.slice(0, 4);
      if (!year) continue;
      if (!byYear[year]) byYear[year] = { completed: 0, cancelled: 0, noShow: 0, items: [] };
      byYear[year].completed += Number(v.completed || 0);
      byYear[year].cancelled += Number(v.cancelled || 0);
      byYear[year].noShow += Number(v.noShow || 0);
      byYear[year].items.push(v);
    }
    const rows: Record<string, React.ReactNode>[] = [];
    for (const y of Object.keys(byYear).sort()) {
      const yd = byYear[y];
      const isOpen = expandedVTYears.has(y);
      rows.push({
        __group: true,
        period: (
          <button onClick={() => toggleVTYear(y)} className="flex items-center gap-1.5 font-bold" style={{ color: T.textPrimary }}>
            <ChevronDown size={12} style={{ transform: isOpen ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />
            {y}
          </button>
        ),
        completed: formatNum(yd.completed), cancelled: formatNum(yd.cancelled), noShow: formatNum(yd.noShow),
        // True distinct patients for the year (a patient across months counted once).
        unique: (charts?.visitTrendsYearlyUnique?.[y] != null ? formatNum(Number(charts.visitTrendsYearlyUnique[y])) : "—"),
      });
      if (isOpen) {
        const sorted = [...yd.items].sort((a, b) => String(a.period).localeCompare(String(b.period)));
        for (const v of sorted) {
          rows.push({
            period: <span style={{ paddingLeft: 22 }}>{vtPeriodLabel(String(v.period), y)}</span>,
            completed: formatNum(v.completed), cancelled: formatNum(v.cancelled),
            noShow: formatNum(v.noShow), unique: formatNum(v.uniquePatients),
          });
        }
      }
    }
    return {
      columns: [
        { key: "period", label: "Year", align: "left" as const },
        { key: "completed", label: "Completed", align: "right" as const },
        { key: "cancelled", label: "Cancelled", align: "right" as const },
        { key: "noShow", label: "No-Show", align: "right" as const },
        { key: "unique", label: "Unique Patients", align: "right" as const },
      ], rows,
    };
  })();

  // Visits by Specialty (donut): specialty, consults, % of total + total row.
  const specialtyTable = (() => {
    const items = (charts?.specialtyTreemap || []) as { name: string; value: number; uniquePatients?: number }[];
    const total = items.reduce((s, i) => s + Number(i.value || 0), 0);
    const rows: Record<string, React.ReactNode>[] = items.map((i) => ({
      name: i.name, value: formatNum(i.value),
      unique: formatNum(Number(i.uniquePatients) || 0),
      pct: total > 0 ? `${Math.round((Number(i.value) / total) * 100)}%` : "0%",
    }));
    // Total unique uses the true distinct KPI (a patient can span specialties).
    rows.push({ __group: true, name: "Total", value: formatNum(total), unique: formatNum(Number(kpis?.uniquePatients) || 0), pct: "100%" });
    return {
      columns: [
        { key: "name", label: "Specialty", align: "left" as const },
        { key: "value", label: "Consults", align: "right" as const },
        { key: "unique", label: "Unique Patients", align: "right" as const },
        { key: "pct", label: "% of Total", align: "right" as const },
      ], rows,
    };
  })();

  // Clinic Utilization: crosstab location × specialty (+ per-row & grand totals).
  const locationTable = (() => {
    const specs = stackSpecialties;
    const data = locationBySpecialtyData as any[];
    const colTotals: Record<string, number> = {};
    const rows: Record<string, React.ReactNode>[] = data.map((r) => {
      const row: Record<string, React.ReactNode> = { location: r.location };
      let rowTotal = 0;
      for (const s of specs) { const v = Number(r[s]) || 0; row[s] = formatNum(v); colTotals[s] = (colTotals[s] || 0) + v; rowTotal += v; }
      row.__rowtotal = formatNum(rowTotal);
      row.__unique = formatNum(Number(r.uniquePatients) || 0);
      return row;
    });
    const grand = Object.values(colTotals).reduce((a, b) => a + b, 0);
    const totalRow: Record<string, React.ReactNode> = { __group: true, location: "Total" };
    for (const s of specs) totalRow[s] = formatNum(colTotals[s] || 0);
    totalRow.__rowtotal = formatNum(grand);
    // Total distinct patients across all clinics (not the column sum — a patient
    // seen at multiple clinics is counted once); use the headline KPI.
    totalRow.__unique = formatNum(Number(kpis?.uniquePatients) || 0);
    rows.push(totalRow);
    return {
      columns: [
        { key: "location", label: "Location", align: "left" as const },
        ...specs.map((s) => ({ key: s, label: s, align: "right" as const })),
        { key: "__rowtotal", label: "Total Consults", align: "right" as const },
        { key: "__unique", label: "Unique Patients", align: "right" as const },
      ], rows,
    };
  })();

  // Category Radar: booked vs completed per category + completion %.
  const radarTable = (() => {
    const items = radarData as { category: string; booked: number; completed: number }[];
    const rows: Record<string, React.ReactNode>[] = items.map((i) => ({
      category: i.category, booked: formatNum(i.booked), completed: formatNum(i.completed),
      rate: i.booked > 0 ? `${Math.round((i.completed / i.booked) * 100)}%` : "—",
    }));
    const tb = items.reduce((s, i) => s + Number(i.booked || 0), 0);
    const tc = items.reduce((s, i) => s + Number(i.completed || 0), 0);
    rows.push({ __group: true, category: "Total", booked: formatNum(tb), completed: formatNum(tc), rate: tb > 0 ? `${Math.round((tc / tb) * 100)}%` : "—" });
    return {
      columns: [
        { key: "category", label: "Category", align: "left" as const },
        { key: "booked", label: "Booked", align: "right" as const },
        { key: "completed", label: "Completed", align: "right" as const },
        { key: "rate", label: "Completion %", align: "right" as const },
      ], rows,
    };
  })();

  // Capacity vs Booked vs Completed: plain numeric table (the card's default
  // view is the interactive sortable+bars table) with a grand-total row.
  const capacityTableData = (() => {
    const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
    const rows: Record<string, React.ReactNode>[] = (capacityData as any[]).map((d) => ({
      specialty: d.specialty,
      capacity: formatNum(d.capacity), booked: formatNum(d.booked), completed: formatNum(d.completed),
      util: `${pct(d.booked, d.capacity)}%`,
    }));
    const tc = capacityData.reduce((s, d) => s + d.capacity, 0);
    const tb = capacityData.reduce((s, d) => s + d.booked, 0);
    const tcomp = capacityData.reduce((s, d) => s + d.completed, 0);
    rows.push({ __group: true, specialty: "Total", capacity: formatNum(tc), booked: formatNum(tb), completed: formatNum(tcomp), util: `${pct(tb, tc)}%` });
    return {
      columns: [
        { key: "specialty", label: "Specialty", align: "left" as const },
        { key: "capacity", label: "Capacity", align: "right" as const },
        { key: "booked", label: "Booked", align: "right" as const },
        { key: "completed", label: "Completed", align: "right" as const },
        { key: "util", label: "Utilization %", align: "right" as const },
      ], rows,
    };
  })();

  // Repeat Visit Trends: one row per period.
  const repeatTrendsTable = {
    columns: [
      { key: "label", label: "Period", align: "left" as const },
      { key: "repeatVisits", label: "Repeat Visits", align: "right" as const },
      { key: "repeatPatients", label: "Repeat Patients", align: "right" as const },
    ],
    rows: (repeatTrendData as any[]).map((r) => ({
      label: r.label, repeatVisits: formatNum(r.repeatVisits), repeatPatients: formatNum(r.repeatPatients),
    })),
  };

  // Consult Distribution (bubble): ALL specialties as rows, gender as columns,
  // with a location dropdown that re-aggregates the table. (The chart still
  // shows one specialty at a time; the table gives the full picture.)
  const bubbleTable = (() => {
    const bySpec = (charts?.bubbleBySpecialty || {}) as Record<string, { location: string; male: number; female: number; total: number }[]>;
    const specs = (charts?.bubbleSpecialties as string[]) || Object.keys(bySpec);
    // Distinct locations across every specialty for the dropdown.
    const locSet = new Set<string>();
    for (const arr of Object.values(bySpec)) for (const b of arr) locSet.add(b.location);
    const locations = Array.from(locSet).sort();
    const inLoc = (b: { location: string }) => bubbleTableLoc === "all" || b.location === bubbleTableLoc;

    let tm = 0, tf = 0, tt = 0;
    const rows: Record<string, React.ReactNode>[] = specs.map((sp) => {
      const arr = (bySpec[sp] || []).filter(inLoc);
      const male = arr.reduce((s, b) => s + Number(b.male || 0), 0);
      const female = arr.reduce((s, b) => s + Number(b.female || 0), 0);
      const total = male + female;
      tm += male; tf += female; tt += total;
      return { __sp: sp, specialty: sp, male, female, total };
    })
      .filter((r) => (r.total as number) > 0)
      .sort((a, b) => (b.total as number) - (a.total as number))
      .map((r) => ({ specialty: r.specialty, male: formatNum(r.male as number), female: formatNum(r.female as number), total: formatNum(r.total as number) }));
    rows.push({ __group: true, specialty: "Total", male: formatNum(tm), female: formatNum(tf), total: formatNum(tt) });

    const controls = (
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[12px] font-medium" style={{ color: T.textMuted }}>Location</span>
        <select
          value={bubbleTableLoc}
          onChange={(e) => setBubbleTableLoc(e.target.value)}
          className="h-8 px-2 rounded-lg border text-[12px] bg-white outline-none"
          style={{ borderColor: T.border, color: T.textPrimary }}
        >
          <option value="all">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
    );

    return {
      columns: [
        { key: "specialty", label: "Specialty", align: "left" as const },
        { key: "male", label: "Male", align: "right" as const },
        { key: "female", label: "Female", align: "right" as const },
        { key: "total", label: "Total", align: "right" as const },
      ],
      rows,
      controls,
    };
  })();

  // Peak Hours: crosstab weekday × hour (only hours with any activity), with
  // per-row and grand totals.
  const peakHoursTable = (() => {
    const data = (charts?.peakHours?.data || []) as [number, number, number][];
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const matrix: number[][] = DAYS.map(() => new Array(24).fill(0));
    const hourTotals = new Array(24).fill(0);
    for (const cell of data) {
      const h = cell[0], d = cell[1], c = cell[2];
      if (matrix[d] !== undefined && h >= 0 && h < 24) { matrix[d][h] += c; hourTotals[h] += c; }
    }
    const activeHours = Array.from({ length: 24 }, (_, h) => h).filter((h) => hourTotals[h] > 0);
    const hourLabel = (h: number) => { const ampm = h < 12 ? "AM" : "PM"; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr} ${ampm}`; };
    const rows: Record<string, React.ReactNode>[] = DAYS.map((dn, d) => {
      const row: Record<string, React.ReactNode> = { day: dn };
      let t = 0;
      for (const h of activeHours) { const v = matrix[d][h]; row[`h${h}`] = v ? formatNum(v) : "—"; t += v; }
      row.__rowtotal = formatNum(t);
      return row;
    });
    const totalRow: Record<string, React.ReactNode> = { __group: true, day: "Total" };
    let grand = 0;
    for (const h of activeHours) { totalRow[`h${h}`] = formatNum(hourTotals[h]); grand += hourTotals[h]; }
    totalRow.__rowtotal = formatNum(grand);
    rows.push(totalRow);
    return {
      columns: [
        { key: "day", label: "Weekday", align: "left" as const },
        ...activeHours.map((h) => ({ key: `h${h}`, label: hourLabel(h), align: "right" as const })),
        { key: "__rowtotal", label: "Total", align: "right" as const },
      ], rows,
    };
  })();

  return (
    <>
    <div className="animate-stagger space-y-6 relative">
      {isValidating && !isLoading && (
        <div className="absolute inset-0 z-50 flex items-start justify-center pt-40 bg-white/40 backdrop-blur-[1px] rounded-2xl">
          <div className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-white shadow-lg border" style={{ borderColor: T.border }}>
            <div className="h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium" style={{ color: T.textSecondary }}>Updating data...</span>
          </div>
        </div>
      )}
      {/* ── Filters + Actions Bar ── */}
      <div
        data-walkthrough="filter-bar"
        className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
      >
        <div className="inline-flex items-center gap-1">
          <div className="inline-flex items-center gap-1 h-9 px-2 rounded-lg border bg-white" style={{ borderColor: T.border }}>
            <CalendarDays size={13} style={{ color: T.textMuted }} />
            <input
              type="date"
              value={format(dateRange.from, "yyyy-MM-dd")}
              min={dateMin}
              max={format(dateRange.to, "yyyy-MM-dd")}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                let d = new Date(v + "T00:00:00");
                if (isNaN(d.getTime())) return;
                // Clamp to the tenant date floor if one is in effect.
                if (dateMinTs && d.getTime() < dateMinTs) d = new Date(dateMinTs);
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
              min={
                // End date must sit at or after both the tenant floor
                // and the currently-picked start date.
                dateMinTs && dateRange.from.getTime() < dateMinTs
                  ? dateMin!
                  : format(dateRange.from, "yyyy-MM-dd")
              }
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                let d = new Date(v + "T00:00:00");
                if (isNaN(d.getTime())) return;
                if (dateMinTs && d.getTime() < dateMinTs) d = new Date(dateMinTs);
                const from = d < dateRange.from ? d : dateRange.from;
                setDateRange({ from, to: d });
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
        <FilterMultiSelect label="Relationship" options={filterOptions.relations} selected={pageFilters.relations} onChange={(v) => setPageFilters((p) => ({ ...p, relations: v }))} />
        {/* Shift: derived from consult_hour (General = 8 AM–8 PM, Night = the
            rest). Static options; empty = All shifts. */}
        <FilterMultiSelect label="Shift" options={["General", "Night"]} selected={pageFilters.shifts} onChange={(v) => setPageFilters((p) => ({ ...p, shifts: v }))} />


        <div className="flex-1" />
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  try {
                    const freshUrl = utilizationUrl ? utilizationUrl + (utilizationUrl.includes("?") ? "&" : "?") + "nocache=1" : null;
                    if (freshUrl) {
                      const res = await fetch(freshUrl);
                      if (res.ok) {
                        const data = await res.json();
                        refreshData(data, { revalidate: false });
                        setShowRefreshToast(true);
                        setTimeout(() => setShowRefreshToast(false), 3000);
                      }
                    }
                  } finally {
                    setIsRefreshing(false);
                  }
                }}
                disabled={isRefreshing}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors"
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
          pageSlug="/portal/ohc/utilization"
          pageTitle="OHC Utilisation"
          charts={[
            { id: "totalBooked", label: "Total Booked KPI" },
            { id: "totalConsults", label: "Total Completed Consults KPI" },
            { id: "uniquePatients", label: "Unique Patients KPI" },
            { id: "repeatPatients", label: "Repeat Patients KPI" },
            { id: "demographicBreakdown", label: "Demographic Consult Breakdown" },
            { id: "locationBySpecialty", label: "Clinic Utilization by Location & Specialty" },
            { id: "visitTrends", label: "Visit Trends" },
            { id: "specialtyDonut", label: "Visits by Specialty" },
            { id: "bubbleChart", label: "Consult Distribution by Specialty & Location" },
            { id: "categoryRadar", label: "Category Radar" },
            { id: "serviceCategoryMatrix", label: "Service Category Matrix" },
            { id: "peakHours", label: "Peak Consultation Hours" },
            { id: "repeatTrends", label: "Repeat Visit Trends" },
            { id: "capacityBookedCompleted", label: "Capacity vs Booked vs Completed" },
          ]}
          filters={["location", "gender", "ageGroup", "specialty", "relationship"]}
          onPreview={setPreviewConfig}
          isPreview={isPreview}
        />
        <PageDownload pageTitle="OHC Utilization" />
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

      {/* Failed-query banner.
          Internal roles (SUPER_ADMIN / INTERNAL_OPS) see every failure
          for debuggability. External roles (KAM / CLIENT_*) only see a
          warning if the failed query feeds a chart that's currently
          visible to them — a failure on a query whose chart is hidden
          by published config is noise they can't act on. */}
      {(() => {
        if (!utilizationData?.meta?.hadErrors) return null;
        const failed: string[] = utilizationData.meta.failedQueries || [];
        if (failed.length === 0) return null;
        const isInternal = user?.role === "SUPER_ADMIN" || user?.role === "INTERNAL_OPS";
        // Map each API query tag → the chart ID(s) it powers. Filter
        // dropdowns and unmapped tags fall through to the internal-only
        // bucket since they have no chart to gate on.
        const QUERY_CHART_MAP: Record<string, string[]> = {
          kpi: ["totalConsults", "uniquePatients", "repeatPatients"],
          kpiYoY: ["totalConsults", "uniquePatients", "repeatPatients"],
          kpiPoP: ["totalConsults", "uniquePatients", "repeatPatients"],
          specialtyTreemap: ["specialtyDonut"],
          locSpec: ["locationBySpecialty"],
          demographics: ["demographicBreakdown"],
          peakHours: ["peakHours"],
          visitTrends: ["visitTrends"],
          repeatTrends: ["repeatTrends"],
          bubble: ["bubbleChart"],
          serviceCategories: ["categoryRadar", "serviceCategoryMatrix"],
          serviceCategoryLineItems: ["serviceCategoryMatrix"],
        };
        const visibleFailures = isInternal
          ? failed
          : failed.filter((tag) => {
              const charts = QUERY_CHART_MAP[tag];
              // Unmapped tags (e.g. filterLocations) — external roles
              // don't need to know; suppress.
              if (!charts) return false;
              return charts.some((id) => isChartVisible(id));
            });
        if (visibleFailures.length === 0) return null;
        return (
          <div
            className="mb-4 flex items-start gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: "#fde68a", background: "#fffbeb", color: "#78350f" }}
            role="status"
            aria-live="polite"
          >
            <svg className="mt-0.5 h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="text-[12.5px] leading-5">
              <strong className="font-semibold">Some charts could not load live data.</strong>{" "}
              The warehouse returned errors for:{" "}
              <span className="font-mono text-[11.5px]">{visibleFailures.join(", ")}</span>.{" "}
              Hit the refresh button above to retry; affected charts will render as zero until the retry succeeds.
            </div>
          </div>
        );
      })()}

      {/* ── Page Header + AI Summary (Blue Box) ── */}
      <PageGlanceBox
        pageTitle="OHC Utilization"
        pageSubtitle="Onsite health center consultation analytics and utilization metrics"
        kpis={kpis || {}}
        fallbackSummary={`OHC saw ${formatNum(kpis?.totalConsults || 0)} consultations from ${formatNum(kpis?.uniquePatients || 0)} unique employees across ${kpis?.locationCount || 0} clinics. ${kpis?.repeatRate || 0}% of them came back for at least one repeat visit.`}
        fallbackChips={[
          { label: "Total Completed Consults", value: formatNum(kpis?.totalConsults || 0) },
          { label: "Unique Patients", value: formatNum(kpis?.uniquePatients || 0) },
          { label: "Repeat Rate", value: `${kpis?.repeatRate || 0}%` },
        ]}
      />

      {/* ══ DELETED PREVIEW REGISTRY — START DELETE ══ */}
      {false && (() => {
        const visibleIds = getVisibleChartIds();
        const kpiIds = ["totalConsults", "uniquePatients", "repeatPatients"];
        const visibleKpis = visibleIds.filter((id) => kpiIds.includes(id));
        const visibleCharts = visibleIds.filter((id) => !kpiIds.includes(id));
        const chartCount = visibleCharts.length;
        // Auto grid for charts: 1=full, 2=50%, 3+=2-col
        const chartCols = chartCount === 1 ? 1 : 2;
        const chartRegistry: Record<string, React.ReactNode> = {
          totalConsults: (
            <div className="bg-white rounded-2xl p-6 border h-full" style={{ borderColor: T.border, boxShadow: T.cardShadow }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Completed Consults</p>
              <p className="text-[36px] font-extrabold mt-2 leading-none tracking-[-0.02em]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.totalConsults || 0)}</p>
              {kpis?.yoyConsults != null && <p className="text-xs mt-1.5 font-semibold" style={{ color: kpis.yoyConsults >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyConsults >= 0 ? "+" : ""}{kpis.yoyConsults}% vs Last Year</p>}
            </div>
          ),
          uniquePatients: (
            <div className="bg-white rounded-2xl p-6 border h-full" style={{ borderColor: T.border, boxShadow: T.cardShadow }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Unique Patients</p>
              <p className="text-[36px] font-extrabold mt-2 leading-none tracking-[-0.02em]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.uniquePatients || 0)}</p>
              {kpis?.yoyUnique != null && <p className="text-xs mt-1.5 font-semibold" style={{ color: kpis.yoyUnique >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyUnique >= 0 ? "+" : ""}{kpis.yoyUnique}% vs Last Year</p>}
            </div>
          ),
          repeatPatients: (
            <div className="bg-white rounded-2xl p-6 border h-full" style={{ borderColor: T.border, boxShadow: T.cardShadow }}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Repeat Patients</p>
              <p className="text-[36px] font-extrabold mt-2 leading-none tracking-[-0.02em]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.repeatPatients || 0)}</p>
              {kpis?.yoyRepeat != null && <p className="text-xs mt-1.5 font-semibold" style={{ color: kpis.yoyRepeat >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyRepeat >= 0 ? "+" : ""}{kpis.yoyRepeat}% vs Last Year</p>}
            </div>
          ),
          demographicBreakdown: (
            <CVCard accentColor="#4f46e5" title="Demographic Consult Breakdown" subtitle="Volume by age & gender" chartId="demographicBreakdown" chartData={charts?.demographicSunburst} chartTitle="Demographic Consult Breakdown" chartDescription="Sunburst chart">
              <div style={{ height: 360, position: "relative" }}>
                <ReactECharts ref={sunburstRef} option={sunburstOption} style={{ height: "100%", width: "100%" }} />
              </div>
            </CVCard>
          ),
          locationBySpecialty: (
            <CVCard accentColor="#4f46e5" title="Clinic Utilization by Location & Specialty" subtitle="Volume by clinic & specialty" chartId="locationBySpecialty" chartData={charts?.locationBySpecialty} chartTitle="Clinic Utilization" chartDescription="Stacked bar">
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 mt-2">
                {(charts?.topSpecialties || []).map((spec: string, i: number) => (
                  <div key={spec} className="flex items-center gap-1">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: SPECIALTY_COLORS[spec] || TREEMAP_COLORS[i % TREEMAP_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: T.textMuted }}>{spec}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <div style={{ height: 340 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={locationBySpecialtyData} margin={{ top: 24, right: 10, left: 0, bottom: 45 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                      <XAxis dataKey="location" tick={{ fontSize: 11, fill: T.textSecondary }} interval={0} angle={-25} textAnchor="end" />
                      <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} />
                      <RechartsTooltip
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          const isOthers = label === "Others";
                          const breakdown = isOthers ? (charts?.othersBreakdown || []) : [];
                          return (
                            <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxWidth: isOthers ? 480 : 260 }}>
                              <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                              {payload.filter((p: any) => p.value > 0).map((p: any) => (
                                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
                                  <span style={{ color: p.color }}>{p.name}</span>
                                  <span style={{ fontWeight: 600 }}>{formatNum(p.value)}</span>
                                </div>
                              ))}
                              {isOthers && breakdown.length > 0 && (
                                <div style={{ borderTop: `1px solid ${T.borderLight}`, marginTop: 6, paddingTop: 6 }}>
                                  <div style={{ fontWeight: 600, fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Includes {breakdown.length} locations:</div>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                                    {breakdown.map((b: any) => (
                                      <div key={b.location} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 10 }}>
                                        <span style={{ color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.location}</span>
                                        <span style={{ fontWeight: 500, flexShrink: 0 }}>{formatNum(b.total)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      {(charts?.topSpecialties || []).map((spec: string, i: number) => (
                        <Bar key={spec} dataKey={spec} name={spec} stackId="a" fill={SPECIALTY_COLORS[spec] || TREEMAP_COLORS[i % TREEMAP_COLORS.length]} maxBarSize={50} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CVCard>
          ),
          visitTrends: (
            <CVCard accentColor="#4f46e5" title="Visit Trends" subtitle="Month-wise consultation trends" chartId="visitTrends" chartData={visitTrends} chartTitle="Visit Trends" chartDescription="Trend lines" dataPoints={visitTrends.map((v: { period: string }) => v.period)}>
              <div style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={visitTrends} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: T.textSecondary }} />
                    <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    <Line type="monotone" dataKey="completed" name="Completed" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#4f46e5", strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#f59e0b", strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="noShow" name="No-Show" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#ef4444", strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="uniquePatients" name="Unique Patients" stroke="#0d9488" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#fff", stroke: "#0d9488", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CVCard>
          ),
          specialtyDonut: (
            <CVCard accentColor="#4f46e5" title="Visits by Specialty" subtitle="Proportional distribution" chartId="specialtyDonut" chartData={charts?.specialtyTreemap} chartTitle="Visits by Specialty" chartDescription="Donut chart">
              <div style={{ height: 340 }}>
                <ReactECharts style={{ height: "100%", width: "100%" }} option={treemapOption} />
              </div>
            </CVCard>
          ),
          categoryRadar: (
            <CVCard accentColor="#0d9488" title="Category Radar" subtitle="Booked vs Completed — non-consultation services" chartId="categoryRadar" chartData={radarData} chartTitle="Category Radar" chartDescription="Radar chart">
              <div style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                    <PolarGrid stroke="#E5E7EB" gridType="polygon" />
                    <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: T.textPrimary, fontWeight: 500 }} />
                    <PolarRadiusAxis tick={{ fontSize: 11, fill: T.textSecondary }} angle={30} domain={[0, "auto"]} />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                    <Radar name="Booked" dataKey="booked" stroke="#4f46e5" fill="none" strokeWidth={2.5} dot={{ r: 4, fill: "#4f46e5" }} />
                    <Radar name="Completed" dataKey="completed" stroke="#0d9488" fill="rgba(13,148,136,0.12)" strokeWidth={2.5} dot={{ r: 4, fill: "#0d9488" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CVCard>
          ),
          serviceCategoryMatrix: (
            <CVCard accentColor="#0d9488" title="Service Category Matrix" subtitle="Booked vs completed across categories" chartId="serviceCategoryMatrix" chartData={serviceCategories} chartTitle="Service Category Matrix" chartDescription="Table">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b" style={{ borderColor: T.border }}>
                      <th className="text-left py-2 px-3 font-semibold" style={{ color: T.textMuted }}>Category</th>
                      <th className="text-right py-2 px-3 font-semibold" style={{ color: T.textMuted }}>Booked</th>
                      <th className="text-right py-2 px-3 font-semibold" style={{ color: T.textMuted }}>Completed</th>
                      <th className="text-right py-2 px-3 font-semibold" style={{ color: T.textMuted }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(serviceCategories || []).map((sc: any, idx: number) => (
                      <tr key={idx} className="border-b" style={{ borderColor: T.borderLight }}>
                        <td className="py-2 px-3 font-medium" style={{ color: T.textPrimary }}>{sc.category}</td>
                        <td className="text-right py-2 px-3" style={{ color: T.textSecondary }}>{formatNum(sc.booked)}</td>
                        <td className="text-right py-2 px-3" style={{ color: T.textSecondary }}>{formatNum(sc.completed)}</td>
                        <td className="text-right py-2 px-3 font-semibold" style={{ color: sc.booked > 0 && sc.completed / sc.booked < 0.85 ? "#e11d48" : "#059669" }}>{sc.booked > 0 ? Math.round((sc.completed / sc.booked) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CVCard>
          ),
          bubbleChart: (
            <CVCard accentColor="#4f46e5" title="Consult Distribution by Specialty & Location" subtitle="Bubble chart" chartId="bubbleChart" chartData={bubbleData} chartTitle="Consult Distribution" chartDescription="Bubble scatter">
              <div style={{ height: 400, overflowX: "auto" }}>
                <ReactECharts style={{ height: "100%", width: "100%" }} option={bubbleOption} />
              </div>
            </CVCard>
          ),
          peakHours: (
            <CVCard accentColor="#4f46e5" title="Peak Consultation Hours" subtitle="Hourly footfall heatmap by weekday" chartId="peakHours" chartData={charts?.peakHours} chartTitle="Peak Hours" chartDescription="Heatmap">
              <div style={{ height: 400, overflowX: "auto" }}>
                <div>
                  <ReactECharts style={{ height: 400, width: "100%" }} option={{
                    tooltip: { backgroundColor: "#fff", borderColor: T.border, borderWidth: 1, textStyle: { fontSize: 12 }, borderRadius: 12, formatter: (p: any) => { const hours = ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"]; const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; return `${days[p.data[1]] || ""} at ${hours[p.data[0]] || ""}<br/><strong>${p.data[2]}</strong> consultations`; } },
                    grid: { left: 56, right: 32, top: 58, bottom: 48 },
                    xAxis: { type: "category", data: ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"], axisLine: { lineStyle: { color: "#E5E7EB" } }, axisTick: { show: false }, axisLabel: { fontSize: 11, color: T.textSecondary } },
                    yAxis: { type: "category", data: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], axisLine: { show: false }, axisTick: { show: false }, axisLabel: { fontSize: 12, fontWeight: 500, color: T.textSecondary } },
                    visualMap: { min: 0, max: charts?.peakHours?.max || 65, show: true, calculable: true, orient: "horizontal", top: 8, left: "center", itemWidth: 16, itemHeight: 320, inRange: { color: ["#eef2ff","#c7d2fe","#818cf8","#6366f1","#4f46e5","#3730a3"] } },
                    series: [{ type: "heatmap", data: charts?.peakHours?.data || [], itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 6 } }],
                  }} />
                </div>
              </div>
            </CVCard>
          ),
          repeatTrends: (
            <CVCard accentColor="#e11d48" title="Repeat Visit Trends" subtitle="Repeat visits and patients over time" chartId="repeatTrends" chartData={repeatTrendData} chartTitle="Repeat Visit Trends" chartDescription="Line chart">
              <div style={{ height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={repeatTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.textSecondary }} />
                    <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                    <Line type="monotone" dataKey="repeatVisits" name="Repeat Visits" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#e11d48", strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="repeatPatients" name="Repeat Patients" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#fff", stroke: "#8b5cf6", strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CVCard>
          ),
        };
        return (
          <div className="space-y-4">
            {/* KPI row — equal height, auto-adjusts columns */}
            {visibleKpis.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${visibleKpis.length}, 1fr)`, gap: 16, alignItems: "stretch" }}>
                {visibleKpis.map((id) => (
                  <div key={id} style={{ display: "flex" }}>
                    <div style={{ flex: 1 }}>{chartRegistry[id]}</div>
                  </div>
                ))}
              </div>
            )}
            {/* Chart grid — equal height rows, auto-adjusts columns */}
            {visibleCharts.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${chartCols}, 1fr)`, gap: 16 }}>
                {visibleCharts.map((id) => (
                  <div key={id} style={{ overflow: "hidden", minWidth: 0 }}>{chartRegistry[id]}</div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── KPI Cards (auto-adjust columns) ── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${[isChartVisible("totalBooked"), isChartVisible("totalConsults"), isChartVisible("uniquePatients"), isChartVisible("repeatPatients")].filter(Boolean).length || 1}, 1fr)` }}>
        {isChartVisible("totalBooked") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
          <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Booked</p>
              <Tooltip><TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger><TooltipContent className="text-xs max-w-xs">Appointments booked in the selected range — Completed, No Show and Pending. Cancelled appointments are excluded. Counts appointment rows (not consult volume).</TooltipContent></Tooltip>
            </div>
            <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.totalBooked || 0)}</p>
            {kpis?.yoyBooked != null ? (
              <div className="flex items-center gap-1 mt-1.5">
                {kpis.yoyBooked >= 0 ? <TrendingUp size={12} style={{ color: "#059669" }} /> : <TrendingDown size={12} style={{ color: "#e11d48" }} />}
                <span className="text-xs font-semibold" style={{ color: kpis.yoyBooked >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyBooked >= 0 ? "+" : ""}{kpis.yoyBooked}% {kpis.yoyLabel || "vs Last Year"}</span>
              </div>
            ) : kpis?.hasInsufficientHistory ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider cursor-help" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>First Reporting Year</span>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">This is your first full reporting year on Habit Intelligence. Year-over-year comparisons will appear once we have prior-year data.</TooltipContent>
              </Tooltip>
            ) : null}
            <p className="text-xs mt-2" style={{ color: T.textSecondary }}>All booked appointments</p>
            <div className="mt-auto pt-4">
              <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>{(() => {
                const tb = Number(kpis?.totalBooked || 0);
                const cancelled = Number(kpis?.cancelled || 0);
                if (tb === 0) return "No appointments booked in this range yet.";
                return `Total bookings · ${formatNum(tb)} · ${formatNum(cancelled)} cancelled`;
              })()}</p>
            </div>
          </div>
        </div>}

        {isChartVisible("totalConsults") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
          <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total Completed Consults</p>
              <Tooltip><TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger><TooltipContent className="text-xs max-w-xs">Completed OHC consultations in the selected range. Cancellations and no-shows are excluded.</TooltipContent></Tooltip>
            </div>
            <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.totalConsults || 0)}</p>
            {kpis?.yoyConsults != null ? (
              <div className="flex items-center gap-1 mt-1.5">
                {kpis.yoyConsults >= 0 ? <TrendingUp size={12} style={{ color: "#059669" }} /> : <TrendingDown size={12} style={{ color: "#e11d48" }} />}
                <span className="text-xs font-semibold" style={{ color: kpis.yoyConsults >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyConsults >= 0 ? "+" : ""}{kpis.yoyConsults}% {kpis.yoyLabel || "vs Last Year"}</span>
              </div>
            ) : kpis?.hasInsufficientHistory ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider cursor-help" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>First Reporting Year</span>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">This is your first full reporting year on Habit Intelligence. Year-over-year comparisons will appear once we have prior-year data.</TooltipContent>
              </Tooltip>
            ) : null}
            <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Completed visits</p>
            <div className="mt-auto pt-4">
              <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>{(() => {
                const tc = Number(kpis?.totalConsults || 0);
                const up = Number(kpis?.uniquePatients || 0);
                const lc = Number(kpis?.locationCount || 0);
                if (tc === 0 || up === 0) return "No completed consultations in this range yet.";
                const avg = (tc / up).toFixed(1);
                return `${avg} visits/patient · ${formatNum(lc)} clinics`;
              })()}</p>
            </div>
          </div>
        </div>}

        {isChartVisible("uniquePatients") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
          <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Unique Patients</p>
              <Tooltip><TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger><TooltipContent className="text-xs max-w-xs">Distinct patients (by UHID) with at least one completed consultation in the range. Total Completed Consults ÷ Unique Patients gives the average visits per patient.</TooltipContent></Tooltip>
            </div>
            <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.uniquePatients || 0)}</p>
            {kpis?.yoyUnique != null ? (
              <div className="flex items-center gap-1 mt-1.5">
                {kpis.yoyUnique >= 0 ? <TrendingUp size={12} style={{ color: "#059669" }} /> : <TrendingDown size={12} style={{ color: "#e11d48" }} />}
                <span className="text-xs font-semibold" style={{ color: kpis.yoyUnique >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyUnique >= 0 ? "+" : ""}{kpis.yoyUnique}% {kpis.yoyLabel || "vs Last Year"}</span>
              </div>
            ) : kpis?.hasInsufficientHistory ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider cursor-help" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>First Reporting Year</span>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">This is your first full reporting year on Habit Intelligence. Year-over-year comparisons will appear once we have prior-year data.</TooltipContent>
              </Tooltip>
            ) : null}
            <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Distinct patients</p>
            <div className="mt-auto pt-4">
              <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>{(() => {
                const up = Number(kpis?.uniquePatients || 0);
                const rr = Number(kpis?.repeatRate || 0);
                if (up === 0) return "No unique patients in this range yet.";
                return `${rr}% returned for another visit`;
              })()}</p>
            </div>
          </div>
        </div>}

        {isChartVisible("repeatPatients") && <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
          <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Repeat Patients</p>
              <Tooltip><TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger><TooltipContent className="text-xs max-w-xs">Patients with two or more completed consultations inside the selected range.</TooltipContent></Tooltip>
            </div>
            <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.repeatPatients || 0)}</p>
            {kpis?.yoyRepeat != null ? (
              <div className="flex items-center gap-1 mt-1.5">
                {kpis.yoyRepeat >= 0 ? <TrendingUp size={12} style={{ color: "#059669" }} /> : <TrendingDown size={12} style={{ color: "#e11d48" }} />}
                <span className="text-xs font-semibold" style={{ color: kpis.yoyRepeat >= 0 ? "#059669" : "#e11d48" }}>{kpis.yoyRepeat >= 0 ? "+" : ""}{kpis.yoyRepeat}% {kpis.yoyLabel || "vs Last Year"}</span>
              </div>
            ) : kpis?.hasInsufficientHistory ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider cursor-help" style={{ backgroundColor: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>First Reporting Year</span>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">This is your first full reporting year on Habit Intelligence. Year-over-year comparisons will appear once we have prior-year data.</TooltipContent>
              </Tooltip>
            ) : null}
            <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Returning patients</p>
            <div className="mt-auto pt-4">
              <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>{(() => {
                const tc = Number(kpis?.totalConsults || 0);
                const up = Number(kpis?.uniquePatients || 0);
                const rp = Number(kpis?.repeatPatients || 0);
                if (rp === 0) return "No returning patients in this range yet.";
                const visitsFromRepeats = tc - (up - rp);
                if (visitsFromRepeats <= 0) return "No returning-patient visits in this range yet.";
                const avg = (visitsFromRepeats / rp).toFixed(1);
                return `Avg ${avg} visits per returning patient`;
              })()}</p>
            </div>
          </div>
        </div>}
      </div>

      {/* ── Section: Demographics + Location (Warm) ── */}
      {(isChartVisible("demographicBreakdown") || isChartVisible("locationBySpecialty")) && <WarmSection>
        <AccentBar color="#4f46e5" colorEnd="#6366f1" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Demographics & Location</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Consultation breakdown by age, gender, and location</p>

        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${[isChartVisible("demographicBreakdown"), isChartVisible("locationBySpecialty")].filter(Boolean).length || 1}, 1fr)` }}>
          {isChartVisible("demographicBreakdown") && <CVCard accentColor="#4f46e5" title="Demographic Consult Breakdown" subtitle="Volume by age & gender" tooltipText="Inner ring is age group; outer ring is gender. Slice size is consultation volume. Click a wedge to drill in." chartId="demographicBreakdown" chartData={charts?.demographicSunburst} chartTitle="Demographic Consult Breakdown" chartDescription="Sunburst chart showing consultation breakdown by age group and gender" tableData={demographicTableData}>
            <div ref={sunburstContainerRef} style={{ height: 360, position: "relative" }}>
              <ReactECharts
                ref={sunburstRef}
                option={sunburstOption}
                style={{ height: "100%", width: "100%" }}
                onEvents={{ click: () => setSunburstDrilled(true) }}
              />
              {sunburstSeparatorLines && (
                <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 10 }}>
                  {sunburstSeparatorLines}
                </svg>
              )}
              {sunburstDrilled && (
                <button
                  onClick={handleSunburstReset}
                  className="absolute top-2 right-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:shadow-md"
                  style={{
                    background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(79,70,229,0.25)",
                  }}
                >
                  <RotateCcw size={12} />
                  Reset
                </button>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Age Groups</span>
              {Object.entries(SUNBURST_COLORS).map(([ag, color]) => (
                <span key={ag} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: T.textSecondary }}>
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />{ag} yrs
                </span>
              ))}
              <span className="w-px h-3 mx-1" style={{ backgroundColor: T.border }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.textMuted }}>Gender Split</span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: T.textSecondary }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GENDER_COLORS.M }} />Male
              </span>
              <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: T.textSecondary }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GENDER_COLORS.F }} />Female
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {(() => {
                const total = Number(kpis?.totalConsults || 0);
                const cohort = charts?.demographicStats?.highestCohort;
                const tg = charts?.demographicStats?.topGender;
                const ta = charts?.demographicStats?.topAgeGroup;
                const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
                return (
                  <>
                    <div className="rounded-[14px] p-3.5 text-center text-white transition-transform hover:-translate-y-px" style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.04em] opacity-80">Top Cohort</p>
                      <p className="text-xl font-extrabold font-[var(--font-inter)] mt-1">{cohort ? `${cohort.ageGroup} · ${cohort.gender}` : "—"}</p>
                      <p className="text-[10px] opacity-85 font-medium mt-1">{formatNum(cohort?.count || 0)} consults · {formatNum(cohort?.patients || 0)} patients</p>
                    </div>
                    <div className="rounded-[14px] p-3.5 text-center text-white transition-transform hover:-translate-y-px" style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.04em] opacity-80">Most Consults By</p>
                      <p className="text-xl font-extrabold font-[var(--font-inter)] mt-1">{tg?.gender || "—"}</p>
                      <p className="text-[10px] opacity-85 font-medium mt-1">{formatNum(tg?.count || 0)} consults · {pct(tg?.count || 0)}% of all</p>
                    </div>
                    <div className="rounded-[14px] p-3.5 text-center text-white transition-transform hover:-translate-y-px" style={{ background: "linear-gradient(135deg, #7c3aed, #8b5cf6)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.04em] opacity-80">Top Age Group</p>
                      <p className="text-xl font-extrabold font-[var(--font-inter)] mt-1">{ta ? `${ta.ageGroup} years` : "—"}</p>
                      <p className="text-[10px] opacity-85 font-medium mt-1">{formatNum(ta?.count || 0)} consults · {pct(ta?.count || 0)}% of all</p>
                    </div>
                  </>
                );
              })()}
            </div>
            <InsightBox text={(() => {
              const cohort = charts?.demographicStats?.highestCohort;
              const total = Number(kpis?.totalConsults || 0);
              if (!cohort || total === 0) return "Pick a date range.";
              const pct = Math.round((cohort.count / total) * 100);
              return `Largest cohort: ${cohort.ageGroup} · ${cohort.gender} — ${formatNum(cohort.count)} consults (${pct}%), ${formatNum(cohort.patients)} patients.`;
            })()} />
          </CVCard>}

          {isChartVisible("locationBySpecialty") && <CVCard accentColor="#4f46e5" title="Clinic Utilization by Location & Specialty" subtitle={clinicChartMode === "specialtyOnly" ? `${locationBySpecialtyData[0]?.location || "Clinic"} — by specialty` : clinicChartMode === "heatmap" ? "Darker = more consults" : "By clinic & specialty"} tooltipText="Specialty mix per clinic. The top six specialties are shown; the rest fold into 'Other'. The view switches from single-clinic bars to a heatmap (2–4 clinics) to stacked bars (5+)." chartId="locationBySpecialty" chartData={charts?.locationBySpecialty} chartTitle="Clinic Utilization by Location & Specialty" chartDescription="Adaptive view of consult volume per location with specialty breakdown" tableData={locationTable}>
            {clinicChartMode !== "specialtyOnly" && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 mt-2">
                {stackSpecialties.map((spec: string, i: number) => (
                  <div key={spec} className="flex items-center gap-1">
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: SPECIALTY_COLORS[spec] || TREEMAP_COLORS[i % TREEMAP_COLORS.length], display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: T.textMuted }}>{spec}</span>
                  </div>
                ))}
              </div>
            )}
            {/* ── 1 clinic: horizontal specialty bar (no clinic axis) ── */}
            {clinicChartMode === "specialtyOnly" && (() => {
              const row = locationBySpecialtyData[0] || {};
              const items = stackSpecialties
                .map((spec: string, i: number) => ({
                  spec,
                  value: Number(row[spec]) || 0,
                  fill: SPECIALTY_COLORS[spec] || TREEMAP_COLORS[i % TREEMAP_COLORS.length],
                }))
                .filter((d) => d.value > 0)
                .sort((a, b) => b.value - a.value);
              const max = items[0]?.value || 1;
              const total = items.reduce((s, d) => s + d.value, 0);
              const top = items[0];
              const top3Share = total > 0 ? Math.round((items.slice(0, 3).reduce((s, d) => s + d.value, 0) / total) * 100) : 0;
              const tail = items.slice(3);
              const tailShare = total > 0 ? Math.round((tail.reduce((s, d) => s + d.value, 0) / total) * 100) : 0;
              // Bar row height auto-scales to fill the card so a CISCO-style
              // layout (1 clinic, ~6 specialties) doesn't leave whitespace
              // when matched against a multi-element card on the left.
              const barRowHeight = items.length <= 4 ? 36 : items.length <= 6 ? 30 : items.length <= 9 ? 24 : 20;
              return (
                <div className="flex flex-col flex-1 mt-2">
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Total consults</p>
                    <p className="text-[20px] font-extrabold tracking-[-0.02em]" style={{ color: "#4f46e5", fontVariantNumeric: "tabular-nums" }}>{formatNum(total)}</p>
                  </div>
                  <div className="flex flex-col gap-2 flex-1 justify-center">
                    {items.map((d) => {
                      const pct = total > 0 ? (d.value / total) * 100 : 0;
                      const clickable = d.spec === "Other";
                      const onClick = clickable ? () => { setOtherSpecSearch(""); setOtherSpecModalOpen(true); } : undefined;
                      return (
                        <div
                          key={d.spec}
                          className={`flex items-center gap-3 ${clickable ? "cursor-pointer rounded-md px-1 -mx-1 hover:bg-gray-50" : ""}`}
                          onClick={onClick}
                          title={clickable ? "Click to view specialties inside Other" : d.spec}
                        >
                          <div className="text-[12px] font-medium truncate" style={{ width: 140, color: T.textPrimary }}>{d.spec}{clickable && <span className="ml-1 text-[10px] font-semibold" style={{ color: "#4f46e5" }}>›</span>}</div>
                          <div className="flex-1 rounded-md overflow-hidden" style={{ height: barRowHeight, backgroundColor: "#F1F5F9" }}>
                            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", backgroundColor: d.fill, borderRadius: 6, transition: "width 200ms ease" }} />
                          </div>
                          <div className="text-[12px] font-bold tabular-nums" style={{ width: 60, textAlign: "right", color: T.textPrimary }}>{formatNum(d.value)}</div>
                          <div className="text-[10.5px] tabular-nums" style={{ width: 42, textAlign: "right", color: T.textMuted }}>{pct.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-center text-[12px] py-12" style={{ color: T.textMuted }}>No specialty data for this clinic in the current filter window.</p>
                  ) : (
                    /* Stat strip — mirrors the 3-tile rhythm of the demographics card on the left */
                    <div className="grid grid-cols-3 gap-2.5 mt-5">
                      <div className="rounded-xl px-3 py-3" style={{ background: "linear-gradient(135deg, #4f46e5, #6d28d9)", color: "#fff" }}>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">Top Specialty</p>
                        <p className="text-[15px] font-extrabold leading-tight tracking-[-0.01em] mt-1 truncate">{top?.spec || "—"}</p>
                        <p className="text-[10.5px] mt-0.5 opacity-90 tabular-nums">{top ? `${formatNum(top.value)} consults` : ""}</p>
                      </div>
                      <div className="rounded-xl px-3 py-3" style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)", color: "#fff" }}>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">Specialties</p>
                        <p className="text-[18px] font-extrabold leading-tight tracking-[-0.01em] mt-1 tabular-nums">{items.length}</p>
                        <p className="text-[10.5px] mt-0.5 opacity-90">with consults</p>
                      </div>
                      <div className="rounded-xl px-3 py-3" style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff" }}>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">Top 3 Share</p>
                        <p className="text-[18px] font-extrabold leading-tight tracking-[-0.01em] mt-1 tabular-nums">{top3Share}%</p>
                        <p className="text-[10.5px] mt-0.5 opacity-90 tabular-nums">{tail.length > 0 ? `others: ${tailShare}%` : "no others"}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── 2-4 clinics: heatmap + stat strip ── */}
            {clinicChartMode === "heatmap" && (() => {
              const locations = locationBySpecialtyData.map((r: any) => r.location as string);
              const cells: Array<[number, number, number]> = [];
              let maxVal = 0;
              const locTotals = new Array<number>(locations.length).fill(0);
              const specTotals = new Array<number>(stackSpecialties.length).fill(0);
              for (let li = 0; li < locations.length; li++) {
                for (let si = 0; si < stackSpecialties.length; si++) {
                  const v = Number(locationBySpecialtyData[li][stackSpecialties[si]]) || 0;
                  cells.push([si, li, v]);
                  locTotals[li] += v;
                  specTotals[si] += v;
                  if (v > maxVal) maxVal = v;
                }
              }
              const total = locTotals.reduce((s, v) => s + v, 0);
              const topLocIdx = locTotals.reduce((m, v, i) => (v > locTotals[m] ? i : m), 0);
              const topSpecIdx = specTotals.reduce((m, v, i) => (v > specTotals[m] ? i : m), 0);
              const topLoc = { name: locations[topLocIdx] || "—", count: locTotals[topLocIdx] || 0 };
              const topSpec = { name: stackSpecialties[topSpecIdx] || "—", count: specTotals[topSpecIdx] || 0 };
              return (
                <div className="flex flex-col flex-1 mt-2">
                  {/* Heatmap fills available vertical space */}
                  <div className="flex-1" style={{ minHeight: 260 }}>
                    <ReactECharts
                      style={{ height: "100%", width: "100%", minHeight: 260 }}
                      option={{
                        tooltip: {
                          position: "top",
                          backgroundColor: "#fff",
                          borderColor: T.border,
                          borderWidth: 1,
                          textStyle: { fontSize: 12, color: T.textPrimary },
                          extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
                          formatter: (p: any) => {
                            const arr = Array.isArray(p.data) ? p.data : p.data.value;
                            const [x, y, v] = arr;
                            return `<strong>${locations[y]}</strong><br/>${stackSpecialties[x]}: <strong>${formatNum(v)}</strong>`;
                          },
                        },
                        grid: { left: 8, right: 16, top: 24, bottom: 16, containLabel: true },
                        xAxis: {
                          type: "category",
                          data: stackSpecialties,
                          axisTick: { show: false },
                          axisLine: { lineStyle: { color: T.borderLight } },
                          axisLabel: { fontSize: 11, color: T.textSecondary, rotate: 25, interval: 0 },
                          splitArea: { show: false },
                        },
                        yAxis: {
                          type: "category",
                          data: locations,
                          axisTick: { show: false },
                          axisLine: { lineStyle: { color: T.borderLight } },
                          axisLabel: { fontSize: 11, color: T.textPrimary, fontWeight: 600 },
                        },
                        // Visual map drives the cell coloring but its on-canvas
                        // legend was rendering inside the grid as a stray
                        // vertical strip — show: false hides the legend, the
                        // cell numbers themselves are the legend.
                        visualMap: {
                          min: 0,
                          max: maxVal || 1,
                          show: false,
                          inRange: { color: ["#EEF2FF", "#A5B4FC", "#6366F1", "#4338CA", "#312E81"] },
                        },
                        series: [{
                          type: "heatmap",
                          // Pre-color each cell directly (skip visualMap) so
                          // we can pair each cell with a matching label color
                          // and keep numbers legible on dark cells.
                          data: cells.map(([x, y, v]) => {
                            const t = maxVal > 0 ? v / maxVal : 0;
                            // Same 5-stop palette, picked by quintile
                            const palette = ["#EEF2FF", "#A5B4FC", "#6366F1", "#4338CA", "#312E81"];
                            const fill = v === 0 ? "#F8FAFC" : palette[Math.min(palette.length - 1, Math.floor(t * palette.length))];
                            // Dark cells need white text; light cells dark text
                            const textColor = t >= 0.5 ? "#FFFFFF" : "#0F172A";
                            return {
                              value: [x, y, v],
                              itemStyle: { color: fill, borderColor: "#fff", borderWidth: 2, borderRadius: 6 },
                              label: { color: textColor },
                            };
                          }),
                          label: {
                            show: true,
                            fontSize: 10,
                            fontWeight: 700,
                            formatter: (p: any) => p.data.value[2] > 0 ? formatNum(p.data.value[2]) : "",
                          },
                          emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(79,70,229,0.4)" } },
                        }],
                      }}
                    />
                  </div>
                  {/* Stat strip — mirrors demographics card rhythm */}
                  <div className="grid grid-cols-3 gap-2.5 mt-4">
                    <div className="rounded-xl px-3 py-3" style={{ background: "linear-gradient(135deg, #4f46e5, #6d28d9)", color: "#fff" }}>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">Top Clinic</p>
                      <p className="text-[14px] font-extrabold leading-tight tracking-[-0.01em] mt-1 truncate" title={topLoc.name}>{topLoc.name}</p>
                      <p className="text-[10.5px] mt-0.5 opacity-90 tabular-nums">{formatNum(topLoc.count)} consults</p>
                    </div>
                    <div className="rounded-xl px-3 py-3" style={{ background: "linear-gradient(135deg, #0d9488, #14b8a6)", color: "#fff" }}>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">Top Specialty</p>
                      <p className="text-[14px] font-extrabold leading-tight tracking-[-0.01em] mt-1 truncate" title={topSpec.name}>{topSpec.name}</p>
                      <p className="text-[10.5px] mt-0.5 opacity-90 tabular-nums">{formatNum(topSpec.count)} consults</p>
                    </div>
                    <div className="rounded-xl px-3 py-3" style={{ background: "linear-gradient(135deg, #7c3aed, #a855f7)", color: "#fff" }}>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] opacity-80">Total</p>
                      <p className="text-[18px] font-extrabold leading-tight tracking-[-0.01em] mt-1 tabular-nums">{formatNum(total)}</p>
                      <p className="text-[10.5px] mt-0.5 opacity-90 tabular-nums">{locations.length} clinics · {stackSpecialties.length} specialties</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── 5+ clinics: existing stacked bar ── */}
            {clinicChartMode === "bar" && <div className="overflow-x-auto">
            <div style={{ height: 420, minWidth: Math.max(600, (charts?.locationBySpecialty?.length || 6) * 80) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={locationBySpecialtyData} margin={{ top: 56, right: 10, left: 0, bottom: 45 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="location" tick={{ fontSize: 11, fill: T.textSecondary }} interval={0} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} domain={[0, (dataMax: number) => { const padded = dataMax * 1.1; const mag = Math.pow(10, Math.floor(Math.log10(padded))); return Math.ceil(padded / mag) * mag; }]} />
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
                          {(() => {
                            const row = payload[0]?.payload || {};
                            const consults = Number(row.__total || 0);
                            const uniq = Number(row.uniquePatients || 0);
                            return (
                              <div style={{ borderTop: `1px solid ${T.borderLight}`, marginTop: 6, paddingTop: 6 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span style={{ color: T.textSecondary }}>Total Consults</span><span style={{ fontWeight: 700 }}>{formatNum(consults)}</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span style={{ color: "#4f46e5" }}>Unique Patients</span><span style={{ fontWeight: 700, color: "#4f46e5" }}>{formatNum(uniq)}</span></div>
                              </div>
                            );
                          })()}
                          {isOthers && breakdown.length > 0 && (
                            <div style={{ borderTop: `1px solid ${T.borderLight}`, marginTop: 6, paddingTop: 6, fontSize: 11, color: T.textSecondary }}>
                              <div><strong>{breakdown.length}</strong> locations · <strong>{formatNum(othersTotal)}</strong> consults</div>
                              <div style={{ marginTop: 4, color: T.textMuted }}>See breakdown panel below ↓</div>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {stackSpecialties.map((spec: string, i: number) => {
                    const isLast = i === stackSpecialties.length - 1;
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
                              const { x, y, width, value, index } = props;
                              const consults = Number(value);
                              if (!consults || consults <= 0) return null;
                              const uniq = Number(locationBySpecialtyData[index]?.uniquePatients || 0);
                              const line1 = formatNum(consults);
                              const line2 = `${formatNum(uniq)} patients`;
                              const cx = Number(x) + Number(width) / 2;
                              const barTop = Number(y);
                              const h = 30;
                              const gap = 8;
                              const w = Math.max(44, Math.max(line1.length, line2.length) * 5.6 + 14);
                              const rectY = barTop - h - gap;
                              return (
                                <g>
                                  <rect x={cx - w / 2} y={rectY} width={w} height={h} rx={5} ry={5} fill="#fff" stroke={T.borderLight} />
                                  {/* Total consults (top) + unique patient count (bottom, indigo). */}
                                  <text x={cx} y={rectY + 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={T.textPrimary}>{line1}</text>
                                  <text x={cx} y={rectY + 24} textAnchor="middle" fontSize={8.5} fontWeight={600} fill="#4f46e5">{line2}</text>
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
            </div>}
            {clinicChartMode === "bar" && (charts?.othersBreakdown?.length ?? 0) > 0 && (() => {
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
                      <strong style={{ color: T.textPrimary }}>Others:</strong> {list.length} smaller sites · <strong style={{ color: T.textPrimary }}>{formatNum(total)}</strong> consults
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: "#4f46e5" }}>View breakdown →</span>
                </button>
              );
            })()}
            {(charts?.otherSpecialtyBreakdown?.length ?? 0) > 0 && (() => {
              const list = charts?.otherSpecialtyBreakdown || [];
              const total = list.reduce((s: number, b: any) => s + (b.total || 0), 0);
              return (
                <button
                  onClick={() => { setOtherSpecSearch(""); setOtherSpecModalOpen(true); }}
                  className="mt-2 w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition hover:shadow-sm hover:border-indigo-300"
                  style={{ borderColor: T.border, background: "#fafafa" }}
                >
                  <div className="flex items-center gap-2 text-xs" style={{ color: T.textSecondary }}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#94a3b8" }} />
                    <span>
                      <strong style={{ color: T.textPrimary }}>Other specialties:</strong> {list.length} smaller specialties · <strong style={{ color: T.textPrimary }}>{formatNum(total)}</strong> consults
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: "#4f46e5" }}>View breakdown →</span>
                </button>
              );
            })()}
            <InsightBox text={(() => {
              const rows = (charts?.locationBySpecialty || []) as Array<Record<string, unknown>>;
              const specs = (charts?.topSpecialties || []) as string[];
              const total = Number(kpis?.totalConsults || 0);
              if (rows.length === 0 || specs.length === 0 || total === 0) return "Clinic breakdown will appear once data loads.";
              const rowTotal = (r: Record<string, unknown>) => specs.reduce((s, k) => s + (Number(r[k]) || 0), 0);
              const real = rows.filter((r) => r.location !== "Others").map((r) => ({ location: String(r.location), total: rowTotal(r) })).sort((a, b) => b.total - a.total);
              if (real.length === 0) return "Clinic breakdown will appear once data loads.";
              const top = real[0];
              const topPct = Math.round((top.total / total) * 100);
              if (real.length === 1) return `${top.location}: ${topPct}% of consults.`;
              const nextN = Math.min(4, real.length - 1);
              const nextSum = real.slice(1, 1 + nextN).reduce((s, r) => s + r.total, 0);
              const nextPct = Math.round((nextSum / total) * 100);
              return `${top.location}: ${topPct}% of consults · next ${nextN} sites: ${nextPct}%.`;
            })()} />
          </CVCard>}
        </div>
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
                    <strong>{list.length}</strong> smaller sites grouped · <strong>{formatNum(total)}</strong> total consults
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
        <Dialog open={otherSpecModalOpen} onOpenChange={setOtherSpecModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Other — Specialty Breakdown</DialogTitle>
            </DialogHeader>
            {(() => {
              const list = charts?.otherSpecialtyBreakdown || [];
              const total = list.reduce((s: number, b: any) => s + (b.total || 0), 0);
              const q = otherSpecSearch.trim().toLowerCase();
              const filtered = q ? list.filter((b: any) => b.specialty.toLowerCase().includes(q)) : list;
              return (
                <>
                  <div className="text-xs mb-3" style={{ color: T.textSecondary }}>
                    <strong>{list.length}</strong> smaller specialties grouped · <strong>{formatNum(total)}</strong> total consults
                  </div>
                  <Input placeholder="Search specialty…" value={otherSpecSearch} onChange={(e) => setOtherSpecSearch(e.target.value)} className="mb-3" />
                  <ScrollArea className="h-[360px] pr-3">
                    <div className="space-y-1">
                      {filtered.map((b: any) => {
                        const pct = total > 0 ? (b.total / total) * 100 : 0;
                        return (
                          <div key={b.specialty} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                            <span className="truncate" style={{ color: T.textSecondary }} title={b.specialty}>{b.specialty}</span>
                            <span className="flex items-center gap-2 shrink-0">
                              <span className="text-[10.5px] tabular-nums" style={{ color: T.textMuted }}>{pct.toFixed(1)}%</span>
                              <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(b.total)}</span>
                            </span>
                          </div>
                        );
                      })}
                      {filtered.length === 0 && (
                        <div className="text-xs text-center py-6" style={{ color: T.textMuted }}>No specialties match &ldquo;{otherSpecSearch}&rdquo;</div>
                      )}
                    </div>
                  </ScrollArea>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </WarmSection>}

      {/* ── Section: Trends + Specialty ── */}
      {(isChartVisible("visitTrends") || isChartVisible("specialtyDonut")) && <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${[isChartVisible("visitTrends"), isChartVisible("specialtyDonut")].filter(Boolean).length || 1}, 1fr)` }}>
        {isChartVisible("visitTrends") && <CVCard accentColor="#4f46e5" title="Visit Trends" subtitle={trendView === "monthly" ? (isDailyView ? "Each day shows completed, cancelled, and no-show consults alongside unique patients." : "Each month shows completed, cancelled, and no-show consults alongside unique patients.") : "Each year shows completed, cancelled, and no-show consults with the year-over-year change."} tooltipText="Completed, Cancelled, No-Show, and Unique Patients per period. The grey dashed line marks the average Completed across the visible range." chartId="visitTrends" chartData={trendView === "yearly" ? yearlyTrends : visitTrends} chartTitle="Visit Trends" chartDescription={`${trendView} view of consultation trends over time`} dataPoints={(trendView === "yearly" ? yearlyTrends : visitTrends).map((v: { period: string }) => v.period)} tableData={visitTrendsTable}>
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
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={yearlyTrends} margin={{ top: 40, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: T.textSecondary }} tickFormatter={(v: string) => { const d = yearlyTrends.find((y) => y.period === v); return d?.isYtd ? `${v} (YTD)` : v; }} />
                  <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    const total = (dd?.completed || 0) + (dd?.cancelled || 0) + (dd?.noShow || 0);
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}{dd?.isYtd ? " (YTD)" : ""}</p>
                        <p>Total Appointments: <strong>{formatNum(total)}</strong></p>
                        <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: T.borderLight }}>
                          <p style={{ color: "#4f46e5" }}>Completed: <strong>{formatNum(dd?.completed)}</strong>{dd?.yoy != null ? <span className="ml-2 text-[10px]" style={{ color: dd.yoy >= 0 ? "#16a34a" : "#dc2626" }}>{dd.yoy >= 0 ? "+" : ""}{dd.yoy}% YoY</span> : null}</p>
                          <p style={{ color: "#f59e0b" }}>Cancelled: <strong>{formatNum(dd?.cancelled)}</strong></p>
                          <p style={{ color: "#ef4444" }}>No-Show: <strong>{formatNum(dd?.noShow)}</strong></p>
                        </div>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="completed" name="Completed" fill="#4f46e5" radius={[4, 4, 0, 0]} minPointSize={4}>
                    <LabelList content={(props: any) => {
                      const { x, y, width, index } = props;
                      const d = yearlyTrends[index];
                      if (!d) return null;
                      const yoyPart = d.yoy != null ? ` ${d.yoy >= 0 ? "+" : ""}${d.yoy}%` : "";
                      const yoyColor = d.yoy != null && d.yoy >= 0 ? "#16a34a" : "#dc2626";
                      return (
                        <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fontWeight={600}>
                          <tspan fill={T.textPrimary}>{formatNum(d.completed)}</tspan>
                          {yoyPart && <tspan fill={yoyColor} dx={4}>{yoyPart.trim()}</tspan>}
                        </text>
                      );
                    }} />
                  </Bar>
                  <Bar dataKey="cancelled" name="Cancelled" fill="#f59e0b" radius={[4, 4, 0, 0]} minPointSize={4}>
                    <LabelList dataKey="cancelled" position="top" fontSize={10} fontWeight={600} fill={T.textSecondary} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v)) : "")} />
                  </Bar>
                  <Bar dataKey="noShow" name="No-Show" fill="#ef4444" radius={[4, 4, 0, 0]} minPointSize={4}>
                    <LabelList dataKey="noShow" position="top" fontSize={10} fontWeight={600} fill={T.textSecondary} formatter={(v: any) => (Number(v) > 0 ? formatNum(Number(v)) : "")} />
                  </Bar>
                  <Line type="monotone" dataKey="completed" name="Completed Trend" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4, fill: "#fff", stroke: "#0d9488", strokeWidth: 2 }} activeDot={{ r: 6, fill: "#0d9488" }} legendType="none" />
                </ComposedChart>
            </ResponsiveContainer>
          </div>
          ) : (
          <div className="overflow-x-auto">
            <div style={{ height: 300, minWidth: Math.max(600, visitTrends.length * (isDailyView ? 48 : 64)) }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={visitTrends} margin={{ top: 30, right: 26, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: T.textSecondary }} tickFormatter={formatPeriodLabel} interval={0} />
                  {/* Headroom above the tallest line so the top data labels
                      never collide with the axis / top edge. */}
                  <YAxis tick={{ fontSize: 11, fill: T.textSecondary }} domain={[0, (dataMax: number) => { const p = dataMax * 1.18; const mag = Math.pow(10, Math.floor(Math.log10(Math.max(p, 1)))); return Math.ceil(p / mag) * mag; }]} />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    const total = (dd?.completed || 0) + (dd?.cancelled || 0) + (dd?.noShow || 0);
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{formatPeriodLabel(String(label ?? ""))}</p>
                        <p>Total Appointments: <strong>{formatNum(total)}</strong></p>
                        <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: T.borderLight }}>
                          <p style={{ color: "#4f46e5" }}>Completed: <strong>{formatNum(dd?.completed)}</strong></p>
                          <p style={{ color: "#f59e0b" }}>Cancelled: <strong>{formatNum(dd?.cancelled)}</strong></p>
                          <p style={{ color: "#ef4444" }}>No-Show: <strong>{formatNum(dd?.noShow)}</strong></p>
                        </div>
                        <div className="mt-1.5 pt-1.5 border-t" style={{ borderColor: T.borderLight }}>
                          <p style={{ color: "#0d9488" }}>Unique Patients: <strong>{formatNum(dd?.uniquePatients)}</strong></p>
                        </div>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                  <ReferenceLine y={avgConsults} stroke={T.textSecondary} strokeDasharray="6 4" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3, fill: "#fff", stroke: "#4f46e5", strokeWidth: 2 }} activeDot={{ r: 5, fill: "#4f46e5" }} />
                  <Line type="monotone" dataKey="uniquePatients" name="Unique Patients" stroke="#0d9488" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#fff", stroke: "#0d9488", strokeWidth: 2 }} activeDot={{ r: 5, fill: "#0d9488" }} />
                  <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#f59e0b", strokeWidth: 2 }} activeDot={{ r: 5, fill: "#f59e0b" }} />
                  <Line type="monotone" dataKey="noShow" name="No-Show" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#ef4444", strokeWidth: 2 }} activeDot={{ r: 5, fill: "#ef4444" }} />
                  {/* All numbers, de-collided per month (see LineValueLabels). */}
                  <LineValueLabels data={visitTrends} xKey="period" series={VT_LABEL_SERIES} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          )}
          <InsightBox text={trendView === "yearly"
            ? (() => {
                if (yearlyTrends.length === 0) return "No trend data yet for this date range.";
                if (yearlyTrends.length === 1) { const y = yearlyTrends[0]; return `${y.period}${y.isYtd ? " (so far)" : ""}: ${formatNum(y.completed)} completed.`; }
                const lastFull = [...yearlyTrends].reverse().find((y) => !y.isYtd && y.yoy != null);
                const ytd = yearlyTrends.find((y) => y.isYtd);
                const basePart = lastFull ? `${lastFull.period}: ${lastFull.yoy! >= 0 ? "▲" : "▼"}${Math.abs(lastFull.yoy!)}% YoY.` : "";
                const ytdPart = ytd ? ` ${ytd.period} so far: ${formatNum(ytd.completed)}.` : "";
                return (basePart + ytdPart).trim() || "Not enough history to compare.";
              })()
            : visitTrends.length > 0
              ? (() => { const peak = visitTrends.reduce((a: any, b: any) => a.completed > b.completed ? a : b); const bucket = isDailyView ? "day" : "month"; const peakLabel = isDailyView ? "Busiest day" : "Busiest month"; return `${formatNum(avgConsults)} visits/${bucket} avg · ${peakLabel}: ${peak.period} (${formatNum(peak.completed)}).`; })()
              : "No trend data yet for this date range."} />
        </CVCard>}

        {isChartVisible("specialtyDonut") && <CVCard accentColor="#4f46e5" title="Visits by Specialty" subtitle="Specialty share of consults" tooltipText="Share of completed consultations by specialty. Specialties below the top six fold into 'Others'." chartId="specialtyDonut" chartData={charts?.specialtyTreemap} chartTitle="Visits by Specialty" chartDescription="Donut chart showing proportional distribution of consultations by specialty" tableData={specialtyTable}>
          {(() => {
            const raw = charts?.specialtyTreemap || [];
            const top6 = raw.slice(0, 6);
            const othersItems = raw.slice(6);
            const othersTotal = othersItems.reduce((s: number, d: any) => s + d.value, 0);
            const othersUnique = othersItems.reduce((s: number, d: any) => s + (Number(d.uniquePatients) || 0), 0);
            const donutData = [...top6, ...(othersTotal > 0 ? [{ name: "Others", value: othersTotal, uniquePatients: othersUnique }] : [])];
            const total = donutData.reduce((s: number, d: any) => s + d.value, 0);
            return (
              <div style={{ height: 340 }}>
                <ReactECharts
                  style={{ height: "100%", width: "100%" }}
                  option={{
                    tooltip: {
                      backgroundColor: "#fff",
                      borderColor: T.border,
                      borderWidth: 1,
                      padding: [12, 16],
                      appendToBody: true,
                      extraCssText: "border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.12);z-index:9999;max-height:400px;overflow-y:auto;",
                      textStyle: { fontSize: 12, fontFamily: "Inter, system-ui, sans-serif", color: T.textPrimary },
                      formatter: (p: any) => {
                        const pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : "0";
                        const uniq = Number((donutData.find((d: any) => d.name === p.name) as any)?.uniquePatients || 0);
                        const hint = p.name === "Others" && othersItems.length > 0
                          ? `<div style="font-size:11px;color:#4f46e5;margin-top:6px;font-weight:500">${othersItems.length} smaller specialties · click below to view breakdown</div>`
                          : "";
                        return `<div style="min-width:150px"><div style="font-size:13px;font-weight:700;margin-bottom:4px">${p.name}</div><div style="font-size:20px;font-weight:800;color:#111827">${formatNum(p.value)}</div><div style="font-size:12px;color:#6B7280;margin-top:2px">${pct}% of total consults</div><div style="font-size:12px;color:#4f46e5;margin-top:4px;font-weight:600">${formatNum(uniq)} unique patients</div>${hint}</div>`;
                      },
                    },
                    legend: {
                      orient: "vertical",
                      right: 16,
                      top: "middle",
                      icon: "circle",
                      itemWidth: 10,
                      itemHeight: 10,
                      itemGap: 14,
                      formatter: (name: string) => {
                        const item = donutData.find((d: any) => d.name === name);
                        const pct = item && total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
                        const count = item ? formatNum(item.value) : "0";
                        return `{name|${name}}\n{val|${count}}{pct|  ${pct}%}`;
                      },
                      textStyle: {
                        fontSize: 12,
                        fontFamily: "Inter, system-ui, sans-serif",
                        color: T.textPrimary,
                        rich: {
                          name: { fontSize: 12, fontWeight: 600, color: "#111827", lineHeight: 18 },
                          val: { fontSize: 11, fontWeight: 500, color: "#374151", lineHeight: 16 },
                          pct: { fontSize: 11, fontWeight: 400, color: "#9CA3AF", lineHeight: 16 },
                        },
                      },
                    },
                    series: [{
                      type: "pie",
                      radius: ["58%", "82%"],
                      center: ["32%", "50%"],
                      avoidLabelOverlap: true,
                      padAngle: 2,
                      itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 10 },
                      label: { show: false },
                      emphasis: {
                        scale: true,
                        scaleSize: 10,
                        itemStyle: { shadowBlur: 22, shadowColor: "rgba(79,70,229,0.22)", borderWidth: 2, borderColor: "#fff" },
                        label: { show: false },
                      },
                      data: donutData.map((d: any, i: number) => ({
                        name: d.name,
                        value: d.value,
                        itemStyle: { color: d.name === "Others" ? "#d1d5db" : TREEMAP_COLORS[i % TREEMAP_COLORS.length] },
                      })),
                    }],
                    graphic: [{
                      type: "group",
                      left: "32%",
                      top: "50%",
                      bounding: "raw",
                      children: [
                        { type: "circle", shape: { cx: 0, cy: 0, r: 72 }, style: { fill: "#eff6ff", stroke: "#93c5fd", lineWidth: 1.5 } },
                        { type: "text", style: { text: "Total", x: 0, y: -14, textAlign: "center", textVerticalAlign: "middle", fontSize: 11, fontWeight: 500, fontFamily: "Inter, system-ui, sans-serif", fill: "#6B7280", letterSpacing: 1 } },
                        { type: "text", style: { text: formatNum(total), x: 0, y: 10, textAlign: "center", textVerticalAlign: "middle", fontSize: 26, fontWeight: 800, fontFamily: "Inter, system-ui, sans-serif", fill: "#111827" } },
                      ],
                    }],
                    animationDuration: 600,
                    animationEasing: "cubicOut",
                  }}
                />
              </div>
            );
          })()}
          {(() => {
            const raw = charts?.specialtyTreemap || [];
            const othersItems = raw.slice(6);
            if (othersItems.length === 0) return null;
            const othersTotal = othersItems.reduce((s: number, d: any) => s + d.value, 0);
            return (
              <button
                onClick={() => { setSpecOthersSearch(""); setSpecOthersModalOpen(true); }}
                className="mt-3 w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-left transition hover:shadow-sm hover:border-indigo-300"
                style={{ borderColor: T.border, background: "#fafafa" }}
              >
                <div className="flex items-center gap-2 text-xs" style={{ color: T.textSecondary }}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#d1d5db" }} />
                  <span>
                    <strong style={{ color: T.textPrimary }}>Others:</strong> {othersItems.length} smaller specialties · <strong style={{ color: T.textPrimary }}>{formatNum(othersTotal)}</strong> consults
                  </span>
                </div>
                <span className="text-[11px] font-semibold" style={{ color: "#4f46e5" }}>View breakdown →</span>
              </button>
            );
          })()}
          <Dialog open={specOthersModalOpen} onOpenChange={setSpecOthersModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Others — Specialty Breakdown</DialogTitle>
              </DialogHeader>
              {(() => {
                const list = (charts?.specialtyTreemap || []).slice(6) as Array<{ name: string; value: number }>;
                const total = list.reduce((s, b) => s + (b.value || 0), 0);
                const q = specOthersSearch.trim().toLowerCase();
                const filtered = q ? list.filter((b) => b.name.toLowerCase().includes(q)) : list;
                return (
                  <>
                    <div className="text-xs mb-3" style={{ color: T.textSecondary }}>
                      <strong>{list.length}</strong> smaller specialties grouped · <strong>{formatNum(total)}</strong> total consults
                    </div>
                    <Input placeholder="Search specialty…" value={specOthersSearch} onChange={(e) => setSpecOthersSearch(e.target.value)} className="mb-3" />
                    <ScrollArea className="h-[360px] pr-3">
                      <div className="space-y-1">
                        {filtered.map((b) => (
                          <div key={b.name} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                            <span style={{ color: T.textSecondary }}>{b.name}</span>
                            <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(b.value)}</span>
                          </div>
                        ))}
                        {filtered.length === 0 && (
                          <div className="text-xs text-center py-6" style={{ color: T.textMuted }}>No specialties match &ldquo;{specOthersSearch}&rdquo;</div>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
          <InsightBox text={(() => {
            const list = (charts?.specialtyTreemap || []) as Array<{ name: string; value: number }>;
            const total = kpis?.totalConsults;
            if (list.length === 0 || !total) return "Specialty breakdown will appear once data loads.";
            const top = list[0];
            const topShare = ((top.value / total) * 100).toFixed(1);
            const leadLine = `Top specialty: ${top.name} — ${formatNum(top.value)} visits (${topShare}%).`;
            if (list.length <= 1) return leadLine;
            const topN = Math.min(5, list.length);
            const topNSum = list.slice(0, topN).reduce((s, d) => s + d.value, 0);
            const topNPct = Math.round((topNSum / total) * 100);
            const remaining = list.length - topN;
            if (remaining <= 0) return `${leadLine} ${list.length} specialties total.`;
            return `${leadLine} Top ${topN}: ${topNPct}% of visits (${remaining} more share the rest).`;
          })()} />
        </CVCard>}
      </div>}

      {/* ── Section: Service Categories (Warm) ── */}
      {(isChartVisible("categoryRadar") || isChartVisible("serviceCategoryMatrix")) && <WarmSection>
        <AccentBar color="#0d9488" colorEnd="#14b8a6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Service Categories</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Booked vs completed across service categories</p>

        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${[isChartVisible("categoryRadar"), isChartVisible("serviceCategoryMatrix")].filter(Boolean).length || 1}, 1fr)` }}>
          {isChartVisible("categoryRadar") && <CVCard accentColor="#0d9488" title="Category Radar" subtitle="Booked vs completed by category" tooltipText="Booked vs Completed for Pathology, Radiology, and Cardiology. Click a category axis to drill into its top packages and tests." chartId="categoryRadar" chartData={radarData} chartTitle="Category Radar (excl. Consultation)" chartDescription="Radar chart comparing booked vs completed volumes across non-consultation service categories" tableData={radarTable}>
            <div style={{ height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={radarData}
                  cx="50%"
                  cy="50%"
                  outerRadius="70%"
                  onClick={(e: any) => {
                    const cat = e?.activeLabel as string | undefined;
                    if (cat) setSelectedSvcCategory((cur) => cur === cat ? "" : cat);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <PolarGrid stroke="#E5E7EB" gridType="polygon" />
                  <PolarAngleAxis
                    dataKey="category"
                    tick={(props: any) => {
                      const { x, y, payload, textAnchor } = props;
                      const isSelected = payload.value === selectedSvcCategory;
                      return (
                        <text
                          x={x}
                          y={y}
                          textAnchor={textAnchor}
                          dy={4}
                          fontSize={11}
                          fontWeight={isSelected ? 700 : 500}
                          fill={isSelected ? "#0d9488" : T.textPrimary}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelectedSvcCategory((cur) => cur === payload.value ? "" : payload.value)}
                        >
                          {payload.value}
                        </text>
                      );
                    }}
                  />
                  <PolarRadiusAxis tick={{ fontSize: 11, fill: T.textSecondary }} angle={30} domain={[0, "auto"]} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }} />
                  <Radar name="Booked" dataKey="booked" stroke="#4f46e5" fill="none" strokeWidth={2.5} dot={{ r: 4, fill: "#4f46e5", strokeWidth: 0 }} />
                  <Radar name="Completed" dataKey="completed" stroke="#e11d48" fill="none" strokeWidth={2.5} dot={{ r: 4, fill: "#e11d48", strokeWidth: 0 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="rect" iconSize={10} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <InsightBox text={(() => {
              const cats = (serviceCategories || []) as Array<{ category: string; booked: number; completed: number; completionRate: number }>;
              if (cats.length === 0) return "Category data will appear once loaded.";
              const byBooked = [...cats].sort((a, b) => b.booked - a.booked);
              const byRate = [...cats].sort((a, b) => b.completionRate - a.completionRate);
              const topBooked = byBooked[0];
              const topRate = byRate[0];
              if (topBooked.category === topRate.category) return `${topBooked.category} leads bookings (${formatNum(topBooked.booked)}) & completion (${topBooked.completionRate}%).`;
              const gap = topRate.completionRate - topBooked.completionRate;
              const wouldAdd = Math.round(topBooked.booked * (gap / 100));
              return `Most booked: ${topBooked.category} · best completion: ${topRate.category} (${topRate.completionRate}% vs ${topBooked.completionRate}%). Closing the gap: +~${formatNum(wouldAdd)} completed.`;
            })()} />
          </CVCard>}

          {isChartVisible("serviceCategoryMatrix") && <CVCard accentColor="#0d9488" title={selectedSvcCategory ? `${selectedSvcCategory} — Top Line Items` : "Service Category Metrics"} subtitle={selectedSvcCategory ? "These are the top packages and tests ranked by booked volume." : "Each row shows the booked, completed, and completion rate for one category."} tooltipText="Booked is the count of ordered services; Completed is those marked Completed; Completion Rate is Completed ÷ Booked." chartId="serviceCategoryMatrix" chartData={selectedSvcCategory ? serviceCategoryLineItems[selectedSvcCategory] : serviceCategories} chartTitle={selectedSvcCategory ? `${selectedSvcCategory} — Top Line Items` : "Service Category Metrics"} chartDescription="Service category breakdown with booked, completed counts and completion rates" rightHeader={<ResetFilter visible={selectedSvcCategory !== ""} onClick={() => setSelectedSvcCategory("")} />}>
            {selectedSvcCategory ? (() => {
              const drill = serviceCategoryLineItems[selectedSvcCategory] || { packages: [], tests: [] };
              const renderRow = (item: SvcLineItem, idx: number) => (
                <tr key={item.serviceName} style={{ borderBottom: `1px solid ${T.borderLight}`, background: idx % 2 === 1 ? "#fafbfd" : undefined }} className="hover:bg-[#eef2ff] transition-colors">
                  <td className="py-2.5 px-4 font-medium truncate max-w-[260px]" style={{ color: T.textPrimary }} title={item.serviceName}>{item.serviceName}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums" style={{ color: T.textSecondary }}>{formatNum(item.booked)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold tabular-nums" style={{ color: "#0d9488" }}>{formatNum(item.completed)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold" style={{
                      backgroundColor: item.completionRate >= 85 ? "rgba(13,148,136,0.08)" : item.completionRate >= 70 ? "rgba(217,119,6,0.08)" : "rgba(225,29,72,0.08)",
                      color: item.completionRate >= 85 ? "#0d9488" : item.completionRate >= 70 ? "#d97706" : "#e11d48",
                    }}>{item.completionRate}%</span>
                  </td>
                </tr>
              );
              const sectionHeader = (label: string) => (
                <tr>
                  <td colSpan={4} className="pt-4 pb-2 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted, background: "transparent" }}>{label}</td>
                </tr>
              );
              const tableHeader = (
                <thead>
                  <tr>
                    <th className="text-left py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b", borderRadius: "12px 0 0 0" }}>Service</th>
                    <th className="text-right py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b" }}>Booked</th>
                    <th className="text-right py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b" }}>Completed</th>
                    <th className="text-right py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b", borderRadius: "0 12px 0 0" }}>Rate</th>
                  </tr>
                </thead>
              );
              const hasPackages = drill.packages && drill.packages.length > 0;
              const hasTests = drill.tests && drill.tests.length > 0;
              if (!hasPackages && !hasTests) {
                return <p className="text-[12px] py-8 text-center" style={{ color: T.textMuted }}>No line items found for {selectedSvcCategory} in the current filter window.</p>;
              }
              return (
                <div className="h-full overflow-auto">
                  {/* Drill-state banner with prominent reset */}
                  <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(13,148,136,0.06)", border: "1px solid rgba(13,148,136,0.18)" }}>
                    <span className="text-[12px]" style={{ color: T.textSecondary }}>
                      Drilled into <strong style={{ color: "#0d9488" }}>{selectedSvcCategory}</strong>
                    </span>
                    <button
                      onClick={() => setSelectedSvcCategory("")}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11.5px] font-semibold transition-colors hover:opacity-90"
                      style={{ backgroundColor: "#0d9488", color: "#fff" }}
                    >
                      <RotateCcw size={12} /> Reset
                    </button>
                  </div>
                  <table className="w-full text-[12px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                    {tableHeader}
                    <tbody>
                      {hasPackages && sectionHeader(`Top Packages (${drill.packages.length})`)}
                      {hasPackages && drill.packages.map(renderRow)}
                      {hasTests && sectionHeader(`Top Tests (${drill.tests.length})`)}
                      {hasTests && drill.tests.map(renderRow)}
                    </tbody>
                  </table>
                </div>
              );
            })() : (
              <div className="h-full overflow-auto">
                <table className="w-full text-[12px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th className="text-left py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b", borderRadius: "12px 0 0 0" }}>Service Category</th>
                      <th className="text-right py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b" }}>Booked</th>
                      <th className="text-right py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b" }}>Completed</th>
                      <th className="text-right py-3.5 px-4 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "#f1f5f9", background: "#1e293b", borderRadius: "0 12px 0 0" }}>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(serviceCategories || []).map((sc: any, idx: number) => (
                      <tr
                        key={sc.category}
                        style={{ borderBottom: `1px solid ${T.borderLight}`, background: idx % 2 === 1 ? "#fafbfd" : undefined, cursor: "pointer" }}
                        className="hover:bg-[#eef2ff] transition-colors"
                        onClick={() => setSelectedSvcCategory(sc.category)}
                        title="Click to drill into top line items"
                      >
                        <td className="py-3.5 px-4 font-semibold" style={{ color: T.textPrimary }}>{sc.category} <span className="text-[10px] font-normal ml-1" style={{ color: T.textMuted }}>→</span></td>
                        <td className="py-3.5 px-4 text-right tabular-nums" style={{ color: T.textSecondary }}>{formatNum(sc.booked)}</td>
                        <td className="py-3.5 px-4 text-right font-semibold tabular-nums" style={{ color: "#0d9488" }}>{formatNum(sc.completed)}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold" style={{
                            backgroundColor: sc.completionRate >= 85 ? "rgba(13,148,136,0.08)" : sc.completionRate >= 70 ? "rgba(217,119,6,0.08)" : "rgba(225,29,72,0.08)",
                            color: sc.completionRate >= 85 ? "#0d9488" : sc.completionRate >= 70 ? "#d97706" : "#e11d48",
                          }}>{sc.completionRate}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <InsightBox text={selectedSvcCategory === "Pathology" ? "Packages = bundled offerings; tests = individual analytes. Big packages vs small tests = mostly annual screenings." : selectedSvcCategory ? "Most-booked items. A high-volume item with low completion is the best fix." : (() => {
              const cats = (serviceCategories || []) as Array<{ category: string; booked: number; completed: number; completionRate: number }>;
              if (cats.length < 2) return "Click any category on the Category Radar to see what's inside.";
              const byRate = [...cats].sort((a, b) => a.completionRate - b.completionRate);
              const worst = byRate[0];
              const best = byRate[byRate.length - 1];
              const gap = best.completionRate - worst.completionRate;
              const wouldAdd = Math.round(worst.booked * (gap / 100));
              if (gap <= 0) return `All categories completing at ${worst.completionRate}%.`;
              return `Lowest: ${worst.category} at ${worst.completionRate}%. Matching ${best.category}: +~${formatNum(wouldAdd)} completed.`;
            })()} />
          </CVCard>}
        </div>
      </WarmSection>}

      {/* ── Section: Bubble Chart ── */}
      {isChartVisible("bubbleChart") && (() => {
        const singleClinicMode = locationOrder.length <= 1;
        const onlyClinic = locationOrder[0] || "your clinic";
        return <CVCard accentColor="#4f46e5" title="Consult Distribution by Specialty & Location" subtitle={singleClinicMode ? `Consultations at ${onlyClinic} by age group, sized by volume and coloured by gender mix.` : "Each bubble is one clinic and age group, sized by volume and coloured by gender mix."} tooltipText={singleClinicMode ? "One row per age group at this clinic. Bar length is consultation volume; bar colour shifts from blue (more male) to pink (more female), grey when balanced." : "X-axis is clinic location, Y-axis is age group. Bubble size is consultation volume; colour shifts from blue (more male) to pink (more female), grey when balanced."} chartId="bubbleChart" chartData={bubbleData} chartTitle={`Consult Distribution — ${activeBubbleSpec}`} chartDescription="Bubble chart showing consultation distribution by specialty, location, and age group with gender split" tableData={bubbleTable}>
        {/* ── How to read this chart ── (hidden in single-clinic mode) */}
        {!singleClinicMode && (
        <div className="flex items-center gap-5 mb-4 px-4 py-3 rounded-xl flex-wrap" style={{ backgroundColor: "rgba(79,70,229,0.04)", border: "1px solid rgba(79,70,229,0.08)" }}>
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: T.textSecondary }}>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: "#4f46e5" }}>⬤</span>
            <span><span className="font-semibold" style={{ color: T.textPrimary }}>Bubble size</span> — consultation volume (larger = more visits)</span>
          </span>
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: T.textSecondary }}>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white" style={{ background: "linear-gradient(90deg,#e879a0 50%,#818cf8 50%)" }}>⬤</span>
            <span><span className="font-semibold" style={{ color: T.textPrimary }}>Bubble colour</span> — gender split (pink = female-dominant, blue = male-dominant)</span>
          </span>
          <span className="flex items-center gap-2 text-[11.5px]" style={{ color: T.textSecondary }}>
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold" style={{ backgroundColor: "rgba(245,246,250,0.9)", border: "1px solid #e5e7eb" }}>▤</span>
            <span><span className="font-semibold" style={{ color: T.textPrimary }}>Shaded rows</span> — alternating bands per age group for easier left-to-right scanning</span>
          </span>
        </div>
        )}

        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {bubbleSpecs.slice(0, 10).map((spec: string) => (
            <button key={spec} onClick={() => setSelectedBubbleSpec(spec)}
              className="px-3.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-all hover:-translate-y-px"
              style={{
                backgroundColor: activeBubbleSpec === spec ? "#4f46e5" : T.white,
                color: activeBubbleSpec === spec ? "#fff" : T.textSecondary,
                borderColor: activeBubbleSpec === spec ? "#4f46e5" : T.border,
                boxShadow: activeBubbleSpec === spec ? "0 2px 8px rgba(79,70,229,0.2)" : undefined,
              }}
            >{spec}</button>
          ))}
          <ResetFilter visible={selectedBubbleSpec !== ""} onClick={() => setSelectedBubbleSpec("")} />
        </div>
        {singleClinicMode ? (() => {
          // Single-clinic list view: collapse to one row per age group with
          // a volume bar (coloured by gender mix) and a gender-share pill.
          const rows = ageGroupOrder
            .map((ag) => {
              const r = bubbleData.find((b: any) => b.ageGroup === ag);
              if (!r) return null;
              return { ageGroup: ag, total: r.total, male: r.male, female: r.female, malePercent: r.malePercent };
            })
            .filter(Boolean) as Array<{ ageGroup: string; total: number; male: number; female: number; malePercent: number }>;
          if (rows.length === 0) {
            return <p className="text-center text-[12px] py-12" style={{ color: T.textMuted }}>No {activeBubbleSpec} consults at {onlyClinic} in the current filter window.</p>;
          }
          const maxTotal = Math.max(...rows.map((r) => r.total), 1);
          return (
            <div className="flex flex-col gap-2.5 mt-2 mb-2">
              {rows.map((r) => {
                const widthPct = Math.max(2, Math.round((r.total / maxTotal) * 100));
                const barColor = getBubbleColor(r.malePercent);
                const malePct = r.total > 0 ? Math.round((r.male / r.total) * 100) : 0;
                const femalePct = Math.max(0, 100 - malePct);
                return (
                  <div key={r.ageGroup} className="flex items-center gap-3" title={`${r.ageGroup} · ${formatNum(r.total)} visits · ${formatNum(r.male)} male, ${formatNum(r.female)} female`}>
                    <div className="text-[12px] font-semibold tabular-nums" style={{ width: 60, color: T.textPrimary }}>{r.ageGroup}</div>
                    <div className="flex-1 rounded-md overflow-hidden" style={{ height: 28, backgroundColor: "#F1F5F9" }}>
                      <div style={{ width: `${widthPct}%`, height: "100%", backgroundColor: barColor, borderRadius: 6, transition: "width 200ms ease" }} />
                    </div>
                    <div className="text-[12.5px] font-bold tabular-nums" style={{ width: 70, textAlign: "right", color: T.textPrimary }}>{formatNum(r.total)}</div>
                    <div className="inline-flex items-center gap-1 text-[10.5px] font-semibold tabular-nums px-2 py-1 rounded-md" style={{ backgroundColor: "#F1F5F9", color: T.textSecondary, minWidth: 110, justifyContent: "center" }}>
                      <span style={{ color: BUBBLE_GENDER.predominantlyMale }}>M {malePct}%</span>
                      <span style={{ color: T.textMuted }}>·</span>
                      <span style={{ color: BUBBLE_GENDER.predominantlyFemale }}>F {femalePct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div className="overflow-x-auto"><div style={{ height: 340, minWidth: 600 }}><ReactECharts option={bubbleOption} style={{ height: "100%", width: "100%" }} /></div></div>
        )}
        <div className="flex items-center justify-center gap-4 mt-3 text-[11px] font-medium flex-wrap" style={{ color: T.textSecondary }}>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: BUBBLE_GENDER.predominantlyFemale }} />Predominantly Female (&gt;75%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: BUBBLE_GENDER.femaleMajority }} />Female Majority (50-75%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: BUBBLE_GENDER.balanced }} />Balanced (~50%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: BUBBLE_GENDER.maleMajority }} />Male Majority (50-75%)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: BUBBLE_GENDER.predominantlyMale }} />Predominantly Male (&gt;75%)</span>
        </div>
        <InsightBox text={(() => {
          const rows = (bubbleData || []) as Array<{ location: string; ageGroup: string; total: number; male: number; female: number; malePercent: number }>;
          if (rows.length === 0) return "Bubble breakdown will appear once data loads.";
          const top = [...rows].sort((a, b) => b.total - a.total)[0];
          const skew = top.malePercent > 55 ? "male-heavy" : top.malePercent < 45 ? "female-heavy" : "balanced";
          return `${activeBubbleSpec} — top: ${top.ageGroup} @ ${top.location}, ${formatNum(top.total)} visits, ${skew} (${formatNum(top.male)}M · ${formatNum(top.female)}F).`;
        })()} />
      </CVCard>;
      })()}

      {/* ── Peak Consultation Hours Heatmap ── */}
      {isChartVisible("peakHours") && <CVCard accentColor="#4f46e5" title="Peak Consultation Hours" subtitle="Volume by weekday & hour" tooltipText="Consultation count per weekday and hour from 6 AM to 10 PM. Darker cells are busier. Drag the slider to fade lower-traffic slots." chartId="peakHours" chartData={charts?.peakHours} chartTitle="Peak Consultation Hours" chartDescription="Heatmap showing hourly consultation footfall by weekday" tableData={peakHoursTable}>
        {/* ── Slider instruction ── */}
        <div className="flex items-start gap-3 mb-4 px-4 py-3 rounded-xl" style={{ backgroundColor: "rgba(79,70,229,0.05)", border: "1px solid rgba(79,70,229,0.12)" }}>
          <SlidersHorizontal size={16} style={{ color: "#4f46e5", flexShrink: 0, marginTop: 1 }} />
          <div>
            <p className="text-[12.5px] font-semibold mb-0.5" style={{ color: "#1e293b" }}>
              Drag the slider (inside the chart, centred at top) to filter by consultation volume
            </p>
            <p className="text-[11.5px]" style={{ color: "#6B7280" }}>
              Slide left to fade out low-traffic slots and reveal only the busiest hours.&nbsp;
              Slide right to show all activity. Hover any cell for the exact count.
            </p>
          </div>
        </div>

        <div style={{ overflowX: "auto", overflowY: "auto" }}>
          <div style={{ height: 460, minWidth: 1100 }}>
          <ReactECharts
            style={{ height: "100%", width: "100%" }}
            option={{
              tooltip: {
                backgroundColor: "#fff",
                borderColor: T.border,
                borderWidth: 1,
                textStyle: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, color: T.textPrimary },
                padding: [10, 14],
                borderRadius: 12,
                extraCssText: "box-shadow:0 4px 16px rgba(0,0,0,0.10);",
                formatter: (p: any) => {
                  const hours = ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"];
                  const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
                  return `${days[p.data[1]] || ""} at ${hours[p.data[0]] || ""}<br/><strong>${p.data[2]}</strong> consultations`;
                },
              },
              grid: { left: 56, right: 32, top: 58, bottom: 48 },
              xAxis: {
                type: "category",
                data: ["6 AM","7 AM","8 AM","9 AM","10 AM","11 AM","12 PM","1 PM","2 PM","3 PM","4 PM","5 PM","6 PM","7 PM","8 PM","9 PM","10 PM"],
                axisLine: { lineStyle: { color: "#E5E7EB" } },
                axisTick: { show: false },
                axisLabel: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, color: T.textSecondary },
                splitArea: { show: false },
              },
              yAxis: {
                type: "category",
                data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, color: T.textSecondary, fontWeight: 500 },
              },
              visualMap: {
                min: 0,
                max: charts?.peakHours?.max || 65,
                show: true,
                calculable: true,
                orient: "horizontal",
                top: 8,
                left: "center",
                itemWidth: 16,
                itemHeight: 320,
                text: ["High volume  ▶", "◀  Low volume"],
                textStyle: { fontSize: 11, color: "#6B7280", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 500 },
                handleStyle: { color: "#4f46e5", borderColor: "#fff", borderWidth: 2, shadowBlur: 4, shadowColor: "rgba(79,70,229,0.3)" },
                inRange: { color: ["#eef2ff", "#c7d2fe", "#818cf8", "#6366f1", "#4f46e5", "#3730a3"] },
                outOfRange: { color: ["rgba(229,231,235,0.35)"] },
              },
              series: [{
                type: "heatmap",
                data: charts?.peakHours?.data || [],
                label: { show: false },
                itemStyle: {
                  borderColor: "#fff",
                  borderWidth: 3,
                  borderRadius: 6,
                },
                emphasis: {
                  itemStyle: {
                    shadowBlur: 8,
                    shadowColor: "rgba(0,0,0,0.15)",
                    borderColor: "#4f46e5",
                    borderWidth: 2,
                  },
                },
              }],
              animationDuration: 800,
              animationEasing: "cubicOut",
            }}
          />
          </div>
        </div>
        <InsightBox text={charts?.peakHours?.peakDay
          ? `Peak: ${charts.peakHours.peakDay} ~${charts.peakHours.peakHour} — ${formatNum(charts.peakHours.peakCount)} visits. Staff up that window.`
          : "Peak hour data will appear once loaded."} />
      </CVCard>}

      {/* ── Section: Repeat Visit Trends ── */}
      {isChartVisible("repeatTrends") && <CVCard
        accentColor="#e11d48"
        title="Repeat Visit Trends"
        subtitle={repeatView === "yearly"
          ? "Repeat visits with YoY change"
          : isDailyView
            ? "Daily repeat visits & unique patients"
            : "Monthly repeat visits & unique patients"}
        tooltipText="Repeat Visits counts every consultation made by employees who have used OHC services more than once. Repeat Patients counts the unique number of such employees in each period. Note: summing Repeat Patients across periods double-counts employees who returned in multiple periods, so the yearly view shows Repeat Visits only."
        chartId="repeatTrends"
        chartData={repeatView === "yearly" ? repeatYearlyTrends : repeatTrendData}
        chartTitle="Repeat Visit Trends"
        chartDescription={`${repeatView} view of repeat visit trends`}
        tableData={repeatTrendsTable}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: T.borderLight }}>
            {(["monthly", "yearly"] as const).map((v) => (
              <button key={v} onClick={() => setRepeatView(v)}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${repeatView === v ? "bg-white shadow-sm" : ""}`}
                style={{ color: repeatView === v ? T.textPrimary : T.textMuted }}>
                {v === "monthly" && isDailyView ? "Daily" : v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          <ResetFilter visible={repeatView !== "monthly"} onClick={() => setRepeatView("monthly")} />
        </div>
        {(() => {
          const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const fmtPeriodTick = (value: string) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { const [, m, d] = value.split("-"); return `${MONTHS[Number(m) - 1]} ${d}`; }
            if (/^\d{4}-\d{2}$/.test(value)) { const [y, m] = value.split("-"); return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`; }
            return value;
          };

          if (repeatView === "yearly") {
            const yearly = repeatYearlyTrends;
            const yearlyOption = {
              tooltip: {
                trigger: "axis" as const,
                backgroundColor: "#fff",
                borderColor: T.border,
                borderWidth: 1,
                padding: [10, 14],
                textStyle: { fontSize: 12, color: T.textPrimary },
                extraCssText: "box-shadow:0 4px 12px rgba(0,0,0,0.08);border-radius:10px;",
                formatter: (params: any) => {
                  const period = params[0]?.axisValue || "";
                  const d = yearly.find((y) => y.period === period);
                  const suffix = d?.isYtd ? " (YTD)" : "";
                  const yoyPart = d?.yoy != null ? ` <span style="color:${d.yoy >= 0 ? "#16a34a" : "#dc2626"};font-weight:600">${d.yoy >= 0 ? "+" : ""}${d.yoy}% YoY</span>` : "";
                  const ratio = d && d.repeatPatients > 0 ? (d.repeatVisits / d.repeatPatients).toFixed(1) : "—";
                  return `<div style="font-weight:700;margin-bottom:6px;color:${T.textPrimary}">${period}${suffix}</div><div style="color:${T.textSecondary}">Repeat Visits: <strong style="color:${T.textPrimary}">${formatNum(d?.repeatVisits || 0)}</strong>${yoyPart}</div><div style="color:${T.textSecondary}">Repeat Patients: <strong style="color:${T.textPrimary}">${formatNum(d?.repeatPatients || 0)}</strong></div><div style="border-top:1px solid ${T.borderLight};margin-top:6px;padding-top:6px;font-size:11px;color:${T.textSecondary}">Visits per repeat patient: <strong style="color:${T.textPrimary}">${ratio}</strong></div><div style="font-size:10px;color:${T.textMuted};margin-top:3px;font-style:italic">Repeat patients = sum of monthly values (may double-count across months)</div>`;
                },
              },
              legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11, color: T.textSecondary }, icon: "circle" },
              grid: { top: 40, bottom: 44, left: 56, right: 24 },
              xAxis: { type: "category" as const, data: yearly.map((y) => y.period), axisLabel: { fontSize: 11, color: T.textSecondary, formatter: (v: string) => { const d = yearly.find((y) => y.period === v); return d?.isYtd ? `${v} (YTD)` : v; } }, axisTick: { show: false }, axisLine: { lineStyle: { color: T.borderLight } } },
              yAxis: { type: "value" as const, axisLabel: { fontSize: 11, color: T.textSecondary }, splitLine: { lineStyle: { color: T.borderLight, type: "dashed" as const } }, axisLine: { show: false }, axisTick: { show: false } },
              series: [
                {
                  name: "Repeat Visits",
                  type: "bar" as const,
                  itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] },
                  barMaxWidth: 56,
                  label: {
                    show: true,
                    position: "top" as const,
                    fontSize: 11,
                    fontWeight: 600,
                    formatter: (p: any) => {
                      const d = yearly[p.dataIndex];
                      if (!d) return "";
                      const yoyText = d.yoy != null ? `  {yoy|${d.yoy >= 0 ? "+" : ""}${d.yoy}%}` : "";
                      return `{v|${formatNum(d.repeatVisits)}}${yoyText}`;
                    },
                    rich: {
                      v: { fontSize: 11, fontWeight: 700, color: T.textPrimary },
                      yoy: { fontSize: 10, fontWeight: 600, color: "#16a34a" },
                    },
                  },
                  data: yearly.map((y) => y.repeatVisits),
                },
                {
                  name: "Repeat Patients",
                  type: "bar" as const,
                  itemStyle: { color: "#8b5cf6", borderRadius: [4, 4, 0, 0] },
                  barMaxWidth: 56,
                  label: {
                    show: true,
                    position: "top" as const,
                    fontSize: 10,
                    fontWeight: 600,
                    color: T.textSecondary,
                    formatter: (p: any) => (Number(p.value) > 0 ? formatNum(Number(p.value)) : ""),
                  },
                  data: yearly.map((y) => y.repeatPatients),
                },
                {
                  name: "Trend",
                  type: "line" as const,
                  smooth: true,
                  symbol: "circle",
                  symbolSize: 7,
                  lineStyle: { width: 2.5, color: "#0d9488" },
                  itemStyle: { color: "#0d9488", borderWidth: 2, borderColor: "#fff" },
                  data: yearly.map((y) => y.repeatVisits),
                  z: 3,
                },
              ],
            };
            return (
              <div style={{ height: 340, overflowX: "auto" }}>
                <ReactECharts option={yearlyOption} style={{ height: "100%", width: "100%" }} notMerge />
              </div>
            );
          }

          const data = repeatTrendData;
          const option = {
            tooltip: {
              trigger: "axis" as const,
              backgroundColor: "#fff",
              borderColor: T.border,
              borderWidth: 1,
              padding: [10, 14],
              textStyle: { fontSize: 12, color: T.textPrimary },
              extraCssText: "box-shadow:0 4px 12px rgba(0,0,0,0.08);border-radius:10px;",
              formatter: (params: any) => {
                const period = params[0]?.axisValue || "";
                let html = `<div style="font-weight:700;margin-bottom:6px;color:${T.textPrimary}">${fmtPeriodTick(period)}</div>`;
                let rv = 0; let rp = 0;
                params.forEach((p: any) => {
                  if (p.seriesName === "Repeat Visits") rv = Number(p.value) || 0;
                  if (p.seriesName === "Repeat Patients") rp = Number(p.value) || 0;
                  html += `<div style="display:flex;align-items:center;gap:6px;margin:3px 0"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span><span style="color:${T.textSecondary}">${p.seriesName}:</span> <strong>${(p.value || 0).toLocaleString()}</strong></div>`;
                });
                const ratio = rp > 0 ? (rv / rp).toFixed(1) : "—";
                html += `<div style="border-top:1px solid ${T.borderLight};margin-top:6px;padding-top:6px;font-size:11px;color:${T.textSecondary}">Visits per repeat patient: <strong style="color:${T.textPrimary}">${ratio}</strong></div>`;
                return html;
              },
            },
            legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11, color: T.textSecondary }, icon: "circle" },
            grid: { top: 30, bottom: 44, left: 56, right: 24 },
            xAxis: {
              type: "category" as const,
              data: data.map((d: any) => d.label),
              axisLabel: { fontSize: 10, color: T.textSecondary, formatter: fmtPeriodTick },
              axisTick: { show: false },
              axisLine: { lineStyle: { color: T.borderLight } },
              boundaryGap: false,
            },
            yAxis: {
              type: "value" as const,
              axisLabel: { fontSize: 11, color: T.textSecondary },
              splitLine: { lineStyle: { color: T.borderLight, type: "dashed" as const } },
              axisLine: { show: false },
              axisTick: { show: false },
            },
            series: [
              {
                name: "Repeat Visits",
                type: "line" as const,
                smooth: true,
                symbol: "circle",
                symbolSize: 6,
                lineStyle: { width: 2.5, color: "#e11d48" },
                itemStyle: { color: "#e11d48", borderWidth: 2, borderColor: "#fff" },
                areaStyle: { color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(225,29,72,0.14)" }, { offset: 1, color: "rgba(225,29,72,0.01)" }] } },
                data: data.map((d: any) => d.repeatVisits || 0),
                markPoint: {
                  data: [{ type: "max" as const, name: "Peak" }],
                  symbol: "roundRect",
                  symbolSize: [92, 26],
                  symbolOffset: [0, -22],
                  itemStyle: { color: "#ffffff", borderColor: "#4f46e5", borderWidth: 1.5, shadowBlur: 8, shadowColor: "rgba(79,70,229,0.18)" },
                  label: { fontSize: 11, fontWeight: 700, color: "#3730a3", formatter: (p: any) => `Peak · ${formatNum(Number(p.value) || 0)}` },
                },
              },
              {
                name: "Repeat Patients",
                type: "line" as const,
                smooth: true,
                symbol: "emptyCircle",
                symbolSize: 6,
                lineStyle: { width: 2, color: "#8b5cf6", type: "dashed" as const },
                itemStyle: { color: "#8b5cf6" },
                data: data.map((d: any) => d.repeatPatients || 0),
              },
            ],
          };
          return (
            <div style={{ height: 340, overflowX: "auto" }}>
              <ReactECharts option={option} style={{ height: "100%", width: "100%" }} notMerge />
            </div>
          );
        })()}
        <InsightBox text={(() => {
          if (repeatView === "yearly") {
            if (repeatYearlyTrends.length === 0) return "No repeat-visit data yet for this date range.";
            if (repeatYearlyTrends.length === 1) { const y = repeatYearlyTrends[0]; return `${y.period}${y.isYtd ? " (so far)" : ""}: ${formatNum(y.repeatVisits)} repeat visits.`; }
            const lastFull = [...repeatYearlyTrends].reverse().find((y) => !y.isYtd && y.yoy != null);
            const ytd = repeatYearlyTrends.find((y) => y.isYtd);
            const base = lastFull ? `${lastFull.period}: ${lastFull.yoy! >= 0 ? "▲" : "▼"}${Math.abs(lastFull.yoy!)}% YoY.` : "";
            const ytdPart = ytd ? ` ${ytd.period} so far: ${formatNum(ytd.repeatVisits)}.` : "";
            return (base + ytdPart).trim() || "Not enough history to compare.";
          }
          const rows = repeatTrendData as Array<{ label: string; repeatVisits: number; repeatPatients: number }>;
          if (rows.length === 0) return "No repeat-visit data yet for this date range.";
          const peak = rows.reduce((a, b) => (a.repeatVisits > b.repeatVisits ? a : b));
          const totalV = rows.reduce((s, r) => s + (r.repeatVisits || 0), 0);
          const totalP = rows.reduce((s, r) => s + (r.repeatPatients || 0), 0);
          const avgRatio = totalP > 0 ? (totalV / totalP).toFixed(1) : null;
          const half = Math.max(1, Math.floor(rows.length / 2));
          const firstHalfAvg = (() => { const slice = rows.slice(0, half); const v = slice.reduce((s, r) => s + r.repeatVisits, 0); const p = slice.reduce((s, r) => s + r.repeatPatients, 0); return p > 0 ? v / p : null; })();
          const secondHalfAvg = (() => { const slice = rows.slice(-half); const v = slice.reduce((s, r) => s + r.repeatVisits, 0); const p = slice.reduce((s, r) => s + r.repeatPatients, 0); return p > 0 ? v / p : null; })();
          let gapTrend = "";
          if (firstHalfAvg != null && secondHalfAvg != null) {
            const delta = secondHalfAvg - firstHalfAvg;
            if (Math.abs(delta) / Math.max(firstHalfAvg, 0.01) >= 0.05) gapTrend = delta > 0 ? " Gap widening — same people returning more." : " Gap shrinking — more new repeat users.";
            else gapTrend = " Gap steady.";
          }
          const peakLabel = isDailyView ? "Busiest day" : "Busiest month";
          const ratioLine = avgRatio ? ` ${avgRatio} visits per repeat patient.` : "";
          const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const peakLabelFmt = (() => {
            const v = peak.label;
            if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { const [, m, d] = v.split("-"); return `${MONTHS[Number(m) - 1]} ${d}`; }
            if (/^\d{4}-\d{2}$/.test(v)) { const [y, m] = v.split("-"); return `${MONTHS[Number(m) - 1]} '${y.slice(2)}`; }
            return v;
          })();
          return `${peakLabel}: ${peakLabelFmt} — ${formatNum(peak.repeatVisits)} repeat visits.${ratioLine}${gapTrend}`;
        })()} />
      </CVCard>}

      {/* Capacity vs Booked vs Completed — grouped bar by specialty. */}
      {isChartVisible("capacityBookedCompleted") && <CVCard accentColor="#6366f1" title="Capacity vs Booked vs Completed" subtitle="Capacity vs booked & completed" tooltipText="Capacity = available consult slots derived from working hours; Booked = scheduled consults; Completed = successfully completed consults. Sourced from doctor_capacity (month × doctor × specialty); only the date range and specialty filters apply." chartId="capacityBookedCompleted" chartData={capacityData} chartTitle="Capacity vs Booked vs Completed" chartDescription="Sortable table by specialty with utilization %" dataPoints={capacityData.map((d) => d.specialty)} tableData={capacityTableData}>
        {capacityData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-[13px]" style={{ color: T.textMuted }}>
            No capacity data available for the selected filters.
          </div>
        ) : (
          <>
            {/* Sortable table: Capacity / Booked / Completed / Utilization%
                with an inline utilization mini-bar. Click a header to sort. */}
            {(() => {
              const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
              const rows = capacityData.map((d) => ({ ...d, util: pct(d.booked, d.capacity) }));
              const { key, dir } = capacitySort;
              const sorted = [...rows].sort((a, b) => {
                const cmp = key === "specialty"
                  ? a.specialty.localeCompare(b.specialty)
                  : Number((a as Record<string, number>)[key]) - Number((b as Record<string, number>)[key]);
                return dir === "asc" ? cmp : -cmp;
              });
              const toggleSort = (k: typeof key) =>
                setCapacitySort((p) => p.key === k
                  ? { key: k, dir: p.dir === "asc" ? "desc" : "asc" }
                  : { key: k, dir: k === "specialty" ? "asc" : "desc" });
              const arrow = (k: typeof key) => (key === k ? (dir === "asc" ? " ▲" : " ▼") : "");
              const numCols: { k: typeof key; label: string; color?: string }[] = [
                { k: "capacity", label: "Capacity" },
                { k: "booked", label: "Booked", color: "#6366f1" },
                { k: "completed", label: "Completed", color: "#0d9488" },
              ];
              return (
                <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                  <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        <th className="text-left font-semibold py-2 pr-3 cursor-pointer select-none" style={{ color: T.textSecondary }} onClick={() => toggleSort("specialty")}>Specialty{arrow("specialty")}</th>
                        {numCols.map((c) => (
                          <th key={c.k} className="text-right font-semibold py-2 px-3 cursor-pointer select-none whitespace-nowrap" style={{ color: T.textSecondary }} onClick={() => toggleSort(c.k)}>{c.label}{arrow(c.k)}</th>
                        ))}
                        <th className="text-left font-semibold py-2 pl-3 cursor-pointer select-none whitespace-nowrap" style={{ color: T.textSecondary, minWidth: 130 }} onClick={() => toggleSort("util")}>Utilization{arrow("util")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((d) => (
                        <tr key={d.specialty} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                          <td className="py-2 pr-3" style={{ color: T.textPrimary }}>{d.specialty}</td>
                          <td className="py-2 px-3 text-right tabular-nums" style={{ color: T.textSecondary }}>{formatNum(d.capacity)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: "#6366f1" }}>{formatNum(d.booked)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold" style={{ color: "#0d9488" }}>{formatNum(d.completed)}</td>
                          <td className="py-2 pl-3">
                            <div className="flex items-center gap-2">
                              <div className="relative h-[8px] rounded flex-1" style={{ backgroundColor: "#F1F3F9", minWidth: 56 }}>
                                <div className="absolute top-0 left-0 h-[8px] rounded" style={{ width: `${Math.min(d.util, 100)}%`, backgroundColor: "#6366f1" }} />
                              </div>
                              <span className="tabular-nums w-9 text-right" style={{ color: T.textSecondary }}>{d.util}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
            <InsightBox text={(() => {
              const totals = capacityData.reduce((s, d) => ({ cap: s.cap + d.capacity, booked: s.booked + d.booked, completed: s.completed + d.completed }), { cap: 0, booked: 0, completed: 0 });
              if (totals.booked === 0 && totals.completed === 0) {
                return `${formatNum(totals.cap)} slots across ${capacityData.length} ${capacityData.length === 1 ? "specialty" : "specialties"} — booked/completed not yet populated.`;
              }
              const util = totals.cap > 0 ? Math.round((totals.booked / totals.cap) * 100) : 0;
              const top = [...capacityData].sort((a, b) => b.capacity - a.capacity)[0];
              return `${formatNum(totals.booked)}/${formatNum(totals.cap)} slots booked (${util}% util) · ${formatNum(totals.completed)} completed.${top ? ` Most capacity: ${top.specialty}.` : ""}`;
            })()} />
          </>
        )}
      </CVCard>}

      {/* Data Audit — superadmin-only source + extraction logic per chart.
          Renders to null for every other role; provenance only arrives in
          the API payload for SUPER_ADMIN callers. */}
      <DataAuditSection provenance={utilizationData?._meta?.provenance} />

    </div>

    </>
  );
}
