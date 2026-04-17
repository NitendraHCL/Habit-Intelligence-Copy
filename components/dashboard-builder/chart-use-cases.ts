// ── Best use cases + examples for each chart type ──
// Shown at the top of ChartConfigurator when a chart type is selected.

export interface ChartUseCase {
  bestFor: string;
  example: string;
  tip?: string;
}

export const CHART_USE_CASES: Record<string, ChartUseCase> = {
  bar: {
    bestFor: "Comparing values across categories — rankings, volumes, counts.",
    example: "Top 10 specialties by consultation count. Group By: speciality_name, Metric: count.",
    tip: "Sort descending + limit to top 10 for clean visuals.",
  },
  stacked_bar: {
    bestFor: "Showing composition within each category — parts of a whole over groups.",
    example: "Consultations per location, split by specialty. Group By: facility_name, Metrics: one per specialty.",
    tip: "Use Rank Palette for auto dark→light ordering within each bar.",
  },
  grouped_bar: {
    bestFor: "Side-by-side comparison of two or more metrics per category.",
    example: "Male vs Female consultation count per age group. Group By: age_group, Metrics: male_count + female_count.",
  },
  horizontal_bar: {
    bestFor: "Rankings with long category labels that don't fit on an X-axis.",
    example: "Top referring specialties. Group By: referring_speciality, Metric: sum:referral_count, Sort: desc.",
  },
  stacked_bar_100: {
    bestFor: "Comparing proportional composition — each bar sums to 100%.",
    example: "Gender split per location as percentage. Group By: facility_name, Metrics: male_pct + female_pct.",
  },
  lollipop: {
    bestFor: "Cleaner alternative to bar chart for single-metric rankings — less visual clutter.",
    example: "Average NPS by department. Group By: department, Metric: avg:nps_score.",
  },
  dumbbell: {
    bestFor: "Comparing two values per category — before/after, actual vs target.",
    example: "Referral count this year vs last year per specialty. Metrics: current_year + prior_year.",
  },
  diverging_bar: {
    bestFor: "Showing positive/negative splits — sentiment, NPS breakdown, gender comparison.",
    example: "NPS promoters (right) vs detractors (left) by department.",
  },
  tornado: {
    bestFor: "Back-to-back comparison — Male vs Female, Before vs After.",
    example: "Male (left) vs Female (right) consultation count by age group.",
  },
  variance: {
    bestFor: "Actual vs Budget/Target with delta callouts.",
    example: "Planned consultations vs actual per month with variance highlighted.",
  },
  ribbon: {
    bestFor: "Tracking how categories change rank over time — who rises, who falls.",
    example: "Specialty ranking by quarterly consultation volume — see which specialties gained share.",
  },
  marimekko: {
    bestFor: "Market share — variable-width bars show segment size, height shows composition.",
    example: "Each location's share of total consultations, split by specialty within.",
  },
  line: {
    bestFor: "Showing trends over time — monthly, weekly, or daily changes.",
    example: "Monthly consultation count over 2 years. Group By: month(consult_month), Metric: count.",
    tip: "Add a second metric for comparison (e.g., Repeat Visits vs Total Visits).",
  },
  step_line: {
    bestFor: "Discrete state changes over time — stages, thresholds, on/off.",
    example: "NPS category transitions: Promoter → Passive → Detractor over quarters.",
  },
  slope: {
    bestFor: "Before → after comparison — only two time points.",
    example: "Q1 vs Q4 referral conversion rate per specialty — one line per specialty.",
  },
  bump: {
    bestFor: "Tracking rank position changes over time — who's #1 each period.",
    example: "Specialty ranking by monthly referral volume — see position shifts.",
  },
  sparkline: {
    bestFor: "Tiny inline trend — embed inside a KPI card or table row.",
    example: "12-month consultation trend as a micro-line above a KPI number.",
  },
  sparkline_kpi: {
    bestFor: "KPI card with an embedded micro-trend line — Power KPI style.",
    example: "Total Consultations = 45,230 with a mini sparkline showing monthly trend.",
  },
  small_multiples: {
    bestFor: "Comparing the same chart across many categories — one mini-chart per value.",
    example: "Monthly trend per specialty — 12 small line charts, one per specialty.",
  },
  area: {
    bestFor: "Volume trends — same as line but the filled area emphasizes magnitude.",
    example: "Referral volume over time. Group By: month(consult_month), Metric: sum:referral_count.",
  },
  stacked_area: {
    bestFor: "Cumulative volume trends — parts-of-whole over time.",
    example: "Total consultations split by stage (Completed / Cancelled / No Show) over months.",
  },
  stacked_area_100: {
    bestFor: "Proportional composition change over time — each time slice = 100%.",
    example: "Gender share of consultations per month — are women's visits growing?",
  },
  composed: {
    bestFor: "Mixing bar + line in one chart — e.g., volume (bars) + rate (line).",
    example: "Monthly referrals (bars) + conversion rate (line). Dual Y-axis.",
  },
  pie: {
    bestFor: "Simple proportional split — best with 2–6 slices.",
    example: "Consultation split by stage: Completed 72%, Cancelled 18%, No Show 10%.",
    tip: "Always set a limit (top 6–8). Too many slices become unreadable.",
  },
  donut: {
    bestFor: "Same as pie but with a center hole — often used to show a total in the center.",
    example: "Gender split donut with total patients in the center.",
  },
  half_donut: {
    bestFor: "Gauge-like proportion — progress toward a goal or pass/fail split.",
    example: "Conversion rate: 49% converted (filled) vs 51% not converted.",
  },
  nightingale: {
    bestFor: "Proportional comparison where the radius encodes the value (rose chart).",
    example: "Seasonal referral volume — each petal = one season, radius = volume.",
  },
  sunburst: {
    bestFor: "Hierarchical proportions — nested rings for multi-level breakdowns.",
    example: "Gender (inner ring) → Age group (outer ring) referral breakdown.",
    tip: "Use 2–3 Group By levels. Add Color Overrides per age group for clarity.",
  },
  treemap: {
    bestFor: "Part-of-whole with many categories — area = value, nested rectangles.",
    example: "Specialty treemap: each rectangle's area = consultation count for that specialty.",
  },
  funnel: {
    bestFor: "Stage-to-stage drop-off — conversion pipeline.",
    example: "Referral pipeline: Total Referrals → Available In-Clinic → Converted.",
  },
  waterfall: {
    bestFor: "Cumulative effect of sequential positive/negative values.",
    example: "Revenue bridge: Start → +New Clients → −Churn → +Upsell → End.",
  },
  heatmap: {
    bestFor: "Two-dimensional intensity — find hot spots in a matrix.",
    example: "Day-of-week × Hour-of-day consultation volume — find peak hours.",
    tip: "Use Value Slider to filter low-traffic cells. Add VisualMap for a color scale.",
  },
  calendar_heatmap: {
    bestFor: "Daily value over a full year — GitHub-commit-style calendar.",
    example: "Daily consultation count for 2025 — spot seasonal patterns at a glance.",
  },
  scatter: {
    bestFor: "Relationship between two numeric metrics — are they correlated?",
    example: "Age (X) vs Visit Count (Y) per patient cohort — do older patients visit more?",
  },
  bubble: {
    bestFor: "Three-variable comparison — X, Y, and bubble size.",
    example: "Location (Y) × Specialty (color) × Volume (bubble size) — find the biggest clusters.",
    tip: "Use Auto Tabs to filter by specialty. Add Color By Value Range for gender-split coloring.",
  },
  radar: {
    bestFor: "Multi-dimensional profile comparison — how does one entity score across 5+ metrics?",
    example: "Location health scorecard: NPS, Utilization, Conversion, Repeat Rate, Satisfaction per location.",
  },
  sankey: {
    bestFor: "Flow between categories — who refers to whom, where do patients go?",
    example: "Referral flows: From Specialty → To Specialty. Group By: [referring_speciality, speciality_referred_to].",
    tip: "Both Group By columns must be different — same column creates cycles and errors.",
  },
  kpi: {
    bestFor: "Single headline number — total, average, rate.",
    example: "Total Referrals: 36,921. Metric: sum:referral_count. Add thresholds for traffic-light coloring.",
  },
  stat_card: {
    bestFor: "Compact stat with label and optional delta — for KPI rows.",
    example: "Unique Patients: 5,230 with +12% YoY shown below.",
  },
  gauge: {
    bestFor: "Single metric as a dial — progress toward a target.",
    example: "NPS Score: 72/100 — gauge needle shows position.",
  },
  progress_bar: {
    bestFor: "Linear progress toward a target or cap.",
    example: "Utilization rate: 78% of available slots used.",
  },
  progress_ring: {
    bestFor: "Circular progress — single percentage complete.",
    example: "Conversion rate: 49% — ring filled to that point with number in the center.",
  },
  radial_bar: {
    bestFor: "Compact multi-metric comparison as circular bars.",
    example: "Four KPIs (NPS, Utilization, Conversion, Satisfaction) as concentric arcs.",
  },
  waffle: {
    bestFor: "'X out of 100' visualization — intuitive proportions.",
    example: "Repeat patients: 23 out of 100 squares filled = 23% repeat rate.",
  },
  aster_plot: {
    bestFor: "Pie with varying radius — two metrics encoded: angle + radius.",
    example: "Specialty share (angle) × conversion rate (radius) — high-conversion specialties extend further.",
  },
  infographic: {
    bestFor: "Data as repeated icons — visually intuitive for non-technical audiences.",
    example: "7 out of 10 patient icons filled = 70% satisfaction rate.",
  },
  metric_card_grid: {
    bestFor: "Executive summary — multiple KPIs in one compact tile grid.",
    example: "12 monthly case counts as small tiles with seasonal color coding.",
  },
  data_table: {
    bestFor: "Detailed row-level data — sortable, paginated, with optional cell renderers.",
    example: "Specialty × Referrals × Conversion Rate × In-Clinic Consults table with progress bars.",
    tip: "Use Column Cell Renderers for badges, progress bars, and threshold pills.",
  },
  metric_table: {
    bestFor: "Aggregated metric table — grouped rows with computed columns.",
    example: "Specialty detail table: referrals, conversion rate bar, NPS pill.",
  },
  matrix: {
    bestFor: "Pivot table with expandable hierarchies and subtotals.",
    example: "Location → Specialty → Monthly consults with row/column totals.",
  },
  table_heatmap: {
    bestFor: "Data table where cell backgrounds show value intensity.",
    example: "Specialty × Month table, cells colored deeper for higher volume.",
  },
  map: {
    bestFor: "Geographic data — state/district colored by metric value.",
    example: "India map: each state colored by total consultations in that region.",
  },
  word_cloud: {
    bestFor: "Text frequency visualization — common keywords, diagnoses, symptoms.",
    example: "Most common diagnoses: larger words = more frequent occurrences.",
  },
  tile_grid: {
    bestFor: "N small tiles in a grid — each showing a label + value + optional color.",
    example: "12 monthly tiles showing case count, colored by season (Winter/Monsoon/etc).",
  },
  narrative: {
    bestFor: "Rich text summary — prose with data-interpolated numbers.",
    example: "Key User Segments card: paragraph describing patient cohort patterns.",
  },
  timeline: {
    bestFor: "Events on a time axis — milestones, incidents, treatment stages.",
    example: "Patient journey: Registration → First Visit → Referral → Follow-up.",
  },
  gantt: {
    bestFor: "Horizontal duration bars — project or treatment timelines.",
    example: "Treatment plan: each bar = a therapy duration, showing overlap and gaps.",
  },
  correlation_matrix: {
    bestFor: "Pairwise correlation between multiple numeric metrics.",
    example: "How correlated are NPS, Visit Count, Age, and Referral Count?",
  },
  categorical_bubble: {
    bestFor: "Bubble grid with categorical X + Y axes — size and color encode two metrics (e.g. location × age, sized by volume, colored by gender split).",
    example: "Group By: [facility_name, age_group], Metric 1: sum:consult_count (size), Metric 2: formula for % female (color). Add Auto Tabs by speciality_name. Background: vertical_bands.",
    tip: "Use Color By Value Range for gender-split coloring. Enable vertical band background for alternating column shading.",
  },
  dot_plot: {
    bestFor: "Individual data points on an axis — distribution without binning.",
    example: "Patient visit frequency: each dot = one patient, X = visit count.",
  },
  liquid_fill: {
    bestFor: "Animated fill level — dramatic single-metric visualization.",
    example: "Bed occupancy rate: water-fill animation rising to 85%.",
  },
  boxplot: {
    bestFor: "Statistical distribution — median, quartiles, outliers per category.",
    example: "Consultation duration distribution per specialty — spot high-variance departments.",
  },
  candlestick: {
    bestFor: "Open-high-low-close data — financial or range-based metrics.",
    example: "Daily consultation range: min/max/open/close per day.",
  },
  parallel: {
    bestFor: "Multi-dimensional comparison — each line crosses N parallel axes.",
    example: "Patient profiles: Age | Visit Count | NPS | Referral Count — cluster patterns.",
  },
};
