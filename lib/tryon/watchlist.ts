/**
 * Buyer watchlist of saved renders, kept in this browser's localStorage. Nothing is stored on the
 * server: an entry is the opaque render id plus the badge the server reported for it. The image is
 * always fetched through /api/tryon/[renderId]/image, which burns the preview-only label and the
 * badge from the signed id into it, so a saved render cannot be shown without them.
 *
 * Browser-only. The session-scoped, database-backed watchlist replaces this in a later build step.
 */

import type { RenderBadge } from "./honesty";
import type { RenderMode } from "./render-id";

export interface WatchlistItem {
  renderId: string;
  mode: RenderMode;
  badge: RenderBadge;
  /** ms since epoch. */
  savedAt: number;
  listingId?: string;
  listingTitle?: string;
}

const STORAGE_KEY = "sf_watchlist_v1";
const MAX_ITEMS = 24;
const MODES: readonly string[] = ["live", "mock", "precomputed"];

function isItem(value: unknown): value is WatchlistItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const badge = v.badge as Record<string, unknown> | null | undefined;
  return (
    typeof v.renderId === "string" &&
    (v.listingId === undefined || typeof v.listingId === "string") &&
    (v.listingTitle === undefined || typeof v.listingTitle === "string") &&
    typeof v.mode === "string" &&
    MODES.includes(v.mode) &&
    typeof v.savedAt === "number" &&
    !!badge &&
    typeof badge === "object" &&
    typeof badge.title === "string" &&
    typeof badge.reason === "string" &&
    (badge.basis === undefined || typeof badge.basis === "string") &&
    (badge.grade === null || typeof badge.grade === "string")
  );
}

export function renderImageUrl(renderId: string): string {
  return `/api/tryon/${encodeURIComponent(renderId)}/image`;
}

/** Newest first. Anything unreadable counts as an empty watchlist. */
export function readWatchlist(): WatchlistItem[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

function write(items: WatchlistItem[]): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    return true;
  } catch {
    return false;
  }
}

/** Returns false when the browser refused to store the entry (for example in private browsing). */
export function saveToWatchlist(item: WatchlistItem): boolean {
  return write([item, ...readWatchlist().filter((i) => i.renderId !== item.renderId)]);
}

export function removeFromWatchlist(renderId: string): WatchlistItem[] {
  const rest = readWatchlist().filter((i) => i.renderId !== renderId);
  write(rest);
  return rest;
}
