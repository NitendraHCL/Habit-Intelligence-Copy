"use client";

import { useState } from "react";
import DynamicChart from "./DynamicChart";
import { WarmSection, AccentBar } from "./CVCardDynamic";
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

  if (section.type === "composite") {
    // G5: All sub-charts share a single card with one title/subtitle row.
    const cols = section.columns ?? Math.min(visibleCharts.length, 2);
    return (
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{
          border: "1px solid #E5E7EB",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)",
        }}
      >
        <div className="px-6 pt-5 pb-3">
          {section.accentColor && (
            <AccentBar color={section.accentColor} />
          )}
          {section.title && (
            <h3 className="text-[15px] font-bold text-gray-900">
              {section.title}
            </h3>
          )}
          {section.subtitle && (
            <p className="text-[13px] text-gray-500 mt-0.5">{section.subtitle}</p>
          )}
        </div>
        <div
          className="grid gap-6 px-6 pb-6"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
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
