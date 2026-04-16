"use client";

import { useState } from "react";
import { chartPresets, chartCategories, getPresetsByCategory } from "@/lib/config/chart-presets";
import type { ChartPreset, ChartCategory } from "@/lib/dashboard/types";
import {
  BarChart3, TrendingUp, PieChart, ScatterChart, GitBranch, Gauge,
  GitFork, Type, Table, Circle, AreaChart, Filter, LayoutGrid, Sun,
  Grid3x3, Radar, Share2, Hash, Minus, Image, Flower2, CircleDashed,
  CircleDot, BoxSelect, Calendar, Droplet, Columns2, Table2, BarChart2,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ size?: number }>> = {
  BarChart3, TrendingUp, PieChart, ScatterChart, GitBranch, Gauge,
  GitFork, Type, Table, Circle, AreaChart, Filter, LayoutGrid, Sun,
  Grid3x3, Radar, Share2, Hash, Minus, Image, Flower2, CircleDashed,
  CircleDot, BoxSelect, Calendar, Droplet, Columns2, Table2, BarChart2,
  BarChartHorizontal: BarChart3,
  CandlestickChart: BarChart3,
  AlignVerticalSpaceAround: Columns2,
};

interface ChartPaletteProps {
  onSelect: (preset: ChartPreset) => void;
  selectedId?: string;
}

export default function ChartPalette({ onSelect, selectedId }: ChartPaletteProps) {
  const [activeCategory, setActiveCategory] = useState<ChartCategory>("comparison");

  const presets = getPresetsByCategory(activeCategory);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Chart Types</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          {chartPresets.length} charts available
        </p>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-100">
        {chartCategories.map((cat) => {
          const CatIcon = iconMap[cat.icon] ?? BarChart3;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-colors ${
                activeCategory === cat.id
                  ? "bg-indigo-50 text-indigo-700 font-medium"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <CatIcon size={12} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Chart list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {presets.map((preset) => {
          const Icon = iconMap[preset.icon] ?? BarChart3;
          return (
            <button
              key={preset.id}
              onClick={() => onSelect(preset)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                selectedId === preset.id
                  ? "bg-indigo-50 border border-indigo-200"
                  : "hover:bg-gray-50 border border-transparent"
              }`}
            >
              <div
                className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                  selectedId === preset.id
                    ? "bg-indigo-100 text-indigo-600"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {preset.label}
                </div>
                <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  {preset.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
