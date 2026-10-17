import { NextResponse } from "next/server";

import { findDraftListing } from "@/lib/listings/drafts";
import type { NormaliseRefusedResponse, NormaliseResponse } from "@/lib/normalise/contracts";
import { ImageDecodeError, decodeUpload } from "@/lib/normalise/decode";
import { normaliseGarmentImage } from "@/lib/normalise/normalise";
import { NORMALISE_SETTINGS } from "@/lib/normalise/settings";
import { saveNormalisation, storedPair } from "@/lib/normalise/store";
import type { PixelGrid, ReadinessSource } from "@/lib/readiness/contracts";
import { latestReadinessRunForListing } from "@/lib/readiness/runs";
import { attemptGrade } from "@/lib/readiness/grade";
import { renderSeededFixture, seededFixtureForSource } from "@/lib/readiness/seeded";
import type { ApiErrorResponse } from "@/lib/tryon/contracts";
import { sniffImageMime } from "@/lib/youcam/adapter";
import { ledgerSummary } from "@/lib/youcam/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES: readonly ReadinessSource[] = ["upload", "seeded-bad", "seeded-retake"];
const MAX_MB = (NORMALISE_SETTINGS.maxRequestBytes / (1024 * 1024)).toFixed(0);

function errorResponse(status: number, code: ApiErrorResponse["code"], error: string) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

/**
 * POST /api/listings/[id]/normalise?source=upload|seeded-bad|seeded-retake
 * Body for source=upload: the garment photo file itself (JPEG, PNG or WebP, at most
 * NORMALISE_SETTINGS.maxRequestBytes). No body for the seeded sources: the server uses its own copy
 * of the drawing.
 *
 * Decodes the file with sharp, turns it upright from its EXIF orientation tag and scales it to the
 * working size, re-runs the readiness checks on these exact pixels, and — only if they
 * accept it — crops to the garment with padding, flattens confidently matched plain surface to a
 * neutral colour, resizes and encodes it, and checks it against the VTO input limits. The original
 * (upright, metadata removed) and the normalised image are stored side by side against the draft;
 * a retake replaces both. A photo the checks do not accept gets a 422 and nothing is stored.
 *
 * This path never touches the YouCam adapter's network calls. The usage ledger is read before and
 * after purely to report that no entry was added.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const ledgerEntriesBefore = ledgerSummary().entries;

  const { id } = await ctx.params;
  const draft = /^\d{1,9}$/.test(id) ? findDraftListing(Number(id)) : undefined;
  if (!draft) {
    return errorResponse(404, "not_found", "Draft listing not found. Create the listing with POST /api/listings first.");
  }

  const source = new URL(req.url).searchParams.get("source") ?? "upload";
  if (!(SOURCES as readonly string[]).includes(source)) {
    return errorResponse(400, "bad_request", `source must be one of: ${SOURCES.join(", ")}.`);
  }
  const runSource = source as ReadinessSource;

  let pixels: PixelGrid;
  let orientation = 1;
  let receivedSize: { width: number; height: number } | undefined;
  const fixture = seededFixtureForSource(runSource);
  if (fixture) {
    pixels = renderSeededFixture(fixture);
  } else {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > NORMALISE_SETTINGS.maxRequestBytes) {
      return errorResponse(413, "validation_failed", `The photo is larger than the ${MAX_MB} MB limit for this step.`);
    }
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) {
      return errorResponse(400, "validation_failed", "No image data received. Send the photo file as the request body.");
    }
    if (bytes.length > NORMALISE_SETTINGS.maxRequestBytes) {
      return errorResponse(413, "validation_failed", `The photo is larger than the ${MAX_MB} MB limit for this step.`);
    }
    // The type is read from the file's own bytes, not from the request headers.
    if (!sniffImageMime(bytes)) {
      return errorResponse(415, "validation_failed", "Unsupported file type. Use a JPEG, PNG or WebP photo.");
    }
    try {
      const decoded = await decodeUpload(bytes);
      pixels = decoded.pixels;
      orientation = decoded.orientation;
      receivedSize = decoded.receivedSize;
    } catch (err) {
      if (err instanceof ImageDecodeError) return errorResponse(422, "validation_failed", err.message);
      throw err;
    }
  }

  try {
    const outcome = normaliseGarmentImage(pixels, { orientation, source: runSource, receivedSize });
    if (!outcome.ok) {
      const error =
        outcome.code === "readiness_not_accepted"
          ? "The readiness checks on the server did not accept this photo, so it was not normalised. Retake it using the instructions."
          : "The normalised image came out outside the VTO input limits, so it was not stored.";
      return NextResponse.json<NormaliseRefusedResponse>(
        {
          error,
          code: outcome.code,
          grade: attemptGrade(outcome.result),
          instructions: outcome.result.instructions,
          normalised: false,
        },
        { status: 422 },
      );
    }

    const stored = saveNormalisation({
      listingId: draft.id,
      readinessRunId: latestReadinessRunForListing(draft.id)?.id,
      source: runSource,
      original: outcome.original,
      normalised: outcome.normalised,
      report: outcome.report,
    });
    const ledgerEntriesAfter = ledgerSummary().entries;

    const response: NormaliseResponse = {
      listingId: draft.id,
      pair: storedPair(stored),
      providerCalls: {
        ledgerEntriesBefore,
        ledgerEntriesAfter,
        ledgerEntriesAdded: ledgerEntriesAfter - ledgerEntriesBefore,
      },
      recordedAt: new Date(stored.createdAt).toISOString(),
    };
    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    console.error("normalise: unexpected error", err instanceof Error ? err.message : err);
    return errorResponse(500, "server_error", "Something went wrong while preparing the photo for try-on.");
  }
}
