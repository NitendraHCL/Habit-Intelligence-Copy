"use client";

import { useState, useCallback, useRef } from "react";
import { Info, Maximize2, Minimize2, Sparkles } from "lucide-react";
import { ChartComments, type CommentAnchor } from "@/components/ui/chart-comments";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useAIPanel } from "@/lib/ai-panel-context";
import { T } from "@/lib/ui/theme";

// ── Accent Bar ──
export function AccentBar({
  color = "#4f46e5",
  colorEnd,
}: {
  color?: string;
  colorEnd?: string;
}) {
  return (
    <div
      className="w-10 h-1 rounded-sm mb-3.5"
      style={{
        background: `linear-gradient(90deg, ${color}, ${colorEnd || color})`,
      }}
    />
  );
}

// ── Insight Box ──
export function InsightBox({ text }: { text: string }) {
  return (
    <div
      className="rounded-[14px] px-4 py-3.5 mt-4 text-[12px] leading-[1.7] font-medium"
      style={{
        backgroundColor: "#eef2ff",
        border: "1px solid #c7d2fe",
        color: "#3730a3",
      }}
    >
      {text}
    </div>
  );
}

// ── Warm Section Wrapper ──
export function WarmSection({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`p-6 sm:p-7 ${className}`}
      style={{ backgroundColor: T.warmBg, borderRadius: 24 }}
    >
      {children}
    </div>
  );
}

// ── Stat Card (in-chart summary) ──
export function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div
      className="bg-white rounded-2xl px-5 py-4 flex flex-col gap-1"
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      <p
        className="text-[12px] font-bold uppercase tracking-[0.06em]"
        style={{ color: T.textMuted }}
      >
        {label}
      </p>
      <p
        className="text-[38px] font-extrabold leading-none tracking-[-0.02em]"
        style={{ color }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Ask AI Button ──
function AskAIBtn({
  title,
  description,
  data,
}: {
  title: string;
  description?: string;
  data: unknown;
}) {
  const { openPanel } = useAIPanel();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      style={{ color: T.textMuted }}
      onClick={() =>
        openPanel({
          title,
          description: description ?? "",
          data,
        })
      }
    >
      <Sparkles size={14} />
    </Button>
  );
}

// ── CVCard Dynamic — matches hardcoded CVCard exactly ──
interface CVCardDynamicProps {
  children: React.ReactNode;
  className?: string;
  accentColor?: string;
  accentColorEnd?: string;
  title?: string;
  subtitle?: string;
  tooltipText?: string;
  expandable?: boolean;
  chartData?: unknown;
  chartTitle?: string;
  chartDescription?: string;
  insightText?: string;
  topInsightText?: string;
  belowContent?: React.ReactNode;
  /** Chart ID for comments */
  chartId?: string;
  /** Page slug for comments */
  pageSlug?: string;
  /** Called when a chart click should be captured as a comment anchor during picking mode */
  onChartClickForAnchor?: (handler: ((params: Record<string, unknown>) => void) | null) => void;
}

export default function CVCardDynamic({
  children,
  className = "",
  accentColor,
  accentColorEnd,
  title,
  subtitle,
  tooltipText,
  expandable = true,
  chartData,
  chartTitle,
  chartDescription,
  insightText,
  topInsightText,
  belowContent,
  chartId,
  pageSlug,
  onChartClickForAnchor,
}: CVCardDynamicProps) {
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const anchorCallbackRef = useRef<((anchor: CommentAnchor) => void) | null>(null);

  const handleRequestAnchor = useCallback((callback: (anchor: CommentAnchor) => void) => {
    anchorCallbackRef.current = callback;
    setPicking(true);
    // Tell DynamicChart to forward next click as an anchor
    onChartClickForAnchor?.((params) => {
      const anchor: CommentAnchor = {
        xValue: params.name as string ?? params.activeLabel as string ?? undefined,
        seriesName: params.seriesName as string ?? undefined,
        yValue: typeof params.value === "number" ? params.value : undefined,
        segmentName: params.name as string ?? undefined,
      };
      anchorCallbackRef.current?.(anchor);
      anchorCallbackRef.current = null;
      setPicking(false);
      onChartClickForAnchor?.(null);
    });
  }, [onChartClickForAnchor]);

  return (
    <div
      data-chart-card
      className={`bg-white rounded-2xl overflow-hidden transition-all hover:-translate-y-px ${
        expanded ? "col-span-full" : ""
      } ${className}`}
      style={{ border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}
    >
      {(title || accentColor) && (
        <div className="px-6 pt-5 pb-1">
          {accentColor && (
            <AccentBar color={accentColor} colorEnd={accentColorEnd} />
          )}
          {title && (
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3
                    className="text-[15px] font-bold"
                    style={{ color: T.textPrimary }}
                  >
                    {title}
                  </h3>
                  {tooltipText && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Info size={13} style={{ color: T.textMuted }} />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {tooltipText}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {subtitle && (
                  <p
                    className="text-[13px] mt-0.5"
                    style={{ color: T.textSecondary }}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {chartId && pageSlug && (
                  <ChartComments
                    chartId={chartId}
                    pageSlug={pageSlug}
                    onRequestAnchor={onChartClickForAnchor ? handleRequestAnchor : undefined}
                  />
                )}
                {!!chartData && (
                  <AskAIBtn
                    title={chartTitle || title || ""}
                    description={chartDescription || subtitle}
                    data={chartData}
                  />
                )}
                {expandable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    style={{ color: T.textMuted }}
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div data-chart-body className={`px-6 pb-5 ${expanded ? "min-h-[500px]" : ""} relative`}>
        {picking && (
          <div className="absolute inset-0 z-10 flex items-start justify-center pt-2 pointer-events-none">
            <div className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium shadow-lg animate-pulse pointer-events-auto">
              Click any data point on this chart to anchor your comment
              <button
                type="button"
                onClick={() => { setPicking(false); anchorCallbackRef.current = null; onChartClickForAnchor?.(null); }}
                className="ml-3 underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {topInsightText && (
          <div
            className="rounded-[14px] px-4 py-3 mb-4 text-[12px] leading-[1.7] font-medium"
            style={{
              backgroundColor: "#eef2ff",
              border: "1px solid #c7d2fe",
              color: "#3730a3",
            }}
          >
            {topInsightText}
          </div>
        )}
        {children}
        {belowContent}
        {insightText && <InsightBox text={insightText} />}
      </div>
    </div>
  );
}
