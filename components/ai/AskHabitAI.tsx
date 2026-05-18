"use client";

import { useState, useRef, useEffect } from "react";
import { useAIPanel } from "@/lib/ai-panel-context";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Sparkles, Send, X, BarChart3 } from "lucide-react";

/* ─── Design tokens ─── */
const t = {
  textPrimary: "#1A1D2B",
  textSecondary: "#5F6478",
  textMuted: "#9399AB",
  border: "#ECEDF2",
  purple: "#3B82F6",
  purpleLight: "#EFF6FF",
  teal: "#0AB59E",
  amber: "#F5A623",
  amberLight: "#FFF8ED",
};

/* ─── Context-aware suggested questions ─── */
function getContextQuestions(title: string): string[] {
  const tl = title.toLowerCase();
  if (tl.includes("nps") || tl.includes("satisfaction") || tl.includes("promoter"))
    return ["What drives this NPS score?", "Which area needs most improvement?", "What actions can improve scores?", "How do scores compare across segments?"];
  if (tl.includes("demographic") || tl.includes("age group") || tl.includes("gender") || tl.includes("sunburst"))
    return ["Which demographic has highest usage?", "Are there concerning cohort gaps?", "What targeted interventions make sense?", "How does the male/female split compare?"];
  if (tl.includes("trend") || tl.includes("monthly") || tl.includes("yearly") || tl.includes("visit trend"))
    return ["What is the overall trend direction?", "Which period shows the biggest change?", "What's driving this trend?", "What actions should we take?"];
  if (tl.includes("repeat") || tl.includes("frequency") || tl.includes("recurring") || tl.includes("cohort progression"))
    return ["Who are the most frequent visitors?", "What conditions drive repeat visits?", "How can we reduce unnecessary repeats?", "What's the chronic vs acute split?"];
  if (tl.includes("engagement") || tl.includes("steps") || tl.includes("challenge") || tl.includes("webinar") || tl.includes("adoption"))
    return ["What is the engagement trend?", "Where is drop-off happening?", "How can we improve retention?", "Which cohorts are most active?"];
  if (tl.includes("care plan") || tl.includes("lsmp") || tl.includes("improvement") || tl.includes("compliance"))
    return ["Which care plan performs best?", "What's the compliance rate?", "How can we improve outcomes?", "What does 'no improvement' indicate?"];
  if (tl.includes("referral"))
    return ["Which specialties are most referred?", "What is the conversion rate?", "Are any specialties underserved?", "What can improve referral follow-through?"];
  if (tl.includes("mental") || tl.includes("anxiety") || tl.includes("depression") || tl.includes("emotional") || tl.includes("wellbeing"))
    return ["What mental health trends stand out?", "Which risk levels need urgent attention?", "What interventions are recommended?", "How do anxiety and depression compare?"];
  if (tl.includes("correlation") || tl.includes("annual health check") || tl.includes("ahc") || tl.includes("→"))
    return ["What is the strongest signal here?", "What actions does this data suggest?", "Where are the biggest gaps?", "How can we improve follow-through?"];
  if (tl.includes("location") || tl.includes("specialty") || tl.includes("clinic") || tl.includes("referral matrix"))
    return ["Which location has highest volume?", "Are there geographic disparities?", "What specialist gaps exist?", "Which site needs most attention?"];
  if (tl.includes("alert") || tl.includes("data alert"))
    return ["What is the most critical alert?", "What should we act on first?", "Which metric is most at risk?", "What interventions are needed?"];
  if (tl.includes("health insight") || tl.includes("condition") || tl.includes("disease") || tl.includes("symptom"))
    return ["What is the top condition by volume?", "Which conditions are trending up?", "What preventive actions make sense?", "Which cohorts are most affected?"];
  return [
    "What does this chart show?",
    "What are the key insights?",
    "What actions should we take?",
    "What trends do you see?",
  ];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function AskHabitAI() {
  const { open, context, closePanel } = useAIPanel();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevContextRef = useRef<string | null>(null);

  // Reset messages when context changes
  useEffect(() => {
    const key = context?.title ?? null;
    if (key !== prevContextRef.current) {
      setMessages([]);
      setInput("");
      prevContextRef.current = key;
    }
  }, [context]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || !context) return;

    const userMsg: Message = { role: "user", content: question.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          cardTitle: context.title,
          cardDescription: context.description,
          cardData: context.data,
          kamComments: context.kamComments,
          conversationHistory: messages,
        }),
      });

      const json = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: json.answer || "Sorry, I couldn't process that request.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closePanel()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-walkthrough="ai-panel"
        className="p-0 flex flex-col w-[420px] sm:max-w-[420px]"
      >
        {/* ── Header (purple gradient) ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #1E4088 0%, #3B82F6 60%, #60A5FA 100%)",
            padding: "20px 20px 16px",
            flexShrink: 0,
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={18} color="#fff" />
              </div>
              <div>
                <SheetTitle className="text-white text-[15px] font-bold m-0">
                  Ask HabitAI
                </SheetTitle>
                <p
                  style={{
                    fontSize: 11,
                    color: "rgba(255,255,255,0.75)",
                    margin: "2px 0 0",
                  }}
                >
                  Powered by AI analysis
                </p>
              </div>
            </div>
            <button
              onClick={closePanel}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "rgba(255,255,255,0.15)",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={14} color="#fff" />
            </button>
          </div>

          {/* Context chip + KAM badge */}
          {context && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: 20,
                  background: "rgba(255,255,255,0.2)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  maxWidth: "100%",
                  overflow: "hidden",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {context.title}
                </span>
              </div>
              {context.kamComments && context.kamComments.length > 0 && (
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 9px", borderRadius: 20,
                  background: "linear-gradient(135deg, #D97706, #F59E0B)",
                  fontSize: 10, fontWeight: 800, color: "#fff",
                  textTransform: "uppercase" as const, letterSpacing: "0.06em",
                  flexShrink: 0,
                }}>
                  ★ KAM
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Scrollable content area (everything below header) ── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
          }}
        >
        {/* ── Chart description card ── */}
        {context?.description && (
          <div
            style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${t.border}`,
              background: t.amberLight,
            }}
          >
            <div className="flex items-start gap-2.5">
              <BarChart3 size={14} style={{ color: t.amber, marginTop: 2, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: t.amber, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  About this chart
                </p>
                <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, margin: 0 }}>
                  {context.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── KAM Insights ── */}
        {context?.kamComments && context.kamComments.length > 0 && (
          <div style={{ borderBottom: `1px solid ${t.border}` }}>
            {context.kamComments.map((kam, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 20px",
                  background: "linear-gradient(135deg, #FFFBEB 0%, #FEF9C3 100%)",
                  borderBottom: i < context.kamComments!.length - 1 ? `1px solid #FDE68A` : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 9px", borderRadius: 20,
                    background: "linear-gradient(135deg, #D97706, #F59E0B)",
                    fontSize: 9, fontWeight: 800, color: "#fff",
                    textTransform: "uppercase" as const, letterSpacing: "0.07em",
                  }}>
                    ★ KAM Insight
                  </span>
                  <span style={{ fontSize: 10, color: "#92400E", fontWeight: 600 }}>{kam.author}</span>
                  <span style={{ fontSize: 10, color: "#A78B55" }}>· {kam.date}</span>
                </div>
                <p style={{ fontSize: 12, color: "#78350F", lineHeight: 1.65, margin: 0 }}>
                  {kam.text}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Suggested questions ── */}
        <div
          style={{
            padding: "16px 20px 8px",
            borderBottom: `1px solid ${t.border}`,
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: t.textSecondary,
              margin: "0 0 10px",
            }}
          >
            Suggested questions
          </p>
          <div className="flex flex-wrap gap-2 pb-3">
            {getContextQuestions(context?.title || "").map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                disabled={loading}
                style={{
                  fontSize: 12,
                  color: t.purple,
                  background: t.purpleLight,
                  border: `1px solid ${t.purple}25`,
                  borderRadius: 20,
                  padding: "5px 14px",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.5 : 1,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div
          style={{
            padding: "16px 20px",
          }}
        >
          {messages.length === 0 ? (
            /* Empty state */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                textAlign: "center",
                padding: "0 20px",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: t.purpleLight,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <Sparkles size={24} color={t.purple} />
              </div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: t.textPrimary,
                  margin: "0 0 6px",
                }}
              >
                Ask me about this chart
              </p>
              <p
                style={{
                  fontSize: 12.5,
                  color: t.textSecondary,
                  lineHeight: 1.5,
                  margin: 0,
                  maxWidth: 280,
                }}
              >
                I&apos;ll answer exclusively based on the data shown in
                <strong style={{ color: t.textPrimary }}> {context?.title || "this chart"}</strong>.
                Try asking &quot;What does this chart show?&quot; to get started.
              </p>
            </div>
          ) : (
            /* Messages */
            <div className="flex flex-col gap-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent:
                      msg.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius:
                        msg.role === "user"
                          ? "14px 14px 4px 14px"
                          : "14px 14px 14px 4px",
                      background:
                        msg.role === "user" ? t.purple : "#F8F8FB",
                      color:
                        msg.role === "user" ? "#fff" : t.textPrimary,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <div
                        className="ai-response"
                        dangerouslySetInnerHTML={{
                          __html: formatMarkdown(msg.content),
                        }}
                      />
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "14px 14px 14px 4px",
                      background: "#F8F8FB",
                      fontSize: 13,
                    }}
                  >
                    <TypingDots />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </div>

        {/* ── Input bar ── */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "12px 16px 16px",
            flexShrink: 0,
            borderTop: `1px solid ${t.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: `1.5px solid ${t.border}`,
              borderRadius: 24,
              padding: "4px 4px 4px 16px",
              background: t.purpleLight,
              transition: "border-color 0.15s",
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this chart..."
              disabled={loading}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                color: t.textPrimary,
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background:
                  input.trim() && !loading ? t.purple : t.textMuted,
                border: "none",
                cursor:
                  input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
            >
              <Send size={14} color="#fff" />
            </button>
          </div>
          <p style={{ fontSize: 10, color: t.textMuted, textAlign: "center", marginTop: 8, margin: "8px 0 0" }}>
            Answers are scoped to this chart&apos;s data only
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/* ─── Typing dots animation ─── */
function TypingDots() {
  return (
    <span className="flex gap-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: t.purple,
            opacity: 0.4,
            animation: `typing-dot 1.2s ${i * 0.2}s infinite ease-in-out`,
          }}
        />
      ))}
      <style>{`
        @keyframes typing-dot {
          0%, 60%, 100% { opacity: 0.2; transform: scale(0.8); }
          30% { opacity: 0.8; transform: scale(1); }
        }
      `}</style>
    </span>
  );
}

/* ─── Markdown → HTML ─── */
function formatMarkdown(text: string): string {
  // Split into blocks by double newlines
  const blocks = text.split(/\n{2,}/);

  const html = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return "";

    // Headers: ###, ##, #
    if (/^#{1,3}\s/.test(trimmed)) {
      const level = (trimmed.match(/^#+/) as RegExpMatchArray)[0].length;
      const content = trimmed.replace(/^#+\s*/, "");
      return `<h${level + 2}>${inlineFormat(content)}</h${level + 2}>`;
    }

    // Unordered list block (lines starting with - or *)
    const ulLines = trimmed.split("\n").filter((l) => /^\s*[-*]\s/.test(l));
    if (ulLines.length > 0 && ulLines.length === trimmed.split("\n").length) {
      const items = ulLines
        .map((l) => `<li>${inlineFormat(l.replace(/^\s*[-*]\s+/, ""))}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    }

    // Ordered list block (lines starting with 1. 2. etc.)
    const olLines = trimmed.split("\n").filter((l) => /^\s*\d+[.)]\s/.test(l));
    if (olLines.length > 0 && olLines.length === trimmed.split("\n").length) {
      const items = olLines
        .map((l) => `<li>${inlineFormat(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    }

    // Regular paragraph — preserve single newlines as <br />
    return `<p>${inlineFormat(trimmed).replace(/\n/g, "<br />")}</p>`;
  });

  return html.filter(Boolean).join("");
}

/* ─── Inline formatting: bold, italic, code ─── */
function inlineFormat(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "<em>$1</em>");
}
