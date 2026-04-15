"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DiscloseProps {
  title: string;
  caption?: string;
  defaultOpen?: boolean;
  /** Show a small dot when there's any non-default config inside. */
  configured?: boolean;
  children: React.ReactNode;
}

export default function Disclose({
  title,
  caption,
  defaultOpen = false,
  configured = false,
  children,
}: DiscloseProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 text-left"
      >
        <span className="mt-0.5">
          {open ? (
            <ChevronDown className="size-3.5 text-gray-500" />
          ) : (
            <ChevronRight className="size-3.5 text-gray-500" />
          )}
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-800">{title}</span>
            {configured && (
              <span
                className="inline-block size-1.5 rounded-full bg-indigo-500"
                title="Configured"
              />
            )}
          </span>
          {caption && (
            <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">
              {caption}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="px-3 py-3 border-t border-gray-100 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
