/**
 * Shared shapes for the seller readiness checker. Imported by the browser component, the route
 * handlers and the scoring code, so it must stay free of server-only imports.
 */

/** RGBA pixels, row-major, 4 bytes per pixel (the layout of a canvas ImageData). */
export interface PixelGrid {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type CheckId = "framing" | "background" | "flatness" | "occlusion_shadow";

export type Verdict = "pass" | "warn" | "fail";

/** Why a check scored the way it did. Selects the summary line and the retake instruction. */
export type CheckReason =
  | "ok"
  | "not_found"
  | "clipped"
  | "too_tight"
  | "too_small"
  | "patterned"
  | "low_contrast"
  | "creased"
  | "shadow"
  | "intrusion";

export interface CheckResult {
  id: CheckId;
  label: string;
  /** 0–100, higher is better. */
  score: number;
  verdict: Verdict;
  reason: CheckReason;
  /** Plain-language explanation of the verdict. */
  summary: string;
  /** False when the garment outline was not found, so the check could not be scored. */
  assessed: boolean;
  /** Raw numbers behind the score, for the developer panel and the methods write-up. */
  metrics: Record<string, number>;
}

export interface RetakeInstruction {
  order: number;
  checkId: CheckId;
  checkLabel: string;
  /** "required" comes from a failing check, "optional" from a warning. */
  severity: "required" | "optional";
  title: string;
  detail: string;
}

export interface ReadinessResult {
  /** True when no check failed. Warnings do not block acceptance. */
  accepted: boolean;
  /** False when no garment outline could be separated from the surface. */
  garmentFound: boolean;
  checks: CheckResult[];
  /** At most three, ordered; empty when every check passes. */
  instructions: RetakeInstruction[];
  thresholdVersion: string;
  grid: { width: number; height: number };
}

export type SeededFixtureName = "bad" | "retake";

export type ReadinessSource = "upload" | "seeded-bad" | "seeded-retake";

/** POST /api/readiness body. `grid` is the downsampled analysis grid, never the full photo. */
export interface ReadinessRunRequest {
  source: ReadinessSource;
  /** Listing category id. Required when source is "upload"; a refused category gets no run. */
  category?: string;
  /** Draft listing the attempt belongs to. The listing can be published from its latest accepted attempt. */
  listingId?: number;
  grid?: { width: number; height: number; rgbaBase64: string };
}

/** A grade with the reason it is not higher, as returned by the readiness routes. */
export interface AttemptGrade {
  grade: "A" | "B" | "C";
  /** The check that decides the grade. */
  weakestCheck: CheckId;
  weakestReason: CheckReason;
  reason: string;
}

export interface ReadinessRunResponse {
  runId: number;
  /** Draft listing the attempt was recorded against, or null. */
  listingId: number | null;
  source: ReadinessSource;
  result: ReadinessResult;
  /** Grade of this attempt, read off its weakest check. Rejected attempts are graded too. */
  grade: AttemptGrade | null;
  /** Usage ledger snapshot taken around the run. Readiness never calls the provider. */
  providerCalls: {
    ledgerEntriesBefore: number;
    ledgerEntriesAfter: number;
    ledgerEntriesAdded: number;
  };
  recordedAt: string;
}

export interface SeededFixtureInfo {
  name: SeededFixtureName;
  source: ReadinessSource;
  title: string;
  description: string;
  alt: string;
  imageUrl: string;
  width: number;
  height: number;
}

/** GET /api/readiness/seeded body. */
export interface SeededFixturesResponse {
  thresholdVersion: string;
  fixtures: Array<SeededFixtureInfo & { expected: ReadinessResult; grade: AttemptGrade | null }>;
}
