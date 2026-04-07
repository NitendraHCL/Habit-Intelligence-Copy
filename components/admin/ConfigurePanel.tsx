// @ts-nocheck
"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Settings,
  X,
  Eye,
  EyeOff,
  Save,
  Upload,
  Check,
  ChevronUp,
  ChevronDown,
  MonitorPlay,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { T } from "@/lib/ui/theme";
import type { DashboardConfig, PageConfig, ChartConfig } from "@/lib/types/dashboard-config";

interface ChartDef {
  id: string;
  label: string;
}

interface ConfigurePanelProps {
  pageSlug: string;
  pageTitle: string;
  charts: ChartDef[];
  filters?: string[];
  /** Called with the current draft PageConfig when preview is toggled. null = exit preview. */
  onPreview?: (config: PageConfig | null) => void;
  isPreview?: boolean;
}

function buildPageDefault(charts: ChartDef[], filters: string[]): PageConfig {
  const chartConf: Record<string, ChartConfig> = {};
  charts.forEach((c, i) => {
    chartConf[c.id] = { visible: true, order: i };
  });
  const filterConf: Record<string, boolean> = {};
  filters.forEach((f) => { filterConf[f] = true; });
  return { visible: true, charts: chartConf, filters: filterConf };
}

export function ConfigurePanel({ pageSlug, pageTitle, charts, filters = [], onPreview, isPreview = false }: ConfigurePanelProps) {
  const { user, activeClientId } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<PageConfig>(() => buildPageDefault(charts, filters));
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Load config when panel opens or client changes
  useEffect(() => {
    if (!isOpen || !activeClientId) return;
    fetch(`/api/admin/config?clientId=${activeClientId}`)
      .then((r) => r.json())
      .then((data) => {
        const draft = data.draftConfig as DashboardConfig | null;
        const pageConf = draft?.pages?.[pageSlug];
        if (pageConf) {
          // Merge with defaults
          const merged = buildPageDefault(charts, filters);
          merged.visible = pageConf.visible;
          for (const [chartId, cc] of Object.entries(pageConf.charts)) {
            if (merged.charts[chartId]) merged.charts[chartId] = cc;
          }
          for (const [fn, val] of Object.entries(pageConf.filters)) {
            merged.filters[fn] = val;
          }
          setConfig(merged);
        } else {
          setConfig(buildPageDefault(charts, filters));
        }
        setPublishedAt(data.configPublishedAt || null);
        setHasUnsaved(false);
      })
      .catch(() => {});
  }, [isOpen, activeClientId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const togglePageVisible = () => {
    setConfig((p) => ({ ...p, visible: !p.visible }));
    setHasUnsaved(true);
  };

  const toggleChart = (chartId: string) => {
    setConfig((p) => ({
      ...p,
      charts: { ...p.charts, [chartId]: { ...p.charts[chartId], visible: !p.charts[chartId].visible } },
    }));
    setHasUnsaved(true);
  };

  const moveChart = (chartId: string, direction: -1 | 1) => {
    setConfig((p) => {
      const entries = Object.entries(p.charts).sort((a, b) => a[1].order - b[1].order);
      const idx = entries.findIndex(([id]) => id === chartId);
      const swapIdx = idx + direction;
      if (swapIdx < 0 || swapIdx >= entries.length) return p;
      const newCharts = { ...p.charts };
      const currentOrder = entries[idx][1].order;
      const swapOrder = entries[swapIdx][1].order;
      newCharts[entries[idx][0]] = { ...newCharts[entries[idx][0]], order: swapOrder };
      newCharts[entries[swapIdx][0]] = { ...newCharts[entries[swapIdx][0]], order: currentOrder };
      return { ...p, charts: newCharts };
    });
    setHasUnsaved(true);
  };

  const toggleFilter = (filterName: string) => {
    setConfig((p) => ({
      ...p,
      filters: { ...p.filters, [filterName]: !p.filters[filterName] },
    }));
    setHasUnsaved(true);
  };

  const saveDraft = async () => {
    if (!activeClientId) return;
    setSaving(true);
    try {
      // First get existing full config
      const res = await fetch(`/api/admin/config?clientId=${activeClientId}`);
      const data = await res.json();
      const fullConfig: DashboardConfig = (data.draftConfig as DashboardConfig) || { pages: {} };
      fullConfig.pages[pageSlug] = config;
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, config: fullConfig }),
      });
      setHasUnsaved(false);
      showToast("Draft saved");
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!activeClientId) return;
    setPublishing(true);
    try {
      await saveDraft();
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, action: "publish" }),
      });
      const data = await res.json();
      setPublishedAt(data.configPublishedAt);
      setHasUnsaved(false);
      showToast("Published! Client will see this layout.");
    } catch {
      showToast("Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const chartEntries = Object.entries(config.charts).sort((a, b) => a[1].order - b[1].order);

  // Only SUPER_ADMIN sees configure
  if (!isSuperAdmin) return null;

  return (
    <>
      {/* Preview banner */}
      {isPreview && (
        <div className="fixed top-0 left-0 right-0 z-[70] bg-amber-500 text-white text-center py-2 text-[13px] font-semibold flex items-center justify-center gap-3 shadow-lg">
          <MonitorPlay size={16} />
          Preview Mode — This is how the client will see this page
          <button onClick={() => onPreview?.(null)} className="ml-4 px-3 py-1 bg-white text-amber-700 rounded-lg text-[12px] font-bold hover:bg-amber-50 transition-colors">
            Exit Preview
          </button>
        </div>
      )}

      {/* Trigger button (hidden in preview) */}
      {!isPreview && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-all border",
            isOpen
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
          )}
        >
          <Settings size={13} />
          Configure
        </button>
      )}

      {/* Slide-out panel (portaled to body) */}
      {isOpen && typeof document !== "undefined" && createPortal(
        <>
        <div className="fixed inset-0 z-[99] bg-black/20" onClick={() => setIsOpen(false)} />
        <div className="fixed inset-y-0 right-0 w-[380px] z-[100] bg-white border-l shadow-2xl flex flex-col" style={{ borderColor: T.border }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: T.border }}>
            <div>
              <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>Configure: {pageTitle}</h2>
              <p className="text-[11px] mt-0.5" style={{ color: T.textMuted }}>
                Customise what the client sees
                {publishedAt && ` · Published ${new Date(publishedAt).toLocaleDateString()}`}
              </p>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
              <X size={16} className="text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Page toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border" style={{ borderColor: T.border }}>
              <div>
                <span className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>Show page to client</span>
                <p className="text-[11px]" style={{ color: T.textMuted }}>Toggle entire page visibility</p>
              </div>
              <Switch checked={config.visible} onCheckedChange={togglePageVisible} />
            </div>

            {config.visible && (
              <>
                {/* Charts */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] mb-2" style={{ color: T.textMuted }}>Charts & KPIs</h3>
                  <div className="space-y-1.5">
                    {chartEntries.map(([chartId, chartConf], idx) => {
                      const label = charts.find((c) => c.id === chartId)?.label || chartId;
                      return (
                        <div key={chartId} className={cn("flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all", chartConf.visible ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100 opacity-50")} >
                          {/* Reorder */}
                          <div className="flex flex-col -my-1">
                            <button onClick={() => moveChart(chartId, -1)} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronUp size={12} /></button>
                            <button onClick={() => moveChart(chartId, 1)} disabled={idx === chartEntries.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20"><ChevronDown size={12} /></button>
                          </div>
                          {/* Label */}
                          <span className="flex-1 text-[12px] font-medium truncate" style={{ color: T.textPrimary }}>{label}</span>
                          {/* Visibility */}
                          <button onClick={() => toggleChart(chartId)} className={cn("p-1 rounded", chartConf.visible ? "text-emerald-500" : "text-red-400")}>
                            {chartConf.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Filters */}
                {filters.length > 0 && (
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] mb-2" style={{ color: T.textMuted }}>Filters</h3>
                    <div className="flex flex-wrap gap-2">
                      {filters.map((f) => {
                        const on = config.filters[f] !== false;
                        return (
                          <button key={f} onClick={() => toggleFilter(f)} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors", on ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400")}>
                            {on && <Check size={10} />}
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer actions */}
          <div className="border-t px-5 py-3 flex items-center gap-2" style={{ borderColor: T.border }}>
            {hasUnsaved && <span className="text-[11px] text-amber-600 font-medium mr-auto">Unsaved</span>}
            {!hasUnsaved && <span className="text-[11px] text-gray-400 mr-auto">No changes</span>}
            <Button variant="outline" size="sm" onClick={() => { onPreview?.(config); setIsOpen(false); }} className="h-8 text-[12px] gap-1.5">
              <MonitorPlay size={12} /> Preview
            </Button>
            <Button variant="outline" size="sm" onClick={saveDraft} disabled={saving || !hasUnsaved} className="h-8 text-[12px] gap-1.5">
              <Save size={12} /> {saving ? "Saving..." : "Save Draft"}
            </Button>
            <Button size="sm" onClick={publish} disabled={publishing || !hasUnsaved} className="h-8 text-[12px] gap-1.5" style={{ background: "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff" }}>
              <Upload size={12} /> {publishing ? "..." : "Publish"}
            </Button>
          </div>
        </div>
        </>,
        document.body
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-2 rounded-xl bg-[#111827] px-4 py-3 text-white shadow-lg">
            <Check size={14} className="text-emerald-400" />
            <span className="text-[13px] font-medium">{toast}</span>
          </div>
        </div>
      )}
    </>
  );
}
