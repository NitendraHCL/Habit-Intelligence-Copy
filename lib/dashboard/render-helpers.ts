// ── Shared rendering helpers used across chart renderers ──

export interface TooltipTokens {
  name?: string | number;
  value?: number;
  pct?: number;
  seriesName?: string;
  /** Any additional row fields (data_table cells etc.). */
  [key: string]: unknown;
}

function formatNum(n: number): string {
  if (!isFinite(n)) return "0";
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)}L`;
  if (n >= 1000) return n.toLocaleString("en-IN");
  return String(Math.round(n * 100) / 100);
}

/**
 * Replace {token} placeholders in a template with values from `tokens`.
 * Numeric values are formatted with Indian-style abbreviations.
 * Unknown tokens are left as the empty string (no template injection).
 */
export function renderTemplate(template: string, tokens: TooltipTokens): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const v = tokens[key];
    if (v === undefined || v === null) return "";
    if (typeof v === "number") return formatNum(v);
    return String(v);
  });
}

/** Compute pct given a value and a total. Returns 0 when total ≤ 0. */
export function safePct(value: number, total: number): number {
  if (!isFinite(total) || total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export interface ColorByColumn {
  column: string;
  palettes: Record<string, string[]>;
}

export interface RankPalette {
  gradient: [string, string];
  applyPerGroup?: boolean;
}

function parseHex(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

export function interpolateHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseHex(from);
  const [r2, g2, b2] = parseHex(to);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(lerp(r1, r2))}${toHex(lerp(g1, g2))}${toHex(lerp(b1, b2))}`;
}

/**
 * Resolve the color for a single cell/segment.
 * Priority: colorOverrides[name] → fallback.
 */
export function resolveColor(
  name: string | number | undefined,
  fallback: string,
  colorOverrides?: Record<string, string>
): string {
  if (colorOverrides && name !== undefined && colorOverrides[String(name)]) {
    return colorOverrides[String(name)];
  }
  return fallback;
}
