"use client";

import { useState, useMemo, useCallback } from "react";
import {
  getAllDataSourceOptions,
  getGroupableColumns,
  getAggregatableColumns,
  getFilterableColumns,
  getDataSource,
} from "@/lib/config/data-sources";
import type { ChartDefinition, ChartTypeId, WhereCondition } from "@/lib/dashboard/types";
import { getPreset } from "@/lib/config/chart-presets";
import { useAuth } from "@/lib/contexts/auth-context";

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

    return errors;
  }, [chart.title, table, chart.transform?.metric]);

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

    return warns;
  }, [chart.transform?.groupBy]);

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
          <StyleTab chart={chart} onChange={onChange} />
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
  const allGroupable = table ? getGroupableColumns(table) : [];
  const metricOptions = [
    { value: "count", label: "Count" },
    // count_distinct works on any column
    ...allGroupable.map((col) => ({
      value: `count_distinct:${col.key}`,
      label: `Unique ${col.label}`,
    })),
    // sum/avg/min/max only for number columns
    ...aggregatableCols
      .filter((col) => col.type === "number")
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

      <Field label="Group By">
        <select
          value={getGroupByValue(chart)}
          onChange={(e) => {
            const val = e.target.value;
            onChange({
              ...chart,
              transform: { ...chart.transform, groupBy: val || undefined },
            });
          }}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">None</option>
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
        </select>
      </Field>

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

function getGroupByValue(chart: Partial<ChartDefinition>): string {
  const gb = chart.transform?.groupBy;
  if (!gb) return "";
  return Array.isArray(gb) ? gb[0] : gb;
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
}: {
  chart: Partial<ChartDefinition>;
  onChange: (c: Partial<ChartDefinition>) => void;
}) {
  const viz = chart.visualization ?? {};

  function updateViz(updates: Record<string, unknown>) {
    onChange({ ...chart, visualization: { ...viz, ...updates } });
  }

  return (
    <>
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
    </>
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
