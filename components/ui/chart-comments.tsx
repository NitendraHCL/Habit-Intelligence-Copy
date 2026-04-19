"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { MessageSquareText, Send, X, MapPin, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/contexts/auth-context";

export interface CommentAnchor {
  xValue?: string | number;
  seriesName?: string;
  yValue?: number;
  segmentName?: string;
  cellX?: string;
  cellY?: string;
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

function isKamOrAdmin(role: string): boolean {
  return ["SUPER_ADMIN", "INTERNAL_OPS", "KAM"].includes(role);
}

function anchorLabel(anchor: CommentAnchor): string {
  const parts: string[] = [];
  if (anchor.xValue !== undefined) parts.push(String(anchor.xValue));
  if (anchor.seriesName) parts.push(anchor.seriesName);
  if (anchor.segmentName) parts.push(anchor.segmentName);
  if (anchor.cellX && anchor.cellY) parts.push(`${anchor.cellX} × ${anchor.cellY}`);
  return parts.join(" — ") || "General";
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
  /** Called when user clicks "Show on chart" — parent highlights the anchor point. */
  onHighlightAnchor?: (anchor: CommentAnchor | null) => void;
  /** Called when user wants to pick an anchor point on the chart. Parent enters selection mode. */
  onRequestAnchor?: (callback: (anchor: CommentAnchor) => void) => void;
}

export function ChartComments({
  chartId,
  pageSlug,
  onHighlightAnchor,
  onRequestAnchor,
}: ChartCommentsProps) {
  const { user, activeClientId } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [pendingAnchor, setPendingAnchor] = useState<CommentAnchor | null>(null);
  const [pickingAnchor, setPickingAnchor] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Don't render for CLIENT_VIEWER
  if (!user || user.role === "CLIENT_VIEWER") return null;

  const canPost = ["SUPER_ADMIN", "KAM", "CLIENT_ADMIN"].includes(user.role);

  const { data, mutate } = useSWR<{ comments: CommentData[] }>(
    open && activeClientId
      ? `/api/comments?chartId=${encodeURIComponent(chartId)}&clientId=${activeClientId}&pageSlug=${encodeURIComponent(pageSlug)}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
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

    const anchor = replyingTo
      ? comments.find((c) => c.id === replyingTo)?.anchor ?? { chartType: "general" }
      : pendingAnchor ?? { chartType: "general" };

    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chartId,
        pageSlug,
        clientId: activeClientId,
        text: trimmed,
        anchor,
        parentId: replyingTo || undefined,
      }),
    });

    setInput("");
    setReplyingTo(null);
    setPendingAnchor(null);
    setPickingAnchor(false);
    mutate();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this comment?")) return;
    await fetch(`/api/comments/${id}`, { method: "DELETE" });
    mutate();
  };

  const startAnchorPick = () => {
    if (onRequestAnchor) {
      setPickingAnchor(true);
      onRequestAnchor((anchor) => {
        setPendingAnchor(anchor);
        setPickingAnchor(false);
      });
    } else {
      // No anchor picker available — use general anchor
      setPendingAnchor({ chartType: "general" });
    }
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setOpen(false); onHighlightAnchor?.(null); }}>
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
              <button onClick={() => { setOpen(false); onHighlightAnchor?.(null); }} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
                <X size={16} style={{ color: T.textSecondary }} />
              </button>
            </div>

            {/* Thread */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {comments.map((c) => {
                const badge = roleBadge(c.user.role);
                const isOwn = c.user.id === user.id;
                const isKam = isKamOrAdmin(c.user.role);
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
                        <div className="flex items-center gap-1 ml-auto">
                          <button
                            type="button"
                            onClick={() => onHighlightAnchor?.(c.anchor)}
                            className="inline-flex items-center gap-0.5 text-[10px] text-indigo-600 hover:underline"
                            title="Show on chart"
                          >
                            <MapPin className="size-3" />
                            {anchorLabel(c.anchor)}
                          </button>
                          {(isOwn || user.role === "SUPER_ADMIN") && (
                            <button type="button" onClick={() => handleDelete(c.id)} className="p-0.5 text-gray-400 hover:text-red-500">
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>
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
                      const rIsKam = isKamOrAdmin(r.user.role);
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
                      Click &quot;Pick point&quot; below to add a comment anchored to a specific data point.
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
                {!replyingTo && pendingAnchor && (
                  <div className="flex items-center gap-2 mb-2 text-[11px] text-indigo-700">
                    <MapPin className="size-3" />
                    <span>Anchored to: {anchorLabel(pendingAnchor)}</span>
                    <button type="button" onClick={() => setPendingAnchor(null)} className="text-red-500 hover:underline">Clear</button>
                  </div>
                )}
                {!replyingTo && !pendingAnchor && (
                  <button
                    type="button"
                    onClick={startAnchorPick}
                    disabled={pickingAnchor}
                    className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                  >
                    <MapPin className="size-3" />
                    {pickingAnchor ? "Click a data point on the chart…" : "Pick point on chart"}
                  </button>
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
                    disabled={!input.trim() || (!replyingTo && !pendingAnchor)}
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: input.trim() && (replyingTo || pendingAnchor) ? T.clientBadge : T.border,
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

// Re-export the interface for backward compat
export type { CommentAnchor as ChartCommentAnchor };
