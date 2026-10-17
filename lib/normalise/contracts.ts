/**
 * Shared shapes for garment image normalisation. Imported by the route handlers and the client
 * components, so it must stay free of server-only imports.
 */

import type {
  AttemptGrade,
  ReadinessRunResponse,
  ReadinessSource,
  RetakeInstruction,
  SeededFixtureName,
} from "@/lib/readiness/contracts";

export type NormaliseStepId = "orient" | "metadata" | "crop" | "background" | "resize" | "encode";

/** One step of the pipeline, with what it did to this image in plain language. */
export interface NormaliseStep {
  id: NormaliseStepId;
  label: string;
  /** False when the step left the image as it was (for example, already upright). */
  applied: boolean;
  detail: string;
}

/** The normalised image measured against one VTO input limit. */
export interface ConstraintCheck {
  id: "format" | "dimensions" | "bytes";
  label: string;
  limit: string;
  actual: string;
  ok: boolean;
}

export interface NormalisedImageInfo {
  /** Same-origin URL of the stored image. */
  url: string;
  alt: string;
  width: number;
  height: number;
  bytes: number;
  contentType: "image/png";
  sha256: string;
}

/** An accepted garment photo and the normalised image made from it, stored side by side. */
export interface NormalisedPair {
  source: ReadinessSource;
  /** The photo as received: upright, metadata removed, otherwise unchanged. */
  original: NormalisedImageInfo;
  /** The garment image a try-on sends to the YouCam Apparel VTO API. */
  normalised: NormalisedImageInfo;
  steps: NormaliseStep[];
  /** The crop, in pixels of the original. */
  crop: { x: number; y: number; width: number; height: number };
  /** Share of the normalised image flattened to the neutral colour, 0–1. */
  suppressedAreaFrac: number;
  constraints: ConstraintCheck[];
  withinConstraints: boolean;
  /** False while the VTO input limits are transcribed from the docs and not yet confirmed by a live render. */
  constraintsConfirmed: boolean;
  /** Grade of the server's own readiness check on the pixels it normalised. */
  grade: AttemptGrade | null;
  settingsVersion: string;
}

/** POST /api/listings/[id]/normalise body on success. */
export interface NormaliseResponse {
  listingId: number;
  pair: NormalisedPair;
  /** Usage ledger snapshot taken around the request. Normalisation never calls the provider. */
  providerCalls: ReadinessRunResponse["providerCalls"];
  recordedAt: string;
}

/**
 * 422 body when the server's own readiness check does not accept the photo, or when the image it
 * made is outside the VTO input limits. Nothing is stored.
 */
export interface NormaliseRefusedResponse {
  error: string;
  code: "readiness_not_accepted" | "outside_input_limits";
  grade: AttemptGrade | null;
  instructions: RetakeInstruction[];
  normalised: false;
}

/** GET /api/normalise/seeded body: the seeded pair, normalised by the same code at build time. */
export interface SeededNormaliseResponse {
  settingsVersion: string;
  fixtures: Array<{
    name: SeededFixtureName;
    source: ReadinessSource;
    title: string;
    /** Null when the fixture is not accepted, so it is not normalised. */
    pair: NormalisedPair | null;
    /** Why the fixture was not normalised. Null when it was. */
    refusal: string | null;
  }>;
}
