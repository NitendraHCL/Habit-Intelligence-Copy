"use client";

import { useState, useMemo, useCallback } from "react";
import {
  getAllDataSourceOptions,
  getGroupableColumns,
  getAggregatableColumns,
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
import InfoHint from "./InfoHint";
import { FIELD_HELP } from "./field-help";
import {
  getPresetsForType,
  getDefaultOpenSections,
} from "./visualization-presets";
import { CHART_USE_CASES } from "./chart-use-cases";
import ChartSuggestor from "./ChartSuggestor";

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
      const res = await fetch(
        `/api/data/query?clientId=${activeClientId}&testMode=1`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataSource: chart.dataSource,
            transform: { ...chart.transform, limit: 5 },
          }),
        }
      );

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
        {chart.type && CHART_USE_CASES[chart.type] && (
          <div className="mt-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5 space-y-1">
            <p className="text-[11.5px] font-semibold text-indigo-900">
              Best use case
            </p>
            <p className="text-[11.5px] text-indigo-800 leading-snug">
              {CHART_USE_CASES[chart.type].bestFor}
            </p>
            <p className="text-[11px] text-indigo-700/80 leading-snug">
              <span className="font-semibold">Example:</span>{" "}
              {CHART_USE_CASES[chart.type].example}
            </p>
            {CHART_USE_CASES[chart.type].tip && (
              <p className="text-[10.5px] text-indigo-600/70 leading-snug">
                <span className="font-semibold">Tip:</span>{" "}
                {CHART_USE_CASES[chart.type].tip}
              </p>
            )}
          </div>
        )}
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
          <>
            <DataTab
              chart={chart}
              onChange={onChange}
              dataSources={dataSources}
              groupableCols={groupableCols}
              aggregatableCols={aggregatableCols}
            />
            <ChartSuggestor
              chart={chart}
              clientId={activeClientId ?? ""}
              onSelectType={(type) =>
                onChange({
                  ...chart,
                  type,
                  visualization: {
                    ...(chart.visualization ?? {}),
                    ...(getPreset(type)?.defaults ?? {}),
                  },
                })
              }
            />
          </>
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

      <Field label="Data Source" infoKey="data.dataSource">
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

      <ComputedColumnsEditor chart={chart} onChange={onChange} />

      <Field label="Metric" infoKey="data.metric">
        <MetricInput
          value={chart.transform?.metric ?? "count"}
          options={metricOptions}
          onChange={(v) =>
            onChange({
              ...chart,
              transform: { ...chart.transform, metric: v },
            })
          }
        />
      </Field>

      {/* Multi-metric builder for charts that need 2+ metrics */}
      <MultiMetricBuilder
        chart={chart}
        onChange={onChange}
        metricOptions={metricOptions}
      />

      <Field label="Sort" infoKey="data.sort">
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
        <Field label="Limit" infoKey="data.limit">
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
        <Field label="Others Label" infoKey="data.groupRest">
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
    <Field label={`Additional Metrics (${chartType} needs ${minMetrics}+)`} infoKey="data.metrics">
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

const PRESET_PALETTES = [
  { label: "Indigo/Teal", colors: ["#4f46e5", "#0d9488", "#a78bfa", "#6366f1", "#14b8a6", "#818cf8"] },
  { label: "Warm", colors: ["#ef4444", "#f59e0b", "#f97316", "#eab308", "#ec4899", "#d946ef"] },
  { label: "Cool", colors: ["#3b82f6", "#06b6d4", "#8b5cf6", "#0ea5e9", "#6366f1", "#14b8a6"] },
  { label: "Earth", colors: ["#92400e", "#78350f", "#854d0e", "#065f46", "#1e3a5f", "#7c2d12"] },
  { label: "Pastel", colors: ["#c4b5fd", "#a5f3fc", "#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0"] },
];

function ColorPaletteEditor({
  colors,
  onChange,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
}) {
  function setColor(idx: number, hex: string) {
    onChange(colors.map((c, i) => (i === idx ? hex : c)));
  }
  function addColor() {
    onChange([...colors, "#4f46e5"]);
  }
  function removeColor(idx: number) {
    onChange(colors.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {/* Preset palette quick-picks */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_PALETTES.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange([...p.colors])}
            title={p.label}
            className="flex items-center gap-px rounded-md border border-gray-200 px-1 py-1 hover:border-indigo-300 transition-colors"
          >
            {p.colors.slice(0, 5).map((c, i) => (
              <span
                key={i}
                className="size-3 rounded-sm"
                style={{ backgroundColor: c }}
              />
            ))}
            <span className="text-[9px] text-gray-500 ml-1">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Per-swatch color pickers */}
      <div className="flex flex-wrap items-center gap-1.5">
        {colors.map((c, i) => (
          <div key={i} className="relative group">
            <input
              type="color"
              value={c}
              onChange={(e) => setColor(i, e.target.value)}
              className="h-8 w-8 rounded-md border border-gray-200 cursor-pointer p-0.5"
              title={c}
            />
            <button
              type="button"
              onClick={() => removeColor(i)}
              className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-gray-200 text-gray-600 text-[9px] leading-none hidden group-hover:flex items-center justify-center hover:bg-red-200 hover:text-red-700"
            >
              &times;
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addColor}
          className="h-8 w-8 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-500 text-sm"
          title="Add color"
        >
          +
        </button>
      </div>

      {/* Comma-separated text input fallback */}
      <input
        type="text"
        value={colors.join(", ")}
        onChange={(e) => {
          const parsed = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(parsed);
        }}
        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-600"
        placeholder="#4f46e5, #0d9488, #f59e0b"
      />
    </div>
  );
}

/**
 * Metric picker with three modes:
 *   - Built-in aggregate from the dropdown
 *   - "formula:" — a textarea for inline SQL-ish arithmetic over aggregates
 *   - "time:"    — time-intelligence prefix (ytd, mtd, qtd, yoy, mom, qoq)
 */
function MetricInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const isFormula = value.startsWith("formula:");
  const tiMatch = value.match(/^(ytd|mtd|qtd|yoy|mom|qoq):(.+)$/);
  const [mode, setMode] = useState<"builtin" | "formula" | "time">(
    isFormula ? "formula" : tiMatch ? "time" : "builtin"
  );

  const [tiFn, setTiFn] = useState<string>(tiMatch?.[1] ?? "ytd");
  const [tiCol, setTiCol] = useState<string>(tiMatch?.[2] ?? "");

  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-1 rounded-lg px-1 py-0.5 bg-gray-100">
        {(["builtin", "formula", "time"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
              mode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-600"
            }`}
          >
            {m === "builtin" ? "Built-in" : m === "formula" ? "Formula" : "Time intel."}
          </button>
        ))}
      </div>
      {mode === "builtin" && (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          {options.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      )}
      {mode === "formula" && (
        <>
          <textarea
            value={isFormula ? value.slice("formula:".length) : ""}
            onChange={(e) => onChange(`formula:${e.target.value}`)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
            placeholder="sum(converted) / sum(total_referrals) * 100"
          />
          <p className="text-[11px] text-gray-500">
            Inline arithmetic over aggregates. Supported: <code>sum(col)</code>{" "}
            <code>avg(col)</code> <code>count(*)</code>{" "}
            <code>count_distinct(col)</code> <code>min(col)</code>{" "}
            <code>max(col)</code>, plus <code>+ - * / ( )</code> and numeric
            constants.
          </p>
        </>
      )}
      {mode === "time" && (
        <>
          <div className="flex items-center gap-2">
            <select
              value={tiFn}
              onChange={(e) => {
                setTiFn(e.target.value);
                if (tiCol) onChange(`${e.target.value}:${tiCol}`);
              }}
              className="px-2 py-1 border border-gray-200 rounded text-xs"
            >
              <option value="ytd">YTD (year-to-date)</option>
              <option value="mtd">MTD (month-to-date)</option>
              <option value="qtd">QTD (quarter-to-date)</option>
              <option value="yoy">YoY (prior-year same period)</option>
              <option value="mom">MoM (prior month)</option>
              <option value="qoq">QoQ (prior quarter)</option>
            </select>
            <input
              type="text"
              value={tiCol}
              onChange={(e) => {
                setTiCol(e.target.value);
                if (e.target.value) onChange(`${tiFn}:${e.target.value}`);
              }}
              placeholder="numeric column (e.g. referral_count)"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
          <p className="text-[11px] text-gray-500">
            Emits SUM(col) restricted to the selected period window using the
            data source&apos;s default date column.
          </p>
        </>
      )}
    </div>
  );
}

function ComputedColumnsEditor({
  chart,
  onChange,
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
}) {
  type CC = { as: string; column: string; cases: { when: string | number; then: string }[]; else?: string };
  const computed: CC[] = (chart.transform?.computed as CC[]) ?? [];

  function update(next: CC[] | undefined) {
    onChange({
      ...chart,
      transform: { ...chart.transform, computed: next?.length ? next : undefined },
    });
  }

  function add() {
    update([
      ...computed,
      { as: `derived_${computed.length + 1}`, column: "", cases: [{ when: "", then: "" }] },
    ]);
  }

  function setRow(idx: number, patch: Partial<CC>) {
    update(computed.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function setCase(idx: number, caseIdx: number, patch: Partial<{ when: string | number; then: string }>) {
    update(
      computed.map((c, i) => {
        if (i !== idx) return c;
        const nextCases = c.cases.map((cc, j) => (j === caseIdx ? { ...cc, ...patch } : cc));
        return { ...c, cases: nextCases };
      })
    );
  }

  function addCase(idx: number) {
    update(computed.map((c, i) => (i === idx ? { ...c, cases: [...c.cases, { when: "", then: "" }] } : c)));
  }

  function removeCase(idx: number, caseIdx: number) {
    update(
      computed.map((c, i) =>
        i === idx ? { ...c, cases: c.cases.filter((_, j) => j !== caseIdx) } : c
      )
    );
  }

  function remove(idx: number) {
    update(computed.filter((_, i) => i !== idx));
  }

  if (computed.length === 0) {
    return (
      <Field label="Computed Columns (CASE WHEN)" infoKey="data.computed">
        <button
          type="button"
          onClick={add}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add a derived column (e.g. month → season)
        </button>
        <p className="text-[11px] text-gray-500 mt-1">
          Map values of a column to derived labels. Then select the derived
          name in Group By above.
        </p>
      </Field>
    );
  }

  return (
    <Field label="Computed Columns (CASE WHEN)" infoKey="data.computed">
      <div className="space-y-2 min-w-0">
        {computed.map((c, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1.5 min-w-0">
            <div className="flex items-start gap-2 min-w-0">
              <div className="flex-1 min-w-0 space-y-1">
                <input
                  type="text"
                  value={c.as}
                  onChange={(e) => setRow(i, { as: e.target.value })}
                  placeholder="Derived name (e.g. season)"
                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                />
                <input
                  type="text"
                  value={c.column}
                  onChange={(e) => setRow(i, { column: e.target.value })}
                  placeholder="Source column (e.g. month_num)"
                  className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-gray-400 hover:text-red-500 text-sm shrink-0 mt-1"
              >
                &times;
              </button>
            </div>
            {c.cases.map((cc, j) => (
              <div key={j} className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] text-gray-500 shrink-0 w-9">when</span>
                <input
                  type="text"
                  value={String(cc.when)}
                  onChange={(e) =>
                    setCase(i, j, {
                      when: isNaN(Number(e.target.value))
                        ? e.target.value
                        : Number(e.target.value),
                    })
                  }
                  placeholder="value"
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs"
                />
                <span className="text-[11px] text-gray-500 shrink-0 w-7">then</span>
                <input
                  type="text"
                  value={cc.then}
                  onChange={(e) => setCase(i, j, { then: e.target.value })}
                  placeholder="label"
                  className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeCase(i, j)}
                  className="text-gray-400 hover:text-red-500 text-sm shrink-0"
                >
                  &times;
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] text-gray-500 shrink-0 w-9">else</span>
              <input
                type="text"
                value={c.else ?? ""}
                onChange={(e) => setRow(i, { else: e.target.value || undefined })}
                placeholder="default (optional)"
                className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => addCase(i)}
              className="text-[11px] text-indigo-600 hover:text-indigo-800"
            >
              + Add case
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          + Add another derived column
        </button>
      </div>
    </Field>
  );
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
      <Field label="Group By" infoKey="data.groupBy">{renderSelect(0)}</Field>
      {groupBys[0] && (
        <Field label="Secondary Group By (sunburst ring 2 / heatmap Y)" infoKey="data.groupBy.secondary">
          {renderSelect(1)}
        </Field>
      )}
      {groupBys[0] && groupBys[1] && (
        <Field label="Tertiary Group By (sunburst ring 3)" infoKey="data.groupBy.tertiary">
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
    <Field label="Filters (WHERE)" infoKey="data.where">
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
    tabsFromColumn: !!(viz.tabsFromColumn as { column?: string } | undefined)?.column,
    colorByValueRange: !!viz.colorByValueRange,
    background: !!(viz.background as { column?: string } | undefined)?.column,
    valueSlider: !!(viz.valueSlider as { enabled?: boolean } | undefined)?.enabled,
    seriesStyles: !!viz.seriesStyles && Object.keys(viz.seriesStyles as object).length > 0,
    visualMap: !!viz.visualMap,
    topInsightTemplate: !!viz.topInsightTemplate,
    columnConfig: !!viz.columnConfig && Object.keys(viz.columnConfig as object).length > 0,
    summaryKpis: Array.isArray(viz.summaryKpis) && (viz.summaryKpis as unknown[]).length > 0,
    tileGrid: !!viz.tileGrid,
    narrativeTemplate: !!viz.narrativeTemplate,
    drillDown: !!(viz.drillDown as { levels?: string[] } | undefined)?.levels?.length,
    drillThrough: !!(viz.drillThrough as { slug?: string } | undefined)?.slug,
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
      <Field label="Height (px)" infoKey="style.height">
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
          <span>Show Legend</span>
          <InfoHint help={FIELD_HELP["style.checkbox.showLegend"]} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.showGrid !== false}
            onChange={(e) => updateViz({ showGrid: e.target.checked })}
            className="rounded border-gray-300"
          />
          <span>Show Grid</span>
          <InfoHint help={FIELD_HELP["style.checkbox.showGrid"]} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.showLabels !== false}
            onChange={(e) => updateViz({ showLabels: e.target.checked })}
            className="rounded border-gray-300"
          />
          <span>Show Labels</span>
          <InfoHint help={FIELD_HELP["style.checkbox.showLabels"]} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={viz.stacked === true}
            onChange={(e) => updateViz({ stacked: e.target.checked })}
            className="rounded border-gray-300"
          />
          <span>Stacked</span>
          <InfoHint help={FIELD_HELP["style.checkbox.stacked"]} />
        </label>
      </div>

      <Field label="Orientation" infoKey="style.orientation">
        <select
          value={(viz.orientation as string) ?? "vertical"}
          onChange={(e) => updateViz({ orientation: e.target.value })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
      </Field>

      <Field label="Value Format" infoKey="style.format">
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

      <Field label="Colors" infoKey="style.colors">
        <ColorPaletteEditor
          colors={Array.isArray(viz.colors) ? (viz.colors as string[]) : []}
          onChange={(colors) =>
            updateViz({ colors: colors.length > 0 ? colors : "default" })
          }
        />
      </Field>

      {/* Advanced — collapsed by default; chart-type-aware default-open */}
      <div className="space-y-2 pt-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Advanced
        </p>

        <Disclose
          title="Label → Color Overrides"
          infoKey="style.colorOverrides"
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
          infoKey="style.tooltipTemplate"
          caption="Customize the hover popup text. Click a chip to insert a token."
          defaultOpen={defaultOpen.has("tooltipTemplate") || isConfigured.tooltipTemplate}
          configured={isConfigured.tooltipTemplate}
        >
          <TooltipTemplateEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Insight Template"
          infoKey="style.insightTemplate"
          caption="Auto-generated text below the chart. Leave blank for default."
          defaultOpen={defaultOpen.has("insightTemplate") || isConfigured.insightTemplate}
          configured={isConfigured.insightTemplate}
        >
          <InsightTemplateEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="View Toggles"
          infoKey="style.toggles"
          caption="Button group above the chart that swaps groupBy / metric / filter."
          defaultOpen={defaultOpen.has("toggles") || isConfigured.toggles}
          configured={isConfigured.toggles}
        >
          <ViewTogglesEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Color By Column"
          infoKey="style.colorByColumn"
          caption="Route palette by a categorical column (e.g. in-clinic vs external)."
          defaultOpen={defaultOpen.has("colorByColumn") || isConfigured.colorByColumn}
          configured={isConfigured.colorByColumn}
        >
          <ColorByColumnEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Rank Palette"
          infoKey="style.rankPalette"
          caption="Per-bar dark→light gradient. Best for stacked bars."
          defaultOpen={defaultOpen.has("rankPalette") || isConfigured.rankPalette}
          configured={isConfigured.rankPalette}
        >
          <RankPaletteEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        {(chart.type === "kpi" || chart.type === "stat_card") && (
          <Disclose
            title="Stat Card Style"
            infoKey="style.statCard"
            caption="Card background, value color, sublabel, value format."
            defaultOpen={defaultOpen.has("statCard") || isConfigured.statCard}
            configured={isConfigured.statCard}
          >
            <StatCardStyleEditor viz={viz} updateViz={updateViz} />
          </Disclose>
        )}

        <Disclose
          title="Auto Tabs (from column)"
          infoKey="style.tabsFromColumn"
          caption="Generate one tab per distinct value of a column. Click a tab to refilter the chart."
          defaultOpen={isConfigured.tabsFromColumn}
          configured={isConfigured.tabsFromColumn}
        >
          <TabsFromColumnEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Color By Value Range (numeric buckets)"
          infoKey="style.colorByValueRange"
          caption="Color cells/segments by binning a metric into ranges (e.g. % female: <40 / 40-60 / >60)."
          defaultOpen={isConfigured.colorByValueRange}
          configured={isConfigured.colorByValueRange}
        >
          <ColorByValueRangeEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Background Overlay"
          infoKey="style.background"
          caption="Faint horizontal bars behind a bubble chart (e.g. capacity per location)."
          defaultOpen={isConfigured.background}
          configured={isConfigured.background}
        >
          <BackgroundEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Value Range Slider"
          infoKey="style.valueSlider"
          caption="Adds a dual-handle slider above the chart to hide cells outside the range."
          defaultOpen={isConfigured.valueSlider}
          configured={isConfigured.valueSlider}
        >
          <ValueSliderEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Per-Series Styles"
          infoKey="style.seriesStyles"
          caption="Per-metric overrides: line/area/bar type, dashed stroke, filled area."
          defaultOpen={isConfigured.seriesStyles}
          configured={isConfigured.seriesStyles}
        >
          <SeriesStylesEditor viz={viz} updateViz={updateViz} chart={chart} />
        </Disclose>

        <Disclose
          title="VisualMap (heatmap color scale)"
          infoKey="style.visualMap"
          caption="Min/max colors, position, and an optional marker label."
          defaultOpen={isConfigured.visualMap}
          configured={isConfigured.visualMap}
        >
          <VisualMapEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Top Insight Slot"
          infoKey="style.topInsightTemplate"
          caption="Auto-generated text rendered ABOVE the chart body. Same tokens as the bottom insight."
          defaultOpen={isConfigured.topInsightTemplate}
          configured={isConfigured.topInsightTemplate}
        >
          <TopInsightTemplateEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Sub-KPI Strip"
          infoKey="style.summaryKpis"
          caption="Stat boxes rendered below the chart inside the same card."
          defaultOpen={isConfigured.summaryKpis}
          configured={isConfigured.summaryKpis}
        >
          <SummaryKpisEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        {(chart.type === "data_table" || chart.type === "metric_table") && (
          <Disclose
            title="Column Cell Renderers"
            infoKey="style.columnConfig"
            caption="Per-column badges, progress bars, and threshold pills."
            defaultOpen={isConfigured.columnConfig}
            configured={isConfigured.columnConfig}
          >
            <ColumnConfigEditor viz={viz} updateViz={updateViz} chart={chart} />
          </Disclose>
        )}

        {chart.type === "tile_grid" && (
          <Disclose
            title="Tile Grid Layout"
            infoKey="style.tileGrid"
            caption="Columns, color column/map, sublabel template, caption column."
            defaultOpen
            configured={isConfigured.tileGrid}
          >
            <TileGridEditor viz={viz} updateViz={updateViz} />
          </Disclose>
        )}

        {chart.type === "narrative" && (
          <Disclose
            title="Narrative Template"
            infoKey="style.narrative"
            caption="Markdown-ish prose with token interpolation."
            defaultOpen
            configured={isConfigured.narrativeTemplate}
          >
            <NarrativeTemplateEditor viz={viz} updateViz={updateViz} />
          </Disclose>
        )}

        <Disclose
          title="Drill-down Hierarchy"
          infoKey="style.drillDown"
          caption="Ordered columns; click a segment to advance to the next level (with back button)."
          defaultOpen={isConfigured.drillDown}
          configured={isConfigured.drillDown}
        >
          <DrillDownEditor viz={viz} updateViz={updateViz} />
        </Disclose>

        <Disclose
          title="Drill-through Page"
          infoKey="style.drillThrough"
          caption="Click a value to route to another page, passing the value as a URL param."
          defaultOpen={isConfigured.drillThrough}
          configured={isConfigured.drillThrough}
        >
          <DrillThroughEditor viz={viz} updateViz={updateViz} />
        </Disclose>
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
    <Field label="Label → Color Overrides" infoKey="style.colorOverrides">
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
    <Field label="Tooltip Template" infoKey="style.tooltipTemplate">
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
    <Field label="Insight Template (auto-generated text below the chart)" infoKey="style.insightTemplate">
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
    <Field label="View Toggles (button group above chart)" infoKey="style.toggles">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">Layout:</span>
          <select
            value={(viz.toggleLayout as string) ?? "buttons"}
            onChange={(e) => updateViz({ toggleLayout: e.target.value })}
            className="px-2 py-1 border border-gray-200 rounded text-xs"
          >
            <option value="buttons">Buttons</option>
            <option value="dropdown">Dropdown</option>
          </select>
        </div>
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
    <Field label="Color By Column (categorical palette routing)" infoKey="style.colorByColumn">
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
    <Field label="Rank Palette (per-bar dark→light)" infoKey="style.rankPalette">
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
    <Field label="Stat Card Style" infoKey="style.statCard">
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

function TabsFromColumnEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.tabsFromColumn as { column?: string; showAll?: boolean; limit?: number; allLabel?: string }) ?? {};
  function update(patch: Partial<typeof cfg>) {
    const next = { ...cfg, ...patch };
    if (!next.column) {
      updateViz({ tabsFromColumn: undefined });
      return;
    }
    updateViz({ tabsFromColumn: next });
  }
  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={cfg.column ?? ""}
        onChange={(e) => update({ column: e.target.value })}
        placeholder="Column (e.g. speciality_referred_to)"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
      />
      {cfg.column && (
        <>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={cfg.showAll !== false}
                onChange={(e) => update({ showAll: e.target.checked })}
              />
              Show &quot;All&quot; tab
            </label>
            <input
              type="text"
              value={cfg.allLabel ?? ""}
              onChange={(e) => update({ allLabel: e.target.value || undefined })}
              placeholder="All-tab label"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600">Max tabs:</span>
            <input
              type="number"
              value={cfg.limit ?? 12}
              min={2}
              max={50}
              onChange={(e) => update({ limit: Number(e.target.value) })}
              className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
            />
          </div>
        </>
      )}
    </div>
  );
}

function ColorByValueRangeEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.colorByValueRange as { source?: "value" | "pct"; buckets?: { from?: number; to?: number; color: string; label?: string }[] }) ?? {};
  const buckets = cfg.buckets ?? [];

  function update(patch: { source?: "value" | "pct"; buckets?: typeof buckets }) {
    const next = { source: cfg.source ?? "value", buckets: buckets, ...patch };
    if (next.buckets.length === 0) {
      updateViz({ colorByValueRange: undefined });
      return;
    }
    updateViz({ colorByValueRange: next });
  }

  function setBucket(idx: number, patch: Partial<typeof buckets[0]>) {
    update({ buckets: buckets.map((b, i) => (i === idx ? { ...b, ...patch } : b)) });
  }

  function addBucket() {
    update({ buckets: [...buckets, { from: 0, to: 100, color: "#4f46e5" }] });
  }

  function removeBucket(idx: number) {
    update({ buckets: buckets.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600">Source:</span>
        <select
          value={cfg.source ?? "value"}
          onChange={(e) => update({ source: e.target.value as "value" | "pct" })}
          className="px-2 py-1 border border-gray-200 rounded text-xs"
        >
          <option value="value">Raw value</option>
          <option value="pct">% of row total</option>
        </select>
      </div>
      {buckets.map((b, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="number"
            value={b.from ?? ""}
            onChange={(e) => setBucket(i, { from: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="from"
            className="w-16 px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <span className="text-[11px] text-gray-500">→</span>
          <input
            type="number"
            value={b.to ?? ""}
            onChange={(e) => setBucket(i, { to: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="to"
            className="w-16 px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <input
            type="color"
            value={b.color}
            onChange={(e) => setBucket(i, { color: e.target.value })}
            className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
          />
          <input
            type="text"
            value={b.label ?? ""}
            onChange={(e) => setBucket(i, { label: e.target.value || undefined })}
            placeholder="label"
            className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <button
            type="button"
            onClick={() => removeBucket(i)}
            className="text-gray-400 hover:text-red-500 text-sm"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addBucket}
        className="text-xs text-indigo-600 hover:text-indigo-800"
      >
        + Add bucket
      </button>
      <p className="text-[11px] text-gray-500">
        Leave <code>from</code> blank for &quot;lowest open&quot; or <code>to</code> blank
        for &quot;highest open&quot;.
      </p>
    </div>
  );
}

function BackgroundEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.background as { type?: string; column?: string; color?: string; opacity?: number }) ?? {};
  function update(patch: Partial<typeof cfg>) {
    const next = { type: "horizontal_bar", ...cfg, ...patch };
    if (!next.column) {
      updateViz({ background: undefined });
      return;
    }
    updateViz({ background: next });
  }
  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={cfg.column ?? ""}
        onChange={(e) => update({ column: e.target.value })}
        placeholder="Column whose value drives bar width"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
      />
      {cfg.column && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">Color</span>
          <input
            type="color"
            value={cfg.color ?? "#E0E7FF"}
            onChange={(e) => update({ color: e.target.value })}
            className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
          />
          <span className="text-[11px] text-gray-600">Opacity</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={cfg.opacity ?? 0.35}
            onChange={(e) => update({ opacity: Number(e.target.value) })}
            className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
          />
        </div>
      )}
    </div>
  );
}

function ValueSliderEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.valueSlider as { enabled?: boolean; min?: number; max?: number }) ?? {};
  function update(patch: Partial<typeof cfg>) {
    const next = { ...cfg, ...patch };
    updateViz({ valueSlider: next.enabled ? next : undefined });
  }
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!cfg.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        Enable value-range slider
      </label>
      {cfg.enabled && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">Min</span>
          <input
            type="number"
            value={cfg.min ?? ""}
            onChange={(e) => update({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="auto"
            className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <span className="text-[11px] text-gray-600">Max</span>
          <input
            type="number"
            value={cfg.max ?? ""}
            onChange={(e) => update({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
            placeholder="auto"
            className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
          />
        </div>
      )}
    </div>
  );
}

function SeriesStylesEditor({
  viz,
  updateViz,
  chart,
}: {
  viz: Viz;
  updateViz: VizUpdater;
  chart: Partial<ChartDefinition>;
}) {
  const cfg = (viz.seriesStyles as Record<string, { type?: string; dashed?: boolean; filled?: boolean; color?: string }>) ?? {};
  const metricKeys = chart.transform?.metrics?.length
    ? chart.transform.metrics.map((m) => ({ key: m.key, label: m.label }))
    : [{ key: "value", label: chart.title ?? "value" }];

  function update(key: string, patch: Partial<{ type: string; dashed: boolean; filled: boolean; color: string }>) {
    const next = { ...cfg, [key]: { ...cfg[key], ...patch } };
    // Drop empty entries
    Object.keys(next).forEach((k) => {
      const e = next[k];
      if (!e.type && !e.dashed && !e.filled && !e.color) delete next[k];
    });
    updateViz({ seriesStyles: Object.keys(next).length ? next : undefined });
  }

  return (
    <div className="space-y-2">
      {metricKeys.map((m) => {
        const s = cfg[m.key] ?? {};
        return (
          <div
            key={m.key}
            className="border border-gray-200 rounded-lg p-2 space-y-1.5"
          >
            <p className="text-[11px] font-semibold text-gray-700">{m.label}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={s.type ?? ""}
                onChange={(e) => update(m.key, { type: e.target.value || undefined })}
                className="px-2 py-1 border border-gray-200 rounded text-xs"
              >
                <option value="">Default</option>
                <option value="line">Line</option>
                <option value="area">Area</option>
                <option value="bar">Bar</option>
              </select>
              <label className="flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={!!s.dashed}
                  onChange={(e) => update(m.key, { dashed: e.target.checked || undefined })}
                />
                Dashed
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                <input
                  type="checkbox"
                  checked={!!s.filled}
                  onChange={(e) => update(m.key, { filled: e.target.checked || undefined })}
                />
                Filled
              </label>
              <input
                type="color"
                value={s.color ?? "#4f46e5"}
                onChange={(e) => update(m.key, { color: e.target.value })}
                className="h-6 w-8 border border-gray-200 rounded cursor-pointer"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VisualMapEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.visualMap as { min?: number; max?: number; minColor?: string; maxColor?: string; position?: string; markerValue?: number; markerLabel?: string }) ?? {};
  function update(patch: Partial<typeof cfg>) {
    const next = { ...cfg, ...patch };
    Object.keys(next).forEach((k) => {
      const v = (next as Record<string, unknown>)[k];
      if (v === "" || v === undefined) delete (next as Record<string, unknown>)[k];
    });
    updateViz({ visualMap: Object.keys(next).length ? next : undefined });
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600 w-16">Min color</span>
        <input
          type="color"
          value={cfg.minColor ?? "#f3e8ff"}
          onChange={(e) => update({ minColor: e.target.value })}
          className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
        />
        <span className="text-[11px] text-gray-600 w-16">Max color</span>
        <input
          type="color"
          value={cfg.maxColor ?? "#7C3AED"}
          onChange={(e) => update({ maxColor: e.target.value })}
          className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600 w-16">Min</span>
        <input
          type="number"
          value={cfg.min ?? ""}
          onChange={(e) => update({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="auto"
          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
        />
        <span className="text-[11px] text-gray-600 w-16">Max</span>
        <input
          type="number"
          value={cfg.max ?? ""}
          onChange={(e) => update({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="auto"
          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600 w-16">Position</span>
        <select
          value={cfg.position ?? "bottom"}
          onChange={(e) => update({ position: e.target.value })}
          className="px-2 py-1 border border-gray-200 rounded text-xs"
        >
          <option value="bottom">Bottom</option>
          <option value="top">Top</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600 w-16">Marker</span>
        <input
          type="number"
          value={cfg.markerValue ?? ""}
          onChange={(e) => update({ markerValue: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="value"
          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
        />
        <input
          type="text"
          value={cfg.markerLabel ?? ""}
          onChange={(e) => update({ markerLabel: e.target.value || undefined })}
          placeholder="label (e.g. Peak)"
          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
    </div>
  );
}

function TopInsightTemplateEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const value = (viz.topInsightTemplate as string) ?? "";
  return (
    <Field label="Top Insight Template (rendered above the chart)" infoKey="style.topInsightTemplate">
      <TokenChips
        value={value}
        onChange={(v) => updateViz({ topInsightTemplate: v || undefined })}
        tokens={INSIGHT_TOKENS}
        placeholder="Viewing {topLabel} — {topValue} ({topPct}%)"
        rows={2}
      />
    </Field>
  );
}

function SummaryKpisEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const kpis = (viz.summaryKpis as { label: string; expr: string; color?: string; bgColor?: string; sublabel?: string }[]) ?? [];
  function update(idx: number, patch: Partial<typeof kpis[0]>) {
    const next = kpis.map((k, i) => (i === idx ? { ...k, ...patch } : k));
    updateViz({ summaryKpis: next });
  }
  function add() {
    updateViz({ summaryKpis: [...kpis, { label: "", expr: "sum:value", color: "#4f46e5", bgColor: "#EEF2FF" }] });
  }
  function remove(idx: number) {
    const next = kpis.filter((_, i) => i !== idx);
    updateViz({ summaryKpis: next.length ? next : undefined });
  }
  return (
    <div className="space-y-2">
      {kpis.map((k, i) => (
        <div key={i} className="border border-gray-200 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={k.label}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Label (e.g. Top Age Group)"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
            />
            <button
              onClick={() => remove(i)}
              className="text-gray-400 hover:text-red-500 text-sm"
              type="button"
            >
              &times;
            </button>
          </div>
          <input
            type="text"
            value={k.expr}
            onChange={(e) => update(i, { expr: e.target.value })}
            placeholder='Expression: "sum:col" / "avg:col" / "count" / "first.col"'
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono"
          />
          <input
            type="text"
            value={k.sublabel ?? ""}
            onChange={(e) => update(i, { sublabel: e.target.value || undefined })}
            placeholder="Sublabel (optional)"
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600">Value</span>
            <input
              type="color"
              value={k.color ?? "#4f46e5"}
              onChange={(e) => update(i, { color: e.target.value })}
              className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
            />
            <span className="text-[11px] text-gray-600">Bg</span>
            <input
              type="color"
              value={k.bgColor ?? "#EEF2FF"}
              onChange={(e) => update(i, { bgColor: e.target.value })}
              className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-indigo-600 hover:text-indigo-800"
      >
        + Add KPI
      </button>
    </div>
  );
}

function ColumnConfigEditor({ viz, updateViz, chart }: { viz: Viz; updateViz: VizUpdater; chart: Partial<ChartDefinition> }) {
  const cfg = (viz.columnConfig as Record<string, { renderer: string; colorMap?: Record<string, string>; thresholds?: { from?: number; to?: number; color: string }[]; max?: number; format?: string; label?: string }>) ?? {};
  const cols = chart.transform?.metrics?.length
    ? chart.transform.metrics.map((m) => m.key)
    : [];
  if (chart.transform?.groupBy) {
    const gb = Array.isArray(chart.transform.groupBy) ? chart.transform.groupBy : [chart.transform.groupBy];
    cols.push(...gb);
  }
  const allCols = Array.from(new Set(cols));

  function update(col: string, patch: Partial<{ renderer: string; format: string; label: string }>) {
    const existing = cfg[col] ?? { renderer: "text" };
    const next = { ...cfg, [col]: { ...existing, ...patch } };
    updateViz({ columnConfig: next });
  }

  return (
    <div className="space-y-1.5">
      {allCols.length === 0 && (
        <p className="text-[11px] text-gray-500">Set Group By + Metric on the Data tab first.</p>
      )}
      {allCols.map((col) => {
        const c = cfg[col] ?? { renderer: "text" };
        return (
          <div key={col} className="border border-gray-200 rounded-lg p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-700">{col}</p>
            <div className="flex items-center gap-2">
              <select
                value={c.renderer}
                onChange={(e) => update(col, { renderer: e.target.value })}
                className="px-2 py-1 border border-gray-200 rounded text-xs"
              >
                <option value="text">Text</option>
                <option value="badge">Badge (categorical)</option>
                <option value="pill">Pill (numeric)</option>
                <option value="threshold_pill">Threshold Pill</option>
                <option value="progress_bar">Progress Bar</option>
              </select>
              {(c.renderer === "pill" || c.renderer === "threshold_pill" || c.renderer === "progress_bar") && (
                <select
                  value={c.format ?? ""}
                  onChange={(e) => update(col, { format: e.target.value })}
                  className="px-2 py-1 border border-gray-200 rounded text-xs"
                >
                  <option value="">Number</option>
                  <option value="percent">Percent</option>
                  <option value="inr-lakhs">INR Lakhs</option>
                  <option value="inr-crores">INR Crores</option>
                </select>
              )}
              <input
                type="text"
                value={c.label ?? ""}
                onChange={(e) => update(col, { label: e.target.value })}
                placeholder="Header label"
                className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TileGridEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.tileGrid as { columns?: number; colorColumn?: string; colorMap?: Record<string, string>; sublabelTemplate?: string; captionColumn?: string }) ?? {};
  function update(patch: Partial<typeof cfg>) {
    updateViz({ tileGrid: { ...cfg, ...patch } });
  }
  const colorEntries = Object.entries(cfg.colorMap ?? {});
  function setMapEntry(idx: number, key: string, value: string) {
    const next: Record<string, string> = {};
    colorEntries.forEach(([k, v], i) => {
      next[i === idx ? key : k] = i === idx ? value : v;
    });
    update({ colorMap: next });
  }
  function addMapEntry() {
    update({ colorMap: { ...(cfg.colorMap ?? {}), "": "#E0E7FF" } });
  }
  function removeMapEntry(idx: number) {
    const next: Record<string, string> = {};
    colorEntries.forEach(([k, v], i) => {
      if (i !== idx) next[k] = v;
    });
    update({ colorMap: next });
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-600 w-20">Columns</span>
        <input
          type="number"
          min={2}
          max={12}
          value={cfg.columns ?? 4}
          onChange={(e) => update({ columns: Number(e.target.value) })}
          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs"
        />
      </div>
      <input
        type="text"
        value={cfg.captionColumn ?? ""}
        onChange={(e) => update({ captionColumn: e.target.value || undefined })}
        placeholder="Caption column (e.g. season)"
        className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
      />
      <input
        type="text"
        value={cfg.colorColumn ?? ""}
        onChange={(e) => update({ colorColumn: e.target.value || undefined })}
        placeholder="Color column (defaults to caption)"
        className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
      />
      <input
        type="text"
        value={cfg.sublabelTemplate ?? ""}
        onChange={(e) => update({ sublabelTemplate: e.target.value || undefined })}
        placeholder="Sublabel template e.g. {value} cases"
        className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
      />
      <div className="space-y-1">
        <p className="text-[11px] text-gray-600">Color map (caption → color)</p>
        {colorEntries.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={k}
              onChange={(e) => setMapEntry(i, e.target.value, v)}
              placeholder="value"
              className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
            />
            <input
              type="color"
              value={v}
              onChange={(e) => setMapEntry(i, k, e.target.value)}
              className="h-7 w-10 border border-gray-200 rounded cursor-pointer"
            />
            <button onClick={() => removeMapEntry(i)} type="button" className="text-gray-400 hover:text-red-500 text-sm">&times;</button>
          </div>
        ))}
        <button type="button" onClick={addMapEntry} className="text-xs text-indigo-600 hover:text-indigo-800">
          + Add color
        </button>
      </div>
    </div>
  );
}

function DrillDownEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.drillDown as { levels?: string[]; labels?: string[] }) ?? {};
  const levels = cfg.levels ?? [];
  const labels = cfg.labels ?? [];
  function update(nextLevels: string[], nextLabels?: string[]) {
    if (!nextLevels.length) {
      updateViz({ drillDown: undefined });
      return;
    }
    updateViz({ drillDown: { levels: nextLevels, labels: nextLabels } });
  }
  function setLevel(idx: number, col: string) {
    const next = levels.map((l, i) => (i === idx ? col : l));
    update(next.filter(Boolean), labels);
  }
  function add() {
    update([...levels, ""], labels);
  }
  function remove(idx: number) {
    update(levels.filter((_, i) => i !== idx), labels);
  }
  return (
    <div className="space-y-1.5">
      {levels.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 w-12">Level {i + 1}</span>
          <input
            type="text"
            value={l}
            onChange={(e) => setLevel(i, e.target.value)}
            placeholder="column (e.g. year, then month, then day)"
            className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-gray-400 hover:text-red-500 text-sm"
          >
            &times;
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-indigo-600 hover:text-indigo-800"
      >
        + Add drill level
      </button>
    </div>
  );
}

function DrillThroughEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const cfg = (viz.drillThrough as { slug?: string; paramColumn?: string; valueColumn?: string }) ?? {};
  function update(patch: Partial<typeof cfg>) {
    const next = { ...cfg, ...patch };
    if (!next.slug) {
      updateViz({ drillThrough: undefined });
      return;
    }
    updateViz({ drillThrough: next });
  }
  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={cfg.slug ?? ""}
        onChange={(e) => update({ slug: e.target.value || undefined })}
        placeholder="Target page slug (e.g. /portal/ohc/referral)"
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
      />
      {cfg.slug && (
        <>
          <input
            type="text"
            value={cfg.paramColumn ?? ""}
            onChange={(e) => update({ paramColumn: e.target.value })}
            placeholder="URL param name (e.g. facility_name)"
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
          />
          <input
            type="text"
            value={cfg.valueColumn ?? ""}
            onChange={(e) => update({ valueColumn: e.target.value || undefined })}
            placeholder="Value column (defaults to groupBy)"
            className="w-full px-2 py-1 border border-gray-200 rounded text-xs"
          />
        </>
      )}
    </div>
  );
}

function NarrativeTemplateEditor({ viz, updateViz }: { viz: Viz; updateViz: VizUpdater }) {
  const value = (viz.narrativeTemplate as string) ?? "";
  return (
    <Field label="Narrative Markdown / Template" infoKey="style.narrative">
      <textarea
        value={value}
        onChange={(e) => updateViz({ narrativeTemplate: e.target.value || undefined })}
        rows={6}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        placeholder={`Compare engagement patterns and visit frequencies across repeat patient cohorts.\n\nLong-tenured patients show {sum_total_consults} total consults...`}
      />
      <p className="text-[11px] text-gray-500 mt-1">
        Tokens: column names from the first row, plus
        {" "}<code>{`{sum_<col>}`}</code>{" "}
        <code>{`{avg_<col>}`}</code>{" "}
        <code>{`{row_count}`}</code>. Double newline = paragraph break.
      </p>
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
      <Field label="Link Group" infoKey="behavior.linkGroup">
        <input
          type="text"
          value={chart.linkGroup ?? ""}
          onChange={(e) => onChange({ ...chart, linkGroup: e.target.value || undefined })}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          placeholder='e.g. "main"'
        />
      </Field>

      <Field label="Emit Filter on Click" infoKey="behavior.emitFilter">
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

      <Field label="Receive Filters From" infoKey="behavior.receiveFilter">
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
            <Field label="Max" compact infoKey="thresholds.max">
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
            <Field label="Color" compact infoKey="thresholds.color">
              <input
                type="color"
                value={t.color}
                onChange={(e) => updateThreshold(i, { color: e.target.value })}
                className="w-full h-8 rounded border border-gray-200"
              />
            </Field>
            <Field label="Label" compact infoKey="thresholds.label">
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
  infoKey,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
  /** Key into FIELD_HELP — when provided, renders an (i) icon with detail popover. */
  infoKey?: string;
}) {
  const help = infoKey ? FIELD_HELP[infoKey] : undefined;
  return (
    <div className={compact ? "" : "space-y-1.5"}>
      <label
        className={`flex items-center gap-1.5 font-medium text-gray-700 ${
          compact ? "text-[10px]" : "text-xs"
        }`}
      >
        <span>{label}</span>
        {help && <InfoHint help={help} />}
      </label>
      {children}
    </div>
  );
}
