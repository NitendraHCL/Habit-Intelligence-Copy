"use client";

import { useRef } from "react";

export interface TokenSpec {
  token: string;
  description: string;
}

interface TokenChipsProps {
  value: string;
  onChange: (value: string) => void;
  tokens: TokenSpec[];
  placeholder?: string;
  rows?: number;
}

export default function TokenChips({
  value,
  onChange,
  tokens,
  placeholder,
  rows = 2,
}: TokenChipsProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function insertAtCursor(token: string) {
    const el = ref.current;
    if (!el) {
      onChange((value || "") + token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="space-y-1.5">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-1">
        {tokens.map((t) => (
          <button
            key={t.token}
            type="button"
            onClick={() => insertAtCursor(t.token)}
            title={t.description}
            className="px-2 py-0.5 text-[10.5px] font-mono rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100 transition-colors"
          >
            {t.token}
          </button>
        ))}
      </div>
    </div>
  );
}
