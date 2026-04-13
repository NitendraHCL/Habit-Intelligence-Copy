"use client";

import { useState } from "react";
import DynamicChart from "./DynamicChart";
import type {
  SectionDefinition,
  ChartDefinition,
  QueryRequest,
} from "@/lib/dashboard/types";

interface DashboardSectionProps {
  section: SectionDefinition;
  charts: Record<string, ChartDefinition>;
  clientId: string;
  filters?: QueryRequest["filters"];
  isChartVisible?: (chartId: string) => boolean;
}

export default function DashboardSection({
  section,
  charts,
  clientId,
  filters,
  isChartVisible,
}: DashboardSectionProps) {
  const [activeTab, setActiveTab] = useState(0);

  const visibleCharts = section.charts
    .map((id) => charts[id])
    .filter(Boolean)
    .filter((chart) => isChartVisible ? isChartVisible(chart.id) : true);

  if (visibleCharts.length === 0) return null;

  const sectionHeader = (section.title || section.subtitle) ? (
    <div className="mb-4">
      {section.title && (
        <h2 className="text-[15px] font-bold text-gray-900">{section.title}</h2>
      )}
      {section.subtitle && (
        <p className="text-[12px] text-gray-500 mt-0.5">{section.subtitle}</p>
      )}
    </div>
  ) : null;

  if (section.type === "kpi_row") {
    return (
      <div>
        {sectionHeader}
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${visibleCharts.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleCharts.map((chart) => (
            <DynamicChart
              key={chart.id}
              chart={chart}
              clientId={clientId}
              filters={filters}
            />
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "chart_grid") {
    const cols = section.columns ?? 2;
    return (
      <div>
        {sectionHeader}
        <div
          className="grid gap-6"
          style={{
            gridTemplateColumns:
              visibleCharts.length === 1
                ? "1fr"
                : `repeat(${Math.min(cols, visibleCharts.length)}, minmax(0, 1fr))`,
          }}
        >
          {visibleCharts.map((chart) => (
            <DynamicChart
              key={chart.id}
              chart={chart}
              clientId={clientId}
              filters={filters}
            />
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "full_width") {
    return (
      <div>
        {sectionHeader}
        <div className="space-y-6">
          {visibleCharts.map((chart) => (
            <DynamicChart
              key={chart.id}
              chart={chart}
              clientId={clientId}
              filters={filters}
            />
          ))}
        </div>
      </div>
    );
  }

  if (section.type === "tabs") {
    return (
      <div>
        <div className="flex border-b border-gray-200 mb-4">
          {visibleCharts.map((chart, i) => (
            <button
              key={chart.id}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === i
                  ? "border-indigo-500 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {chart.title}
            </button>
          ))}
        </div>
        {visibleCharts[activeTab] && (
          <DynamicChart
            chart={visibleCharts[activeTab]}
            clientId={clientId}
            filters={filters}
          />
        )}
      </div>
    );
  }

  return null;
}
