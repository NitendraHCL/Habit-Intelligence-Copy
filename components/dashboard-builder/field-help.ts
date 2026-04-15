// ── Field help registry for the dashboard builder ──
// Each key corresponds to a field ID used by the `<Field infoKey="...">` usage
// in ChartConfigurator. Content is shown when the user clicks the (i) icon.
//
// Format:
//   summary      — short one-liner (tooltip on hover)
//   description  — longer explanation rendered in the popover
//   steps        — numbered how-to
//   example      — concrete worked example (title + multi-line body)

import type { FieldHelp } from "./InfoHint";

export const FIELD_HELP: Record<string, FieldHelp> = {
  // ─────────────────────────── DATA TAB ───────────────────────────
  "data.dataSource": {
    summary: "The table (or joined tables) this chart pulls data from.",
    description:
      "Pick a data source to point the chart at the right fact table. Every other field on this tab is scoped to the columns available in the selected source.",
    steps: [
      "Open the Data tab.",
      "Click the Data Source dropdown.",
      "Pick the table that matches your metric (e.g. OHC Referral KPIs).",
    ],
    example: {
      title: "Example",
      body: "Data Source: OHC Referral KPIs (agg_referral_kpi)",
    },
  },

  "data.groupBy": {
    summary: "The column whose distinct values become the X-axis (or pie slices, tiles, etc.).",
    description:
      "Group By defines the category axis of your chart. For time-series, wrap a timestamp column in a time function like month(consult_date).",
    steps: [
      "Pick any non-timestamp column to group by that value.",
      "For time trends, pick a (timestamp) → time-function combo.",
      "Add a secondary Group By for sunburst rings or heatmap Y-axis.",
    ],
    example: {
      title: "Examples",
      body: [
        "Categorical:  speciality_referred_to",
        "Monthly:      month(consult_month)",
        "Year x Month: year(consult_month) + month(consult_month)",
      ].join("\n"),
    },
  },

  "data.groupBy.secondary": {
    summary: "Optional second grouping level — enables sunburst rings and heatmap axes.",
    description:
      "When you add a secondary groupBy, the query engine groups by both columns together. Sunburst renders it as a 2nd ring; heatmap uses it as the Y-axis.",
    steps: [
      "Set a primary Group By first.",
      "Pick any second column to nest under it.",
    ],
    example: {
      title: "Sunburst: gender × age",
      body: "Primary:   patient_gender\nSecondary: age_group",
    },
  },

  "data.groupBy.tertiary": {
    summary: "Third ring for 3-level sunbursts.",
    description:
      "Only used by sunburst. Adds the 3rd (outermost) ring. Be careful — too many groups makes the chart unreadable.",
    example: {
      title: "Gender × age × relationship",
      body: "Primary:   patient_gender\nSecondary: age_group\nTertiary:  relationship",
    },
  },

  "data.computed": {
    summary: "Derived columns produced by SQL CASE WHEN. Use in Group By.",
    description:
      "Maps values of a source column to a new labeled bucket. The derived name can be referenced in Group By (or any other column slot).",
    steps: [
      "Give the derived column a name (e.g. season).",
      "Pick the source column it reads from.",
      "Add case(s): when <value> then <label>.",
      "Optionally set an else (default).",
      "Use the derived name in Group By.",
    ],
    example: {
      title: "Month → Season",
      body: [
        "Name:   season",
        "Source: month_num",
        "Cases:",
        "  when 12,1,2   then Winter",
        "  when 3,4,5    then Pre-Monsoon",
        "  when 6,7,8,9  then Monsoon",
        "Else:   Post-Monsoon",
      ].join("\n"),
    },
  },

  "data.metric": {
    summary: "The number each row aggregates to.",
    description:
      "Metric drives the Y-axis value (or KPI number). Three modes are available:\n• Built-in — count, sum, avg, min, max, count distinct\n• Formula — arithmetic over aggregates (e.g. sum(a)/sum(b))\n• Time intel — YTD, MTD, QTD, YoY, MoM, QoQ",
    steps: [
      "Pick a mode from the tab row above the field.",
      "For Built-in: choose the aggregate from the list.",
      "For Formula: write aggregates joined with +, -, *, /.",
      "For Time intel: pick a time window + a numeric column.",
    ],
    example: {
      title: "Conversion rate (formula mode)",
      body: "formula:sum(referral_count) WHERE converted='Conversion'\n(use a simpler version in practice:)\nsum(referral_count) / sum(referral_count) * 100\n\nTime intel YTD:\nytd:referral_count",
    },
  },

  "data.metrics": {
    summary: "Multi-series metrics. Each entry becomes a bar/line series.",
    description:
      "Use this for charts that compare two or more metrics side by side (e.g., Referrals vs Conversions). The first metric drives sort/limit.",
    steps: [
      "Click + Add metric.",
      "Set a unique key and label (shown in the legend).",
      "Pick the aggregate.",
      "Add more metrics as needed.",
    ],
    example: {
      title: "Referrals vs Converted",
      body: [
        "1) key: total          | metric: sum:referral_count | label: Total Referrals",
        "2) key: converted      | metric: formula:sum(referral_count)\n      | label: Conversions",
      ].join("\n"),
    },
  },

  "data.sort": {
    summary: "Order rows asc / desc.",
    description:
      "Sort applies to the first metric (or the groupBy alphabetically). Combine with Limit + Others Label to show a Top-N + Others bucket.",
  },

  "data.limit": {
    summary: "Cap the number of rows returned (Top-N).",
    description:
      "Hard-caps the group count. Useful for pie/donut/treemap charts that look bad with too many slices. Combine with 'Others Label' to bucket overflow into a single row.",
    example: {
      title: "Top 8 specialties + Others",
      body: "Sort:  desc\nLimit: 8\nOthers Label: Others",
    },
  },

  "data.groupRest": {
    summary: "Label for the overflow bucket when Limit is set.",
    description:
      "If you set Limit = 8 and group by specialty, rows beyond the top 8 are summed into a single row with this label.",
  },

  "data.where": {
    summary: "Static filter conditions applied to every query this chart runs.",
    description:
      "Restrict the data set the chart reads from. Different from page filters — these always apply regardless of what filter the user picks.",
    steps: [
      "Click + Add filter.",
      "Pick the column, operator, and value.",
      "Add more rows — they're AND'd together.",
    ],
    example: {
      title: "Only show completed consultations",
      body: "column: stage\nop:     in\nvalue:  Completed, Prescription Sent, Re Open",
    },
  },

  // ─────────────────────────── STYLE TAB ───────────────────────────
  "style.height": {
    summary: "Chart height in pixels.",
    description:
      "Default is 350. Taller works better for sunbursts, stacked bars with many categories, and heatmaps.",
  },
  "style.showLegend": {
    summary: "Toggle the series legend on/off.",
    description: "Automatically hidden when there's only one series.",
  },
  "style.showGrid": { summary: "Toggle the axis grid lines.", description: "" },
  "style.showLabels": {
    summary: "Toggle value labels on bars/slices.",
    description: "Can become cluttered with many categories.",
  },
  "style.stacked": {
    summary: "Stack multiple metrics on top of each other.",
    description:
      "Requires multi-metric config or a stacked-bar chart type. When on, each bar shows the sum across all metrics.",
  },
  "style.orientation": {
    summary: "Vertical (columns) vs Horizontal (rows).",
    description: "Horizontal is better for long category labels.",
  },
  "style.format": {
    summary: "Value formatting for KPI cards and tooltips.",
    description:
      "Number = commas (1,234,567). Percent = 12.3%. Currency = ₹1,234. Decimal = 2 decimal places.",
  },
  "style.colors": {
    summary: "Base palette (comma-separated hex).",
    description:
      "Each bar/series pulls from this palette in order. Leave blank to use the default indigo/teal/violet palette.",
    example: { body: "#4f46e5, #0d9488, #f59e0b" },
  },
  "style.colorOverrides": {
    summary: "Map a specific category label to a specific hex color.",
    description:
      "Takes priority over the base palette. Click a value in the data preview to pre-fill a row.",
    example: {
      title: "Age-group palette",
      body: "<20   → #818cf8\n20-35 → #0d9488\n36-40 → #a78bfa\n41-60 → #6366f1\n61+   → #3730a3",
    },
  },
  "style.tooltipTemplate": {
    summary: "Custom hover tooltip text with tokens.",
    description:
      "Tokens get interpolated from the hovered data point. Click a chip below to insert a token at the cursor.",
    example: {
      title: "Category + percent",
      body: "{name}: {value} ({pct}%)\n→ Cardiology: 1,234 (24%)",
    },
  },
  "style.insightTemplate": {
    summary: "Auto-generated sentence shown below the chart.",
    description:
      "Rendered from the chart's data. Leave blank to use the default sentence; type a single space to suppress entirely.",
    example: {
      title: "Example",
      body: "{topLabel} leads with {topValue} ({topPct}% of total).",
    },
  },
  "style.toggles": {
    summary: "Button group (or dropdown) above the chart that swaps groupBy / metric / filter.",
    description:
      "Lets users re-cut the same chart without opening the builder. Each toggle has an id, a label, and an action (regroup / metric / refilter).",
    steps: [
      "Click + Add toggle.",
      "Set id (internal), label (displayed).",
      "Fill one of: regroup column, metric, or refilter column + value.",
      "Optionally mark one toggle as Default.",
    ],
    example: {
      title: "Weekly / Monthly / Yearly",
      body: [
        "1) id: w  | label: Weekly   | regroup: week(consult_month)",
        "2) id: m  | label: Monthly  | regroup: month(consult_month)  | Default",
        "3) id: y  | label: Yearly   | regroup: year(consult_month)",
      ].join("\n"),
    },
  },
  "style.toggleLayout": {
    summary: "Buttons vs Dropdown.",
    description:
      "Dropdown scales better when you have >6 toggles (e.g. one per specialty); buttons are faster to click.",
  },
  "style.colorByColumn": {
    summary: "Route palette by a categorical column.",
    description:
      "Gives each value of the column its own palette. Used for 'in-clinic vs external' style visuals.",
    example: {
      title: "In-clinic vs external",
      body: [
        "column: is_available_in_clinic",
        "true  → #3730A3, #818cf8, #C7D2FE",
        "false → #92400E, #D97706, #FDE68A",
      ].join("\n"),
    },
  },
  "style.rankPalette": {
    summary: "Per-bar dark → light gradient by value rank.",
    description:
      "In each stacked bar, the biggest segment gets the dark color; smallest gets the light. Useful to reveal #1 per location at a glance.",
    example: {
      title: "Gradient",
      body: "from: #3730A3 (dark)  → to: #C7D2FE (light)",
    },
  },
  "style.tabsFromColumn": {
    summary: "Auto-generate tabs from a column's distinct values.",
    description:
      "On render, the builder fetches the top N values of the column and renders each as a tab. Clicking a tab filters the chart to that value.",
    steps: [
      "Set the column whose values become tabs.",
      "Pick Show-All toggle + max-tabs cap.",
    ],
    example: {
      title: "One tab per specialty",
      body: "column: speciality_referred_to\nmax tabs: 12\nshow All: yes",
    },
  },
  "style.colorByValueRange": {
    summary: "Bucket-based coloring by metric value or % of row total.",
    description:
      "Define numeric ranges → each range gets its own color. Great for gender-split bubbles (Female Majority / Mostly / Balanced / ...).",
    example: {
      title: "% female of row",
      body: [
        "source: pct",
        "0-40   → #1f77b4  Male Majority",
        "40-60  → #888888  Balanced",
        "60-100 → #e377c2  Female Majority",
      ].join("\n"),
    },
  },
  "style.background": {
    summary: "Faint horizontal bars behind a bubble chart.",
    description:
      "Overlay capacity / headcount / any numeric column as a background per row. Useful for 'actual vs. capacity' views.",
  },
  "style.valueSlider": {
    summary: "Dual-handle range slider above the chart.",
    description:
      "Users can drag the slider to hide cells whose metric value falls outside the [min, max] range. Supported on heatmap and bubble.",
  },
  "style.seriesStyles": {
    summary: "Per-metric overrides: line/area/bar type, dashed, filled, color.",
    description:
      "Lets you mix a filled area + a dashed line in the same chart (e.g. actual vs target).",
    example: {
      title: "Actual filled + target dashed",
      body: "actual → type: area, filled: yes, color: #e11d48\ntarget → type: line, dashed: yes, color: #4f46e5",
    },
  },
  "style.visualMap": {
    summary: "Heatmap color scale (min/max color, position, marker).",
    description:
      "Controls the gradient ramp for ECharts heatmap. Marker pins a specific value label on the scale.",
  },
  "style.topInsightTemplate": {
    summary: "Auto-generated banner rendered ABOVE the chart body.",
    description:
      "Uses the same tokens as the bottom insight. Good for 'Viewing chronic recurring conditions…' context banners.",
  },
  "style.summaryKpis": {
    summary: "Sub-KPI strip rendered below the chart inside the same card.",
    description:
      "Up to 4 stat boxes evaluated against the chart's data. Expressions: sum:col, avg:col, count, count_distinct:col, first.col.",
    example: {
      title: "Top age / gender / combo",
      body: [
        "1) label: Top Age Group | expr: first.age_group",
        "2) label: Top Gender    | expr: first.gender",
        "3) label: Total         | expr: sum:referral_count",
      ].join("\n"),
    },
  },
  "style.columnConfig": {
    summary: "Per-column cell renderer for data_table charts.",
    description:
      "Wraps a column's cells in a badge, pill, threshold pill, or progress bar. Each renderer has its own options (colorMap, thresholds, format).",
    example: {
      title: "Availability column as a badge",
      body: [
        "column: availability",
        "renderer: badge",
        "colorMap: Available → #0d9488, External → #f59e0b",
      ].join("\n"),
    },
  },
  "style.tileGrid": {
    summary: "12-tile / N-tile layout for the tile_grid chart type.",
    description:
      "Lays out small cards per group with a label, value, optional caption, and a categorical background color.",
    example: {
      title: "Seasonal patterns",
      body: [
        "columns: 4",
        "colorColumn: season",
        "colorMap: Winter → #E0F2FE, Monsoon → #FEF9C3, ...",
      ].join("\n"),
    },
  },
  "style.statCard": {
    summary: "Card style for KPI / stat_card charts.",
    description:
      "Customize background, value color, value format (Number / Percent / INR-Lakhs / INR-Crores), and sublabel template.",
    example: {
      title: "Indigo KPI",
      body: "bg: #FFFFFF\naccent: #4f46e5\nformat: inr-lakhs\nsublabel: {value} total",
    },
  },
  "style.drillDown": {
    summary: "Ordered column list for click-to-drill hierarchies.",
    description:
      "Chart starts at levels[0]. Clicking a segment adds a where-clause and advances to levels[1]. A Back button is shown.",
    example: {
      title: "Year → Quarter → Month",
      body: "Level 1: year(consult_month)\nLevel 2: quarter(consult_month)\nLevel 3: month(consult_month)",
    },
  },
  "style.drillThrough": {
    summary: "Click a value to navigate to another page, filtered to that value.",
    description:
      "Configure the target slug, the URL param to send, and optionally a different value column. The destination page reads URL params as extra where-clauses automatically.",
    example: {
      title: "Jump from summary to referral detail",
      body: "slug: /portal/ohc/referral\nparamColumn: speciality_referred_to",
    },
  },
  "style.narrative": {
    summary: "Markdown-ish prose for the narrative chart type.",
    description:
      "Template supports {column}, {sum_column}, {avg_column}, {row_count} tokens. Blank lines become paragraph breaks.",
  },

  // ─────────────────────────── BEHAVIOR TAB ───────────────────────
  "behavior.linkGroup": {
    summary: "Share clicks/filters between charts on the same page.",
    description:
      "Any chart that emits a filter on linkGroup 'X' will drive any chart that receives filters on the same group. Pair with emitFilter + receiveFilter.",
    example: { body: "linkGroup: referrals" },
  },
  "behavior.emitFilter": {
    summary: "Broadcast this column as a filter on click.",
    description: "When the user clicks a segment, publish {column: value} to the linkGroup.",
  },
  "behavior.receiveFilter": {
    summary: "Subscribe to filters broadcast by other charts.",
    description:
      "Comma-separated list of columns this chart is willing to be filtered by. Only filters on these columns apply.",
  },

  // ─────────────────────────── THRESHOLDS TAB ──────────────────────
  "thresholds.list": {
    summary: "Color bands for KPI cards and single-value visuals.",
    description:
      "Each threshold defines a value range and the color to use when the metric falls in that range.",
    example: {
      title: "Traffic light NPS",
      body: "0–30   → #ef4444 (Low)\n30–70  → #f59e0b (Medium)\n70–100 → #059669 (High)",
    },
  },
};
