"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";
import { AVAILABLE_PAGES } from "@/lib/config/available-pages";

/**
 * Hook that checks if the current page slug is enabled for the active client.
 * If not, redirects to the first enabled page. Call at the top of any page:
 *
 *   usePageAccess("/portal/ohc/utilization");
 *
 * SUPER_ADMIN / INTERNAL_OPS always pass.
 */
export function usePageAccess(slug: string) {
  const { isPageEnabledForClient, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isPageEnabledForClient(slug)) {
      // Find the first enabled page to redirect to
      const firstEnabled = AVAILABLE_PAGES.find((p) => isPageEnabledForClient(p.slug));
      router.replace(firstEnabled?.slug ?? "/portal/home");
    }
  }, [slug, isPageEnabledForClient, loading, router]);
}
