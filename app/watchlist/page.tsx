import type { Metadata } from "next";

import { Watchlist } from "@/components/Watchlist";

export const metadata: Metadata = {
  title: "Watchlist — Secondhand Fit",
  description: "Try-on previews saved in this browser. Preview only.",
};

export default function WatchlistPage() {
  return (
    <>
      <h1>Watchlist</h1>
      <p className="lede">
        Previews you saved from the try-on page. The list is kept in this browser only; removing an entry here deletes
        it. Every saved preview keeps its readiness badge and its preview-only label, on the page and in the image.
      </p>
      <Watchlist />
    </>
  );
}
