"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import { usePageAccess } from "@/lib/hooks/usePageAccess";
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
  Users,
  Smartphone,
  LogIn,
  Activity,
  TrendingUp,
  TrendingDown,
  Bell,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PageDownload from "@/components/shared/PageDownload";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { T } from "@/lib/ui/theme";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { ResetFilter } from "@/components/ui/reset-filter";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import { useConfig } from "@/lib/contexts/config-context";
import { RotateCcw } from "lucide-react";
import type { PageConfig } from "@/lib/types/dashboard-config";

const DONUT_COLORS = ["#4f46e5", "#0d9488", "#818cf8"];
const COHORT_COLORS = ["#4f46e5", "#0d9488", "#818cf8", "#a78bfa", "#6366f1", "#14b8a6", "#c4b5fd"];

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  if (n >= 100000) return `${(n / 1000).toFixed(0)}K`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(n);
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
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {headerRight}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
                  {chartId && <ChartComments chartId={chartId} pageSlug="/portal/engagement" />}
                  {expandable && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: T.textMuted }} onClick={() => setExpanded(!expanded)}>
                      {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </Button>
                  )}
                </div>
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
          style={{ backgroundColor: "#4f46e5" + "12", color: "#4f46e5", border: `1px solid ${"#4f46e5"}22` }}
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
function InsightBox({ text }: { text: string; color?: string }) {
  return (
    <div className="rounded-[14px] px-4 py-3 mt-4 text-[12px] leading-relaxed" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>
      {text}
    </div>
  );
}

// ─── KPI Stat Card ───
function KPIStatCard({ icon, label, value, subValue, trend, color }: {
  icon: React.ReactNode; label: string; value: string; subValue?: string;
  trend?: { value: number; label: string }; color: string;
}) {
  const isPositive = trend && trend.value >= 0;
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <div className="flex items-center justify-between">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "15" }}>
          <div style={{ color }}>{icon}</div>
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-[12px] font-semibold ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
            {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {isPositive ? "+" : ""}{trend.value}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[12px] font-medium" style={{ color: T.textSecondary }}>{label}</p>
        <p className="text-[24px] font-extrabold font-[var(--font-inter)] leading-tight" style={{ color: T.textPrimary }}>{value}</p>
        {subValue && <p className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>{subValue}</p>}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───
export default function EngagementPage() {
  usePageAccess("/portal/engagement");
  const { user, activeClientId } = useAuth();
  const { isChartVisible: globalVisible } = useConfig();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [cohortTab, setCohortTab] = useState<"department" | "age" | "location">("department");
  const [trendMetric, setTrendMetric] = useState<"activeUsers" | "stepsAvg" | "challengeUsers" | "webinarUsers">("activeUsers");
  const [pageFilters, setPageFilters] = useState({
    departments: [] as string[], locations: [] as string[], ageGroups: [] as string[],
  });

  // "applied" state — what's actually sent to the API (only updates on Apply click)
  const [appliedFilters, setAppliedFilters] = useState({
    departments: [] as string[], locations: [] as string[], ageGroups: [] as string[],
  });

  const [previewConfig, setPreviewConfig] = useState<PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = (chartId: string) => {
    if (isPreview && previewConfig?.charts) {
      const cc = previewConfig.charts[chartId];
      return cc ? cc.visible !== false : true;
    }
    return globalVisible("/portal/engagement", chartId);
  };
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const DEPARTMENTS = ["Engineering", "Sales", "Operations", "HR", "Finance", "Marketing", "Support"];

  const apiUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (appliedFilters.departments.length) p.set("departments", appliedFilters.departments.join(","));
    if (appliedFilters.locations.length) p.set("locations", appliedFilters.locations.join(","));
    if (appliedFilters.ageGroups.length) p.set("ageGroups", appliedFilters.ageGroups.join(","));
    return `/api/engagement?${p.toString()}`;
  }, [appliedFilters]);

  const { data: raw, isLoading, mutate } = useSWR(apiUrl, (url: string) => fetch(url).then((r) => r.json()), {
    revalidateOnFocus: false, dedupingInterval: 30000, keepPreviousData: true,
  });
  const d = raw as any;

  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => {
    const empty = { departments: [] as string[], locations: [] as string[], ageGroups: [] as string[] };
    setAppliedFilters(empty);
    setPageFilters(empty);
  };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  const handleApply = () => {
    setAppliedFilters({ ...pageFilters });
  };

  // Data extraction
  const kpis = d?.kpis || {};
  const funnel = d?.adoptionFunnel || [];
  const platformUsage = d?.platformUsage || [];
  const stepsData = d?.stepsEngagement || {};
  const challengeData = d?.challengeEngagement || {};
  const webinarData = d?.webinarEngagement || {};
  const engagementTrends = d?.engagementTrends || [];
  const cohortData = d?.cohortAnalysis || {};

  const cohortItems = cohortTab === "department"
    ? (cohortData.byDepartment || [])
    : cohortTab === "age"
    ? (cohortData.byAgeGroup || [])
    : (cohortData.byLocation || []);

  // Skeleton
  if (isLoading && !d) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-5 gap-4">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="grid grid-cols-2 gap-4">{[1, 2, 3, 4].map((i) => <div key={i} className="h-[380px] bg-white rounded-2xl border animate-pulse" />)}</div>
      </div>
    );
  }

  const platformTotal = platformUsage.reduce((s: number, p: any) => s + p.value, 0);

  return (
    <div className="animate-fade-in animate-stagger space-y-6">
      {/* ── Filters ── */}
      <div
        className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl"
        style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
      >
        <FilterMultiSelect label="Department" options={DEPARTMENTS} selected={pageFilters.departments} onChange={(v) => setPageFilters((p) => ({ ...p, departments: v }))} />
        <FilterMultiSelect label="Location" options={filterOptions.locations} selected={pageFilters.locations} onChange={(v) => setPageFilters((p) => ({ ...p, locations: v }))} />
        <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pageFilters.ageGroups} onChange={(v) => setPageFilters((p) => ({ ...p, ageGroups: v }))} />
        <div className="flex-1" />
        <PageDownload pageTitle="Employee Engagement" />
        <button className="relative h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-[#F5F6FA] transition-colors" style={{ borderColor: T.border, color: T.textMuted }}>
          <Bell size={15} />
          <span className="absolute -right-1 -top-1 flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[#DC2626] text-[8px] font-bold text-white">3</span>
        </button>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={async () => { setIsRefreshing(true); await mutate(); setIsRefreshing(false); }}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              <RotateCcw className={`size-4 text-gray-600 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
        {isSuperAdmin && (
          <ConfigurePanel
            pageSlug="/portal/engagement"
            pageTitle="Employee Engagement"
            charts={[
              { id: "engagementKpis", label: "KPI Summary Cards" },
              { id: "adoptionFunnel", label: "Adoption Funnel" },
              { id: "platformUsage", label: "Platform Usage" },
              { id: "stepsActivity", label: "Activity Engagement - Steps" },
              { id: "challengeEngagement", label: "Challenge Engagement" },
              { id: "webinarEngagement", label: "Webinar Engagement" },
              { id: "engagementTrends", label: "Engagement Trends" },
              { id: "cohortAnalysis", label: "Engagement Cohort Analysis" },
            ]}
            onPreview={setPreviewConfig}
            isPreview={isPreview}
          />
        )}
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

      {isPreview && (
        <div className="px-4 py-2 rounded-xl text-sm font-medium text-center mb-4" style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          Preview Mode — changes not saved yet
        </div>
      )}

      <PageGlanceBox
        pageTitle="Habit App Engagement"
        pageSubtitle="App adoption, activity tracking, challenges, webinars and cohort engagement metrics"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.totalEmployeesWithAccess || 0)} employees have app access with ${formatNum(kpis?.registeredUsers || 0)} registered users. Step tracking shows ${formatNum(kpis?.avgDailySteps || 0)} average daily steps across active users. ${kpis?.totalChallenges || 0} challenges and ${kpis?.totalWebinars || 0} webinars have been conducted.`}
        fallbackChips={[
          { label: "Total Access", value: formatNum(kpis?.totalEmployeesWithAccess || 0) },
          { label: "Registered", value: formatNum(kpis?.registeredUsers || 0) },
          { label: "Avg Steps", value: formatNum(kpis?.avgDailySteps || 0) },
          { label: "Challenges", value: String(kpis?.totalChallenges || 0) },
        ]}
      />

      {/* ══════════ SECTION 1: KPI Summary Cards ══════════ */}
      {isChartVisible("engagementKpis") && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPIStatCard
          icon={<Users size={20} />}
          label="Total Employees with Access"
          value={formatNum(kpis.totalEmployeesWithAccess || 0)}
          color={"#4f46e5"}
        />
        <KPIStatCard
          icon={<Smartphone size={20} />}
          label="App Installed"
          value={formatNum(kpis.appInstalled || 0)}
          subValue={`${kpis.installRate || 0}% install rate`}
          trend={{ value: 0, label: "vs last quarter" }}
          color={"#6366f1"}
        />
        <KPIStatCard
          icon={<LogIn size={20} />}
          label="Logged In"
          value={formatNum(kpis.loggedIn || 0)}
          subValue={`${kpis.loginRate || 0}% login rate`}
          trend={{ value: 0, label: "vs last quarter" }}
          color={T.amber}
        />
        <KPIStatCard
          icon={<Activity size={20} />}
          label="Active Users (Monthly)"
          value={formatNum(kpis.activeUsers || 0)}
          subValue={`${kpis.activeRate || 0}% of logged-in`}
          trend={{ value: 0, label: "vs last quarter" }}
          color={T.teal}
        />
        <KPIStatCard
          icon={<TrendingUp size={20} />}
          label="Avg Daily Active Users"
          value={formatNum(kpis.avgDailyActiveUsers || 0)}
          color={T.coral}
        />
      </div>}

      {/* ══════════ SECTION 2: Adoption Funnel + Platform Usage ══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Adoption Funnel - 2/3 width */}
        {isChartVisible("adoptionFunnel") && <div className="lg:col-span-2">
          <CVCard
            accentColor={"#4f46e5"}
            title="Adoption Funnel"
            subtitle="Employee journey from eligibility to active engagement"
            tooltipText="Horizontal funnel showing the drop-off at each stage from eligible employees to active engagement. Conversion percentages between stages help identify where users disengage."
            chartId="adoptionFunnel"
            chartData={funnel}
            chartTitle="Adoption Funnel"
            chartDescription="Employee journey from eligibility to active engagement"
          >
            <div className="flex flex-col gap-1.5 mt-2">
              {funnel.map((item: any, i: number) => {
                const maxVal = funnel[0]?.value || 1;
                const widthPct = Math.max((item.value / maxVal) * 100, 8);
                const convRate = i > 0 ? ((item.value / funnel[i - 1].value) * 100).toFixed(1) : null;
                const colors = ["#4f46e5", "#6366f1", "#0d9488", "#818cf8", "#a78bfa", "#14b8a6"];
                return (
                  <div key={item.stage}>
                    <div className="flex items-center gap-3">
                      <div className="w-[180px] text-right text-[12px] font-medium shrink-0" style={{ color: T.textSecondary }}>
                        {item.stage}
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                        <div
                          className="h-9 rounded-lg flex items-center px-3 text-white text-[12px] font-bold transition-all"
                          style={{ width: `${widthPct}%`, backgroundColor: colors[i % colors.length], minWidth: 60 }}
                        >
                          {formatNum(item.value)}
                        </div>
                        {convRate && (
                          <span className="text-[11px] font-medium shrink-0" style={{ color: T.textMuted }}>
                            {convRate}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <InsightBox
              text={`Installation rate is ${kpis.installRate || 0}% but only ${kpis.activeRate || 0}% of logged-in users are active monthly. Focus on re-engagement campaigns for inactive users.`}
            />
          </CVCard>
        </div>}

        {/* Platform Usage - 1/3 width */}
        {isChartVisible("platformUsage") && <CVCard
          accentColor={"#6366f1"}
          title="Platform Usage"
          subtitle="How users access the Habit app"
          tooltipText="Donut chart showing the distribution of users by platform: Mobile only, Web only, or Both. Helps understand user preferences for app access channels."
          chartId="platformUsage"
          chartData={platformUsage}
          chartTitle="Platform Usage"
          chartDescription="How users access the Habit app"
        >
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platformUsage}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  paddingAngle={3}
                  stroke="none"
                >
                  {platformUsage.map((_: any, i: number) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  contentStyle={{ borderRadius: "12px", border: `1px solid ${T.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                  formatter={(value: any, name: any) => [`${formatNum(Number(value))} (${platformTotal > 0 ? ((Number(value) / platformTotal) * 100).toFixed(1) : 0}%)`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            {platformUsage.map((p: any, i: number) => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[i] }} />
                  <span className="text-[12px]" style={{ color: T.textSecondary }}>{p.name}</span>
                </div>
                <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                  {formatNum(p.value)} ({platformTotal > 0 ? ((p.value / platformTotal) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </CVCard>}
      </div>

      {/* ══════════ SECTION 3: Activity - Steps ══════════ */}
      {isChartVisible("stepsActivity") && <CVCard
        accentColor={T.teal}
        title="Activity Engagement - Steps"
        subtitle="Daily step count trends and threshold achievement rates"
        tooltipText="Bar chart showing monthly average steps with line overlays for the percentage of users crossing 5K and 10K step thresholds. Quick stats above show current threshold achievement rates."
        chartId="stepsActivity"
        chartData={stepsData}
        chartTitle="Activity Engagement - Steps"
        chartDescription="Daily step count trends and threshold achievement rates"
        headerRight={
          <div className="flex items-center gap-3 text-[12px]" style={{ color: T.textSecondary }}>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: T.teal }} />Avg Steps
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: T.amber }} />Above 5K %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: T.coral }} />Above 10K %
            </span>
          </div>
        }
      >
        {/* Quick stats row */}
        <div className="grid grid-cols-4 gap-4 mb-4 mt-2">
          <div className="rounded-xl p-3" style={{ backgroundColor: T.teal + "10" }}>
            <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Avg Steps/Day</p>
            <p className="text-[20px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{formatNum(stepsData.avgStepsPerDay || 0)}</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: T.teal + "10" }}>
            <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Above 5,000 Steps</p>
            <p className="text-[20px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{stepsData.crossingThresholds?.above5000 || 0}%</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: T.amber + "10" }}>
            <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Above 7,500 Steps</p>
            <p className="text-[20px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{stepsData.crossingThresholds?.above7500 || 0}%</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: T.coral + "10" }}>
            <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Above 10,000 Steps</p>
            <p className="text-[20px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{stepsData.crossingThresholds?.above10000 || 0}%</p>
          </div>
        </div>
        <div className="overflow-x-auto">
        <div style={{ height: 300, minWidth: Math.max(500, (stepsData.monthly?.length || 12) * 50) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stepsData.monthly || []} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
              <RechartsTooltip contentStyle={{ borderRadius: "12px", border: `1px solid ${T.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
              <Bar yAxisId="left" dataKey="avgSteps" fill={T.teal} radius={[4, 4, 0, 0]} name="Avg Steps" barSize={28} />
              <Line yAxisId="right" type="monotone" dataKey="pctAbove5K" stroke={T.amber} strokeWidth={2} dot={{ r: 3 }} name="Above 5K %" />
              <Line yAxisId="right" type="monotone" dataKey="pctAbove10K" stroke={T.coral} strokeWidth={2} dot={{ r: 3 }} name="Above 10K %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </div>
        <InsightBox text="Steps engagement peaks in June and September, driven by seasonal wellness challenges. 24.8% of users consistently exceed 10,000 steps daily." />
      </CVCard>}

      {/* ══════════ SECTION 4 & 5: Challenge + Webinar (side by side) ══════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Challenge Engagement */}
        {isChartVisible("challengeEngagement") && <CVCard
          accentColor={T.amber}
          title="Challenge Engagement"
          subtitle="Wellness challenge participation and completion trends"
          tooltipText="Bar chart showing monthly challenge participants with a line overlay for completion rate. Quick stats above summarize total challenges, participation rate, and completion rate."
          chartId="challengeEngagement"
          chartData={challengeData}
          chartTitle="Challenge Engagement"
          chartDescription="Wellness challenge participation and completion trends"

        >
          <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
            <div className="rounded-xl p-3" style={{ backgroundColor: T.amber + "10" }}>
              <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Total Challenges</p>
              <p className="text-[18px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{challengeData.totalChallenges || 0}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: T.amber + "10" }}>
              <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Participation Rate</p>
              <p className="text-[18px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{challengeData.avgParticipationRate || 0}%</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: T.green + "10" }}>
              <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Completion Rate</p>
              <p className="text-[18px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{challengeData.completionRate || 0}%</p>
            </div>
          </div>
          <div className="overflow-x-auto">
          <div style={{ height: 260, minWidth: Math.max(400, (challengeData.monthly?.length || 12) * 45) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={challengeData.monthly || []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                <RechartsTooltip contentStyle={{ borderRadius: "12px", border: `1px solid ${T.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Bar yAxisId="left" dataKey="participants" fill={T.amber} radius={[4, 4, 0, 0]} name="Participants" barSize={24} />
                <Line yAxisId="right" type="monotone" dataKey="completionRate" stroke={T.green} strokeWidth={2} dot={{ r: 3 }} name="Completion %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </div>
          <InsightBox text="Challenge participation grew 79% YoY. Completion rates improved from 62% to 72%, indicating stronger engagement quality." color={T.amber} />
        </CVCard>}

        {/* Webinar Engagement */}
        {isChartVisible("webinarEngagement") && <CVCard
          accentColor={"#4f46e5"}
          title="Webinar Engagement"
          subtitle="Health webinar attendance and satisfaction trends"
          tooltipText="Bar chart showing monthly webinar attendees with a line overlay for average rating. Quick stats above summarize total webinars, attendance rate, and average satisfaction rating."
          chartId="webinarEngagement"
          chartData={webinarData}
          chartTitle="Webinar Engagement"
          chartDescription="Health webinar attendance and satisfaction trends"

        >
          <div className="grid grid-cols-3 gap-3 mb-4 mt-2">
            <div className="rounded-xl p-3" style={{ backgroundColor: "#4f46e5" + "10" }}>
              <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Total Webinars</p>
              <p className="text-[18px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{webinarData.totalWebinars || 0}</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: "#4f46e5" + "10" }}>
              <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Attendance Rate</p>
              <p className="text-[18px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{webinarData.avgAttendanceRate || 0}%</p>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: T.green + "10" }}>
              <p className="text-[11px] font-medium" style={{ color: T.textMuted }}>Avg Rating</p>
              <p className="text-[18px] font-extrabold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{webinarData.avgRating || 4.3}/5</p>
            </div>
          </div>
          <div className="overflow-x-auto">
          <div style={{ height: 260, minWidth: Math.max(400, (webinarData.monthly?.length || 12) * 45) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={webinarData.monthly || []} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} domain={[3.5, 5]} />
                <RechartsTooltip contentStyle={{ borderRadius: "12px", border: `1px solid ${T.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                <Bar yAxisId="left" dataKey="attendees" fill={"#4f46e5"} radius={[4, 4, 0, 0]} name="Attendees" barSize={24} />
                <Line yAxisId="right" type="monotone" dataKey="avgRating" stroke={T.amber} strokeWidth={2} dot={{ r: 3 }} name="Avg Rating" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          </div>
          <InsightBox text="Webinar attendance grew 69% YoY with consistently high ratings (4.3+). September and December sessions saw peak engagement." color={"#4f46e5"} />
        </CVCard>}
      </div>

      {/* ══════════ SECTION 6: Engagement Trends ══════════ */}
      {isChartVisible("engagementTrends") && <CVCard
        accentColor={T.coral}
        title="Engagement Trends"
        subtitle="Multi-metric engagement tracking over time"
        tooltipText="Line chart showing a single engagement metric over time. Use the toggle buttons to switch between Active Users, Avg Steps, Challenges, and Webinars. Identify seasonal patterns and growth trends."
        chartId="engagementTrends"
        chartData={engagementTrends}
        chartTitle="Engagement Trends"
        chartDescription="Multi-metric engagement tracking over time"
        headerRight={
          <div className="flex items-center gap-1">
            {[
              { key: "activeUsers", label: "Active Users", color: "#4f46e5" },
              { key: "stepsAvg", label: "Avg Steps", color: T.teal },
              { key: "challengeUsers", label: "Challenges", color: T.amber },
              { key: "webinarUsers", label: "Webinars", color: "#4f46e5" },
            ].map((m) => (
              <button
                key={m.key}
                onClick={() => setTrendMetric(m.key as any)}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  backgroundColor: trendMetric === m.key ? m.color : T.white,
                  color: trendMetric === m.key ? "#fff" : T.textSecondary,
                  border: `1px solid ${trendMetric === m.key ? m.color : T.border}`,
                }}
              >
                {m.label}
              </button>
            ))}
            <ResetFilter visible={trendMetric !== "activeUsers"} onClick={() => setTrendMetric("activeUsers")} />
          </div>
        }
      >
        <div className="overflow-x-auto mt-2">
        <div style={{ height: 320, minWidth: Math.max(500, (engagementTrends?.length || 12) * 50) }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={engagementTrends} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderLight} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: T.textMuted }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={{ borderRadius: "12px", border: `1px solid ${T.border}`, fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
              {trendMetric === "activeUsers" && (
                <Line type="monotone" dataKey="activeUsers" stroke={"#4f46e5"} strokeWidth={2.5} dot={{ r: 4, fill: "#4f46e5" }} name="Active Users" />
              )}
              {trendMetric === "stepsAvg" && (
                <Line type="monotone" dataKey="stepsAvg" stroke={T.teal} strokeWidth={2.5} dot={{ r: 4, fill: T.teal }} name="Avg Steps" />
              )}
              {trendMetric === "challengeUsers" && (
                <Line type="monotone" dataKey="challengeUsers" stroke={T.amber} strokeWidth={2.5} dot={{ r: 4, fill: T.amber }} name="Challenge Users" />
              )}
              {trendMetric === "webinarUsers" && (
                <Line type="monotone" dataKey="webinarUsers" stroke={"#4f46e5"} strokeWidth={2.5} dot={{ r: 4, fill: "#4f46e5" }} name="Webinar Attendees" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        </div>
        <InsightBox text="All engagement metrics show a consistent upward trend with seasonal peaks in Sep and Dec. Active users grew 31% YoY while challenge participation grew 79%." color={T.coral} />
      </CVCard>}

      {/* ══════════ SECTION 7: Cohort Analysis ══════════ */}
      {isChartVisible("cohortAnalysis") && <CVCard
        accentColor={"#6366f1"}
        title="Engagement Cohort Analysis"
        subtitle="Compare engagement metrics across departments, age groups and locations"
        tooltipText="Table comparing key engagement metrics (active users, avg steps, challenge rate, webinar rate) across cohorts. Toggle between Department, Age Group, and Location views. Progress bars visualize participation rates."
        chartId="cohortAnalysis"
        chartData={cohortItems}
        chartTitle="Engagement Cohort Analysis"
        chartDescription="Compare engagement metrics across departments, age groups and locations"
        headerRight={
          <div className="flex items-center gap-1">
            {[
              { key: "department", label: "Department" },
              { key: "age", label: "Age Group" },
              { key: "location", label: "Location" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setCohortTab(t.key as any)}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all"
                style={{
                  backgroundColor: cohortTab === t.key ? T.textPrimary : T.white,
                  color: cohortTab === t.key ? "#fff" : T.textSecondary,
                  border: `1px solid ${cohortTab === t.key ? T.textPrimary : T.border}`,
                }}
              >
                {t.label}
              </button>
            ))}
            <ResetFilter visible={cohortTab !== "department"} onClick={() => setCohortTab("department")} />
          </div>
        }
      >
        <div className="overflow-x-auto overflow-y-auto max-h-[400px] mt-2">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th className="text-left py-3 px-3 font-bold" style={{ color: T.textPrimary }}>
                  {cohortTab === "department" ? "Department" : cohortTab === "age" ? "Age Group" : "Location"}
                </th>
                <th className="text-right py-3 px-3 font-bold" style={{ color: T.textPrimary }}>Active Users</th>
                <th className="text-right py-3 px-3 font-bold" style={{ color: T.textPrimary }}>Avg Steps</th>
                <th className="text-left py-3 px-3 font-bold" style={{ color: T.textPrimary }}>Challenge Rate</th>
                <th className="text-left py-3 px-3 font-bold" style={{ color: T.textPrimary }}>Webinar Rate</th>
              </tr>
            </thead>
            <tbody>
              {cohortItems.map((item: any, i: number) => {
                return (
                  <tr key={item.name} style={{ borderBottom: `1px solid ${T.borderLight}` }} className="hover:bg-gray-50/50">
                    <td className="py-3 px-3 font-semibold" style={{ color: T.textPrimary }}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COHORT_COLORS[i % COHORT_COLORS.length] }} />
                        {item.name}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-medium" style={{ color: T.textPrimary }}>{formatNum(item.activeUsers)}</td>
                    <td className="py-3 px-3 text-right font-medium" style={{ color: T.textPrimary }}>{formatNum(item.avgSteps)}</td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-gray-100 max-w-[120px]">
                          <div className="h-2 rounded-full" style={{ width: `${item.challengeRate}%`, backgroundColor: T.amber }} />
                        </div>
                        <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>{item.challengeRate}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-gray-100 max-w-[120px]">
                          <div className="h-2 rounded-full" style={{ width: `${item.webinarRate * 3}%`, backgroundColor: "#4f46e5" }} />
                        </div>
                        <span className="text-[11px] font-medium" style={{ color: T.textSecondary }}>{item.webinarRate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <InsightBox
            text={cohortTab === "department"
              ? "Engineering leads in active users (1,250) and challenge participation (42.5%). HR has the highest webinar attendance rate (28.6%), suggesting department-specific engagement preferences."
              : cohortTab === "age"
              ? "18-25 age group leads step counts (8,500/day) and challenge participation (48.2%). 60+ group has highest webinar attendance (30.2%), indicating preference for knowledge-based engagement."
              : "Bangalore leads overall engagement with 1,250 active users. Hyderabad shows highest webinar rate (23.0%) despite smaller user base."
            }
            color={"#6366f1"}
          />
        </div>
      </CVCard>}
    </div>
  );
}
