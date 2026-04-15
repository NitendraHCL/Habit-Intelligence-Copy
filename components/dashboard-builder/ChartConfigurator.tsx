"use client";

import { useState, useMemo, useCallback } from "react";
import {
  getAllDataSourceOptions,
  getGroupableColumns,
  getAggregatableColumns,
  getFilterableColumns,
  getDataSource,
  getJoinableTablesFor,
  getMergedColumns,
} from "@/lib/config/data-sources";
import type { ChartDefinition, ChartTypeId, WhereCondition } from "@/lib/dashboard/types";
import { getPreset } from "@/lib/config/chart-presets";
import { useAuth } from "@/lib/contexts/auth-context";
import Disclose from "./Disclose";
import TokenChips from "./TokenChips";
import ChartPreview from "./ChartPreview";
import DataPreview from "./DataPreview";
import {
  getPresetsForType,
  getDefaultOpenSections,
} from "./visualization-presets";

interface ChartConfiguratorProps {
  chart: Partial<ChartDefinition>;
  onChange: (chart: Partial<ChartDefinition>) => void;
  onSave: () => void;
  onCancel: () => void;
}

type Tab = "data" | "style" | "behavior" | "thresholds";

// High-cardinality columns that should warn when used in groupBy
const HIGH_CARDINALITY_PATTERNS = ["uhid", "patient_id", "id", "token", "email"];

export default function ChartConfigurator({
  chart,
  onChange,
  onSave,
  onCancel,
}: ChartConfiguratorProps) {
  const [activeTab, setActiveTab] = useState<Tab>("data");
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [previewError, setPreviewError] = useState("");
  const [previewRows, setPreviewRows] = useState(0);
  const { activeClientId } = useAuth();

  const preset = chart.type ? getPreset(chart.type) : null;
  const table = chart.dataSource?.table ?? "";
  const dataSources = getAllDataSourceOptions();
  const groupableCols = table ? getGroupableColumns(table) : [];
  const aggregatableCols = table ? getAggregatableColumns(table) : [];

  // ── Validation ──
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!chart.title?.trim()) errors.push("Title is required");
    if (!table) errors.push("Data source is required");

    // Metric-column type check
    const metric = chart.transform?.metric ?? "count";
    if (metric !== "count") {
      const parts = metric.split(":");
      if (parts.length === 2) {
        const [fn, col] = parts;
        const ds = getDataSource(table);
        const colDef = ds?.columns[col];
        if (colDef && ["sum", "avg", "min", "max"].includes(fn) && colDef.type !== "number") {
          errors.push(`${fn}() requires a numeric column — "${colDef.label}" is ${colDef.type}`);
        }
      }
    }

    // Chart-type-to-data-shape validation
    const chartType = chart.type;
    const gb = chart.transform?.groupBy;
    const hasGroupBy = gb ? (Array.isArray(gb) ? gb.length > 0 : !!gb) : false;
    const metricCount = chart.transform?.metrics?.length ?? (metric ? 1 : 0);

    if (chartType) {
      // Scatter/Bubble need at least 2 numeric metrics, no groupBy
      if (["scatter", "bubble"].includes(chartType)) {
        if (metricCount < 2) {
          errors.push(`${chartType === "bubble" ? "Bubble" : "Scatter"} chart needs at least 2 metrics (x and y axis) — use the multi-metric config or pick a different chart type`);
        }
        if (chartType === "bubble" && metricCount < 3) {
          errors.push("Bubble chart needs 3 metrics (x, y, and bubble size)");
        }
      }

      // Heatmap needs 2 groupBy dimensions
      if (chartType === "heatmap") {
        const gbArray = Array.isArray(gb) ? gb : gb ? [gb] : [];
        if (gbArray.length < 2) {
          errors.push("Heatmap needs 2 Group By dimensions (e.g., day of week + hour)");
        }
      }

      // Sankey needs 2 groupBy columns (source + target)
      if (chartType === "sankey") {
        const gbArray = Array.isArray(gb) ? gb : gb ? [gb] : [];
        if (gbArray.length < 2) {
          errors.push("Sankey diagram needs 2 Group By columns (source and target)");
        }
      }

      // Radar needs multiple metrics
      if (chartType === "radar" && metricCount < 2) {
        errors.push("Radar chart needs multiple metrics to compare — add at least 2");
      }

      // Charts that require groupBy
      const needsGroupBy: ChartTypeId[] = [
        "bar", "stacked_bar", "grouped_bar", "horizontal_bar", "stacked_bar_100",
        "line", "step_line", "area", "stacked_area", "stacked_area_100",
        "pie", "donut", "half_donut", "nightingale", "funnel", "treemap", "sunburst",
        "heatmap", "histogram", "radar", "sankey", "word_cloud",
        "data_table", "metric_table",
      ];
      if (needsGroupBy.includes(chartType) && !hasGroupBy) {
        errors.push("This chart type requires a Group By column");
      }

      // Composed needs multiple metrics
      if (chartType === "composed" && metricCount < 2) {
        errors.push("Composed chart needs at least 2 metrics (one for bars, one for line)");
      }
    }

    return errors;
  }, [chart.title, table, chart.transform?.metric, chart.type, chart.transform?.groupBy, chart.transform?.metrics]);

  // ── Warnings ──
  const warnings = useMemo(() => {
    const warns: string[] = [];

    const gb = chart.transform?.groupBy;
    const groupByValue = gb ? (Array.isArray(gb) ? gb[0] : gb) : "";
    // Check for high-cardinality groupBy
    if (groupByValue && !groupByValue.includes("(")) {
      if (HIGH_CARDINALITY_PATTERNS.some((p) => groupByValue.toLowerCase().includes(p))) {
        warns.push(`Grouping by "${groupByValue}" may return thousands of rows — consider using a time function or a categorical column instead`);
      }
    }

    // Suggest better chart types based on data shape
    const chartType = chart.type;
    const metric = chart.transform?.metric ?? "count";
    const hasGroupBy = gb ? (Array.isArray(gb) ? gb.length > 0 : !!gb) : false;

    if (chartType && hasGroupBy) {
      // Single metric + groupBy → suggest bar/pie/donut instead of scatter/bubble
      if (["scatter", "bubble"].includes(chartType) && !chart.transform?.metrics?.length) {
        warns.push("With a single metric and Group By, consider using a Bar, Pie, or Donut chart instead");
      }

      // Time-based groupBy with pie/donut → suggest line/area
      if (groupByValue.match(/^(month|week|day|year|quarter)\(/) && ["pie", "donut", "half_donut"].includes(chartType)) {
        warns.push("Time-based grouping works better with Line or Area charts — Pie/Donut is best for categorical data");
      }

      // Too many categories for pie/donut
      if (["pie", "donut", "half_donut", "nightingale"].includes(chartType) && !chart.transform?.limit) {
        warns.push("Pie/Donut charts look best with a limit (e.g., top 8) — without one, too many slices make it unreadable");
      }
    }

    // Visualization-config sanity checks
    const viz = chart.visualization ?? {};
    const tooltipTpl = viz.tooltipTemplate;
    if (typeof tooltipTpl === "string" && tooltipTpl.length > 0) {
      const refs = Array.from(tooltipTpl.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
      const allowed = new Set(["name", "value", "pct", "seriesName", "x", "y"]);
      for (const r of refs) {
        if (!allowed.has(r)) {
          warns.push(`Tooltip template uses unknown token \"{${r}}\" — will render as empty`);
        }
      }
    }
    const insightTpl = viz.insightTemplate;
    if (typeof insightTpl === "string" && insightTpl.length > 0) {
      const refs = Array.from(insightTpl.matchAll(/\{(\w+)\}/g)).map((m) => m[1]);
      const allowed = new Set([
        "topLabel", "topValue", "topPct", "bottomLabel", "bottomValue",
        "total", "count", "title",
      ]);
      for (const r of refs) {
        if (!allowed.has(r)) {
          warns.push(`Insight template uses unknown token \"{${r}}\" — will render as empty`);
        }
      }
    }
    // ColorByColumn: must specify column
    const cbc = viz.colorByColumn as { column?: string; palettes?: Record<string, string[]> } | undefined;
    if (cbc && (!cbc.column || Object.keys(cbc.palettes ?? {}).length === 0)) {
      warns.push("Color By Column is partially configured — set a column and at least one value→palette");
    }
    // Rank palette + only 1 metric: warns user that single-series uses per-row ranks
    if (viz.rankPalette && (chart.transform?.metrics?.length ?? 1) === 1) {
      warns.push("Rank Palette with a single metric ranks rows by value (darkest = #1). Use a stacked bar with multiple metrics for per-bar ranking.");
    }

    return warns;
  }, [chart.transform?.groupBy, chart.type, chart.transform?.metric, chart.transform?.metrics, chart.transform?.limit, chart.visualization]);

  // ── Test Query ──
  const runTestQuery = useCallback(async () => {
    if (validationErrors.length > 0) return;

    setPreviewState("loading");
    setPreviewError("");

    try {
      const res = await fetch(`/api/data/query?clientId=${activeClientId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataSource: chart.dataSource,
          transform: { ...chart.transform, limit: 5 },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Query failed (${res.status})`);
      }

      const data = await res.json();
      setPreviewRows(data.meta?.rowCount ?? 0);
      setPreviewState("success");
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Test query failed");
      setPreviewState("error");
    }
  }, [chart.dataSource, chart.transform, activeClientId, validationErrors]);

  const canSave = validationErrors.length === 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "data", label: "Data" },
    { id: "style", label: "Style" },
    { id: "behavior", label: "Behavior" },
    { id: "thresholds", label: "Thresholds" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">
          {preset?.label ?? "Configure Chart"}
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {preset?.description ?? "Select a chart type first"}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "data" && (
          <DataTab
            chart={chart}
            onChange={onChange}
            dataSources={dataSources}
            groupableCols={groupableCols}
            aggregatableCols={aggregatableCols}
          />
        )}
        {activeTab === "style" && (
          <StyleTab chart={chart} onChange={onChange} clientId={activeClientId ?? ""} />
        )}
        {activeTab === "behavior" && (
          <BehaviorTab chart={chart} onChange={onChange} groupableCols={groupableCols} />
        )}
        {activeTab === "thresholds" && (
          <ThresholdsTab chart={chart} onChange={onChange} />
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-medium text-red-700 mb-1">Cannot save:</p>
            {validationErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-600">- {err}</p>
            ))}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && validationErrors.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs font-medium text-amber-700 mb-1">Warning:</p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-600">- {w}</p>
            ))}
          </div>
        )}

        {/* Test Query Result */}
        {previewState === "success" && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-700">
              Test passed — {previewRows} row{previewRows !== 1 ? "s" : ""} returned
            </p>
          </div>
        )}
        {previewState === "error" && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-medium text-red-700">Test query failed:</p>
            <p className="text-xs text-red-600 mt-0.5">{previewError}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200 space-y-2">
        <button
          onClick={runTestQuery}
          disabled={!canSave || previewState === "loading"}
          className="w-full px-3 py-2 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {previewState === "loading" ? "Testing..." : "Test Query"}
        </button>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!canSave}
            className="flex-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Chart
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Data Tab ──

function DataTab({
  chart,
  onChange,
  dataSources,
  groupableCols,
  aggregatableCols,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
  dataSources: { value: string; label: string }[];
  groupableCols: { key: string; label: string; type: string }[];
  aggregatableCols: { key: string; label: string; type: string }[];
}) {
  const table = chart.dataSource?.table ?? "";
  const joinedTables = (chart.dataSource?.joins ?? []).map((j) => j.table);
  const allGroupable = table ? getGroupableColumns(table) : [];

  // Merged columns from joined tables for metrics
  const joinedMetricCols = joinedTables.flatMap((jt) => {
    const cols = getMergedColumns(jt, []);
    return cols.map((c) => ({ ...c, fromJoin: true }));
  });

  const metricOptions = [
    { value: "count", label: "Count" },
    // count_distinct works on any column — primary table
    ...allGroupable.map((col) => ({
      value: `count_distinct:${col.key}`,
      label: `Unique ${col.label}`,
    })),
    // count_distinct — joined tables
    ...joinedMetricCols
      .filter((c) => c.groupable)
      .map((col) => ({
        value: `count_distinct:${col.key}`,
        label: `Unique ${col.label}`,
      })),
    // sum/avg/min/max only for number columns — primary table
    ...aggregatableCols
      .filter((col) => col.type === "number")
      .flatMap((col) => [
        { value: `sum:${col.key}`, label: `Sum of ${col.label}` },
        { value: `avg:${col.key}`, label: `Average ${col.label}` },
        { value: `min:${col.key}`, label: `Min ${col.label}` },
        { value: `max:${col.key}`, label: `Max ${col.label}` },
      ]),
    // sum/avg/min/max — joined table number columns
    ...joinedMetricCols
      .filter((c) => c.type === "number" && c.aggregatable)
      .flatMap((col) => [
        { value: `sum:${col.key}`, label: `Sum of ${col.label}` },
        { value: `avg:${col.key}`, label: `Average ${col.label}` },
        { value: `min:${col.key}`, label: `Min ${col.label}` },
        { value: `max:${col.key}`, label: `Max ${col.label}` },
      ]),
  ];

  const timeFunctions = [
    { value: "", label: "None (raw column)" },
    { value: "day", label: "Daily" },
    { value: "week", label: "Weekly" },
    { value: "month", label: "Monthly" },
    { value: "quarter", label: "Quarterly" },
    { value: "year", label: "Yearly" },
    { value: "dow", label: "Day of Week" },
    { value: "hour", label: "Hour of Day" },
  ];

  const timestampCols = groupableCols.filter((c) => c.type === "timestamp");
  const hasTimestamp = timestampCols.length > 0;

  return (
    <>
      <Field label="Title">
        <input
          type="text"
          value={chart.title ?? ""}
          onChange={(e) => onChange({ ...chart, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="Chart title"
        />
      </Field>

      <Field label="Subtitle">
        <input
          type="text"
          value={chart.subtitle ?? ""}
          onChange={(e) => onChange({ ...chart, subtitle: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="Optional description"
        />
      </Field>

      <Field label="Tooltip Info">
        <input
          type="text"
          value={chart.tooltipText ?? ""}
          onChange={(e) => onChange({ ...chart, tooltipText: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="Shown on hover of the (i) icon"
        />
      </Field>

      <Field label="Data Source">
        <select
          value={chart.dataSource?.table ?? ""}
          onChange={(e) =>
            onChange({
              ...chart,
              dataSource: { ...chart.dataSource, table: e.target.value },
            })
          }
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">Select table...</option>
          {dataSources.map((ds) => (
            <option key={ds.value} value={ds.value}>
              {ds.label}
            </option>
          ))}
        </select>
      </Field>

      <JoinBuilder chart={chart} onChange={onChange} />

      <GroupByEditor
        chart={chart}
        onChange={onChange}
        groupableCols={groupableCols}
        hasTimestamp={hasTimestamp}
        timestampCols={timestampCols}
        timeFunctions={timeFunctions}
      />

      <Field label="Metric">
        <select
          value={chart.transform?.metric ?? "count"}
          onChange={(e) =>
            onChange({
              ...chart,
              transform: { ...chart.transform, metric: e.target.value },
            })
          }
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          {metricOptions.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Multi-metric builder for charts that need 2+ metrics */}
      <MultiMetricBuilder
        chart={chart}
        onChange={onChange}
        metricOptions={metricOptions}
      />

      <Field label="Sort">
        <select
          value={chart.transform?.sort ?? ""}
          onChange={(e) =>
            onChange({
              ...chart,
              transform: {
                ...chart.transform,
                sort: (e.target.value as "asc" | "desc") || undefined,
              },
            })
          }
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">Default</option>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Limit">
          <input
            type="number"
            value={chart.transform?.limit ?? ""}
            onChange={(e) =>
              onChange({
                ...chart,
                transform: {
                  ...chart.transform,
                  limit: e.target.value ? Number(e.target.value) : undefined,
                },
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="No limit"
            min={1}
          />
        </Field>
        <Field label="Others Label">
          <input
            type="text"
            value={chart.transform?.groupRest ?? ""}
            onChange={(e) =>
              onChange({
                ...chart,
                transform: {
                  ...chart.transform,
                  groupRest: e.target.value || undefined,
                },
              })
            }
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder='e.g. "Others"'
          />
        </Field>
      </div>

      <WhereBuilder chart={chart} onChange={onChange} groupableCols={groupableCols} />
    </>
  );
}

// ── Join Builder ──

function JoinBuilder({
  chart,
  onChange,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
}) {
  const table = chart.dataSource?.table ?? "";
  if (!table) return null;

  const joinable = getJoinableTablesFor(table);
  if (joinable.length === 0) return null;

  const activeJoins = chart.dataSource?.joins ?? [];

  function addJoin(joinInfo: typeof joinable[0]) {
    const newJoin = {
      table: joinInfo.table,
      on: { primary: joinInfo.localColumn, foreign: joinInfo.foreignColumn },
      type: joinInfo.type as "inner" | "left",
    };
    onChange({
      ...chart,
      dataSource: {
        ...chart.dataSource,
        table,
        joins: [...activeJoins, newJoin],
      },
    });
  }

  function removeJoin(index: number) {
    onChange({
      ...chart,
      dataSource: {
        ...chart.dataSource,
        table,
        joins: activeJoins.filter((_, i) => i !== index),
      },
    });
  }

  const availableJoins = joinable.filter(
    (j) => !activeJoins.some((aj) => aj.table === j.table)
  );

  return (
    <Field label="Join Data Sources">
      <p className="text-[10px] text-gray-400 mb-2">
        Add tables to combine data across sources. Columns from joined tables appear in Group By and Metric dropdowns.
      </p>
      <div className="space-y-2">
        {activeJoins.map((join, i) => {
          const joinDs = getDataSource(join.table);
          return (
            <div
              key={i}
              className="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-200 rounded-lg"
            >
              <div className="text-xs">
                <span className="font-medium text-indigo-700">
                  {joinDs?.label ?? join.table}
                </span>
                <span className="text-indigo-400 ml-1">
                  on {join.on.primary} = {join.on.foreign}
                </span>
              </div>
              <button
                onClick={() => removeJoin(i)}
                className="text-indigo-400 hover:text-red-500 text-xs"
              >
                &times;
              </button>
            </div>
          );
        })}
        {availableJoins.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const selected = availableJoins.find((j) => j.table === e.target.value);
              if (selected) addJoin(selected);
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-500"
          >
            <option value="">+ Add data source...</option>
            {availableJoins.map((j) => (
              <option key={j.table} value={j.table}>
                {j.label} (join on {j.localColumn})
              </option>
            ))}
          </select>
        )}
      </div>
    </Field>
  );
}

// ── Multi-Metric Builder ──

const MULTI_METRIC_TYPES: ChartTypeId[] = [
  "scatter", "bubble", "radar", "composed",
  "stacked_bar", "grouped_bar", "stacked_bar_100",
  "stacked_area", "stacked_area_100",
  "line", "area", "metric_table", "comparison_card",
];

function MultiMetricBuilder({
  chart,
  onChange,
  metricOptions,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
  metricOptions: { value: string; label: string }[];
}) {
  const chartType = chart.type;
  if (!chartType || !MULTI_METRIC_TYPES.includes(chartType)) return null;

  const metrics = chart.transform?.metrics ?? [];

  function addMetric() {
    const newMetric = {
      key: `metric_${metrics.length + 1}`,
      metric: "count",
      label: `Metric ${metrics.length + 1}`,
    };
    onChange({
      ...chart,
      transform: {
        ...chart.transform,
        metrics: [...metrics, newMetric],
      },
    });
  }

  function updateMetric(index: number, updates: Partial<typeof metrics[0]>) {
    const next = [...metrics];
    next[index] = { ...next[index], ...updates };
    onChange({
      ...chart,
      transform: { ...chart.transform, metrics: next },
    });
  }

  function removeMetric(index: number) {
    onChange({
      ...chart,
      transform: {
        ...chart.transform,
        metrics: metrics.filter((_, i) => i !== index),
      },
    });
  }

  const minMetrics = chartType === "bubble" ? 3 : chartType === "scatter" ? 2 : 2;

  return (
    <Field label={`Additional Metrics (${chartType} needs ${minMetrics}+)`}>
      <p className="text-[10px] text-gray-400 mb-2">
        The primary metric above is always included. Add more series here.
      </p>
      <div className="space-y-2">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={m.label}
              onChange={(e) => updateMetric(i, { label: e.target.value })}
              className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs"
              placeholder="Label"
            />
            <select
              value={m.metric}
              onChange={(e) =>
                updateMetric(i, {
                  metric: e.target.value,
                  key: e.target.value.replace(/[^a-zA-Z0-9]/g, "_"),
                })
              }
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
            >
              {metricOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeMetric(i)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          onClick={addMetric}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add metric
        </button>
      </div>
    </Field>
  );
}

function getGroupByValue(chart: Partial<ChartDefinition>): string {
  const gb = chart.transform?.groupBy;
  if (!gb) return "";
  return Array.isArray(gb) ? gb[0] : gb;
}

function getGroupByArray(chart: Partial<ChartDefinition>): string[] {
  const gb = chart.transform?.groupBy;
  if (!gb) return [];
  return Array.isArray(gb) ? gb : [gb];
}

interface GroupByEditorProps {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
  groupableCols: { key: string; label: string; type?: string }[];
  hasTimestamp: boolean;
  timestampCols: { key: string; label: string }[];
  timeFunctions: { value: string; label: string }[];
}

function GroupByEditor({
  chart,
  onChange,
  groupableCols,
  hasTimestamp,
  timestampCols,
  timeFunctions,
}: GroupByEditorProps) {
  const groupBys = getGroupByArray(chart);
  const setLevel = (level: number, value: string) => {
    const next = [...groupBys];
    if (value) {
      next[level] = value;
    } else {
      // Clear this and all deeper levels
      next.length = level;
    }
    // Trim trailing empty
    while (next.length && !next[next.length - 1]) next.pop();
    onChange({
      ...chart,
      transform: {
        ...chart.transform,
        groupBy:
          next.length === 0
            ? undefined
            : next.length === 1
              ? next[0]
              : next,
      },
    });
  };

  const renderSelect = (level: number) => (
    <select
      value={groupBys[level] ?? ""}
      onChange={(e) => setLevel(level, e.target.value)}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
    >
      <option value="">{level === 0 ? "None" : "(none)"}</option>
      {groupableCols
        .filter((c) => c.type !== "timestamp")
        .map((col) => (
          <option key={col.key} value={col.key}>
            {col.label}
          </option>
        ))}
      {hasTimestamp &&
        timestampCols.map((col) =>
          timeFunctions
            .filter((tf) => tf.value)
            .map((tf) => (
              <option
                key={`${tf.value}(${col.key})`}
                value={`${tf.value}(${col.key})`}
              >
                {col.label} ({tf.label})
              </option>
            ))
        )}
      {(chart.dataSource?.joins ?? []).map((join) => {
        const joinedCols = getMergedColumns(join.table, []).filter(
          (c) => c.groupable && c.type !== "timestamp"
        );
        const joinedTimestamps = getMergedColumns(join.table, []).filter(
          (c) => c.groupable && c.type === "timestamp"
        );
        const joinDs = getDataSource(join.table);
        return (
          <optgroup key={join.table} label={joinDs?.label ?? join.table}>
            {joinedCols.map((col) => (
              <option key={col.key} value={col.key}>
                {col.label}
              </option>
            ))}
            {joinedTimestamps.flatMap((col) =>
              timeFunctions
                .filter((tf) => tf.value)
                .map((tf) => (
                  <option
                    key={`${tf.value}(${col.key})`}
                    value={`${tf.value}(${col.key})`}
                  >
                    {col.label} ({tf.label})
                  </option>
                ))
            )}
          </optgroup>
        );
      })}
    </select>
  );

  return (
    <>
      <Field label="Group By">{renderSelect(0)}</Field>
      {groupBys[0] && (
        <Field label="Secondary Group By (sunburst ring 2 / heatmap Y)">
          {renderSelect(1)}
        </Field>
      )}
      {groupBys[0] && groupBys[1] && (
        <Field label="Tertiary Group By (sunburst ring 3)">
          {renderSelect(2)}
        </Field>
      )}
      {groupBys.length > 1 && (
        <p className="text-[11px] text-gray-500 -mt-2 mb-2">
          Multi-level grouping nests data into a tree (sunburst rings, heatmap
          axes).
        </p>
      )}
    </>
  );
}

// ── Where condition builder ──

function WhereBuilder({
  chart,
  onChange,
  groupableCols,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
  groupableCols: { key: string; label: string }[];
}) {
  const where = chart.dataSource?.where ?? {};
  const entries = Object.entries(where);

  function addCondition() {
    if (groupableCols.length === 0) return;
    const col = groupableCols[0].key;
    onChange({
      ...chart,
      dataSource: {
        ...chart.dataSource,
        table: chart.dataSource?.table ?? "",
        where: { ...where, [col]: { in: [] } },
      },
    });
  }

  function removeCondition(col: string) {
    const next = { ...where };
    delete next[col];
    onChange({
      ...chart,
      dataSource: {
        ...chart.dataSource,
        table: chart.dataSource?.table ?? "",
        where: next,
      },
    });
  }

  function updateCondition(col: string, condition: WhereCondition) {
    onChange({
      ...chart,
      dataSource: {
        ...chart.dataSource,
        table: chart.dataSource?.table ?? "",
        where: { ...where, [col]: condition },
      },
    });
  }

  return (
    <Field label="Filters (WHERE)">
      <div className="space-y-2">
        {entries.map(([col, condition]) => (
          <div key={col} className="flex items-center gap-2">
            <select
              value={col}
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
              onChange={() => {}}
            >
              {groupableCols.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={
                "in" in (condition as Record<string, unknown>)
                  ? ((condition as { in: string[] }).in ?? []).join(", ")
                  : "eq" in (condition as Record<string, unknown>)
                    ? String((condition as { eq: string }).eq)
                    : ""
              }
              onChange={(e) => {
                const vals = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                updateCondition(col, vals.length === 1 ? { eq: vals[0] } : { in: vals });
              }}
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
              placeholder="value1, value2"
            />
            <button
              onClick={() => removeCondition(col)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          onClick={addCondition}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add filter
        </button>
      </div>
    </Field>
  );
}

// ── Style Tab ──

function StyleTab({
  chart,
  onChange,
  clientId,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
  clientId: string;
}) {
  const viz = chart.visualization ?? {};
  const presets = getPresetsForType(chart.type);
  const defaultOpen = useMemo(() => new Set(getDefaultOpenSections(chart.type)), [chart.type]);

  function updateViz(updates: Record<string, unknown>) {
    onChange({ ...chart, visualization: { ...viz, ...updates } });
  }

  function applyPreset(presetId: string) {
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    const nextViz = { ...viz, ...p.visualization };
    const nextTransform = p.transform
      ? { ...(chart.transform ?? {}), ...p.transform }
      : chart.transform;
    onChange({ ...chart, visualization: nextViz, transform: nextTransform });
  }

  // Determine which advanced sections are "configured" (have non-default state)
  const isConfigured = {
    colorOverrides: !!viz.colorOverrides && Object.keys(viz.colorOverrides as object).length > 0,
    tooltipTemplate: !!viz.tooltipTemplate,
    insightTemplate: viz.insightTemplate !== undefined,
    toggles: Array.isArray(viz.toggles) && (viz.toggles as unknown[]).length > 0,
    colorByColumn: !!(viz.colorByColumn as { column?: string } | undefined)?.column,
    rankPalette: !!viz.rankPalette,
    statCard: !!viz.statCard && Object.keys(viz.statCard as object).length > 0,
  };

  return (
    <>
      {/* Live preview at the top */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-600 border-b border-gray-200 bg-white">
          Live Preview
        </div>
        <div className="p-2">
          <ChartPreview chart={chart} clientId={clientId} />
        </div>
      </div>

      {/* Preset gallery */}
      {presets.length > 0 && (
        <div className="border border-indigo-100 bg-indigo-50/40 rounded-lg p-2.5">
          <div className="flex items-start justify-between mb-1.5">
            <div>
              <p className="text-xs font-semibold text-indigo-900">Quick Presets</p>
              <p className="text-[11px] text-indigo-700/80">
                One click applies a polished starter config.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                title={p.description}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Basics — always visible */}
      <Field label="Height (px)">
        <input
          type="number"
          value={viz.height ?? 350}
          onChange={(e) => updateViz({ height: Number(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          min={150}
          max={800}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.showLegend !== false}
            onChange={(e) => updateViz({ showLegend: e.target.checked })}
            className="rounded border-gray-300"
          />
          Show Legend
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.showGrid !== false}
            onChange={(e) => updateViz({ showGrid: e.target.checked })}
            className="rounded border-gray-300"
          />
          Show Grid
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.showLabels !== false}
            onChange={(e) => updateViz({ showLabels: e.target.checked })}
            className="rounded border-gray-300"
          />
          Show Labels
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.stacked === true}
            onChange={(e) => updateViz({ stacked: e.target.checked })}
            className="rounded border-gray-300"
          />
          Stacked
        </label>
      </div>

      <Field label="Orientation">
        <select
          value={(viz.orientation as string) ?? "vertical"}
          onChange={(e) => updateViz({ orientation: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
      </Field>

      <Field label="Value Format">
        <select
          value={(viz.format as string) ?? "number"}
          onChange={(e) => updateViz({ format: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="number">Number</option>
          <option value="percentage">Percentage</option>
          <option value="currency">Currency</option>
          <option value="decimal">Decimal</option>
        </select>
      </Field>

      <Field label="Colors (comma-separated hex)">
        <input
          type="text"
          value={
            Array.isArray(viz.colors) ? (viz.colors as string[]).join(", ") : ""
          }
          onChange={(e) => {
            const colors = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            updateViz({ colors: colors.length > 0 ? colors : "default" });
          }}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="#4f46e5, #0d9488, #f59e0b"
        />
      </Field>

      {/* Advanced — collapsed by default; chart-type-aware default-open */}
      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Advanced
        </p>

        <Disclose
          title="Label → Color Overrides"
          caption="Map a category label (e.g. <20) to a specific color."
          defaultOpen={defaultOpen.has("colorOverrides") || isConfigured.colorOverrides}
          configured={isConfigured.colorOverrides}
        >
          <ColorOverridesEditor viz={viz} updateViz={updateViz} />
          <DataPreview
            chart={chart}
            clientId={clientId}
            onPickValue={(label) => {
              const current = (viz.colorOverrides as Record<string, string>) ?? {};
              if (current[label]) return; // already set
              updateViz({ colorOverrides: { ...current, [label]: "#4f46e5" } });
            }}
          />
        </Disclose>

        <Disclose
          title="Tooltip Template"
          caption="Customize the hover popup text. Click a chip to insert a token."
          defaultOpen={defaultOpen.has("tooltipTemplate") || isConfigured.tooltipTemplate}
          configured={isConfigured.tooltipTemplate}
        >
          <TooltipTemplateEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Insight Template"
          caption="Auto-generated text below the chart. Leave blank for default."
          defaultOpen={defaultOpen.has("insightTemplate") || isConfigured.insightTemplate}
          configured={isConfigured.insightTemplate}
        >
          <InsightTemplateEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="View Toggles"
          caption="Button group above the chart that swaps groupBy / metric / filter."
          defaultOpen={defaultOpen.has("toggles") || isConfigured.toggles}
          configured={isConfigured.toggles}
        >
          <ViewTogglesEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Color By Column"
          caption="Route palette by a categorical column (e.g. in-clinic vs external)."
          defaultOpen={defaultOpen.has("colorByColumn") || isConfigured.colorByColumn}
          configured={isConfigured.colorByColumn}
        >
          <ColorByColumnEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Rank Palette"
          caption="Per-bar dark→light gradient. Best for stacked bars."
          defaultOpen={defaultOpen.has("rankPalette") || isConfigured.rankPalette}
          configured={isConfigured.rankPalette}
        >
          <RankPaletteEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        {(chart.type === "kpi" || chart.type === "stat_card") && (
          <Disclose
            title="Stat Card Style"
            caption="Card background, value color, sublabel, value format."
            defaultOpen={defaultOpen.has("statCard") || isConfigured.statCard}
            configured={isConfigured.statCard}
          >
            <StatCardStyleEditor viz={viz} updateViz={updateViz} />
          </Disclose>
        )}
      </div>
    </>
  );
}

// ── New visualization editors ──

type VizUpdater = (updates: Record<string, unknown>) => void;
type Viz = Record<string, unknown>;

function ColorOverridesEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const overrides = (viz.colorOverrides as Record<string, string>) ?? {};
  const entries = Object.entries(overrides);

  function setEntry(idx: number, key: string, value: string) {
    const next: Record<string, string> = {};
    entries.forEach(([k, v], i) => {
      if (i === idx) {
        if (key) next[key] = value;
      } else {
        next[k] = v;
      }
    });
    updateViz({ colorOverrides: Object.keys(next).length ? next : undefined });
  }

  function addEntry() {
    updateViz({ colorOverrides: { ...overrides, "": "#4f46e5" } });
  }

  function removeEntry(idx: number) {
    const next: Record<string, string> = {};
    entries.forEach(([k, v], i) => {
      if (i !== idx) next[k] = v;
    });
    updateViz({ colorOverrides: Object.keys(next).length ? next : undefined });
  }

  return (
    <Field label="Label → Color Overrides">
      <div className="space-y-1.5">
        {entries.map(([key, value], i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={key}
              onChange={(e) => setEntry(i, e.target.value, value)}
              placeholder="Label (e.g. <20)"
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs"
            />
            <input
              type="color"
              value={value}
              onChange={(e) => setEntry(i, key, e.target.value)}
              className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => setEntry(i, key, e.target.value)}
              className="w-20 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono"
            />
            <button
              onClick={() => removeEntry(i)}
              className="text-gray-400 hover:text-red-500 text-sm leading-none"
              type="button"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          onClick={addEntry}
          className="text-xs text-indigo-600 hover:text-indigo-800"
          type="button"
        >
          + Add label override
        </button>
        <p className="text-[11px] text-gray-500">
          Maps a category label (e.g. <code>&lt;20</code>) to a specific hex
          color.
        </p>
      </div>
    </Field>
  );
}

const TOOLTIP_TOKENS = [
  { token: "{name}", description: "The category label / x-value" },
  { token: "{value}", description: "The numeric value" },
  { token: "{pct}", description: "Percent of total (rounded)" },
  { token: "{seriesName}", description: "The metric/series name" },
];

const INSIGHT_TOKENS = [
  { token: "{topLabel}", description: "Top category label" },
  { token: "{topValue}", description: "Top value (formatted)" },
  { token: "{topPct}", description: "Top % of total" },
  { token: "{bottomLabel}", description: "Bottom category label" },
  { token: "{bottomValue}", description: "Bottom value (formatted)" },
  { token: "{total}", description: "Sum of all values" },
  { token: "{count}", description: "Number of categories" },
  { token: "{title}", description: "The chart title" },
];

const SUBLABEL_TOKENS = [
  { token: "{value}", description: "Raw numeric value" },
  { token: "{formatted}", description: "Formatted display value" },
];

function TooltipTemplateEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const value = (viz.tooltipTemplate as string) ?? "";
  return (
    <Field label="Tooltip Template">
      <TokenChips
        value={value}
        onChange={(v) => updateViz({ tooltipTemplate: v || undefined })}
        tokens={TOOLTIP_TOKENS}
        placeholder="{name}: {value} ({pct}%)"
        rows={2}
      />
      {value && (
        <p className="text-[11px] text-gray-600 mt-1">
          Example: <span className="font-mono">{previewTemplate(value, "Cardiology", 1234, 24)}</span>
        </p>
      )}
    </Field>
  );
}

function InsightTemplateEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const value = (viz.insightTemplate as string) ?? "";
  return (
    <Field label="Insight Template (auto-generated text below the chart)">
      <TokenChips
        value={value}
        onChange={(v) =>
          updateViz({
            insightTemplate: v === "" && value !== "" ? "" : v || undefined,
          })
        }
        tokens={INSIGHT_TOKENS}
        placeholder="{topLabel} leads with {topValue} ({topPct}% of total)."
        rows={3}
      />
      <p className="text-[11px] text-gray-500 mt-1">
        Leave empty to use the default sentence; type a single space to suppress
        entirely.
      </p>
    </Field>
  );
}

/** Tiny live-preview of a tooltip template using sample values. */
function previewTemplate(template: string, name: string, value: number, pct: number): string {
  return template
    .replace(/\{name\}/g, name)
    .replace(/\{value\}/g, String(value))
    .replace(/\{pct\}/g, String(pct))
    .replace(/\{seriesName\}/g, name);
}

interface ViewToggleSpec {
  id: string;
  label: string;
  action: { regroup?: string; metric?: string; refilter?: { column: string; value: string } };
  default?: boolean;
}

function ViewTogglesEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const toggles = (viz.toggles as ViewToggleSpec[]) ?? [];

  function update(idx: number, patch: Partial<ViewToggleSpec>) {
    const next = toggles.map((t, i) => (i === idx ? { ...t, ...patch } : t));
    updateViz({ toggles: next });
  }
  function add() {
    updateViz({
      toggles: [
        ...toggles,
        { id: `t${toggles.length + 1}`, label: "View", action: {} },
      ],
    });
  }
  function remove(idx: number) {
    const next = toggles.filter((_, i) => i !== idx);
    updateViz({ toggles: next.length ? next : undefined });
  }

  return (
    <Field label="View Toggles (button group above chart)">
      <div className="space-y-2">
        {toggles.map((t, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={t.id}
                onChange={(e) => update(i, { id: e.target.value })}
                placeholder="id"
                className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <input
                type="text"
                value={t.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="Label (e.g. AGE GROUPS)"
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <label className="flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={!!t.default}
                  onChange={(e) => {
                    const next = toggles.map((tt, ii) => ({
                      ...tt,
                      default: ii === i ? e.target.checked : false,
                    }));
                    updateViz({ toggles: next });
                  }}
                />
                Default
              </label>
              <button
                onClick={() => remove(i)}
                className="text-gray-400 hover:text-red-500 text-sm"
                type="button"
              >
                &times;
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="text"
                value={t.action.regroup ?? ""}
                onChange={(e) =>
                  update(i, { action: { ...t.action, regroup: e.target.value || undefined } })
                }
                placeholder="regroup column"
                className="px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <input
                type="text"
                value={t.action.metric ?? ""}
                onChange={(e) =>
                  update(i, { action: { ...t.action, metric: e.target.value || undefined } })
                }
                placeholder="metric (e.g. count or sum:col)"
                className="px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <input
                type="text"
                value={t.action.refilter?.column ?? ""}
                onChange={(e) =>
                  update(i, {
                    action: {
                      ...t.action,
                      refilter: e.target.value
                        ? { column: e.target.value, value: t.action.refilter?.value ?? "" }
                        : undefined,
                    },
                  })
                }
                placeholder="filter column"
                className="px-2 py-1 border border-gray-200 rounded text-xs"
              />
              <input
                type="text"
                value={t.action.refilter?.value ?? ""}
                onChange={(e) =>
                  update(i, {
                    action: {
                      ...t.action,
                      refilter: t.action.refilter
                        ? { column: t.action.refilter.column, value: e.target.value }
                        : undefined,
                    },
                  })
                }
                placeholder="filter value"
                className="px-2 py-1 border border-gray-200 rounded text-xs"
                disabled={!t.action.refilter}
              />
            </div>
          </div>
        ))}
        <button
          onClick={add}
          className="text-xs text-indigo-600 hover:text-indigo-800"
          type="button"
        >
          + Add toggle
        </button>
      </div>
    </Field>
  );
}

function ColorByColumnEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cbc = (viz.colorByColumn as { column?: string; palettes?: Record<string, string[]> }) ?? {};
  const palettes = cbc.palettes ?? {};
  const entries = Object.entries(palettes);

  function update(column: string | undefined, palettes: Record<string, string[]>) {
    if (!column) {
      updateViz({ colorByColumn: undefined });
      return;
    }
    updateViz({ colorByColumn: { column, palettes } });
  }

  function setKey(idx: number, key: string) {
    const next: Record<string, string[]> = {};
    entries.forEach(([k, v], i) => {
      next[i === idx ? key : k] = v;
    });
    update(cbc.column, next);
  }

  function setPalette(key: string, value: string) {
    const next = { ...palettes, [key]: value.split(",").map((s) => s.trim()).filter(Boolean) };
    update(cbc.column, next);
  }

  function addEntry() {
    update(cbc.column, { ...palettes, "": [] });
  }

  function removeEntry(idx: number) {
    const next: Record<string, string[]> = {};
    entries.forEach(([k, v], i) => {
      if (i !== idx) next[k] = v;
    });
    update(cbc.column, next);
  }

  return (
    <Field label="Color By Column (categorical palette routing)">
      <input
        type="text"
        value={cbc.column ?? ""}
        onChange={(e) => update(e.target.value || undefined, palettes)}
        placeholder="Column name (e.g. is_available_in_clinic)"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2"
      />
      {cbc.column && (
        <>
          <div className="space-y-1.5">
            {entries.map(([key, palette], i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(i, e.target.value)}
                  placeholder="value"
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded text-xs"
                />
                <input
                  type="text"
                  value={palette.join(", ")}
                  onChange={(e) => setPalette(key, e.target.value)}
                  placeholder="#hex, #hex, ..."
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono"
                />
                <button
                  onClick={() => removeEntry(i)}
                  className="text-gray-400 hover:text-red-500 text-sm"
                  type="button"
                >
                  &times;
                </button>
              </div>
            ))}
            <button
              onClick={addEntry}
              className="text-xs text-indigo-600 hover:text-indigo-800"
              type="button"
            >
              + Add value → palette
            </button>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            Routes series colors based on a categorical column. Each value gets its own palette.
          </p>
        </>
      )}
    </Field>
  );
}

function RankPaletteEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const rp = (viz.rankPalette as { gradient?: [string, string]; applyPerGroup?: boolean }) ?? {};
  const gradient = rp.gradient ?? ["#3730A3", "#C7D2FE"];

  function update(patch: Partial<{ gradient: [string, string]; applyPerGroup: boolean }>) {
    if (patch.gradient === undefined && rp.gradient === undefined) {
      // Just toggling on
    }
    updateViz({
      rankPalette: { gradient, applyPerGroup: true, ...rp, ...patch },
    });
  }

  function clear() {
    updateViz({ rankPalette: undefined });
  }

  const enabled = !!rp.gradient;

  return (
    <Field label="Rank Palette (per-bar dark→light)">
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) =>
              e.target.checked
                ? updateViz({ rankPalette: { gradient, applyPerGroup: true } })
                : clear()
            }
          />
          Enable rank palette
        </label>
        {enabled && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600">From</span>
            <input
              type="color"
              value={gradient[0]}
              onChange={(e) => update({ gradient: [e.target.value, gradient[1]] })}
              className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
            />
            <span className="text-[11px] text-gray-600">→ To</span>
            <input
              type="color"
              value={gradient[1]}
              onChange={(e) => update({ gradient: [gradient[0], e.target.value] })}
              className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
            />
          </div>
        )}
        <p className="text-[11px] text-gray-500">
          Sorts segments per bar by value and colors by rank: #1 gets the dark
          color, last gets the light. Best for stacked bars.
        </p>
      </div>
    </Field>
  );
}

function StatCardStyleEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const sc = (viz.statCard as {
    bgColor?: string;
    accentColor?: string;
    sublabelTemplate?: string;
    valueFormat?: string;
  }) ?? {};

  function update(patch: Partial<typeof sc>) {
    const next = { ...sc, ...patch };
    Object.keys(next).forEach((k) => {
      if ((next as Record<string, unknown>)[k] === "") {
        delete (next as Record<string, unknown>)[k];
      }
    });
    updateViz({ statCard: Object.keys(next).length ? next : undefined });
  }

  return (
    <Field label="Stat Card Style">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="w-20 text-[11px] text-gray-600">Background</span>
          <input
            type="color"
            value={sc.bgColor ?? "#FFFFFF"}
            onChange={(e) => update({ bgColor: e.target.value })}
            className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
          />
          <input
            type="text"
            value={sc.bgColor ?? ""}
            onChange={(e) => update({ bgColor: e.target.value })}
            placeholder="#FFFFFF"
            className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-20 text-[11px] text-gray-600">Value color</span>
          <input
            type="color"
            value={sc.accentColor ?? "#4f46e5"}
            onChange={(e) => update({ accentColor: e.target.value })}
            className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
          />
          <input
            type="text"
            value={sc.accentColor ?? ""}
            onChange={(e) => update({ accentColor: e.target.value })}
            placeholder="#4f46e5"
            className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono"
          />
        </div>
        <select
          value={sc.valueFormat ?? "number"}
          onChange={(e) => update({ valueFormat: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="number">Number (auto: 1.2K, 5.03L, 4.22Cr)</option>
          <option value="percent">Percent</option>
          <option value="inr-lakhs">INR Lakhs (always L)</option>
          <option value="inr-crores">INR Crores (always Cr)</option>
          <option value="decimal">Decimal (2 places)</option>
        </select>
        <div>
          <p className="text-[11px] font-medium text-gray-600 mb-1">Sublabel template</p>
          <TokenChips
            value={sc.sublabelTemplate ?? ""}
            onChange={(v) => update({ sublabelTemplate: v })}
            tokens={SUBLABEL_TOKENS}
            placeholder="e.g. {value}% of total"
            rows={1}
          />
        </div>
      </div>
    </Field>
  );
}

// ── Behavior Tab ──

function BehaviorTab({
  chart,
  onChange,
  groupableCols,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
  groupableCols: { key: string; label: string }[];
}) {
  return (
    <>
      <Field label="Link Group">
        <input
          type="text"
          value={chart.linkGroup ?? ""}
          onChange={(e) => onChange({ ...chart, linkGroup: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder='e.g. "main"'
        />
      </Field>

      <Field label="Emit Filter on Click">
        <select
          value={chart.emitFilter?.column ?? ""}
          onChange={(e) =>
            onChange({
              ...chart,
              emitFilter: e.target.value
                ? { column: e.target.value, on: "click" }
                : undefined,
            })
          }
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">None</option>
          {groupableCols.map((col) => (
            <option key={col.key} value={col.key}>
              {col.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Receive Filters From">
        <input
          type="text"
          value={(chart.receiveFilter ?? []).join(", ")}
          onChange={(e) =>
            onChange({
              ...chart,
              receiveFilter: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder="speciality_name, facility_name"
        />
      </Field>
    </>
  );
}

// ── Thresholds Tab ──

function ThresholdsTab({
  chart,
  onChange,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
}) {
  const thresholds = chart.thresholds ?? [];

  function addThreshold() {
    onChange({
      ...chart,
      thresholds: [...thresholds, { max: 0, color: "#ef4444", label: "Low" }],
    });
  }

  function updateThreshold(
    index: number,
    updates: Partial<(typeof thresholds)[0]>
  ) {
    const next = [...thresholds];
    next[index] = { ...next[index], ...updates };
    onChange({ ...chart, thresholds: next });
  }

  function removeThreshold(index: number) {
    onChange({ ...chart, thresholds: thresholds.filter((_, i) => i !== index) });
  }

  return (
    <>
      <p className="text-xs text-gray-500">
        Define conditional formatting rules for KPI values.
      </p>
      {thresholds.map((t, i) => (
        <div key={i} className="p-3 border border-gray-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">
              Rule {i + 1}
            </span>
            <button
              onClick={() => removeThreshold(i)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Max" compact>
              <input
                type="number"
                value={t.max ?? ""}
                onChange={(e) =>
                  updateThreshold(i, {
                    max: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
              />
            </Field>
            <Field label="Color" compact>
              <input
                type="color"
                value={t.color}
                onChange={(e) => updateThreshold(i, { color: e.target.value })}
                className="w-full h-8 rounded border border-gray-200"
              />
            </Field>
            <Field label="Label" compact>
              <input
                type="text"
                value={t.label}
                onChange={(e) => updateThreshold(i, { label: e.target.value })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs"
              />
            </Field>
          </div>
        </div>
      ))}
      <button
        onClick={addThreshold}
        className="text-xs text-indigo-600 hover:text-indigo-800"
      >
        + Add threshold rule
      </button>
    </>
  );
}

// ── Field wrapper ──

function Field({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "space-y-1.5"}>
      <label className={`block font-medium text-gray-700 ${compact ? "text-[10px]" : "text-xs"}`}>
        {label}
      </label>
      {children}
    </div>
  );
}
