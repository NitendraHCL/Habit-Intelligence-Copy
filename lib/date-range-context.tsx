"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

/**
 * Shared date range across all dashboard pages that have the top date filter.
 * Set on any page → applies everywhere, until changed. Persisted to
 * localStorage so it survives reloads / new tabs ("until changed"). Only the
 * DATE RANGE is shared — every other filter stays per-page. Pages without a
 * top date filter simply don't consume this.
 */

const STORAGE_KEY = "hi-date-range";
// Fixed default (deterministic → no SSR hydration mismatch); localStorage
// overrides it after mount.
const DEFAULT_RANGE = { from: new Date(2024, 0, 1), to: new Date(2026, 11, 31) };

type Range = { from: Date; to: Date };

interface DateRangeContextType {
  dateRange: Range;
  setDateRange: (r: Range) => void;
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setRange] = useState<Range>(DEFAULT_RANGE);

  // Restore the persisted range after mount (kept out of initial state so the
  // server and first client render match).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      const from = new Date(o.from), to = new Date(o.to);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime())) setRange({ from, to });
    } catch { /* ignore bad storage */ }
  }, []);

  const setDateRange = useCallback((r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ from: r.from.toISOString(), to: r.to.toISOString() }));
    } catch { /* ignore */ }
  }, []);

  return <DateRangeContext.Provider value={{ dateRange, setDateRange }}>{children}</DateRangeContext.Provider>;
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
