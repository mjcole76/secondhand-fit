import { NextResponse } from "next/server";

import {
  YouCamError,
  createTryOnTask,
  extFor,
  getYouCamConfig,
  prepareImageInput,
  uploadImage,
  type ValidatedImage,
  type YouCamConfig,
} from "@/lib/youcam/adapter";
import { releaseTask } from "@/lib/youcam/ledger";
import { findPublishedListing } from "@/lib/listings/published";
import { analyseFlatLay } from "@/lib/readiness/analyse";
import { READINESS_GRADES, gradeReadiness, type GradedReadiness } from "@/lib/readiness/grade";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";
import { admitTryOn, issuePrecomputedRender, providerErrorFallback, servingState } from "@/lib/tryon/guard";
import { renderBadge } from "@/lib/tryon/honesty";
import { encodeRenderId, type RenderTicket } from "@/lib/tryon/render-id";
import { consentRequiredError, findCurrentConsent, parseListingId } from "@/lib/tryon/consent";
import { prepareSelfieUpload } from "@/lib/tryon/selfie";
import { readSessionId, sessionKey as hashSessionId } from "@/lib/tryon/session";
import {
  GARMENT_GRID_FIELD,
  LISTING_ID_FIELD,
  PREVIEW_ONLY_LABEL,
  SERVING_MODES,
  TRYON_START_DEADLINE_MS,
  TRYON_STREAM_MEDIA_TYPE,
  type ApiErrorResponse,
  type FallbackInfo,
  type StageTimestamp,
  type TryOnCreateResponse,
  type TryOnStreamEvent,
} from "@/lib/tryon/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: ApiErrorResponse["code"], error: string) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

/**
 * Brings both images inside the YouCam input limits (JPG/PNG, WebP converted to JPEG, longest side
 * at most 4096 px, under 10 MB) or refuses them, before the guard and before any provider request.
 */
async function validatePair(
  garmentBytes: Uint8Array,
  personBytes: Uint8Array,
): Promise<{ garment: ValidatedImage; person: ValidatedImage } | { error: string }> {
  try {
    return {
      garment: await prepareImageInput(garmentBytes, "Garment image"),
      person: await prepareImageInput(personBytes, "Buyer photo"),
    };
  } catch (err) {
    if (err instanceof YouCamError && err.kind === "validation") return { error: err.message };
    throw err;
  }
}

const MIN_GRID_SIDE = 16;

/**
 * Grades the garment photo from the analysis grid the browser sent with the try-on, using the same
 * deterministic checks the seller flow runs. The grade is computed here, never taken from the
 * request. A missing or malformed grid gives no grade for the sent image (the render then carries
 * the listing's grade, or a badge saying it was not graded); it does not stop the try-on.
 */
function gradeGarmentPhoto(field: FormDataEntryValue | null): GradedReadiness | null {
  const max = READINESS_THRESHOLDS.analysis.gridMaxSidePx;
  if (typeof field !== "string" || field.length > Math.ceil((max * max * 4) / 3) * 4 + 256) return null;
  try {
    const { width, height, rgbaBase64 } = JSON.parse(field) as Record<string, unknown>;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < MIN_GRID_SIDE ||
      height < MIN_GRID_SIDE ||
      width > max ||
      height > max ||
      typeof rgbaBase64 !== "string"
    ) {
      return null;
    }
    const data = new Uint8Array(Buffer.from(rgbaBase64, "base64"));
    if (data.length !== width * height * 4) return null;
    return gradeReadiness(analyseFlatLay({ width, height, data }));
  } catch {
    return null;
  }
}

/**
 * The grade signed into the render id. A try-on from a published listing inherits the grade the
 * listing was published with. The garment image actually sent is graded as well, and when it
 * scores lower, its grade is used instead: the badge on a render is never better than the photo
 * behind it. Without a listing, the sent image's grade is used, or none.
 */
function badgeGrade(listingId: string | null, sent: GradedReadiness | null): Pick<RenderTicket, "g" | "k" | "r" | "s"> {
  const listing = listingId ? findPublishedListing(listingId)?.readiness : undefined;
  const sentIsLower = !!sent && !!listing && READINESS_GRADES.indexOf(sent.grade) > READINESS_GRADES.indexOf(listing.grade);
  if (listing && !sentIsLower) {
    return { g: listing.grade, k: listing.weakestCheck, r: listing.weakestReason, s: "listing" };
  }
  if (!sent) return {};
  return { g: sent.grade, k: sent.weakestCheck, r: sent.weakestReason, s: sentIsLower ? "sent_lower" : "sent" };
}

function precomputedBody(
  cfg: YouCamConfig,
  sessionKey: string,
  fallback: FallbackInfo,
  stages: StageTimestamp[],
): TryOnCreateResponse {
  return {
    renderId: issuePrecomputedRender(cfg.feature, sessionKey, fallback.reason),
    mode: "precomputed",
    live: false,
    modeLabel: SERVING_MODES.precomputed.label,
    status: "succeeded",
    stages,
    timeoutMs: 0,
    pollAfterMs: 0,
    label: PREVIEW_ONLY_LABEL,
    badge: renderBadge({ m: "precomputed" }),
    fallback,
    serving: servingState(sessionKey, cfg),
  };
}

/**
 * POST /api/tryon
 * multipart/form-data: garment (file), person (file), listingId (optional published listing id),
 * garmentGrid (optional JSON analysis grid of the garment photo)
 *
 * Refuses with 403 consent_required, before reading the images, unless the session cookie maps to a
 * consent record for this listing at the current scope version (recorded by POST /api/consent).
 * Then validates both images (the buyer photo is re-encoded without metadata and must pass the
 * photo checks in lib/tryon/selfie-gate.ts), enforces the unit budget and the per-session fair-use
 * cap, then performs upload garment → upload buyer photo → create task against the YouCam Apparel
 * VTO API (V2, Bearer API key on every request) and returns an opaque render id for bounded polling via
 * GET /api/tryon/[renderId]. A request the guard does not admit gets the labelled precomputed run.
 * With `Accept: application/x-ndjson` the stages are streamed as they start (TryOnStreamEvent).
 * A provider too slow to accept both images gets 504 start_timeout, with no task created.
 * The readiness grade is signed into the render id, so the render carries it as a badge wherever it
 * is shown: the published listing's grade, or the sent garment image's grade when that is lower. So is the listing id, so GET /api/tryon/[renderId] checks the same
 * consent again before each provider status call.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "bad_request", "Expected multipart/form-data with garment and person files.");
  }

  // Consent is enforced first, before the images are read and before any provider call: the session
  // must hold a consent record for this listing at the current scope version (lib/tryon/consent.ts).
  // What the form says about consent is not trusted. Without a record the request ends here.
  const listingId = parseListingId(form.get(LISTING_ID_FIELD));
  if (listingId === undefined) return errorResponse(400, "bad_request", "The listing id is not valid.");
  const existingSessionId = readSessionId(req);
  const consentRecord = findCurrentConsent(existingSessionId ? hashSessionId(existingSessionId) : null, listingId);
  if (!existingSessionId || !consentRecord) {
    return NextResponse.json<ApiErrorResponse>(consentRequiredError(listingId), { status: 403 });
  }

  const garmentFile = form.get("garment");
  const personFile = form.get("person");
  if (!(garmentFile instanceof File) || !(personFile instanceof File)) {
    return errorResponse(400, "bad_request", "Both a garment image and a buyer photo are required.");
  }

  // The anonymous session was started by POST /api/consent; it is what the consent record and the
  // fair-use cap are counted against.
  const input: StartInput = { form, garmentFile, personFile, sessionKey: consentRecord.sessionKey, listingId };

  if (!(req.headers.get("accept") ?? "").includes(TRYON_STREAM_MEDIA_TYPE)) {
    const out = await startTryOn(input, () => {});
    return NextResponse.json(out.body, { status: out.status });
  }

  // Streamed: each stage is written the moment it starts, so the progress the buyer sees is the
  // server's own, not a timer. The last line carries what the JSON response would have been.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TryOnStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The buyer left the page. The try-on carries on, exactly as a dropped JSON request would.
        }
      };
      let out: StartOutcome;
      try {
        out = await startTryOn(input, (s) => send({ type: "stage", ...s }));
      } catch (err) {
        console.error("tryon: unexpected error", err instanceof Error ? err.message : err);
        out = { status: 500, body: { error: "Something went wrong while starting the try-on.", code: "server_error" } };
      }
      send({ type: "done", httpStatus: out.status, body: out.body });
      try {
        controller.close();
      } catch {
        // Already closed by the client.
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": `${TRYON_STREAM_MEDIA_TYPE}; charset=utf-8`,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

interface StartInput {
  form: FormData;
  garmentFile: File;
  personFile: File;
  sessionKey: string;
  /** Listing the consent record is for; signed into the render id so polling can re-check it. */
  listingId: string | null;
}

type StartOutcome = { status: number; body: TryOnCreateResponse | ApiErrorResponse };

/**
 * Everything after the consent check: validate both images, run the buyer photo through the photo
 * checks, apply the guard, then upload garment → upload buyer photo → create task.
 * Each stage is reported through `onStage` as it starts. No provider step starts once
 * TRYON_START_DEADLINE_MS has passed, so a slow provider ends in start_timeout, not a late task.
 */
async function startTryOn(
  { form, garmentFile, personFile, sessionKey, listingId }: StartInput,
  onStage: (stage: StageTimestamp) => void,
): Promise<StartOutcome> {
  const cfg = getYouCamConfig();
  const startedAt = Date.now();
  const pastDeadline = () => Date.now() - startedAt >= TRYON_START_DEADLINE_MS;
  const stages: StageTimestamp[] = [];
  const mark = (stage: StageTimestamp["stage"]) => {
    const entry = { stage, at: Date.now() };
    stages.push(entry);
    onStage(entry);
  };
  const fail = (status: number, code: ApiErrorResponse["code"], error: string, retake?: string[]): StartOutcome => ({
    status,
    body: retake ? { error, code, retake } : { error, code },
  });
  const respond = (body: TryOnCreateResponse): StartOutcome => ({ status: 200, body });

  mark("validating");
  // The buyer photo is decoded, turned upright, stripped of all metadata and checked again with the
  // same photo checks the browser ran. A photo that fails never reaches the guard or the provider.
  let selfie: Awaited<ReturnType<typeof prepareSelfieUpload>>;
  try {
    selfie = await prepareSelfieUpload(new Uint8Array(await personFile.arrayBuffer()));
  } catch (err) {
    console.error("tryon: buyer photo intake failed", err instanceof Error ? err.message : err);
    return fail(500, "server_error", "Something went wrong while checking the buyer photo.");
  }
  if (!selfie.ok) return fail(400, "validation_failed", selfie.error, selfie.retake);

  const validated = await validatePair(new Uint8Array(await garmentFile.arrayBuffer()), selfie.bytes);
  if ("error" in validated) return fail(400, "validation_failed", validated.error);
  const { garment, person } = validated;
  const graded = gradeGarmentPhoto(form.get(GARMENT_GRID_FIELD));

  // Budget and fair-use guard: fail closed into the labelled precomputed run. No provider call is
  // attempted. When admitted, the units are already reserved in the ledger.
  const admission = admitTryOn(sessionKey, cfg);
  if (!admission.admitted) return respond(precomputedBody(cfg, sessionKey, admission.fallback, stages));

  // No task exists yet, so the reserved units are handed back and the browser shows a timeout.
  const abandon = (): StartOutcome => {
    releaseTask(admission.reservation, "start_timeout");
    return fail(
      504,
      "start_timeout",
      `The YouCam API had not accepted both images ${Math.round(TRYON_START_DEADLINE_MS / 1000)} s after the try-on started, so it was stopped before a task was created. No render was requested.`,
    );
  };

  let taskCreated = false;
  try {
    if (pastDeadline()) return abandon();
    mark("uploading_garment");
    const garmentUpload = await uploadImage(garment, `garment.${extFor(garment.contentType)}`, cfg);

    if (pastDeadline()) return abandon();
    mark("uploading_photo");
    const personUpload = await uploadImage(person, `person.${extFor(person.contentType)}`, cfg);

    if (pastDeadline()) return abandon();
    const task = await createTryOnTask(
      { personFileId: personUpload.fileId, garmentFileId: garmentUpload.fileId },
      cfg,
    );
    taskCreated = true;
    mark("task_created");

    // The spend reserved by the guard stays in the ledger as an estimate from here on, whatever
    // the task goes on to do.
    const grade = badgeGrade(listingId, graded);
    const renderId = encodeRenderId({
      t: task.taskId,
      f: task.feature,
      c: task.createdAt,
      m: cfg.mode,
      u: admission.reservation.unitsSpent,
      ...grade,
      ...(listingId ? { l: listingId } : {}),
    });

    return respond({
      renderId,
      mode: cfg.mode,
      live: SERVING_MODES[cfg.mode].live,
      modeLabel: SERVING_MODES[cfg.mode].label,
      status: "queued",
      stages,
      timeoutMs: cfg.pollTimeoutMs,
      pollAfterMs: cfg.pollIntervalMs,
      label: PREVIEW_ONLY_LABEL,
      badge: renderBadge({ m: cfg.mode, ...grade }),
      serving: servingState(sessionKey, cfg),
    });
  } catch (err) {
    // No task existed, so the reserved units are handed back: the ledger nets to zero spend. When
    // task creation may have reached the provider before failing, the reservation is kept, so the
    // ledger can over-count a unit but never under-count one.
    if (!taskCreated && !(err instanceof YouCamError && err.outcomeUnknown)) {
      releaseTask(admission.reservation, err instanceof YouCamError ? `provider_error:${err.kind}` : "server_error");
    }
    if (err instanceof YouCamError) {
      return respond(
        precomputedBody(
          cfg,
          sessionKey,
          providerErrorFallback(err.providerMessage ?? err.message, err.kind, err.errorCode ? err.message : undefined),
          stages,
        ),
      );
    }
    console.error("tryon: unexpected error", err instanceof Error ? err.message : err);
    return fail(500, "server_error", "Something went wrong while starting the try-on.");
  }
}
