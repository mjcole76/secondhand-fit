import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { ReadinessBadge } from "@/components/ReadinessBadge";
import { findPublishedListing } from "@/lib/listings/published";
import { GRADE_MEANINGS, READINESS_GRADES } from "@/lib/readiness/grade";
import { VERDICT_MARK, VERDICT_WORD } from "@/lib/readiness/instructions";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";
import { BADGE_SCOPE_NOTE } from "@/lib/tryon/honesty";

export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = findPublishedListing(id);
  if (!listing) notFound();

  const { readiness } = listing;
  return (
    <>
      <p>
        <Link href="/listings">← All listings</Link>
      </p>
      <h1>{listing.title}</h1>
      {listing.isDemo ? (
        <div className="banner info">
          <p>Demo listing. The picture is a drawing made for this project, not a photograph of a real garment.</p>
          {listing.provenance ? (
            <p className="banner-detail">
              Drawn by <code>{listing.provenance.madeBy}</code>. Licence: {listing.provenance.licence}. Recorded in{" "}
              {listing.provenance.register}.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="card" aria-label="Listing">
        <div className="grid-2">
          <div>
            {listing.image ? (
              <img
                className="listing-photo"
                src={listing.image.url}
                alt={listing.image.alt}
                width={listing.image.width}
                height={listing.image.height}
              />
            ) : (
              <p className="listing-photo missing">
                This listing photo is unavailable. Ask the seller to prepare it again.
              </p>
            )}
          </div>
          <div>
            <ReadinessBadge readiness={readiness} />
            <p className="muted">{BADGE_SCOPE_NOTE}</p>
            <dl className="kv">
              <dt>Category</dt>
              <dd>{listing.categoryLabel}</dd>
              <dt>Size (as entered by the seller)</dt>
              <dd>{listing.sizeText ?? "Not given"}</dd>
              {listing.publishedAt ? (
                <>
                  <dt>Published</dt>
                  <dd>{new Date(listing.publishedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
                </>
              ) : null}
            </dl>
            <p>
              <Link className="button-link" href={`/try?listing=${encodeURIComponent(listing.id)}`}>Try this piece on ↗</Link>
            </p>
            <p className="muted">
              The garment photo is selected for you. Add your own photo after the consent step.
            </p>
          </div>
        </div>
      </section>

      <details className="card" aria-labelledby="breakdown-heading">
        <summary id="breakdown-heading">Photo checks behind the grade</summary>
        <p className="muted">
          The grade is read off the weakest check below. The other three cannot raise it: nothing is averaged.
        </p>
        <ul className="check-list">
          {readiness.checks.map((check) => (
            <li key={check.id} className={`check-row ${check.verdict}`}>
              <div className="check-head">
                <strong>
                  {check.label}
                  {readiness.weakestUnique && check.id === readiness.weakestCheck ? " — weakest check" : ""}
                </strong>
                <span className={`verdict ${check.verdict}`}>
                  <span aria-hidden="true">{VERDICT_MARK[check.verdict]}</span> {VERDICT_WORD[check.verdict]} ·{" "}
                  {check.score}/100
                </span>
              </div>
              <div className="score-bar" aria-hidden="true">
                <span style={{ width: `${check.score}%` }} />
              </div>
              <p>{check.summary}</p>
            </li>
          ))}
        </ul>

        <h3>What the grades mean</h3>
        <dl className="kv">
          {READINESS_GRADES.map((grade) => (
            <Fragment key={grade}>
              <dt>Grade {grade}</dt>
              <dd>{GRADE_MEANINGS[grade]}</dd>
            </Fragment>
          ))}
        </dl>
        <p className="muted">
          Thresholds {readiness.thresholdVersion}
          {READINESS_THRESHOLDS.calibrated ? "." : " — provisional, not yet calibrated against live API runs."}
        </p>
      </details>

      {listing.retakeOf ? (
        <section className="card" aria-labelledby="first-attempt-heading">
          <h2 id="first-attempt-heading">Before the retake</h2>
          <div className="grid-2">
            <div>
              <img
                className="listing-photo"
                src={listing.retakeOf.image.url}
                alt={listing.retakeOf.image.alt}
                width={listing.retakeOf.image.width}
                height={listing.retakeOf.image.height}
              />
            </div>
            <div>
              <p>
                The first photo of this listing was refused by the same checks, so it was never listed and no API unit was
                spent on it. The picture above is the retake.
              </p>
              <ReadinessBadge readiness={listing.retakeOf.readiness} variant="attempt" />
              <p>Retake instructions it got:</p>
              <ol className="instruction-list">
                {listing.retakeOf.instructions.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ol>
              <p>
                <Link href={listing.retakeOf.reproduceUrl}>Run the refused photo and the retake yourself →</Link>
              </p>
              <p className="muted">
                No upload or sign-in is needed. Drawn by <code>{listing.retakeOf.provenance.madeBy}</code>. Licence:{" "}
                {listing.retakeOf.provenance.licence}.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
