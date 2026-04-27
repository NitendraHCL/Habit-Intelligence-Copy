import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { dataSources } from "@/lib/config/data-sources";
import { chartPresets } from "@/lib/config/chart-presets";
import { invokeBedrock, BEDROCK_MODEL_IDS } from "@/lib/ai/bedrock";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    if (!["SUPER_ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { prompt } = await request.json();
    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    // Build context for the AI
    const dataSourceContext = Object.entries(dataSources)
      .map(([table, ds]) => {
        const cols = Object.entries(ds.columns)
          .map(([col, def]) => `  - ${col} (${def.type}): ${def.label}`)
          .join("\n");
        return `Table: ${table} (${ds.label})\nCUG Column: ${ds.cugColumn}\nColumns:\n${cols}`;
      })
      .join("\n\n");

    const chartTypesContext = chartPresets
      .map((p) => `- ${p.id}: ${p.label} — ${p.description}`)
      .join("\n");

    const systemPrompt = `You are a dashboard chart configuration assistant. Given a natural language description, generate a valid chart definition JSON.

Available data sources:
${dataSourceContext}

Available chart types:
${chartTypesContext}

Supported metrics: count, count_distinct:<column>, sum:<column>, avg:<column>, min:<column>, max:<column>
Supported time functions for groupBy: month(<col>), week(<col>), year(<col>), day(<col>), dow(<col>), hour(<col>), quarter(<col>)
Supported where operators: eq, neq, in, not_in, gte, lte, gt, lt, between, is_null, like

Respond ONLY with a valid JSON object matching this schema:
{
  "id": "unique-id",
  "type": "<chart_type_id>",
  "title": "Chart Title",
  "subtitle": "Optional description",
  "dataSource": {
    "table": "aggregated_table.xxx",
    "where": { "column": { "operator": "value" } }
  },
  "transform": {
    "groupBy": "column_or_function(column)",
    "metric": "count" or "count_distinct:col",
    "sort": "asc" or "desc",
    "limit": 10,
    "groupRest": "Others"
  },
  "visualization": {
    "colors": ["#hex"],
    "showLegend": true,
    "showGrid": true,
    "height": 350
  }
}

No explanation, no markdown — just the JSON object.`;

    const { text } = await invokeBedrock({
      model: BEDROCK_MODEL_IDS.chartConfig,
      system: systemPrompt,
      maxTokens: 1024,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    // Strip code fences if the model wraps JSON in markdown
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let chartConfig: Record<string, unknown>;
    try {
      chartConfig = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw: text },
        { status: 502 }
      );
    }

    // Ensure it has an id
    if (!chartConfig.id) {
      chartConfig.id = `ai-chart-${Date.now()}`;
    }

    return NextResponse.json({ chart: chartConfig });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("AI chart config error:", error);
    return NextResponse.json(
      { error: "Failed to generate chart config", details: String(error) },
      { status: 500 }
    );
  }
}
