"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface LinkFilter {
  column: string;
  value: string;
}

interface CrossFilterState {
  filters: Record<string, LinkFilter | null>;
  setFilter: (linkGroup: string, filter: LinkFilter) => void;
  clearFilter: (linkGroup: string) => void;
  clearAll: () => void;
  getFilter: (linkGroup: string) => LinkFilter | null;
}

const CrossFilterContext = createContext<CrossFilterState | null>(null);

export function CrossFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<Record<string, LinkFilter | null>>({});

  const setFilter = useCallback((linkGroup: string, filter: LinkFilter) => {
    setFilters((prev) => ({ ...prev, [linkGroup]: filter }));
  }, []);

  const clearFilter = useCallback((linkGroup: string) => {
    setFilters((prev) => ({ ...prev, [linkGroup]: null }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
  }, []);

  const getFilter = useCallback(
    (linkGroup: string) => filters[linkGroup] ?? null,
    [filters]
  );

  return (
    <CrossFilterContext.Provider
      value={{ filters, setFilter, clearFilter, clearAll, getFilter }}
    >
      {children}
    </CrossFilterContext.Provider>
  );
}

export function useCrossFilter() {
  const ctx = useContext(CrossFilterContext);
  if (!ctx) {
    throw new Error("useCrossFilter must be used within CrossFilterProvider");
  }
  return ctx;
}
