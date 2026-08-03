// @ts-nocheck
"use client";

/**
 * Shared UI kit for the NTT Wellness dashboards (NTTDATA01). Centralises the
 * Habit Intelligence chrome — card (chart⇄table toggle, expand, Ask AI, KAM
 * comments), warm section, KPI stat card, global filter bar (Date range +
 * Gender + Age Group), and the chart primitives (donut, 100%-stacked response
 * bars, classification bars) — so all four pages stay consistent and DRY.
 */

import { T } from "@/lib/ui/theme";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChartComments } from "@/components/ui/chart-comments";
import { Info, Maximize2, Minimize2, X, ChevronDown, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AskAIButton } from "@/components/ai/AskAIButton";

const ReactEChartsBase = dynamic(() => import("echarts-for-react"), { ssr: false });
export const ReactECharts = ReactEChartsBase as any;

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

export function formatNum(n: number): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("en-IN");
}

// Action / classification colours — kept SEMANTIC (good → bad) so the
// severity/action charts still read at a glance on a mental-health dashboard.
export const ACTION_COLORS = {
  promoter: "#22c55e", // green
  support: "#f59e0b", // amber
  immediate: "#ef4444", // red
};
// Neutral distribution palette — matches the OHC Utilization scheme (an
// ordinal indigo → teal ramp). Used for the per-question response bars and
// other categorical distributions that carry no good/bad meaning.
export const FREQ_COLORS = ["#818cf8", "#6366f1", "#4f46e5", "#0d9488"];
export const OPTION_PALETTE = ["#818cf8", "#6366f1", "#4f46e5", "#3730a3", "#0d9488", "#14b8a6"];
// Distinct-hue OHC categorical palette (indigo · teal · violet · light-indigo …)
// for the classification / action / score-breakdown donuts & bars, where slices
// need to read as separate categories rather than an ordinal ramp.
export const OHC_CATEGORICAL = ["#4f46e5", "#0d9488", "#8b5cf6", "#818cf8", "#14b8a6", "#a78bfa"];

/** Severity ramp: band 0 (best) → last band (worst). */
export function severityColor(i: number, n: number): string {
  const ramp = ["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444", "#b91c1c"];
  if (n <= 1) return ramp[0];
  const pos = Math.round((i / (n - 1)) * (ramp.length - 1));
  return ramp[pos];
}

export function AccentBar({ color = "#4f46e5", colorEnd }: { color?: string; colorEnd?: string }) {
  return <div className="w-10 h-1 rounded-sm mb-3.5" style={{ background: `linear-gradient(90deg, ${color}, ${colorEnd || color})` }} />;
}

// ─── Card (expand, Ask AI, KAM comments) ───
export function CVCard({
  children, className = "", accentColor, title, subtitle, tooltipText, expandable = true,
  chartId, chartData, chartTitle, chartDescription, pageSlug,
}: any) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col ${expanded ? "col-span-full" : ""} ${className}`}
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      {(title || accentColor) && (
        <div className="px-6 pt-5 pb-1">
          {accentColor && <AccentBar color={accentColor} />}
          {title && (
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-[15px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{title}</h3>
                  {tooltipText && (
                    <Tooltip>
                      <TooltipTrigger><Info size={13} style={{ color: T.textMuted }} /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{tooltipText}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {subtitle && <p className="text-[13px] mt-0.5" style={{ color: T.textSecondary }}>{subtitle}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {!!chartData && <AskAIButton title={chartTitle || title || ""} description={chartDescription} data={chartData} />}
                {chartId && pageSlug && <ChartComments chartId={chartId} pageSlug={pageSlug} />}
                {expandable && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" style={{ color: T.textMuted }} onClick={() => setExpanded(!expanded)}>
                    {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="px-6 pb-5 flex-1 flex flex-col">{children}</div>
    </div>
  );
}

export function WarmSection({ children, className = "" }: any) {
  return <div className={`p-5 sm:p-6 ${className}`} style={{ backgroundColor: T.warmBg, borderRadius: 24 }}>{children}</div>;
}

export function InsightBox({ text }: { text: string }) {
  return (
    <div className="mt-auto pt-4">
      <div className="rounded-[14px] px-4 py-3.5 text-[12px] leading-[1.7] font-medium" style={{ backgroundColor: "#eef2ff", border: "1px solid #c7d2fe", color: "#3730a3" }}>{text}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, color = "#4f46e5", pill, decimals = 0 }: any) {
  const display = typeof value === "number" && decimals > 0 ? value.toFixed(decimals) : formatNum(value);
  return (
    <div className="bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px h-full flex flex-col" style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
      <div className="px-5 pt-5 pb-4 flex-1 flex flex-col">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>{label}</p>
        <div className="flex items-baseline gap-2 mt-2">
          <p className="text-[30px] font-extrabold leading-none tracking-[-0.02em] font-[var(--font-inter)]" style={{ color }}>{display}</p>
          {pill && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${color}14`, color }}>{pill}</span>}
        </div>
        {sub && <p className="text-xs mt-2" style={{ color: T.textSecondary }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Filters ───
export function FilterMultiSelect({ label, options, selected, onChange }: any) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium transition-colors border hover:border-gray-300"
          style={{ borderColor: T.border, color: selected.length > 0 ? T.textPrimary : T.textSecondary, backgroundColor: T.white }}>
          {label}
          {selected.length > 0 && <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ backgroundColor: "#4f46e5" }}>{selected.length}</span>}
          <ChevronDown size={13} style={{ color: T.textMuted }} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-[280px] p-2 overflow-hidden" align="start">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-[12px] font-bold font-[var(--font-inter)]" style={{ color: T.textPrimary }}>{label}</span>
          {selected.length > 0 && <button onClick={() => onChange([])} className="text-[10px] font-medium hover:underline" style={{ color: T.coral }}>Clear</button>}
        </div>
        <ScrollArea className="h-52 overflow-hidden">
          <div className="space-y-0.5 pr-2">
            {options.map((opt: string) => (
              <label key={opt} className="flex items-start gap-2 px-1.5 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer text-[12px]" style={{ color: T.textPrimary }}>
                <Checkbox checked={selected.includes(opt)} onCheckedChange={() => onChange(selected.includes(opt) ? selected.filter((s: string) => s !== opt) : [...selected, opt])} className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words leading-snug min-w-0 flex-1">{opt}</span>
              </label>
            ))}
            {options.length === 0 && <div className="text-[11px] px-1.5 py-2" style={{ color: T.textMuted }}>No options</div>}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export function ActiveFilterChips({ filters, labels, onRemove, onClearAll }: any) {
  const chips = [];
  for (const [key, values] of Object.entries(filters)) {
    if (key === "dateFrom" || key === "dateTo") {
      if (values) chips.push({ key, value: values as string });
    } else if (Array.isArray(values)) {
      values.forEach((v: string) => chips.push({ key, value: v }));
    }
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-3">
      {chips.map((chip) => (
        <span key={`${chip.key}-${chip.value}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ backgroundColor: "#4f46e512", color: "#4f46e5", border: "1px solid #4f46e522" }}>
          <span style={{ opacity: 0.7 }}>{labels[chip.key]}:</span> {chip.value}
          <button onClick={() => onRemove(chip.key, chip.value)} className="hover:opacity-70 rounded-full p-0.5"><X size={10} /></button>
        </span>
      ))}
      <button onClick={onClearAll} className="text-[11px] font-medium ml-1 hover:underline" style={{ color: T.coral }}>Clear all</button>
    </div>
  );
}

/** Full global filter bar: Date range + Gender + Age Group + refresh + configure + apply. */
export function NttFilterBar({
  filterOptions, pending, setPending, onApply, onRefresh, isRefreshing, isValidating, isLoading, configureSlot, showRefreshToast,
}: any) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 rounded-2xl" style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] font-medium" style={{ color: T.textMuted }}>From</span>
        <input type="date" value={pending.dateFrom || ""} onChange={(e) => setPending((p: any) => ({ ...p, dateFrom: e.target.value }))}
          className="h-9 px-2 rounded-lg border text-[13px]" style={{ borderColor: T.border, color: T.textPrimary }} />
        <span className="text-[12px] font-medium" style={{ color: T.textMuted }}>To</span>
        <input type="date" value={pending.dateTo || ""} onChange={(e) => setPending((p: any) => ({ ...p, dateTo: e.target.value }))}
          className="h-9 px-2 rounded-lg border text-[13px]" style={{ borderColor: T.border, color: T.textPrimary }} />
      </div>
      <FilterMultiSelect label="Gender" options={filterOptions.genders} selected={pending.genders} onChange={(v: string[]) => setPending((p: any) => ({ ...p, genders: v }))} />
      <FilterMultiSelect label="Age Group" options={filterOptions.ageGroups} selected={pending.ageGroups} onChange={(v: string[]) => setPending((p: any) => ({ ...p, ageGroups: v }))} />
      <div className="flex-1" />
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onRefresh} disabled={isRefreshing} className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-60">
              <RotateCcw className={`size-4 text-gray-600${isRefreshing || isValidating ? " animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh data</TooltipContent>
        </Tooltip>
        {showRefreshToast && (
          <div className="absolute top-full right-0 mt-2 z-50 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="flex items-center gap-2 rounded-lg bg-[#111827] px-3 py-2 text-white shadow-lg whitespace-nowrap">
              <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              <span className="text-[12px] font-medium">Data refreshed</span>
            </div>
          </div>
        )}
      </div>
      {configureSlot}
      <Button onClick={onApply} disabled={isLoading} className="h-9 px-5 rounded-lg text-[13px] font-bold min-w-[90px]"
        style={{ background: isLoading ? "#9CA3AF" : "linear-gradient(135deg, #4f46e5, #6366f1)", color: "#fff", boxShadow: isLoading ? "none" : "0 2px 8px rgba(79,70,229,0.25)" }}>
        {isLoading ? "Loading..." : "Apply"}
      </Button>
    </div>
  );
}

// ─── Chart primitives ───

/** Donut chart from [{name, value, color}]. Optional centre label/value. */
export function Donut({ data, centerLabel, centerValue, centerColor = "#111827", height = 300 }: any) {
  const option = {
    tooltip: { trigger: "item", formatter: (p: any) => `${p.name}: ${formatNum(p.value)} (${p.percent}%)` },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: T.textSecondary } },
    series: [{
      type: "pie", radius: ["55%", "78%"], center: ["50%", "44%"], avoidLabelOverlap: false,
      itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { show: false }, labelLine: { show: false },
      data: (data || []).map((d: any) => ({ name: d.name, value: d.value, itemStyle: { color: d.color } })),
    }],
  };
  return (
    <div className="relative" style={{ height }}>
      <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
      {(centerLabel || centerValue !== undefined) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: "-14%" }}>
          {centerValue !== undefined && <span className="text-[26px] font-extrabold" style={{ color: centerColor }}>{centerValue}</span>}
          {centerLabel && <span className="text-[11px] font-semibold" style={{ color: T.textMuted }}>{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

/**
 * "Response Distribution by Question" — one 100%-stacked horizontal bar per
 * question, split into coloured answer segments with in-bar % labels.
 * questions: [{ question, options: [{label, count, pct}] }]; colors indexed by option.
 */
export function ResponseByQuestion({ questions, colors, minSegPctForLabel = 6 }: any) {
  const opts = questions?.[0]?.options?.map((o: any) => o.label) || [];
  return (
    <div>
      {/* legend */}
      <div className="flex items-center gap-4 flex-wrap mb-3">
        {opts.map((label: string, i: number) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: T.textSecondary }}>
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />{label}
          </span>
        ))}
      </div>
      <div className="space-y-2.5">
        {(questions || []).map((q: any) => (
          <div key={q.question} className="flex items-center gap-3">
            <div className="w-[190px] shrink-0 text-[12px] font-medium truncate" style={{ color: T.textPrimary }} title={q.question}>{q.question}</div>
            <div className="flex-1 flex h-7 rounded-md overflow-hidden" style={{ border: `1px solid ${T.borderLight}` }}>
              {q.options.map((o: any, i: number) => (
                o.pct > 0 ? (
                  <div key={o.label} className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${o.pct}%`, backgroundColor: colors[i % colors.length] }} title={`${o.label}: ${formatNum(o.count)} (${o.pct}%)`}>
                    {o.pct >= minSegPctForLabel ? `${o.pct}%` : ""}
                  </div>
                ) : null
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Vertical bars from [{name, value, color}] with value labels on top. */
export function VerticalBars({ data, height = 300, yFormatter }: any) {
  const option = {
    grid: { top: 30, right: 12, bottom: 28, left: 40 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: any) => `${ps[0].name}: ${formatNum(ps[0].value)}` },
    xAxis: { type: "category", data: (data || []).map((d: any) => d.name), axisLabel: { fontSize: 11, color: T.textSecondary, interval: 0 }, axisLine: { lineStyle: { color: T.border } }, axisTick: { show: false } },
    yAxis: { type: "value", axisLabel: { fontSize: 11, color: T.textMuted, formatter: yFormatter }, splitLine: { lineStyle: { color: T.borderLight } } },
    series: [{
      type: "bar", barMaxWidth: 64, data: (data || []).map((d: any) => ({ value: d.value, itemStyle: { color: d.color, borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: "top", fontSize: 12, fontWeight: "bold", color: T.textPrimary, formatter: (p: any) => formatNum(p.value) },
    }],
  };
  return <div style={{ height }}><ReactECharts option={option} style={{ height: "100%", width: "100%" }} /></div>;
}

/** Half-doughnut gauge for a 0..max average (used by Self-Esteem). */
export function Gauge({ value, max = 2, color = "#0d9488", height = 280, label = "Average Score" }: any) {
  const option = {
    series: [{
      type: "gauge", startAngle: 180, endAngle: 0, min: 0, max, radius: "100%", center: ["50%", "72%"],
      progress: { show: true, width: 22, itemStyle: { color } },
      axisLine: { lineStyle: { width: 22, color: [[1, T.borderLight]] } },
      pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { distance: -8, fontSize: 10, color: T.textMuted },
      anchor: { show: false },
      detail: { valueAnimation: true, offsetCenter: [0, "-8%"], fontSize: 30, fontWeight: "bolder", color, formatter: (v: number) => v.toFixed(2) },
      title: { offsetCenter: [0, "18%"], fontSize: 12, color: T.textMuted },
      data: [{ value, name: label }],
    }],
  };
  return <div style={{ height }}><ReactECharts option={option} style={{ height: "100%", width: "100%" }} /></div>;
}

// Workplace per-question answer colour — neutral OHC palette by option index
// (ordinal indigo → teal ramp), matching the OHC Utilization charts.
const optColor = (_label: string, i: number) => OPTION_PALETTE[i % OPTION_PALETTE.length];

/**
 * Per-question response bars for MIXED-scale instruments (workplace). Each
 * question renders its own 100%-stacked bar with per-option semantic colours
 * and its own inline chip legend, so questions with different answer sets
 * (e.g. a Yes/No item beside a frequency item) stay correctly labelled.
 */
export function MixedResponseByQuestion({ questions }: any) {
  return (
    <div className="space-y-3.5">
      {(questions || []).map((q: any) => (
        <div key={q.question}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>{q.question}</span>
          </div>
          <div className="flex h-6 rounded-md overflow-hidden" style={{ border: `1px solid ${T.borderLight}` }}>
            {q.options.map((o: any, i: number) => (
              o.pct > 0 ? (
                <div key={o.label} className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${o.pct}%`, backgroundColor: optColor(o.label, i) }} title={`${o.label}: ${formatNum(o.count)} (${o.pct}%)`}>
                  {o.pct >= 10 ? `${o.pct}%` : ""}
                </div>
              ) : null
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-1">
            {q.options.map((o: any, i: number) => (
              <span key={o.label} className="inline-flex items-center gap-1 text-[10px]" style={{ color: T.textMuted }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: optColor(o.label, i) }} />{o.label} · {formatNum(o.count)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal classification bars: [{label, count, action}] with severity colours. */
export function ClassificationBars({ bands }: any) {
  const max = Math.max(1, ...(bands || []).map((b: any) => b.count));
  const n = (bands || []).length;
  return (
    <div className="space-y-3 mt-1">
      {(bands || []).map((b: any, i: number) => (
        <div key={b.label} className="flex items-center gap-3">
          <div className="w-[130px] shrink-0 text-[12px] font-medium" style={{ color: T.textPrimary }}>{b.label}</div>
          <div className="flex-1 h-6 rounded-md relative" style={{ backgroundColor: T.borderLight }}>
            <div className="h-6 rounded-md flex items-center justify-end pr-2 text-[11px] font-bold text-white" style={{ width: `${Math.max((b.count / max) * 100, b.count > 0 ? 8 : 0)}%`, backgroundColor: severityColor(i, n) }}>
              {b.count > 0 ? formatNum(b.count) : ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
