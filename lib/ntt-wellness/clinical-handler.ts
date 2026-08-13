import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { dwQuery } from "@/lib/db/data-warehouse";
import {
  NTT_CUG,
  parseNttFilters,
  buildNttWhere,
  computeInstrument,
  nttFilterOptions,
  type InstrumentStats,
} from "@/lib/ntt-wellness/scoring";

/**
 * Shared request handler for the two structurally-identical clinical
 * dashboards — Anxiety (GAD-7) and Depression (PHQ-9). Both compute a single
 * instrument's stats over the NTTDATA01-scoped, globally-filtered set and
 * return the same response shape; only the instrument key differs.
 */
const dwQueryLoose = <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
  dwQuery<T & Record<string, unknown>>(sql, p) as Promise<T[]>;

export function makeClinicalHandler(instrument: "gad" | "phq", logLabel: string) {
  return async function handler(request: NextRequest) {
    try {
      await requireAuth();

      const { searchParams } = new URL(request.url);
      const clientId = searchParams.get("clientId");
      const cugCode = await getSessionCugCode(clientId ?? undefined);
      if (!cugCode) {
        return NextResponse.json({ error: "No client selected" }, { status: 400 });
      }
      // NTT Wellness dashboards are NTTDATA01-only — block other tenants.
      if (cugCode !== NTT_CUG) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const filters = parseNttFilters(searchParams);
      const { where, params } = buildNttWhere(filters, 1, "a");

      const failedQueries: string[] = [];
      const safe = async <T>(fn: () => Promise<T>, tag: string, fallback: T): Promise<T> => {
        try {
          return await fn();
        } catch (e) {
          console.error(`${logLabel} query failed [${tag}]:`, e);
          failedQueries.push(tag);
          return fallback;
        }
      };

      const emptyStats: InstrumentStats = {
        key: instrument,
        total: 0,
        average: 0,
        max: 0,
        bands: [],
        actions: { promoter: 0, support: 0, immediate: 0 },
        histogram: [],
        byQuestion: [],
      };

      const [stats, filterOptions] = await Promise.all([
        safe(() => computeInstrument(dwQueryLoose, instrument, where, params, "a"), "stats", emptyStats),
        safe(() => nttFilterOptions(dwQueryLoose), "filterOptions", { genders: [], ageGroups: [] }),
      ]);

      return NextResponse.json({
        kpis: {
          totalRespondents: stats.total,
          averageScore: stats.average,
          promoters: stats.actions.promoter,
          supportNeed: stats.actions.support,
          immediateSupport: stats.actions.immediate,
          maxScore: stats.max,
        },
        filterOptions,
        charts: {
          classificationDistribution: stats.bands,
          actionDistribution: [
            { label: "Positive Responders", count: stats.actions.promoter, action: "promoter" },
            { label: "Responders Needing Support", count: stats.actions.support, action: "support" },
            { label: "Responders Needing Priority Support", count: stats.actions.immediate, action: "immediate" },
          ],
          responseByQuestion: stats.byQuestion,
        },
        lastUpdated: new Date().toISOString(),
        meta: { hadErrors: failedQueries.length > 0, failedQueries },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      console.error(`${logLabel} API error:`, error);
      return NextResponse.json(
        { error: "Internal server error", details: String(error) },
        { status: 500 },
      );
    }
  };
}
