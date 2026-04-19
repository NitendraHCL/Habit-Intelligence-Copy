"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/auth-context";

/**
 * Hook that checks if the current page slug is enabled for the active client.
 * If not, redirects to /portal/home. Call at the top of any page component:
 *
 *   usePageAccess("/portal/ohc/utilization");
 *
 * SUPER_ADMIN / INTERNAL_OPS always pass. For other roles, checks the
 * client's enabledPages array.
 */
export function usePageAccess(slug: string) {
  const { isPageEnabledForClient, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!isPageEnabledForClient(slug)) {
      router.replace("/portal/home");
    }
  }, [slug, isPageEnabledForClient, loading, router]);
}
