import { NextRequest, NextResponse } from "next/server";
import { invokeBedrock, BEDROCK_MODEL_IDS } from "@/lib/ai/bedrock";

export async function POST(request: NextRequest) {
  try {
    const { pageTitle, kpis, chartSummaries } = await request.json();

    if (!pageTitle) {
      return NextResponse.json(
        { error: "pageTitle is required" },
        { status: 400 }
      );
    }

    const systemPrompt = `You are HabitAI, an analytics assistant for a corporate health & wellness platform called Habit Intelligence. You generate concise page summaries for dashboard pages.

Generate a 2-3 sentence summary of the data shown on the "${pageTitle}" page. The summary should:
- Reference specific numbers from the KPIs provided
- Describe what the data shows at a high level
- Never use emdashes (—) or endashes (–), use commas or periods instead
- Never include recommendations or suggestions
- Never start with "This page" or "The page"
- Be factual and descriptive only, summarizing what is shown below
- Keep it under 80 words

Also generate 3-5 short metric chips (label: value format) that highlight the most important KPIs. Each chip should have a label and value.

Respond in JSON format:
{
  "summary": "the summary text",
  "chips": [
    { "label": "Metric Name", "value": "1,234" },
    ...
  ]
}`;

    const { text } = await invokeBedrock({
      model: BEDROCK_MODEL_IDS.pageSummary,
      system: systemPrompt,
      maxTokens: 512,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: `Page: ${pageTitle}\n\nKPIs:\n${JSON.stringify(kpis, null, 2)}\n\nChart Summaries:\n${JSON.stringify(chartSummaries, null, 2)}`,
        },
      ],
    });

    try {
      const parsed = JSON.parse(text);
      return NextResponse.json(parsed);
    } catch {
      return NextResponse.json({ summary: text, chips: [] });
    }
  } catch (error) {
    console.error("AI Page Summary error:", error);
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 }
    );
  }
}
