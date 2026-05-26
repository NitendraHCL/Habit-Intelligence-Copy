"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/contexts/auth-context";

/**
 * Client-side idle-logout enforcement.
 *
 * Mirrors the server-side IDLE_TIMEOUT_MINUTES constant in lib/auth/session.ts.
 * Listens to mouse / keyboard / scroll / touch activity; if there's none for
 * IDLE_TIMEOUT_MS, the user is logged out. A 30-second warning modal counts
 * down right before the logout so the user can click anywhere to stay in.
 *
 * Mount once at the portal layout level — applies to every authenticated page.
 *
 * Server- and client-side guards work together:
 *   • The client-side timer is the friendly UX path — it warns the user.
 *   • The server-side check in getSession() is the security guarantee — any
 *     authenticated API call after the idle window will 401 even if the
 *     client never showed the warning (e.g., tab was sleeping).
 */

// Source of truth for these values is lib/auth/session.ts. Update both together.
const IDLE_TIMEOUT_MINUTES = 60;
const WARNING_BEFORE_LOGOUT_MS = 30 * 1000;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINUTES * 60 * 1000;

// Activity events that should reset the idle timer.
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "click",
  "focus",
] as const;

export function IdleTimer() {
  const { user, logout } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdownSec, setCountdownSec] = useState(Math.ceil(WARNING_BEFORE_LOGOUT_MS / 1000));

  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Only run while the user is authenticated.
  const isAuthed = !!user;

  useEffect(() => {
    if (!isAuthed) return;

    const clearTimers = () => {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };

    const performLogout = async () => {
      clearTimers();
      try {
        await logout();
      } catch {
        // logout() already handles its own errors; ignore
      }
    };

    const scheduleTimers = () => {
      clearTimers();
      // Schedule the warning to appear WARNING_BEFORE_LOGOUT_MS before the
      // hard logout. Both timers fire once and are reset on any activity.
      const warningDelay = Math.max(0, IDLE_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS);
      warningTimerRef.current = setTimeout(() => {
        setCountdownSec(Math.ceil(WARNING_BEFORE_LOGOUT_MS / 1000));
        setShowWarning(true);
        // Countdown ticker for the modal copy.
        countdownIntervalRef.current = setInterval(() => {
          setCountdownSec((s) => Math.max(0, s - 1));
        }, 1000);
      }, warningDelay);
      logoutTimerRef.current = setTimeout(performLogout, IDLE_TIMEOUT_MS);
    };

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
      if (showWarning) setShowWarning(false);
      scheduleTimers();
    };

    // Attach activity listeners on window. `passive: true` is important on
    // scroll/touchstart so we don't block the event loop while the user is
    // doing real work.
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }

    // Start the timers immediately.
    scheduleTimers();

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, resetTimer);
      }
      clearTimers();
    };
    // We intentionally exclude showWarning from the deps — including it would
    // re-bind every render. resetTimer's setShowWarning(false) is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, logout]);

  if (!isAuthed || !showWarning) return null;

  return <IdleWarningModal countdownSec={countdownSec} />;
}

function IdleWarningModal({ countdownSec }: { countdownSec: number }) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center animate-in fade-in duration-150"
      style={{ backgroundColor: "rgba(17,24,39,0.55)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-modal-title"
    >
      <div
        className="rounded-2xl bg-white max-w-md w-[92%] p-6 shadow-2xl"
        style={{ border: "1px solid #e5e7eb" }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex items-center justify-center rounded-full"
            style={{ width: 36, height: 36, backgroundColor: "#fef3c7" }}
          >
            <span style={{ color: "#92400e", fontWeight: 800 }}>!</span>
          </div>
          <h2 id="idle-modal-title" className="text-[16px] font-extrabold" style={{ color: "#111827" }}>
            You&rsquo;re about to be signed out
          </h2>
        </div>

        <p className="text-[13.5px] leading-relaxed mb-5" style={{ color: "#374151" }}>
          For your security we sign you out after {IDLE_TIMEOUT_MINUTES} minutes of inactivity.
          {" "}
          You&rsquo;ll be signed out in <strong style={{ color: "#dc2626" }}>{countdownSec}s</strong>.
          {" "}
          Move your mouse, press any key, or click anywhere on the page to stay signed in.
        </p>

        {/* Visible "Stay signed in" button — clicking it triggers an activity
            event which resets the timer through the window-level listener. */}
        <button
          type="button"
          className="w-full rounded-lg px-4 py-2.5 text-[13px] font-bold transition-colors"
          style={{ backgroundColor: "#4f46e5", color: "#fff" }}
          onClick={(e) => {
            // Stop event from propagating to the modal backdrop, but the
            // window-level click listener still receives it on capture phase
            // and resets the idle timer.
            e.stopPropagation();
          }}
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
