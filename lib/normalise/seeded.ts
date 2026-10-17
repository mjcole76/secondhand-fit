/**
 * The seeded pair, normalised by the same pipeline as a seller's photo. The bad flat-lay is not
 * accepted, so it is refused; the retake is normalised. Deterministic; memoised per process.
 * Server-only: it renders the drawn fixtures.
 */

import type { SeededFixtureName } from "@/lib/readiness/contracts";
import { renderSeededFixture, seededFixtureInfo } from "@/lib/readiness/seeded";

import type { NormalisedPair } from "./contracts";
import { describePair, normaliseGarmentImage, type NormaliseOutcome } from "./normalise";

const outcomes = new Map<SeededFixtureName, NormaliseOutcome>();

export function normaliseSeededFixture(name: SeededFixtureName): NormaliseOutcome {
  const cached = outcomes.get(name);
  if (cached) return cached;
  const outcome = normaliseGarmentImage(renderSeededFixture(name), {
    orientation: 1,
    source: seededFixtureInfo(name).source,
  });
  outcomes.set(name, outcome);
  return outcome;
}

export function seededNormalisedUrl(name: SeededFixtureName): string {
  return `/api/normalise/seeded/${name}`;
}

/** The pair for a seeded fixture, or null when it was refused. The "before" is the fixture route's PNG. */
export function seededPair(name: SeededFixtureName): NormalisedPair | null {
  const outcome = normaliseSeededFixture(name);
  if (!outcome.ok) return null;
  const info = seededFixtureInfo(name);
  return describePair(
    info.source,
    outcome.original,
    outcome.normalised,
    outcome.report,
    { original: info.imageUrl, normalised: seededNormalisedUrl(name) },
    `${info.title} (a drawing)`,
  );
}

export function seededRefusal(name: SeededFixtureName): string | null {
  const outcome = normaliseSeededFixture(name);
  if (outcome.ok) return null;
  return outcome.code === "readiness_not_accepted"
    ? "Not normalised: the readiness checks did not accept this photo, so it gets retake instructions instead."
    : "Not normalised: the image produced was outside the VTO input limits.";
}
