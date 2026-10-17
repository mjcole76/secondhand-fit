/**
 * Published listings, each carrying its try-on readiness grade.
 *
 * A draft is published from the latest readiness attempt recorded against it on the server. The
 * grade is the one that attempt was given by lib/readiness/grade.ts; nothing about it is taken
 * from the publish request. An attempt with a failing check keeps grade C and is never published.
 *
 * In-memory for now (resets when the server process restarts), like lib/listings/drafts.ts. The
 * Prisma-backed Listing table replaces the storage in a later build step. Server-only: the seeded
 * demo listing set (lib/listings/seeded-set.ts) renders its drawings.
 */

import { findNormalisation, storedPair } from "@/lib/normalise/store";
import type { GradedReadiness } from "@/lib/readiness/grade";
import { latestReadinessRunForListing } from "@/lib/readiness/runs";
import { seededFixtureForSource, seededFixtureInfo } from "@/lib/readiness/seeded";

import { listingReadiness, type DraftListing, type PublishRefusedResponse, type PublishedListing } from "./contracts";
import { SEEDED_FIXTURE_PROVENANCE, seededDemoListings } from "./seeded-set";

const MAX_PUBLISHED = 500;

/** The seeded demo listing made from the retake of the seeded bad flat-lay. */
export const DEMO_LISTING_ID = "demo-tee";

type PublishedStore = { listings: PublishedListing[] };
const g = globalThis as unknown as { __publishedListings?: PublishedStore };

function store(): PublishedStore {
  if (!g.__publishedListings) g.__publishedListings = { listings: [] };
  return g.__publishedListings;
}

function seededImage(name: "bad" | "retake"): NonNullable<PublishedListing["image"]> {
  const info = seededFixtureInfo(name);
  return { url: info.imageUrl, alt: info.alt, width: info.width, height: info.height };
}

export type PublishOutcome =
  | { ok: true; listing: PublishedListing }
  | { ok: false; code: PublishRefusedResponse["code"]; graded: GradedReadiness | null };

/**
 * Publishes a draft with the grade of its latest readiness attempt. Publishing again after a
 * retake replaces the listing and its grade.
 */
export function publishListing(draft: DraftListing): PublishOutcome {
  const run = latestReadinessRunForListing(draft.id);
  if (!run) return { ok: false, code: "no_readiness_run", graded: null };

  // A failing check is a hard stop: however well the other checks scored, the listing stays a draft.
  if (!run.accepted || !run.graded || run.graded.grade === "C") {
    return { ok: false, code: "readiness_not_accepted", graded: run.graded };
  }

  const fixture = seededFixtureForSource(run.source);
  const stored = findNormalisation(draft.id);
  if (!fixture && (!stored || stored.source !== run.source || stored.readinessRunId !== run.id)) {
    return { ok: false, code: "photo_not_prepared", graded: run.graded };
  }
  const listing: PublishedListing = {
    id: String(draft.id),
    title: draft.title,
    category: draft.category,
    categoryLabel: draft.categoryLabel,
    sizeText: draft.sizeText,
    status: "published",
    isDemo: fixture !== null,
    image: fixture ? seededImage(fixture) : stored ? storedPair(stored).normalised : null,
    provenance: fixture ? SEEDED_FIXTURE_PROVENANCE : null,
    retakeOf: null,
    readiness: listingReadiness(run.graded, run.checks, run.thresholdVersion),
    publishedAt: new Date().toISOString(),
  };

  const s = store();
  s.listings = s.listings.filter((l) => l.id !== listing.id);
  s.listings.push(listing);
  if (s.listings.length > MAX_PUBLISHED) s.listings.splice(0, s.listings.length - MAX_PUBLISHED);
  return { ok: true, listing };
}

/**
 * Sellers' listings, newest first, then the seeded demo listing set. The demo listings are graded
 * at run time by the same code as any photo, and listed only while their drawings are accepted.
 */
export function listPublishedListings(): PublishedListing[] {
  const own = [...store().listings].reverse();
  return [...own, ...seededDemoListings()];
}

export function findPublishedListing(id: string): PublishedListing | undefined {
  return seededDemoListings().find((l) => l.id === id) ?? store().listings.find((l) => l.id === id);
}
