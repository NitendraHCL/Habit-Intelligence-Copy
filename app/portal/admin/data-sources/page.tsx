"use client";

// ── DS-4: Admin UI for the Data Source Registry ──
// Super Admins can list, create, edit, disable, and delete whitelisted data
// sources without a deploy. "Import from warehouse" reads
// information_schema.columns on the selected table and auto-fills the form.

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import { Plus, Pencil, Trash2, Database, Sparkles } from "lucide-react";

interface DataSourceRow {
  id: string;
  table: string;
  label: string;
  cugColumn: string;
  columns: Record<string, ColMeta>;
  joins: unknown;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ColMeta {
  label: string;
  type: "timestamp" | "text" | "number" | "boolean";
  groupable?: boolean;
  aggregatable?: boolean;
  filterable?: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function DataSourcesAdminPage() {
  const { user } = useAuth();
  const isAdmin =
    user?.role === "SUPER_ADMIN" || user?.role === "INTERNAL_OPS";

  const { data, isLoading, mutate } = useSWR<{ dataSources: DataSourceRow[] }>(
    "/api/admin/data-sources",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [editing, setEditing] = useState<DataSourceRow | "new" | null>(null);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Super Admin access required.
      </div>
    );
  }

  async function remove(row: DataSourceRow) {
    if (!window.confirm(`Delete data source "${row.label}"?`)) return;
    await fetch(`/api/admin/data-sources/${row.id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-gray-900">
            Data Source Registry
          </h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Whitelisted warehouse tables the dashboard builder is allowed to
            query. Changes apply immediately — no deploy needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="size-4" /> Add Data Source
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        )}
        {!isLoading && data?.dataSources?.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No data sources yet. Click &quot;Add Data Source&quot; to whitelist one.
          </div>
        )}
        {!isLoading && data?.dataSources && data.dataSources.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">
                  Label
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">
                  Table
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">
                  Columns
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">
                  Status
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {data.dataSources.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {row.table}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {Object.keys(row.columns ?? {}).length} cols
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        row.enabled
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {row.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
                        aria-label="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing !== null && (
        <DataSourceForm
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            mutate();
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── Form modal ──

function DataSourceForm({
  row,
  onClose,
  onSaved,
}: {
  row: DataSourceRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [table, setTable] = useState(row?.table ?? "");
  const [label, setLabel] = useState(row?.label ?? "");
  const [cugColumn, setCugColumn] = useState(row?.cugColumn ?? "cug_code_mapped");
  const [columns, setColumns] = useState<Record<string, ColMeta>>(
    row?.columns ?? {}
  );
  const [enabled, setEnabled] = useState(row?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const colEntries = Object.entries(columns);

  function updateCol(key: string, patch: Partial<ColMeta>) {
    setColumns((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  }

  function addCol() {
    const name = window.prompt("Column name (as it appears in the warehouse):");
    if (!name?.trim()) return;
    setColumns((c) => ({
      ...c,
      [name.trim()]: { label: name.trim(), type: "text", filterable: true },
    }));
  }

  function removeCol(key: string) {
    setColumns((c) => {
      const { [key]: _, ...rest } = c;
      return rest;
    });
  }

  async function importFromWarehouse() {
    if (!table.trim() || !/^[\w]+\.[\w]+$/.test(table.trim())) {
      setError("Set the table to schema.table before importing");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/data-sources/introspect?table=${encodeURIComponent(table.trim())}`
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Import failed");
      setColumns(d.columns ?? {});
      if (d.suggestion?.cugColumn && !cugColumn) {
        setCugColumn(d.suggestion.cugColumn);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { table, label, cugColumn, columns, enabled };
      const res = await fetch(
        row ? `/api/admin/data-sources/${row.id}` : "/api/admin/data-sources",
        {
          method: row ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Save failed");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-start justify-center p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Database className="size-4 text-indigo-600" />
            {row ? "Edit Data Source" : "Add Data Source"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg"
          >
            &times;
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                Schema.Table
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={table}
                  disabled={!!row}
                  onChange={(e) => setTable(e.target.value)}
                  placeholder="aggregated_table.agg_something"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono disabled:bg-gray-50 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={importFromWarehouse}
                  disabled={importing || !!row}
                  title="Auto-fill columns from information_schema"
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-indigo-200 text-indigo-700 text-xs hover:bg-indigo-50 disabled:opacity-40"
                >
                  <Sparkles className="size-3.5" />
                  {importing ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="OHC Referral KPIs"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                CUG column (for client isolation)
              </label>
              <input
                type="text"
                value={cugColumn}
                onChange={(e) => setCugColumn(e.target.value)}
                placeholder="cug_code_mapped"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
              />
            </div>
            <label className="flex items-end gap-2 text-sm pb-2">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Columns ({colEntries.length})
              </label>
              <button
                type="button"
                onClick={addCol}
                className="text-xs text-indigo-600 hover:text-indigo-800"
              >
                + Add column
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">
                      Column
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">
                      Label
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">
                      Type
                    </th>
                    <th className="text-center px-2 py-1.5 font-medium text-gray-600">
                      Group
                    </th>
                    <th className="text-center px-2 py-1.5 font-medium text-gray-600">
                      Agg
                    </th>
                    <th className="text-center px-2 py-1.5 font-medium text-gray-600">
                      Filter
                    </th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {colEntries.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-4 text-gray-400 text-xs"
                      >
                        No columns yet. Click Import to auto-fill, or Add column.
                      </td>
                    </tr>
                  )}
                  {colEntries.map(([key, col]) => (
                    <tr
                      key={key}
                      className="border-b border-gray-100 last:border-b-0"
                    >
                      <td className="px-2 py-1.5 font-mono">{key}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={col.label}
                          onChange={(e) => updateCol(key, { label: e.target.value })}
                          className="w-full px-1.5 py-0.5 border border-gray-200 rounded text-[11.5px]"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={col.type}
                          onChange={(e) =>
                            updateCol(key, { type: e.target.value as ColMeta["type"] })
                          }
                          className="w-full px-1.5 py-0.5 border border-gray-200 rounded text-[11.5px]"
                        >
                          <option value="text">text</option>
                          <option value="number">number</option>
                          <option value="timestamp">timestamp</option>
                          <option value="boolean">boolean</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={!!col.groupable}
                          onChange={(e) => updateCol(key, { groupable: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={!!col.aggregatable}
                          onChange={(e) => updateCol(key, { aggregatable: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={!!col.filterable}
                          onChange={(e) => updateCol(key, { filterable: e.target.checked })}
                        />
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeCol(key)}
                          className="text-gray-400 hover:text-red-600 text-sm"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !table.trim() || !label.trim()}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : row ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
