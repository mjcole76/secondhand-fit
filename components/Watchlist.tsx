"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RenderPreview } from "@/components/RenderPreview";
import { readWatchlist, removeFromWatchlist, renderImageUrl, type WatchlistItem } from "@/lib/tryon/watchlist";

/** Saved renders from this browser. Each one is shown through RenderPreview, label and badge included. */
export function Watchlist() {
  // Null until localStorage has been read, which can only happen in the browser.
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => setItems(readWatchlist()), []);

  if (items === null) {
    return (
      <p className="muted" role="status">
        Loading your watchlist…
      </p>
    );
  }

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      {items.length === 0 ? (
        <section className="card">
          <h2>Nothing saved yet</h2>
          <p>
            Run a try-on on the <Link href="/try">Try it on</Link> page and choose <strong>Save to watchlist</strong>{" "}
            under the result. The saved preview appears here with its readiness badge and its preview-only label.
          </p>
        </section>
      ) : (
        <ul className="watchlist">
          {items.map((item) => (
            <li key={item.renderId} className="card">
              {item.listingId ? <p><Link href={`/listings/${encodeURIComponent(item.listingId)}`}>{item.listingTitle ?? "View listing"} →</Link></p> : null}
              <h2>Saved {new Date(item.savedAt).toLocaleString()}</h2>
              <RenderPreview url={renderImageUrl(item.renderId)} mode={item.mode} badge={item.badge}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setItems(removeFromWatchlist(item.renderId));
                    setAnnouncement("Preview removed from your watchlist.");
                  }}
                >
                  Remove from watchlist
                </button>
              </RenderPreview>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
