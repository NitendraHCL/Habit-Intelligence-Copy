"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SEVERITY, type SeverityLevel } from "@/lib/design-tokens";
import {
  Info,
  Maximize2,
  Minimize2,
  Lightbulb,
  GripVertical,
  Sparkles,
} from "lucide-react";
import { useAIPanel } from "@/lib/ai-panel-context";

interface ChartCardProps {
  title: string;
  description?: string;
  severity?: SeverityLevel;
  insight?: string;
  children: React.ReactNode;
  className?: string;
  height?: number;
  dragHandleProps?: Record<string, unknown>;
  badge?: string;
  chartData?: unknown;
  tooltipText?: string;
}

export default function ChartCard({
  title,
  description,
  severity,
  insight,
  children,
  className,
  height = 300,
  dragHandleProps,
  badge,
  chartData,
  tooltipText,
}: ChartCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showInsight, setShowInsight] = useState(false);
  const { openPanel } = useAIPanel();

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all hover:shadow-md",
        expanded && "col-span-full",
        className
      )}
      style={
        severity
          ? { borderLeftColor: SEVERITY[severity], borderLeftWidth: 3 }
          : undefined
      }
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
            >
              <GripVertical size={16} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold truncate flex items-center gap-1.5">
                {title}
                {tooltipText && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Info size={13} className="text-gray-400 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent className="text-xs max-w-xs">
                      {tooltipText}
                    </TooltipContent>
                  </Tooltip>
                )}
              </CardTitle>
              {badge && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {badge}
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  openPanel({
                    title: title,
                    data: chartData ?? insight ?? description ?? title,
                  })
                }
              >
                <Sparkles size={14} className="text-purple-500/70 hover:text-purple-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ask Habit AI</TooltipContent>
          </Tooltip>
          {insight && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowInsight(!showInsight)}
                >
                  <Lightbulb
                    size={14}
                    className={cn(
                      showInsight
                        ? "text-amber-500"
                        : "text-muted-foreground/50"
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI Insight</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <Minimize2 size={14} className="text-muted-foreground/50" />
                ) : (
                  <Maximize2 size={14} className="text-muted-foreground/50" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{expanded ? "Minimize" : "Expand"}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      {showInsight && insight && (
        <div className="mx-4 mb-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
          <Lightbulb size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <span>{insight}</span>
        </div>
      )}
      <CardContent className="pt-0 pb-4">
        <div style={{ height: expanded ? height * 1.5 : height }}>{children}</div>
      </CardContent>
    </Card>
  );
}
