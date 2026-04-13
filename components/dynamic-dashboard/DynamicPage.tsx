"use client";

import { useState, useMemo } from "react";
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

  // Filter state
  const [dateFrom, setDateFrom] = useState("2024-01-01");
  const [dateTo, setDateTo] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [locations, setLocations] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);

  const filters = useMemo<QueryRequest["filters"]>(
    () => ({
      dateFrom,
      dateTo,
      ...(locations.length ? { locations } : {}),
      ...(genders.length ? { genders } : {}),
      ...(ageGroups.length ? { ageGroups } : {}),
      ...(specialties.length ? { specialties } : {}),
    }),
    [dateFrom, dateTo, locations, genders, ageGroups, specialties]
  );

  const hasActiveFilters =
    locations.length > 0 ||
    genders.length > 0 ||
    ageGroups.length > 0 ||
    specialties.length > 0;

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

          {hasActiveFilters && (
            <button
              onClick={() => {
                setLocations([]);
                setGenders([]);
                setAgeGroups([]);
                setSpecialties([]);
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
