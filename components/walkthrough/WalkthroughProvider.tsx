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
import { walkthroughSteps, type WalkthroughStep } from "./walkthrough-steps";
import { useAuth } from "@/lib/contexts/auth-context";
import { useConfig } from "@/lib/contexts/config-context";

const STORAGE_KEY = "habit-walkthrough-seen";

interface WalkthroughContextValue {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  /** Steps actually shown to this user — filtered by the active client's
   *  `enabledPages`. Consumers should read the current step from here rather
   *  than indexing into the imported `walkthroughSteps` directly. */
  steps: WalkthroughStep[];
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
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Filter steps once per active-client / config change. Steps without a
  // pageSlug are always shown (welcome, navigation, filters, closing). Steps
  // tagged with a pageSlug only show if that slug passes BOTH gates the
  // sidebar uses: `isPageEnabledForClient` (Client.enabledPages) and
  // `isPageVisible` (per-tenant published config). Either gate alone can be
  // a no-op (e.g. enabledPages is null = legacy default = all enabled), so
  // both are needed to mirror the sidebar's real behavior.
  const steps = useMemo(
    () =>
      walkthroughSteps.filter(
        (s) =>
          !s.pageSlug ||
          (isPageEnabledForClient(s.pageSlug) && isPageVisible(s.pageSlug)),
      ),
    [isPageEnabledForClient, isPageVisible],
  );

  // If the filtered list shrinks below the current index (e.g. client switch
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
        shouldExpandSidebar:
          isActive && steps[currentStep]?.expandSidebar === true,
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
