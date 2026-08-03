import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import { withCache } from "@/lib/cache/middleware";
import { withProvenance } from "@/lib/audit/with-provenance";
import type { DashboardProvenance } from "@/lib/audit/provenance";
import {
  NTT_TABLE,
  NTT_CUG,
  parseNttFilters,
  buildNttWhere,
  computeInstrument,
  obstacleDistribution,
  nttFilterOptions,
  type InstrumentStats,
} from "@/lib/ntt-wellness/scoring";

/* ────────────────────────────────────────────────────────────────────
 * NTTDATA01 — Workplace Wellbeing dashboard API (single combined page).
 *
 * fact_kx.ntt_health_risk_assessment (alias `a`), scoped to NTTDATA01/Final.
 * Computes five workplace instruments in-app from raw answers, using the PPT
 * classification logic rescaled to the real question count (= client mock-up
 * bands):
 *   Psychological Safety (0–6) · Peer Relationships (0–9) · Managerial Support
 *   (0–7) · Sense of Belonging (0–9) · Org Infrastructure (0–11)
 * Plus the open-ended "biggest obstacle to wellbeing" distribution.
 * Global filters: Date range, Gender, Age Group.
 * ──────────────────────────────────────────────────────────────────── */

const INSTRUMENTS = [
  { key: "psych", name: "Psychological Safety" },
  { key: "peer", name: "Peer Relationships" },
  { key: "mgr", name: "Managerial Support" },
  { key: "belong", name: "Sense of Belonging & Wellbeing" },
  { key: "org", name: "Organisational Infrastructure & Initiatives" },
] as const;

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Instrument average scores (Psych Safety · Peer · Managerial · Belonging · Org Infra)",
    sources: [NTT_TABLE],
    logic:
      "For each instrument, the per-respondent score = sum of its item CASE maps over the filtered NTTDATA01 rows " +
      "that answered ≥1 of its items; the KPI is the mean score. Maxima: Psych 6, Peer 9, Managerial 7, Belonging 9, Org 11.",
    sql: "WITH per AS (SELECT <sum of CASE maps> sc … WHERE <filters> AND <answered>) SELECT AVG(sc) per instrument.",
  },
  instruments: {
    chart: "Per-instrument classification + question breakdown",
    sources: [NTT_TABLE],
    logic:
      "Each instrument classified with PPT logic rescaled to its question count (mock-up bands): " +
      "Psych High 5–6 / Mod 3–4 / Low <3; Peer Strong 7–9 / Mod 4–6 / Limited <4; Managerial High 6–7 / Mod 4–5 / Low <4; " +
      "Belonging Strong 7–9 / Mod 4–6 / Low <4; Org Supportive 9–11 / Adequate 5–8 / Limited <5. Promoters = top band. " +
      "Per-question charts show the answer distribution for every item.",
    sql: "COUNT(*) FILTER (band) + UNION ALL per-question GROUP BY answer, per instrument.",
  },
  obstacles: {
    chart: "Open-Ended Insights: Biggest Obstacles to Wellbeing",
    sources: [NTT_TABLE],
    logic:
      "Distribution of the single-choice obstacle question ('What is the single biggest obstacle at work…') " +
      "over the filtered set, counted per option and ordered by frequency.",
    sql: "SELECT obstacle, COUNT(*) FROM ntt_health_risk_assessment WHERE <filters> GROUP BY 1 ORDER BY 2 DESC.",
  },
};

async function handler(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) return NextResponse.json({ error: "No client selected" }, { status: 400 });
    if (cugCode !== NTT_CUG) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const filters = parseNttFilters(searchParams);
    const { where, params } = buildNttWhere(filters, 1, "a");

    const failedQueries: string[] = [];
    const dwQueryLoose = <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
      dwQuery<T & Record<string, unknown>>(sql, p) as Promise<T[]>;
    const safe = async <T>(fn: () => Promise<T>, tag: string, fb: T): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        console.error(`NTT Workplace query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return fb;
      }
    };

    const emptyStats = (key: string): InstrumentStats => ({
      key, total: 0, average: 0, max: 0, bands: [],
      actions: { promoter: 0, support: 0, immediate: 0 }, histogram: [], byQuestion: [],
    });

    const [statsList, obstacles, filterOptions] = await Promise.all([
      Promise.all(
        INSTRUMENTS.map((ins) =>
          safe(
            () => computeInstrument(dwQueryLoose, ins.key as "psych", where, params, "a"),
            ins.key,
            emptyStats(ins.key),
          ),
        ),
      ),
      safe(() => obstacleDistribution(dwQueryLoose, where, params, "a"), "obstacles", []),
      safe(() => nttFilterOptions(dwQueryLoose), "filterOptions", { genders: [], ageGroups: [] }),
    ]);

    const instruments = INSTRUMENTS.map((ins, i) => ({
      key: ins.key,
      name: ins.name,
      average: statsList[i].average,
      max: statsList[i].max,
      total: statsList[i].total,
      promoters: statsList[i].actions.promoter,
      support: statsList[i].actions.support + statsList[i].actions.immediate,
      classification: statsList[i].bands,
      byQuestion: statsList[i].byQuestion,
    }));

    const kpis = Object.fromEntries(instruments.map((ins) => [ins.key, ins.average]));

    return NextResponse.json({
      kpis,
      filterOptions,
      charts: { instruments, obstacles },
      lastUpdated: new Date().toISOString(),
      meta: { hadErrors: failedQueries.length > 0, failedQueries },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("NTT Workplace Wellbeing API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "ntt-wellness/workplace-wellbeing" }),
  PROVENANCE,
);
