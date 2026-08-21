import { withCache } from "@/lib/cache/middleware";
import { withProvenance } from "@/lib/audit/with-provenance";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { NTT_TABLE } from "@/lib/ntt-wellness/scoring";
import { makeClinicalHandler } from "@/lib/ntt-wellness/clinical-handler";

/* ────────────────────────────────────────────────────────────────────
 * NTTDATA01 — Joy Index (GAD-7) Wellness dashboard API.
 *
 * Single source table: fact_kx.ntt_health_risk_assessment (alias `a`), scoped
 * to cug_code = 'NTTDATA01', status = 'Final'. The GAD-7 score (0–21) is
 * computed in-app from the 7 raw frequency answers (PPT scoring verbatim);
 * classification + action bands come from lib/ntt-wellness/scoring.ts.
 * Global filters: Date range, Gender, Age Group.
 * ──────────────────────────────────────────────────────────────────── */

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Total Respondents · Good · Mild Concerns · High Concern)",
    sources: [NTT_TABLE],
    logic:
      "Over the filtered NTTDATA01 rows that answered ≥1 GAD-7 item. Joy Index score = sum of the 7 items " +
      "(Not at all 0 / Several days 1 / Over half the days 2 / Nearly everyday 3), range 0–21. " +
      "Good = score 0–4; Mild Concerns (Need Support) = 5–14; High Concern (Needs priority support) = ≥15.",
    sql: "WITH per AS (SELECT <sum of 7 CASE maps> sc FROM ntt_health_risk_assessment WHERE <filters> AND <answered>) SELECT COUNT(*), AVG(sc), COUNT(*) FILTER (band) …",
  },
  classificationDistribution: {
    chart: "Classification Distribution (Good / Mild Concern / Moderate Concern / High Concern)",
    sources: [NTT_TABLE],
    logic: "Per-respondent Joy Index score bucketed: 0–4 Good, 5–9 Mild Concern, 10–14 Moderate Concern, ≥15 High Concern.",
    sql: "COUNT(*) FILTER (WHERE sc BETWEEN lo AND hi) per band.",
  },
  actionDistribution: {
    chart: "Action Distribution (Good / Mild Concerns (Need Support) / High Concern (Needs priority support))",
    sources: [NTT_TABLE],
    logic: "The PPT action mapping rolled up across bands: Good (0–4), Mild Concerns (5–14), High Concern (≥15).",
    sql: "COUNT(*) FILTER (WHERE sc in action range) per action.",
  },
  responseByQuestion: {
    chart: "Response Distribution by Question (7 GAD-7 items)",
    sources: [NTT_TABLE],
    logic:
      "For each of the 7 GAD-7 questions, the count/percent of respondents choosing each frequency option " +
      "(Not at all / Several days / Over half the days / Nearly everyday).",
    sql: "UNION ALL of per-question GROUP BY answer counts over the filtered set.",
  },
};

export const GET = withProvenance(
  withCache(
    makeClinicalHandler("gad", "NTT Joy Index", {
      promoter: "Good",
      support: "Mild Concerns (Need Support)",
      immediate: "High Concern (Needs priority support)",
    }),
    { endpoint: "ntt-wellness/anxiety" },
  ),
  PROVENANCE,
);
