"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useAuth } from "@/lib/contexts/auth-context";
import {
  Plus,
  BarChart3,
  Calendar,
  Trash2,
  Copy,
  ExternalLink,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function BuilderListPage() {
  const router = useRouter();
  const { activeClientId, client } = useAuth();
  const clientId = activeClientId ?? "";

  const { data, mutate } = useSWR(
    clientId ? `/api/admin/dashboards?clientId=${clientId}` : null,
    fetcher
  );

  const dashboards = data?.dashboards ?? [];

  async function handleDelete(id: string) {
    await fetch(`/api/admin/dashboards/${id}`, { method: "DELETE" });
    mutate();
  }

  async function handleClone(dashboard: Record<string, unknown>) {
    const config = dashboard.config as Record<string, unknown>;
    await fetch("/api/admin/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        slug: `${dashboard.slug}-copy`,
        title: `${dashboard.title} (Copy)`,
        config,
      }),
    });
    mutate();
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Dashboard Builder
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage dynamic dashboards for{" "}
            {client?.cugName ?? "your clients"}
          </p>
        </div>
        <button
          onClick={() => router.push("/portal/builder/new")}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700"
        >
          <Plus size={16} />
          New Dashboard
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div className="py-20 text-center">
          <BarChart3 size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No dashboards yet
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Create your first dynamic dashboard to get started.
          </p>
          <button
            onClick={() => router.push("/portal/builder/new")}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700"
          >
            Create Dashboard
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {dashboards.map((d: Record<string, unknown>) => (
            <div
              key={d.id as string}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors"
            >
              <div
                className="flex items-center gap-4 cursor-pointer flex-1"
                onClick={() =>
                  router.push(`/portal/builder/${d.id as string}`)
                }
              >
                <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center">
                  <BarChart3 size={20} className="text-indigo-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">
                    {d.title as string}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                    <span>{d.slug as string}</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {new Date(d.updatedAt as string).toLocaleDateString()}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        d.isDraft
                          ? "bg-amber-50 text-amber-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {d.isDraft ? "Draft" : "Published"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {!d.isDraft && (
                  <button
                    onClick={() =>
                      router.push(d.slug as string)
                    }
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    title="View live"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleClone(d)}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                  title="Clone"
                >
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => handleDelete(d.id as string)}
                  className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
