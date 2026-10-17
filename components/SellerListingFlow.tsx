"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { BlockedCategoryNotice } from "@/components/BlockedCategoryNotice";
import { ReadinessChecker, type SeededFixtureCard } from "@/components/ReadinessChecker";
import {
  BLOCKED_CATEGORIES,
  OPEN_CATEGORIES,
  SCOPE_STATEMENT_PATH,
  findCategory,
} from "@/lib/listings/categories";
import {
  LISTING_LIMITS,
  type CategoryRefusedResponse,
  type DraftListing,
  type ListingCreateRequest,
  type ListingCreateResponse,
} from "@/lib/listings/contracts";
import type { ApiErrorResponse } from "@/lib/tryon/contracts";

interface Props {
  fixtures: SeededFixtureCard[];
}

const SAVE_FAILED = "The listing details could not be saved. Check your connection and try again.";

/** Listing details first, then the photo step. A refused category never reaches the photo step. */
export function SellerListingFlow({ fixtures }: Props) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [sizeText, setSizeText] = useState("");
  const [listing, setListing] = useState<DraftListing | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Scope statement link carried by a server-side 422 refusal, shown with the error.
  const [errorScopeUrl, setErrorScopeUrl] = useState<string | null>(null);

  const selected = findCategory(categoryId);
  const blocked = selected?.blocked ? selected : null;

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (blocked || submitting) return;

    setSubmitting(true);
    setError(null);
    setErrorScopeUrl(null);
    try {
      const body: ListingCreateRequest = { title, category: categoryId, sizeText };
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // The server is the authority on the refused list; a 422 here carries the same reason.
      const data = (await res.json()) as ListingCreateResponse | CategoryRefusedResponse | ApiErrorResponse;
      if (!res.ok || !("listing" in data)) {
        setError("error" in data ? data.error : SAVE_FAILED);
        if ("code" in data && data.code === "category_blocked") setErrorScopeUrl(data.scopeUrl);
        return;
      }
      setListing(data.listing);
    } catch {
      setError(SAVE_FAILED);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <section className="card" aria-labelledby="details-heading">
        <h2 id="details-heading">Listing details</h2>

        {listing ? (
          <>
            <div className="banner ok" role="status">
              Draft listing #{listing.id} created. The photo step below is open.
            </div>
            <dl className="kv">
              <dt>Title</dt>
              <dd>{listing.title}</dd>
              <dt>Category</dt>
              <dd>{listing.categoryLabel}</dd>
              <dt>Size (as entered)</dt>
              <dd>{listing.sizeText ?? "Not given"}</dd>
            </dl>
            <p>
              <button type="button" className="secondary" onClick={() => setListing(null)}>
                Change details
              </button>
            </p>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <p className="muted">
              Choose the category before adding a photo. Some categories cannot be listed; the{" "}
              <Link href={SCOPE_STATEMENT_PATH}>scope statement</Link> lists them and the reasons.
            </p>

            <div className="field">
              <label htmlFor="listing-title">Title</label>
              <input
                id="listing-title"
                type="text"
                required
                maxLength={LISTING_LIMITS.titleMaxChars}
                value={title}
                onChange={(ev) => setTitle(ev.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="listing-category">Category</label>
              <select
                id="listing-category"
                required
                value={categoryId}
                aria-describedby={blocked ? "category-refused" : undefined}
                onChange={(ev) => {
                  setCategoryId(ev.target.value);
                  setError(null);
                  setErrorScopeUrl(null);
                }}
              >
                <option value="">Choose a category</option>
                <optgroup label="Can be listed">
                  {OPEN_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Cannot be listed">
                  {BLOCKED_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              </select>
              {blocked ? <BlockedCategoryNotice id="category-refused" category={blocked} /> : null}
            </div>

            <div className="field">
              <label htmlFor="listing-size">Size on the label (optional)</label>
              <input
                id="listing-size"
                type="text"
                maxLength={LISTING_LIMITS.sizeTextMaxChars}
                value={sizeText}
                aria-describedby="listing-size-note"
                onChange={(ev) => setSizeText(ev.target.value)}
              />
              <p id="listing-size-note" className="muted">
                Stored exactly as you type it. It is shown to buyers as text and never interpreted.
              </p>
            </div>

            {error ? (
              <div className="banner bad" role="alert">
                {error}
                {errorScopeUrl ? (
                  <>
                    {" "}
                    <Link href={errorScopeUrl}>Read the scope statement</Link>
                  </>
                ) : null}
              </div>
            ) : null}

            <button type="submit" disabled={submitting || blocked !== null}>
              {submitting ? "Saving…" : "Continue to the photo"}
            </button>
          </form>
        )}
      </section>

      <ReadinessChecker fixtures={fixtures} listing={listing} />
    </div>
  );
}
