"use client";

import useSWR from "swr";
import { useFilters } from "@/lib/filter-context";
import { useAuth } from "@/lib/contexts/auth-context";
import { format } from "date-fns";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

export function useDashboardData<T = Record<string, unknown>>(
  endpoint: string,
  extraParams?: Record<string, string>,
) {
  const { filters } = useFilters();
  const { activeClientId } = useAuth();

  const params = new URLSearchParams();

  // Use extraParams dateFrom/dateTo if provided, else fall back to global context
  if (extraParams?.dateFrom) {
    params.set("dateFrom", extraParams.dateFrom);
  } else {
    params.set("dateFrom", format(filters.dateRange.from, "yyyy-MM-dd"));
  }
  if (extraParams?.dateTo) {
    params.set("dateTo", extraParams.dateTo);
  } else {
    params.set("dateTo", format(filters.dateRange.to, "yyyy-MM-dd"));
  }

  if (filters.locations.length) params.set("locations", filters.locations.join(","));
  if (filters.genders.length) params.set("genders", filters.genders.join(","));
  if (filters.ageGroups.length) params.set("ageGroups", filters.ageGroups.join(","));

  // Use filter context clientId, fall back to sidebar's active client
  const clientId = filters.clientId !== "all" ? filters.clientId : activeClientId;
  if (clientId) params.set("clientId", clientId);

  // Merge extra page-level params (skip dateFrom/dateTo as already handled)
  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value && key !== "dateFrom" && key !== "dateTo") params.set(key, value);
    });
  }

  // Don't fetch until we have a clientId (avoids 400 on initial render)
  const resolvedClientId = filters.clientId !== "all" ? filters.clientId : activeClientId;
  const url = resolvedClientId
    ? `/api/${endpoint}?${params.toString()}`
    : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(url, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000, // 1 min
    keepPreviousData: true,
  });

  return { data, error, isLoading, isValidating, mutate };
}
