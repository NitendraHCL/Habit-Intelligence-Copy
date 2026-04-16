"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SEVERITY, type SeverityLevel } from "@/lib/design-tokens";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import { useAIPanel } from "@/lib/ai-panel-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BigNumberCardProps {
  title: string;
  value: number;
  format?: "number" | "percent" | "decimal" | "score";
  prefix?: string;
  suffix?: string;
  trend?: { value: number; label: string };
  severity?: SeverityLevel;
  sparklineData?: number[];
  context?: string;
  className?: string;
}

function useCountUp(target: number, duration = 800) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = ref.current;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const val = start + (target - start) * eased;
      setCurrent(val);
      ref.current = val;
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration]);

  return current;
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const width = 80;
  const height = 28;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
}

export default function BigNumberCard({
  title,
  value,
  format = "number",
  prefix,
  suffix,
  trend,
  severity = "neutral",
  sparklineData,
  context,
  className,
}: BigNumberCardProps) {
  const animatedValue = useCountUp(value);
  const { openPanel } = useAIPanel();

  const formatValue = (v: number) => {
    switch (format) {
      case "percent":
        return `${v.toFixed(1)}%`;
      case "decimal":
        return v.toFixed(1);
      case "score":
        return v.toFixed(0);
      default:
        return v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toFixed(0);
    }
  };

  const TrendIcon =
    trend && trend.value > 0
      ? TrendingUp
      : trend && trend.value < 0
        ? TrendingDown
        : Minus;

  const trendColor =
    trend && trend.value > 0
      ? SEVERITY.good
      : trend && trend.value < 0
        ? SEVERITY.critical
        : SEVERITY.neutral;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:shadow-md",
        className
      )}
      style={{ borderLeftColor: SEVERITY[severity], borderLeftWidth: 3 }}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-purple-50 transition-colors"
                    onClick={() =>
                      openPanel({
                        title,
                        data: { title, value, format, trend, context },
                      })
                    }
                  >
                    <Sparkles size={12} className="text-purple-500/60 hover:text-purple-500" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Ask Habit AI</TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-baseline gap-1">
              {prefix && (
                <span className="text-lg font-semibold text-muted-foreground">
                  {prefix}
                </span>
              )}
              <span
                className="text-3xl font-black tracking-tight animate-count-up font-[var(--font-inter)]"
                style={{ color: SEVERITY[severity], fontFamily: "var(--font-inter), var(--font-sans), sans-serif" }}
              >
                {formatValue(animatedValue)}
              </span>
              {suffix && (
                <span className="text-sm font-medium text-muted-foreground">
                  {suffix}
                </span>
              )}
            </div>
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                <TrendIcon size={12} style={{ color: trendColor }} />
                <span style={{ color: trendColor }} className="font-medium">
                  {trend.value > 0 ? "+" : ""}
                  {trend.value}%
                </span>
                <span className="text-muted-foreground">{trend.label}</span>
              </div>
            )}
            {context && (
              <p className="text-xs text-muted-foreground mt-1">{context}</p>
            )}
          </div>
          {sparklineData && (
            <MiniSparkline data={sparklineData} color={SEVERITY[severity]} />
          )}
        </div>
        <div
          className="absolute bottom-0 left-0 right-0 h-1 opacity-20"
          style={{ backgroundColor: SEVERITY[severity] }}
        />
      </CardContent>
    </Card>
  );
}
