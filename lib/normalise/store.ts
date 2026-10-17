/**
 * Normalised garment images, stored per draft listing next to the original they were made from,
 * so the before/after can be shown and a later try-on can send the normalised one.
 *
 * In-memory for now (resets when the server process restarts), like lib/listings/drafts.ts. The
 * object-storage keys on the Listing table (originalImageKey, normalisedImageKey,
 * normalisedImageHash) replace this in a later build step. A retake replaces the listing's pair.
 */

import type { ReadinessSource } from "@/lib/readiness/contracts";

import type { NormalisedPair } from "./contracts";
import { describePair, type EncodedImage, type NormaliseReport } from "./normalise";

export type ImageVariant = "original" | "normalised";

export const IMAGE_VARIANTS: readonly ImageVariant[] = ["original", "normalised"];

export interface StoredNormalisation {
  listingId: number;
  readinessRunId?: number;
  source: ReadinessSource;
  original: EncodedImage;
  normalised: EncodedImage;
  report: NormaliseReport;
  createdAt: number;
}

/** Each pair holds two PNGs of up to a few MB, so far fewer are kept than draft listings. */
const MAX_STORED = 25;

type NormalisedStore = { pairs: StoredNormalisation[] };
const g = globalThis as unknown as { __normalisedImages?: NormalisedStore };

function store(): NormalisedStore {
  if (!g.__normalisedImages) g.__normalisedImages = { pairs: [] };
  return g.__normalisedImages;
}

export function saveNormalisation(entry: Omit<StoredNormalisation, "createdAt">): StoredNormalisation {
  const s = store();
  const stored: StoredNormalisation = { ...entry, createdAt: Date.now() };
  s.pairs = s.pairs.filter((p) => p.listingId !== entry.listingId);
  s.pairs.push(stored);
  if (s.pairs.length > MAX_STORED) s.pairs.splice(0, s.pairs.length - MAX_STORED);
  return stored;
}

export function findNormalisation(listingId: number): StoredNormalisation | undefined {
  return store().pairs.find((p) => p.listingId === listingId);
}

/** Same-origin URL of one stored image. The hash makes a retake's image a new URL. */
export function listingImageUrl(listingId: number, variant: ImageVariant, image: EncodedImage): string {
  return `/api/listings/${listingId}/images/${variant}?v=${image.sha256.slice(0, 12)}`;
}

export function storedPair(stored: StoredNormalisation): NormalisedPair {
  return describePair(
    stored.source,
    stored.original,
    stored.normalised,
    stored.report,
    {
      original: listingImageUrl(stored.listingId, "original", stored.original),
      normalised: listingImageUrl(stored.listingId, "normalised", stored.normalised),
    },
    stored.source === "upload" ? "Your garment photo" : "The seeded T-shirt drawing",
  );
}
