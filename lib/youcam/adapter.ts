/**
 * Perfect Corp. YouCam API — Apparel Virtual Try-On adapter (single file), API V2.
 *
 * This is the ONLY module that talks to the YouCam API. Everything it needs to know about the
 * provider (base URL, auth scheme, feature slug, endpoint paths, category enum, input limits,
 * error codes, polling bounds) is pinned in YOUCAM_PINNED below.
 *
 * Flow (server-to-server only, the API key never leaves this module). Every request to the API host
 * carries `Authorization: Bearer <YOUCAM_API_KEY>`; V2 has no token exchange.
 *   1. prepare        jpg/jpeg/png only (webp converted to JPEG with sharp), long side <= 4096 px,
 *                     under 10 MB — checked locally before any request is issued
 *   2. upload         POST {base}/s2s/v2.0/file/cloth           -> data.files[0].file_id + requests[0]
 *                     PUT  {requests[0].url}                    <- raw bytes, exactly requests[0].headers
 *   3. create task    POST {base}/s2s/v2.0/task/cloth           -> data.task_id
 *                     body: src_file_id (person), ref_file_id (garment), garment_category
 *   4. poll (bounded) GET  {base}/s2s/v2.0/task/cloth/{task_id} -> data.task_status running | success | error
 *   5. result         data.results.url (valid about 2 hours; fetched server-side and proxied)
 *   unit cost         GET  {base}/s2s/v2.0/credit/feature-cost
 *
 * Bounds: every outbound request has a hard timeout (poll.requestTimeoutMs); transient failures
 * are retried a bounded number of times; task creation, which spends units, is never re-sent after
 * it may have reached the provider; a status check is a single attempt, retried across polls.
 * Provider-sourced text is passed through redactSecrets before it can reach a response or a log.
 * Documented error_code values are mapped to specific user-facing messages (YOUCAM_ERROR_MESSAGES).
 * The redacted shape of every live response is kept in memory (observedResponses) and shown on
 * /status, so the pins and fixtures can be confirmed against what the API actually returned.
 *
 * Mock mode (YOUCAM_MOCK=true, or no YOUCAM_API_KEY) replays the pinned fixtures in
 * lib/youcam/fixtures through the same response parsers and performs zero outbound requests.
 *
 * VERIFICATION STATUS: the V2 paths, auth scheme, body fields, category enum, error codes and input
 * limits come from the YouCam API documentation (https://yce.perfectcorp.com/document/index.html)
 * as summarised by the entrant. They have NOT yet been confirmed by a live render from this
 * codebase. See README.md "Verifying the YouCam integration".
 */

import { createHash, randomBytes } from "node:crypto";

import sharp from "sharp";

import fileUploadFixture from "./fixtures/file-upload.response.json";
import taskCreateFixture from "./fixtures/task-create.response.json";
import taskRunningFixture from "./fixtures/task-status.running.json";
import taskSuccessFixture from "./fixtures/task-status.success.json";

if (typeof window !== "undefined") {
  throw new Error("lib/youcam/adapter.ts is server-only and must never be imported by client code.");
}

// ---------------------------------------------------------------------------
// Pinned provider facts
// ---------------------------------------------------------------------------

export const GARMENT_CATEGORIES = ["upper_body", "lower_body", "full_body", "auto", "shoes"] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

export const YOUCAM_PINNED = {
  /** Public API host from the YouCam API documentation. YOUCAM_BASE_URL overrides it. */
  baseUrl: "https://yce-api-01.perfectcorp.com",
  /** Path version segment of the V2 server-to-server API. */
  apiVersion: "v2.0",
  /** Sent on every request to the API host. There is no auth endpoint in V2. */
  auth: {
    header: "Authorization",
    scheme: "Bearer",
    description: "Authorization: Bearer <YOUCAM_API_KEY> on every request. No token exchange; YOUCAM_SECRET_KEY is not used.",
  },
  /** Path templates. {version}, {feature} and {task_id} are substituted at runtime. */
  paths: {
    file: "/s2s/{version}/file/{feature}",
    task: "/s2s/{version}/task/{feature}",
    taskStatus: "/s2s/{version}/task/{feature}/{task_id}",
    featureCost: "/s2s/{version}/credit/feature-cost",
  },
  /** Feature slug for Apparel (clothes) virtual try-on. */
  feature: "cloth",
  /** Garment category sent on task creation; must be one of GARMENT_CATEGORIES. */
  category: "upper_body" as GarmentCategory,
  /**
   * Field names in the task-creation body. template_id is never sent: it must not be combined with
   * ref_file_id, and this adapter always sends the garment as ref_file_id.
   */
  taskBodyFields: {
    person: "src_file_id",
    garment: "ref_file_id",
    category: "garment_category",
  },
  /** Input constraints, checked before any request is issued. */
  input: {
    /** "Under 10 MB". Whether the API means 10 × 1024² or 10 × 1000² bytes is unverified. */
    maxBytes: 10 * 1024 * 1024,
    allowedMime: ["image/jpeg", "image/png"] as const,
    /** Accepted from the browser, converted to JPEG with sharp before upload. */
    convertToJpeg: ["image/webp"] as const,
    /** Our own floor for the normaliser, not a documented provider limit. */
    minSidePx: 256,
    maxSidePx: 4096,
    /** Decoded pixel count above which an input is refused (decompression-bomb guard). Our own limit. */
    maxInputPixels: 50_000_000,
    /** JPEG quality used when an image has to be re-encoded. Our own choice. */
    jpegQuality: 90,
  },
  /** Polling bounds. Our own limits, not provider facts. */
  poll: {
    timeoutMs: 90_000,
    defaultIntervalMs: 2_000,
    maxIntervalMs: 5_000,
    maxTransientRetries: 3,
    /** Hard limit on any single outbound request (headers and body), so no call can hang a route. */
    requestTimeoutMs: 15_000,
  },
  /** Largest render image downloaded from a result URL. Our own limit, not a provider fact. */
  output: {
    maxBytes: 20 * 1024 * 1024,
    /** The documented lifetime of data.results.url. */
    resultUrlValidMs: 2 * 60 * 60 * 1000,
  },
  /** Units per render. Recorded as an ESTIMATE until observed spend is captured from a live run. */
  estimatedUnitCost: 1,
  /** How long a feature-cost answer is reused before the API is asked again. Our own choice. */
  featureCostTtlMs: 60 * 60 * 1000,
  /** Version tag included in the render cache key when caching lands (P1). */
  modelParamVersion: "apparel-vto/v2.0/cloth/2026-10-01",
  verification: {
    liveRenderConfirmed: false,
    note:
      "V2 endpoint paths, Bearer auth, task body fields, the category enum, the error codes and the input limits are taken from the YouCam API documentation and must be confirmed by a live render before the demo. The feature-cost response shape and the placement of error_code inside a failed task's data are not documented in the summary used here and are read defensively.",
  },
} as const;

export type AllowedMime = (typeof YOUCAM_PINNED.input.allowedMime)[number];
/** Raster types recognised from magic bytes: what may be uploaded, plus WebP, which is converted. */
export type SniffedMime = AllowedMime | "image/webp";

// ---------------------------------------------------------------------------
// Documented error codes and the user-facing message for each
// ---------------------------------------------------------------------------

export const YOUCAM_ERROR_CODES = [
  "error_no_shoulder",
  "error_large_face_angle",
  "exceed_max_filesize",
  "invalid_parameter",
  "error_download_image",
  "error_decode_image",
  "error_inference",
  "error_nsfw_content_detected",
  "error_multiple_people",
  "error_unsupport_ratio",
  "unknown_internal_error",
] as const;
export type YouCamErrorCode = (typeof YOUCAM_ERROR_CODES)[number];

/** One specific message per documented error_code, written for the buyer. */
export const YOUCAM_ERROR_MESSAGES: Record<YouCamErrorCode, string> = {
  error_no_shoulder:
    "Your shoulders could not be found in your photo. Retake it facing the camera, from the waist up, with both shoulders in the frame.",
  error_large_face_angle:
    "Your face is turned too far away from the camera. Retake the photo looking straight at the camera.",
  exceed_max_filesize: "One of the images is too large for the YouCam API, which takes files under 10 MB. Use a smaller image.",
  invalid_parameter:
    "The YouCam API refused the request as invalid. This is a problem on our side, not with your photos, and no render was made.",
  error_download_image: "The YouCam API could not download one of the uploaded images. Please try again.",
  error_decode_image: "The YouCam API could not read one of the images. Use a JPG or PNG image and try again.",
  error_inference: "The YouCam API could not produce a render from these two images. Try a different photo of you or of the garment.",
  error_nsfw_content_detected:
    "The YouCam API flagged one of the images as inappropriate content, so no render was made. Use a different image.",
  error_multiple_people: "More than one person was found in your photo. Retake it with only you in the frame.",
  error_unsupport_ratio:
    "The shape of one of the images (its width compared with its height) is not supported by the YouCam API. Use a photo closer to a standard portrait or square shape.",
  unknown_internal_error: "The YouCam API had an internal error and no render was made. Please try again in a moment.",
};

export function isYouCamErrorCode(code: unknown): code is YouCamErrorCode {
  return typeof code === "string" && (YOUCAM_ERROR_CODES as readonly string[]).includes(code);
}

/** The user-facing message for a provider error_code; a generic one for a code not in the documented list. */
export function userMessageForErrorCode(code: string | undefined): string {
  if (isYouCamErrorCode(code)) return YOUCAM_ERROR_MESSAGES[code];
  return code
    ? `The YouCam API reported an error this app does not recognise (${redactSecrets(code.slice(0, 64))}), so no render was made.`
    : "The YouCam API reported an error, so no render was made.";
}

// ---------------------------------------------------------------------------
// Configuration (env overrides)
// ---------------------------------------------------------------------------

export type ProviderMode = "live" | "mock";

export interface YouCamConfig {
  mode: ProviderMode;
  /** Why the adapter is in mock mode (empty when live). */
  mockReason: string;
  baseUrl: string;
  apiVersion: string;
  feature: string;
  category: GarmentCategory;
  /** Set when YOUCAM_VTO_CATEGORY held a value outside the documented enum and was ignored. */
  categoryNote: string;
  pollTimeoutMs: number;
  pollIntervalMs: number;
  estimatedUnitCost: number;
  mockLatencyMs: number;
  unitBudget: number;
  hasApiKey: boolean;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envStr(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

function apiKey(): string {
  return process.env.YOUCAM_API_KEY?.trim() ?? "";
}

/** Reads configuration from the environment. Never returns secret values. */
export function getYouCamConfig(): YouCamConfig {
  const hasApiKey = Boolean(apiKey());
  const mockFlag = (process.env.YOUCAM_MOCK ?? "false").trim().toLowerCase() === "true";

  let mockReason = "";
  if (mockFlag) mockReason = "YOUCAM_MOCK=true";
  else if (!hasApiKey) mockReason = "YOUCAM_API_KEY is not set";

  const requestedCategory = envStr("YOUCAM_VTO_CATEGORY", YOUCAM_PINNED.category);
  const categoryValid = (GARMENT_CATEGORIES as readonly string[]).includes(requestedCategory);

  return {
    mode: mockReason ? "mock" : "live",
    mockReason,
    baseUrl: envStr("YOUCAM_BASE_URL", YOUCAM_PINNED.baseUrl).replace(/\/+$/, ""),
    apiVersion: YOUCAM_PINNED.apiVersion,
    feature: envStr("YOUCAM_VTO_FEATURE", YOUCAM_PINNED.feature),
    category: categoryValid ? (requestedCategory as GarmentCategory) : YOUCAM_PINNED.category,
    categoryNote: categoryValid
      ? ""
      : `YOUCAM_VTO_CATEGORY is not one of ${GARMENT_CATEGORIES.join(", ")}, so ${YOUCAM_PINNED.category} is used.`,
    pollTimeoutMs: envInt("YOUCAM_POLL_TIMEOUT_MS", YOUCAM_PINNED.poll.timeoutMs),
    pollIntervalMs: envInt("YOUCAM_POLL_INTERVAL_MS", YOUCAM_PINNED.poll.defaultIntervalMs),
    estimatedUnitCost: envInt("YOUCAM_VTO_UNIT_COST", YOUCAM_PINNED.estimatedUnitCost),
    mockLatencyMs: envInt("YOUCAM_MOCK_LATENCY_MS", 4_000),
    unitBudget: envInt("YOUCAM_UNIT_BUDGET", 900),
    hasApiKey,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TryOnStage =
  | "validating"
  | "uploading_garment"
  | "uploading_photo"
  | "task_queued"
  | "generating"
  | "finishing"
  | "succeeded"
  | "timeout"
  | "failed";

export interface StageEvent {
  stage: TryOnStage;
  at: number;
  detail?: string;
}

export interface UploadedFile {
  fileId: string;
  bytes: number;
  contentType: string;
  sha256: string;
  mode: ProviderMode;
}

export interface TaskHandle {
  taskId: string;
  feature: string;
  createdAt: number;
  mode: ProviderMode;
}

export type TaskState = "queued" | "running" | "succeeded" | "failed";

export interface TaskStatus {
  state: TaskState;
  /** Raw provider status string: "running" | "success" | "error". */
  providerStatus: string;
  resultUrl?: string;
  /** User-facing reason for a failed task (from YOUCAM_ERROR_MESSAGES when the code is documented). */
  error?: string;
  /** Provider error_code of a failed task, when it reported one. */
  errorCode?: string;
  pollingIntervalMs?: number;
  /** Present only when spend is known (0 in mock mode). */
  unitsSpent?: number;
  mode: ProviderMode;
}

export type YouCamErrorKind =
  | "config"
  | "auth"
  | "validation"
  | "upload"
  | "task"
  | "poll"
  | "timeout"
  | "network"
  | "provider";

export class YouCamError extends Error {
  readonly kind: YouCamErrorKind;
  readonly httpStatus?: number;
  /** Verbatim provider-reported reason, safe to show in a developer panel. Never contains credentials. */
  readonly providerMessage?: string;
  /** Provider error_code, when the response carried one. `message` is then its user-facing text. */
  readonly errorCode?: string;
  readonly retryable: boolean;
  /**
   * True when a request that spends units (task creation) may have reached the provider before it
   * failed, so the units cannot be assumed unspent. Such a request is never sent a second time.
   */
  readonly outcomeUnknown: boolean;

  constructor(
    kind: YouCamErrorKind,
    message: string,
    opts: {
      httpStatus?: number;
      providerMessage?: string;
      errorCode?: string;
      retryable?: boolean;
      outcomeUnknown?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "YouCamError";
    this.kind = kind;
    this.httpStatus = opts.httpStatus;
    this.providerMessage = opts.providerMessage;
    this.errorCode = opts.errorCode;
    this.retryable = opts.retryable ?? false;
    this.outcomeUnknown = opts.outcomeUnknown ?? false;
  }
}

// ---------------------------------------------------------------------------
// Input preparation (shared by garment and buyer photo). Runs before any request is issued.
// ---------------------------------------------------------------------------

/** Detects the real image type from magic bytes; returns null for anything not a recognised raster. */
export function sniffImageMime(bytes: Uint8Array): SniffedMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  return null;
}

export interface ValidatedImage {
  bytes: Uint8Array;
  contentType: AllowedMime;
  sha256: string;
  width: number;
  height: number;
  /** What was done to the file to bring it inside the input limits; empty when it was sent as received. */
  changes: string[];
}

function inputError(message: string): YouCamError {
  return new YouCamError("validation", message);
}

/**
 * Brings an image inside the documented input limits, or refuses it, before any request is issued:
 * JPEG and PNG pass through unchanged when they are within the limits; WebP is converted to JPEG
 * with sharp; a long side over 4096 px is scaled down; anything else is refused, and so is a file
 * that is still 10 MB or more after that. Throws YouCamError("validation") with a user-safe message.
 */
export async function prepareImageInput(received: Uint8Array, label: string): Promise<ValidatedImage> {
  const I = YOUCAM_PINNED.input;
  if (received.length === 0) throw inputError(`${label}: no image data received.`);

  const sniffed = sniffImageMime(received);
  if (!sniffed) {
    throw inputError(`${label}: unsupported file type. Use a JPG, JPEG or PNG image (WebP is converted to JPEG).`);
  }

  const input = Buffer.from(received.buffer, received.byteOffset, received.byteLength);
  const meta = await sharp(input, { limitInputPixels: I.maxInputPixels })
    .metadata()
    .catch(() => null);
  if (!meta || !meta.width || !meta.height) {
    throw inputError(`${label}: this file could not be read as an image. Use a JPG, JPEG or PNG image.`);
  }

  const convert = (I.convertToJpeg as readonly string[]).includes(sniffed);
  const tooLong = Math.max(meta.width, meta.height) > I.maxSidePx;
  let bytes: Uint8Array = received;
  const contentType: AllowedMime = sniffed === "image/png" ? "image/png" : "image/jpeg";
  let width = meta.width;
  let height = meta.height;
  const changes: string[] = [];

  if (convert || tooLong) {
    try {
      let pipeline = sharp(input, { limitInputPixels: I.maxInputPixels }).autoOrient();
      if (tooLong) {
        pipeline = pipeline.resize({ width: I.maxSidePx, height: I.maxSidePx, fit: "inside", withoutEnlargement: true });
      }
      pipeline =
        contentType === "image/png"
          ? pipeline.png()
          : pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: I.jpegQuality });
      const out = await pipeline.toBuffer({ resolveWithObject: true });
      bytes = new Uint8Array(out.data.buffer, out.data.byteOffset, out.data.byteLength);
      width = out.info.width;
      height = out.info.height;
    } catch {
      throw inputError(`${label}: this image could not be converted. Use a JPG, JPEG or PNG image.`);
    }
    if (convert) changes.push("converted from WebP to JPEG");
    if (tooLong) changes.push(`scaled down to ${width} × ${height} px (longest side at most ${I.maxSidePx} px)`);
  }

  if (bytes.length >= I.maxBytes) {
    const mb = (I.maxBytes / (1024 * 1024)).toFixed(0);
    throw inputError(`${label}: the image must be under ${mb} MB. Use a smaller image.`);
  }

  return {
    bytes,
    contentType,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width,
    height,
    changes,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPath(template: string, cfg: YouCamConfig, taskId?: string): string {
  return template
    .replace("{version}", cfg.apiVersion)
    .replace("{feature}", cfg.feature)
    .replace("{task_id}", taskId !== undefined ? encodeURIComponent(taskId) : "{task_id}");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** V2 response envelope: `{ status, data }` on success, `{ status, error, error_code }` on failure. */
interface ProviderEnvelope<T> {
  status?: number;
  data?: T;
  error?: string;
  error_code?: string;
  message?: string;
}

function providerErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const code = (body as ProviderEnvelope<unknown>).error_code;
  return typeof code === "string" && code ? code : undefined;
}

function providerReason(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as ProviderEnvelope<unknown>;
    const code = providerErrorCode(body);
    const text = typeof b.error === "string" && b.error ? b.error : typeof b.message === "string" ? b.message : "";
    if (code || text) return redactSecrets([code, text].filter(Boolean).join(": "));
  }
  return fallback;
}

const g = globalThis as unknown as {
  __youcamObserved?: Map<string, ObservedResponse>;
  __youcamFeatureCost?: { info: FeatureCostInfo; expiresAt: number };
};

/**
 * Removes the API key and signed URL query strings from provider-sourced text before it can reach
 * an error message, an API response or a log. Provider reasons are shown to developers verbatim,
 * so this runs on every one of them.
 */
export function redactSecrets(text: string): string {
  let out = text;
  const key = apiKey();
  if (key.length >= 8) out = out.split(key).join("<redacted>");
  return out.replace(/(https?:\/\/[^\s?"'<>]+)\?[^\s"'<>]*/g, "$1?<redacted>");
}

function timedOut(cause: unknown): boolean {
  return cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError");
}

function requestSignal(): AbortSignal {
  return AbortSignal.timeout(YOUCAM_PINNED.poll.requestTimeoutMs);
}

function unreachable(what: string, cause: unknown): string {
  return timedOut(cause)
    ? `The YouCam API did not answer within ${Math.round(YOUCAM_PINNED.poll.requestTimeoutMs / 1000)} seconds (${what}).`
    : `Could not reach the YouCam API (${what}).`;
}

// ---------------------------------------------------------------------------
// Response parsers (shared by the live path, mock mode and the fixture tests)
// ---------------------------------------------------------------------------

export interface PutRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
}

/** data of POST /file/{feature} -> the file id and the request descriptor the bytes must be sent with. */
export function parseFileUpload(data: unknown): { fileId: string; put: PutRequest } {
  const entry = (data as { files?: Array<{ file_id?: unknown; requests?: Array<Record<string, unknown>> }> } | null)
    ?.files?.[0];
  const req = entry?.requests?.[0];
  if (typeof entry?.file_id !== "string" || !entry.file_id || typeof req?.url !== "string" || !req.url) {
    throw new YouCamError("upload", "YouCam API file registration did not return a file id and upload URL.");
  }
  const headers: Record<string, string> = {};
  if (req.headers && typeof req.headers === "object") {
    for (const [k, v] of Object.entries(req.headers as Record<string, unknown>)) {
      if (typeof v === "string") headers[k] = v;
    }
  }
  return {
    fileId: entry.file_id,
    put: { method: typeof req.method === "string" && req.method ? req.method.toUpperCase() : "PUT", url: req.url, headers },
  };
}

/** data of POST /task/{feature} -> the task id. */
export function parseTaskCreate(data: unknown): string {
  const taskId = (data as { task_id?: unknown } | null)?.task_id;
  if (typeof taskId !== "string" || !taskId) {
    throw new YouCamError("task", "YouCam API task creation did not return a task id.");
  }
  return taskId;
}

function mapProviderStatus(raw: string): TaskState {
  const s = raw.toLowerCase();
  if (s === "success") return "succeeded";
  if (s === "error") return "failed";
  return "running";
}

/**
 * data of GET /task/{feature}/{task_id} -> the task state. A failed task's error_code is looked for
 * in data and then on the envelope, since where it sits for a failed task is not pinned yet.
 */
export function parseTaskStatus(
  data: unknown,
  envelope: unknown = null,
): Pick<TaskStatus, "state" | "providerStatus" | "resultUrl" | "error" | "errorCode"> {
  const d = (data ?? {}) as { task_status?: unknown; results?: { url?: unknown } | null; error?: unknown; error_code?: unknown };
  const providerStatus = typeof d.task_status === "string" && d.task_status ? d.task_status : "running";
  const state = mapProviderStatus(providerStatus);

  if (state === "succeeded") {
    const url = d.results && typeof d.results === "object" ? d.results.url : undefined;
    if (typeof url === "string" && url) return { state, providerStatus, resultUrl: url };
    return { state: "failed", providerStatus, error: "The task reported success but returned no result image." };
  }
  if (state === "failed") {
    const errorCode = providerErrorCode(d) ?? providerErrorCode(envelope);
    return { state, providerStatus, errorCode, error: userMessageForErrorCode(errorCode) };
  }
  return { state, providerStatus };
}

// ---------------------------------------------------------------------------
// Observed response shapes (for confirming the pins and replacing the fixtures)
// ---------------------------------------------------------------------------

export interface ObservedResponse {
  /** Fixture the response corresponds to: lib/youcam/fixtures/<fixture>.json. */
  fixture: string;
  observedAt: string;
  httpStatus: number;
  /**
   * The response body with every string replaced by its length, except short enum-like words such
   * as "success", "upper_body" or an error_code. Numbers and booleans are kept. Contains no
   * credentials, ids or URLs.
   */
  shape: unknown;
}

const ENUM_LIKE = /^[A-Za-z_]{1,40}$/;

function redactedShape(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (redactSecrets(value) !== value) return "<redacted>";
    return ENUM_LIKE.test(value) ? value : `<string, ${value.length} chars>`;
  }
  if (depth >= 8) return "<nested>";
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const first = redactedShape(value[0], depth + 1);
    return value.length > 1 ? [first, `<${value.length - 1} more>`] : [first];
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactedShape(v, depth + 1)]));
  }
  return `<${typeof value}>`;
}

function fixtureName(base: string, httpStatus: number, body: unknown): string {
  if (httpStatus >= 400) return `${base}.http-${httpStatus}`;
  if (base !== "task-status") return `${base}.response`;
  const raw = (body as ProviderEnvelope<{ task_status?: unknown }> | null)?.data?.task_status;
  if (typeof raw !== "string") return `${base}.unknown`;
  const state = mapProviderStatus(raw);
  return `${base}.${state === "succeeded" ? "success" : state === "failed" ? "error" : "running"}`;
}

/** Keeps the latest redacted shape per fixture name, in memory, for the /status page. */
function recordObservation(base: string, httpStatus: number, body: unknown): void {
  if (!g.__youcamObserved) g.__youcamObserved = new Map();
  const fixture = fixtureName(base, httpStatus, body);
  g.__youcamObserved.set(fixture, {
    fixture,
    observedAt: new Date().toISOString(),
    httpStatus,
    shape: redactedShape(body),
  });
}

/** Redacted shapes of the live responses seen by this server process, by fixture name. */
export function observedResponses(): ObservedResponse[] {
  return [...(g.__youcamObserved?.values() ?? [])].sort((a, b) => a.fixture.localeCompare(b.fixture));
}

// ---------------------------------------------------------------------------
// Authenticated JSON requests
// ---------------------------------------------------------------------------

interface ProviderRequest {
  method: "GET" | "POST";
  body?: unknown;
  /** Retries on network errors, timeouts, 429 and 5xx. Defaults to the pinned maximum. */
  retries?: number;
  /**
   * False for a request that must not be sent twice because it spends units (task creation). It is
   * retried only on 429, which the provider refused without processing.
   */
  idempotent?: boolean;
  /** Fixture base name the redacted response shape is recorded under, e.g. "task-status". */
  observeAs: string;
}

/** The envelope and its data from one successful request. */
interface ProviderResult<T> {
  data: T;
  envelope: ProviderEnvelope<T>;
}

/**
 * Performs one JSON request to the API host with `Authorization: Bearer <YOUCAM_API_KEY>`. Every
 * attempt is bounded by the pinned request timeout and transient failures are retried a bounded
 * number of times. A documented error_code becomes its user-facing message. Never logs headers or
 * bodies.
 */
async function providerJson<T>(
  cfg: YouCamConfig,
  path: string,
  init: ProviderRequest,
  kind: YouCamErrorKind,
  attempt = 0,
): Promise<ProviderResult<T>> {
  const key = apiKey();
  if (!key) throw new YouCamError("config", "YOUCAM_API_KEY is not set.");

  const url = `${cfg.baseUrl}${path}`;
  const retries = init.retries ?? YOUCAM_PINNED.poll.maxTransientRetries;
  const idempotent = init.idempotent ?? true;
  const what = `${init.method} ${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    [YOUCAM_PINNED.auth.header]: `${YOUCAM_PINNED.auth.scheme} ${key}`,
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      method: init.method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: requestSignal(),
    });
    text = await res.text();
  } catch (cause) {
    // A request that timed out or lost its connection may still have reached the provider, so one
    // that spends units is not sent again and its units are not assumed unspent.
    if (idempotent && attempt < retries) {
      await sleep(300 * 2 ** attempt);
      return providerJson<T>(cfg, path, init, kind, attempt + 1);
    }
    throw new YouCamError("network", unreachable(what, cause), {
      retryable: true,
      outcomeUnknown: !idempotent,
      cause,
    });
  }

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: redactSecrets(text.slice(0, 300)) };
    }
  }
  recordObservation(init.observeAs, res.status, body);

  const transientStatus = res.status === 429 || (idempotent && res.status >= 500);
  if (transientStatus && attempt < retries) {
    await sleep(500 * 2 ** attempt);
    return providerJson<T>(cfg, path, init, kind, attempt + 1);
  }

  const envelope = (body ?? {}) as ProviderEnvelope<T>;
  const envelopeStatus = typeof envelope.status === "number" ? envelope.status : res.status;
  const errorCode = providerErrorCode(body);

  if (!res.ok || envelopeStatus >= 400 || errorCode || envelope.data === undefined) {
    const keys = body && typeof body === "object" ? Object.keys(body).join(", ") : "";
    const fallback =
      res.ok && envelopeStatus < 400
        ? `HTTP ${res.status} but the response has no "data" field (top-level keys: ${keys || "none"})`
        : `HTTP ${res.status}`;
    const reason = providerReason(body, fallback);
    const isAuth = res.status === 401 || res.status === 403 || envelopeStatus === 401 || envelopeStatus === 403;
    const message = errorCode
      ? userMessageForErrorCode(errorCode)
      : isAuth
        ? `The YouCam API refused the API key (${what}): ${reason}. Check YOUCAM_API_KEY.`
        : `YouCam API ${what} failed: ${reason}`;
    throw new YouCamError(isAuth ? "auth" : kind, message, {
      httpStatus: res.status,
      providerMessage: reason,
      errorCode,
      retryable: res.status === 429 || res.status >= 500,
      outcomeUnknown: !idempotent && res.status >= 500,
    });
  }

  return { data: envelope.data, envelope };
}

// ---------------------------------------------------------------------------
// 1. File upload
// ---------------------------------------------------------------------------

/** Registers an image with the provider and sends the bytes with the request descriptor it returns. */
export async function uploadImage(
  image: ValidatedImage,
  fileName: string,
  cfg: YouCamConfig = getYouCamConfig(),
): Promise<UploadedFile> {
  if (cfg.mode === "mock") {
    const { fileId } = parseFileUpload(fileUploadFixture.data);
    return {
      fileId: `${fileId}-${image.sha256.slice(0, 12)}`,
      bytes: image.bytes.length,
      contentType: image.contentType,
      sha256: image.sha256,
      mode: "mock",
    };
  }

  const { data } = await providerJson<unknown>(
    cfg,
    buildPath(YOUCAM_PINNED.paths.file, cfg),
    {
      method: "POST",
      body: { files: [{ content_type: image.contentType, file_name: fileName, file_size: image.bytes.length }] },
      observeAs: "file-upload",
    },
    "upload",
  );
  const { fileId, put } = parseFileUpload(data);

  // Exactly the method and headers the provider returned: no Authorization, nothing added.
  let res: Response;
  try {
    res = await fetch(put.url, {
      method: put.method,
      headers: put.headers,
      body: Buffer.from(image.bytes),
      signal: requestSignal(),
    });
  } catch (cause) {
    throw new YouCamError("network", unreachable("image upload", cause), { retryable: true, cause });
  }
  if (!res.ok) {
    throw new YouCamError("upload", `YouCam API rejected the image upload (HTTP ${res.status}).`, {
      httpStatus: res.status,
      providerMessage: `HTTP ${res.status}`,
    });
  }

  return {
    fileId,
    bytes: image.bytes.length,
    contentType: image.contentType,
    sha256: image.sha256,
    mode: "live",
  };
}

// ---------------------------------------------------------------------------
// 2. Task creation
// ---------------------------------------------------------------------------

export interface CreateTryOnTaskInput {
  personFileId: string;
  garmentFileId: string;
  category?: GarmentCategory;
}

/** The task-creation body. Never carries template_id, which must not be sent with ref_file_id. */
export function taskBody(input: CreateTryOnTaskInput, cfg: YouCamConfig): Record<string, string> {
  const category = input.category ?? cfg.category;
  if (!(GARMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new YouCamError("validation", `Garment category must be one of ${GARMENT_CATEGORIES.join(", ")}.`);
  }
  const f = YOUCAM_PINNED.taskBodyFields;
  return {
    [f.person]: input.personFileId,
    [f.garment]: input.garmentFileId,
    [f.category]: category,
  };
}

/** Creates the asynchronous apparel try-on task. Returns immediately with a task handle. */
export async function createTryOnTask(
  input: CreateTryOnTaskInput,
  cfg: YouCamConfig = getYouCamConfig(),
): Promise<TaskHandle> {
  const body = taskBody(input, cfg);

  if (cfg.mode === "mock") {
    return {
      taskId: `${parseTaskCreate(taskCreateFixture.data)}-${randomBytes(4).toString("hex")}`,
      feature: cfg.feature,
      createdAt: Date.now(),
      mode: "mock",
    };
  }

  const { data } = await providerJson<unknown>(
    cfg,
    buildPath(YOUCAM_PINNED.paths.task, cfg),
    // Not idempotent: a second POST would create a second task and spend units twice.
    { method: "POST", body, idempotent: false, observeAs: "task-create" },
    "task",
  );

  return { taskId: parseTaskCreate(data), feature: cfg.feature, createdAt: Date.now(), mode: "live" };
}

// ---------------------------------------------------------------------------
// 3. Task status (single check) and bounded polling
// ---------------------------------------------------------------------------

/** Performs exactly one status check. Callers decide how to poll (see waitForTask and the API route). */
export async function checkTask(handle: TaskHandle, cfg: YouCamConfig = getYouCamConfig()): Promise<TaskStatus> {
  if (handle.mode === "mock") {
    const elapsed = Date.now() - handle.createdAt;
    const fixture = elapsed < cfg.mockLatencyMs ? taskRunningFixture : taskSuccessFixture;
    return { ...parseTaskStatus(fixture.data, fixture), unitsSpent: 0, mode: "mock" };
  }

  const path = buildPath(YOUCAM_PINNED.paths.taskStatus, { ...cfg, feature: handle.feature }, handle.taskId);
  // One attempt only: the callers (waitForTask and the polling proxy) already retry across polls,
  // so a status check never takes longer than one request timeout.
  const { data, envelope } = await providerJson<unknown>(
    cfg,
    path,
    { method: "GET", retries: 0, observeAs: "task-status" },
    "poll",
  );
  return { ...parseTaskStatus(data, envelope), mode: "live" };
}

export interface WaitOptions {
  timeoutMs?: number;
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
}

/**
 * Polls until the task finishes or the hard timeout elapses, at the configured interval clamped to
 * the pinned maximum. Transient poll errors are retried a bounded number of times; a timeout throws
 * YouCamError("timeout").
 */
export async function waitForTask(
  handle: TaskHandle,
  opts: WaitOptions = {},
  cfg: YouCamConfig = getYouCamConfig(),
): Promise<TaskStatus> {
  const timeoutMs = opts.timeoutMs ?? cfg.pollTimeoutMs;
  const deadline = handle.createdAt + timeoutMs;
  let interval = cfg.pollIntervalMs;
  let transientErrors = 0;
  let announcedGenerating = false;

  opts.onStage?.({ stage: "task_queued", at: Date.now() });

  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new YouCamError("poll", "Polling was aborted.");

    let status: TaskStatus;
    try {
      status = await checkTask(handle, cfg);
      transientErrors = 0;
    } catch (err) {
      if (err instanceof YouCamError && err.retryable && transientErrors < YOUCAM_PINNED.poll.maxTransientRetries) {
        transientErrors += 1;
        await sleep(Math.min(interval, deadline - Date.now()));
        continue;
      }
      throw err;
    }

    if (status.state === "succeeded" || status.state === "failed") {
      opts.onStage?.({ stage: status.state === "succeeded" ? "finishing" : "failed", at: Date.now() });
      return status;
    }
    if (status.state === "running" && !announcedGenerating) {
      announcedGenerating = true;
      opts.onStage?.({ stage: "generating", at: Date.now() });
    }

    interval = Math.min(status.pollingIntervalMs ?? interval, YOUCAM_PINNED.poll.maxIntervalMs);
    await sleep(Math.max(250, Math.min(interval, deadline - Date.now())));
  }

  throw new YouCamError("timeout", `The render did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
}

// ---------------------------------------------------------------------------
// 4. Result retrieval
// ---------------------------------------------------------------------------

export interface FetchedResult {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Fetches the result image server-side so the browser never sees the provider URL. Only https
 * URLs are fetched, within the pinned request timeout and size limit. The documented link lifetime
 * is about two hours.
 */
export async function fetchResultImage(resultUrl: string): Promise<FetchedResult> {
  let url: URL;
  try {
    url = new URL(resultUrl);
  } catch {
    throw new YouCamError("provider", "The YouCam API returned a result URL that is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new YouCamError("provider", "The YouCam API returned a result URL that is not https; it was not fetched.");
  }

  const maxBytes = YOUCAM_PINNED.output.maxBytes;
  const tooLarge = () =>
    new YouCamError("provider", `The render is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
  let res: Response;
  let bytes: Uint8Array;
  try {
    res = await fetch(url, { cache: "no-store", signal: requestSignal() });
    if (!res.ok) {
      throw new YouCamError(
        "provider",
        res.status === 403 || res.status === 404
          ? `The YouCam API result link is no longer available (HTTP ${res.status}); links last about two hours.`
          : `The YouCam API result URL returned HTTP ${res.status}.`,
        { httpStatus: res.status },
      );
    }
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw tooLarge();
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (cause) {
    if (cause instanceof YouCamError) throw cause;
    throw new YouCamError("network", unreachable("render download", cause), { retryable: true, cause });
  }
  if (bytes.length > maxBytes) throw tooLarge();
  return { bytes, contentType: res.headers.get("content-type") ?? "image/jpeg" };
}

// ---------------------------------------------------------------------------
// 5. Unit cost
// ---------------------------------------------------------------------------

export interface FeatureCostInfo {
  state: "mock" | "ok" | "unavailable";
  /** Units per call of this feature, when one could be read from the response. */
  units?: number;
  detail: string;
  checkedAt?: string;
}

/**
 * Looks for this feature's cost in a feature-cost response. The response shape is not pinned yet,
 * so this accepts a number under the feature's key, or a cost/credit/unit field of an object that
 * names the feature. Returns undefined when nothing matches.
 */
export function extractFeatureCost(data: unknown, feature: string): number | undefined {
  const name = feature.toLowerCase();
  const COST_KEYS = ["cost", "credit", "credits", "unit", "units", "price"];
  const visit = (value: unknown, matched: boolean, depth: number): number | undefined => {
    if (depth > 6 || value === null || typeof value !== "object") return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = visit(item, matched, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const named = matched || entries.some(([, v]) => typeof v === "string" && v.toLowerCase() === name);
    for (const [k, v] of entries) {
      const key = k.toLowerCase();
      if (typeof v === "number" && (key === name || (named && COST_KEYS.includes(key)))) return v;
      if (v && typeof v === "object") {
        const found = visit(v, named || key === name, depth + 1);
        if (found !== undefined) return found;
      }
    }
    return undefined;
  };
  return visit(data, false, 0);
}

/**
 * GET /credit/feature-cost, at most once per featureCostTtlMs (failures are retried sooner). Makes
 * no request in mock mode. Never throws; a failure is reported in the result.
 */
export async function refreshFeatureCost(cfg: YouCamConfig = getYouCamConfig()): Promise<FeatureCostInfo> {
  if (cfg.mode === "mock") return { state: "mock", detail: "Mock mode: the API is not asked for the unit cost." };
  const cached = g.__youcamFeatureCost;
  if (cached && Date.now() < cached.expiresAt) return cached.info;

  let info: FeatureCostInfo;
  try {
    const { data } = await providerJson<unknown>(
      cfg,
      buildPath(YOUCAM_PINNED.paths.featureCost, cfg),
      { method: "GET", retries: 0, observeAs: "feature-cost" },
      "provider",
    );
    const units = extractFeatureCost(data, cfg.feature);
    info =
      units !== undefined
        ? { state: "ok", units, detail: `The API reports ${units} unit(s) per ${cfg.feature} task.` }
        : {
            state: "unavailable",
            detail: `The feature-cost response did not name ${cfg.feature} in a recognised way; see feature-cost.response under Observed live responses.`,
          };
  } catch (err) {
    info = { state: "unavailable", detail: err instanceof Error ? redactSecrets(err.message) : "Unknown error." };
  }
  info.checkedAt = new Date().toISOString();
  g.__youcamFeatureCost = {
    info,
    expiresAt: Date.now() + (info.state === "ok" ? YOUCAM_PINNED.featureCostTtlMs : 5 * 60 * 1000),
  };
  return info;
}

/** The last feature-cost answer, without asking the API. */
export function cachedFeatureCost(cfg: YouCamConfig = getYouCamConfig()): FeatureCostInfo {
  if (cfg.mode === "mock") return { state: "mock", detail: "Mock mode: the API is not asked for the unit cost." };
  return g.__youcamFeatureCost?.info ?? { state: "unavailable", detail: "Not checked yet in this server process." };
}

// ---------------------------------------------------------------------------
// Orchestrator: full render in one call (used by scripts, calibration, and tests)
// ---------------------------------------------------------------------------

export interface RunTryOnInput {
  garment: Uint8Array;
  person: Uint8Array;
  category?: GarmentCategory;
  onStage?: (event: StageEvent) => void;
  timeoutMs?: number;
}

export interface RunTryOnOutput {
  mode: ProviderMode;
  task: TaskHandle;
  status: TaskStatus;
  garment: UploadedFile;
  person: UploadedFile;
  latencyMs: number;
  stages: StageEvent[];
}

/** prepare → upload garment → upload person → create task → bounded poll. Throws YouCamError on any failure. */
export async function runApparelTryOn(input: RunTryOnInput): Promise<RunTryOnOutput> {
  const cfg = getYouCamConfig();
  const stages: StageEvent[] = [];
  const emit = (stage: TryOnStage, detail?: string) => {
    const ev: StageEvent = { stage, at: Date.now(), detail };
    stages.push(ev);
    input.onStage?.(ev);
  };
  const started = Date.now();

  emit("validating");
  const garment = await prepareImageInput(input.garment, "Garment image");
  const person = await prepareImageInput(input.person, "Buyer photo");

  emit("uploading_garment");
  const garmentUpload = await uploadImage(garment, `garment.${extFor(garment.contentType)}`, cfg);

  emit("uploading_photo");
  const personUpload = await uploadImage(person, `person.${extFor(person.contentType)}`, cfg);

  const task = await createTryOnTask(
    { personFileId: personUpload.fileId, garmentFileId: garmentUpload.fileId, category: input.category },
    cfg,
  );

  const status = await waitForTask(task, { timeoutMs: input.timeoutMs, onStage: (e) => emit(e.stage, e.detail) }, cfg);
  emit(status.state === "succeeded" ? "succeeded" : "failed");

  return {
    mode: cfg.mode,
    task,
    status,
    garment: garmentUpload,
    person: personUpload,
    latencyMs: Date.now() - started,
    stages,
  };
}

export function extFor(mime: AllowedMime): string {
  return mime === "image/png" ? "png" : "jpg";
}

// ---------------------------------------------------------------------------
// Diagnostics for the /status page (no secrets)
// ---------------------------------------------------------------------------

export interface AdapterDescription {
  provider: string;
  mode: ProviderMode;
  mockReason: string;
  baseUrl: string;
  apiVersion: string;
  /** How requests are authenticated. Names the variable, never its value. */
  auth: string;
  endpoints: { name: string; method: string; path: string }[];
  feature: string;
  category: string;
  categories: readonly string[];
  categoryNote: string;
  inputLimits: string;
  errorCodes: readonly string[];
  pollTimeoutMs: number;
  requestTimeoutMs: number;
  estimatedUnitCost: number;
  featureCost: FeatureCostInfo;
  liveRenderConfirmed: boolean;
  verificationNote: string;
  credentialsConfigured: boolean;
  /** Redacted shapes of the live responses this process has seen, for pinning the fixtures. */
  observedResponses: ObservedResponse[];
}

export function describeAdapter(): AdapterDescription {
  const cfg = getYouCamConfig();
  const I = YOUCAM_PINNED.input;
  const P = YOUCAM_PINNED.paths;
  return {
    provider: "Perfect Corp. YouCam API — Apparel Virtual Try-On (API V2)",
    mode: cfg.mode,
    mockReason: cfg.mockReason,
    baseUrl: cfg.baseUrl,
    apiVersion: cfg.apiVersion,
    auth: YOUCAM_PINNED.auth.description,
    endpoints: [
      { name: "Upload", method: "POST", path: buildPath(P.file, cfg) },
      { name: "Create task", method: "POST", path: buildPath(P.task, cfg) },
      { name: "Poll task", method: "GET", path: buildPath(P.taskStatus, cfg) },
      { name: "Unit cost", method: "GET", path: buildPath(P.featureCost, cfg) },
    ],
    feature: cfg.feature,
    category: cfg.category,
    categories: GARMENT_CATEGORIES,
    categoryNote: cfg.categoryNote,
    inputLimits: `JPG, JPEG or PNG (WebP is converted to JPEG); longest side at most ${I.maxSidePx} px (larger images are scaled down); under ${Math.round(I.maxBytes / (1024 * 1024))} MB.`,
    errorCodes: YOUCAM_ERROR_CODES,
    pollTimeoutMs: cfg.pollTimeoutMs,
    requestTimeoutMs: YOUCAM_PINNED.poll.requestTimeoutMs,
    estimatedUnitCost: cfg.estimatedUnitCost,
    featureCost: cachedFeatureCost(cfg),
    liveRenderConfirmed: YOUCAM_PINNED.verification.liveRenderConfirmed,
    verificationNote: YOUCAM_PINNED.verification.note,
    credentialsConfigured: cfg.hasApiKey,
    observedResponses: observedResponses(),
  };
}
