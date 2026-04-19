import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { dataSources } from "@/lib/config/data-sources";
import { chartPresets } from "@/lib/config/chart-presets";

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

    // Try Gemini first (already configured in the project)
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    let chartConfig: Record<string, unknown>;

    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!res.ok) throw new Error("Gemini API error");
      const data = await res.json();
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      chartConfig = JSON.parse(text);
    } else if (anthropicKey) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: anthropicKey });
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text : "{}";
      chartConfig = JSON.parse(text);
    } else {
      return NextResponse.json(
        { error: "No AI provider configured. Set GEMINI_API_KEY or ANTHROPIC_API_KEY." },
        { status: 400 }
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
