"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { MessageSquareText, Send, X, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth-context";

export interface CommentAnchor {
  chartType?: string;
}

interface CommentData {
  id: string;
  text: string;
  anchor: CommentAnchor;
  createdAt: string;
  user: { id: string; name: string; role: string };
  replies: {
    id: string;
    text: string;
    anchor: CommentAnchor;
    createdAt: string;
    user: { id: string; name: string; role: string };
  }[];
}

const T = {
  kamBg: "#F0F4FF",
  kamBorder: "#C7D6F5",
  kamText: "#1E3A6E",
  kamBadge: "#1E4088",
  clientBg: "#F6FBF9",
  clientBorder: "#C2E5D9",
  clientText: "#1A4D3E",
  clientBadge: "#0AB59E",
  white: "#FFFFFF",
  textPrimary: "#1A1D2B",
  textSecondary: "#5F6478",
  textMuted: "#9399AB",
  border: "#ECEDF2",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function isKamOrInternal(role: string): boolean {
  return ["SUPER_ADMIN", "INTERNAL_OPS", "KAM"].includes(role);
}

function roleBadge(role: string): { bg: string; label: string } {
  if (role === "SUPER_ADMIN") return { bg: "#dc2626", label: "Admin" };
  if (role === "INTERNAL_OPS") return { bg: "#3b82f6", label: "Ops" };
  if (role === "KAM") return { bg: T.kamBadge, label: "KAM" };
  if (role === "CLIENT_ADMIN") return { bg: T.clientBadge, label: "Client" };
  return { bg: "#6B7280", label: role };
}

interface ChartCommentsProps {
  chartId: string;
  pageSlug: string;
  dataPoints?: string[];
  onHighlightAnchor?: (anchor: CommentAnchor | null) => void;
  onRequestAnchor?: (callback: (anchor: CommentAnchor) => void) => void;
}

export function ChartComments({
  chartId,
  pageSlug,
}: ChartCommentsProps) {
  const { user, activeClientId } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Don't render for CLIENT_VIEWER
  if (!user || user.role === "CLIENT_VIEWER") return null;

  const canPost = ["SUPER_ADMIN", "KAM", "CLIENT_ADMIN"].includes(user.role);

  const { data, mutate } = useSWR<{ comments: CommentData[] }>(
    activeClientId
      ? `/api/comments?chartId=${encodeURIComponent(chartId)}&clientId=${activeClientId}&pageSlug=${encodeURIComponent(pageSlug)}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const comments = data?.comments ?? [];

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, comments.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeClientId) return;

    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chartId,
        pageSlug,
        clientId: activeClientId,
        text: trimmed,
        anchor: { chartType: "general" },
        parentId: replyingTo || undefined,
      }),
    });

    setInput("");
    setReplyingTo(null);
    mutate();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this comment?")) return;
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
    mutate();
  };

  const totalCount = comments.reduce((s, c) => s + 1 + c.replies.length, 0);

  return (
    <>
      {/* Comment badge button */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="relative inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors hover:bg-gray-100"
        title="Chart comments"
      >
        <MessageSquareText size={14} style={{ color: T.kamBadge }} />
        {totalCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1"
            style={{ backgroundColor: T.kamBadge }}
          >
            {totalCount}
          </span>
        )}
      </button>

      {/* Modal */}
      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl shadow-2xl"
            style={{ backgroundColor: T.white }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 shrink-0 rounded-t-2xl" style={{ borderBottom: `1px solid ${T.border}` }}>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: T.kamBadge }}>
                  <MessageSquareText size={12} />
                  Comments
                </span>
                <span className="text-[12px] font-medium" style={{ color: T.textMuted }}>
                  {totalCount} comment{totalCount !== 1 ? "s" : ""}
                </span>
              </div>
              <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X size={16} style={{ color: T.textSecondary }} />
              </button>
            </div>

            {/* Thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {comments.map((c) => {
                const badge = roleBadge(c.user.role);
                const isOwn = c.user.id === user.id;
                const isKam = isKamOrInternal(c.user.role);
                return (
                  <div key={c.id}>
                    <div
                      className="rounded-xl px-4 py-3"
                      style={{
                        backgroundColor: isKam ? T.kamBg : T.clientBg,
                        border: `1px solid ${isKam ? T.kamBorder : T.clientBorder}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: badge.bg }}>
                          {c.user.name}
                        </span>
                        <span className="text-[10px]" style={{ color: T.textMuted }}>
                          {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        {(isOwn || user.role === "SUPER_ADMIN") && (
                          <button type="button" onClick={() => handleDelete(c.id)} className="ml-auto p-0.5 text-gray-400 hover:text-red-500">
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </div>
                      <p className="text-[12px] leading-relaxed" style={{ color: isKam ? T.kamText : T.clientText }}>
                        {c.text}
                      </p>
                      {canPost && (
                        <button
                          type="button"
                          onClick={() => setReplyingTo(c.id)}
                          className="text-[10px] text-indigo-600 hover:underline mt-1"
                        >
                          Reply
                        </button>
                      )}
                    </div>
                    {/* Replies */}
                    {c.replies.map((r) => {
                      const rb = roleBadge(r.user.role);
                      const rIsKam = isKamOrInternal(r.user.role);
                      return (
                        <div
                          key={r.id}
                          className="ml-6 mt-2 rounded-xl px-4 py-3"
                          style={{
                            backgroundColor: rIsKam ? T.kamBg : T.clientBg,
                            border: `1px solid ${rIsKam ? T.kamBorder : T.clientBorder}`,
                          }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: rb.bg }}>
                              {r.user.name}
                            </span>
                            <span className="text-[10px]" style={{ color: T.textMuted }}>
                              {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                            {(r.user.id === user.id || user.role === "SUPER_ADMIN") && (
                              <button type="button" onClick={() => handleDelete(r.id)} className="ml-auto p-0.5 text-gray-400 hover:text-red-500">
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-[12px] leading-relaxed" style={{ color: rIsKam ? T.kamText : T.clientText }}>
                            {r.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquareText size={32} style={{ color: T.textMuted }} className="mb-3 opacity-40" />
                  <p className="text-[13px] font-medium" style={{ color: T.textMuted }}>No comments yet</p>
                  {canPost && (
                    <p className="text-[11px] mt-1" style={{ color: T.textMuted }}>
                      Add a comment below to start a discussion about this chart.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Input area */}
            {canPost && (
              <div className="shrink-0 px-5 py-4 rounded-b-2xl" style={{ borderTop: `1px solid ${T.border}`, backgroundColor: "#FAFBFC" }}>
                {replyingTo && (
                  <div className="flex items-center gap-2 mb-2 text-[11px] text-indigo-700">
                    <span>Replying to comment</span>
                    <button type="button" onClick={() => setReplyingTo(null)} className="text-red-500 hover:underline">Cancel</button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                    placeholder={replyingTo ? "Write a reply…" : "Add a comment…"}
                    className="flex-1 h-10 px-4 rounded-xl text-[13px] outline-none"
                    style={{ border: `1px solid ${T.border}`, color: T.textPrimary }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: input.trim() ? T.clientBadge : T.border,
                      color: T.white,
                      cursor: input.trim() ? "pointer" : "default",
                    }}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export type { CommentAnchor as ChartCommentAnchor };
