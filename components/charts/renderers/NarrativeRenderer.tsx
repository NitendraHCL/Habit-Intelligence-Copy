"use client";

import { renderTemplate } from "@/lib/dashboard/render-helpers";

interface NarrativeRendererProps {
  /** The prose template; tokens like {first.col} or {sum.col} get interpolated. */
  template: string;
  /** First-row data passed for token interpolation. */
  data?: Record<string, unknown>[];
}

export default function NarrativeRenderer({ template, data }: NarrativeRendererProps) {
  if (!template) {
    return (
      <p className="text-sm text-gray-400">Configure the narrative template in Style → Narrative.</p>
    );
  }

  // Build a simple token bag: first-row columns + computed aggregates over the data
  const first = data?.[0] ?? {};
  const tokens: Record<string, string | number> = { ...first as Record<string, string | number> };
  if (data?.length) {
    const numericCols = Object.keys(first).filter(
      (k) => typeof (first as Record<string, unknown>)[k] === "number"
    );
    for (const col of numericCols) {
      const sum = data.reduce((s, r) => s + Number(r[col] ?? 0), 0);
      tokens[`sum_${col}`] = sum;
      tokens[`avg_${col}`] = sum / data.length;
    }
    tokens.row_count = data.length;
  }

  // Render markdown-ish: split paragraphs on double newlines.
  const rendered = renderTemplate(template, tokens);
  const paragraphs = rendered.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  return (
    <div className="prose prose-sm max-w-none text-[13.5px] leading-relaxed text-gray-700 space-y-3">
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
