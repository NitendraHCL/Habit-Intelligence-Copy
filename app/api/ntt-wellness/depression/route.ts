import { withCache } from "@/lib/cache/middleware";
import { withProvenance } from "@/lib/audit/with-provenance";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import { NTT_TABLE } from "@/lib/ntt-wellness/scoring";
import { makeClinicalHandler } from "@/lib/ntt-wellness/clinical-handler";

/* ────────────────────────────────────────────────────────────────────
 * NTTDATA01 — PHQ-9 Depression Wellness dashboard API.
 *
 * Single source table: fact_kx.ntt_health_risk_assessment (alias `a`), scoped
 * to cug_code = 'NTTDATA01', status = 'Final'. The PHQ-9 score (0–27) is
 * computed in-app from the 9 raw frequency answers (PPT scoring verbatim).
 * Global filters: Date range, Gender, Age Group.
 * ──────────────────────────────────────────────────────────────────── */

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Total Respondents · Average Score · Promoters · Support · Immediate)",
    sources: [NTT_TABLE],
    logic:
      "Over the filtered NTTDATA01 rows that answered ≥1 PHQ-9 item. PHQ-9 score = sum of the 9 items " +
      "(Not at all 0 / Several days 1 / Over half the days 2 / Nearly everyday 3), range 0–27. Average = mean score. " +
      "Promoters = score 0 (No depression); Support = 1–9 (Minimal 1–4 + Mild 5–9); Immediate = ≥10 (Moderate and above).",
    sql: "WITH per AS (SELECT <sum of 9 CASE maps> sc FROM ntt_health_risk_assessment WHERE <filters> AND <answered>) SELECT COUNT(*), AVG(sc), COUNT(*) FILTER (band) …",
  },
  classificationDistribution: {
    chart: "Classification Distribution (No / Minimal / Mild / Moderate / Mod. severe / Severe)",
    sources: [NTT_TABLE],
    logic: "Per-respondent PHQ-9 score bucketed: 0 No, 1–4 Minimal, 5–9 Mild, 10–14 Moderate, 15–19 Mod. severe, 20–27 Severe.",
    sql: "COUNT(*) FILTER (WHERE sc BETWEEN lo AND hi) per band.",
  },
  actionDistribution: {
    chart: "Action Distribution (Promoter / Support Needed / Immediate support)",
    sources: [NTT_TABLE],
    logic: "The PPT action mapping rolled up across bands: Promoter (0), Support (1–9), Immediate (≥10).",
    sql: "COUNT(*) FILTER (WHERE sc in action range) per action.",
  },
  responseByQuestion: {
    chart: "Response Distribution by Question (9 PHQ-9 items)",
    sources: [NTT_TABLE],
    logic:
      "For each of the 9 PHQ-9 questions, the count/percent of respondents choosing each frequency option " +
      "(Not at all / Several days / Over half the days / Nearly everyday).",
    sql: "UNION ALL of per-question GROUP BY answer counts over the filtered set.",
  },
};

export const GET = withProvenance(
  withCache(makeClinicalHandler("phq", "NTT Depression"), { endpoint: "ntt-wellness/depression" }),
  PROVENANCE,
);
