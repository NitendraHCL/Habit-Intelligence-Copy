"use client";

import { useState, useMemo, useCallback } from "react";
import useSWR from "swr";
import DashboardSection from "./DashboardSection";
import { CrossFilterProvider, useCrossFilter } from "./CrossFilterManager";
import type { PageDefinition, QueryRequest } from "@/lib/dashboard/types";
import { useAuth } from "@/lib/contexts/auth-context";

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
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{config.title}</h1>
        {config.subtitle && (
          <p className="text-sm text-gray-500 mt-1">{config.subtitle}</p>
        )}
      </div>

      {/* Filter bar */}
      {config.filters?.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-white rounded-xl border border-gray-200">
          {config.filters.includes("dateRange") && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
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
        </div>
      )}

      {/* Sections */}
      {config.sections.map((section) => (
        <DashboardSection
          key={section.id}
          section={section}
          charts={config.charts}
          clientId={clientId}
          filters={filters}
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
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
          selected.length > 0
            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
            : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {label}
        {selected.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded-full font-medium">
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
          <div className="absolute top-full left-0 mt-1 z-40 w-56 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg p-2">
            {options.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-1">No options</p>
            ) : (
              options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded border-gray-300 text-indigo-600"
                  />
                  {opt}
                </label>
              ))
            )}
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
