"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useAuth } from "@/lib/contexts/auth-context";
import type {
  DashboardConfig,
  ChartConfig,
} from "@/lib/types/dashboard-config";

interface ConfigContextValue {
  config: DashboardConfig | null;
  loading: boolean;
  isPageVisible: (slug: string) => boolean;
  isChartVisible: (pageSlug: string, chartId: string) => boolean;
  getChartOrder: (pageSlug: string) => ChartConfig[];
  isFilterVisible: (pageSlug: string, filterName: string) => boolean;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

/** Roles that bypass config restrictions and see everything. */
const INTERNAL_ROLES = new Set(["SUPER_ADMIN", "INTERNAL_OPS", "KAM"]);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { user, activeClientId } = useAuth();
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const isInternalUser = user ? INTERNAL_ROLES.has(user.role) : false;

  // Fetch published config for client users
  useEffect(() => {
    // Internal users see everything — no config needed
    if (!user || isInternalUser) {
      setConfig(null);
      setLoading(false);
      return;
    }

    // Client users need a clientId to fetch config
    const clientId = activeClientId || user.clientId;
    if (!clientId) {
      setConfig(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/admin/config?clientId=${encodeURIComponent(clientId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch config");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setConfig(
            (data.publishedConfig as DashboardConfig) ?? null
          );
        }
      })
      .catch(() => {
        // On error, default to null (everything visible)
        if (!cancelled) setConfig(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, activeClientId, isInternalUser]);

  /**
   * Check if a page is visible.
   * If config is null or the page isn't mentioned, defaults to visible.
   */
  const isPageVisible = useCallback(
    (slug: string): boolean => {
      if (!config) return true;
      const page = config.pages[slug];
      if (!page) return true;
      return page.visible;
    },
    [config]
  );

  /**
   * Check if a chart on a given page is visible.
   * If config is null, the page isn't mentioned, or the chart isn't mentioned, defaults to visible.
   */
  const isChartVisible = useCallback(
    (pageSlug: string, chartId: string): boolean => {
      if (!config) return true;
      const page = config.pages[pageSlug];
      if (!page) return true;
      const chart = page.charts[chartId];
      if (!chart) return true;
      return chart.visible;
    },
    [config]
  );

  /**
   * Get all charts for a page sorted by their configured order.
   * Returns only the chart configs that exist in the config for this page.
   * If config is null or the page isn't mentioned, returns an empty array.
   */
  const getChartOrder = useCallback(
    (pageSlug: string): ChartConfig[] => {
      if (!config) return [];
      const page = config.pages[pageSlug];
      if (!page) return [];
      return Object.values(page.charts).sort((a, b) => a.order - b.order);
    },
    [config]
  );

  /**
   * Check if a filter on a given page is visible.
   * If config is null, the page isn't mentioned, or the filter isn't mentioned, defaults to visible.
   */
  const isFilterVisible = useCallback(
    (pageSlug: string, filterName: string): boolean => {
      if (!config) return true;
      const page = config.pages[pageSlug];
      if (!page) return true;
      const filterValue = page.filters[filterName];
      if (filterValue === undefined) return true;
      return filterValue;
    },
    [config]
  );

  const value = useMemo<ConfigContextValue>(
    () => ({
      config,
      loading,
      isPageVisible,
      isChartVisible,
      getChartOrder,
      isFilterVisible,
    }),
    [config, loading, isPageVisible, isChartVisible, getChartOrder, isFilterVisible]
  );

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within ConfigProvider");
  }
  return ctx;
}
