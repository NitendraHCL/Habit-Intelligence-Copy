"use client";

import { useState, useEffect } from "react";
import { Sparkles, Loader2 } from "lucide-react";

interface ChipData {
  label: string;
  value: string;
}

const CHIP_COLORS = [
  { bg: "rgba(255,255,255,0.18)", color: "#bbf7d0" },
  { bg: "rgba(255,255,255,0.14)", color: "#fde68a" },
  { bg: "rgba(255,255,255,0.12)", color: "#93c5fd" },
  { bg: "rgba(255,255,255,0.10)", color: "#fca5a5" },
  { bg: "rgba(255,255,255,0.08)", color: "#c4b5fd" },
];

interface PageGlanceBoxProps {
  pageTitle: string;
  pageSubtitle?: string;
  kpis: Record<string, unknown>;
  chartSummaries?: Record<string, unknown>;
  fallbackSummary: string;
  fallbackChips: ChipData[];
}

export function PageGlanceBox({
  pageTitle,
  pageSubtitle,
  kpis,
  chartSummaries,
  fallbackSummary,
  fallbackChips,
}: PageGlanceBoxProps) {
  const [summary, setSummary] = useState(fallbackSummary);
  const [chips, setChips] = useState<ChipData[]>(fallbackChips);
  const [loading, setLoading] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  useEffect(() => {
    setSummary(fallbackSummary);
    setChips(fallbackChips);
    setAiGenerated(false);
  }, [fallbackSummary, JSON.stringify(fallbackChips)]);

  useEffect(() => {
    if (!kpis || Object.keys(kpis).length === 0) return;

    const controller = new AbortController();
    setLoading(true);

    fetch("/api/ai/page-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageTitle, kpis, chartSummaries }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data) => {
        if (data.summary) {
          setSummary(data.summary);
          setAiGenerated(true);
        }
        if (data.chips?.length > 0) {
          setChips(data.chips);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("AI summary fallback:", err);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [pageTitle, JSON.stringify(kpis)]);

  return (
    <div
      data-walkthrough="page-glance"
      className="p-6 text-white rounded-2xl"
      style={{
        background: "linear-gradient(135deg, #4f46e5 0%, #6d28d9 100%)",
        boxShadow: "0 4px 24px rgba(79,70,229,0.25)",
      }}
    >
      {/* Page heading & subtitle */}
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em] font-[var(--font-inter)] text-white">{pageTitle}</h1>
      {pageSubtitle && (
        <p className="mt-0.5 text-[13px] leading-normal" style={{ color: "rgba(255,255,255,0.7)" }}>{pageSubtitle}</p>
      )}

      {/* Divider */}
      <div className="my-4" style={{ height: 1, background: "rgba(255,255,255,0.15)" }} />

      {/* AI Summary section */}
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles size={15} style={{ color: "rgba(255,255,255,0.7)" }} />
        <span className="text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: "rgba(255,255,255,0.7)" }}>Program at a Glance</span>
        {aiGenerated && (
          <span
            className="text-[9px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
          >
            AI Generated
          </span>
        )}
        {loading && <Loader2 size={14} className="animate-spin" style={{ color: "rgba(255,255,255,0.6)" }} />}
      </div>
      {(() => {
        // Split the AI's summary into bullet items on sentence boundaries.
        // The prompt asks for short period-ended sentences (one fact each),
        // so this gives 2-3 bullets. Anything that didn't end with .!? still
        // renders as a single bullet.
        const points = summary
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return (
          <ul className="space-y-1.5">
            {points.map((point, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="mt-[7px] rounded-full flex-shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    backgroundColor: "rgba(255,255,255,0.65)",
                  }}
                />
                <p className="text-[13px] leading-relaxed opacity-90">
                  {point}
                </p>
              </li>
            ))}
          </ul>
        );
      })()}
      {chips.length > 0 && (
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {chips.map((chip, i) => (
            <span
              key={`${chip.label}-${i}`}
              className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[11px] font-bold backdrop-blur-sm"
              style={{
                backgroundColor: CHIP_COLORS[i % CHIP_COLORS.length].bg,
                color: CHIP_COLORS[i % CHIP_COLORS.length].color,
              }}
            >
              {chip.label}: {chip.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
