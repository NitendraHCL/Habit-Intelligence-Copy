"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import { useConfig } from "@/lib/contexts/config-context";
import { AVAILABLE_PAGES } from "@/lib/config/available-pages";

/**
 * Hook that checks if the current page slug is allowed for the user.
 * Two gates: CUG-level enabledPages (auth) AND per-client published
 * page-visibility (config). If either says no, redirect to the first
 * enabled+visible page. Call at the top of any page:
 *
 *   usePageAccess("/portal/ohc/utilization");
 *
 * SUPER_ADMIN / INTERNAL_OPS always pass.
 */
export function usePageAccess(slug: string) {
  const { isPageEnabledForClient, loading } = useAuth();
  const { isPageVisible, loading: configLoading } = useConfig();
  const router = useRouter();

  useEffect(() => {
    if (loading || configLoading) return;
    const allowed = isPageEnabledForClient(slug) && isPageVisible(slug);
    if (!allowed) {
      const firstAllowed = AVAILABLE_PAGES.find(
        (p) => isPageEnabledForClient(p.slug) && isPageVisible(p.slug),
      );
      router.replace(firstAllowed?.slug ?? "/portal/home");
    }
  }, [slug, isPageEnabledForClient, isPageVisible, loading, configLoading, router]);
}
