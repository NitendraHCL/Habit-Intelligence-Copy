"use client";

import { T } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/contexts/auth-context";
import { useDashboardData } from "@/lib/hooks/useDashboardData";
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
  Table2,
  BarChart3,
  RotateCcw,
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
import { ChartComments } from "@/components/ui/chart-comments";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import DataAuditSection from "@/components/audit/DataAuditSection";
import type { DashboardProvenance } from "@/lib/audit/provenance";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Design Tokens (imported from shared theme) ───

// Desaturated categorical palette — each hue sits in a different
// family (indigo / teal / violet / cyan / slate / sage / clay) but
// at a similar gentle saturation, so no single bar pops against the
// dashboard's overall cool aesthetic.
const IMPRESSION_PALETTE = [
  "#5B6FCC", // muted indigo
  "#4C8F8F", // muted teal
  "#7E68B5", // muted violet
  "#3E92C9", // muted cyan
  "#9E8FCB", // muted lavender
  "#6FB6A8", // muted seafoam
  "#5C7A99", // muted slate-blue
  "#A0826D", // muted clay
  "#84A0B5", // muted sky
  "#75857A", // muted sage
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

// Period label formatter — mirrors the Utilization page so a YYYY-MM
// or YYYY-MM-DD string reads as "Mar '25" / "Mar 15" on both axes and
// tooltips. Anything that doesn't match either shape comes back as-is.
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

// ─── Card ───
type CVTableData = {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
  controls?: React.ReactNode;
};

function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, rightHeader, chartId, chartData, chartTitle, chartDescription, tableData,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; rightHeader?: React.ReactNode; chartId?: string;
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
                {rightHeader}
                {chartId && <ChartComments chartId={chartId} pageSlug="/portal/ohc/emotional-wellbeing" />}
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
  return <div className={`p-5 sm:p-6 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>{children}</div>;
}

// ─── Insight Box ───
// mt-auto pushes the box to the bottom of its flex parent so every chart's
// insight blob sits at the same y-coordinate across a row, regardless of the
// chart visualisation above it.
function InsightBox({ text }: { text: string }) {
  return (
    <div className="mt-auto pt-4">
      <div className="rounded-[14px] px-4 py-3.5 text-[12px] leading-[1.7] font-medium" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
        {text}
      </div>
    </div>
  );
}

// Compact bucket stat for hero-tile footers (color dot + label + count + %).
function BucketStat({ color, label, count, total }: { color: string; label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>{label}</span>
      </div>
      <div className="text-[16px] font-extrabold mt-0.5 leading-none tracking-[-0.01em]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>
        {formatNum(count)}
        <span className="text-[11px] font-medium ml-1" style={{ color: T.textMuted }}>· {pct}%</span>
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
      <div className="flex h-8 rounded-lg overflow-hidden mb-1.5">
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
      {/* Axis: black baseline with ticks at every 10%, labels at 0/50/100 */}
      <div className="relative h-2">
        <div className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: T.textPrimary }} />
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((p) => (
          <div key={p} className="absolute top-0" style={{ left: `${p}%`, width: 1, height: 6, transform: "translateX(-50%)", backgroundColor: T.textPrimary }} />
        ))}
      </div>
      <div className="relative h-4 mt-1 text-[10px] font-medium" style={{ color: T.textPrimary }}>
        <span className="absolute left-0">0%</span>
        <span className="absolute left-1/2 -translate-x-1/2">50%</span>
        <span className="absolute right-0">100%</span>
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
  usePageAccess("/portal/ohc/emotional-wellbeing");
  const { activeClientId } = useAuth();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1), to: new Date(2026, 2, 31),
  });
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

  const [demoTab, setDemoTab] = useState<"age" | "gender" | "location" | "shift" | "ageGender">("age");
  const [trendView, setTrendView] = useState<"year" | "month">("month");
  // Expanded years in the Consult Trends table view (year → month drill-down).
  const [expandedEwbYears, setExpandedEwbYears] = useState<Set<string>>(new Set());
  const [activeImpression, setActiveImpression] = useState<string>("");
  const [selectedVisitBucket, setSelectedVisitBucket] = useState<string>("");
  const [indiaMapReady, setIndiaMapReady] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility("/portal/ohc/emotional-wellbeing", previewConfig);

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

  // Use the dedicated /api/ohc/emotional-wellbeing route — sourced from
  // agg_kpi with speciality_name='Psychologist' baked in. One round-trip
  // per filter/date combo, cached by withCache server-side and SWR
  // client-side. This replaced a heavy /api/ohc/appointments fetch that
  // returned 1.4M rolled-up rows and was triggering perpetual loading.
  const ewbExtraParams = useMemo(() => ({
    dateFrom: format(appliedDateRange.from, "yyyy-MM-dd"),
    dateTo: format(appliedDateRange.to, "yyyy-MM-dd"),
    ...(appliedFilters.locations.length ? { locations: appliedFilters.locations.join(",") } : {}),
    ...(appliedFilters.genders.length ? { genders: appliedFilters.genders.join(",") } : {}),
    ...(appliedFilters.ageGroups.length ? { ageGroups: appliedFilters.ageGroups.join(",") } : {}),
    ...(appliedFilters.relations.length ? { relations: appliedFilters.relations.join(",") } : {}),
  }), [appliedDateRange, appliedFilters]);

  const { data: ewbApi, isLoading, isValidating, refresh, isRefreshing } = useDashboardData<{
    kpis?: { totalConsults?: number; uniquePatients?: number; repeatPatients?: number; totalEwbAssessed?: number };
    charts?: {
      demographics?: {
        age?: Array<{ label: string; count: number }>;
        gender?: Array<{ label: string; count: number }>;
        location?: Array<{ label: string; count: number }>;
        shift?: Array<{ label: string; count: number }>;
        ageGender?: Array<{ ageGroup: string; male: number; female: number; others: number; total: number }>;
      };
      consultTrends?: Array<{ period: string; totalConsults: number; uniquePatients: number }>;
      criticalRisk?: { suicidalThoughts: number; attemptedSelfHarm: number; previousAttempts: number; totalCases: number };
      substanceUsePct?: number;
      sleepQuality?: Array<{ label: string; count: number }>;
      sleepDuration?: Array<{ label: string; count: number }>;
      alcoholHabit?: Array<{ label: string; count: number }>;
      smokingHabit?: Array<{ label: string; count: number }>;
      smokingTrend?: Array<{ period: string; pct: number }>;
      visitPattern?: Array<{ label: string; count: number }>;
      impressions?: Array<{ label: string; count: number }>;
      impressionSubcategories?: Record<string, Array<{ label: string; count: number }>>;
      impressionsByVisitBucket?: Record<string, Array<{ label: string; count: number }>>;
      anxietyScale?: Array<{ label: string; count: number }>;
      depressionScale?: Array<{ label: string; count: number }>;
      selfEsteemScale?: Array<{ label: string; count: number }>;
    };
    _meta?: { provenance?: DashboardProvenance };
  }>("ohc/emotional-wellbeing", ewbExtraParams);

  // Fetch filter options once (Psychologist-aware via agg_kpi). The shared
  // /api/filters route returns global lists; the page narrows them as needed.
  const [filterOptions, setFilterOptions] = useState<{
    locations: string[]; genders: string[]; ageGroups: string[]; specialties: string[]; relations: string[];
  }>({
    locations: [],
    genders: ["Male", "Female", "Others"],
    ageGroups: ["<20", "21-30", "31-40", "41-50", "51-60", "60+"],
    specialties: [],
    relations: [],
  });
  useEffect(() => {
    if (!activeClientId) return;
    fetch(`/api/filters?clientId=${activeClientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.locations || data?.relationships) {
          setFilterOptions((prev) => ({
            ...prev,
            ...(data.locations ? { locations: data.locations } : {}),
            ...(data.relationships ? { relations: data.relationships } : {}),
          }));
        }
      })
      .catch(() => {});
  }, [activeClientId]);

  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const kpis = useMemo(() => ({
    totalConsults: ewbApi?.kpis?.totalConsults ?? 0,
    uniquePatients: ewbApi?.kpis?.uniquePatients ?? 0,
    repeatPatients: ewbApi?.kpis?.repeatPatients ?? 0,
    totalEwbAssessed: ewbApi?.kpis?.totalEwbAssessed ?? 0,
  }), [ewbApi?.kpis]);

  const charts = useMemo(() => {
    // KPI / Demographics / Consult Trends → from agg_kpi (Psychologist slice).
    // All EWB charts now sourced from aggregated_table.emotional_wellbeing.
    const c = ewbApi?.charts;
    return {
      demographics: {
        age: c?.demographics?.age ?? [],
        gender: c?.demographics?.gender ?? [],
        location: c?.demographics?.location ?? [],
        shift: [] as Array<{ label: string; count: number }>,
        ageGender: c?.demographics?.ageGender ?? [],
      },
      consultTrends: c?.consultTrends ?? [],
      criticalRisk: c?.criticalRisk ?? { suicidalThoughts: 0, attemptedSelfHarm: 0, previousAttempts: 0, totalCases: 0 },
      substanceUsePct: c?.substanceUsePct ?? 0,
      sleepQuality: c?.sleepQuality ?? [],
      sleepDuration: c?.sleepDuration ?? [],
      alcoholHabit: c?.alcoholHabit ?? [],
      smokingHabit: c?.smokingHabit ?? [],
      smokingTrend: c?.smokingTrend ?? [],
      visitPattern: c?.visitPattern ?? [],
      impressions: c?.impressions ?? [],
      impressionSubcategories: c?.impressionSubcategories ?? {},
      impressionsByVisitBucket: c?.impressionsByVisitBucket ?? {},
      anxietyScale: c?.anxietyScale ?? [],
      depressionScale: c?.depressionScale ?? [],
      selfEsteemScale: c?.selfEsteemScale ?? [],
    };
  }, [ewbApi?.charts]);

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
  const demoData: Array<{ label: string; count: number }> = demoTab === "ageGender" ? [] : (charts?.demographics?.[demoTab] || []);
  const ageGenderData = charts?.demographics?.ageGender || [];

  // Impressions — filtered by selected visit bucket. Normalise either field
  // name (the API returns `label`, the legacy aggregator returned `category`)
  // to a single `category` shape so downstream colour maps + renderers work.
  const allImpressions: Array<{ category: string; count: number }> = (charts?.impressions || []).map((i: { label?: string; category?: string; count: number }) => ({
    category: i.category ?? i.label ?? "Unknown",
    count: i.count,
  }));
const impressionsByBucket: Record<string, Array<{ category: string; count: number }>> = Object.fromEntries(Object.entries(charts?.impressionsByVisitBucket || {}).map(([key, arr]) => [key, (arr as Array<{ label?: string; category?: string; count: number }>).map(i => ({ category: i.category ?? i.label ?? "Unknown", count: i.count }))]));
  const impressions = selectedVisitBucket && impressionsByBucket[selectedVisitBucket]
    ? impressionsByBucket[selectedVisitBucket]
    : allImpressions;
  const totalImpressions = impressions.reduce((s, i) => s + i.count, 0);
  const impressionColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    allImpressions.forEach((im, i) => { map[im.category] = getImpressionColor(i); });
    return map;
  }, [allImpressions]);
  // Section 6 (Impressions Analysis Detail) uses a fixed taxonomy of
  // consultation reasons. Tabs render even when the warehouse has no
  // matching data — counts default to 0 and the subcategory panel will
  // show its empty state until backend wiring lands.
  const IMPRESSION_DETAIL_TABS = ["Family", "Career", "Self Improvement", "Health", "Relationship", "Financial", "Psychological disorders", "Sexual Wellness", "LGBTQIA"];
  const detailImpressions = IMPRESSION_DETAIL_TABS.map((category) => {
    const found = impressions.find((i) => i.category === category);
    return { category, count: found?.count || 0 };
  });
  const detailTotal = detailImpressions.reduce((s, i) => s + i.count, 0);
  const detailColorMap: Record<string, string> = Object.fromEntries(
    IMPRESSION_DETAIL_TABS.map((c, i) => [c, getImpressionColor(i)])
  );
  const selectedImpression = activeImpression || IMPRESSION_DETAIL_TABS[0];
const subcategories: Array<{ subcategory: string; count: number }> = (charts?.impressionSubcategories?.[selectedImpression] || []).map((i: { label?: string; subcategory?: string; count: number }) => ({ subcategory: i.subcategory ?? i.label ?? "Unknown", count: i.count }));

  // Scales
  const anxietyScale: Array<{ label: string; count: number }> = charts?.anxietyScale || [];
  const depressionScale: Array<{ label: string; count: number }> = charts?.depressionScale || [];
  const selfEsteemScale: Array<{ label: string; count: number }> = charts?.selfEsteemScale || [];

  // Sleep, Alcohol, Smoking, Visit Pattern, Critical Risk, Substance Use
  const sleepQuality: Array<{ label: string; count: number }> = charts?.sleepQuality || [];
  const sleepDuration: Array<{ label: string; count: number }> = charts?.sleepDuration || [];
  const alcoholHabit: Array<{ label: string; count: number }> = charts?.alcoholHabit || [];
  const smokingHabit: Array<{ label: string; count: number }> = charts?.smokingHabit || [];
  const smokingTrend: Array<{ period: string; pct: number }> = (charts as any)?.smokingTrend || [];
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

  if (!ewbApi && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  // ── Table-view data for each chart (Chart ⇄ Table toggle) — PLAIN CONSTS
  // (not hooks) since they sit after the loading early-return above. ───────
  const pctOf = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "0%");
  // Generic label/count table with % of total + total row.
  const lcTable = (items: { label: string; count: number }[], labelHeader: string, valueHeader = "Patients"): CVTableData => {
    const arr = items || [];
    const total = arr.reduce((s, i) => s + Number(i.count || 0), 0);
    const rows: Record<string, React.ReactNode>[] = arr.map((i) => ({ label: i.label, count: formatNum(i.count), pct: pctOf(Number(i.count || 0), total) }));
    rows.push({ __group: true, label: "Total", count: formatNum(total), pct: "100%" });
    return {
      columns: [
        { key: "label", label: labelHeader, align: "left" },
        { key: "count", label: valueHeader, align: "right" },
        { key: "pct", label: "% of Total", align: "right" },
      ], rows,
    };
  };

  // Consult Trends — clubbed by year (clickable band); click to drill into months.
  const EWB_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const toggleEwbYear = (y: string) => setExpandedEwbYears((prev) => { const n = new Set(prev); if (n.has(y)) n.delete(y); else n.add(y); return n; });
  const consultTrendsTable: CVTableData = (() => {
    const raw = (charts?.consultTrends || []) as { period: string; totalConsults: number; uniquePatients: number }[];
    const byYear: Record<string, { tc: number; items: any[] }> = {};
    for (const r of raw) { const y = String(r.period || "").slice(0, 4); if (!y) continue; if (!byYear[y]) byYear[y] = { tc: 0, items: [] }; byYear[y].tc += Number(r.totalConsults || 0); byYear[y].items.push(r); }
    const rows: Record<string, React.ReactNode>[] = [];
    for (const y of Object.keys(byYear).sort()) {
      const yd = byYear[y]; const open = expandedEwbYears.has(y);
      rows.push({
        __group: true,
        period: (<button onClick={() => toggleEwbYear(y)} className="flex items-center gap-1.5 font-bold" style={{ color: T.textPrimary }}><ChevronDown size={12} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />{y}</button>),
        totalConsults: formatNum(yd.tc), unique: "—",
      });
      if (open) for (const r of [...yd.items].sort((a, b) => String(a.period).localeCompare(String(b.period)))) { const m = String(r.period).slice(5, 7); rows.push({ period: <span style={{ paddingLeft: 22 }}>{`${EWB_MONTH_ABBR[Number(m) - 1] || m} ${y}`}</span>, totalConsults: formatNum(r.totalConsults), unique: formatNum(r.uniquePatients) }); }
    }
    return { columns: [{ key: "period", label: "Year", align: "left" }, { key: "totalConsults", label: "Total Consults", align: "right" }, { key: "unique", label: "Unique Patients", align: "right" }], rows };
  })();

  // Demographics — age × gender crosstab (richest view).
  const demoTable: CVTableData = (() => {
    const data = (ageGenderData || []) as { ageGroup: string; male: number; female: number; total: number }[];
    let tm = 0, tf = 0, tt = 0;
    const rows: Record<string, React.ReactNode>[] = data.map((r) => { const m = Number(r.male || 0), f = Number(r.female || 0), t = Number(r.total || (m + f)); tm += m; tf += f; tt += t; return { ageGroup: r.ageGroup, male: formatNum(m), female: formatNum(f), total: formatNum(t) }; });
    rows.push({ __group: true, ageGroup: "Total", male: formatNum(tm), female: formatNum(tf), total: formatNum(tt) });
    return { columns: [{ key: "ageGroup", label: "Age Group", align: "left" }, { key: "male", label: "Male", align: "right" }, { key: "female", label: "Female", align: "right" }, { key: "total", label: "Total", align: "right" }], rows };
  })();

  // Critical Risk — indicators with case counts.
  const criticalRiskTable: CVTableData = {
    columns: [{ key: "indicator", label: "Indicator", align: "left" }, { key: "cases", label: "Cases", align: "right" }],
    rows: [
      { indicator: "Suicidal Thoughts", cases: formatNum(criticalRisk.suicidalThoughts) },
      { indicator: "Attempted Self Harm", cases: formatNum(criticalRisk.attemptedSelfHarm) },
      { indicator: "Previous Attempts", cases: formatNum(criticalRisk.previousAttempts) },
      { __group: true, indicator: "Total Cases", cases: formatNum(criticalRisk.totalCases) },
    ],
  };

  // Substance Use — reported vs not, derived from the % and assessed total.
  const substanceUseTable: CVTableData = (() => {
    const reported = Math.round((substanceUsePct / 100) * totalEwbAssessed);
    const notReported = Math.max(0, totalEwbAssessed - reported);
    return {
      columns: [{ key: "status", label: "Status", align: "left" }, { key: "patients", label: "Patients", align: "right" }, { key: "pct", label: "% of Assessed", align: "right" }],
      rows: [
        { status: "Reported substance use", patients: formatNum(reported), pct: `${substanceUsePct}%` },
        { status: "No / not reported", patients: formatNum(notReported), pct: `${Math.max(0, 100 - substanceUsePct)}%` },
        { __group: true, status: "Total assessed", patients: formatNum(totalEwbAssessed), pct: "100%" },
      ],
    };
  })();

  // Simple label/count tables.
  const sleepQualityTable = lcTable(sleepQuality, "Sleep Quality");
  const sleepDurationTable = lcTable(sleepDuration, "Sleep Duration");
  const alcoholHabitTable = lcTable(alcoholHabit, "Alcohol Habit");
  const smokingHabitTable = lcTable(smokingHabit, "Smoking Status");
  const visitPatternTable = lcTable(visitPattern, "Visits");
  const anxietyTable = lcTable(anxietyScale, "Anxiety Level");
  const depressionTable = lcTable(depressionScale, "Depression Level");
  const selfEsteemTable = lcTable(selfEsteemScale, "Self-Esteem Level");
  const impressionsTable = lcTable(impressions.map((i) => ({ label: i.category, count: i.count })), "Impression");
  const detailImpressionsTable = lcTable(detailImpressions.map((i) => ({ label: i.category, count: i.count })), "Category");

  return (
    <div className="animate-fade-in animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
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
        <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
        <FilterMultiSelect label="Relationship" options={filterOptions.relations} selected={pageFilters.relations} onChange={(v) => setPageFilters((p) => ({ ...p, relations: v }))} />
        <div className="flex-1" />
        <PageDownload pageTitle="Emotional Wellbeing" />
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
        fallbackSummary={`${formatNum(kpis?.totalConsults || 0)} emotional wellbeing consultations from ${formatNum(kpis?.uniquePatients || 0)} unique employees. ${formatNum(kpis?.repeatPatients || 0)} came back for a second session. The screening charts below break this down by anxiety and depression severity.`}
        fallbackChips={[
          { label: "Total Consults", value: formatNum(kpis?.totalConsults || 0) },
          { label: "Unique Patients", value: formatNum(kpis?.uniquePatients || 0) },
          { label: "Repeat Patients", value: formatNum(kpis?.repeatPatients || 0) },
        ]}
      />

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 1: KPIs + Demographics + Trends   */}
      {/* ══════════════════════════════════════════ */}
      {isChartVisible("ewbKpis") && (() => {
        const tc = Number(kpis?.totalConsults || 0);
        const up = Number(kpis?.uniquePatients || 0);
        const rp = Number(kpis?.repeatPatients || 0);
        const avgPerPatient = up > 0 ? (tc / up).toFixed(1) : "0";
        const repeatRate = up > 0 ? Math.round((rp / up) * 100) : 0;
        const oneVisit = up - rp;
        const visitsFromRepeats = tc - oneVisit;
        const avgPerRepeat = rp > 0 ? (visitsFromRepeats / rp).toFixed(1) : "0";
        const kpiList = [
          {
            label: "Total Consults",
            value: tc,
            icon: <TrendingUp size={18} />,
            color: T.teal,
            tooltipText: "Completed Psychologist consultations in the selected range. Cancellations and no-shows are excluded.",
            descriptor: "Psychologist visits",
            insight: tc === 0 || up === 0 ? "No completed consultations in this range yet." : `Average ${avgPerPatient} visits per patient across the program.`,
          },
          {
            label: "Unique Patients",
            value: up,
            icon: <Users size={18} />,
            color: "#4f46e5",
            tooltipText: "Distinct patients (by UHID) with at least one completed Psychologist consultation in the range.",
            descriptor: "Distinct patients",
            insight: up === 0 ? "No unique patients in this range yet." : `${repeatRate}% came back for another session.`,
          },
          {
            label: "Repeat Patients",
            value: rp,
            icon: <Repeat size={18} />,
            color: T.teal,
            tooltipText: "Patients with two or more completed Psychologist consultations inside the selected range.",
            descriptor: "Returning patients",
            insight: rp === 0 ? "No returning patients in this range yet." : visitsFromRepeats <= 0 ? "No returning-patient visits in this range yet." : `Avg ${avgPerRepeat} visits per returning patient.`,
          },
        ];
        return (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {kpiList.map((k) => (
              <div key={k.label} className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
                <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-medium tracking-[0.08em]" style={{ color: T.textSecondary }}>{k.label}</p>
                      <Tooltip><TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger><TooltipContent className="text-xs max-w-xs">{k.tooltipText}</TooltipContent></Tooltip>
                    </div>
                    <span style={{ color: T.textMuted }}>{k.icon}</span>
                  </div>
                  <p className="text-[34px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: k.color }}>{formatNum(k.value)}</p>
                  <p className="text-xs mt-2" style={{ color: T.textSecondary }}>{k.descriptor}</p>
                  <div className="mt-auto pt-4">
                    <p className="text-xs leading-relaxed rounded-xl px-3 py-2" style={{ backgroundColor: "#eef2ff", color: T.textSecondary, border: "1px solid #c7d2fe" }}>
                      {k.insight}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Patient Demographics */}
        {isChartVisible("ewbDemographics") && <CVCard accentColor={T.teal} title="Patient Demographics" subtitle="Each tab shows the patient distribution by age, gender, or the two combined." tooltipText="Three tabs. Age shows a bar chart of patients per age band; Gender shows two proportional circles; Age × Gender shows a stacked horizontal bar with the gender mix inside each age band." chartId="ewbDemographics" chartData={demoData} chartTitle="Patient Demographics" chartDescription="Demographic distribution of patients" tableData={demoTable}>
          <div className="flex gap-0 border-b mb-4" style={{ borderColor: T.border }}>
            {([
              { id: "age" as const, label: "Age" },
              { id: "gender" as const, label: "Gender" },
              { id: "ageGender" as const, label: "Age × Gender" },
            ]).map((tab) => (
              <button key={tab.id} onClick={() => setDemoTab(tab.id)}
                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-all ${demoTab === tab.id ? "border-current" : "border-transparent"}`}
                style={{ color: demoTab === tab.id ? T.teal : T.textMuted }}>
                {tab.label}
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
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: T.textSecondary }} />
                      <YAxis tick={{ fontSize: 10, fill: T.textSecondary }} />
                      <RechartsTooltip content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const value = Number(payload[0]?.value || 0);
                        const total = demoData.reduce((s, d) => s + d.count, 0);
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        return (
                          <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                            <p>Patients: <strong>{formatNum(value)}</strong> ({pct}% of total)</p>
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

            {/* ── Age × Gender: Stacked Horizontal Bar ── */}
            {demoTab === "ageGender" && (() => {
              if (ageGenderData.length === 0) {
                return <div className="flex items-center justify-center h-full text-[12px]" style={{ color: T.textMuted }}>No age × gender data for this range.</div>;
              }
              const COLORS = { male: "#0d9488", female: "#a78bfa", others: "#a1a1aa" };
              return (
                <div style={{ height: 270 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ageGenderData} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: T.textSecondary }} />
                      <YAxis type="category" dataKey="ageGroup" width={56} tick={{ fontSize: 11, fill: T.textSecondary }} />
                      <RechartsTooltip content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload || {};
                        const total = row.total || 0;
                        const pct = (v: number) => total > 0 ? Math.round((v / total) * 100) : 0;
                        return (
                          <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            <p className="font-bold mb-1.5" style={{ color: T.textPrimary }}>{label}</p>
                            <p style={{ color: COLORS.male }}>Male: <strong>{formatNum(row.male || 0)}</strong> ({pct(row.male || 0)}%)</p>
                            <p style={{ color: COLORS.female }}>Female: <strong>{formatNum(row.female || 0)}</strong> ({pct(row.female || 0)}%)</p>
                            {row.others > 0 && <p style={{ color: COLORS.others }}>Others: <strong>{formatNum(row.others)}</strong> ({pct(row.others)}%)</p>}
                            <p className="mt-1 pt-1 border-t" style={{ borderColor: T.borderLight, color: T.textPrimary }}>Total: <strong>{formatNum(total)}</strong></p>
                          </div>
                        );
                      }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                      <Bar dataKey="male" stackId="a" fill={COLORS.male} name="Male" />
                      <Bar dataKey="female" stackId="a" fill={COLORS.female} name="Female" />
                      <Bar dataKey="others" stackId="a" fill={COLORS.others} name="Others" />
                    </BarChart>
                  </ResponsiveContainer>
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
                  <PolarRadiusAxis tick={{ fontSize: 9, fill: T.textSecondary }} angle={30} />
                  <RechartsTooltip contentStyle={{ borderRadius: 12, border: `1px solid ${T.border}`, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }} />
                  <Radar name="Patients" dataKey="count" stroke={T.teal} fill={T.teal} fillOpacity={0.3} strokeWidth={2} dot={{ r: 4, fill: T.teal }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
          <InsightBox text={(() => {
            if (demoTab === "ageGender") {
              if (ageGenderData.length === 0) return "No age × gender data in this range yet.";
              const grandTotal = ageGenderData.reduce((s, r) => s + r.total, 0);
              let topGroup = ageGenderData[0].ageGroup;
              let topGender = "Male";
              let topCount = 0;
              for (const row of ageGenderData) {
                if (row.male > topCount) { topCount = row.male; topGroup = row.ageGroup; topGender = "Male"; }
                if (row.female > topCount) { topCount = row.female; topGroup = row.ageGroup; topGender = "Female"; }
                if (row.others > topCount) { topCount = row.others; topGroup = row.ageGroup; topGender = "Others"; }
              }
              const pct = grandTotal > 0 ? Math.round((topCount / grandTotal) * 100) : 0;
              return `Top cohort: ${topGroup} · ${topGender} — ${formatNum(topCount)} patients (${pct}% of all).`;
            }
            if (demoData.length === 0) return "No demographic data in this range yet.";
            const top = [...demoData].sort((a, b) => b.count - a.count)[0];
            const total = demoData.reduce((s, d) => s + d.count, 0);
            const pct = total > 0 ? Math.round((top.count / total) * 100) : 0;
            const dim = demoTab === "shift" ? "shift" : demoTab === "location" ? "location" : demoTab === "gender" ? "gender" : "age group";
            return `Top ${dim}: ${top.label} — ${formatNum(top.count)} patients (${pct}% of those seen).`;
          })()} />
        </CVCard>}

        {/* Consult Trends */}
        {isChartVisible("ewbTrends") && <CVCard accentColor={T.teal} title="Consult Trends" subtitle="Each point shows the total consults and the unique patients for that period." tooltipText="Line chart tracking total consults and unique patients over time. Toggle between yearly and monthly views. The gap between total and unique lines reveals repeat visit frequency (employees who availed the service at least twice in the selected date range) — a wider gap means more patients are returning for multiple sessions, which may indicate ongoing mental health needs."
          chartId="ewbTrends" chartData={trendData} chartTitle="Consult Trends" chartDescription="View of total and unique consults" tableData={consultTrendsTable}

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
          {/* KPI strip: Period Total · MoM/YoY % · Peak — all computed from trendData */}
          {(() => {
            if (!trendData.length) return null;
            const periodTotal = trendData.reduce((s, r) => s + r.totalConsults, 0);
            const last = trendData[trendData.length - 1];
            const prev = trendData.length >= 2 ? trendData[trendData.length - 2] : null;
            const deltaPct = prev && prev.totalConsults > 0
              ? ((last.totalConsults - prev.totalConsults) / prev.totalConsults) * 100
              : null;
            const peak = trendData.reduce((m, r) => (r.totalConsults > m.totalConsults ? r : m), trendData[0]);
            const formatPeriod = (p: string) => {
              if (trendView === "year") return p;
              const [y, m] = p.split("-");
              if (!y || !m) return p;
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              return `${months[parseInt(m, 10) - 1] || m} ${y}`;
            };
            const deltaLabel = trendView === "year" ? "YoY" : "MoM";
            const peakLabel = trendView === "year" ? "Peak Year" : "Peak Month";
            const deltaPositive = deltaPct != null && deltaPct >= 0;
            const deltaColor = deltaPct == null ? T.textMuted : deltaPositive ? "#0d9488" : "#dc2626";

            const periodTotalTip = `Sum of total consults across all ${trendView === "year" ? "years" : "months"} in the current filter window. Counts every Psychologist consult — repeat visits by the same patient are counted each time.`;
            const deltaTip = trendView === "year"
              ? `Year-over-year change in total consults — compares the most recent year against the year before. ▲ green = growth, ▼ red = decline. Shows "—" when only one year is in range.`
              : `Month-over-month change in total consults — compares the latest month against the month before. ▲ green = growth, ▼ red = decline. Shows "—" when only one month is in range.`;
            const peakTip = trendView === "year"
              ? `The single year with the highest total diagnosis count in the current filter window. Useful for spotting outlier years driven by campaigns, incidents, or seasonality.`
              : `The single month with the highest total diagnosis count in the current filter window. Helps spot demand spikes (e.g., post-appraisal cycles, exam stress windows).`;

            return (
              <div className="grid grid-cols-3 gap-3 mb-4 mt-1">
                <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: T.border, backgroundColor: T.white }}>
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Period Total</p>
                    <Tooltip>
                      <TooltipTrigger><Info size={11} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{periodTotalTip}</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-[20px] font-extrabold leading-tight tracking-[-0.02em] mt-0.5" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(periodTotal)}</p>
                  <p className="text-[10.5px] mt-0.5" style={{ color: T.textSecondary }}>consults</p>
                </div>
                <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: T.border, backgroundColor: T.white }}>
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{deltaLabel} Change</p>
                    <Tooltip>
                      <TooltipTrigger><Info size={11} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{deltaTip}</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-[20px] font-extrabold leading-tight tracking-[-0.02em] mt-0.5 flex items-center gap-1" style={{ color: deltaColor, fontVariantNumeric: "tabular-nums" }}>
                    {deltaPct == null ? "—" : (
                      <>
                        <span aria-hidden>{deltaPositive ? "▲" : "▼"}</span>
                        {Math.abs(deltaPct).toFixed(1)}%
                      </>
                    )}
                  </p>
                  <p className="text-[10.5px] mt-0.5 truncate" style={{ color: T.textSecondary }}>
                    {prev ? `vs ${formatPeriod(prev.period)}` : "no prior period"}
                  </p>
                </div>
                <div className="rounded-xl border px-3.5 py-2.5" style={{ borderColor: T.border, backgroundColor: T.white }}>
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{peakLabel}</p>
                    <Tooltip>
                      <TooltipTrigger><Info size={11} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{peakTip}</TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-[20px] font-extrabold leading-tight tracking-[-0.02em] mt-0.5 truncate" style={{ color: T.textPrimary }}>{formatPeriod(peak.period)}</p>
                  <p className="text-[10.5px] mt-0.5" style={{ color: T.textSecondary, fontVariantNumeric: "tabular-nums" }}>{formatNum(peak.totalConsults)} consults</p>
                </div>
              </div>
            );
          })()}
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(trendData.length * 50, 400), height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: T.textSecondary }} tickFormatter={formatPeriodLabel} />
                  <YAxis tick={{ fontSize: 10, fill: T.textSecondary }} />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{formatPeriodLabel(String(label ?? ""))}</p>
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
          <InsightBox text={(() => {
            const trends = charts?.consultTrends || [];
            if (trends.length === 0) return "No consult-trend data yet for this range.";
            const totalC = trends.reduce((s, p) => s + (p.totalConsults || 0), 0);
            const peak = trends.reduce((a, b) => ((a.totalConsults || 0) > (b.totalConsults || 0) ? a : b));
            return `Across ${trends.length} period${trends.length === 1 ? "" : "s"}: ${formatNum(totalC)} consults total. Busiest was ${peak.period} (${formatNum(peak.totalConsults || 0)}).`;
          })()} />
        </CVCard>}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 2: Critical Risk + Substance Use  */}
      {/* ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isChartVisible("criticalRisk") && <CVCard accentColor={"#4f46e5"} title="Critical Risk (Self Harm)" subtitle="Each row shows the patients flagged on one critical risk indicator." tooltipText="Three indicators — Suicidal Thoughts, Attempted Self Harm, and Other Critical Cases — shown as red bars with the patient count and percentage of those assessed. The Total Critical Cases row sums all flags."
          chartId="criticalRisk" chartData={criticalRisk} chartTitle="Critical Risk (Self Harm)" chartDescription="Critical risk indicators for self harm" tableData={criticalRiskTable}
>
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
          <InsightBox text={(() => {
            const totalCases = criticalRisk.totalCases || (criticalRisk.suicidalThoughts + criticalRisk.attemptedSelfHarm + criticalRisk.previousAttempts);
            if (totalCases === 0) return "None flagged in this range — keep monitoring.";
            return `${formatNum(totalCases)} patient${totalCases === 1 ? "" : "s"} flagged across the three indicators — each one needs a documented follow-up.`;
          })()} />
        </CVCard>}

        {isChartVisible("substanceUse") && <CVCard accentColor={T.amber} title="Substance Use" subtitle={`${substanceUsePct}% of the ${formatNum(totalEwbAssessed)} employees assessed reported substance use`} tooltipText="Gauge showing the share of assessed employees who reported any substance use. The denominator is the total emotional-wellbeing assessments in the selected range." chartId="substanceUse" chartData={{ substanceUsePct }} chartTitle="Substance Use" chartDescription="Percentage of assessed employees reporting substance use" tableData={substanceUseTable}>
          <div className="flex items-center justify-center" style={{ height: 260 }}>
            <ReactECharts style={{ height: "100%", width: "100%" }} option={{
              series: [{
                type: "gauge",
                startAngle: 200,
                endAngle: -20,
                center: ["50%", "72%"],
                radius: "115%",
                min: 0,
                max: 100,
                pointer: { show: false },
                progress: { show: true, width: 26, roundCap: true, itemStyle: { color: T.amber } },
                axisLine: { lineStyle: { width: 26, color: [[1, "#E8E8E8"]] } },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { show: false },
                detail: { fontSize: 44, fontWeight: 800, color: T.textPrimary, offsetCenter: [0, "5%"], formatter: "{value}%" },
                data: [{ value: substanceUsePct }],
              }],
              graphic: [
                { type: "text", left: "12%", bottom: "8%", style: { text: "0%", fontSize: 12, fontWeight: 600, fill: T.textSecondary, align: "left" } },
                { type: "text", right: "12%", bottom: "8%", style: { text: "100%", fontSize: 12, fontWeight: 600, fill: T.textSecondary, align: "right" } },
              ],
            }} />
          </div>
          <InsightBox text={(() => {
            if (totalEwbAssessed === 0) return "No assessments in this range yet.";
            const approxCount = Math.round((substanceUsePct / 100) * totalEwbAssessed);
            return `${substanceUsePct}% of assessed employees (~${formatNum(approxCount)} people) report substance use.`;
          })()} />
        </CVCard>}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 3: Sleep + Habits (Lavender)      */}
      {/* ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sleep Quality */}
        {isChartVisible("sleepQuality") && <CVCard accentColor={"#6366f1"} title="Sleep Quality" subtitle="Each bar shows the number of patients in one sleep-quality bucket." tooltipText="Bar chart of sleep-quality buckets (Good, Average, Poor). Taller bars mean more patients in that bucket." chartId="sleepQuality" chartData={sleepQuality} chartTitle="Sleep Quality" chartDescription="Sleep Quality Analysis" tableData={sleepQualityTable}>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(sleepQualitySorted.length * 70, 300), height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sleepQualitySorted} margin={{ top: 20, right: 10, left: 0, bottom: 20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.textSecondary }} />
                  <YAxis tick={{ fontSize: 10, fill: T.textSecondary }} />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const value = Number(payload[0]?.value || 0);
                    const total = sleepQualitySorted.reduce((s, d) => s + d.count, 0);
                    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                        <p>Patients: <strong>{formatNum(value)}</strong> ({pct}% of total)</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="count" maxBarSize={60} radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 12, fontWeight: 700, fill: T.textPrimary }}>
                    {sleepQualitySorted.map((d) => <Cell key={d.label} fill={SLEEP_Q_COLORS[d.label] || "#818cf8"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <InsightBox text={(() => {
            if (sleepQuality.length === 0) return "No sleep-quality data yet for this range.";
            const total = sleepQuality.reduce((s, d) => s + d.count, 0);
            const top = [...sleepQuality].sort((a, b) => b.count - a.count)[0];
            const pct = total > 0 ? Math.round((top.count / total) * 100) : 0;
            return `The largest bucket is ${top.label} at ${pct}% of patients (${formatNum(top.count)} of ${formatNum(total)}).`;
          })()} />
        </CVCard>}

        {/* Sleep Duration — hero stat tile */}
        {isChartVisible("sleepDuration") && <CVCard accentColor={"#6366f1"} title="Sleep Duration" subtitle="The share of assessed employees who sleep under seven hours a night." tooltipText="Hero metric showing the share of assessed employees sleeping <7 hours nightly, with a 'X in Y' framing for quick communication. Bottom row breaks down well-rested, sleep-deprived, and unreported buckets with patient counts." chartId="sleepDuration" chartData={sleepDuration} chartTitle="Sleep Duration" chartDescription="Hero stat: share of employees sleeping <7 hours" tableData={sleepDurationTable}>
          {(() => {
            // API returns the warehouse's native sleep_duration buckets:
            // "7-9 hrs" / "Less than 7 hrs" / "More than 9 hrs". Fold the
            // two ≥7-hour buckets into a single well-rested count.
            const findCount = (label: string) => sleepDuration.find((d) => d.label === label)?.count || 0;
            const sevenToNine = findCount("7-9 hrs");
            const moreThanNine = findCount("More than 9 hrs");
            const enough = sevenToNine + moreThanNine;
            const notEnough = findCount("Less than 7 hrs");
            const nr = findCount("Not Reported");
            const total = enough + notEnough + nr;
            const reported = enough + notEnough;
            const deprivedPct = reported > 0 ? Math.round((notEnough / reported) * 100) : 0;
            const oneIn = notEnough > 0 ? Math.max(2, Math.round(reported / notEnough)) : 0;
            const COLORS = { deprived: "#dc2626", rested: "#0d9488", nr: "#cbd5e1" };
            return (
              <div className="flex flex-col" style={{ minHeight: 240 }}>
                {/* Hero */}
                <div className="flex flex-col items-center justify-center py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: T.textMuted }}>
                    Sleep Deprived
                  </p>
                  <p className="text-[44px] font-extrabold leading-none tracking-[-0.03em] font-[var(--font-inter)] mt-1.5"
                     style={{ color: COLORS.deprived, fontVariantNumeric: "tabular-nums" }}>
                    {oneIn > 0 ? `1 in ${oneIn}` : "—"}
                  </p>
                  <p className="text-[12px] mt-2" style={{ color: T.textSecondary }}>
                    <strong style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(notEnough)}</strong>
                    {" of "}
                    <strong style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(reported)}</strong>
                    {" reported"} sleep less than 7 hours nightly
                  </p>
                </div>

                {/* Proportional bar (segments only on reported responses) */}
                <div className="mt-2">
                  <div className="flex w-full h-2 rounded-full overflow-hidden bg-[#F1F5F9]">
                    {reported > 0 && (
                      <>
                        <div style={{ width: `${(notEnough / reported) * 100}%`, backgroundColor: COLORS.deprived }} />
                        <div style={{ width: `${(enough / reported) * 100}%`, backgroundColor: COLORS.rested }} />
                      </>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[11px]" style={{ color: T.textMuted }}>
                    <span>{deprivedPct}% sleep &lt;7 hours</span>
                    <span>{reported > 0 ? 100 - deprivedPct : 0}% well-rested</span>
                  </div>
                </div>

                {/* Bucket footer */}
                <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t" style={{ borderColor: T.border }}>
                  <BucketStat color={COLORS.rested} label="≥7 hrs" count={enough} total={total} />
                  <BucketStat color={COLORS.deprived} label="<7 hrs" count={notEnough} total={total} />
                  <BucketStat color={COLORS.nr}      label="Not Reported" count={nr} total={total} />
                </div>
              </div>
            );
          })()}
          <InsightBox text={(() => {
            const find = (l: string) => sleepDuration.find((d) => d.label === l)?.count || 0;
            const notEnough = find("Less than 7 hrs");
            const reported = notEnough + find("7-9 hrs") + find("More than 9 hrs");
            if (reported === 0) return "No sleep-duration data yet for this range.";
            if (notEnough === 0) return "Every reporting employee sleeps at least 7 hours.";
            const oneIn = Math.max(2, Math.round(reported / notEnough));
            return `1 in ${oneIn} assessed employees sleeps under 7 hours — ${formatNum(notEnough)} of ${formatNum(reported)} reporting.`;
          })()} />
        </CVCard>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alcohol Habit */}
        {isChartVisible("alcoholHabit") && <CVCard accentColor={"#6366f1"} title="Alcohol Habit" subtitle="Each dot is 1% of assessed employees, coloured by alcohol-consumption status." tooltipText="100-cell waffle on responders only — each cell is 1% of those who reported. Amber cells are drinkers, teal are non-drinkers. Headline shows the '1 in X' framing; Not Reported is shown separately in the legend." chartId="alcoholHabit" chartData={alcoholHabit} chartTitle="Alcohol Habit" chartDescription="Pictograph of alcohol consumption among assessed employees" tableData={alcoholHabitTable}>
          {(() => {
            const yes = alcoholHabit.find((d) => d.label === "Yes")?.count || 0;
            const no = alcoholHabit.find((d) => d.label === "No")?.count || 0;
            const nr = alcoholHabit.find((d) => d.label === "Not Reported")?.count || 0;
            const reported = yes + no;
            // Percentages base on REPORTED responses only — Not Reported is
            // shown as a side note, never as part of the share denominator.
            const yesPct = reported > 0 ? Math.round((yes / reported) * 100) : 0;
            const noPct = reported > 0 ? Math.max(0, 100 - yesPct) : 0;
            const COLORS = { yes: "#d97706", no: "#0d9488", nr: "#cbd5e1" };
            // 100-dot waffle filled by drinker / non-drinker share of reported.
            const cells: ("yes" | "no")[] = [];
            for (let i = 0; i < yesPct; i++) cells.push("yes");
            while (cells.length < 100) cells.push("no");
            const oneInX = yesPct >= 2 ? Math.max(2, Math.round(100 / yesPct)) : null;
            return (
              <div className="flex flex-col items-center mt-2">
                {/* Hero stat */}
                <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: COLORS.yes }}>
                  {oneInX ? `1 in ${oneInX}` : `${yesPct}%`}
                </p>
                <p className="text-[12.5px] mt-2 text-center" style={{ color: T.textSecondary }}>
                  of <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(reported)}</span> who reported consume alcohol
                </p>

                {/* Waffle: 10 × 10 grid, each cell = 1% of reported. */}
                <div
                  className="mt-5 grid"
                  style={{
                    gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
                    gap: 4,
                    width: "100%",
                    maxWidth: 240,
                  }}
                  aria-label={`Pictograph: ${yesPct}% drinkers, ${noPct}% non-drinkers (of reported)`}
                >
                  {cells.map((c, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-[3px] transition-transform"
                      style={{
                        backgroundColor: c === "yes" ? COLORS.yes : COLORS.no,
                      }}
                      title={c === "yes" ? `Drinker (${yesPct}% of reported)` : `Non-drinker (${noPct}% of reported)`}
                    />
                  ))}
                </div>

                {/* Legend with raw counts */}
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-5 text-[11.5px]" style={{ color: T.textSecondary }}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.yes }} />
                    Drinks <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(yes)}</span>
                    <span className="tabular-nums" style={{ color: T.textMuted }}>({yesPct}%)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.no }} />
                    Doesn&apos;t <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(no)}</span>
                    <span className="tabular-nums" style={{ color: T.textMuted }}>({noPct}%)</span>
                  </span>
                </div>
                {nr > 0 && (
                  <p className="text-[10.5px] mt-2 tabular-nums" style={{ color: T.textMuted }}>
                    {formatNum(nr)} not reported (excluded from share)
                  </p>
                )}
              </div>
            );
          })()}
          <InsightBox text={(() => {
            const yes = alcoholHabit.find((d) => d.label === "Yes")?.count || 0;
            const no = alcoholHabit.find((d) => d.label === "No")?.count || 0;
            const reported = yes + no;
            if (reported === 0) return "No alcohol-use data yet for this range.";
            const yesPct = Math.round((yes / reported) * 100);
            return `${yesPct}% of those who reported (${formatNum(yes)} of ${formatNum(reported)} people) consume alcohol.`;
          })()} />
        </CVCard>}

        {/* Smoking Habit */}
        {isChartVisible("smokingHabit") && <CVCard accentColor={"#6366f1"} title="Smoking Habit" subtitle="Assessed employees are split into current smokers, ex-smokers, and non-smokers." tooltipText="Hero figure shows the share of assessed employees who currently smoke. The three tiles below break the population into Current, Ex-Smoker (a positive program signal — they quit), and Never. Useful for prioritising cessation programs and celebrating quit successes." chartId="smokingHabit" chartData={smokingHabit} chartTitle="Smoking Habit" chartDescription="Current vs. ex-smoker vs. never breakdown" tableData={smokingHabitTable}>
          {(() => {
            const current = smokingHabit.find((d) => d.label === "Yes")?.count || 0;
            const never = smokingHabit.find((d) => d.label === "No")?.count || 0;
            const ex = smokingHabit.find((d) => d.label === "Ex-Smoker")?.count || 0;
            const nr = smokingHabit.find((d) => d.label === "Not Reported")?.count || 0;
            const reported = current + never + ex;
            // Percentages base on REPORTED responses only — Not Reported is
            // shown as a side note, never as part of the share denominator.
            const pct = (n: number) => (reported > 0 ? Math.round((n / reported) * 100) : 0);
            const currentPct = pct(current);
            const exPct = pct(ex);
            const neverPct = reported > 0 ? Math.max(0, 100 - currentPct - exPct) : 0;
            const COLORS = {
              current: { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },   // amber
              ex: { bg: "#E0E7FF", fg: "#3730A3", border: "#C7D2FE" },        // indigo (positive — they quit)
              never: { bg: "#D1FAE5", fg: "#065F46", border: "#A7F3D0" },     // emerald
            };
            return (
              <div className="flex flex-col items-center mt-2">
                {/* Hero stat */}
                <p className="text-[44px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#d97706" }}>
                  {currentPct}%
                </p>
                <p className="text-[12.5px] mt-2 text-center" style={{ color: T.textSecondary }}>
                  of <span className="font-semibold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(reported)}</span> who reported currently smoke
                </p>

                {/* Three mini-tiles */}
                <div className="grid grid-cols-3 gap-2.5 w-full mt-5">
                  <div className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: COLORS.current.bg, border: `1px solid ${COLORS.current.border}` }}>
                    <p className="text-[20px] font-extrabold tabular-nums leading-none" style={{ color: COLORS.current.fg }}>{currentPct}%</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mt-1.5" style={{ color: COLORS.current.fg, opacity: 0.85 }}>Current</p>
                    <p className="text-[10.5px] mt-0.5 tabular-nums" style={{ color: T.textMuted }}>{formatNum(current)}</p>
                  </div>
                  <div className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: COLORS.ex.bg, border: `1px solid ${COLORS.ex.border}` }}>
                    <p className="text-[20px] font-extrabold tabular-nums leading-none" style={{ color: COLORS.ex.fg }}>{exPct}%</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mt-1.5" style={{ color: COLORS.ex.fg, opacity: 0.85 }}>Ex-Smoker</p>
                    <p className="text-[10.5px] mt-0.5 tabular-nums" style={{ color: T.textMuted }}>{formatNum(ex)}</p>
                  </div>
                  <div className="rounded-xl px-3 py-3 text-center" style={{ backgroundColor: COLORS.never.bg, border: `1px solid ${COLORS.never.border}` }}>
                    <p className="text-[20px] font-extrabold tabular-nums leading-none" style={{ color: COLORS.never.fg }}>{neverPct}%</p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mt-1.5" style={{ color: COLORS.never.fg, opacity: 0.85 }}>Never</p>
                    <p className="text-[10.5px] mt-0.5 tabular-nums" style={{ color: T.textMuted }}>{formatNum(never)}</p>
                  </div>
                </div>

                {nr > 0 && (
                  <p className="text-[10.5px] mt-3 tabular-nums" style={{ color: T.textMuted }}>
                    {formatNum(nr)} not reported (excluded from share)
                  </p>
                )}

                {/* Sparkline: trailing-12-month current-smoker share. Surfaces the
                    'is it getting better?' question the snapshot tiles can't answer. */}
                {smokingTrend.length >= 2 && (() => {
                  const first = smokingTrend[0].pct;
                  const last = smokingTrend[smokingTrend.length - 1].pct;
                  const delta = last - first;
                  const trendColor = delta > 0 ? "#dc2626" : delta < 0 ? "#16a34a" : T.textMuted;
                  const trendWord = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
                  const monthsLabel = smokingTrend.length === 1 ? "1 month" : `${smokingTrend.length} months`;
                  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                  const formatPeriod = (p: string) => {
                    const m = /^(\d{4})-(\d{2})$/.exec(p);
                    if (!m) return p;
                    return `${MONTHS[Number(m[2]) - 1]} '${m[1].slice(2)}`;
                  };
                  return (
                    <div className="w-full mt-6 pt-4" style={{ borderTop: `1px solid ${T.borderLight}` }}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>
                          Trend over last {monthsLabel}
                        </p>
                        <p className="text-[11.5px] font-bold tabular-nums" style={{ color: trendColor }}>
                          {trendWord === "flat" ? "flat" : `${trendWord} ${Math.abs(delta)} pt${Math.abs(delta) === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <div style={{ height: 56, width: "100%" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={smokingTrend} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                            <RechartsTooltip
                              cursor={{ stroke: T.borderLight, strokeWidth: 1 }}
                              contentStyle={{ borderRadius: 10, border: `1px solid ${T.border}`, fontSize: 11, padding: "6px 10px" }}
                              labelFormatter={(_v: unknown, payload: ReadonlyArray<{ payload?: { period?: string } }>) => {
                                const period = payload?.[0]?.payload?.period;
                                return period ? formatPeriod(period) : "";
                              }}
                              formatter={(v: any) => [`${v}%`, "Current smokers"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="pct"
                              stroke="#d97706"
                              strokeWidth={2}
                              dot={{ r: 2.5, fill: "#d97706", stroke: "#d97706" }}
                              activeDot={{ r: 4, fill: "#d97706" }}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-between text-[10px] tabular-nums mt-0.5" style={{ color: T.textMuted }}>
                        <span>{formatPeriod(smokingTrend[0].period)}</span>
                        <span>{formatPeriod(smokingTrend[smokingTrend.length - 1].period)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          <InsightBox text={(() => {
            const current = smokingHabit.find((d) => d.label === "Yes")?.count || 0;
            const never = smokingHabit.find((d) => d.label === "No")?.count || 0;
            const ex = smokingHabit.find((d) => d.label === "Ex-Smoker")?.count || 0;
            const reported = current + never + ex;
            if (reported === 0) return "No smoking-habit data yet for this range.";
            const cur = Math.round((current / reported) * 100);
            const exP = Math.round((ex / reported) * 100);
            const nev = Math.max(0, 100 - cur - exP);
            return `${cur}% currently smoke, ${exP}% have quit (the program success metric), ${nev}% never started.`;
          })()} />
        </CVCard>}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 4: Visit Pattern + Impressions    */}
      {/* ══════════════════════════════════════════ */}
      {isChartVisible("visitPatternImpressions") && <WarmSection>
        <AccentBar color={T.amber} />
        <h2 className="text-[20px] font-extrabold tracking-[-0.01em] font-[var(--font-inter)] mb-1" style={{ color: T.textPrimary }}>Visit Patterns & Impressions</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Patient visit frequency and problem category analysis</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Visit Pattern */}
          <CVCard accentColor={T.amber} title="Visit Pattern" subtitle="Each bar shows the number of patients in one visit-frequency bucket." expandable={false} tooltipText="Bar chart of visit-frequency buckets (1 Visit, 2, 3, 4, 5+ Visits). Click a bar to filter the adjacent Impressions chart by that bucket." chartId="visitPattern" chartData={visitPattern} chartTitle="Visit Pattern" chartDescription="Patient visit frequency distribution" tableData={visitPatternTable}>
            <p className="text-[11px] mb-2" style={{ color: T.textMuted }}>Click a bar to filter Impressions chart</p>
            <div className="overflow-x-auto flex-1 flex">
              <div className="flex-1 flex items-end justify-center gap-3 mt-1" style={{ minHeight: 280, minWidth: Math.max(visitPattern.length * 85, 250) }}>
                {[...visitPattern].sort((a, b) => {
                  const order = ["1 Visit", "2 Visits", "3 Visits", "4 Visits", "5+ Visits"];
                  return order.indexOf(a.label) - order.indexOf(b.label);
                }).map((v) => {
                  const maxV = Math.max(...visitPattern.map((p) => p.count), 1);
                  const heightPct = Math.max((v.count / maxV) * 88, 12);
                  const isSelected = selectedVisitBucket === v.label;
                  return (
                    <div key={v.label} className="flex flex-col items-center gap-1.5 cursor-pointer" style={{ height: "100%", justifyContent: "flex-end" }}
                      onClick={() => setSelectedVisitBucket(isSelected ? "" : v.label)}>
                      <div className="rounded-lg flex items-end justify-center transition-all" style={{
                        width: 70, height: `${heightPct}%`,
                        backgroundColor: isSelected ? "#4f46e5" : selectedVisitBucket ? "#c7d2fe60" : "#c7d2fe",
                        border: isSelected ? `3px solid #4f46e5` : "2px solid #a5b4fc",
                        transform: isSelected ? "scale(1.08)" : "scale(1)",
                        boxShadow: isSelected ? "0 4px 12px rgba(212,160,23,0.4)" : "none",
                      }}>
                        <span className="text-[13px] font-bold pb-1.5" style={{ color: isSelected ? "#fff" : "#4f46e5" }}>{formatNum(v.count)}</span>
                      </div>
                      <span className="text-[10px] font-medium text-center" style={{ color: isSelected ? T.textPrimary : T.textSecondary, fontWeight: isSelected ? 700 : 500 }}>{v.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <ResetFilter visible={selectedVisitBucket !== ""} onClick={() => setSelectedVisitBucket("")} />
            <InsightBox text={(() => {
              if (visitPattern.length === 0) return "No visit-pattern data yet for this range.";
              const total = visitPattern.reduce((s, d) => s + d.count, 0);
              const top = [...visitPattern].sort((a, b) => b.count - a.count)[0];
              const topPct = total > 0 ? Math.round((top.count / total) * 100) : 0;
              const longTail = visitPattern.filter((d) => /4|5/.test(d.label)).reduce((s, d) => s + d.count, 0);
              return `Most patients (${topPct}%) fall in the "${top.label}" bucket${longTail > 0 ? `; ${formatNum(longTail)} return four or more times` : ""}.`;
            })()} />
          </CVCard>

          {/* Impressions Analysis — horizontal ranked bars */}
          <CVCard accentColor={T.amber} title={selectedVisitBucket ? `Impressions Analysis — ${selectedVisitBucket}` : "Impressions Analysis"} subtitle="Each bar shows how many patients reported one chronic condition." expandable={false} tooltipText="Ranked bar list of the most-flagged impressions from emotional-wellbeing assessments. Sorted by patient count — the most prevalent is at the top." chartId="impressionsPie" chartData={impressions} chartTitle="Impressions Analysis" chartDescription="Chronic-condition prevalence ranked by patient count" tableData={impressionsTable}>
            {(() => {
              const sorted = [...impressions].sort((a, b) => b.count - a.count);
              const total = sorted.reduce((s, i) => s + i.count, 0);
              const max = sorted[0]?.count || 1;
              // Heat-graded palette: deepest red for the most prevalent,
              // tapering to amber for the smallest. Draws the eye to the
              // biggest concern without fully alarming everything.
              // Same desaturated palette as the lower Impressions Analysis
              // chart so both views feel unified with the dashboard's
              // overall cool/muted aesthetic.
              const RANK_COLORS = [
                "#5B6FCC", // muted indigo
                "#4C8F8F", // muted teal
                "#7E68B5", // muted violet
                "#3E92C9", // muted cyan
                "#9E8FCB", // muted lavender
                "#6FB6A8", // muted seafoam
                "#5C7A99", // muted slate-blue
                "#A0826D", // muted clay
                "#84A0B5", // muted sky
                "#75857A", // muted sage
              ];
              const rowFor = (im: { category: string; count: number }, idx: number) => {
                const pct = total > 0 ? Math.round((im.count / total) * 100) : 0;
                const widthPct = max > 0 ? Math.max(2, Math.round((im.count / max) * 100)) : 2;
                const color = RANK_COLORS[idx] || RANK_COLORS[RANK_COLORS.length - 1];
                return (
                  <div
                    key={im.category}
                    className="grid items-center gap-3 py-2.5"
                    style={{ gridTemplateColumns: "20px minmax(120px, max-content) 1fr 14ch" }}
                  >
                    {/* Rank pill */}
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold tabular-nums"
                      style={{ backgroundColor: idx === 0 ? color : "#F5F6FB", color: idx === 0 ? "#fff" : T.textMuted }}
                    >
                      {idx + 1}
                    </span>
                    {/* Condition name — sized to its own content so labels never truncate */}
                    <span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: T.textPrimary }}>
                      {im.category}
                    </span>
                    {/* Bar */}
                    <div className="h-[12px] rounded-full overflow-hidden" style={{ backgroundColor: "#F5F6FB" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${widthPct}%`, background: `linear-gradient(90deg, ${color} 0%, ${color}cc 100%)` }}
                      />
                    </div>
                    {/* Count + % */}
                    <div className="text-right tabular-nums">
                      <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>{formatNum(im.count)}</span>
                      <span className="text-[11px] ml-1.5" style={{ color: T.textMuted }}>{pct}%</span>
                    </div>
                  </div>
                );
              };
              return (
                <div className="mt-2">
                  {sorted.length === 0 ? (
                    <div className="py-12 text-center text-[12.5px]" style={{ color: T.textMuted }}>No impressions data in the selected window.</div>
                  ) : (
                    <>
                      {sorted.map(rowFor)}
                      {/* Footer: total */}
                      <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${T.borderLight}` }}>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Total flagged</span>
                        <span className="text-[12.5px] font-bold tabular-nums" style={{ color: T.textPrimary }}>{formatNum(total)} patients</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <InsightBox text={(() => {
              if (impressions.length === 0) return "No impression data yet for this range.";
              const total = impressions.reduce((s, i) => s + i.count, 0);
              const top = [...impressions].sort((a, b) => b.count - a.count)[0];
              const pct = total > 0 ? Math.round((top.count / total) * 100) : 0;
              return `Top condition: ${top.category} — flagged in ${formatNum(top.count)} patients (${pct}% of those flagged).`;
            })()} />
          </CVCard>
        </div>
      </WarmSection>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 5: Scales                         */}
      {/* ══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isChartVisible("anxietyScale") && <CVCard accentColor={"#6366f1"} title="Anxiety Scale" subtitle="Each segment is the share of patients at one anxiety severity level." expandable={false} tooltipText="Stacked percentage bar of anxiety-screening results — Anxious vs Not Anxious, with Not Reported shown as a separate segment. Wider Anxious segment means a higher share of those screened were flagged." chartId="anxietyScale" chartData={anxietyScale} chartTitle="Anxiety Scale" chartDescription="Severity distribution of anxiety assessments" tableData={anxietyTable}>
          <StackedPercentBar data={anxietyScale} colors={["#d97706", "#0d9488", "#94a3b8"]} />
          <InsightBox text={(() => {
            if (anxietyScale.length === 0) return "No anxiety-scale data yet for this range.";
            const anxious = anxietyScale.find((d) => d.label === "Anxious")?.count || 0;
            const notAnxious = anxietyScale.find((d) => d.label === "Not Anxious")?.count || 0;
            const reported = anxious + notAnxious;
            if (reported === 0) return "No anxiety-scale responses recorded in this range.";
            const pct = Math.round((anxious / reported) * 100);
            return `${pct}% of those screened flagged as Anxious — ${formatNum(anxious)} patients who may need expanded anxiety support.`;
          })()} />
        </CVCard>}
        {isChartVisible("selfEsteemScale") && <CVCard accentColor={"#6366f1"} title="Self Esteem Scale" subtitle="Each segment is the share of patients at one self-esteem level." expandable={false} tooltipText="Stacked percentage bar showing self-esteem assessment results (e.g., Low, Normal). A larger Low segment suggests more employees may benefit from confidence-building and self-esteem support initiatives." chartId="selfEsteemScale" chartData={selfEsteemScale} chartTitle="Self Esteem Scale" chartDescription="Self-esteem assessment results" tableData={selfEsteemTable}>
          <StackedPercentBar data={selfEsteemScale} colors={["#0d9488", "#d97706", "#94a3b8"]} />
          <InsightBox text={(() => {
            if (selfEsteemScale.length === 0) return "No self-esteem data yet for this range.";
            const total = selfEsteemScale.reduce((s, d) => s + d.count, 0);
            const low = selfEsteemScale.filter((d) => d.label === "Low").reduce((s, d) => s + d.count, 0);
            const pct = total > 0 ? Math.round((low / total) * 100) : 0;
            return `${pct}% of patients fall in the Low band — ${formatNum(low)} people who could benefit from confidence-building support.`;
          })()} />
        </CVCard>}
      </div>
      {isChartVisible("depressionScale") && <CVCard accentColor={"#6366f1"} title="Depression Scale" subtitle="Each segment is the share of patients at one depression severity level." expandable={false} tooltipText="Stacked percentage bar of depression-screening results — Minimal vs Moderate or Higher, with Not Reported shown as a separate segment. A wider Moderate-or-Higher segment means a higher share of those screened were flagged." chartId="depressionScale" chartData={depressionScale} chartTitle="Depression Scale" chartDescription="Severity distribution of depression assessments" tableData={depressionTable}>
        <StackedPercentBar data={depressionScale} colors={["#0d9488", "#d97706", "#94a3b8"]} />
        <InsightBox text={(() => {
          if (depressionScale.length === 0) return "No depression-scale data yet for this range.";
          const moderate = depressionScale.find((d) => d.label === "Moderate or Higher")?.count || 0;
          const minimal = depressionScale.find((d) => d.label === "Minimal")?.count || 0;
          const reported = moderate + minimal;
          if (reported === 0) return "No depression-scale responses recorded in this range.";
          const pct = Math.round((moderate / reported) * 100);
          return `${formatNum(moderate)} patients (${pct}% of those screened) fall in Moderate or Higher — each warrants a follow-up.`;
        })()} />
      </CVCard>}

      {/* ══════════════════════════════════════════ */}
      {/* SECTION 6: Impressions Detail (clickable) */}
      {/* ══════════════════════════════════════════ */}
      {isChartVisible("impressionsDetail") && <CVCard accentColor={"#4f46e5"} title="Impressions Analysis" subtitle="Each category can be opened to see the specific concerns inside it." tooltipText="Interactive breakdown of problem categories. The stacked bar at top shows overall proportions. Click any category tab to drill into its subcategories displayed as horizontal bars." chartId="impressionsDetail" chartData={detailImpressions} chartTitle="Impressions Analysis" chartDescription="Problem category breakdown with subcategories" tableData={detailImpressionsTable}>
        {/* Stacked bar at top */}
        <div className="mb-4">
          <div className="flex h-8 rounded-lg overflow-hidden" style={{ backgroundColor: T.borderLight }}>
            {detailImpressions.map((im) => {
              const pct = detailTotal > 0 ? (im.count / detailTotal) * 100 : 0;
              return (
                <div key={im.category} className="flex items-center justify-center text-[10px] font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ width: `${pct}%`, backgroundColor: detailColorMap[im.category] || "#9399AB", minWidth: pct > 3 ? 40 : 0 }}
                  onClick={() => setActiveImpression(im.category)}>
                  {pct > 5 ? `${pct.toFixed(1)}%` : ""}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {detailImpressions.map((im) => (
              <div key={im.category} className="flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: detailColorMap[im.category] || "#9399AB" }} />
                {im.category}
              </div>
            ))}
          </div>
        </div>

        {/* Clickable tabs */}
        <div className="flex flex-wrap gap-2 mb-5 items-center">
          {detailImpressions.map((im) => (
            <button key={im.category} onClick={() => setActiveImpression(im.category)}
              className={`px-4 py-2 rounded-lg text-[13px] font-semibold border-2 transition-all ${selectedImpression === im.category ? "shadow-sm" : ""}`}
              style={{
                borderColor: selectedImpression === im.category ? (detailColorMap[im.category] || "#4f46e5") : T.border,
                backgroundColor: selectedImpression === im.category ? (detailColorMap[im.category] || "#4f46e5") + "10" : T.white,
                color: selectedImpression === im.category ? (detailColorMap[im.category] || "#4f46e5") : T.textSecondary,
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
        <InsightBox text={(() => {
          if (detailImpressions.length === 0 || detailTotal === 0) return "No category data yet for this range.";
          const top = [...detailImpressions].sort((a, b) => b.count - a.count)[0];
          if (!top || top.count === 0) return "No category data yet for this range.";
          const pct = Math.round((top.count / detailTotal) * 100);
          return `Top category: ${top.category} — ${pct}% of flagged patients. Open it for the specific concerns inside.`;
        })()} />
      </CVCard>}

      {/* Data Audit — superadmin-only source + extraction logic per chart.
          Renders to null for every other role; provenance only arrives in
          the API payload for SUPER_ADMIN callers. */}
      <DataAuditSection provenance={ewbApi?._meta?.provenance} />
    </div>
  );
}
