import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getSessionCugCode } from "@/lib/auth/session";
import { executeQuery } from "@/lib/dashboard/query-engine";
import type { QueryRequest } from "@/lib/dashboard/types";
import * as XLSX from "xlsx";

// POST /api/data/export — export query results as Excel
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");

    const cugCode = await getSessionCugCode(clientId ?? undefined);
    if (!cugCode) {
      return NextResponse.json({ error: "No client selected" }, { status: 400 });
    }

    const body = await request.json();
    const { query, chartTitle } = body as {
      query: QueryRequest;
      chartTitle?: string;
    };

    if (!query?.dataSource?.table) {
      return NextResponse.json(
        { error: "query.dataSource.table is required" },
        { status: 400 }
      );
    }

    const result = await executeQuery(query, cugCode);

    // Build workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(result.data);
    XLSX.utils.book_append_sheet(wb, ws, chartTitle?.slice(0, 31) || "Data");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `${(chartTitle ?? "export").replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
