import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import {
  executeQuery,
  QueryValidationError,
} from "@/lib/dashboard/query-engine";
import type { QueryRequest } from "@/lib/dashboard/types";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    // When the builder's "Test Query" button fires this endpoint, it passes
    // ?testMode=1 so we can give the query a more generous statement_timeout
    // without relaxing the ceiling for production dashboard requests.
    const isTestMode = searchParams.get("testMode") === "1";

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json(
        { error: "No client selected" },
        { status: 400 }
      );
    }

    const body = (await request.json()) as QueryRequest;

    if (!body.dataSource?.table) {
      return NextResponse.json(
        { error: "dataSource.table is required" },
        { status: 400 }
      );
    }

    const result = await executeQuery(
      body,
      cugCode,
      isTestMode ? { statementTimeoutMs: 60_000 } : undefined
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof QueryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Data query API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
