"use client";

// ── PBI-4: Bookmarks (localStorage-backed named views per dashboard) ──
// Snapshots the user's current filter + chart-visibility state and lets them
// restore it by name. Stored per-dashboard slug in localStorage.

import { useEffect, useState } from "react";
import { Bookmark, BookmarkPlus, X } from "lucide-react";

export interface BookmarkState {
  /** Global filters snapshot (shape must match the page's filter context). */
  filters: unknown;
  /** Chart visibility (if the config system tracks it). */
  chartVisibility?: Record<string, boolean>;
  /** Free-form extras e.g. active tab IDs per chart. */
  extras?: Record<string, unknown>;
}

export interface Bookmark {
  id: string;
  name: string;
  state: BookmarkState;
  createdAt: string;
}

interface BookmarkBarProps {
  dashboardSlug: string;
  /** Called with the snapshot when the user clicks Save. */
  captureState: () => BookmarkState;
  /** Called when the user restores a bookmark. */
  applyState: (state: BookmarkState) => void;
}

function storageKey(slug: string) {
  return `dash-bookmarks:${slug}`;
}

function loadBookmarks(slug: string): Bookmark[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as Bookmark[]) : [];
  } catch {
    return [];
  }
}

function saveBookmarks(slug: string, items: Bookmark[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(items));
  } catch {
    // quota exceeded / disabled — silent
  }
}

export default function BookmarkBar({
  dashboardSlug,
  captureState,
  applyState,
}: BookmarkBarProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setBookmarks(loadBookmarks(dashboardSlug));
  }, [dashboardSlug]);

  function save() {
    const name = window.prompt("Name this view:");
    if (!name?.trim()) return;
    const bm: Bookmark = {
      id: `${Date.now()}`,
      name: name.trim(),
      state: captureState(),
      createdAt: new Date().toISOString(),
    };
    const next = [...bookmarks, bm];
    setBookmarks(next);
    saveBookmarks(dashboardSlug, next);
    setActiveId(bm.id);
  }

  function restore(bm: Bookmark) {
    applyState(bm.state);
    setActiveId(bm.id);
  }

  function remove(id: string) {
    const next = bookmarks.filter((b) => b.id !== id);
    setBookmarks(next);
    saveBookmarks(dashboardSlug, next);
    if (activeId === id) setActiveId(null);
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={save}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[11px] font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 transition-colors"
        title="Save the current filters + toggles as a named view"
      >
        <BookmarkPlus className="size-3" /> Save View
      </button>
      {bookmarks.map((bm) => (
        <span
          key={bm.id}
          className={`inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md text-[11px] font-medium border transition-colors ${
            activeId === bm.id
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
        >
          <button
            type="button"
            onClick={() => restore(bm)}
            className="inline-flex items-center gap-1"
          >
            <Bookmark className="size-3" />
            {bm.name}
          </button>
          <button
            type="button"
            onClick={() => remove(bm.id)}
            className="ml-0.5 p-0.5 rounded hover:bg-black/10"
            aria-label={`Remove bookmark ${bm.name}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
