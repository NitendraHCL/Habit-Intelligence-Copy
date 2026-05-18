"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { walkthroughSteps, type WalkthroughStep } from "./walkthrough-steps";
import { useAuth } from "@/lib/contexts/auth-context";
import { useConfig } from "@/lib/contexts/config-context";

const STORAGE_KEY = "habit-walkthrough-seen";

/** A step plus the route resolved against the current tenant. `route` is the
 *  first slug in `pageSlugs` that passes both gates, or the current pathname
 *  if it's already a valid candidate (avoiding redundant navigation), or
 *  null if no navigation should happen. */
export interface ResolvedStep extends WalkthroughStep {
  route: string | null;
}

interface WalkthroughContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  /** Steps actually shown to this user — filtered by `pageSlugs` accessibility
   *  and with `route` resolved against the current pathname. */
  steps: ResolvedStep[];
  /** Whether the current step wants the sidebar expanded */
  shouldExpandSidebar: boolean;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  goToStep: (n: number) => void;
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function useWalkthrough() {
  const ctx = useContext(WalkthroughContext);
  if (!ctx)
    throw new Error("useWalkthrough must be used within WalkthroughProvider");
  return ctx;
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const { isPageEnabledForClient } = useAuth();
  const { isPageVisible } = useConfig();
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Filter + resolve route in one pass. For each step:
  //   - If no pageSlugs, it's a global / always-show step → keep, route=null.
  //   - Otherwise compute the available slugs (passing both gates). If none,
  //     drop the step. If the current pathname is one of them, stay put;
  //     else navigate to the first one.
  const steps = useMemo<ResolvedStep[]>(() => {
    const out: ResolvedStep[] = [];
    for (const step of walkthroughSteps) {
      if (!step.pageSlugs || step.pageSlugs.length === 0) {
        out.push({ ...step, route: null });
        continue;
      }
      const available = step.pageSlugs.filter(
        (s) => isPageEnabledForClient(s) && isPageVisible(s),
      );
      if (available.length === 0) continue;
      const route = available.includes(pathname) ? pathname : available[0];
      out.push({ ...step, route });
    }
    return out;
  }, [isPageEnabledForClient, isPageVisible, pathname]);

  // If the filtered list shrinks below the current index (client switch
  // mid-tour), clamp so we don't render undefined.
  useEffect(() => {
    if (currentStep >= steps.length) setCurrentStep(0);
  }, [steps.length, currentStep]);

  // Auto-start on first visit
  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen) return;

    const timer = setTimeout(() => {
      setCurrentStep(0);
      setIsActive(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const completeTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev >= steps.length - 1) {
        completeTour();
        return 0;
      }
      return prev + 1;
    });
  }, [completeTour, steps.length]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    completeTour();
  }, [completeTour]);

  const goToStep = useCallback(
    (n: number) => {
      if (n >= 0 && n < steps.length) {
        setCurrentStep(n);
      }
    },
    [steps.length],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        completeTour();
      } else if (e.key === "ArrowRight") {
        nextStep();
      } else if (e.key === "ArrowLeft") {
        prevStep();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, completeTour, nextStep, prevStep]);

  return (
    <WalkthroughContext.Provider
      value={{
        isActive,
        currentStep,
        totalSteps: steps.length,
        steps,
        // Keep the sidebar expanded for the full duration of the tour. The
        // per-step `expandSidebar` flag used to gate this, which made the
        // sidebar toggle collapsed/expanded between steps — visually a flicker.
        shouldExpandSidebar: isActive,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        goToStep,
      }}
    >
      {children}
    </WalkthroughContext.Provider>
  );
}
