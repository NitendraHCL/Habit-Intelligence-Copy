"use client";

import { use } from "react";
import useSWR from "swr";
import BuilderPage from "@/components/dashboard-builder/BuilderPage";
import type { PageDefinition } from "@/lib/dashboard/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function EditDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  // "new" means create a fresh dashboard
  if (id === "new") {
    return <BuilderPage />;
  }

  return <EditExisting dashboardId={id} />;
}

function EditExisting({ dashboardId }: { dashboardId: string }) {
  const { data, isLoading } = useSWR(
    `/api/admin/dashboards/${dashboardId}`,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, dedupingInterval: 60_000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const dashboard = data?.dashboard;
  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Dashboard not found
      </div>
    );
  }

  return (
    <BuilderPage
      dashboardId={dashboardId}
      initialConfig={dashboard.config as PageDefinition}
      initialTitle={dashboard.title}
    />
  );
}
