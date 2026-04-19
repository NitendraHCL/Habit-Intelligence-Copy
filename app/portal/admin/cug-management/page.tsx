"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import { Plus, Pencil, Trash2, Building2, Check, X } from "lucide-react";
import { AVAILABLE_PAGES, PAGE_GROUPS, ALL_PAGE_SLUGS } from "@/lib/config/available-pages";

interface CugRow {
  id: string;
  cugId: string;
  cugCode: string | null;
  cugName: string;
  enabledPages: string[] | null;
  hasCustomDashboards: boolean;
  logo: string | null;
  industry: string | null;
  hasOhc: boolean;
  hasLsmp: boolean;
  hasNps: boolean;
  hasHabitApp: boolean;
  aiProvider: string | null;
  aiContextNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CugManagementPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const { data, isLoading, mutate } = useSWR<{ clients: CugRow[] }>(
    isSuperAdmin ? "/api/admin/cug-management" : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [editing, setEditing] = useState<CugRow | "new" | null>(null);
  const [search, setSearch] = useState("");

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Super Admin access required.
      </div>
    );
  }

  const clients = data?.clients ?? [];
  const filtered = search
    ? clients.filter(
        (c) =>
          c.cugName.toLowerCase().includes(search.toLowerCase()) ||
          (c.cugCode ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (c.industry ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : clients;

  async function remove(row: CugRow) {
    if (
      !window.confirm(
        `Delete CUG "${row.cugName}" (${row.cugCode ?? "no code"})? This cannot be undone.`
      )
    )
      return;
    await fetch(`/api/admin/cug-management/${row.id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-gray-900">
            CUG Management
          </h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Register, view, and manage Corporate User Groups. Each CUG maps to
            a <code className="bg-gray-100 px-1 rounded text-xs">cug_code_mapped</code> in
            the data warehouse.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="size-4" /> Register CUG
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, code, or industry…"
        className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm"
      />

      {/* Stats */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{clients.length}</strong> CUGs registered
        </span>
        <span>
          <strong className="text-gray-900">
            {clients.filter((c) => c.hasCustomDashboards).length}
          </strong>{" "}
          with Custom Dashboards
        </span>
        <span>
          <strong className="text-gray-900">
            {clients.filter((c) => !c.enabledPages).length}
          </strong>{" "}
          with all pages
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            {search
              ? "No CUGs match your search."
              : 'No CUGs registered. Click "Register CUG" to add one.'}
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">
                    CUG Name
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">
                    Code
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-600">
                    Pages
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-600">
                    Custom
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.logo ? (
                          <img
                            src={row.logo}
                            alt=""
                            className="size-6 rounded object-contain"
                          />
                        ) : (
                          <div className="size-6 rounded bg-indigo-100 flex items-center justify-center">
                            <Building2 className="size-3.5 text-indigo-600" />
                          </div>
                        )}
                        <span className="font-medium text-gray-900">
                          {row.cugName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {row.cugCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs font-semibold text-gray-700">
                        {row.enabledPages ? (row.enabledPages as string[]).length : "All"}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-0.5">
                        / {ALL_PAGE_SLUGS.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <FeatureBadge on={row.hasCustomDashboards} />
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
          </div>
        )}
      </div>

      {editing !== null && (
        <CugForm
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

function FeatureBadge({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center justify-center size-5 rounded-full bg-emerald-100 text-emerald-700">
      <Check className="size-3" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center size-5 rounded-full bg-gray-100 text-gray-400">
      <X className="size-3" />
    </span>
  );
}

// ── Form modal ──

function CugForm({
  row,
  onClose,
  onSaved,
}: {
  row: CugRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cugName, setCugName] = useState(row?.cugName ?? "");
  const [cugCode, setCugCode] = useState(row?.cugCode ?? "");
  // enabledPages: null = all pages, string[] = selected subset
  const [enabledPages, setEnabledPages] = useState<Set<string>>(
    new Set(row?.enabledPages ? (row.enabledPages as string[]) : ALL_PAGE_SLUGS)
  );
  const [hasCustomDashboards, setHasCustomDashboards] = useState(
    row?.hasCustomDashboards ?? false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePage(slug: string) {
    setEnabledPages((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function toggleGroup(group: string) {
    const groupSlugs = AVAILABLE_PAGES.filter((p) => p.group === group).map((p) => p.slug);
    const allOn = groupSlugs.every((s) => enabledPages.has(s));
    setEnabledPages((prev) => {
      const next = new Set(prev);
      for (const s of groupSlugs) {
        if (allOn) next.delete(s);
        else next.add(s);
      }
      return next;
    });
  }

  function selectAll() {
    setEnabledPages(new Set(ALL_PAGE_SLUGS));
  }

  function selectNone() {
    setEnabledPages(new Set());
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const allSelected = enabledPages.size === ALL_PAGE_SLUGS.length;
      const body = {
        cugName,
        cugCode,
        enabledPages: allSelected ? null : Array.from(enabledPages),
        hasCustomDashboards,
      };
      const res = await fetch(
        row
          ? `/api/admin/cug-management/${row.id}`
          : "/api/admin/cug-management",
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
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="size-4 text-indigo-600" />
            {row ? "Edit CUG" : "Register New CUG"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg"
          >
            &times;
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* CUG Name + Code */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                CUG Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cugName}
                onChange={(e) => setCugName(e.target.value)}
                placeholder="e.g. HCL Technologies"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                CUG Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={cugCode}
                onChange={(e) => setCugCode(e.target.value)}
                placeholder="e.g. HCLT001"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
              />
              <p className="text-[10px] text-gray-500">
                Must match <code>cug_code_mapped</code> in the warehouse
                tables. This is how the dashboard fetches data for this CUG.
              </p>
            </div>
          </div>

          {/* CUG ID — read-only, system generated */}
          {row && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                CUG ID <span className="text-[10px] text-gray-400">(system generated)</span>
              </label>
              <p className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-500">
                {row.cugId}
              </p>
            </div>
          )}

          {/* Page-wise visibility */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-700">
                Enabled Pages
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-[10px] text-indigo-600 hover:underline">
                  Select all
                </button>
                <button type="button" onClick={selectNone} className="text-[10px] text-red-500 hover:underline">
                  Deselect all
                </button>
              </div>
            </div>
            {PAGE_GROUPS.map((group) => {
              const groupPages = AVAILABLE_PAGES.filter((p) => p.group === group);
              const allOn = groupPages.every((p) => enabledPages.has(p.slug));
              const someOn = groupPages.some((p) => enabledPages.has(p.slug));
              return (
                <div key={group} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left"
                  >
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }}
                      readOnly
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs font-semibold text-gray-800">{group}</span>
                    <span className="text-[10px] text-gray-500 ml-auto">
                      {groupPages.filter((p) => enabledPages.has(p.slug)).length}/{groupPages.length}
                    </span>
                  </button>
                  <div className="px-3 py-1.5 space-y-0.5">
                    {groupPages.map((page) => (
                      <label
                        key={page.slug}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={enabledPages.has(page.slug)}
                          onChange={() => togglePage(page.slug)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-xs text-gray-700">{page.label}</span>
                        <span className="text-[9px] font-mono text-gray-400 ml-auto">{page.slug}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom Dashboards master toggle */}
          <label className="flex items-center gap-3 px-3 py-3 rounded-lg border border-indigo-200 bg-indigo-50/50 cursor-pointer hover:bg-indigo-50">
            <input
              type="checkbox"
              checked={hasCustomDashboards}
              onChange={(e) => setHasCustomDashboards(e.target.checked)}
              className="rounded border-indigo-300"
            />
            <div>
              <span className="text-xs font-semibold text-indigo-900">Custom Dashboards</span>
              <p className="text-[10px] text-indigo-700/70 mt-0.5">
                When enabled, all custom dashboards created for this CUG are visible by default.
                Individual dashboards can be hidden via Configure on each page.
              </p>
            </div>
          </label>

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
            disabled={saving || !cugName.trim() || !cugCode.trim()}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : row ? "Save Changes" : "Register CUG"}
          </button>
        </div>
      </div>
    </div>
  );
}
