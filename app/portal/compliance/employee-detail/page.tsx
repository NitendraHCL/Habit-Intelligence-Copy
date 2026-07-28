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
import { Input } from "@/components/ui/input";
import { ChartComments } from "@/components/ui/chart-comments";
import {
  Info,
  Maximize2,
  Minimize2,
  X,
  ChevronDown,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AskAIButton } from "@/components/ai/AskAIButton";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";

const PAGE_SLUG = "/portal/compliance/employee-detail";

function formatNum(n: number): string {
  if (!n && n !== 0) return "0";
  return n.toLocaleString("en-IN");
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

// ─── Card (table-centric CVCard) ───
type CVTableData = {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, React.ReactNode>[];
};

function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true, chartId, chartData, chartTitle, chartDescription, tableData, dataPoints,
}: {
  children?: React.ReactNode; className?: string; accentColor?: string;
  title?: string; subtitle?: string; tooltipText?: string; expandable?: boolean; chartId?: string;
  chartData?: unknown; chartTitle?: string; chartDescription?: string;
  tableData?: CVTableData | null; dataPoints?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col ${expanded ? "col-span-full" : ""} ${className}`}
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      {(title || accentColor) && (
        <div className="px-6 pt-5 pb-1">
          {accentColor && <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: accentColor }} />}
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
                {chartId && <ChartComments chartId={chartId} pageSlug={PAGE_SLUG} dataPoints={dataPoints} />}
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
        {tableData ? (
          <div className="overflow-auto" style={{ maxHeight: expanded ? undefined : 560 }}>
            <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
              <thead className="sticky top-0 z-10" style={{ backgroundColor: T.white }}>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {tableData.columns.map((c) => (
                    <th key={c.key} className={`py-2 px-3 font-semibold whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`} style={{ color: T.textSecondary, backgroundColor: T.white }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map((row, i) => {
                  const isGroup = !!(row as Record<string, unknown>).__group;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.borderLight}`, backgroundColor: isGroup ? "#F5F6FA" : undefined }}>
                      {tableData.columns.map((c) => (
                        <td key={c.key} className={`py-2 px-3 tabular-nums ${c.align === "right" ? "text-right" : "text-left"} ${isGroup ? "font-bold" : ""}`} style={{ color: isGroup ? T.textPrimary : T.textSecondary }}>{row[c.key]}</td>
                      ))}
                    </tr>
                  );
                })}
                {tableData.rows.length === 0 && (
                  <tr><td colSpan={tableData.columns.length} className="py-6 text-center text-[13px]" style={{ color: T.textMuted }}>No data for the selected filters.</td></tr>
                )}
              </tbody>
            </table>
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
              <div className="px-1.5 py-2 text-[12px]" style={{ color: T.textMuted }}>No options.</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ─── Employee id filter (free-text; each entry adds to employeeIds) ───
function EmployeeIdFilter({ selected, onChange }: {
  selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || selected.includes(v)) { setDraft(""); return; }
    onChange([...selected, v]);
    setDraft("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium transition-colors border hover:border-gray-300"
          style={{ borderColor: T.border, color: selected.length > 0 ? T.textPrimary : T.textSecondary, backgroundColor: T.white }}
        >
          <Search size={13} style={{ color: T.textMuted }} />
          Employee id
          {selected.length > 0 && (
            <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: "#4f46e5" }}>
              {selected.length}
            </span>
          )}
          <ChevronDown size={13} style={{ color: T.textMuted }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>Employee id</span>
          {selected.length > 0 && (
            <button onClick={() => onChange([])} className="text-[10px] font-medium hover:underline" style={{ color: T.coral }}>Clear</button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Type an id, press Enter"
            className="h-8 text-[12px]"
          />
          <Button onClick={add} className="h-8 px-3 text-[12px]" style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff" }}>Add</Button>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {selected.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ backgroundColor: "#4f46e512", color: "#4f46e5", border: "1px solid #4f46e522" }}>
                {id}
                <button onClick={() => onChange(selected.filter((s) => s !== id))} className="hover:opacity-70 rounded-full p-0.5"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}
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

const EMPTY_FILTERS = {
  months: [] as string[],
  sites: [] as string[],
  packageTypes: [] as string[],
  genders: [] as string[],
  bookingStatuses: [] as string[],
  employeeIds: [] as string[],
};

// ─── Main Page ───
export default function EmployeeDetailPage() {
  usePageAccess(PAGE_SLUG);
  const { activeClientId } = useAuth();

  const [pageFilters, setPageFilters] = useState({ ...EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS });

  const [previewConfig, setPreviewConfig] = useState<import("@/lib/types/dashboard-config").PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isChartVisible = useChartVisibility(PAGE_SLUG, previewConfig);

  const url = useMemo(() => {
    if (!activeClientId || activeClientId === "all") return null;
    const p = new URLSearchParams();
    p.set("clientId", activeClientId);
    if (appliedFilters.months.length) p.set("months", appliedFilters.months.join(","));
    if (appliedFilters.sites.length) p.set("sites", appliedFilters.sites.join(","));
    if (appliedFilters.packageTypes.length) p.set("packageTypes", appliedFilters.packageTypes.join(","));
    if (appliedFilters.genders.length) p.set("genders", appliedFilters.genders.join(","));
    if (appliedFilters.bookingStatuses.length) p.set("bookingStatuses", appliedFilters.bookingStatuses.join(","));
    if (appliedFilters.employeeIds.length) p.set("employeeIds", appliedFilters.employeeIds.join(","));
    return `/api/compliance/employee-detail?${p.toString()}`;
  }, [activeClientId, appliedFilters]);

  const { data, isLoading, isValidating, mutate } = useSWR<any>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000,
  });

  const d = data as any;
  const kpis = d?.kpis;
  const charts = d?.charts;

  const filterOptions = {
    months: (d?.filterOptions?.months as string[]) || [],
    sites: (d?.filterOptions?.sites as string[]) || [],
    packageTypes: (d?.filterOptions?.packageTypes as string[]) || ["Base Package", "Vaccination", "Additional Test"],
    genders: (d?.filterOptions?.genders as string[]) || [],
    bookingStatuses: (d?.filterOptions?.bookingStatuses as string[]) || [],
  };

  const handleApply = () => setAppliedFilters({ ...pageFilters });
  const handleRemoveChip = (key: string, value: string) => {
    setAppliedFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
    setPageFilters((p) => ({ ...p, [key]: (p as any)[key].filter((v: string) => v !== value) }));
  };
  const handleClearAll = () => { setAppliedFilters({ ...EMPTY_FILTERS }); setPageFilters({ ...EMPTY_FILTERS }); };
  const hasActiveFilters = Object.values(appliedFilters).some((v) => v.length > 0);

  // ── Employee-level detail table ──
  const detailRows: any[] = charts?.employeeDetail || [];
  const total = Number(charts?.total || 0);
  const returned = Number(charts?.returned || detailRows.length);
  const truncated = !!charts?.truncated;

  const employeeTable: CVTableData = useMemo(() => {
    const rows: Record<string, React.ReactNode>[] = detailRows.map((r) => ({
      name: r.name || "—",
      gender: r.gender || "—",
      packageName: r.packageName || "—",
      count: formatNum(Number(r.count || 0)),
      employeeId: r.employeeId || "—",
      completeHealthcheck: r.completeHealthcheck || "—",
      status: r.status || "—",
    }));
    const countTotal = detailRows.reduce((a, r) => a + Number(r.count || 0), 0);
    rows.push({
      __group: true,
      name: "Total",
      gender: "",
      packageName: "",
      count: formatNum(countTotal),
      employeeId: "",
      completeHealthcheck: "",
      status: "",
    });
    return {
      columns: [
        { key: "name", label: "Name", align: "left" },
        { key: "gender", label: "Gender", align: "left" },
        { key: "packageName", label: "Package Name", align: "left" },
        { key: "count", label: "Count of Employee", align: "right" },
        { key: "employeeId", label: "Employee id", align: "left" },
        { key: "completeHealthcheck", label: "Complete Healthcheck", align: "left" },
        { key: "status", label: "Status", align: "left" },
      ],
      rows,
    };
  }, [detailRows]);

  const tableTooltip = truncated
    ? `Showing the first ${formatNum(returned)} of ${formatNum(total)} matching rows (ordered by Name). Narrow the filters to see the rest.`
    : `Employee-level detail — ${formatNum(total)} matching rows (ordered by Name).`;

  if (!d && isLoading) {
    return (
      <div className="animate-fade-in space-y-5">
        <div className="space-y-2"><div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /><div className="h-4 w-96 bg-gray-100 rounded animate-pulse" /></div>
        <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map((i) => <div key={i} className="h-28 bg-white rounded-2xl border animate-pulse" />)}</div>
        <div className="h-[500px] bg-white rounded-2xl border animate-pulse" />
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
        <EmployeeIdFilter selected={pageFilters.employeeIds} onChange={(v) => setPageFilters((p) => ({ ...p, employeeIds: v }))} />

        <div className="flex-1" />
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => mutate()}
                disabled={isValidating}
                className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
              >
                <RotateCcw className={`size-4 text-gray-600${isValidating ? " animate-spin" : ""}`} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh data</TooltipContent>
          </Tooltip>
        </div>
        <ConfigurePanel
          pageSlug={PAGE_SLUG}
          pageTitle="Employee Detail"
          charts={[
            { id: "rows", label: "Rows KPI" },
            { id: "uniqueEmployees", label: "Unique Employees KPI" },
            { id: "completeHealthchecks", label: "Complete Healthchecks KPI" },
            { id: "employeeDetail", label: "Employee-Level Detail" },
          ]}
          filters={["month", "site", "packageType", "gender", "bookingStatus", "employeeId"]}
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
        pageTitle="Employee Detail"
        pageSubtitle="Employee-level compliance detail for Sodexo — one row per health-check record, with completion status"
        kpis={kpis || {}}
        fallbackSummary={`${formatNum(kpis?.rows || 0)} records across ${formatNum(kpis?.uniqueEmployees || 0)} unique employees. ${formatNum(kpis?.completeHealthchecks || 0)} health-checks are complete.`}
        fallbackChips={[
          { label: "Rows", value: formatNum(kpis?.rows || 0) },
          { label: "Unique Employees", value: formatNum(kpis?.uniqueEmployees || 0) },
          { label: "Complete Healthchecks", value: formatNum(kpis?.completeHealthchecks || 0) },
        ]}
      />

      {/* ── KPI summary strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isChartVisible("rows") && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 py-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Rows</p>
              <p className="text-[30px] font-extrabold mt-2 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#4f46e5" }}>{formatNum(kpis?.rows || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Total health-check records matching the filters</p>
            </div>
          </div>
        )}
        {isChartVisible("uniqueEmployees") && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 py-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Unique Employees</p>
              <p className="text-[30px] font-extrabold mt-2 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: T.teal }}>{formatNum(kpis?.uniqueEmployees || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Distinct employees across those records</p>
            </div>
          </div>
        )}
        {isChartVisible("completeHealthchecks") && (
          <div className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <div className="px-6 py-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>Complete Healthchecks</p>
              <p className="text-[30px] font-extrabold mt-2 leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color: "#0d9488" }}>{formatNum(kpis?.completeHealthchecks || 0)}</p>
              <p className="text-xs mt-2" style={{ color: T.textSecondary }}>Records marked completed</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Employee-Level Detail table (hero) ── */}
      {isChartVisible("employeeDetail") && (
        <CVCard
          accentColor="linear-gradient(90deg, #4f46e5, #6366f1)"
          title="Employee-Level Detail"
          subtitle={truncated ? `Showing first ${formatNum(returned)} of ${formatNum(total)} rows` : `${formatNum(total)} rows`}
          tooltipText={tableTooltip}
          expandable
          chartId="employeeDetail"
          chartData={detailRows}
          chartTitle="Employee-Level Detail"
          chartDescription="Per-employee compliance detail with completion status"
          dataPoints={["Name", "Gender", "Package Name", "Count of Employee", "Employee id", "Complete Healthcheck", "Status"]}
          tableData={employeeTable}
        />
      )}
    </div>
  );
}
