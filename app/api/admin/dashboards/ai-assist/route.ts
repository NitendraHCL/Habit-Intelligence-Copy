import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { requireAuth } from "@/lib/auth/session";
import { invokeBedrock, type BedrockMessage } from "@/lib/ai/bedrock";
import type { PageDefinition } from "@/lib/dashboard/types";

// Hardcoded model — mirrors app/api/ai/ask/route.ts. Sonnet 4.5 cross-region
// inference profile; same model the page-summary surface uses.
const MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

// Loaded once per server process. ~15K tokens; non-trivial input cost per call
// without prompt caching, but admin-only volume keeps the absolute cost small.
const SYSTEM_DOC = fs.readFileSync(
  path.join(process.cwd(), "lib/dashboard/ai-assist-doc.md"),
  "utf-8",
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiAssistBody {
  messages: ChatMessage[];
  currentConfig?: PageDefinition | null;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as AiAssistBody;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages required" },
        { status: 400 },
      );
    }

    // Current dashboard config is injected as a leading user-turn so the model
    // can ground answers in what's on the canvas. The Bedrock body has a single
    // system string and no cache_control, so we put dynamic config in the
    // messages array, not the system prompt.
    const messages: BedrockMessage[] = [];
    if (body.currentConfig) {
      messages.push({
        role: "user",
        content: `Current dashboard config (JSON):\n\`\`\`json\n${JSON.stringify(body.currentConfig, null, 2)}\n\`\`\`\n\nUse this to ground your answers about the current state. The next message is the user's actual question.`,
      });
      messages.push({
        role: "assistant",
        content: "Understood — I'll reference the current config when relevant.",
      });
    }
    for (const m of body.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    const { text } = await invokeBedrock({
      model: MODEL,
      system: SYSTEM_DOC,
      messages,
      maxTokens: 2048,
      temperature: 0.4,
    });

    return NextResponse.json({ answer: text });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "Error";
    console.error("AI assist error:", { name, message, model: MODEL });
    return NextResponse.json(
      { error: "Failed to get AI response", details: message },
      { status: 500 },
    );
  }
}
