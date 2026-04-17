"use client";

import { useState, useRef } from "react";
import { BookOpen, ChevronDown, ChevronRight, X, Download } from "lucide-react";

interface Step {
  title: string;
  config: { label: string; value: string }[];
  notes?: string;
}

interface ChartGuide {
  id: string;
  title: string;
  type: string;
  section: string;
  steps: Step[];
}

const GUIDE: ChartGuide[] = [
  // ── STEP 0: Page Setup ──
  {
    id: "page-setup",
    title: "Page Setup",
    type: "Page Settings",
    section: "Initial Setup",
    steps: [
      {
        title: "Create a new dashboard",
        config: [
          { label: "Title", value: "OHC Utilization" },
          { label: "URL Slug", value: "/portal/ohc/utilization-v2" },
          { label: "Nav Group", value: "OHC" },
          { label: "Subtitle", value: "Consultation analytics and utilization metrics" },
        ],
      },
      {
        title: "Enable filters",
        config: [
          { label: "Filters", value: "Date Range, Location, Gender, Age Group, Specialty, Relationship" },
        ],
        notes: "Check all 6 filter toggles so users can slice data the same way as the hardcoded page.",
      },
    ],
  },

  // ── KPI Cards ──
  {
    id: "kpi-total-consults",
    title: "Total Consultations KPI",
    type: "KPI Card",
    section: "KPI Row (Section 1)",
    steps: [
      {
        title: "Pick chart type",
        config: [{ label: "Chart Type", value: "KPI Card" }],
      },
      {
        title: "Data tab",
        config: [
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Metric", value: "Built-in → Sum of Consult Count (sum:consult_count)" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
      },
      {
        title: "Style tab",
        config: [
          { label: "Value Format", value: "Number" },
          { label: "Stat Card Style → Value color", value: "#4f46e5 (indigo)" },
        ],
        notes: "YoY comparison is automatic — the builder fetches prior-year data for every KPI.",
      },
      {
        title: "Save",
        config: [{ label: "Title", value: "Total Consultations" }],
      },
    ],
  },
  {
    id: "kpi-unique-patients",
    title: "Unique Patients KPI",
    type: "KPI Card",
    section: "KPI Row (Section 1)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Metric", value: "sum:unique_patients" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
      },
      {
        title: "Style tab",
        config: [{ label: "Stat Card Style → Value color", value: "#4f46e5" }],
      },
      {
        title: "Save",
        config: [{ label: "Title", value: "Unique Patients" }],
      },
    ],
  },
  {
    id: "kpi-repeat-patients",
    title: "Repeat Patients KPI",
    type: "KPI Card",
    section: "KPI Row (Section 1)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Metric", value: "sum:repeat_patients" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
      },
      {
        title: "Style tab",
        config: [{ label: "Stat Card Style → Value color", value: "#4f46e5" }],
      },
      {
        title: "Save",
        config: [{ label: "Title", value: "Repeat Patients" }],
      },
    ],
  },

  // ── Demographic Sunburst ──
  {
    id: "demographic-sunburst",
    title: "Demographic Consult Breakdown",
    type: "Sunburst (2-ring)",
    section: "Chart Grid (Section 2, Column 1)",
    steps: [
      {
        title: "Pick chart type",
        config: [{ label: "Chart Type", value: "Sunburst" }],
      },
      {
        title: "Data tab",
        config: [
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By (primary)", value: "patient_gender" },
          { label: "Secondary Group By", value: "age_group" },
          { label: "Metric", value: "sum:consult_count" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
        notes: "Two Group By levels create the 2-ring sunburst: inner ring = gender, outer ring = age groups.",
      },
      {
        title: "Style tab → Color Overrides",
        config: [
          { label: "Male", value: "#4A6FA5" },
          { label: "Female", value: "#E75480" },
          { label: "<20", value: "#818cf8" },
          { label: "20-35", value: "#0d9488" },
          { label: "36-40", value: "#d4d4d8" },
          { label: "41-60", value: "#a78bfa" },
          { label: "61+", value: "#3730a3" },
        ],
      },
      {
        title: "Style tab → Sub-KPI Strip",
        config: [
          { label: "KPI 1", value: "label: Top Age Group | expr: first.age_group | bg: #FFF5E6 | color: #8B6914" },
          { label: "KPI 2", value: "label: Top Gender | expr: first.patient_gender | bg: #F9F0FF | color: #7B2D9B" },
          { label: "KPI 3", value: "label: Total | expr: sum:consult_count | bg: #FFF0F0 | color: #8B4513" },
        ],
        notes: "These 3 stat boxes appear below the sunburst inside the same card.",
      },
      {
        title: "Style tab → Insight Template",
        config: [
          { label: "Template", value: "{topLabel} accounts for the highest consult volume at {topValue} ({topPct}% of total)." },
        ],
      },
      {
        title: "Style tab → Drill-down",
        config: [
          { label: "Level 1", value: "patient_gender" },
          { label: "Level 2", value: "age_group" },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Demographic Consult Breakdown" },
          { label: "Subtitle", value: "Hover an age/gender slice to see counts and top cohort metrics." },
          { label: "Height", value: "380" },
        ],
      },
    ],
  },

  // ── Clinic Utilization Stacked Bar ──
  {
    id: "clinic-utilization",
    title: "Clinic Utilization by Location & Specialty",
    type: "Stacked Bar",
    section: "Chart Grid (Section 2, Column 2)",
    steps: [
      {
        title: "Pick chart type",
        config: [{ label: "Chart Type", value: "Stacked Bar" }],
      },
      {
        title: "Data tab",
        config: [
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By", value: "facility_name" },
          { label: "Metric", value: "sum:consult_count" },
          { label: "Sort", value: "Descending" },
          { label: "Limit", value: "8" },
          { label: "Others Label", value: "Others" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
      },
      {
        title: "Style tab",
        config: [
          { label: "Colors", value: "Use Indigo/Teal preset palette" },
          { label: "Show Legend", value: "On" },
          { label: "Rank Palette", value: "Enable, from: #3730A3, to: #C7D2FE" },
        ],
        notes: "Rank Palette makes the largest segment in each bar the darkest. Gives the exact dark→light gradient effect.",
      },
      {
        title: "Style tab → Insight Template",
        config: [
          { label: "Template", value: "{topLabel} leads with {topValue} consultations ({topPct}% of total)." },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Clinic Utilization by Location & Specialty" },
          { label: "Subtitle", value: "Consultation volume per location with specialty breakdown" },
          { label: "Height", value: "380" },
        ],
      },
    ],
  },

  // ── Visit Trends ──
  {
    id: "visit-trends",
    title: "Visit Trends",
    type: "Multi-series Line",
    section: "Chart Grid (Section 3, Column 1)",
    steps: [
      {
        title: "Pick chart type",
        config: [{ label: "Chart Type", value: "Line" }],
      },
      {
        title: "Data tab",
        config: [
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By", value: "month(consult_date)" },
          { label: "Additional Metrics (4 total)", value: "" },
          { label: "Metric 1", value: "key: completed | metric: sum:consult_count | label: Completed | WHERE: stage_category = Completed" },
          { label: "Metric 2", value: "key: cancelled | metric: sum:consult_count | label: Cancelled | WHERE: stage_category = Cancelled" },
          { label: "Metric 3", value: "key: noShow | metric: sum:consult_count | label: No-Show | WHERE: stage_category = No Show" },
          { label: "Metric 4", value: "key: uniquePatients | metric: sum:unique_patients | label: Unique Patients | WHERE: stage_category = Completed" },
        ],
        notes: "Each metric has its own WHERE clause to split by stage. Remove the chart-level WHERE to allow all stages.",
      },
      {
        title: "Style tab → View Toggles",
        config: [
          { label: "Toggle 1", value: "id: w | label: Weekly | regroup: week(consult_date)" },
          { label: "Toggle 2", value: "id: m | label: Monthly | regroup: month(consult_date) | Default: yes" },
          { label: "Toggle 3", value: "id: y | label: Yearly | regroup: year(consult_date)" },
        ],
        notes: "Clicking a toggle re-runs the query with a different time grouping. Monthly is the default.",
      },
      {
        title: "Style tab → Per-Series Styles",
        config: [
          { label: "completed", value: "color: #4f46e5" },
          { label: "cancelled", value: "color: #f59e0b" },
          { label: "noShow", value: "color: #ef4444" },
          { label: "uniquePatients", value: "color: #0d9488, dashed: yes" },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Visit Trends" },
          { label: "Subtitle", value: "Month-wise consultation trends" },
          { label: "Height", value: "340" },
        ],
      },
    ],
  },

  // ── Visits by Specialty Donut ──
  {
    id: "specialty-donut",
    title: "Visits by Specialty",
    type: "Donut",
    section: "Chart Grid (Section 3, Column 2)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Chart Type", value: "Donut" },
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By", value: "speciality_name" },
          { label: "Metric", value: "sum:consult_count" },
          { label: "Sort", value: "Descending" },
          { label: "Limit", value: "6" },
          { label: "Others Label", value: "Others" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
      },
      {
        title: "Style tab",
        config: [
          { label: "Inner Radius", value: "60" },
          { label: "Colors", value: "Use Indigo/Teal preset" },
          { label: "Insight Template", value: "{topLabel} accounts for {topPct}% of all consultations ({topValue} of {total})." },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Visits by Specialty" },
          { label: "Subtitle", value: "Proportional distribution of consultations" },
        ],
      },
    ],
  },

  // ── Peak Hours Heatmap ──
  {
    id: "peak-hours",
    title: "Peak Consultation Hours",
    type: "Heatmap",
    section: "Full Width (Section 4)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Chart Type", value: "Heatmap" },
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By (primary)", value: "hour(consult_date) — or use consult_hour column directly" },
          { label: "Secondary Group By", value: "dow(consult_date)" },
          { label: "Metric", value: "sum:consult_count" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
        notes: "Two Group By levels: hour = X-axis, day-of-week = Y-axis. This creates the 17×7 grid.",
      },
      {
        title: "Style tab → VisualMap",
        config: [
          { label: "Min Color", value: "#eef2ff (light indigo)" },
          { label: "Max Color", value: "#3730a3 (dark indigo)" },
          { label: "Position", value: "Top" },
        ],
      },
      {
        title: "Style tab → Value Slider",
        config: [
          { label: "Enable", value: "Yes" },
        ],
        notes: "Adds a dual-handle slider so users can hide low-traffic cells and focus on peaks.",
      },
      {
        title: "Style tab → Tooltip Template",
        config: [
          { label: "Template", value: "{name}: {value} consultations" },
        ],
      },
      {
        title: "Style tab → Insight Template",
        config: [
          { label: "Template", value: "Consultation demand peaks at {topLabel} with {topValue} consultations." },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Peak Consultation Hours" },
          { label: "Subtitle", value: "Hourly heatmap by weekday" },
          { label: "Height", value: "400" },
        ],
      },
    ],
  },

  // ── Categorical Bubble ──
  {
    id: "bubble-chart",
    title: "Consult Distribution by Specialty & Location",
    type: "Categorical Bubble Grid",
    section: "Full Width (Section 5)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Chart Type", value: "Categorical Bubble Grid" },
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By (primary)", value: "facility_name (X-axis: locations)" },
          { label: "Secondary Group By", value: "age_group (Y-axis: age buckets)" },
          { label: "Metric 1 (size)", value: "sum:consult_count" },
          { label: "Metric 2 (color)", value: "formula:sum(CASE WHEN LOWER(TRIM(patient_gender)) IN ('female','f') THEN consult_count ELSE 0 END) / NULLIF(sum(consult_count),0) * 100 — or use a simpler % if available" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
        notes: "Metric 2 computes % female for color bucketing. If the formula is too complex, create a computed column first.",
      },
      {
        title: "Style tab → Auto Tabs",
        config: [
          { label: "Column", value: "speciality_name" },
          { label: "Show All tab", value: "Yes" },
          { label: "Max tabs", value: "12" },
        ],
        notes: "Each specialty becomes a clickable tab above the chart. Clicking filters to that specialty.",
      },
      {
        title: "Style tab → Color By Value Range",
        config: [
          { label: "Source", value: "pct" },
          { label: "Bucket 1", value: "0–20 → #1E3A6E (Predominantly Male)" },
          { label: "Bucket 2", value: "20–40 → #3B5998 (Male Dominant)" },
          { label: "Bucket 3", value: "40–60 → #888888 (Balanced/Mixed)" },
          { label: "Bucket 4", value: "60–80 → #F8A5C2 (Female Mostly)" },
          { label: "Bucket 5", value: "80–100 → #E84393 (Female Dominant)" },
        ],
      },
      {
        title: "Style tab → Background",
        config: [
          { label: "Type", value: "Vertical Bands" },
          { label: "Color", value: "#F3F4F6" },
          { label: "Opacity", value: "0.5" },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Consult Distribution by Specialty & Location" },
          { label: "Subtitle", value: "Bubble size = consult volume, color = gender split. Select a specialty to explore." },
          { label: "Height", value: "450" },
        ],
      },
    ],
  },

  // ── Category Radar ──
  {
    id: "category-radar",
    title: "Category Radar",
    type: "Radar",
    section: "Chart Grid (Section 6, Column 1)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Chart Type", value: "Radar" },
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By", value: "stage_category" },
          { label: "Metric 1", value: "key: booked | metric: count | label: Booked" },
          { label: "Metric 2", value: "key: completed | metric: sum:consult_count | label: Completed" },
        ],
      },
      {
        title: "Style tab",
        config: [
          { label: "Colors", value: "#4f46e5, #0d9488" },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Category Radar" },
          { label: "Subtitle", value: "Booked vs Completed — non-consultation services" },
        ],
      },
    ],
  },

  // ── Service Category Table ──
  {
    id: "service-table",
    title: "Service Category Metrics",
    type: "Data Table",
    section: "Chart Grid (Section 6, Column 2)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Chart Type", value: "Data Table" },
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By", value: "stage_category" },
          { label: "Metric 1", value: "key: booked | metric: count | label: Booked" },
          { label: "Metric 2", value: "key: completed | metric: sum:consult_count | label: Completed" },
          { label: "Metric 3", value: "key: rate | metric: formula:sum(consult_count)/count(*)*100 | label: Rate" },
        ],
      },
      {
        title: "Style tab → Column Cell Renderers",
        config: [
          { label: "completed column", value: "renderer: pill | format: number" },
          { label: "rate column", value: "renderer: threshold_pill | format: percent | thresholds: 0-70→#ef4444, 70-85→#f59e0b, 85-100→#0d9488" },
        ],
        notes: "Rate column shows green/amber/red pills based on completion percentage.",
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Service Category Metrics" },
          { label: "Subtitle", value: "Booked vs completed with completion rate" },
        ],
      },
    ],
  },

  // ── Repeat Visit Trends ──
  {
    id: "repeat-trends",
    title: "Repeat Visit Trends",
    type: "Multi-series Line (mixed styles)",
    section: "Full Width (Section 7)",
    steps: [
      {
        title: "Data tab",
        config: [
          { label: "Chart Type", value: "Line" },
          { label: "Data Source", value: "aggregated_table.agg_kpi" },
          { label: "Group By", value: "month(consult_date)" },
          { label: "Metric 1", value: "key: repeatVisits | metric: sum:repeat_visit_count | label: Repeat Visits" },
          { label: "Metric 2", value: "key: repeatPatients | metric: sum:repeat_patients | label: Repeat Patients" },
          { label: "Filters (WHERE)", value: "stage_category → in → Completed" },
        ],
      },
      {
        title: "Style tab → Per-Series Styles",
        config: [
          { label: "repeatVisits", value: "type: area | filled: yes | color: #e11d48" },
          { label: "repeatPatients", value: "type: line | dashed: yes | color: #8b5cf6" },
        ],
        notes: "This creates the filled-area + dashed-line mixed style from the hardcoded page.",
      },
      {
        title: "Style tab → Dual Y-Axis",
        config: [
          { label: "Enable", value: "Yes" },
          { label: "Right axis keys", value: "repeatPatients" },
        ],
        notes: "Repeat Visits (volume) on the left axis, Repeat Patients (count) on the right axis.",
      },
      {
        title: "Style tab → View Toggles",
        config: [
          { label: "Toggle 1", value: "id: w | label: Weekly | regroup: week(consult_date)" },
          { label: "Toggle 2", value: "id: m | label: Monthly | regroup: month(consult_date) | Default: yes" },
          { label: "Toggle 3", value: "id: y | label: Yearly | regroup: year(consult_date)" },
        ],
      },
      {
        title: "Style tab → Insight Template",
        config: [
          { label: "Template", value: "Repeat Visits = total consultations by employees who visited OHC more than once. Repeat Patients = unique employees who visited more than once. The gap between the two lines indicates visit intensity." },
        ],
      },
      {
        title: "Save",
        config: [
          { label: "Title", value: "Repeat Visit Trends" },
          { label: "Subtitle", value: "Repeat visits and patients over time" },
          { label: "Height", value: "380" },
        ],
      },
    ],
  },
];

const SECTION_ORDER = [
  "Initial Setup",
  "KPI Row (Section 1)",
  "Chart Grid (Section 2, Column 1)",
  "Chart Grid (Section 2, Column 2)",
  "Chart Grid (Section 3, Column 1)",
  "Chart Grid (Section 3, Column 2)",
  "Full Width (Section 4)",
  "Full Width (Section 5)",
  "Chart Grid (Section 6, Column 1)",
  "Chart Grid (Section 6, Column 2)",
  "Full Width (Section 7)",
];

export default function BuilderGuide({ onClose }: { onClose: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>("page-setup");
  const contentRef = useRef<HTMLDivElement | null>(null);

  function handleDownloadPdf() {
    const el = contentRef.current;
    if (!el) return;
    // Expand all sections for the PDF, then use browser print-to-PDF.
    // We temporarily expand all, trigger print, then restore.
    const prev = expandedId;
    setExpandedId(null); // will re-render all as collapsed — but we want all open
    // Use a small timeout to let React re-render, then we'll use a print-friendly approach
    setTimeout(() => {
      const printWindow = window.open("", "_blank");
      if (!printWindow) return;
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Dashboard Builder Guide — OHC Utilization</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #111827; font-size: 12px; line-height: 1.6; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            h1 + p { font-size: 13px; color: #6B7280; margin-bottom: 24px; }
            h2 { font-size: 14px; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 28px; margin-bottom: 10px; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; }
            h3 { font-size: 13px; margin-top: 16px; margin-bottom: 6px; }
            .chart-type { color: #6B7280; font-weight: normal; font-size: 11px; }
            .step { margin-top: 10px; margin-left: 12px; }
            .step-title { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            td { padding: 4px 8px; border: 1px solid #E5E7EB; font-size: 11px; vertical-align: top; }
            td:first-child { font-weight: 600; color: #374151; width: 160px; background: #F9FAFB; }
            td:last-child { font-family: 'SF Mono', Monaco, monospace; font-size: 10.5px; }
            .note { background: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 6px; padding: 6px 10px; font-size: 11px; color: #3730A3; margin-top: 6px; }
            .prereq { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; }
            .prereq ol { margin-left: 16px; }
            .prereq li { margin-bottom: 4px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <h1>Dashboard Builder Guide</h1>
          <p>Recreate the OHC Utilization page from scratch — step by step</p>
          <div class="prereq">
            <strong>Before you start:</strong>
            <ol>
              <li>Go to Data Sources and add <code>aggregated_table.agg_kpi</code> — click Import to auto-fill columns.</li>
              <li>Select a client (e.g. HCL Technologies) in the sidebar.</li>
              <li>This guide creates 10 charts across 7 sections.</li>
            </ol>
          </div>
          ${SECTION_ORDER.map((sectionName) => {
            const items = grouped[sectionName];
            if (!items?.length) return "";
            return `
              <h2>${sectionName}</h2>
              ${items.map((chart) => `
                <h3>${chart.title} <span class="chart-type">(${chart.type})</span></h3>
                ${chart.steps.map((step, si) => `
                  <div class="step">
                    <div class="step-title">Step ${si + 1}: ${step.title}</div>
                    <table>
                      ${step.config.map((c) => `<tr><td>${c.label}</td><td>${c.value}</td></tr>`).join("")}
                    </table>
                    ${step.notes ? `<div class="note">${step.notes}</div>` : ""}
                  </div>
                `).join("")}
              `).join("")}
            `;
          }).join("")}
          <hr style="margin-top:30px;border:none;border-top:1px solid #E5E7EB;">
          <p style="margin-top:12px;font-size:11px;color:#6B7280;">After adding all 10 charts, click Publish. The dashboard will appear under OHC in the sidebar.</p>
        </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }, 100);
    setExpandedId(prev);
  }

  const grouped: Record<string, ChartGuide[]> = {};
  for (const g of GUIDE) {
    (grouped[g.section] ??= []).push(g);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl my-8" ref={contentRef}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white rounded-t-2xl px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <BookOpen className="size-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Dashboard Builder Guide
              </h2>
              <p className="text-xs text-gray-500">
                Recreate the OHC Utilization page from scratch — step by step
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Download className="size-3.5" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Prereqs */}
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100">
          <p className="text-xs font-semibold text-amber-900 mb-1">
            Before you start
          </p>
          <ol className="text-xs text-amber-800 space-y-1 list-decimal list-inside">
            <li>
              Go to <strong>Data Sources</strong> in the sidebar and add{" "}
              <code className="bg-amber-100 px-1 rounded">
                aggregated_table.agg_kpi
              </code>{" "}
              — click <strong>Import</strong> to auto-fill columns.
            </li>
            <li>
              Make sure you have a client selected (e.g. HCL Technologies) in the
              sidebar dropdown.
            </li>
            <li>
              This guide creates <strong>10 charts</strong> across{" "}
              <strong>7 sections</strong>. Follow the sections in order.
            </li>
          </ol>
        </div>

        {/* Steps */}
        <div className="px-6 py-4 space-y-6">
          {SECTION_ORDER.map((sectionName) => {
            const items = grouped[sectionName];
            if (!items?.length) return null;
            return (
              <div key={sectionName}>
                <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2">
                  {sectionName}
                </h3>
                <div className="space-y-2">
                  {items.map((chart) => {
                    const isOpen = expandedId === chart.id;
                    return (
                      <div
                        key={chart.id}
                        className="border border-gray-200 rounded-xl overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isOpen ? null : chart.id)
                          }
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                        >
                          {isOpen ? (
                            <ChevronDown className="size-4 text-gray-500 shrink-0" />
                          ) : (
                            <ChevronRight className="size-4 text-gray-500 shrink-0" />
                          )}
                          <span className="flex-1">
                            <span className="text-sm font-semibold text-gray-900">
                              {chart.title}
                            </span>
                            <span className="ml-2 text-[11px] text-gray-500">
                              ({chart.type})
                            </span>
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {chart.steps.length} steps
                          </span>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 space-y-3 border-t border-gray-100 bg-gray-50/50">
                            {chart.steps.map((step, si) => (
                              <div key={si} className="pt-3">
                                <p className="text-xs font-semibold text-gray-800 mb-1.5">
                                  Step {si + 1}: {step.title}
                                </p>
                                <div className="rounded-lg bg-white border border-gray-200 divide-y divide-gray-100">
                                  {step.config.map((c, ci) => (
                                    <div
                                      key={ci}
                                      className="flex items-start gap-2 px-3 py-2"
                                    >
                                      <span className="text-[11px] font-medium text-gray-600 w-32 shrink-0">
                                        {c.label}
                                      </span>
                                      <span className="text-[11px] text-gray-800 font-mono">
                                        {c.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                                {step.notes && (
                                  <p className="text-[11px] text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2 mt-1.5">
                                    {step.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-600">
            After adding all 10 charts, click <strong>Publish</strong>. The dashboard
            will appear under OHC in the sidebar. All filters, YoY comparisons,
            toggles, drill-downs, and insight sentences will work automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
