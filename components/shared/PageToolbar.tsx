"use client";

// ── Shared Configure + Refresh toolbar for every dashboard page ──
// Drop into any page's filter bar or header. Handles:
//   - Refresh: fetches ?nocache=1, mutates SWR, shows toast
//   - Configure: opens ConfigurePanel (super-admin only)

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { ConfigurePanel } from "@/components/admin/ConfigurePanel";
import { useAuth } from "@/lib/contexts/auth-context";
import type { PageConfig } from "@/lib/types/dashboard-config";

interface PageToolbarProps {
  /** Used to look up / save chart visibility config. */
  pageSlug: string;
  pageTitle: string;
  /** Chart id+label list for ConfigurePanel. */
  charts: { id: string; label: string }[];
  /** Callable to bust SWR cache — typically the `mutate` from useSWR. */
  onRefresh?: () => Promise<unknown> | void;
  /** Refreshable URL — if set, fetches with ?nocache=1 before mutating. */
  refreshUrl?: string;
  /** Preview config callback for ConfigurePanel. */
  onPreview?: (config: PageConfig | null) => void;
  isPreview?: boolean;
}

export default function PageToolbar({
  pageSlug,
  pageTitle,
  charts,
  onRefresh,
  refreshUrl,
  onPreview,
  isPreview = false,
}: PageToolbarProps) {
  const { user } = useAuth();
  const isSuperAdmin =
    user?.role === "SUPER_ADMIN";
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showToast, setShowToast] = useState(false);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      // Bust the server-side cache if a URL is provided
      if (refreshUrl) {
        const sep = refreshUrl.includes("?") ? "&" : "?";
        await fetch(`${refreshUrl}${sep}nocache=1`).catch(() => {});
      }
      // Revalidate SWR
      if (onRefresh) await onRefresh();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              <RotateCcw
                className={`size-4 text-gray-600 ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data (bust cache)</TooltipContent>
        </Tooltip>

        {/* Configure (super-admin only) */}
        {isSuperAdmin && (
          <ConfigurePanel
            pageSlug={pageSlug}
            pageTitle={pageTitle}
            charts={charts}
            onPreview={onPreview}
            isPreview={isPreview}
          />
        )}
      </div>

      {/* Toast */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-lg animate-fade-in">
          Data refreshed successfully
        </div>
      )}
    </>
  );
}
