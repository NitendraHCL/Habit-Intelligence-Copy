"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

export interface FieldHelp {
  /** Short one-liner shown on hover. */
  summary: string;
  /** Longer explanation rendered when the popover opens. */
  description: string;
  /** Step-by-step instructions. */
  steps?: string[];
  /** Concrete worked example — code snippets rendered monospaced. */
  example?: { title?: string; body: string };
}

interface InfoHintProps {
  help: FieldHelp;
}

/**
 * Tiny info icon. Click to open a detailed popover rendered through a portal
 * so it's not clipped by the narrow configurator sidebar. Positioned near
 * the trigger button but clamped to the viewport edges.
 *
 * Close with click-outside or Esc.
 */
export default function InfoHint({ help }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  function computePosition() {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const POPOVER_W = 360;
    const MARGIN = 8;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    // Prefer placing to the right of the icon; if it would overflow, flip to the left.
    let left = rect.right + MARGIN;
    if (left + POPOVER_W + MARGIN > vw) {
      left = Math.max(MARGIN, rect.left - POPOVER_W - MARGIN);
    }
    // If still doesn't fit (tiny screen), pin to the right edge of the viewport.
    if (left < MARGIN) left = Math.max(MARGIN, vw - POPOVER_W - MARGIN);
    const top = Math.max(MARGIN, rect.top);
    setPos({ top, left });
  }

  useEffect(() => {
    if (!open) return;
    computePosition();

    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleResize() {
      computePosition();
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleEsc);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleEsc);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open]);

  const popover = open && pos && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[1000] w-[360px] max-h-[70vh] overflow-y-auto p-3.5 rounded-lg bg-white border border-gray-200 shadow-xl text-[12px] text-gray-700 leading-snug space-y-2"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <p className="font-semibold text-gray-900 flex-1">{help.summary}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-gray-400 hover:text-gray-700 shrink-0"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="whitespace-pre-wrap">{help.description}</p>
          {help.steps && help.steps.length > 0 && (
            <>
              <p className="font-semibold text-gray-900 pt-1">How to use</p>
              <ol className="list-decimal list-inside space-y-0.5 text-gray-700">
                {help.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </>
          )}
          {help.example && (
            <>
              <p className="font-semibold text-gray-900 pt-1">
                {help.example.title ?? "Example"}
              </p>
              <pre className="whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded px-2 py-1.5 text-[11px] font-mono text-gray-800 leading-relaxed overflow-x-auto">
                {help.example.body}
              </pre>
            </>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((o) => !o); }}
        title={help.summary}
        className="inline-flex items-center justify-center size-4 text-gray-400 hover:text-indigo-600 transition-colors cursor-pointer"
        aria-label="More info"
      >
        <Info className="size-3.5" />
      </span>
      {popover}
    </>
  );
}
