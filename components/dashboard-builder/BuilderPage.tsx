"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import ChartPalette from "./ChartPalette";
import ChartConfigurator from "./ChartConfigurator";
import { useAuth } from "@/lib/contexts/auth-context";
import type {
  ChartDefinition,
  ChartPreset,
  PageDefinition,
  SectionDefinition,
  FilterType,
} from "@/lib/dashboard/types";
import {
  Plus,
  Trash2,
  Eye,
  Save,
  Send,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Settings,
  ArrowLeft,
} from "lucide-react";

interface BuilderPageProps {
  dashboardId?: string;
  initialConfig?: PageDefinition;
  initialTitle?: string;
}

const defaultConfig: PageDefinition = {
  slug: "",
  title: "",
  subtitle: "",
  icon: "BarChart3",
  navGroup: "Custom",
  filters: ["dateRange"],
  sections: [],
  charts: {},
};

export default function BuilderPage({
  dashboardId,
  initialConfig,
  initialTitle,
}: BuilderPageProps) {
  const router = useRouter();
  const { activeClientId } = useAuth();
  const clientId = activeClientId ?? "";

  const [config, setConfig] = useState<PageDefinition>(
    initialConfig ?? defaultConfig
  );
  const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
  const [editingChart, setEditingChart] = useState<Partial<ChartDefinition> | null>(null);
  const [showPageSettings, setShowPageSettings] = useState(!dashboardId);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // ── Chart CRUD ──

  function handleSelectPreset(preset: ChartPreset) {
    const id = `chart-${Date.now()}`;
    setEditingChart({
      id,
      type: preset.id,
      title: "",
      dataSource: { table: "" },
      transform: { metric: "count" },
      visualization: { ...preset.defaults },
    });
  }

  function handleSaveChart() {
    if (!editingChart?.id || !editingChart.type || !editingChart.title) return;
    const chartDef = editingChart as ChartDefinition;

    setConfig((prev) => {
      const next = { ...prev };
      next.charts = { ...next.charts, [chartDef.id]: chartDef };

      // Add to a section if not already placed
      const isPlaced = prev.sections.some((s) =>
        s.charts.includes(chartDef.id)
      );
      if (!isPlaced) {
        const isKPI = chartDef.type === "kpi" || chartDef.type === "stat_card";
        const sectionType = isKPI ? "kpi_row" : "chart_grid";
        const existingSection = next.sections.find(
          (s) => s.type === sectionType
        );
        if (existingSection) {
          existingSection.charts = [...existingSection.charts, chartDef.id];
        } else {
          next.sections = [
            ...next.sections,
            {
              id: `section-${Date.now()}`,
              type: sectionType,
              columns: isKPI ? undefined : 2,
              charts: [chartDef.id],
            },
          ];
        }
      }

      return next;
    });

    setEditingChart(null);
    setSelectedChartId(chartDef.id);
  }

  function handleDeleteChart(chartId: string) {
    setConfig((prev) => {
      const next = { ...prev };
      const { [chartId]: _, ...remainingCharts } = next.charts;
      next.charts = remainingCharts;
      next.sections = next.sections
        .map((s) => ({
          ...s,
          charts: s.charts.filter((id) => id !== chartId),
        }))
        .filter((s) => s.charts.length > 0);
      return next;
    });
    if (selectedChartId === chartId) setSelectedChartId(null);
  }

  function handleEditChart(chartId: string) {
    setEditingChart({ ...config.charts[chartId] });
  }

  // ── Section management ──

  function addSection(type: SectionDefinition["type"]) {
    setConfig((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        {
          id: `section-${Date.now()}`,
          type,
          columns: type === "chart_grid" ? 2 : undefined,
          charts: [],
        },
      ],
    }));
  }

  function moveSection(index: number, direction: "up" | "down") {
    setConfig((prev) => {
      const sections = [...prev.sections];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= sections.length) return prev;
      [sections[index], sections[newIndex]] = [sections[newIndex], sections[index]];
      return { ...prev, sections };
    });
  }

  function deleteSection(index: number) {
    setConfig((prev) => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index),
    }));
  }

  // ── Save / Publish ──

  async function handleSave() {
    // Auto-generate title and slug if missing
    const title = config.title || "Untitled Dashboard";
    const slug =
      config.slug ||
      `/portal/custom/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

    const saveConfig = { ...config, title, slug };
    setConfig(saveConfig);

    setSaving(true);
    try {
      const url = dashboardId
        ? `/api/admin/dashboards/${dashboardId}`
        : "/api/admin/dashboards";
      const method = dashboardId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId || null,
          slug: saveConfig.slug,
          title: saveConfig.title,
          subtitle: saveConfig.subtitle,
          icon: saveConfig.icon,
          navGroup: saveConfig.navGroup,
          config: saveConfig,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      const data = await res.json();

      if (!dashboardId && data.dashboard?.id) {
        router.replace(`/portal/builder/${data.dashboard.id}`);
      }
      showToast("Draft saved successfully");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!dashboardId) {
      await handleSave();
      return;
    }
    setPublishing(true);
    try {
      await handleSave();
      const res = await fetch(
        `/api/admin/dashboards/${dashboardId}/publish`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error("Publish failed");
      const data = await res.json();
      showToast(`Published as v${data.version} successfully`);
      setPublished(true);
      setTimeout(() => setPublished(false), 2000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Publish failed", "error");
    } finally {
      setPublishing(false);
    }
  }

  // ── Filter toggles ──

  const allFilters: { id: FilterType; label: string }[] = [
    { id: "dateRange", label: "Date Range" },
    { id: "location", label: "Location" },
    { id: "gender", label: "Gender" },
    { id: "ageGroup", label: "Age Group" },
    { id: "specialty", label: "Specialty" },
    { id: "relationship", label: "Relationship" },
  ];

  function toggleFilter(filter: FilterType) {
    setConfig((prev) => ({
      ...prev,
      filters: prev.filters.includes(filter)
        ? prev.filters.filter((f) => f !== filter)
        : [...prev.filters, filter],
    }));
  }

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Left Panel — Chart Palette */}
      <div className="w-72 border-r border-gray-200 bg-white flex-shrink-0 overflow-hidden flex flex-col">
        {editingChart ? (
          <ChartConfigurator
            chart={editingChart}
            onChange={setEditingChart}
            onSave={handleSaveChart}
            onCancel={() => setEditingChart(null)}
          />
        ) : (
          <ChartPalette
            onSelect={handleSelectPreset}
            selectedId={selectedChartId ?? undefined}
          />
        )}
      </div>

      {/* Center — Canvas */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/portal/builder")}
              className="p-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {config.title || "Untitled Dashboard"}
              </h1>
              <p className="text-xs text-gray-500">
                {Object.keys(config.charts).length} charts &middot;{" "}
                {config.sections.length} sections
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPageSettings((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-white"
            >
              <Settings size={14} />
              Settings
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-white disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? "Saving..." : saved ? "\u2713 Saved" : "Save Draft"}
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send size={14} />
              {publishing ? "Publishing..." : published ? "\u2713 Published" : "Publish"}
            </button>
          </div>
        </div>

        {/* Page Settings panel */}
        {showPageSettings && (
          <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Page Settings
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Title
                </label>
                <input
                  type="text"
                  value={config.title}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, title: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Dashboard Title"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  URL Slug
                </label>
                <input
                  type="text"
                  value={config.slug}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, slug: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="/portal/custom/my-dashboard"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Nav Group
                </label>
                <select
                  value={config.navGroup}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, navGroup: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="OHC">OHC</option>
                  <option value="AHC">AHC</option>
                  <option value="Employee Experience">Employee Experience</option>
                  <option value="Custom Dashboards">Custom Dashboards</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={config.subtitle ?? ""}
                  onChange={(e) =>
                    setConfig((p) => ({ ...p, subtitle: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Short description"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">
                Filters
              </label>
              <div className="flex flex-wrap gap-2">
                {allFilters.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => toggleFilter(f.id)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      config.filters.includes(f.id)
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Sections */}
        {config.sections.map((section, sIdx) => (
          <div
            key={section.id}
            className="mb-6 p-4 bg-white rounded-xl border border-gray-200"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GripVertical size={14} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {section.type.replace("_", " ")}
                </span>
                <span className="text-xs text-gray-400">
                  ({section.charts.length} charts)
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveSection(sIdx, "up")}
                  disabled={sIdx === 0}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveSection(sIdx, "down")}
                  disabled={sIdx === config.sections.length - 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => deleteSection(sIdx)}
                  className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Chart cards in this section */}
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns:
                  section.type === "full_width"
                    ? "1fr"
                    : section.type === "kpi_row"
                      ? `repeat(${Math.max(section.charts.length, 1)}, 1fr)`
                      : `repeat(${section.columns ?? 2}, 1fr)`,
              }}
            >
              {section.charts.map((chartId) => {
                const chart = config.charts[chartId];
                if (!chart) return null;
                return (
                  <div
                    key={chartId}
                    onClick={() => setSelectedChartId(chartId)}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                      selectedChartId === chartId
                        ? "border-indigo-300 bg-indigo-50/50"
                        : "border-gray-200 hover:border-gray-300 bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {chart.title || "Untitled"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {chart.type} &middot;{" "}
                          {chart.transform.metric ?? "count"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditChart(chartId);
                          }}
                          className="p-1 rounded hover:bg-white"
                        >
                          <Eye size={12} className="text-gray-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChart(chartId);
                          }}
                          className="p-1 rounded hover:bg-red-50"
                        >
                          <Trash2
                            size={12}
                            className="text-gray-400 hover:text-red-500"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {section.charts.length === 0 && (
              <div className="py-8 text-center text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
                Select a chart type from the left panel to add here
              </div>
            )}
          </div>
        ))}

        {/* Add section buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => addSection("kpi_row")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg hover:bg-white hover:border-gray-400 text-gray-500"
          >
            <Plus size={12} />
            KPI Row
          </button>
          <button
            onClick={() => addSection("chart_grid")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg hover:bg-white hover:border-gray-400 text-gray-500"
          >
            <Plus size={12} />
            Chart Grid
          </button>
          <button
            onClick={() => addSection("full_width")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg hover:bg-white hover:border-gray-400 text-gray-500"
          >
            <Plus size={12} />
            Full Width
          </button>
          <button
            onClick={() => addSection("tabs")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg hover:bg-white hover:border-gray-400 text-gray-500"
          >
            <Plus size={12} />
            Tabs
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
              toast.type === "success"
                ? "bg-green-600 text-white"
                : "bg-red-600 text-white"
            }`}
          >
            <span>{toast.type === "success" ? "\u2713" : "\u2717"}</span>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
