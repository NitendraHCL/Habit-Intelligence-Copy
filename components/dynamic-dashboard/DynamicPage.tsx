"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import DashboardSection from "./DashboardSection";
import { CrossFilterProvider, useCrossFilter } from "./CrossFilterManager";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import { useConfig } from "@/lib/contexts/config-context";
import type { PageDefinition, QueryRequest } from "@/lib/dashboard/types";
import type { PageConfig } from "@/lib/types/dashboard-config";
import { useAuth } from "@/lib/contexts/auth-context";
import { PageGlanceBox } from "@/components/dashboard/PageGlanceBox";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RotateCcw } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DynamicPageProps {
  slug: string;
}

export default function DynamicPage({ slug }: DynamicPageProps) {
  const { activeClientId } = useAuth();
  const clientId = activeClientId ?? "";

  // Fetch the dashboard definition
  const { data: dashData, isLoading: loadingDash } = useSWR(
    clientId
      ? `/api/admin/dashboards?clientId=${clientId}&slug=${encodeURIComponent(slug)}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (loadingDash) {
    return <DashboardSkeleton />;
  }

  const dashboard = dashData?.dashboards?.[0];
  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Dashboard not found
      </div>
    );
  }

  const config = dashboard.config as PageDefinition;

  return (
    <CrossFilterProvider>
      <DynamicPageInner config={config} clientId={clientId} />
    </CrossFilterProvider>
  );
}

function DynamicPageInner({
  config,
  clientId,
}: {
  config: PageDefinition;
  clientId: string;
}) {
  const { clearAll } = useCrossFilter();
  const { isChartVisible } = useConfig();
  const { user } = useAuth();
  const [previewConfig, setPreviewConfig] = useState<PageConfig | null>(null);
  const isPreview = previewConfig !== null;
  const isSuperAdmin = user?.role === "SUPER_ADMIN" || user?.role === "INTERNAL_OPS";

  // Build chart list for ConfigurePanel
  const chartDefs = useMemo(() => {
    return Object.values(config.charts).map((c) => ({
      id: c.id,
      label: c.title || c.id,
    }));
  }, [config.charts]);

  // Filter visibility — check config or preview
  const isVisible = useCallback((chartId: string) => {
    if (isPreview && previewConfig?.charts) {
      const chartConf = previewConfig.charts[chartId];
      return chartConf ? chartConf.visible !== false : true;
    }
    return isChartVisible(config.slug, chartId);
  }, [isPreview, previewConfig, isChartVisible, config.slug]);

  // Scan charts for unique data source tables
  const chartTables = useMemo(() => {
    const tables = new Set<string>();
    for (const chart of Object.values(config.charts)) {
      if (chart.dataSource?.table) tables.add(chart.dataSource.table);
      if (chart.dataSource?.joins) {
        for (const join of chart.dataSource.joins) tables.add(join.table);
      }
    }
    return Array.from(tables);
  }, [config.charts]);

  // Fetch filter options from the actual tables the dashboard uses
  const filterFetcher = useCallback(async () => {
    if (chartTables.length === 0) return {};
    const res = await fetch(`/api/data/filter-options?clientId=${clientId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tables: chartTables }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    return data.options ?? {};
  }, [clientId, chartTables]);

  // options is a flat map: { facility_name: [...], stage: [...], speciality_name: [...], ... }
  const { data: filterOptions } = useSWR(
    clientId && chartTables.length > 0 ? `filter-opts-${clientId}-${chartTables.join(",")}` : null,
    filterFetcher,
    { revalidateOnFocus: false, dedupingInterval: 120000 }
  );

  // Filter state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dateFrom, setDateFrom] = useState("2024-01-01");
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [locations, setLocations] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [relationships, setRelationships] = useState<string[]>([]);

  const filters = useMemo<QueryRequest["filters"]>(
    () => ({
      dateFrom,
      dateTo,
      ...(locations.length ? { locations } : {}),
      ...(genders.length ? { genders } : {}),
      ...(ageGroups.length ? { ageGroups } : {}),
      ...(specialties.length ? { specialties } : {}),
      ...(relationships.length ? { relationships } : {}),
    }),
    [dateFrom, dateTo, locations, genders, ageGroups, specialties, relationships]
  );

  const hasActiveFilters =
    locations.length > 0 ||
    genders.length > 0 ||
    ageGroups.length > 0 ||
    specialties.length > 0 ||
    relationships.length > 0;

  return (
    <div className="space-y-6">
      {/* Page Glance Header with AI Summary */}
      <PageGlanceBox
        pageTitle={config.title}
        pageSubtitle={config.subtitle}
        kpis={{}}
        fallbackSummary={config.subtitle || `Dashboard showing ${Object.keys(config.charts).length} charts across ${config.sections.length} sections.`}
        fallbackChips={Object.values(config.charts)
          .filter((c) => c.type === "kpi" || c.type === "stat_card")
          .slice(0, 4)
          .map((c) => ({ label: c.title, value: "..." }))}
      />

      {/* Filter bar + Configure */}
      {(config.filters?.length > 0 || isSuperAdmin) && (
        <div
          className="flex flex-wrap items-center gap-3 px-5 py-3 bg-white rounded-2xl border"
          style={{ borderColor: "#E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        >
          {config.filters.includes("dateRange") && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-3 border border-gray-200 rounded-lg text-[13px]"
              />
              <span className="text-gray-400 text-[13px]">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-3 border border-gray-200 rounded-lg text-[13px]"
              />
            </div>
          )}

          {config.filters.includes("location") && (
            <FilterDropdown
              label="Location"
              options={filterOptions?.facility_name ?? []}
              selected={locations}
              onChange={setLocations}
            />
          )}

          {config.filters.includes("gender") && (
            <FilterDropdown
              label="Gender"
              options={filterOptions?.patient_gender ?? ["Male", "Female", "Others"]}
              selected={genders}
              onChange={setGenders}
            />
          )}

          {config.filters.includes("ageGroup") && (
            <FilterDropdown
              label="Age Group"
              options={["<20", "20-35", "36-40", "41-60", "61+"]}
              selected={ageGroups}
              onChange={setAgeGroups}
            />
          )}

          {config.filters.includes("specialty") && (
            <FilterDropdown
              label="Specialty"
              options={filterOptions?.speciality_name ?? []}
              selected={specialties}
              onChange={setSpecialties}
            />
          )}

          {config.filters.includes("relationship") && (
            <FilterDropdown
              label="Relationship"
              options={filterOptions?.relationship ?? []}
              selected={relationships}
              onChange={setRelationships}
            />
          )}

          {hasActiveFilters && (
            <button
              onClick={() => {
                setLocations([]);
                setGenders([]);
                setAgeGroups([]);
                setSpecialties([]);
                setRelationships([]);
                clearAll();
              }}
              className="px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100"
            >
              Reset Filters
            </button>
          )}

          {/* Spacer + Configure */}
          <div className="flex-1" />

          {/* Refresh button */}
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={async () => {
                    setIsRefreshing(true);
                    setRefreshKey((k) => k + 1);
                    setTimeout(() => {
                      setIsRefreshing(false);
                      setShowRefreshToast(true);
                      setTimeout(() => setShowRefreshToast(false), 3000);
                    }, 500);
                  }}
                  disabled={isRefreshing}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:bg-gray-50 transition-colors"
                  style={{ borderColor: "#E5E7EB", color: "#9CA3AF" }}
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

          {/* Configure panel */}
          {isSuperAdmin && (
            <ConfigurePanel
              pageSlug={config.slug}
              pageTitle={config.title}
              charts={chartDefs}
              filters={config.filters?.filter((f) => f !== "dateRange") ?? []}
              onPreview={setPreviewConfig}
              isPreview={isPreview}
            />
          )}
        </div>
      )}

      {/* Preview banner */}
      {isPreview && (
        <div className="px-4 py-2 rounded-xl text-sm font-medium text-center" style={{ backgroundColor: "#FEF3C7", color: "#92400E", border: "1px solid #FCD34D" }}>
          Preview Mode — changes not saved yet
        </div>
      )}

      {/* Sections */}
      {config.sections.map((section) => (
        <DashboardSection
          key={`${section.id}-${refreshKey}`}
          section={section}
          charts={config.charts}
          clientId={clientId}
          filters={filters}
          isChartVisible={isVisible}
        />
      ))}
    </div>
  );
}

// ── Filter Dropdown ──

function FilterDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 px-3 flex items-center gap-1.5 rounded-lg text-[13px] font-medium border border-gray-200 hover:bg-gray-50 transition-colors"
        style={{ color: selected.length > 0 ? "#4f46e5" : "#4B5563" }}
      >
        {label}
        {selected.length > 0 && (
          <span
            className="h-[18px] min-w-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ backgroundColor: "#4f46e5" }}
          >
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute top-full left-0 mt-1 z-40 w-60 bg-white border rounded-2xl shadow-lg overflow-hidden"
            style={{ borderColor: "#E5E7EB", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
          >
            {/* Header with clear */}
            {selected.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
                <span className="text-[11px] text-gray-400">{selected.length} selected</span>
                <button
                  onClick={() => onChange([])}
                  className="text-[11px] font-medium"
                  style={{ color: "#F06050" }}
                >
                  Clear
                </button>
              </div>
            )}
            <div className="max-h-52 overflow-y-auto p-2">
              {options.length === 0 ? (
                <p className="text-[12px] text-gray-400 px-2 py-3 text-center">
                  Loading...
                </p>
              ) : (
                options.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={() => toggle(opt)}
                      className="rounded border-gray-300 text-indigo-600 h-3.5 w-3.5"
                    />
                    <span className="text-gray-700">{opt}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-gray-200 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-80 bg-gray-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
