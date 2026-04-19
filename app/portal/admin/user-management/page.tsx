"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import { Plus, Pencil, Trash2, Users, UserCheck, Shield, Eye, EyeOff } from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  clientId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  client: { id: string; cugName: string; cugCode: string | null } | null;
  clientAssignments: { id: string; clientId: string; client: { id: string; cugName: string; cugCode: string | null } }[];
}

interface CugOption {
  id: string;
  cugName: string;
  cugCode: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function UserManagementPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [tab, setTab] = useState<"internal" | "external">("internal");
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading, mutate } = useSWR<{ users: UserRow[] }>(
    isSuperAdmin ? `/api/admin/user-management?type=${tab}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: cugData } = useSWR<{ clients: CugOption[] }>(
    isSuperAdmin ? "/api/admin/cug-management" : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  const cugs: CugOption[] = cugData?.clients ?? [];

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Super Admin access required.
      </div>
    );
  }

  const users = data?.users ?? [];
  const filtered = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.role.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  async function remove(row: UserRow) {
    if (!window.confirm(`Delete user "${row.name}" (${row.email})?`)) return;
    await fetch(`/api/admin/user-management/${row.id}`, { method: "DELETE" });
    mutate();
  }

  async function toggleActive(row: UserRow) {
    await fetch(`/api/admin/user-management/${row.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    mutate();
  }

  const roleBadgeColor: Record<string, string> = {
    SUPER_ADMIN: "bg-red-100 text-red-700",
    INTERNAL_OPS: "bg-blue-100 text-blue-700",
    KAM: "bg-purple-100 text-purple-700",
    CLIENT_ADMIN: "bg-emerald-100 text-emerald-700",
    CLIENT_VIEWER: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold text-gray-900">
            User Management
          </h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            Create and manage internal team members and external client users.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="size-4" />
          {tab === "internal" ? "Add Internal User" : "Add External User"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-gray-200">
        {(["internal", "external"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(""); }}
            className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "internal" ? (
              <span className="flex items-center gap-1.5"><Shield className="size-3.5" /> Internal Users</span>
            ) : (
              <span className="flex items-center gap-1.5"><Users className="size-3.5" /> External Users</span>
            )}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email, or role…"
        className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm"
      />

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            No {tab} users found.
          </div>
        )}
        {!isLoading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Email</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Role</th>
                  {tab === "external" && (
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">CUG</th>
                  )}
                  {tab === "internal" && (
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-600">Assigned CUGs</th>
                  )}
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-600">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${roleBadgeColor[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {u.role.replace("_", " ")}
                      </span>
                    </td>
                    {tab === "external" && (
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {u.client?.cugName ?? "—"}
                      </td>
                    )}
                    {tab === "internal" && (
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {u.role === "KAM" && u.clientAssignments.length > 0
                          ? u.clientAssignments.map((a) => a.client.cugName).join(", ")
                          : u.role === "KAM" ? "None" : "All"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleActive(u)}
                        title={u.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                      >
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                          u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                        }`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" onClick={() => setEditing(u)} className="p-1.5 rounded hover:bg-gray-100 text-gray-600" aria-label="Edit">
                          <Pencil className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => remove(u)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" aria-label="Delete">
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
        <UserForm
          row={editing === "new" ? null : editing}
          type={tab}
          cugs={cugs}
          onClose={() => setEditing(null)}
          onSaved={() => { mutate(); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Form modal ──

function UserForm({
  row,
  type,
  cugs,
  onClose,
  onSaved,
}: {
  row: UserRow | null;
  type: "internal" | "external";
  cugs: CugOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [email, setEmail] = useState(row?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState(
    row?.role ??
    (type === "internal" ? "INTERNAL_OPS" : "CLIENT_VIEWER")
  );
  const [clientId, setClientId] = useState(row?.clientId ?? "");
  const [assignedCugIds, setAssignedCugIds] = useState<Set<string>>(
    new Set(row?.clientAssignments?.map((a) => a.clientId) ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const internalRoles = [
    { value: "SUPER_ADMIN", label: "Super Admin" },
    { value: "INTERNAL_OPS", label: "Internal Ops" },
    { value: "KAM", label: "Key Account Manager (KAM)" },
  ];
  const externalRoles = [
    { value: "CLIENT_ADMIN", label: "Client Admin" },
    { value: "CLIENT_VIEWER", label: "Client Viewer" },
  ];
  const roles = type === "internal" ? internalRoles : externalRoles;

  function toggleCug(id: string) {
    setAssignedCugIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name, email, role };
      if (password) body.password = password;
      if (!row) body.password = password || undefined;

      if (type === "external") {
        body.clientId = clientId || null;
      }
      if (role === "KAM") {
        body.assignedCugIds = Array.from(assignedCugIds);
      }

      if (!name || !email || (!row && !password)) {
        throw new Error("Name, email, and password are required");
      }
      if (type === "external" && !clientId) {
        throw new Error("Please select a CUG for this external user");
      }

      const res = await fetch(
        row ? `/api/admin/user-management/${row.id}` : "/api/admin/user-management",
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
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <UserCheck className="size-4 text-indigo-600" />
            {row ? "Edit User" : type === "internal" ? "Add Internal User" : "Add External User"}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">
            &times;
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Name + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Password {!row && <span className="text-red-500">*</span>}
              {row && <span className="text-[10px] text-gray-400 ml-1">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={row ? "••••••••" : "Min 8 characters"}
                className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {/* Role */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* External: CUG selector */}
          {type === "external" && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">
                CUG <span className="text-red-500">*</span>
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">Select a CUG…</option>
                {cugs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cugName} {c.cugCode ? `(${c.cugCode})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500">
                This user will only see data for the selected CUG.
              </p>
            </div>
          )}

          {/* KAM: CUG multi-select */}
          {role === "KAM" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                Assigned CUGs
              </label>
              <p className="text-[10px] text-gray-500">
                This KAM will be able to switch between these CUGs in the sidebar dropdown.
              </p>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 space-y-0.5">
                {cugs.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={assignedCugIds.has(c.id)}
                      onChange={() => toggleCug(c.id)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700">{c.cugName}</span>
                    {c.cugCode && (
                      <span className="text-[9px] font-mono text-gray-400 ml-auto">{c.cugCode}</span>
                    )}
                  </label>
                ))}
                {cugs.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No CUGs registered yet.</p>
                )}
              </div>
              <p className="text-[10px] text-gray-500">
                {assignedCugIds.size} CUG{assignedCugIds.size !== 1 ? "s" : ""} selected
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : row ? "Save Changes" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}
