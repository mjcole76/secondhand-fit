/**
 * Shared request/response shapes for the try-on API. Imported by both the route handlers and the
 * client component, so it must stay free of server-only imports.
 */

import type { RenderBadge } from "./honesty";
import type { RenderMode } from "./render-id";

/** No "authenticating" stage: the YouCam API V2 takes the API key on every request, with no auth call. */
export type TryOnStageName =
  | "validating"
  | "uploading_garment"
  | "uploading_photo"
  | "task_created";

export interface StageTimestamp {
  stage: TryOnStageName;
  at: number;
}

/**
 * Media type a client puts in Accept on POST /api/tryon to have each server stage reported the
 * moment it starts, one JSON TryOnStreamEvent per line, instead of all at once at the end.
 */
export const TRYON_STREAM_MEDIA_TYPE = "application/x-ndjson";

/** Longest the browser waits for POST /api/tryon to confirm the task, from checking through queued. */
export const TRYON_START_LIMIT_MS = 60_000;

/**
 * Once this much time has passed since the server began a try-on, it starts no further provider
 * step and never creates the task: it answers start_timeout instead. Kept under the browser's
 * limit so a task is not normally created after the page has stopped waiting.
 */
export const TRYON_START_DEADLINE_MS = 45_000;

export type TryOnStreamEvent =
  | ({ type: "stage" } & StageTimestamp)
  /** Always the last line: the status and body the plain JSON response would have had. */
  | { type: "done"; httpStatus: number; body: TryOnCreateResponse | ApiErrorResponse };

export type RenderStatus = "queued" | "generating" | "succeeded" | "timeout" | "failed";

/**
 * Persistent copy that must accompany every render: beside it on the page, and burned into the
 * image itself by lib/tryon/burn-in.ts. Reviewed wording, listed in scripts/copy-guard.mjs.
 */
export const PREVIEW_ONLY_LABEL =
  "AI-generated preview only. No fit, size, condition or authenticity claim is made.";

/**
 * Version of the consent statement below. Change it whenever the statement changes: consent
 * records made under an earlier version stop counting, and POST /api/tryon refuses until the buyer
 * has read and accepted the new wording.
 */
export const CONSENT_SCOPE_VERSION = "2026-10-01.v2";

/** How long a consent record counts for before the buyer is asked again. */
export const CONSENT_TTL_HOURS = 24;

export type ConsentScopeId = "upload" | "provider" | "retention" | "deletion" | "preview";

/**
 * The plain-language consent statement, one item per scope the buyer accepts. Every item must be
 * accepted; the ids accepted are stored on the consent record.
 */
export const CONSENT_SCOPE_ITEMS: readonly { id: ConsentScopeId; heading: string; text: string; accept: string }[] = [
  {
    id: "upload",
    heading: "What is uploaded",
    text: "Two images you choose on the next step: one photo of you and one garment image. Nothing else on your device is read, and the camera or file picker only opens after you agree here.",
    accept: "I agree to upload one photo of me and one garment image.",
  },
  {
    id: "provider",
    heading: "Where it is sent",
    text: "Our server sends both images to the Perfect Corp. YouCam Apparel Virtual Try-On API, which produces one render. They are not sent anywhere else and your photo is never shown to other people on this site.",
    accept: "I agree that both images are sent to the Perfect Corp. YouCam Apparel Virtual Try-On API.",
  },
  {
    id: "retention",
    heading: "How long it is kept",
    text: `Secondhand Fit does not save your photo: it is held in server memory only while it is sent to the API, then discarded. The link to the finished render is held in server memory, never on disk, and is gone when the server restarts. Your consent record is kept for ${CONSENT_TTL_HOURS} hours, or until you withdraw it. Perfect Corp. handles the uploaded images under its own API terms; we do not control how long it keeps them.`,
    accept: "I understand how long each part is kept.",
  },
  {
    id: "deletion",
    heading: "How to delete it",
    text: "The Withdraw consent button on the try-on page deletes your consent record straight away, and no try-on can run again until you agree again. Previews you save live in this browser only and can be removed from the watchlist page.",
    accept: "I understand how to withdraw consent and remove saved previews.",
  },
  {
    id: "preview",
    heading: "What the result is",
    text: PREVIEW_ONLY_LABEL,
    accept: "I understand the render is a preview of appearance only.",
  },
];

/** POST /api/consent request body. */
export interface ConsentRequest {
  /** Published listing the try-on is for; omitted when the runner is opened on its own. */
  listingId?: string | null;
  scopeVersion: string;
  /** Must list every id in CONSENT_SCOPE_ITEMS. */
  accepted: ConsentScopeId[];
}

/** POST, GET and DELETE /api/consent response body. */
export interface ConsentStatusResponse {
  /** True when this session holds a current-version consent record for the listing. */
  consented: boolean;
  scopeVersion: string;
  listingId: string | null;
  acceptedAt?: number;
  expiresAt?: number;
  /** Set by DELETE: how many consent records were deleted. */
  deleted?: number;
}

/** Multipart field on POST /api/tryon naming the listing the consent was given for. */
export const LISTING_ID_FIELD = "listingId";

/**
 * Optional multipart field on POST /api/tryon: the garment photo's analysis grid as JSON
 * ({ width, height, rgbaBase64 }, the shape POST /api/readiness takes). The server scores it and
 * signs the resulting readiness grade into the render id.
 */
export const GARMENT_GRID_FIELD = "garmentGrid";

/**
 * How a render is served. "cache" is reserved for the content-addressed render cache, which is a
 * later build step: nothing is served from it yet.
 */
export type ServingMode = RenderMode | "cache";

export const SERVING_MODE_ORDER: readonly ServingMode[] = ["live", "cache", "precomputed", "mock"];

/** Copy for the mode banner. Every mode other than "live" says in its label that it is not a new live render. */
export const SERVING_MODES: Record<ServingMode, { name: string; label: string; meaning: string; live: boolean }> = {
  live: {
    name: "live",
    label: "live YouCam Apparel VTO render",
    meaning: "rendered now by the Perfect Corp. YouCam Apparel Virtual Try-On API. Spends API units.",
    live: true,
  },
  cache: {
    name: "cached",
    label: "cached — an earlier render served again, not a new API call",
    meaning:
      "an earlier render of the same garment and photo, served again without spending API units. Not in use yet: the render cache is a later build step.",
    live: false,
  },
  precomputed: {
    name: "precomputed",
    label: "precomputed example — not a live result",
    meaning:
      "an example image made in advance, shown when the unit budget or the per-session cap is reached, or when the API errors. It is not a live result and is not made from your photo.",
    live: false,
  },
  mock: {
    name: "mock",
    label: "mock — offline fixtures, not a live result",
    meaning: "pinned fixtures replayed with no API call and no API units spent. The image is a placeholder.",
    live: false,
  },
};

export interface FallbackInfo {
  reason: "budget_exhausted" | "fair_use_cap" | "provider_error" | "guard_error";
  /** Plain-language explanation for the banner. */
  message: string;
  /** Verbatim provider-reported reason, for the developer-visible panel. */
  providerMessage?: string;
  errorKind?: string;
  /** When the per-session cap frees up again (ms since epoch). Only set for fair_use_cap. */
  resetAt?: number;
}

/** Try-on renders one anonymous browser session may start inside the rolling window. */
export interface SessionAllowance {
  cap: number;
  used: number;
  remaining: number;
  windowHours: number;
  /** When the oldest counted try-on leaves the window (ms since epoch). Unset when nothing is counted. */
  resetAt?: number;
}

export interface ServingState {
  /** How the next try-on from this session will be served. */
  mode: ServingMode;
  /** Plain-language reason for the mode. */
  detail: string;
  session: SessionAllowance;
}

/** A labelled precomputed run offered after a render failed or timed out. */
export interface FallbackOffer {
  renderId: string;
  /** Same-origin proxy URL; never a provider URL. */
  resultUrl: string;
  fallback: FallbackInfo;
}

export interface TryOnCreateResponse {
  renderId: string;
  mode: RenderMode;
  /** True only for a render produced by the live API for this request. */
  live: boolean;
  /** Banner copy for `mode`, from SERVING_MODES. */
  modeLabel: string;
  status: RenderStatus;
  /** Server-side stage transitions that happened during the request, with real timestamps. */
  stages: StageTimestamp[];
  timeoutMs: number;
  pollAfterMs: number;
  label: string;
  /** Readiness badge the render inherits from the garment photo. */
  badge: RenderBadge;
  fallback?: FallbackInfo;
  /** How the next try-on from this session will be served, after this one is counted. */
  serving: ServingState;
}

export interface TryOnStatusResponse {
  renderId: string;
  mode: RenderMode;
  live: boolean;
  modeLabel: string;
  status: RenderStatus;
  providerStatus?: string;
  elapsedMs: number;
  timeoutMs: number;
  pollAfterMs: number;
  /** Same-origin proxy URL; never a provider URL. */
  resultUrl?: string;
  error?: string;
  /** Set when a transient poll error occurred and polling should simply continue. */
  transientError?: string;
  label: string;
  /** Readiness badge the render inherits from the garment photo. */
  badge: RenderBadge;
  /** Present when the render failed or timed out: a precomputed example that can be shown instead. */
  fallbackOffer?: FallbackOffer;
}

export interface ApiErrorResponse {
  error: string;
  code:
    | "bad_request"
    | "consent_required"
    | "validation_failed"
    | "not_found"
    | "server_error"
    /** POST /api/tryon passed TRYON_START_DEADLINE_MS before a task was created; no task exists. */
    | "start_timeout";
  /** Set with consent_required: where the buyer gives consent. */
  consentUrl?: string;
  /** Set when the buyer photo failed the photo checks: what to do differently, most important first. */
  retake?: string[];
}
