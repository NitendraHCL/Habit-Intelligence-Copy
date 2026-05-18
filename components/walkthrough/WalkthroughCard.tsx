"use client";

import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useWalkthrough } from "./WalkthroughProvider";
import {
  Sparkles,
  LayoutDashboard,
  Download,
  Brain,
  BarChart3,
  Layers,
  Stethoscope,
  MessageSquare,
  ClipboardCheck,
  Users,
  Bell,
  Smartphone,
  GitBranch,
  ListChecks,
  SlidersHorizontal,
  PartyPopper,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  LayoutDashboard,
  Download,
  Brain,
  BarChart3,
  Layers,
  Stethoscope,
  MessageSquare,
  ClipboardCheck,
  Users,
  Bell,
  Smartphone,
  GitBranch,
  ListChecks,
  SlidersHorizontal,
  PartyPopper,
};

interface WalkthroughCardProps {
  style?: React.CSSProperties;
}

export function WalkthroughCard({ style }: WalkthroughCardProps) {
  const { currentStep, totalSteps, steps, nextStep, prevStep, skipTour } =
    useWalkthrough();

  const step = steps[currentStep];
  if (!step) return null;

  const Icon = step.icon ? iconMap[step.icon] : null;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div
      className="animate-walkthrough-card-in"
      style={{
        maxWidth: 400,
        borderRadius: 20,
        padding: 24,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.5)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
        position: "relative",
        zIndex: 62,
        ...style,
      }}
    >
      {/* Header: step counter + close */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#6B7280",
            letterSpacing: "0.02em",
          }}
        >
          Step {currentStep + 1} of {totalSteps}
        </span>
        <button
          onClick={skipTour}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            border: "none",
            background: "rgba(0,0,0,0.05)",
            cursor: "pointer",
            color: "#9CA3AF",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.1)";
            e.currentTarget.style.color = "#374151";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.05)";
            e.currentTarget.style.color = "#9CA3AF";
          }}
          aria-label="Close tour"
        >
          <X size={14} />
        </button>
      </div>

      {/* Accent bar */}
      <div
        style={{
          width: 40,
          height: 4,
          borderRadius: 2,
          background: "linear-gradient(90deg, #4f46e5, #6366f1)",
          marginBottom: 16,
        }}
      />

      {/* Icon + Title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        {Icon && (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "rgba(99,102,241,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={16} color="#4f46e5" />
          </div>
        )}
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#111827",
            margin: 0,
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
          }}
        >
          {step.title}
        </h3>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.65,
          color: "#4B5563",
          margin: "0 0 16px",
          whiteSpace: "pre-line",
        }}
      >
        {step.description}
      </p>

      {/* Progress dots */}
      <div
        style={{
          display: "flex",
          gap: 5,
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            style={{
              width: i === currentStep ? 8 : 6,
              height: i === currentStep ? 8 : 6,
              borderRadius: "50%",
              background:
                i === currentStep
                  ? "#4f46e5"
                  : i < currentStep
                  ? "#a5b4fc"
                  : "#D1D5DB",
              transition: "all 0.2s ease",
              transform: i === currentStep ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={skipTour}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#9CA3AF",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#6B7280")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#9CA3AF")}
        >
          Skip tour
        </button>

        <div style={{ display: "flex", gap: 8 }}>
          {!isFirst && (
            <button
              onClick={prevStep}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 13,
                fontWeight: 600,
                color: "#4B5563",
                background: "white",
                border: "1px solid #E5E7EB",
                borderRadius: 10,
                padding: "7px 14px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#D1D5DB";
                e.currentTarget.style.background = "#F9FAFB";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#E5E7EB";
                e.currentTarget.style.background = "white";
              }}
            >
              <ChevronLeft size={14} />
              Back
            </button>
          )}
          <button
            onClick={nextStep}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 13,
              fontWeight: 600,
              color: "white",
              background: "#4f46e5",
              border: "none",
              borderRadius: 10,
              padding: "7px 18px",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "#4338ca")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "#4f46e5")
            }
          >
            {isLast ? "Finish" : "Next"}
            {!isLast && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
