"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { PageDefinition } from "@/lib/dashboard/types";

interface AskAIPanelProps {
  currentConfig: PageDefinition;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How do I add a KPI showing total unique patients?",
  "What chart type should I use for gender split?",
  "How do I make a line chart of visits by month?",
  "Why can't KAM users see my dashboard?",
];

export default function AskAIPanel({ currentConfig }: AskAIPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    setError(null);
    const userMessage: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setPending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/admin/dashboards/ai-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          currentConfig,
        }),
        signal: controller.signal,
      });

      const json = (await res.json()) as { answer?: string; error?: string; details?: string };
      if (!res.ok) {
        throw new Error(json.error || json.details || `Request failed (${res.status})`);
      }
      const answer = (json.answer ?? "").trim();

      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: answer };
        return copy;
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setMessages((prev) => prev.slice(0, -1));
        return;
      }
      setError((err as Error).message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setPending(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    if (pending) stop();
    setMessages([]);
    setError(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100"
        title="Ask AI about the Dashboard Builder"
      >
        <Sparkles size={14} />
        Ask AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                <h2 className="text-sm font-semibold text-gray-800">
                  Ask AI about the Builder
                </h2>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={reset}
                    className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded hover:bg-gray-100"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 leading-5">
                    Ask anything about how the Dashboard Builder works — chart
                    types, data sources, JSON shapes, why something isn&apos;t
                    showing for a role. Answers are grounded in the Builder
                    reference doc.
                  </p>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      Try
                    </p>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border border-gray-200 hover:bg-purple-50 hover:border-purple-200 text-gray-700"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-[12.5px] leading-5 rounded-lg px-3 py-2 ${
                    m.role === "user"
                      ? "bg-indigo-50 text-indigo-900 ml-6"
                      : "bg-gray-50 text-gray-800 mr-6"
                  }`}
                >
                  {m.role === "assistant" && m.content === "" && pending ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-500">
                      <Loader2 size={12} className="animate-spin" />
                      Thinking…
                    </span>
                  ) : m.role === "assistant" ? (
                    <div className="prose-sm max-w-none [&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-[12.5px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-2 [&_h2]:mt-2 [&_h3]:mt-2 [&_h1]:mb-1 [&_h2]:mb-1 [&_h3]:mb-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_code]:bg-white [&_code]:border [&_code]:border-gray-200 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11.5px] [&_code]:font-mono [&_pre]:bg-white [&_pre]:border [&_pre]:border-gray-200 [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:border-0 [&_pre_code]:p-0 [&_strong]:font-semibold [&_a]:text-purple-700 [&_a]:underline">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  )}
                </div>
              ))}

              {error && (
                <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-gray-200 px-3 py-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={2}
                  placeholder="Ask anything about the Dashboard Builder…"
                  className="flex-1 resize-none text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={pending}
                />
                {pending ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="px-3 py-2 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="px-3 py-2 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send size={14} />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
