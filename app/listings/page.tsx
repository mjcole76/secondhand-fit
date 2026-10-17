import type { Metadata } from "next";
import Link from "next/link";

import { ReadinessBadge } from "@/components/ReadinessBadge";
import { listPublishedListings } from "@/lib/listings/published";
import { seededRejection, seededSetAssets } from "@/lib/listings/seeded-set";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Listings — Secondhand Fit",
  description: "Published listings, each with its try-on readiness grade. Preview only.",
};

export default function ListingsPage() {
  const listings = listPublishedListings();
  const refused = seededRejection();
  const assets = seededSetAssets();
  return (
    <>
      <p className="eyebrow">The browse edit</p>
      <div className="section-heading"><h1>Give it a second look.</h1><Link className="button-link secondary" href="/sell/new">List a piece ↗</Link></div>
      <p className="lede">
        Explore the demo collection and published pieces. Each carries a grade for its source photo. Open a listing to see the details and create a preview.
      </p>

      {listings.length === 0 ? (
        <section className="card">
          <h2>No listings yet</h2>
          <p>
            A listing appears here once its garment photo is accepted and published on the{" "}
            <Link href="/sell/new">Sell</Link> page.
          </p>
        </section>
      ) : (
        <ul className="listing-grid">
          {listings.map((listing) => (
            <li key={listing.id} className="card listing-tile">
              <Link href={`/listings/${listing.id}`} aria-label={`View ${listing.title}`}>{listing.image ? (
                <img
                  className="listing-photo"
                  src={listing.image.url}
                  alt={listing.image.alt}
                  width={listing.image.width}
                  height={listing.image.height}
                />
              ) : (
                <p className="listing-photo missing">Photo unavailable.</p>
              )}</Link>
              <h2>
                <Link href={`/listings/${listing.id}`}>{listing.title}</Link>
              </h2>
              {listing.isDemo ? <p className="demo-tag">Demo listing</p> : null}
              <ReadinessBadge readiness={listing.readiness} />
              <p className="muted">
                {listing.categoryLabel}
                {listing.sizeText ? ` · Size as entered by the seller: ${listing.sizeText}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {refused ? (
        <details className="card" aria-labelledby="refused-heading"><summary id="refused-heading">See a rejected photo and its retake</summary>
          <div className="grid-2">
            <div>
              <img
                className="listing-photo"
                src={refused.image.url}
                alt={refused.image.alt}
                width={refused.image.width}
                height={refused.image.height}
              />
            </div>
            <div>
              <p>
                This is the first photo of the Rust T-shirt. The readiness checks refused it, so it was never listed and
                no API unit was spent on it. The demo listing uses the retake.
              </p>
              <ReadinessBadge readiness={refused.readiness} variant="attempt" />
              <p>Retake instructions it got:</p>
              <ol className="instruction-list">
                {refused.instructions.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ol>
              <p>
                <Link href={refused.reproduceUrl}>Run the bad flat-lay and its retake on the Sell page →</Link>
              </p>
              <p className="muted">
                No upload or sign-in is needed: choose &quot;Seeded bad flat-lay&quot;, then &quot;Seeded retake&quot;.
              </p>
            </div>
          </div>
        </details>
      ) : null}

      <details className="card" aria-labelledby="assets-heading"><summary id="assets-heading">About the demo collection</summary>
        <p className="muted">
          Every demo picture is a drawing made by this project&apos;s own code, not a photograph, so no real garment,
          person or brand is shown. Each grade comes from the same checks as a seller&apos;s photo; none is set by hand.
        </p>
        <ul>
          {assets.map((asset) => (
            <li key={asset.url}>
              <a href={asset.url}>{asset.title}</a> — drawn by <code>{asset.provenance.madeBy}</code>. Licence:{" "}
              {asset.provenance.licence}. Recorded in {asset.provenance.register}.
            </li>
          ))}
        </ul>
      </details>

      <p className="muted">
        Sellers&apos; listings are kept in memory and reset when the server restarts; the demo set is always here. How
        the grade is worked out is on the <Link href="/methods#grade">methods page</Link>.
      </p>
    </>
  );
}
