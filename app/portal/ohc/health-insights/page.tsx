"use client";

import { T, CHART_PALETTE, CHART_PALETTE_EXTENDED, HEATMAP_GRADIENT, GENDER_COLORS } from "@/lib/ui/theme";
import { interpolateHex } from "@/lib/dashboard/render-helpers";
import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
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
import {
  Info,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  ChevronRight,
  CalendarDays,
  Table2,
  BarChart3,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
import { useChartVisibility } from "@/lib/hooks/useChartVisibility";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PageDownload from "@/components/shared/PageDownload";
import {
  AreaChart,
  Area,
  Line,
  ComposedChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartComments } from "@/components/ui/chart-comments";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// ─── Design Tokens (imported from shared theme) ───

const TREEMAP_COLORS = CHART_PALETTE_EXTENDED;

const CONDITION_TREEMAP_COLORS = CHART_PALETTE.slice(0, 7);


const HEATMAP_COLORS = HEATMAP_GRADIENT;

// ─── Display-name mapping for the master grouping ───
// Keys are the verbatim `disease` values stored in agg_diagnosis (sourced
// from the chronic_icd lookup). Values are short, dropdown/legend-friendly
// labels. Anything not listed renders as-is.
const CATEGORY_DISPLAY: Record<string, string> = {
  "Diabetes mellitus (DM)": "Diabetes (DM)",
  "Prediabetes (Pre-DM)": "Pre-Diabetes",
  "Prehypertension (Pre-HT)": "Pre-Hypertension",
  "Hypertension (HT)": "Hypertension",
  "Polycystic Ovarian Syndrome (PCOS)": "PCOS",
  "Arthritis [including Osteoarthritis (OA) and other conditions with joint pains]": "Arthritis",
  "Chronic Liver Disease (including Alcoholic Liver Disease)": "Chronic Liver Disease",
  "Stress & other mental health issues (including substance abuse)": "Mental Health",
  "Pancreatic Diseases (including Acute, Chronic, and Alcohol-induced Pancreatitis)": "Pancreatic Diseases",
  "OSA/OHS": "OSA / OHS",
};

const SUBCATEGORY_SHORT: Record<string, string> = {
  "Upper respiratory tract infections": "Upper RTI",
  "Lower respiratory tract infections including pneumonia": "Lower RTI / Pneumonia",
  "Diarrhea and other GIT Infections": "GI Infections",
  "Skin and soft tissue Infections": "Skin Infections",
  "Allergic Dermatitis & allied conditions": "Allergies",
  "Acne & related conditions": "Acne",
  "Fungal Infections": "Fungal Infections",
  "Hypertension & allied conditions": "Hypertension",
  "Coronary Artery Disease (Ischaemic heart diseases)": "CAD",
  "Body Aches and Joint Pains": "Body Aches & Joint Pains",
  "Malnutrition & other nutritional Deficiencies": "Malnutrition",
  "Diseases affecting Kindneys, Ureter & Urinary Bladder": "Kidney & Urinary",
  "Other conditions of Skin, Hair & Nails": "Skin/Hair/Nails (Other)",
  "Skin & Subcutaneous Infections": "Skin Infections",
};

function displayCat(name: string): string {
  return CATEGORY_DISPLAY[name] || name;
}

function displaySub(name: string): string {
  if (!name) return name;
  // Curated short label first (preserves manual aliases)
  if (SUBCATEGORY_SHORT[name]) return SUBCATEGORY_SHORT[name];
  // Generic cleanup of ICD-10 boilerplate that adds noise to labels:
  //   "Hyperlipidemia, unspecified"     → "Hyperlipidemia"
  //   "Anemia, unspecified"             → "Anemia"
  //   "Type 2 diabetes mellitus without complications" → "Type 2 diabetes mellitus"
  //   "Diabetes mellitus due to underlying condition"  → "Diabetes mellitus"
  return name
    .replace(/,\s*unspecified\b/i, "")
    .replace(/,\s*not elsewhere classified\b/i, "")
    .replace(/\s+without\s+(?:other\s+)?complications?\b.*$/i, "")
    .replace(/\s+due to\s+underlying\s+condition\b.*$/i, "")
    .replace(/\s+\(unspecified\)/i, "")
    .trim();
}

// Short label for treemap tiles — caps long names so they fit inside narrow
// rectangles without truncating mid-word at the rich-text segment boundary.
function tileLabel(name: string, max = 14): string {
  const s = name || "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

// ─── Season mapping ───
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SEASON_MAP: Record<number, { label: string; bg: string }> = {
  1:  { label: "Winter", bg: "#EDEBF5" },
  2:  { label: "Winter", bg: "#EDEBF5" },
  3:  { label: "Pre-Monsoon", bg: "#FAF3E8" },
  4:  { label: "Monsoon", bg: "#E8F5EC" },
  5:  { label: "Monsoon", bg: "#E8F5EC" },
  6:  { label: "Monsoon", bg: "#E8F5EC" },
  7:  { label: "Post-Monsoon", bg: "#F0F7F2" },
  8:  { label: "Post-Monsoon", bg: "#F0F7F2" },
  9:  { label: "Post-Monsoon", bg: "#F0F7F2" },
  10: { label: "Fall", bg: "#F5EDE4" },
  11: { label: "Fall", bg: "#F5EDE4" },
  12: { label: "Winter", bg: "#EDEBF5" },
};

const SEASONAL_DOT_COLORS: Record<string, string> = {
  "GI Infections": "#0d9488",
  "Upper RTI": "#4f46e5",
  "Lower RTI / Pneumonia": "#6366f1",
  "Allergies": "#a78bfa",
  "Acne": "#14b8a6",
};

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 100000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(n);
}

function getHeatmapColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#FAFAFA";
  const idx = Math.min(Math.floor((value / max) * (HEATMAP_COLORS.length - 1)), HEATMAP_COLORS.length - 1);
  return HEATMAP_COLORS[idx];
}

function getHeatmapTextColor(value: number, max: number): string {
  if (max === 0) return T.textPrimary;
  return value / max > 0.5 ? "#fff" : T.textPrimary;
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
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true,
  headerRight, chartId, chartData, chartTitle, chartDescription, tableData,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  headerRight?: React.ReactNode; chartId?: string;
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
                {headerRight}
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
                {chartId && <ChartComments chartId={chartId} pageSlug="/portal/ohc/health-insights" />}
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

// ─── Year Selector ───
function YearSelector({ years, value, onChange, includeAll }: { years: number[]; value: number; onChange: (y: number) => void; includeAll?: boolean }) {
  // includeAll → adds an "All Years" option that maps to the sentinel
  // 0. The API URL builder skips the year param when value is 0, and
  // the server-side regex /^\d{4}$/ already drops anything non-numeric,
  // so no API change is needed.
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 px-3 rounded-lg border text-[13px] font-medium"
      style={{ borderColor: T.border, color: T.textPrimary }}
    >
      {includeAll && <option value={0}>All Years</option>}
      {years.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );
}

// ─── Category Selector ───
function CategorySelector({ categories, value, onChange }: { categories: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 px-3 rounded-lg border text-[13px] font-medium max-w-[200px] truncate"
      style={{ borderColor: T.border, color: T.textPrimary }}
    >
      {categories.map((c) => <option key={c} value={c}>{displayCat(c)}</option>)}
    </select>
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

// ─── Stat Card ───
// Mirrors the KPI cards on /portal/ohc/utilization: card is `h-full flex flex-col`,
// inner padded body is `flex-1 flex flex-col` so the optional insight blob can be
// bottom-pinned via `mt-auto pt-4`.
function StatCard({ label, value, color, sub, tooltip, insight }: {
  label: string; value: string | number; color: string; sub?: string;
  tooltip?: string; insight?: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <div className="px-6 pt-6 pb-5 flex-1 flex flex-col">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
          {tooltip && (
            <Tooltip>
              <TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger>
              <TooltipContent className="text-xs max-w-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-[36px] font-extrabold mt-2.5 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{value}</p>
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

// ─── Warm Section ───
function WarmSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`p-6 sm:p-7 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>
      {children}
    </div>
  );
}

// ─── MAIN PAGE ───
export default function HealthInsightsPage() {
  usePageAccess("/portal/ohc/health-insights");
  const { activeClientId } = useAuth();
  // Page-scoped UI state.
  const [demoTab, setDemoTab] = useState<"age" | "gender" | "location">("age");
  const [trendView, setTrendView] = useState<"yearly" | "monthly">("yearly");
  // Per-chart local state — top-bar filters are global, every other
  // selector is scoped to a single chart so a change here never
  // refetches the other charts on the page.
  const [trendsCategory, setTrendsCategory] = useState<string>("");
  const [trendsCondition, setTrendsCondition] = useState<string>("");
  const [coOccYear, setCoOccYear] = useState<number>(2025);
  const [demoYear, setDemoYear] = useState<number>(2025);
  const [demoCategory, setDemoCategory] = useState<string>("");
  const [demoCondition, setDemoCondition] = useState<string>("");
  const [seasonalYear, setSeasonalYear] = useState<number>(2025);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [dateOpen, setDateOpen] = useState(false);
  const [pageFilters, setPageFilters] = useState({
    ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], conditions: [] as string[],
  });

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const [appliedDateRange, setAppliedDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(2024, 0, 1),
    to: new Date(2026, 2, 31),
  });
  const [appliedFilters, setAppliedFilters] = useState({
    ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], conditions: [] as string[],
  });
  // Which Condition Share Distribution rows are expanded (multi-select).
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  // Co-Occurrence venn — up to 3 chronic ICD parent categories. Selection
  // commits to the API on every change (no Apply button needed for this
  // chart-scoped picker).
  const [coOccCats, setCoOccCats] = useState<string[]>([]);
  // Expanded years in the Condition Trends table view (year → month drill-down).
  const [expandedHIYears, setExpandedHIYears] = useState<Set<string>>(new Set());
  const [coOccPickerOpen, setCoOccPickerOpen] = useState(false);

  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility("/portal/ohc/health-insights", previewConfig);

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

  // Main URL — only top-bar filters travel here. Per-chart selectors
  // (year, category, condition, co-occurrence categories) are scoped
  // to their own SWR fetches below so a chart-local change can never
  // refetch the whole page.
  const apiUrl = useMemo(() => {
    if (!activeClientId) return null;
    const p = new URLSearchParams();
    p.set("clientId", activeClientId);
    p.set("dateFrom", format(appliedDateRange.from, "yyyy-MM-dd"));
    p.set("dateTo", format(appliedDateRange.to, "yyyy-MM-dd"));
    if (appliedFilters.ageGroups.length) p.set("ageGroups", appliedFilters.ageGroups.join(","));
    if (appliedFilters.genders.length) p.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.locations.length) p.set("locations", appliedFilters.locations.join(","));
    if (appliedFilters.conditions.length) p.set("conditions", appliedFilters.conditions.join(","));
    return `/api/ohc/health-insights?${p.toString()}`;
  }, [activeClientId, appliedFilters, appliedDateRange]);

  const fetcher = (url: string) => fetch(url).then((r) => r.json());

  const { data: raw, isLoading, isValidating, mutate } = useSWR(apiUrl, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true,
  });
  const d = raw as any;

  // ── Per-chart fetches ── each adds its own params on top of the
  // main URL so top-bar filters still cascade. Same SWR options as the
  // main fetch — keepPreviousData so the chart doesn't blank during a
  // local filter change.
  const buildChartUrl = (extras: Record<string, string | number | undefined>) => {
    if (!apiUrl) return null;
    const url = new URL(apiUrl, "http://x");
    for (const [k, v] of Object.entries(extras)) {
      if (v === undefined || v === "" || v === 0) continue;
      url.searchParams.set(k, String(v));
    }
    return url.pathname + "?" + url.searchParams.toString();
  };

  const trendsUrl = useMemo(
    () => buildChartUrl({ chart: "trends", category: trendsCategory, condition: trendsCondition }),
    [apiUrl, trendsCategory, trendsCondition],
  );
  const { data: trendsRaw } = useSWR(trendsUrl, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true,
  });
  const trendsApi = trendsRaw as any;

  const coOccUrl = useMemo(
    () => buildChartUrl({ chart: "coOcc", coOccurrenceCategories: coOccCats.join(","), year: coOccYear }),
    [apiUrl, coOccCats, coOccYear],
  );
  const { data: coOccRaw } = useSWR(coOccUrl, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true,
  });
  const coOccApi = coOccRaw as any;

  const demoUrl = useMemo(
    () => buildChartUrl({ chart: "demo", year: demoYear, category: demoCategory, condition: demoCondition }),
    [apiUrl, demoYear, demoCategory, demoCondition],
  );
  const { data: demoRaw } = useSWR(demoUrl, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true,
  });
  const demoApi = demoRaw as any;

  // Refresh button — mirrors the /portal/ohc/utilization pattern.
  // Force a `?nocache=1` fetch, write the fresh payload into SWR via
  // `mutate(data, { revalidate: false })`, then flash a "Data refreshed" toast.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const onRefresh = async () => {
    if (!apiUrl) return;
    setIsRefreshing(true);
    try {
      const freshUrl = apiUrl + (apiUrl.includes("?") ? "&" : "?") + "nocache=1";
      const res = await fetch(freshUrl);
      if (res.ok) {
        const fresh = await res.json();
        mutate(fresh, { revalidate: false });
        setShowRefreshToast(true);
        setTimeout(() => setShowRefreshToast(false), 3000);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // Set initial category when data loads
  const categories: string[] = d?.categories || [];
  const years: number[] = d?.years || [2024, 2025, 2026];
  const conditionBreakdown: any[] = d?.conditionBreakdown || [];
  const conditionsByCategory: Record<string, Array<{ name: string; value: number; uniquePatients: number }>> = d?.conditionsByCategory || {};

  // Auto-select default category for Trends Over Time + Demographic
  // Analysis once the available list arrives (defaults to Metabolic
  // Disorders, falling back to whichever is first).
  useEffect(() => {
    if (categories.length === 0) return;
    const fallback = categories.find((c) => c.toLowerCase().includes("metabolic")) || categories[0];
    if (!trendsCategory) setTrendsCategory(fallback);
    if (!demoCategory) setDemoCategory(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { ageGroups: [] as string[], genders: [] as string[], locations: [] as string[], conditions: [] as string[] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedDateRange({ ...dateRange });
    setAppliedFilters({ ...pageFilters });
  };

  // Chronic / Acute data
  const ca = d?.chronicAcute || {};
  const categoryTreemap = d?.categoryTreemap || [];

  // Latch the last non-empty category list + per-category conditions so the
  // dropdown / subcategory pills don't disappear when picking a category
  // changes the SWR cache key (the new fetch starts undefined, and the
  // current API can return empty rows when the warehouse table is missing).
  const [cachedCategoryTreemap, setCachedCategoryTreemap] = useState<any[]>([]);
  const [cachedConditionsByCategory, setCachedConditionsByCategory] = useState<Record<string, Array<{ name: string; value: number; uniquePatients: number }>>>({});
  useEffect(() => {
    if (categoryTreemap.length > 0) setCachedCategoryTreemap(categoryTreemap);
  }, [categoryTreemap]);
  useEffect(() => {
    if (Object.keys(conditionsByCategory).length > 0) setCachedConditionsByCategory(conditionsByCategory);
  }, [conditionsByCategory]);
  const categoriesForSelect = categoryTreemap.length > 0 ? categoryTreemap : cachedCategoryTreemap;
  const conditionsForSelect = Object.keys(conditionsByCategory).length > 0 ? conditionsByCategory : cachedConditionsByCategory;

  // Trends — for the yearly view, fill any year in the applied window
  // that the warehouse didn't return so the x-axis always spans the full
  // selected range (zero-data years render as a flat baseline instead of
  // disappearing).
  const trendData = useMemo(() => {
    if (trendView !== "yearly") return trendsApi?.conditionTrends || [];
    const raw: Array<{ period: string; count: number; uniquePatients: number }> = trendsApi?.conditionTrendsYearly || [];
    const fromYr = appliedDateRange.from.getFullYear();
    const toYr = appliedDateRange.to.getFullYear();
    if (!Number.isFinite(fromYr) || !Number.isFinite(toYr) || toYr < fromYr) return raw;
    const byYr: Record<string, { period: string; count: number; uniquePatients: number }> = {};
    for (const r of raw) byYr[r.period] = r;
    const filled: Array<{ period: string; count: number; uniquePatients: number }> = [];
    for (let y = fromYr; y <= toYr; y++) {
      const key = String(y);
      filled.push(byYr[key] || { period: key, count: 0, uniquePatients: 0 });
    }
    return filled;
  }, [trendView, trendsApi?.conditionTrends, trendsApi?.conditionTrendsYearly, appliedDateRange]);

  // Demographics
  const demoData = demoTab === "age" ? demoApi?.demoAge : demoTab === "gender" ? demoApi?.demoGender : demoApi?.demoLocation;
  const demoSegments = demoTab === "age" ? filterOptions.ageGroups : demoTab === "gender" ? filterOptions.genders : (demoApi?.facilities || d?.facilities || filterOptions.locations);

  // Compute heatmap matrix
  const demoConditions = useMemo(() => {
    if (!demoData) return [];
    return Object.keys(demoData);
  }, [demoData]);

  const demoMatrix = useMemo(() => {
    if (!demoData || !demoConditions.length) return { rows: [], maxVal: 0 };
    let maxVal = 0;
    const rows = demoConditions.map((cond) => {
      const cells = demoSegments.map((seg: string) => {
        const val = demoData[cond]?.[seg]?.count || 0;
        if (val > maxVal) maxVal = val;
        return val;
      });
      const total = cells.reduce((a: number, b: number) => a + b, 0);
      return { condition: cond, cells, total };
    });
    rows.sort((a: any, b: any) => b.total - a.total);
    return { rows, maxVal };
  }, [demoData, demoConditions, demoSegments]);

  // Compute insights for demographic heatmap
  const demoInsights = useMemo(() => {
    if (!demoMatrix.rows.length) return { hotspot: "", genderGap: "", locationSpotlight: "" };
    // Top hotspot: highest cell value
    let topCond = "", topSeg = "", topVal = 0;
    demoMatrix.rows.forEach((row: any) => {
      row.cells.forEach((val: number, i: number) => {
        if (val > topVal) { topVal = val; topCond = row.condition; topSeg = demoSegments[i]; }
      });
    });
    const totalCat = demoMatrix.rows.reduce((s: number, r: any) => s + r.total, 0);
    const hotspot = `${demoTab === "age" ? "Age Group" : demoTab === "gender" ? "Gender" : "Location"} ${topSeg} with ${topCond} (${formatNum(topVal)} patients, ${totalCat > 0 ? Math.round(topVal / totalCat * 100) : 0}% of category)`;

    return { hotspot, genderGap: "", locationSpotlight: "" };
  }, [demoMatrix, demoSegments, demoTab]);


  // Seasonal trends
  const seasonalTrends: Record<string, any[]> = d?.seasonalTrends || {};
  const seasonalConditions = Object.keys(seasonalTrends);

  // Only show skeleton on very first load (no data at all)
  if (!d && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-40 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  // ── Table-view data for each chart (Chart ⇄ Table toggle) — plain consts ──
  const hiPctOf = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "0%");

  // ICD Category Distribution / Condition Share: category × visits × %.
  const categoryTable: CVTableData = (() => {
    const items = [...(categoryTreemap as any[])].sort((a, b) => b.value - a.value);
    const total = items.reduce((s, c) => s + Number(c.value || 0), 0);
    const rows: Record<string, React.ReactNode>[] = items.map((c) => ({ name: displayCat(c.name), value: formatNum(c.value), pct: hiPctOf(Number(c.value || 0), total) }));
    rows.push({ __group: true, name: "Total", value: formatNum(total), pct: "100%" });
    return { columns: [{ key: "name", label: "Disease Category", align: "left" }, { key: "value", label: "Visits", align: "right" }, { key: "pct", label: "% of Total", align: "right" }], rows };
  })();

  // Condition Trends — year → month drill-down (conditionTrends: {period 'YYYY-MM', count, uniquePatients}).
  const HI_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const toggleHIYear = (y: string) => setExpandedHIYears((prev) => { const n = new Set(prev); if (n.has(y)) n.delete(y); else n.add(y); return n; });
  const trendsTable: CVTableData = (() => {
    const raw = (trendsApi?.conditionTrends || []) as { period: string; count: number; uniquePatients: number }[];
    const byYear: Record<string, { c: number; items: any[] }> = {};
    for (const r of raw) { const y = String(r.period || "").slice(0, 4); if (!y) continue; if (!byYear[y]) byYear[y] = { c: 0, items: [] }; byYear[y].c += Number(r.count || 0); byYear[y].items.push(r); }
    const rows: Record<string, React.ReactNode>[] = [];
    for (const y of Object.keys(byYear).sort()) {
      const yd = byYear[y]; const open = expandedHIYears.has(y);
      rows.push({ __group: true, period: (<button onClick={() => toggleHIYear(y)} className="flex items-center gap-1.5 font-bold" style={{ color: T.textPrimary }}><ChevronDown size={12} style={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform .15s" }} />{y}</button>), count: formatNum(yd.c), unique: "—" });
      if (open) for (const r of [...yd.items].sort((a, b) => String(a.period).localeCompare(String(b.period)))) { const m = String(r.period).slice(5, 7); rows.push({ period: <span style={{ paddingLeft: 22 }}>{`${HI_MONTH[Number(m) - 1] || m} ${y}`}</span>, count: formatNum(r.count), unique: formatNum(r.uniquePatients) }); }
    }
    return { columns: [{ key: "period", label: "Year", align: "left" }, { key: "count", label: "Diagnoses", align: "right" }, { key: "unique", label: "Unique Patients", align: "right" }], rows };
  })();

  // Demographic Analysis — condition × segment crosstab (current tab).
  const demoTable: CVTableData = (() => {
    const segs = (demoSegments || []) as string[];
    const rows: Record<string, React.ReactNode>[] = (demoMatrix.rows as any[]).map((r) => {
      const row: Record<string, React.ReactNode> = { condition: displayCat(r.condition) };
      r.cells.forEach((v: number, i: number) => { row[`s${i}`] = formatNum(v); });
      row.__rowtotal = formatNum(r.total);
      return row;
    });
    return { columns: [{ key: "condition", label: "Condition", align: "left" }, ...segs.map((s, i) => ({ key: `s${i}`, label: s, align: "right" as const })), { key: "__rowtotal", label: "Total", align: "right" }], rows };
  })();

  // Co-occurrence — decode venn subsets (bitmask → category combination) into rows.
  const coOccTable: CVTableData = (() => {
    const venn = coOccApi?.coOccurrenceVenn || { subsets: {} };
    const subsets: Record<string, number> = venn.subsets || {};
    const cats = coOccCats;
    const rows = Object.entries(subsets)
      .filter(([, v]) => Number(v) > 0)
      .map(([mask, v]) => { const m = Number(mask); const names = cats.filter((_, i) => m & (1 << i)); return { combo: names.map(displayCat).join(" + ") || "—", patients: Number(v) }; })
      .sort((a, b) => b.patients - a.patients);
    const total = rows.reduce((s, r) => s + r.patients, 0);
    const out: Record<string, React.ReactNode>[] = rows.map((r) => ({ combo: r.combo, patients: formatNum(r.patients) }));
    out.push({ __group: true, combo: "Total (any of the selected)", patients: formatNum(total) });
    return { columns: [{ key: "combo", label: "Condition Combination", align: "left" }, { key: "patients", label: "Patients", align: "right" }], rows: out };
  })();

  // Seasonal — Month × condition crosstab for the selected year.
  const seasonalTable: CVTableData = (() => {
    const condNames = Array.from(new Set(seasonalConditions.map(displayCat)));
    const monthAgg: Record<number, Record<string, number>> = {};
    for (const rawName of seasonalConditions) {
      const sn = displayCat(rawName);
      for (const pt of (seasonalTrends[rawName] || [])) { const [yr, mo] = pt.period.split("-").map(Number); if (yr !== seasonalYear) continue; if (!monthAgg[mo]) monthAgg[mo] = {}; monthAgg[mo][sn] = (monthAgg[mo][sn] || 0) + pt.count; }
    }
    const colTotals: Record<string, number> = {};
    const rows: Record<string, React.ReactNode>[] = [];
    for (let m = 1; m <= 12; m++) {
      const c = monthAgg[m] || {}; const total = Object.values(c).reduce((s, v) => s + v, 0);
      if (total === 0) continue;
      const row: Record<string, React.ReactNode> = { month: HI_MONTH[m - 1] };
      for (const cn of condNames) { const v = c[cn] || 0; row[cn] = formatNum(v); colTotals[cn] = (colTotals[cn] || 0) + v; }
      row.__rowtotal = formatNum(total);
      rows.push(row);
    }
    const grand = Object.values(colTotals).reduce((a, b) => a + b, 0);
    const totalRow: Record<string, React.ReactNode> = { __group: true, month: "Total" };
    for (const cn of condNames) totalRow[cn] = formatNum(colTotals[cn] || 0);
    totalRow.__rowtotal = formatNum(grand);
    rows.push(totalRow);
    return { columns: [{ key: "month", label: `Month (${seasonalYear})`, align: "left" }, ...condNames.map((cn) => ({ key: cn, label: cn, align: "right" as const })), { key: "__rowtotal", label: "Total", align: "right" }], rows };
  })();

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

        <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
        <FilterMultiSelect label="Condition" options={categories} selected={pageFilters.conditions} onChange={(v) => setPageFilters((p) => ({ ...p, conditions: v }))} />

        <div className="flex-1" />
        <PageDownload pageTitle="Health Insights" />
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRefresh}
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
          pageSlug="/portal/ohc/health-insights"
          pageTitle="Health Insights"
          charts={[
            { id: "healthKpis", label: "Health Insight KPIs" },
            { id: "diseaseLandscape", label: "Disease Landscape" },
            { id: "categoryBreakdown", label: "Category Breakdown" },
            { id: "demographicAnalysis", label: "Demographic Analysis" },
            { id: "trendsOverTime", label: "Trends Over Time" },
            { id: "coOccurrenceVitals", label: "Co-Occurrence" },
            { id: "seasonalPatterns", label: "Monthly Patterns" },
          ]}
          filters={["location", "gender", "ageGroup"]}
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

      {/* TODO: chronic-only summary — uses all-categories aggregates as a
          temporary stand-in until the new chronic-data warehouse table lands. */}
      <PageGlanceBox
        pageTitle="Health Insights Overview"
        pageSubtitle="Chronic diagnosis patterns and condition trends"
        kpis={{}}
        fallbackSummary={categoryTreemap.length > 0
          ? `${displayCat(categoryTreemap[0]?.name || "")} is the most common chronic condition with ${formatNum(categoryTreemap[0]?.value || 0)} visits, about ${categoryTreemap[0]?.percentage || 0}% of all chronic visits. ${formatNum(ca.chronicPatients || 0)} employees are living with at least one chronic condition. ${categories.length} disease categories are tracked here.`
          : "Patterns in chronic diagnoses and how conditions trend over time."}
        fallbackChips={categoryTreemap.length > 0 ? [
          { label: "Top Chronic Disease", value: displayCat(categoryTreemap[0]?.name || "—") },
          { label: "Total Chronic Diagnosis", value: formatNum(categoryTreemap.reduce((s: number, c: any) => s + c.value, 0)) },
          { label: "Chronic Patients", value: formatNum(ca.chronicPatients || 0) },
          { label: "Chronic Diseases", value: String(categories.length) },
        ] : [
          { label: "Top Chronic Disease", value: "—" },
          { label: "Total Chronic Diagnosis", value: "0" },
          { label: "Chronic Patients", value: "0" },
          { label: "Chronic Diseases", value: "0" },
        ]}
      />

      {/* ── KPI Stat Cards (chronic-only) ── */}
      {isChartVisible("healthKpis") && (() => {
        const totalChronicDiagnoses = categoryTreemap.reduce((s: number, c: any) => s + c.value, 0);
        const chronicPatients = ca.chronicPatients || 0;
        const chronicDiseases = categories.length || 0;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Chronic Diagnosis"
              value={formatNum(totalChronicDiagnoses)}
              color="#4f46e5"
              sub="Total chronic diagnosis count"
              tooltip="Total number of chronic diagnosis consults recorded in the selected period"
              insight="Tracks the volume of chronic-condition encounters — a rising count signals growing long-term care load"
            />
            <StatCard
              label="Chronic Patients"
              value={formatNum(chronicPatients)}
              color="#4f46e5"
              sub="Unique UHIDs with chronic conditions"
              tooltip="Count of distinct patients (UHIDs) with at least one chronic diagnosis on record in the selected period"
              insight="A growing chronic patient base signals long-term care demand — prioritise continuity-of-care programs"
            />
            <StatCard
              label="Chronic Diseases"
              value={chronicDiseases}
              color="#7c3aed"
              sub="Tracked chronic diseases"
              tooltip="Number of distinct chronic diseases with at least one diagnosis in the selected period"
              insight="Wide chronic disease coverage suggests broad disease burden; narrow coverage points to a focused cohort"
            />
          </div>
        );
      })()}

      {/* ── Disease Landscape Section ── */}
      {isChartVisible("diseaseLandscape") && <WarmSection>
        <AccentBar color="#4f46e5" colorEnd="#6366f1" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Disease Landscape</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Top 5 chronic diseases by diagnosis count, plus an Others bucket for the remaining diseases</p>

        {/* 5 top-category cards + 1 "Others" rollup card.
            Warehouse already emits a literal "Other" category — keep it
            out of the top-5 ranking and fold it into the rollup so we
            don't end up with two cards that both read "Other(s)". */}
        {categoryTreemap.length > 0 && (() => {
          const isOtherLabel = (n: string) => {
            const l = (n || "").trim().toLowerCase();
            return l === "other" || l === "others";
          };
          const named = categoryTreemap.filter((c: any) => !isOtherLabel(c.name));
          const otherFromWarehouse = categoryTreemap.filter((c: any) => isOtherLabel(c.name));
          const top = named.slice(0, 5);
          const tail = [...named.slice(5), ...otherFromWarehouse];
          const othersValue = tail.reduce((s: number, c: any) => s + (c.value || 0), 0);
          const othersUnique = tail.reduce((s: number, c: any) => s + (c.uniquePatients || 0), 0);
          const grandTotal = categoryTreemap.reduce((s: number, c: any) => s + (c.value || 0), 0);
          const othersPct = grandTotal > 0 ? Math.round((othersValue / grandTotal) * 100) : 0;
          return (
            <div className="grid grid-cols-6 gap-3 mb-5">
              {top.map((c: any) => (
                <div
                  key={c.name}
                  className="bg-white px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 rounded-2xl cursor-pointer flex flex-col gap-1"
                  style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
                  onClick={() => { setDemoCategory(c.name); setDemoCondition(""); }}
                >
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] truncate" style={{ color: T.textMuted }}>{displayCat(c.name)}</p>
                  <p className="text-[28px] font-extrabold tracking-[-0.025em] leading-none" style={{ color: "#4f46e5", fontVariantNumeric: "tabular-nums" }}>{formatNum(c.value)}</p>
                  <p className="text-[12px] font-semibold" style={{ color: "#4f46e5" }}>{c.percentage}% of total</p>
                  <p className="text-[11px]" style={{ color: T.textSecondary }}>{formatNum(c.uniquePatients)} unique patients</p>
                </div>
              ))}
              {/* Others bucket — sum of every category beyond the top 5 */}
              <div
                className="bg-white px-5 py-4 transition-all duration-200 rounded-2xl flex flex-col gap-1"
                style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow, opacity: tail.length > 0 ? 1 : 0.6 }}
                title={tail.length > 0 ? `${tail.length} diseases: ${tail.map((c: any) => displayCat(c.name)).join(", ")}` : "No additional diseases"}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] truncate" style={{ color: T.textMuted }}>Others</p>
                <p className="text-[28px] font-extrabold tracking-[-0.025em] leading-none" style={{ color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{formatNum(othersValue)}</p>
                <p className="text-[12px] font-semibold" style={{ color: "#94a3b8" }}>{othersPct}% of total</p>
                <p className="text-[11px]" style={{ color: T.textSecondary }}>{tail.length > 0 ? `${tail.length} more disease${tail.length === 1 ? "" : "s"} · ${formatNum(othersUnique)} unique patients` : "No additional diseases"}</p>
              </div>
            </div>
          );
        })()}

      </WarmSection>}

      {/* ── Category Breakdown Section ── */}
      {isChartVisible("categoryBreakdown") && <WarmSection>
        <AccentBar color="#6366f1" colorEnd="#818cf8" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Category Breakdown</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Disease distribution and condition-level breakdown for the selected disease</p>
      {/* ── ICD Category Treemap + Condition Treemap (50/50) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ICD Category Distribution Treemap — same styling as Repeat Patients
            by Specialty on /portal/ohc/repeat-visits (rank-graded indigo,
            soft tiles with gaps, hero strip + gradient legend, plain
            text labels). */}
        <div>
          <CVCard
            accentColor="#4f46e5"
            title="Chronic Disease Distribution"
            subtitle="Diagnosis Count vs. Unique UHIDs per chronic disease — scroll for the full list. Click any disease to drill into its conditions →"
            tooltipText="Horizontal grouped bar chart of all chronic diseases. Indigo bar = diagnosis count, teal bar = unique UHIDs. Sorted by diagnosis volume; scroll vertically for the full list. Click a disease to drill it into the right panel."
            chartId="icdCategoryDistribution"
            chartData={categoryTreemap}
            chartDescription="Grouped horizontal bars: diagnosis count vs. unique UHIDs per chronic disease" tableData={categoryTable}
          >
            {(() => {
              const sorted = [...categoryTreemap].sort((a: any, b: any) => b.value - a.value);
              const grandTotal = sorted.reduce((s: number, r: any) => s + (r.value || 0), 0) || 1;
              // True distinct chronic patient count — matches the KPI card.
              // Column sum won't equal this (comorbid patients are in
              // multiple disease buckets); this header value globally
              // dedupes via the chronicAcute query.
              const totalUhids = ca.chronicPatients || 0;
              const dominant = sorted[0];
              const dominantPct = Math.round((dominant?.value || 0) / grandTotal * 100);
              const COLOR_CONSULTS = "#4f46e5";
              const COLOR_UHIDS = "#0d9488";
              const COL_WIDTH = 90;
              const CHART_WIDTH = Math.max(sorted.length * COL_WIDTH + 80, 720);
              // Vertical grouped bars: biggest on the left, scroll horizontally
              // for the rest. Rotate labels so 22 long category names fit.
              const labels = sorted.map((d: any) => displayCat(d.name));
              const consults = sorted.map((d: any) => d.value);
              const uhids = sorted.map((d: any) => d.uniquePatients || 0);
              const namesByLabel: Record<string, string> = {};
              for (const d of sorted) namesByLabel[displayCat(d.name)] = d.name;
              return (
                <div className="flex-1 flex flex-col">
                  {/* Hero strip — three label/value pairs in a mini-grid so
                      the labels sit cleanly above their numbers (the previous
                      inline " · " separators had different widths in the
                      label row vs. the number row, causing misalignment). */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="grid grid-cols-3 gap-x-5 gap-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Diseases</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Consults</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Unique UHIDs</p>
                      <p className="text-[18px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{sorted.length}</p>
                      <p className="text-[18px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(grandTotal)}</p>
                      <p className="text-[18px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(totalUhids)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Top Disease</p>
                      <p className="text-[13px] font-extrabold leading-tight truncate max-w-[220px] mt-1" style={{ color: COLOR_CONSULTS }}>
                        {dominant ? displayCat(dominant.name) : "—"}
                        <span className="text-[11px] font-medium ml-1" style={{ color: T.textSecondary }}>· {dominantPct}%</span>
                      </p>
                    </div>
                  </div>
                  {/* Legend chips */}
                  <div className="flex items-center gap-4 mb-2 text-[11px]" style={{ color: T.textSecondary }}>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_CONSULTS }} /> Diagnosis Count</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLOR_UHIDS }} /> Unique UHIDs</span>
                  </div>
                  {/* Scrollable vertical grouped bar chart — width grows with
                      column count, the parent clips with overflow-x-auto so
                      the user scrolls within the card instead of the page. */}
                  <div className="rounded-xl border" style={{ borderColor: T.borderLight, background: "#FAFBFD" }}>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ width: CHART_WIDTH, height: 420 }}>
                        <ReactECharts
                          style={{ height: "100%", width: "100%" }}
                          onEvents={{
                            click: (params: any) => {
                              const realName = namesByLabel[params.name];
                              if (realName) {
                                setDemoCategory(realName);
                                setDemoCondition("");
                              }
                            },
                          }}
                          option={{
                            tooltip: {
                              trigger: "axis",
                              axisPointer: { type: "shadow" },
                              backgroundColor: "#fff",
                              borderColor: T.border,
                              borderWidth: 1,
                              padding: [10, 14],
                              textStyle: { fontSize: 12, color: T.textPrimary },
                              extraCssText: "border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,0.10);",
                              formatter: (params: any) => {
                                const arr = Array.isArray(params) ? params : [params];
                                const cat = arr[0]?.axisValueLabel || arr[0]?.name || "";
                                const lines = arr.map((p: any) => `<span style="color:${p.color};font-weight:600">${p.seriesName}:</span> <strong>${formatNum(p.value)}</strong>`).join("<br/>");
                                return `<strong>${cat}</strong><br/>${lines}`;
                              },
                            },
                            grid: { left: 16, right: 16, top: 16, bottom: 110, containLabel: true },
                            xAxis: {
                              type: "category",
                              data: labels,
                              axisLine: { lineStyle: { color: T.borderLight } },
                              axisTick: { show: false },
                              axisLabel: {
                                color: T.textPrimary,
                                fontSize: 10,
                                fontWeight: 600,
                                interval: 0,
                                rotate: 35,
                                width: 110,
                                overflow: "truncate",
                                ellipsis: "…",
                              },
                            },
                            yAxis: {
                              type: "value",
                              axisLine: { show: false },
                              axisTick: { show: false },
                              splitLine: { lineStyle: { color: T.borderLight, type: "dashed" } },
                              axisLabel: { color: T.textMuted, fontSize: 10 },
                            },
                            series: [
                              {
                                name: "Diagnosis Count",
                                type: "bar",
                                data: consults,
                                itemStyle: { color: COLOR_CONSULTS, borderRadius: [4, 4, 0, 0] },
                                barCategoryGap: "20%",
                                barGap: "10%",
                                barMinHeight: 2,
                                cursor: "pointer",
                                emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(79,70,229,0.30)" } },
                              },
                              {
                                name: "Unique UHIDs",
                                type: "bar",
                                data: uhids,
                                itemStyle: { color: COLOR_UHIDS, borderRadius: [4, 4, 0, 0] },
                                barMinHeight: 2,
                                cursor: "pointer",
                                emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(13,148,136,0.30)" } },
                              },
                            ],
                            animationDuration: 500,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  {categoryTreemap.length > 0 && (
                    <InsightBox text={`${sorted.length} chronic diseases in total. The biggest is ${displayCat(dominant?.name || "")} — ${formatNum(dominant?.value || 0)} visits (${dominantPct}% of all chronic visits) from ${formatNum(dominant?.uniquePatients || 0)} different employees. Indigo bars are total visits; teal bars are unique people. A big gap between them means the same people are coming back many times.`} />
                  )}
                </div>
              );
            })()}
          </CVCard>
        </div>

        {/* Condition Share Distribution — table of every chronic ICD
            category with an expandable subcategory breakdown. Each
            category row shows total Consult Count + Unique UHIDs;
            expanding it lists every ICD subcategory underneath with the
            same two metrics. Sourced from charts.conditionsByCategory. */}
        <div>
          <CVCard
            accentColor="#6366f1"
            title="Condition Share Distribution"
            subtitle="Every chronic disease — click a row to expand the ICD condition breakdown with diagnosis count and unique UHIDs"
            tooltipText="Table of all chronic diseases with diagnosis count and unique UHIDs per row. Click the chevron on any row to expand and see every specific ICD condition inside it with the same two metrics."
            chartId="conditionShareDistribution"
            chartData={categoryTreemap}
            chartDescription="Expandable table of chronic diseases and their ICD conditions" tableData={categoryTable}
          >
            {categoryTreemap.length > 0 ? (() => {
              const sortedCats = [...categoryTreemap].sort((a: any, b: any) => b.value - a.value);
              const totalConsults = sortedCats.reduce((s: number, c: any) => s + (c.value || 0), 0);
              // True distinct chronic patient count — matches the KPI card.
              // Column sum won't equal this (comorbid patients sit in
              // multiple disease rows); this header value globally
              // dedupes via the chronicAcute query.
              const totalUhids = ca.chronicPatients || 0;
              const toggleRow = (name: string) => {
                setExpandedCategories((prev) => {
                  const next = new Set(prev);
                  if (next.has(name)) next.delete(name); else next.add(name);
                  return next;
                });
              };
              return (
                <div className="flex-1 flex flex-col">
                  {/* Hero strip — totals + expanded count */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="grid grid-cols-3 gap-x-5 gap-y-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Diseases</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Consults</p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: T.textMuted }}>Unique UHIDs</p>
                      <p className="text-[18px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{sortedCats.length}</p>
                      <p className="text-[18px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(totalConsults)}</p>
                      <p className="text-[18px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.textPrimary, fontVariantNumeric: "tabular-nums" }}>{formatNum(totalUhids)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const allOpen = expandedCategories.size === sortedCats.length;
                          setExpandedCategories(allOpen ? new Set() : new Set(sortedCats.map((c: any) => c.name)));
                        }}
                        className="text-[11px] font-semibold underline-offset-2 hover:underline"
                        style={{ color: "#6366f1" }}
                      >
                        {expandedCategories.size === sortedCats.length ? "Collapse all" : "Expand all"}
                      </button>
                    </div>
                  </div>
                  {/* Table */}
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: T.borderLight }}>
                    {/* Header row */}
                    <div className="grid items-center px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em]" style={{ gridTemplateColumns: "24px 1fr 110px 110px", background: "#F5F6FA", color: T.textMuted, borderBottom: `1px solid ${T.borderLight}` }}>
                      <span />
                      <span>Disease</span>
                      <span className="text-right">Consults</span>
                      <span className="text-right">Unique UHIDs</span>
                    </div>
                    {/* Body — scrollable. Row is ~40px tall (py-2.5 + a single
                        text-[12.5px] line + 1px border), so 10 × 40 = 400px
                        keeps exactly 10 categories visible without revealing
                        the 11th. */}
                    <div style={{ maxHeight: 400, overflowY: "auto" }}>
                      {sortedCats.map((c: any) => {
                        const isOpen = expandedCategories.has(c.name);
                        const subs = (conditionsByCategory[c.name] || []).slice().sort((a, b) => b.value - a.value);
                        return (
                          <div key={c.name}>
                            <button
                              type="button"
                              onClick={() => toggleRow(c.name)}
                              className="w-full grid items-center px-3 py-2.5 text-left transition-colors hover:bg-[#F8F9FC]"
                              style={{ gridTemplateColumns: "24px 1fr 110px 110px", borderBottom: `1px solid ${T.borderLight}`, background: isOpen ? "#F1F2F8" : T.white }}
                              aria-expanded={isOpen}
                            >
                              <span className="flex items-center justify-center" style={{ color: T.textMuted }}>
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </span>
                              <span className="text-[12.5px] font-semibold truncate" style={{ color: T.textPrimary }}>{displayCat(c.name)}</span>
                              <span className="text-[12.5px] font-bold tabular-nums text-right" style={{ color: "#4f46e5" }}>{formatNum(c.value)}</span>
                              <span className="text-[12.5px] font-bold tabular-nums text-right" style={{ color: "#0d9488" }}>{formatNum(c.uniquePatients || 0)}</span>
                            </button>
                            {isOpen && (
                              <div style={{ background: "#FBFBFE", borderBottom: `1px solid ${T.borderLight}` }}>
                                {subs.length === 0 ? (
                                  <p className="px-9 py-3 text-[11.5px]" style={{ color: T.textMuted }}>No ICD conditions recorded for this disease in the selected window.</p>
                                ) : (
                                  subs.map((s) => (
                                    <div
                                      key={s.name}
                                      className="grid items-center px-3 py-1.5 text-[11.5px]"
                                      style={{ gridTemplateColumns: "24px 1fr 110px 110px" }}
                                    >
                                      <span />
                                      <span className="truncate pl-3" style={{ color: T.textSecondary }} title={s.name}>{displaySub(s.name)}</span>
                                      <span className="text-right tabular-nums" style={{ color: T.textPrimary }}>{formatNum(s.value)}</span>
                                      <span className="text-right tabular-nums" style={{ color: T.textPrimary }}>{formatNum(s.uniquePatients)}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <InsightBox text={`${sortedCats.length} chronic diseases listed. Click any row to expand it and see every specific ICD condition inside, with how many visits they got and how many different people had them.`} />
                </div>
              );
            })() : (
              <div className="flex-1 flex items-center justify-center text-[13px]" style={{ color: T.textMuted, minHeight: 320 }}>
                No disease data available
              </div>
            )}
          </CVCard>
        </div>
      </div>
      </WarmSection>}

      {/* ── Demographic Analysis Section ── */}
      {isChartVisible("demographicAnalysis") && <WarmSection>
        <AccentBar color="#0d9488" colorEnd="#14b8a6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Demographic Analysis</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Chronic condition frequency across age groups, genders, and locations</p>
      {/* ── Condition & Demographic Insights ── */}
      <CVCard
        accentColor="#0d9488"
        title="Condition & Demographic Insights"
        subtitle="Explore how each chronic condition within your selected disease is distributed across demographic segments."
        tooltipText="Heatmap matrix showing chronic-condition frequency across demographic segments. Darker cells indicate higher consultation volumes for that condition-segment combination. Acute diagnoses are excluded."
        chartId="demographicAnalysis"
        chartData={demoMatrix}
        chartDescription="Condition frequency across demographic segments (heatmap)" tableData={demoTable}
        headerRight={
          <div className="flex items-center gap-2">
            <YearSelector years={years} value={demoYear} onChange={setDemoYear} />
            <ResetFilter visible={demoYear !== 2025} onClick={() => setDemoYear(2025)} />
            <CategorySelector categories={categories.length > 0 ? categories : (categoriesForSelect.map((c: any) => c.name))} value={demoCategory} onChange={(c) => { setDemoCategory(c); setDemoCondition(""); }} />
            <ResetFilter visible={demoCategory !== ""} onClick={() => setDemoCategory("")} />
          </div>
        }
      >
        {/* Dimension radio */}
        <div className="flex items-center gap-4 mb-4">
          {(["age", "gender", "location"] as const).map((tab) => (
            <label key={tab} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="demoTab" checked={demoTab === tab} onChange={() => setDemoTab(tab)} className="accent-purple-600" />
              <span className="text-[13px] font-medium" style={{ color: demoTab === tab ? T.textPrimary : T.textMuted }}>
                {tab === "age" ? "Age Group" : tab === "gender" ? "Gender" : "Location"}
              </span>
            </label>
          ))}
          <ResetFilter visible={demoTab !== "age"} onClick={() => setDemoTab("age")} />
        </div>

        {/* Heatmap table */}
        {demoMatrix.rows.length > 0 ? (
          <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
            <table className="w-full text-[12px] border-collapse" style={{ minWidth: 600 }}>
              <thead>
                <tr>
                  <th className="py-2.5 px-3 text-left font-bold text-[11px]" style={{ color: T.textPrimary, minWidth: 180 }}>Condition</th>
                  {demoSegments.map((seg: string) => (
                    <th key={seg} className="py-2.5 px-3 text-center font-bold text-[11px]" style={{ color: T.textPrimary, minWidth: 80 }}>{seg}</th>
                  ))}
                  <th className="py-2.5 px-3 text-center font-bold text-[11px]" style={{ color: T.textPrimary, minWidth: 80 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {demoMatrix.rows.map((row: any) => (
                  <tr key={row.condition}>
                    <td className="py-2.5 px-3 font-medium" style={{ color: T.textPrimary }}>{displaySub(row.condition)}</td>
                    {row.cells.map((val: number, i: number) => (
                      <td key={i} className="py-2.5 px-3 text-center font-bold text-[12px]" style={{
                        backgroundColor: getHeatmapColor(val, demoMatrix.maxVal),
                        color: getHeatmapTextColor(val, demoMatrix.maxVal),
                        border: "2px solid #fff",
                      }}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-default">{val > 0 ? formatNum(val) : "\u2014"}</span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-bold">Condition: {displaySub(row.condition)}</p>
                            <p>Demographic: {demoSegments[i]}</p>
                            <p>Consults: {formatNum(val)}</p>
                            <p>% of Disease: {row.total > 0 ? Math.round(val / row.total * 100) : 0}%</p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-center font-extrabold text-[13px]" style={{ color: T.textPrimary }}>{formatNum(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-[13px]" style={{ color: T.textMuted }}>Select a disease to view demographic breakdown</div>
        )}

        {/* Insights */}
        {demoMatrix.rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div className="rounded-xl px-4 py-3" style={{ border: "1px solid #c7d2fe", backgroundColor: "#eef2ff" }}>
              <p className="text-[12px] font-bold" style={{ color: "#4f46e5" }}>Top Hotspot</p>
              <p className="text-[11px] mt-1" style={{ color: T.textSecondary }}>{demoInsights.hotspot}</p>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ border: "1px solid #c7d2fe", backgroundColor: "#eef2ff" }}>
              <p className="text-[12px] font-bold" style={{ color: "#6C5B9E" }}>
                {demoTab === "gender" ? "Gender Split" : demoTab === "location" ? "Location Spread" : "Age Distribution"}
              </p>
              <p className="text-[11px] mt-1" style={{ color: T.textSecondary }}>
                {demoTab === "gender"
                  ? `Viewing gender breakdown across ${demoMatrix.rows.length} conditions. Darker cells show higher consultation counts for that gender.`
                  : demoTab === "location"
                  ? `Viewing facility-level breakdown across ${demoMatrix.rows.length} conditions. Compare clinic load to identify high-demand locations.`
                  : `Viewing age group breakdown across ${demoMatrix.rows.length} conditions. Identify which age cohorts are most affected per condition.`}
              </p>
            </div>
          </div>
        )}
      </CVCard>
      </WarmSection>}

      {/* ── Trends Section ── */}
      {isChartVisible("trendsOverTime") && <WarmSection>
        <AccentBar color="#4f46e5" colorEnd="#6366f1" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Trends Over Time</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Year-on-year and month-on-month chronic-condition consultation patterns</p>
      {/* ── Condition Trends ── */}
      <CVCard
        accentColor="#4f46e5"
        title="Year on Year Trends"
        subtitle="Tracks how the prevalence of chronic conditions changes over time."
        tooltipText="Line chart tracking how the selected chronic condition's consultation volume changes over time. Toggle between yearly and monthly views. Acute diagnoses are excluded."
        chartId="trendsOverTime"
        chartData={trendData}
        chartDescription="Condition consultation volume trends over time" tableData={trendsTable}
        headerRight={
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5" style={{ backgroundColor: T.borderLight }}>
              {(["yearly", "monthly"] as const).map((v) => (
                <button key={v} onClick={() => setTrendView(v)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${trendView === v ? "bg-white shadow-sm" : ""}`}
                  style={{ color: trendView === v ? T.textPrimary : T.textMuted }}>
                  {v === "yearly" ? "Yearly" : "Monthly"}
                </button>
              ))}
            </div>
            <ResetFilter visible={trendView !== "yearly"} onClick={() => setTrendView("yearly")} />
          </div>
        }
      >
        {/* Category dropdown + subcategory pills.
            Dropdown picks the parent chronic ICD category. Pills show the
            subcategories of that category plus an "All" pill at the front
            that clears selectedCondition so the chart shows the entire
            category's trend. Sources from latched lists so the controls
            stay populated when the SWR cache key changes (selecting a new
            category triggers a fresh fetch — without latching the dropdown
            would briefly disappear). The same controls drive both Yearly
            and Monthly views since they share this CVCard body. */}
        {(categoriesForSelect.length > 0 || trendsCategory) && (() => {
          const sortedCats = [...categoriesForSelect].sort((a: any, b: any) => b.value - a.value);
          const activeCat = trendsCategory || sortedCats[0]?.name || "";
          const subs = (conditionsForSelect[activeCat] || []).slice().sort((a, b) => b.value - a.value);
          const isAllSelected = !trendsCondition;
          return (
            <div className="mb-4">
              <select
                value={activeCat}
                onChange={(e) => { setTrendsCategory(e.target.value); setTrendsCondition(""); }}
                className="w-full h-9 px-3 rounded-lg border text-[13px] font-medium"
                style={{ borderColor: T.border, color: T.textPrimary }}
              >
                {sortedCats.map((c: any) => (
                  <option key={c.name} value={c.name}>{displayCat(c.name)}</option>
                ))}
              </select>
              {/* Subcategory chips — leading "All" pill aggregates the
                  whole category by clearing trendsCondition. */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <button
                  onClick={() => setTrendsCondition("")}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${isAllSelected ? "text-white border-transparent" : ""}`}
                  style={{
                    backgroundColor: isAllSelected ? "#4f46e5" : "transparent",
                    borderColor: isAllSelected ? "#4f46e5" : T.border,
                    color: isAllSelected ? "#fff" : T.textSecondary,
                  }}
                >
                  All
                </button>
                {subs.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => setTrendsCondition(c.name)}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      (trendsCondition === c.name) ? "text-white border-transparent" : ""
                    }`}
                    style={{
                      backgroundColor: trendsCondition === c.name ? "#4f46e5" : "transparent",
                      borderColor: trendsCondition === c.name ? "#4f46e5" : T.border,
                      color: trendsCondition === c.name ? "#fff" : T.textSecondary,
                    }}
                  >
                    {displaySub(c.name)}
                  </button>
                ))}
                {subs.length === 0 && (
                  <span className="text-[11px]" style={{ color: T.textMuted }}>No ICD conditions recorded for this disease in the selected window.</span>
                )}
              </div>
            </div>
          );
        })()}

        <div className="overflow-x-auto">
          <div style={{ height: 320, minWidth: Math.max(trendData.length * 60, 500) }}>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                {trendView === "yearly" ? (
                  // Yearly: combo chart — bars for Total Consultations,
                  // line for Unique Patients (right axis).
                  <ComposedChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: T.textMuted }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.textMuted }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: T.textMuted }} />
                    <RechartsTooltip
                      cursor={{ fill: "rgba(79,70,229,0.06)" }}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const dd = payload[0]?.payload;
                        return (
                          <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                            <p style={{ color: "#4f46e5" }}>Total Consultations : <strong>{formatNum(dd?.count || 0)}</strong></p>
                            <p style={{ color: "#0d9488" }}>Unique Patients : <strong>{formatNum(dd?.uniquePatients || 0)}</strong></p>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
                    <Bar yAxisId="left" dataKey="count" name="Total Consultations" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={64} />
                    <Line yAxisId="right" type="monotone" dataKey="uniquePatients" name="Unique Patients" stroke="#0d9488" strokeWidth={2.5} dot={{ r: 4, fill: "#0d9488", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                ) : (
                  // Monthly: keep the dual-area trend.
                  <AreaChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <defs>
                      <linearGradient id="gradTotalConsults" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="gradUniquePatients" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                    <XAxis dataKey="period" tick={{ fontSize: 11, fill: T.textMuted }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.textMuted }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: T.textMuted }} />
                    <RechartsTooltip
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload?.length) return null;
                        const dd = payload[0]?.payload;
                        return (
                          <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                            <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                            <p style={{ color: "#4f46e5" }}>Total Consultations : <strong>{formatNum(dd?.count || 0)}</strong></p>
                            <p style={{ color: "#818cf8" }}>Unique Patients : <strong>{formatNum(dd?.uniquePatients || 0)}</strong></p>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={7} />
                    <Area yAxisId="left" type="monotone" dataKey="count" name="Total Consultations" stroke="#4f46e5" fill="url(#gradTotalConsults)" strokeWidth={2.5} dot={{ r: 4, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }} />
                    <Area yAxisId="right" type="monotone" dataKey="uniquePatients" name="Unique Patients" stroke="#818cf8" fill="url(#gradUniquePatients)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "#fff", stroke: "#818cf8", strokeWidth: 2 }} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[13px]" style={{ color: T.textMuted }}>
                Select a disease and condition to view trends
              </div>
            )}
          </div>
        </div>
        {trendData.length > 0 && (
          <InsightBox text={`This ${trendView === "yearly" ? "year-over-year" : "month-over-month"} view shows how visits for ${trendsCondition ? displaySub(trendsCondition) : displayCat(trendsCategory)} have changed over time. A rising line means the condition is becoming more common; a falling one usually means prevention is working.`} />
        )}
      </CVCard>
      </WarmSection>}

      {/* ── Co-Occurrence Section ── */}
      {isChartVisible("coOccurrenceVitals") && <WarmSection>
        <AccentBar color="#7c3aed" colorEnd="#8b5cf6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Co-Occurrence</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Disease co-occurrences across the chronic patient cohort</p>
      {/* ── Co-Occurrence Venn (full width) ── */}
      <CVCard
          accentColor="#7c3aed"
          title="Chronic Disease Co-Occurrence"
          subtitle="Pick up to 3 chronic diseases — the venn shows unique-UHID overlap, with an age + gender breakdown of patients carrying ALL selected diseases"
          tooltipText="Multi-select chronic diseases (cap 3). Circles in the venn diagram are sized by the unique UHID count of each disease; overlap regions show how many patients carry the intersecting set. The panel beside it breaks down the all-overlap intersection by age group and gender."
          chartId="coOccurrence"
          chartData={coOccApi?.coOccurrenceVenn}
          chartDescription="Venn diagram of unique UHID overlap across selected chronic diseases with age + gender breakdown of the intersection" tableData={coOccTable}
          headerRight={<div className="flex items-center gap-2"><YearSelector years={years} value={coOccYear} onChange={setCoOccYear} includeAll /><ResetFilter visible={coOccYear !== 2025} onClick={() => setCoOccYear(2025)} /></div>}
        >
          {(() => {
            const venn = coOccApi?.coOccurrenceVenn || { categories: [], subsets: {}, overlapAge: {}, overlapGender: {} };
            const sortedAvailable = [...categoriesForSelect].sort((a: any, b: any) => b.value - a.value);
            const cap = 3;
            const colors = ["#7c3aed", "#0d9488", "#d97706"];
            const subsets: Record<string, number> = venn.subsets || {};
            const N = coOccCats.length;
            const sizeOf = (mask: number) => Number(subsets[String(mask)] || 0);
            const allMask = N > 0 ? (1 << N) - 1 : 0;
            const totalUhids = Object.values(subsets).reduce((s, n) => s + Number(n), 0);
            const intersection = sizeOf(allMask);
            // Per-category total (any subset that includes this index).
            const sizeIncluding = (idx: number) =>
              Object.entries(subsets).reduce((s, [m, v]) => s + ((Number(m) & (1 << idx)) ? Number(v) : 0), 0);

            // Venn layout. Fixed positions sized to fit a 360x300 svg.
            // For 1 cat: single circle. 2 cats: two side-by-side. 3 cats:
            // triangle. Counts are labeled inside each region so the
            // visual approximation doesn't have to be area-exact.
            const SVG_W = 360, SVG_H = 300;
            type Pos = { cx: number; cy: number; r: number };
            const circles: Pos[] =
              N === 1 ? [{ cx: 180, cy: 150, r: 90 }] :
              N === 2 ? [{ cx: 130, cy: 150, r: 88 }, { cx: 230, cy: 150, r: 88 }] :
              N === 3 ? [{ cx: 130, cy: 120, r: 80 }, { cx: 230, cy: 120, r: 80 }, { cx: 180, cy: 200, r: 80 }] : [];

            // Anchor positions for the count labels inside each venn region.
            const labelAt = (mask: number): { x: number; y: number } | null => {
              if (N === 1) {
                if (mask === 1) return { x: 180, y: 150 };
              }
              if (N === 2) {
                if (mask === 0b01) return { x: 95, y: 150 };
                if (mask === 0b10) return { x: 265, y: 150 };
                if (mask === 0b11) return { x: 180, y: 150 };
              }
              if (N === 3) {
                if (mask === 0b001) return { x: 90, y: 100 };
                if (mask === 0b010) return { x: 270, y: 100 };
                if (mask === 0b100) return { x: 180, y: 230 };
                if (mask === 0b011) return { x: 180, y: 95 };
                if (mask === 0b101) return { x: 130, y: 175 };
                if (mask === 0b110) return { x: 230, y: 175 };
                if (mask === 0b111) return { x: 180, y: 155 };
              }
              return null;
            };

            const allMaskList = N === 0 ? [] : Array.from({ length: (1 << N) - 1 }, (_, i) => i + 1);
            const togglePicked = (cat: string) => {
              setCoOccCats((prev) => {
                if (prev.includes(cat)) return prev.filter((c) => c !== cat);
                if (prev.length >= cap) return prev;
                return [...prev, cat];
              });
            };
            return (
              <div className="flex flex-col gap-4">
                {/* Multi-select picker — popover with checkboxes */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCoOccPickerOpen((v) => !v)}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[13px] font-medium hover:border-gray-300 transition-colors"
                    style={{ borderColor: T.border, color: T.textPrimary, background: T.white }}
                  >
                    Diseases
                    <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: "#7c3aed" }}>
                      {coOccCats.length}/{cap}
                    </span>
                    <ChevronDown size={13} style={{ color: T.textMuted }} />
                  </button>
                  {/* Selected pills next to the picker for at-a-glance state */}
                  <div className="inline-flex items-center gap-2 ml-3 flex-wrap align-middle">
                    {coOccCats.map((cat, i) => (
                      <span key={cat} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border" style={{ borderColor: colors[i] + "55", background: colors[i] + "10", color: colors[i] }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i] }} />
                        {displayCat(cat)}
                        <button onClick={() => togglePicked(cat)} className="opacity-60 hover:opacity-100" aria-label={`Remove ${cat}`}>×</button>
                      </span>
                    ))}
                    {coOccCats.length > 0 && (
                      <button onClick={() => setCoOccCats([])} className="text-[11px] font-semibold underline-offset-2 hover:underline" style={{ color: T.coral }}>Clear</button>
                    )}
                  </div>
                  {coOccPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setCoOccPickerOpen(false)} />
                      <div className="absolute left-0 top-full mt-1.5 z-50 w-[280px] rounded-xl border bg-white shadow-lg p-2" style={{ borderColor: T.border }}>
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] px-1 pb-1.5" style={{ color: T.textMuted }}>Pick up to {cap}</p>
                        <ScrollArea className="h-72 overflow-hidden">
                          <div className="space-y-0.5 pr-3">
                            {sortedAvailable.map((c: any) => {
                              const checked = coOccCats.includes(c.name);
                              const disabled = !checked && coOccCats.length >= cap;
                              return (
                                <label
                                  key={c.name}
                                  className={`flex items-center gap-2 px-1.5 py-1.5 rounded-lg text-[12px] ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50 cursor-pointer"}`}
                                  style={{ color: T.textPrimary }}
                                >
                                  <Checkbox checked={checked} disabled={disabled} onCheckedChange={() => togglePicked(c.name)} className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate" title={c.name}>{displayCat(c.name)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}
                </div>

                {/* Two-column layout: venn on the left, demographics on the right */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
                  {/* Venn diagram */}
                  <div className="rounded-xl border p-4" style={{ borderColor: T.borderLight, background: "#FAFBFD" }}>
                    {N === 0 ? (
                      <div className="h-[300px] flex flex-col items-center justify-center text-center text-[13px] gap-2" style={{ color: T.textMuted }}>
                        <p className="font-semibold" style={{ color: T.textSecondary }}>Pick at least 2 chronic diseases</p>
                        <p className="text-[11.5px]">Selections appear as overlapping circles sized by unique UHID count.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <svg width={SVG_W} height={SVG_H} role="img" aria-label="Co-occurrence venn diagram">
                          {circles.map((c, i) => (
                            <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={colors[i]} fillOpacity={0.22} stroke={colors[i]} strokeWidth={1.5} />
                          ))}
                          {allMaskList.map((mask) => {
                            const pos = labelAt(mask);
                            if (!pos) return null;
                            const v = sizeOf(mask);
                            if (v === 0) return null;
                            return (
                              <text key={mask} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central" fontSize={N === 3 ? 11 : 13} fontWeight={700} fill={T.textPrimary}>
                                {formatNum(v)}
                              </text>
                            );
                          })}
                        </svg>
                        {/* Legend */}
                        <div className="flex items-center gap-4 mt-2 text-[11.5px] flex-wrap justify-center" style={{ color: T.textSecondary }}>
                          {coOccCats.map((cat, i) => (
                            <span key={cat} className="inline-flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[i] }} />
                              <span style={{ color: T.textPrimary, fontWeight: 600 }}>{displayCat(cat)}</span>
                              <span className="tabular-nums" style={{ color: T.textMuted }}>· {formatNum(sizeIncluding(i))}</span>
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 text-[11px] tabular-nums" style={{ color: T.textMuted }}>
                          {N >= 2 ? <>Patients in <strong style={{ color: T.textPrimary }}>all {N}</strong> selected: <strong style={{ color: "#7c3aed" }}>{formatNum(intersection)}</strong> of <strong style={{ color: T.textPrimary }}>{formatNum(totalUhids)}</strong> total</> : <>Single-disease view — pick another to see overlap.</>}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Intersection demographics */}
                  <div className="rounded-xl border p-4" style={{ borderColor: T.borderLight, background: T.white }}>
                    <p className="text-[11px] font-bold uppercase tracking-[0.06em] mb-1" style={{ color: T.textMuted }}>Intersection demographics</p>
                    <p className="text-[12px] mb-3" style={{ color: T.textSecondary }}>
                      {N >= 2 ? <>Patients carrying <strong style={{ color: T.textPrimary }}>all {N}</strong> selected diseases</> : "Pick 2+ diseases to see the breakdown"}
                    </p>
                    {N >= 2 && intersection > 0 ? (
                      <>
                        {/* Age */}
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] mb-1.5" style={{ color: T.textMuted }}>By age</p>
                        <div className="flex flex-col gap-1.5 mb-4">
                          {(["<20", "20-35", "36-40", "41-60", "61+"] as const).map((ag) => {
                            const v = Number(venn.overlapAge?.[ag] || 0);
                            const pct = intersection > 0 ? (v / intersection) * 100 : 0;
                            return (
                              <div key={ag} className="flex items-center gap-2 text-[11.5px]">
                                <span className="w-12 shrink-0" style={{ color: T.textSecondary }}>{ag}</span>
                                <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: T.borderLight }}>
                                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "#7c3aed" }} />
                                </span>
                                <span className="w-10 text-right tabular-nums font-semibold" style={{ color: T.textPrimary }}>{formatNum(v)}</span>
                                <span className="w-10 text-right tabular-nums" style={{ color: T.textMuted }}>{Math.round(pct)}%</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Gender */}
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.05em] mb-1.5" style={{ color: T.textMuted }}>By gender</p>
                        <div className="flex flex-col gap-1.5">
                          {(["Male", "Female", "Others"] as const).map((g) => {
                            const v = Number(venn.overlapGender?.[g] || 0);
                            const pct = intersection > 0 ? (v / intersection) * 100 : 0;
                            const colour = g === "Male" ? GENDER_COLORS.Male : g === "Female" ? GENDER_COLORS.Female : "#94a3b8";
                            return (
                              <div key={g} className="flex items-center gap-2 text-[11.5px]">
                                <span className="w-12 shrink-0" style={{ color: T.textSecondary }}>{g}</span>
                                <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: T.borderLight }}>
                                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
                                </span>
                                <span className="w-10 text-right tabular-nums font-semibold" style={{ color: T.textPrimary }}>{formatNum(v)}</span>
                                <span className="w-10 text-right tabular-nums" style={{ color: T.textMuted }}>{Math.round(pct)}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px] py-8 text-center" style={{ color: T.textMuted }}>
                        {N >= 2 ? "No patients carry all selected diseases." : "—"}
                      </div>
                    )}
                  </div>
                </div>
                <InsightBox text="Pick up to three chronic diseases from the dropdown to compare them. Each circle's size is how many different people have that disease. Where the circles overlap shows people who have all of them at once. The panel on the right tells you the age and gender of those overlap patients — handy for designing programmes that target multiple diseases together." />
              </div>
            );
          })()}
      </CVCard>

      </WarmSection>}

      {/* ── Monthly Patterns Section ── */}
      {isChartVisible("seasonalPatterns") && <WarmSection>
        <AccentBar color="#0d9488" colorEnd="#14b8a6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Monthly Patterns</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Top chronic diseases per month, with diagnosis counts</p>
      {/* ── Monthly Condition Patterns (calendar grid) ── */}
      {(() => {
        // Build per-month data for the selected year from seasonalTrends
        // (now keyed by chronic ICD parent category, not ICD description).
        const monthData: { month: number; conditions: { name: string; count: number; color: string }[]; total: number }[] = [];
        const monthTotals: Record<number, Record<string, number>> = {};
        for (const rawName of seasonalConditions) {
          const shortName = displayCat(rawName);
          for (const pt of (seasonalTrends[rawName] || [])) {
            const [yr, mo] = pt.period.split("-").map(Number);
            if (yr !== seasonalYear) continue;
            if (!monthTotals[mo]) monthTotals[mo] = {};
            monthTotals[mo][shortName] = (monthTotals[mo][shortName] || 0) + pt.count;
          }
        }
        for (let m = 1; m <= 12; m++) {
          const counts = monthTotals[m] || {};
          const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
          const total = Object.values(counts).reduce((s, v) => s + v, 0);
          monthData.push({
            month: m,
            conditions: sorted.map(([name, count]) => ({
              name,
              count,
              color: SEASONAL_DOT_COLORS[name] || T.textMuted,
            })),
            total,
          });
        }
        const peakMonth = monthData.reduce((best, m) => m.total > best.total ? m : best, monthData[0]);
        const peakName = peakMonth?.conditions[0]?.name || "";
        const secondName = peakMonth?.conditions[1]?.name || "";

        return (
          <CVCard
            accentColor="#0d9488"
            title="Monthly Condition Patterns"
            subtitle="Each month shows the top 3 chronic diseases by diagnosis count for the selected year."
            tooltipText="12-month calendar grid showing the top 3 chronic ICD parent categories per month with season-colored backgrounds. Useful for spotting cyclical demand on specific care areas."
            chartId="seasonalPatterns"
            chartData={monthData}
            chartDescription="Top chronic diseases per month with diagnosis counts" tableData={seasonalTable}
            headerRight={<div className="flex items-center gap-2"><YearSelector years={years} value={seasonalYear} onChange={setSeasonalYear} /><ResetFilter visible={seasonalYear !== 2025} onClick={() => setSeasonalYear(2025)} /></div>}
          >
            <div className="overflow-x-auto">
              <div className="grid grid-cols-4 gap-3" style={{ minWidth: 700 }}>
                {monthData.map((md) => {
                  const season = SEASON_MAP[md.month];
                  return (
                    <div
                      key={md.month}
                      className="rounded-xl px-4 py-3 transition-all hover:shadow-md cursor-pointer"
                      style={{ backgroundColor: season.bg, border: `1px solid ${season.bg}` }}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[15px] font-extrabold" style={{ color: T.textPrimary }}>{MONTH_NAMES[md.month - 1]}</span>
                        <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>{season.label}</span>
                      </div>
                      <div className="space-y-1.5">
                        {md.conditions.map((c) => (
                          <div key={c.name} className="flex items-center justify-between text-[12px]">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                              <span className="font-medium" style={{ color: T.textPrimary }}>{c.name}</span>
                            </div>
                            <span style={{ color: T.textSecondary }}>{formatNum(c.count)} cases</span>
                          </div>
                        ))}
                        {md.conditions.length === 0 && (
                          <p className="text-[11px] italic" style={{ color: T.textMuted }}>No data</p>
                        )}
                      </div>
                      <p className="text-[11px] mt-2 font-medium" style={{ color: T.textMuted }}>
                        {formatNum(md.total)} total cases
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Key Insight */}
            <div className="mt-4 rounded-xl px-5 py-3" style={{ backgroundColor: "#FAFAFA", border: `1px solid ${T.border}` }}>
              <p className="text-[13px] font-bold mb-0.5" style={{ color: T.textPrimary }}>Key Insight</p>
              <p className="text-[12px]" style={{ color: T.textSecondary }}>
                The calendar visualization shows {MONTH_NAMES[(peakMonth?.month || 1) - 1]} had the highest concentration of cases in {seasonalYear}, with {peakName}{secondName ? ` and ${secondName}` : ""} showing strong seasonal patterns.
              </p>
            </div>
          </CVCard>
        );
      })()}

      </WarmSection>}

      <DataAuditSection provenance={raw?._meta?.provenance} />

    </div>
  );
}
