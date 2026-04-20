"use client";

import { T, CHART_PALETTE, CHART_PALETTE_EXTENDED, HEATMAP_GRADIENT, GENDER_COLORS } from "@/lib/ui/theme";
import { useState, useMemo, useEffect } from "react";
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
import {
  Info,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  CalendarDays,
  Bell,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
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

const SYMPTOM_COLORS = CHART_PALETTE_EXTENDED;

const HEATMAP_COLORS = HEATMAP_GRADIENT;

// ─── Display‑name mapping (from ICD10 Brief Excel) ───
const CATEGORY_DISPLAY: Record<string, string> = {
  "Cancers": "Cancer",
  "Cardiovascular Diseases": "Cardiovascular Diseases",
  "Diseases of the skin and subcutaneous tissue": "Skin & Subcutaneous",
  "Endocrine & Metabolic disorders:": "Metabolic Disorders",
  "Gastrointestinal and related conditions": "Gastrointestinal Diseases",
  "Generalised Debility (Weakness, Body Pains, Lethargy etc.)": "Generalised Debility",
  "Genitourinary Diseases": "Urological Conditions",
  "Immunologic & Rheumatologic Conditions": "Immunologic & Rheumatologic",
  "Infections (Communicable Diseases)": "Infections",
  "Injury, Fracture or Trauma": "Injuries",
  "Neonatal and Congenital Diseases": "Congenital Anomalies",
  "Neuro-psychiatric conditions": "Neuro-Psychiatric",
  "Nutritional Deficiencies & Allied Conditions": "Nutritional Deficiencies",
  "Obstetric & Gynecologic Issues": "Obstetric & Gynecologic",
  "Other Benign Conditions (including non-cancerous Tumors)": "Other Benign Conditions",
  "Respiratory Diseases": "Respiratory Diseases",
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
  return SUBCATEGORY_SHORT[name] || name;
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
function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true,
  headerRight, chartId, chartData, chartTitle, chartDescription,
}: {
  children: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean;
  headerRight?: React.ReactNode; chartId?: string;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px ${expanded ? "col-span-full" : ""} ${className}`}
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
      <div className="px-6 pb-5">{children}</div>
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

// ─── Year Selector ───
function YearSelector({ years, value, onChange }: { years: number[]; value: number; onChange: (y: number) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8 px-3 rounded-lg border text-[13px] font-medium"
      style={{ borderColor: T.border, color: T.textPrimary }}
    >
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
function InsightBox({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3.5 mt-4 text-[12px] leading-[1.7] font-medium" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// ─── Stat Card ───
function StatCard({ label, value, color, sub }: {
  label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-1"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
      <p className="text-[34px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{value}</p>
      {sub && <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>{sub}</p>}
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
  const [selectedYear, setSelectedYear] = useState(2025);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("");
  const [demoTab, setDemoTab] = useState<"age" | "gender" | "location">("age");
  const [trendView, setTrendView] = useState<"yearly" | "monthly">("yearly");
  const [conditionType, setConditionType] = useState<"all" | "chronic" | "acute">("all");
  const [vitalType, setVitalType] = useState<"BMI" | "Systolic BP" | "Diastolic BP" | "SpO2">("BMI");
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

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    p.set("year", String(selectedYear));
    p.set("dateFrom", format(appliedDateRange.from, "yyyy-MM-dd"));
    p.set("dateTo", format(appliedDateRange.to, "yyyy-MM-dd"));
    if (selectedCategory) p.set("category", selectedCategory);
    if (selectedCondition) p.set("condition", selectedCondition);
    if (conditionType !== "all") p.set("conditionType", conditionType);
    if (appliedFilters.ageGroups.length) p.set("ageGroups", appliedFilters.ageGroups.join(","));
    if (appliedFilters.genders.length) p.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.locations.length) p.set("locations", appliedFilters.locations.join(","));
    if (appliedFilters.conditions.length) p.set("conditions", appliedFilters.conditions.join(","));
    return `/api/ohc/health-insights?${p.toString()}`;
  }, [selectedYear, selectedCategory, selectedCondition, conditionType, appliedFilters, appliedDateRange]);

  const { data: raw, isLoading, isValidating, mutate } = useSWR(apiUrl, (url: string) => fetch(url).then((r) => r.json()), {
    revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true,
  });
  const d = raw as any;

  // Set initial category when data loads
  const categories: string[] = d?.categories || [];
  const years: number[] = d?.years || [2024, 2025, 2026];
  const effectiveCategory = selectedCategory || categories[0] || "";
  const conditionBreakdown: any[] = d?.conditionBreakdown || [];
  const effectiveCondition = selectedCondition || conditionBreakdown[0]?.name || "";

  // Auto-select category when data loads — default to Metabolic Disorders
  useEffect(() => {
    if (!selectedCategory && categories.length > 0) {
      const metabolic = categories.find((c) => c.toLowerCase().includes("metabolic"));
      setSelectedCategory(metabolic || categories[0]);
    }
  }, [categories, selectedCategory]);
  useEffect(() => {
    if (!selectedCondition && conditionBreakdown.length > 0) {
      setSelectedCondition(conditionBreakdown[0]?.name || "");
    }
  }, [conditionBreakdown, selectedCondition]);

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

  // Trends
  const trendData = trendView === "yearly" ? (d?.conditionTrendsYearly || []) : (d?.conditionTrends || []);

  // Demographics
  const demoData = demoTab === "age" ? d?.demoAge : demoTab === "gender" ? d?.demoGender : d?.demoLocation;
  const demoSegments = demoTab === "age" ? filterOptions.ageGroups : demoTab === "gender" ? filterOptions.genders : (d?.facilities || filterOptions.locations);

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

  // Disease combos (limit to 6)
  const combos = (d?.diseaseCombinations || []).slice(0, 6);

  // Seasonal trends
  const seasonalTrends: Record<string, any[]> = d?.seasonalTrends || {};
  const seasonalConditions = Object.keys(seasonalTrends);

  // Vitals
  const vitalsData = d?.vitalsTrend?.[vitalType] || [];

  // Symptom mapping
  const symptomData = d?.symptomMapping || [];

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

  return (
    <div className="animate-stagger space-y-6" style={{ opacity: isValidating ? 0.6 : 1, transition: "opacity 0.2s ease" }}>
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

        <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
        <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pageFilters.genders} onChange={(v) => setPageFilters((p) => ({ ...p, genders: v }))} />
        <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
        <FilterMultiSelect label="Condition" options={categories} selected={pageFilters.conditions} onChange={(v) => setPageFilters((p) => ({ ...p, conditions: v }))} />

        <div className="flex-1" />
        <PageDownload pageTitle="Health Insights" />
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
          pageSlug="/portal/ohc/health-insights"
          pageTitle="Health Insights"
          charts={[
            { id: "healthKpis", label: "Health Insight KPIs" },
            { id: "diseaseLandscape", label: "Disease Landscape" },
            { id: "categoryBreakdown", label: "Category Breakdown" },
            { id: "demographicAnalysis", label: "Demographic Analysis" },
            { id: "trendsOverTime", label: "Trends Over Time" },
            { id: "coOccurrenceVitals", label: "Co-Occurrence & Vitals" },
            { id: "seasonalPatterns", label: "Seasonal Patterns" },
            { id: "symptomMapping", label: "Symptom Mapping" },
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

      <PageGlanceBox
        pageTitle="Health Insights Overview"
        pageSubtitle="Diagnosis patterns, condition trends and vital sign analytics"
        kpis={{}}
        fallbackSummary={categoryTreemap.length > 0
          ? `${displayCat(categoryTreemap[0]?.name || "")} leads with ${formatNum(categoryTreemap[0]?.value || 0)} consultations (${categoryTreemap[0]?.percentage || 0}% of total across ${categories.length} ICD categories). ${ca.chronicPatients && ca.acutePatients ? `${Math.round(ca.chronicPatients / (ca.chronicPatients + ca.acutePatients) * 100)}% of patients carry chronic conditions.` : ""}`
          : "Diagnosis patterns, condition trends and vital sign analytics across all consultations."}
        fallbackChips={categoryTreemap.length > 0 ? [
          { label: "Top Category", value: displayCat(categoryTreemap[0]?.name || "—") },
          { label: "Total Diagnoses", value: formatNum(categoryTreemap.reduce((s: number, c: any) => s + c.value, 0)) },
          { label: "ICD Categories", value: String(categories.length) },
          { label: "Chronic Patients", value: formatNum(ca.chronicPatients || 0) },
        ] : [
          { label: "Top Condition", value: "Musculoskeletal" },
          { label: "Total Cases", value: "2,847" },
          { label: "Categories Tracked", value: "10+" },
          { label: "YoY Trend", value: "+14.2%" },
        ]}
      />

      {/* ── KPI Stat Cards ── */}
      {isChartVisible("healthKpis") && categoryTreemap.length > 0 && (() => {
        const totalDiagnoses = categoryTreemap.reduce((s: number, c: any) => s + c.value, 0);
        const chronicCount = ca.chronicPatients || 0;
        const acuteCount = ca.acutePatients || 0;
        const totalPt = chronicCount + acuteCount;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Diagnoses" value={formatNum(totalDiagnoses)} color="#4f46e5" sub="Across all ICD categories" />
            <StatCard label="Chronic Patients" value={formatNum(chronicCount)} color="#4f46e5" sub={`${totalPt > 0 ? Math.round(chronicCount / totalPt * 100) : 0}% of patient pool`} />
            <StatCard label="Acute Patients" value={formatNum(acuteCount)} color="#0d9488" sub={`${totalPt > 0 ? Math.round(acuteCount / totalPt * 100) : 0}% of patient pool`} />
            <StatCard label="ICD Categories" value={categories.length || 0} color="#7c3aed" sub="Tracked disease categories" />
          </div>
        );
      })()}

      {/* ── Disease Landscape Section ── */}
      {isChartVisible("diseaseLandscape") && <WarmSection>
        <AccentBar color="#4f46e5" colorEnd="#6366f1" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Disease Landscape</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Top condition categories and chronic vs. acute patient split</p>

        {/* Top 5 Condition cards */}
        {categoryTreemap.length > 0 && (
          <div className="grid grid-cols-5 gap-3 mb-5">
            {categoryTreemap.slice(0, 5).map((c: any) => (
              <div
                key={c.name}
                className="bg-white px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 rounded-2xl cursor-pointer flex flex-col gap-1"
                style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
                onClick={() => { setSelectedCategory(c.name); setSelectedCondition(""); }}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] truncate" style={{ color: T.textMuted }}>{displayCat(c.name)}</p>
                <p className="text-[28px] font-extrabold tracking-[-0.025em] leading-none" style={{ color: "#4f46e5", fontVariantNumeric: "tabular-nums" }}>{formatNum(c.value)}</p>
                <p className="text-[12px] font-semibold" style={{ color: "#4f46e5" }}>{c.percentage}% of total</p>
                <p className="text-[11px]" style={{ color: T.textSecondary }}>{formatNum(c.uniquePatients)} unique patients</p>
              </div>
            ))}
          </div>
        )}

      {/* ── Chronic vs. Acute ── */}
      {(() => {
        const chronicCount = ca.chronicPatients || 0;
        const acuteCount = ca.acutePatients || 0;
        const totalPatients = chronicCount + acuteCount;
        const chronicPct = totalPatients > 0 ? Math.round((chronicCount / totalPatients) * 100) : 0;
        const acutePct = totalPatients > 0 ? 100 - chronicPct : 0;
        return (
          <CVCard
            accentColor="#4f46e5"
            title="Chronic vs. Acute"
            subtitle="Total patients by Condition Type - click to filter the dashboard"
            tooltipText="Shows the split between chronic (long-term) and acute (short-term) conditions. Use toggle buttons to filter the dashboard by condition type."
            expandable={false}
            chartId="chronicVsAcute"
            chartData={{ chronicCount, acuteCount, totalPatients, chronicPct, acutePct }}
            chartDescription="Split between chronic (long-term) and acute (short-term) conditions"

          >
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {([["all", "All Repeaters"], ["chronic", "Chronic Only"], ["acute", "Acute Only"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setConditionType(val)}
                  className="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all border"
                  style={conditionType === val
                    ? { backgroundColor: T.textPrimary, color: "#fff", borderColor: T.textPrimary }
                    : { borderColor: T.border, color: T.textSecondary, backgroundColor: T.white }
                  }
                >{label}</button>
              ))}
              <ResetFilter visible={conditionType !== "all"} onClick={() => setConditionType("all")} />
            </div>
            {/* Horizontal stacked bar */}
            <div className="w-full h-11 rounded-lg overflow-hidden flex">
              <div
                className="flex items-center justify-center text-[13px] font-bold text-white transition-all"
                style={{ width: `${chronicPct}%`, backgroundColor: "#4f46e5", minWidth: chronicCount > 0 ? 80 : 0 }}
              >
                {formatNum(chronicCount)} Chronic
              </div>
              <div
                className="flex items-center justify-center text-[13px] font-bold text-white transition-all"
                style={{ width: `${acutePct}%`, backgroundColor: "#0d9488", minWidth: acuteCount > 0 ? 80 : 0 }}
              >
                {formatNum(acuteCount)} Acute
              </div>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-5 mt-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#4f46e5" }} />
                <span className="text-[12px]" style={{ color: T.textSecondary }}>Chronic ({chronicPct}%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#0d9488" }} />
                <span className="text-[12px]" style={{ color: T.textSecondary }}>Acute ({acutePct}%)</span>
              </div>
            </div>
            <p className="mt-2 text-[13px]" style={{ color: T.textSecondary }}>
              <span className="text-[20px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{formatNum(totalPatients)}</span>{" "}
              total patients (based on current selection)
            </p>
            <InsightBox text="Repeat patients are employees who availed any OHC service at least twice in the selected date range. Use the filters above to view Chronic-only or Acute-only patient segments." />
          </CVCard>
        );
      })()}
      </WarmSection>}

      {/* ── Category Breakdown Section ── */}
      {isChartVisible("categoryBreakdown") && <WarmSection>
        <AccentBar color="#6366f1" colorEnd="#818cf8" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Category Breakdown</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>ICD category distribution and condition-level breakdown for the selected category</p>
      {/* ── ICD Category Treemap + Condition Treemap (50/50) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ICD Category Distribution Treemap */}
        <div>
          <CVCard
            accentColor="#4f46e5"
            title="ICD Category Distribution"
            subtitle="Most prevalent clinical conditions observed across consultations. Click any category to view its conditions breakdown on right"
            tooltipText="Treemap showing proportional distribution of disease categories by consultation volume. Click any category to view its condition breakdown on the right panel."
            headerRight={<div className="flex items-center gap-2"><YearSelector years={years} value={selectedYear} onChange={setSelectedYear} /><ResetFilter visible={selectedYear !== 2025} onClick={() => setSelectedYear(2025)} /></div>}
            chartId="icdCategoryDistribution"
            chartData={categoryTreemap}
            chartDescription="Proportional distribution of disease categories by consultation volume"
          >
            <div className="mb-1" />
            <div style={{ height: 360 }}>
              <ReactECharts
                style={{ height: "100%", width: "100%" }}
                onEvents={{
                  click: (params: any) => {
                    if (params.data?.name) {
                      setSelectedCategory(params.data.name);
                      setSelectedCondition("");
                    }
                  },
                }}
                option={{
                  tooltip: {
                    trigger: "item",
                    backgroundColor: "#fff",
                    borderColor: T.border,
                    borderWidth: 1,
                    padding: [10, 14],
                    textStyle: { fontSize: 12, color: T.textPrimary },
                    extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
                    formatter: (p: any) => {
                      const d = p.data;
                      return `<strong>${displayCat(d.name)}</strong><br/>Consults: ${formatNum(d._realValue ?? d.value)}<br/>Unique Patients: ${formatNum(d.uniquePatients || 0)}<br/>Share of total: ${d.percentage ?? 0}%`;
                    },
                  },
                  series: [{
                    type: "treemap",
                    data: (() => {
                      const transformed = categoryTreemap.map((item: any) => ({ ...item, _sqrtVal: Math.pow(item.value || 1, 0.35) }));
                      const totalSqrt = transformed.reduce((s: number, t: any) => s + t._sqrtVal, 0);
                      return transformed.map((item: any, i: number) => ({
                        ...item,
                        value: item._sqrtVal,
                        _realValue: item.value,
                        _displayPct: totalSqrt > 0 ? Math.round((item._sqrtVal / totalSqrt) * 1000) / 10 : 0,
                        itemStyle: {
                          color: TREEMAP_COLORS[i % TREEMAP_COLORS.length],
                          borderColor: "#fff",
                          borderWidth: 1,
                          borderRadius: 0,
                          gapWidth: 0,
                        },
                      }));
                    })(),
                    roam: false,
                    nodeClick: false,
                    breadcrumb: { show: false },
                    label: {
                      show: true,
                      position: "insideTopLeft",
                      padding: [4, 5],
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "var(--font-inter), system-ui, sans-serif",
                      overflow: "break",
                      formatter: (p: any) => {
                        const dn = displayCat(p.data.name);
                        const totalVal = categoryTreemap.reduce((s: number, t: any) => s + Math.pow(t.value || 1, 0.35), 0);
                        const share = totalVal > 0 ? p.value / totalVal : 0;
                        if (share < 0.04) return `{nameXS|${dn}}`;
                        if (share < 0.08) return `{nameS|${dn}}`;
                        return `{name|${dn}}\n{pct|${p.data._displayPct ?? p.data.percentage}%}`;
                      },
                      rich: {
                        name: { fontSize: 11, fontWeight: 600, color: "#fff", lineHeight: 16 },
                        pct: { fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.75)", lineHeight: 14 },
                        nameS: { fontSize: 9, fontWeight: 600, color: "#fff", lineHeight: 12 },
                        nameXS: { fontSize: 7, fontWeight: 600, color: "#fff", lineHeight: 9 },
                      },
                    },
                    itemStyle: { borderRadius: 0 },
                  }],
                }}
              />
            </div>
            {categoryTreemap.length > 0 && (
              <InsightBox text={`The leading ICD category is ${displayCat(categoryTreemap[0]?.name || "")} with ${formatNum(categoryTreemap[0]?.value || 0)} consultations, accounting for the largest share of clinical visits. Click any category to drill into its condition breakdown.`} />
            )}
          </CVCard>
        </div>

        {/* Condition Share Distribution */}
        <div>
          <CVCard
            accentColor="#6366f1"
            title="Condition Share Distribution"
            subtitle="Breakdown of specific conditions within the selected category. Click to see the trends below"
            tooltipText="Breaks down specific conditions within the selected ICD category. Tile sizes represent relative consultation volumes with power-balanced percentages."
            chartId="conditionShareDistribution"
            chartData={conditionBreakdown}
            chartDescription="Breakdown of specific conditions within the selected ICD category"
          >
            <div className="mb-1" />
            <div style={{ height: 360 }}>
              {conditionBreakdown.length > 0 ? (
                <ReactECharts
                  style={{ height: "100%", width: "100%" }}
                  onEvents={{
                    click: (params: any) => {
                      if (params.data?.name) setSelectedCondition(params.data.name);
                    },
                  }}
                  option={{
                    tooltip: {
                      trigger: "item",
                      backgroundColor: "#fff",
                      borderColor: T.border,
                      borderWidth: 1,
                      padding: [10, 14],
                      textStyle: { fontSize: 12, color: T.textPrimary },
                      extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
                      formatter: (p: any) => {
                        const d = p.data;
                        return `<strong>${displaySub(d.name)}</strong><br/>Consults: ${formatNum(d._realValue ?? d.value)}<br/>Unique Patients: ${formatNum(d.uniquePatients || 0)}<br/>Share of category: ${d.percentage ?? 0}%`;
                      },
                    },
                    series: [{
                      type: "treemap",
                      data: (() => {
                        const transformed = conditionBreakdown.map((item: any) => ({ ...item, _sqrtVal: Math.pow(item.value || 1, 0.35) }));
                        const totalSqrt = transformed.reduce((s: number, t: any) => s + t._sqrtVal, 0);
                        return transformed.map((item: any, i: number) => ({
                          ...item,
                          value: item._sqrtVal,
                          _realValue: item.value,
                          _displayPct: totalSqrt > 0 ? Math.round((item._sqrtVal / totalSqrt) * 1000) / 10 : 0,
                          itemStyle: {
                            color: CONDITION_TREEMAP_COLORS[i % CONDITION_TREEMAP_COLORS.length],
                            borderColor: "#fff",
                            borderWidth: 1,
                            borderRadius: 0,
                            gapWidth: 0,
                          },
                        }));
                      })(),
                      roam: false,
                      nodeClick: false,
                      breadcrumb: { show: false },
                      label: {
                        show: true,
                        position: "insideTopLeft",
                        padding: [4, 5],
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: "var(--font-inter), system-ui, sans-serif",
                        overflow: "truncate",
                        ellipsis: "…",
                        formatter: (p: any) => {
                          const dn = displaySub(p.data.name);
                          const totalVal = conditionBreakdown.reduce((s: number, t: any) => s + Math.pow(t.value || 1, 0.35), 0);
                          const share = totalVal > 0 ? p.value / totalVal : 0;
                          if (share < 0.04) return `{nameXS|${dn}}`;
                          if (share < 0.08) return `{nameS|${dn}}`;
                          return `{name|${dn}}\n{pct|${p.data._displayPct ?? p.data.percentage}%}`;
                        },
                        rich: {
                          name: { fontSize: 11, fontWeight: 600, color: "#fff", lineHeight: 16 },
                          pct: { fontSize: 10, fontWeight: 400, color: "rgba(255,255,255,0.75)", lineHeight: 14 },
                          nameS: { fontSize: 9, fontWeight: 600, color: "#fff", lineHeight: 12 },
                          nameXS: { fontSize: 7, fontWeight: 600, color: "#fff", lineHeight: 9 },
                        },
                      },
                      itemStyle: { borderRadius: 0 },
                    }],
                  }}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-[13px]" style={{ color: T.textMuted }}>
                  Click a category to explore conditions
                </div>
              )}
            </div>
            {conditionBreakdown.length > 0 && (
              <InsightBox text={`Within ${displayCat(effectiveCategory)}, the top condition is ${displaySub(conditionBreakdown[0]?.name || "")} with ${formatNum(conditionBreakdown[0]?.value || 0)} consultations. This breakdown shows how specific conditions contribute to the selected ICD category.`} />
            )}
          </CVCard>
        </div>
      </div>
      </WarmSection>}

      {/* ── Demographic Analysis Section ── */}
      {isChartVisible("demographicAnalysis") && <WarmSection>
        <AccentBar color="#0d9488" colorEnd="#14b8a6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Demographic Analysis</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Condition frequency across age groups, genders, and locations</p>
      {/* ── Condition & Demographic Insights ── */}
      <CVCard
        accentColor="#0d9488"
        title="Condition & Demographic Insights"
        subtitle="Explore how each condition within your selected ICD Category is distributed across demographic segments."
        tooltipText="Heatmap matrix showing condition frequency across demographic segments. Darker cells indicate higher consultation volumes for that condition-segment combination."
        chartId="demographicAnalysis"
        chartData={demoMatrix}
        chartDescription="Condition frequency across demographic segments (heatmap)"
        headerRight={
          <div className="flex items-center gap-2">
            <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
            <ResetFilter visible={selectedYear !== 2025} onClick={() => setSelectedYear(2025)} />
            <CategorySelector categories={categories} value={effectiveCategory} onChange={(c) => { setSelectedCategory(c); setSelectedCondition(""); }} />
            <ResetFilter visible={selectedCategory !== ""} onClick={() => setSelectedCategory("")} />
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
                            <p>% of ICD Category: {row.total > 0 ? Math.round(val / row.total * 100) : 0}%</p>
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
          <div className="py-10 text-center text-[13px]" style={{ color: T.textMuted }}>Select a category to view demographic breakdown</div>
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
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Year-on-year and month-on-month condition consultation patterns</p>
      {/* ── Condition Trends ── */}
      <CVCard
        accentColor="#4f46e5"
        title="Year on Year Trends"
        subtitle="Tracks how prevalence of key conditions changes over time."
        tooltipText="Line chart tracking how the selected condition's consultation volume changes over time. Toggle between yearly and monthly views."
        chartId="trendsOverTime"
        chartData={trendData}
        chartDescription="Condition consultation volume trends over time"
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
        {/* Condition selector dropdown */}
        {conditionBreakdown.length > 0 && (
          <div className="mb-4">
            <select
              value={effectiveCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border text-[13px] font-medium"
              style={{ borderColor: T.border, color: T.textPrimary }}
            >
              {conditionBreakdown.map((c: any) => (
                <option key={c.name} value={c.name}>{displaySub(c.name)}</option>
              ))}
            </select>
            {/* Condition chips */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {conditionBreakdown.map((c: any) => (
                <button
                  key={c.name}
                  onClick={() => setSelectedCondition(c.name)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    (effectiveCondition === c.name) ? "text-white border-transparent" : ""
                  }`}
                  style={{
                    backgroundColor: effectiveCondition === c.name ? "#4f46e5" : "transparent",
                    borderColor: effectiveCondition === c.name ? "#4f46e5" : T.border,
                    color: effectiveCondition === c.name ? "#fff" : T.textSecondary,
                  }}
                >
                  {displaySub(c.name)}
                </button>
              ))}
              <ResetFilter visible={selectedCondition !== ""} onClick={() => setSelectedCondition("")} />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <div style={{ height: 320, minWidth: Math.max(trendData.length * 60, 500) }}>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
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
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-[13px]" style={{ color: T.textMuted }}>
                Select a category and condition to view trends
              </div>
            )}
          </div>
        </div>
        {trendData.length > 0 && (
          <InsightBox text={`Trend data for ${displaySub(effectiveCondition)} shows ${trendView === "yearly" ? "year-over-year" : "month-over-month"} consultation patterns. Monitor these trends to identify rising or declining condition prevalence across the selected time period.`} />
        )}
      </CVCard>
      </WarmSection>}

      {/* ── Co-Occurrence & Vitals Section ── */}
      {isChartVisible("coOccurrenceVitals") && <WarmSection>
        <AccentBar color="#7c3aed" colorEnd="#8b5cf6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Co-Occurrence & Vitals</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Disease co-occurrences and vital sign distribution trends</p>
      {/* ── Disease Combinations (full width) ── */}
      <CVCard
          accentColor="#7c3aed"
          title="Severe Diseases Combination and Gender"
          subtitle="Frequently co-occurring chronic conditions that effect significant portion of population. Useful for bundled care planning & referrals"
          tooltipText="Displays the most common disease co-occurrences among patients. Each bar shows how frequently two conditions appear together."
          chartId="coOccurrence"
          chartData={combos}
          chartDescription="Disease co-occurrence frequency with gender breakdown"
          headerRight={<div className="flex items-center gap-2"><YearSelector years={years} value={selectedYear} onChange={setSelectedYear} /><ResetFilter visible={selectedYear !== 2025} onClick={() => setSelectedYear(2025)} /></div>}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[12px] font-medium px-3 py-1 rounded-full" style={{ backgroundColor: "#4f46e512", color: "#4f46e5", border: "1px solid #4f46e522" }}>Gender Split</span>
            <span className="text-[11px]" style={{ color: T.textMuted }}>— bubble Y-position and colour indicate Male vs Female count for each disease pair</span>
          </div>

          <div className="overflow-x-auto">
            <div style={{ height: 320, minWidth: Math.max(combos.length * 120, 500) }}>
              <ReactECharts
                style={{ height: "100%", width: "100%" }}
                option={{
                  tooltip: {
                    trigger: "item",
                    backgroundColor: "#fff",
                    borderColor: T.border,
                    borderWidth: 1,
                    padding: [10, 14],
                    textStyle: { fontSize: 12, color: T.textPrimary },
                    extraCssText: "border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);",
                    formatter: (p: any) => {
                      const d = p.data;
                      return `<strong>${d[3]}</strong><br/><span style="color:#4f46e5">Total Affected: ${formatNum(d[2])}</span><br/>Breakdown by Gender:<br/>&bull; Male: ${formatNum(d[4])}<br/>&bull; Female: ${formatNum(d[5])}`;
                    },
                  },
                  legend: {
                    data: ["Male", "Female"],
                    top: 0,
                    textStyle: { fontSize: 11, color: T.textSecondary },
                    icon: "circle",
                    itemWidth: 10,
                    itemHeight: 10,
                  },
                  grid: { left: 20, right: 20, top: 40, bottom: 40 },
                  xAxis: {
                    type: "category",
                    data: combos.map((c: any) => {
                      const parts = c.name.split(" + ").map((p: string) => displayCat(p.trim()));
                      const label = parts.join(" + ");
                      return label.length > 35 ? label.substring(0, 32) + "..." : label;
                    }),
                    axisLabel: { fontSize: 9, rotate: 35, color: T.textMuted },
                  },
                  yAxis: { type: "value", axisLabel: { fontSize: 10, color: T.textMuted } },
                  series: [
                    {
                      name: "Male",
                      type: "scatter",
                      data: combos.map((c: any, i: number) => [i, c.male, c.total, c.name, c.male, c.female]),
                      symbolSize: (data: any) => Math.max(Math.sqrt(data[1]) * 2.5, 8),
                      itemStyle: { color: GENDER_COLORS.Male, opacity: 0.85 },
                    },
                    {
                      name: "Female",
                      type: "scatter",
                      data: combos.map((c: any, i: number) => [i, c.female, c.total, c.name, c.male, c.female]),
                      symbolSize: (data: any) => Math.max(Math.sqrt(data[1]) * 2.5, 8),
                      itemStyle: { color: GENDER_COLORS.Female, opacity: 0.85 },
                    },
                  ],
                }}
              />
            </div>
          </div>

          {combos.length > 0 && (
            <InsightBox text={`In ${selectedYear}, ${combos[0]?.name} co-occurrence affected ${formatNum(combos[0]?.total || 0)} employees, with a higher share among ${(combos[0]?.male || 0) > (combos[0]?.female || 0) ? "Male" : "Female"} (${Math.round(Math.max(combos[0]?.male || 0, combos[0]?.female || 0) / (combos[0]?.total || 1) * 100)}%).`} />
          )}
      </CVCard>

      <div className="mt-4" />

      {/* ── Vitals Trend ── */}
      <CVCard
          accentColor="#0d9488"
          title="Vitals Trend and Distribution"
          tooltipText="% of patients per vital sign falling below, within, or above normal ranges"
          subtitle="Updates for selected ICD diagnosis/cohort."
          chartId="vitalsTrend"
          chartData={vitalsData}
          chartDescription="Vital sign distribution showing below/within/above normal ranges over time"

          headerRight={
            <div className="flex items-center gap-2">
              <select value={vitalType} onChange={(e) => setVitalType(e.target.value as any)}
                className="h-8 px-3 rounded-lg border text-[13px] font-medium" style={{ borderColor: T.border, color: T.textPrimary }}>
                <option value="BMI">BMI</option>
                <option value="Systolic BP">Systolic BP</option>
                <option value="Diastolic BP">Diastolic BP</option>
                <option value="SpO2">SpO2</option>
              </select>
              <ResetFilter visible={vitalType !== "BMI"} onClick={() => setVitalType("BMI")} />
            </div>
          }
        >
          <div className="overflow-x-auto">
            <div style={{ height: 340, minWidth: Math.max(vitalsData.length * 60, 500) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vitalsData} margin={{ top: 10, right: 40, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: T.textMuted }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.textMuted }} label={{ value: "% of Users", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: T.textMuted }, offset: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: T.textMuted }} label={{ value: vitalType === "BMI" ? "kg/m²" : vitalType === "SpO2" ? "%" : "mmHg", angle: 90, position: "insideRight", style: { fontSize: 11, fill: T.textMuted }, offset: 10 }} />
                  <RechartsTooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const dd = payload[0]?.payload;
                    return (
                      <div className="rounded-xl border p-3 text-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                        <p className="font-bold mb-1" style={{ color: T.textPrimary }}>{label}</p>
                        <p style={{ color: "#f59e0b" }}>Below Normal: {dd?.belowNormal}%</p>
                        <p style={{ color: "#0d9488" }}>Within Normal: {dd?.withinNormal}%</p>
                        <p style={{ color: "#ef4444" }}>Above Normal: {dd?.aboveNormal}%</p>
                        <p style={{ color: "#d97706" }}>Average: {dd?.average}</p>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" iconSize={8} />
                  <Bar yAxisId="left" dataKey="belowNormal" name="Below Normal" stackId="a" fill="#f59e0b" maxBarSize={60} />
                  <Bar yAxisId="left" dataKey="withinNormal" name="Within Normal" stackId="a" fill="#0d9488" maxBarSize={60} />
                  <Bar yAxisId="left" dataKey="aboveNormal" name="Above Normal" stackId="a" fill="#ef4444" maxBarSize={60} />
                  <Line yAxisId="right" type="monotone" dataKey="average" name={`Average ${vitalType}`} stroke="#d97706" strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: "#d97706", strokeWidth: 2 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="text-[11px] mt-2" style={{ color: T.textMuted }}>
            {vitalType === "BMI"
              ? "Data shown for users with recorded BMI values. Normal range: 18.5–24.9 kg/m²."
              : vitalType === "Systolic BP"
              ? "Data shown for users with recorded systolic BP values. Normal range: 90–120 mmHg."
              : vitalType === "Diastolic BP"
              ? "Data shown for users with recorded diastolic BP values. Normal range: 60–80 mmHg."
              : "Data shown for users with recorded SpO2 values. Normal range: 95–100%."}
          </p>
          {vitalsData.length > 0 && (
            <InsightBox text={`The ${vitalType} trend shows population-level vital sign distribution over time. Review the proportion of employees falling outside normal ranges to identify emerging health risks and guide wellness interventions.`} />
          )}
      </CVCard>
      </WarmSection>}

      {/* ── Seasonal Patterns Section ── */}
      {isChartVisible("seasonalPatterns") && <WarmSection>
        <AccentBar color="#0d9488" colorEnd="#14b8a6" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Seasonal Patterns</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Monthly diagnosis trends and seasonal condition cycles</p>
      {/* ── Seasonal Condition Patterns (calendar grid) ── */}
      {(() => {
        // Build per-month data for selected year from seasonalTrends
        const monthData: { month: number; conditions: { name: string; count: number; color: string }[]; total: number }[] = [];
        const monthTotals: Record<number, Record<string, number>> = {};
        for (const rawName of seasonalConditions) {
          const shortName = displaySub(rawName);
          for (const pt of (seasonalTrends[rawName] || [])) {
            const [yr, mo] = pt.period.split("-").map(Number);
            if (yr !== selectedYear) continue;
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
            title="Seasonal Condition Patterns"
            subtitle="Monthly diagnosis trends for key seasonal conditions. Click any month to filter demographics and related panels."
            tooltipText="12-month calendar grid showing the top seasonal conditions per month with season-colored backgrounds. Helps identify cyclical disease patterns."
            chartId="seasonalPatterns"
            chartData={monthData}
            chartDescription="Monthly diagnosis trends for key seasonal conditions"
            headerRight={<div className="flex items-center gap-2"><YearSelector years={years} value={selectedYear} onChange={setSelectedYear} /><ResetFilter visible={selectedYear !== 2025} onClick={() => setSelectedYear(2025)} /></div>}
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
                The calendar visualization shows {MONTH_NAMES[(peakMonth?.month || 1) - 1]} had the highest concentration of cases in {selectedYear}, with {peakName}{secondName ? ` and ${secondName}` : ""} showing strong seasonal patterns.
              </p>
            </div>
          </CVCard>
        );
      })()}

      </WarmSection>}

      {/* ── Symptom Mapping Section ── */}
      {isChartVisible("symptomMapping") && <WarmSection>
        <AccentBar color="#4f46e5" colorEnd="#7c3aed" />
        <h2 className="text-[20px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] mb-0.5" style={{ color: T.textPrimary }}>Symptom Mapping</h2>
        <p className="text-[13px] mb-5" style={{ color: T.textSecondary }}>Symptom to diagnosis associations across all patient encounters</p>
      {/* ── Symptom → Diagnosis Mapping ── */}
      <CVCard
        accentColor="#4f46e5"
        title="Symptom vs Diagnosis Mapping"
        subtitle="Distribution of Diagnosis for the most common presented symptoms"
        tooltipText="Maps the most frequently reported symptoms and their association with diagnosed conditions."
        chartId="symptomMapping"
        chartData={symptomData}
        chartDescription="Distribution of diagnoses for the most common presented symptoms"
        headerRight={<div className="flex items-center gap-2"><YearSelector years={years} value={selectedYear} onChange={setSelectedYear} /><ResetFilter visible={selectedYear !== 2025} onClick={() => setSelectedYear(2025)} /></div>}
      >
        <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
          <div style={{ height: Math.max(symptomData.length * 55, 280), minWidth: 600 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={symptomData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 80, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: T.textMuted }} domain={[0, 100]} />
                <YAxis type="category" dataKey="symptom" tick={{ fontSize: 12, fill: T.textPrimary, fontWeight: 500 }} width={80} />
                <RechartsTooltip content={({ active, payload, label }: any) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-xl border p-3 text-xs max-w-xs" style={{ backgroundColor: "#fff", borderColor: T.border, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
                      <p className="font-bold mb-1.5" style={{ color: T.textPrimary }}>{label}</p>
                      {payload.filter((p: any) => p.value > 0).map((p: any, i: number) => (
                        <p key={p.name || i} style={{ color: p.fill }}>
                          {p.name}: <strong>{p.value}%</strong>
                        </p>
                      ))}
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconType="square" iconSize={8} />
                {/* Generate bars for all unique diagnoses across all symptoms */}
                {(() => {
                  const allDiagnoses = new Set<string>();
                  symptomData.forEach((s: any) => {
                    s.diagnoses?.forEach((d: any) => allDiagnoses.add(d.name));
                  });
                  return Array.from(allDiagnoses).map((diagName, i) => (
                    <Bar
                      key={diagName}
                      dataKey={(entry: any) => {
                        const match = entry.diagnoses?.find((d: any) => d.name === diagName);
                        return match?.value || 0;
                      }}
                      name={diagName}
                      stackId="a"
                      fill={SYMPTOM_COLORS[i % SYMPTOM_COLORS.length]}
                      maxBarSize={30}
                    />
                  ));
                })()}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="text-[11px] mt-2 text-center" style={{ color: T.textMuted }}>
          Data shows the breakdown of diagnoses for each common symptom across all patient encounters in {selectedYear}.
        </p>
      </CVCard>
      </WarmSection>}
    </div>
  );
}
