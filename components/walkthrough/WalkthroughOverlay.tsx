"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useWalkthrough } from "./WalkthroughProvider";
import { WalkthroughCard } from "./WalkthroughCard";
import { useAIPanel } from "@/lib/ai-panel-context";

const SPOTLIGHT_PADDING = 12;
const SPOTLIGHT_RADIUS = 12;
const CARD_GAP = 16;

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function WalkthroughOverlay() {
  const { isActive, currentStep, steps } = useWalkthrough();
  const { openPanel, closePanel } = useAIPanel();
  const router = useRouter();
  const pathname = usePathname();
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);
  const actionFiredRef = useRef<number>(-1);

  const step = steps[currentStep];
  const isCenterStep = !step?.target;

  // Find and measure target element
  const measureTarget = useCallback(() => {
    if (!step?.target) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(
      `[data-walkthrough="${step.target}"]`
    ) as HTMLElement | null;

    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;

    // Skip scrollIntoView for steps that fire an action — the action opens a
    // modal/panel that takes over the screen anyway, so auto-scrolling the
    // target into view just leaves the page scrolled out of place after the
    // modal closes. If the target is currently off-screen we leave it that
    // way and the spotlight simply doesn't show — the modal is the demo.
    if (!inView && !step.action) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          setTargetRect({
            x: r.left,
            y: r.top,
            width: r.width,
            height: r.height,
          });
        });
      });
    } else {
      setTargetRect({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    }
  }, [step]);

  // Navigate to the step's resolved route when step changes. The provider has
  // already filtered out steps whose `pageSlugs` have no accessible entry, and
  // chose the route here based on what's accessible plus a "stay put" rule
  // when the current pathname is already a valid candidate.
  useEffect(() => {
    if (!isActive || !step?.route) return;
    if (pathname !== step.route) {
      router.push(step.route);
    }
  }, [isActive, currentStep, step, pathname, router]);

  // Execute step actions (open KAM comments, AI panel, etc.)
  useEffect(() => {
    if (!isActive || !step?.action) return;
    // Only fire once per step
    if (actionFiredRef.current === currentStep) return;
    // Wait for navigation to complete only if we actually intend to navigate.
    if (step.route && pathname !== step.route) return;

    const timer = setTimeout(() => {
      actionFiredRef.current = currentStep;

      switch (step.action) {
        case "open-kam-comments": {
          // Close AI panel first, then click the first KAM comment button on the page
          closePanel();
          setTimeout(() => {
            const btn = document.querySelector(
              '[title="View Key Account Manager comments"]'
            ) as HTMLButtonElement | null;
            btn?.click();
          }, 300);
          break;
        }
        case "open-habit-ai": {
          // Close any open KAM comment modal first
          const kamClose = document.querySelector(
            ".fixed.inset-0.z-50 .rounded-2xl button"
          ) as HTMLButtonElement | null;
          if (kamClose) {
            // Find the X button inside the KAM modal
            const closeBtn = document.querySelector(
              ".fixed.inset-0.z-50"
            ) as HTMLElement | null;
            closeBtn?.click();
          }
          setTimeout(() => {
            openPanel({
              title: "OHC Utilisation Trends",
              description:
                "Monthly consultation volumes and visit trends across all OHC locations.",
              data: "Sample chart data for the walkthrough demo",
              kamComments: [
                {
                  author: "HCL KAM",
                  text: "The spike in October is attributed to seasonal flu vaccinations. Overall consultation rates have improved 12% YoY.",
                  date: "Jan 2025",
                },
              ],
            });
          }, 400);
          break;
        }
        case "close-panels": {
          closePanel();
          // Also close any open KAM modal
          const kamOverlay = document.querySelector(
            ".fixed.inset-0.z-50"
          ) as HTMLElement | null;
          kamOverlay?.click();
          break;
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isActive, currentStep, step, pathname, openPanel, closePanel]);

  // Cleanup when walkthrough stops: close panels, reset state
  useEffect(() => {
    if (!isActive) {
      actionFiredRef.current = -1;
      closePanel();
      // Close any open KAM modal
      const kamOverlay = document.querySelector(
        ".fixed.inset-0.z-50"
      ) as HTMLElement | null;
      kamOverlay?.click();
    }
  }, [isActive, closePanel]);

  // Setup: measure target, observe resizes
  useEffect(() => {
    if (!isActive) {
      setVisible(false);
      return;
    }

    // If the step's resolved route differs from the current path, wait for
    // navigation to complete before measuring the target.
    if (step?.route && pathname !== step.route) {
      setVisible(true);
      setTargetRect(null);
      return;
    }

    setVisible(true);

    // Delay measurement to allow page render after navigation
    const measureTimer = setTimeout(() => {
      measureTarget();

      if (step?.target) {
        const el = document.querySelector(
          `[data-walkthrough="${step.target}"]`
        ) as HTMLElement | null;

        if (el) {
          observerRef.current = new ResizeObserver(() => {
            measureTarget();
          });
          observerRef.current.observe(el);
        }
      }
    }, 150);

    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(measureTarget, 100);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(resizeTimer);
      clearTimeout(measureTimer);
      observerRef.current?.disconnect();
    };
  }, [isActive, currentStep, pathname, measureTarget, step]);

  if (!isActive || !visible || !step) return null;

  const cardStyle = getCardPosition(targetRect, step.placement, isCenterStep);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        pointerEvents: "auto",
      }}
      className={visible ? "animate-walkthrough-overlay-in" : ""}
    >
      {/* SVG overlay with spotlight cutout */}
      <svg
        width="100%"
        height="100%"
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        <defs>
          <mask id="walkthrough-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && !isCenterStep && (
              <rect
                x={targetRect.x - SPOTLIGHT_PADDING}
                y={targetRect.y - SPOTLIGHT_PADDING}
                width={targetRect.width + SPOTLIGHT_PADDING * 2}
                height={targetRect.height + SPOTLIGHT_PADDING * 2}
                rx={SPOTLIGHT_RADIUS}
                ry={SPOTLIGHT_RADIUS}
                fill="black"
                style={{
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#walkthrough-mask)"
        />
      </svg>

      {/* Spotlight border glow — pulses gently so the highlighted feature
          visibly pops out from the dimmed background. */}
      {targetRect && !isCenterStep && (
        <div
          className="walkthrough-spotlight-pulse"
          style={{
            position: "absolute",
            left: targetRect.x - SPOTLIGHT_PADDING,
            top: targetRect.y - SPOTLIGHT_PADDING,
            width: targetRect.width + SPOTLIGHT_PADDING * 2,
            height: targetRect.height + SPOTLIGHT_PADDING * 2,
            borderRadius: SPOTLIGHT_RADIUS,
            border: "2px solid rgba(99,102,241,0.55)",
            pointerEvents: "none",
            transition:
              "left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1), width 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
            zIndex: 61,
          }}
        />
      )}

      {/* Step card */}
      <div
        style={{
          position: "absolute",
          zIndex: 62,
          ...cardStyle,
        }}
      >
        <WalkthroughCard />
      </div>
    </div>
  );
}

// Approximate card footprint — used to clamp absolute positions so the card
// never lands offscreen (which would make the tour appear stuck).
const CARD_WIDTH = 420;
const CARD_HEIGHT = 380;

function getCardPosition(
  rect: TargetRect | null,
  placement: string,
  isCenterStep: boolean
): React.CSSProperties {
  // `placement: "center"` (explicit or fallback) and any step without a rect
  // lands the card dead-centre. Used by KAM Comments / Ask AI which
  // spotlight a button but let the modal/panel be the actual demo.
  if (isCenterStep || !rect || placement === "center") {
    return {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
    };
  }

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const clampTop = (t: number) =>
    Math.min(Math.max(16, t), Math.max(16, vh - CARD_HEIGHT - 16));
  const clampLeft = (l: number) =>
    Math.min(Math.max(16, l), Math.max(16, vw - CARD_WIDTH - 16));

  switch (placement) {
    case "right": {
      const left = rect.x + rect.width + SPOTLIGHT_PADDING + CARD_GAP;
      return { top: clampTop(rect.y - 20), left: clampLeft(left) };
    }
    case "left": {
      // Use absolute `left` (clamped) instead of `right` so the card width
      // can never push it off the right edge.
      const left = rect.x - SPOTLIGHT_PADDING - CARD_GAP - CARD_WIDTH;
      return { top: clampTop(rect.y - 20), left: clampLeft(left) };
    }
    case "bottom": {
      const top = rect.y + rect.height + SPOTLIGHT_PADDING + CARD_GAP;
      return { top: clampTop(top), left: clampLeft(rect.x) };
    }
    case "top": {
      const top = rect.y - SPOTLIGHT_PADDING - CARD_GAP - CARD_HEIGHT;
      return { top: clampTop(top), left: clampLeft(rect.x) };
    }
    default:
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
  }
}
