"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser, Client } from "@/lib/types";

interface AuthContextValue {
  user: SessionUser | null;
  client: Client | null;
  /** The currently active client's full data (with enabledPages). */
  activeClient: Client | null;
  assignedClients: { id: string; cugName: string; cugCode: string | null }[];
  activeClientId: string | null;
  setActiveClientId: (id: string) => void;
  loading: boolean;
  logout: () => Promise<void>;
  /** Check if a page slug is enabled for the active client. */
  isPageEnabledForClient: (slug: string) => boolean;
  /** Check if custom dashboards are enabled for the active client. */
  isCustomDashboardsEnabled: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [assignedClients, setAssignedClients] = useState<{ id: string; cugName: string; cugCode: string | null }[]>([]);
  const [activeClientId, setActiveClientIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setClient(data.client);
        if (data.client) setActiveClient(data.client);
        setAssignedClients(data.assignedClients || []);
        const clients = data.assignedClients || [];
        const hclt = clients.find((c: { cugCode: string | null }) => c.cugCode === "HCLT001");
        const defaultClientId =
          data.user.clientId ||
          hclt?.id ||
          clients[0]?.id ||
          null;
        setActiveClientIdState(defaultClientId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // When activeClientId changes, fetch that client's full data (enabledPages etc.)
  const setActiveClientId = useCallback((id: string) => {
    setActiveClientIdState(id);
    if (!id) { setActiveClient(null); return; }
    fetch(`/api/admin/cug-management/client?id=${id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.client) setActiveClient(d.client); })
      .catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setClient(null);
    setActiveClient(null);
    router.push("/login");
  }, [router]);

  /** Returns true if the page is allowed for the active client.
   *  SUPER_ADMIN/INTERNAL_OPS always see everything. */
  const isPageEnabledForClient = useCallback((slug: string): boolean => {
    if (!user) return false;
    // Super admin / internal ops see all pages regardless
    if (user.role === "SUPER_ADMIN" || user.role === "INTERNAL_OPS") return true;
    if (!activeClient) return true; // no client loaded yet — show everything
    if (!activeClient.enabledPages) return true; // null = all pages enabled
    return activeClient.enabledPages.includes(slug);
  }, [user, activeClient]);

  const isCustomDashboardsEnabled = useCallback((): boolean => {
    if (!user) return false;
    if (user.role === "SUPER_ADMIN" || user.role === "INTERNAL_OPS") return true;
    return activeClient?.hasCustomDashboards ?? false;
  }, [user, activeClient]);

  return (
    <AuthContext.Provider
      value={{
        user, client, activeClient, assignedClients,
        activeClientId, setActiveClientId, loading, logout,
        isPageEnabledForClient, isCustomDashboardsEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
