"use client";

import { useCallback } from "react";
import { useConfig } from "@/lib/contexts/config-context";
import type { PageConfig } from "@/lib/types/dashboard-config";

/**
 * Returns isChartVisible(chartId) for a page, merging admin Preview
 * (top-priority) with the active client's published config (fallback).
 *
 * SUPER_ADMIN / INTERNAL_OPS bypass the published config via the
 * ConfigProvider — for them, every chart is visible unless they're
 * actively previewing a draft.
 *
 * Usage at the top of a page component:
 *   const isChartVisible = useChartVisibility(
 *     "/portal/ohc/utilization",
 *     previewConfig,
 *   );
 */
export function useChartVisibility(
  pageSlug: string,
  previewConfig: PageConfig | null,
) {
  const { isChartVisible: isChartVisibleFromConfig } = useConfig();

  return useCallback(
    (chartId: string): boolean => {
      // Admin preview wins so SUPER_ADMINs can verify before publishing.
      if (previewConfig) {
        const cc = previewConfig.charts[chartId];
        if (!cc) return true;
        return cc.visible;
      }
      // Real client (or KAM) view → defer to published config.
      return isChartVisibleFromConfig(pageSlug, chartId);
    },
    [pageSlug, previewConfig, isChartVisibleFromConfig],
  );
}
