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
  nttFilterOptions,
  type InstrumentStats,
} from "@/lib/ntt-wellness/scoring";

/* ────────────────────────────────────────────────────────────────────
 * NTTDATA01 — TISE Self-Esteem Wellness dashboard API.
 *
 * fact_kx.ntt_health_risk_assessment (alias `a`), scoped to NTTDATA01/Final.
 * TISE score (0–2) = sum of the 2 items (Yes 1 / No 0), PPT scoring verbatim:
 * score 2 → High self-esteem (Promoter); < 2 → Low self-esteem (Support).
 * Global filters: Date range, Gender, Age Group.
 * ──────────────────────────────────────────────────────────────────── */

const PROVENANCE: DashboardProvenance = {
  kpis: {
    chart: "Headline KPIs (Total Respondents · Average Score · Promoters · Support)",
    sources: [NTT_TABLE],
    logic:
      "Over the filtered NTTDATA01 rows that answered ≥1 TISE item. TISE score = sum of the 2 Yes(1)/No(0) items, " +
      "range 0–2. Average = mean score. Promoters = score 2 (High self-esteem); Support = score < 2 (Low).",
    sql: "WITH per AS (SELECT <sum of 2 CASE maps> sc … WHERE <filters> AND <answered>) SELECT COUNT(*), AVG(sc), COUNT(*) FILTER (sc=2), COUNT(*) FILTER (sc<2).",
  },
  classificationDistribution: {
    chart: "Classification Distribution (High vs Low self-esteem)",
    sources: [NTT_TABLE],
    logic: "Per-respondent TISE score bucketed: 2 High self-esteem, 0–1 Low self-esteem.",
    sql: "COUNT(*) FILTER (WHERE sc = 2) vs COUNT(*) FILTER (WHERE sc < 2).",
  },
  scoreBreakdown: {
    chart: "Score Breakdown (0 / 1 / 2)",
    sources: [NTT_TABLE],
    logic: "Count of respondents at each possible TISE score: 0 (Both No), 1 (One Yes), 2 (Both Yes).",
    sql: "COUNT(*) FILTER (WHERE sc = 0/1/2).",
  },
  responseByQuestion: {
    chart: "Question-wise Response Analysis (Yes / No per item)",
    sources: [NTT_TABLE],
    logic: "For each of the 2 TISE questions, the count of Yes vs No answers over the filtered set.",
    sql: "UNION ALL of per-question GROUP BY answer counts.",
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
        console.error(`NTT Self-Esteem query failed [${tag}]:`, e);
        failedQueries.push(tag);
        return fb;
      }
    };

    const emptyStats: InstrumentStats = {
      key: "tise", total: 0, average: 0, max: 2, bands: [],
      actions: { promoter: 0, support: 0, immediate: 0 }, histogram: [], byQuestion: [],
    };

    const [stats, filterOptions] = await Promise.all([
      safe(() => computeInstrument(dwQueryLoose, "tise", where, params, "a"), "stats", emptyStats),
      safe(() => nttFilterOptions(dwQueryLoose), "filterOptions", { genders: [], ageGroups: [] }),
    ]);

    return NextResponse.json({
      kpis: {
        totalRespondents: stats.total,
        averageScore: stats.average,
        promoters: stats.actions.promoter,
        supportNeed: stats.actions.support,
        maxScore: stats.max,
      },
      filterOptions,
      charts: {
        classificationDistribution: stats.bands,
        scoreBreakdown: stats.histogram, // [{score:0},{score:1},{score:2}]
        responseByQuestion: stats.byQuestion,
      },
      lastUpdated: new Date().toISOString(),
      meta: { hadErrors: failedQueries.length > 0, failedQueries },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("NTT Self-Esteem API error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}

export const GET = withProvenance(
  withCache(handler, { endpoint: "ntt-wellness/self-esteem" }),
  PROVENANCE,
);
