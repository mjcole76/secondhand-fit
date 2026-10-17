import { NextResponse } from "next/server";

import { findCategory } from "@/lib/listings/categories";
import { categoryRefusal, type CategoryRefusedResponse } from "@/lib/listings/contracts";
import { findDraftListing } from "@/lib/listings/drafts";
import { analyseFlatLay, downsampleToGrid } from "@/lib/readiness/analyse";
import type { PixelGrid, ReadinessRunResponse, ReadinessSource } from "@/lib/readiness/contracts";
import { attemptGrade } from "@/lib/readiness/grade";
import { recordReadinessRun } from "@/lib/readiness/runs";
import { renderSeededFixture, seededFixtureForSource } from "@/lib/readiness/seeded";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";
import type { ApiErrorResponse } from "@/lib/tryon/contracts";
import { ledgerSummary } from "@/lib/youcam/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCES: readonly ReadinessSource[] = ["upload", "seeded-bad", "seeded-retake"];
const MIN_GRID_SIDE = 16;

function errorResponse(status: number, code: ApiErrorResponse["code"], error: string) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

function parseGrid(value: unknown): PixelGrid | { error: string } {
  if (!value || typeof value !== "object") return { error: "grid must be an object." };
  const { width, height, rgbaBase64 } = value as Record<string, unknown>;
  const max = READINESS_THRESHOLDS.analysis.gridMaxSidePx;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    (width as number) < MIN_GRID_SIDE ||
    (height as number) < MIN_GRID_SIDE ||
    (width as number) > max ||
    (height as number) > max
  ) {
    return { error: `grid width and height must be whole numbers between ${MIN_GRID_SIDE} and ${max}.` };
  }
  const expected = (width as number) * (height as number) * 4;
  if (typeof rgbaBase64 !== "string" || rgbaBase64.length > Math.ceil(expected / 3) * 4 + 4) {
    return { error: "grid.rgbaBase64 must be base64 RGBA data for width × height pixels." };
  }
  const data = new Uint8Array(Buffer.from(rgbaBase64, "base64"));
  if (data.length !== expected) {
    return { error: "grid.rgbaBase64 must be base64 RGBA data for width × height pixels." };
  }
  return { width: width as number, height: height as number, data };
}

/**
 * POST /api/readiness
 * JSON: { source: "upload" | "seeded-bad" | "seeded-retake", category?: string,
 *         listingId?: number, grid?: { width, height, rgbaBase64 } }
 *
 * Confirms a readiness check server-side with the same deterministic scoring the browser runs,
 * records the attempt, and returns the verdicts, the grade and the ordered retake instructions.
 * `grid` is the small analysis grid the browser already computed — the photo itself is not
 * uploaded here. For the seeded sources `grid` may be omitted and the server analyses its own copy
 * of the fixture. For "upload" the listing `category` is required, and a category on the refused
 * list gets a 422 and no run. With `listingId` the attempt is recorded against that draft listing,
 * which POST /api/listings/[id]/publish then publishes from; for an id the server does not hold
 * the run is recorded unattached and the response carries `listingId: null`.
 *
 * This path never touches the YouCam adapter. The usage ledger is read before and after purely to
 * report that no entry was added.
 */
export async function POST(req: Request) {
  const ledgerEntriesBefore = ledgerSummary().entries;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "bad_request", "Expected a JSON body with a source and an analysis grid.");
  }
  if (!body || typeof body !== "object") {
    return errorResponse(400, "bad_request", "Expected a JSON body with a source and an analysis grid.");
  }

  const { source, category: categoryId, listingId: rawListingId, grid: rawGrid } = body as Record<string, unknown>;
  if (typeof source !== "string" || !(SOURCES as readonly string[]).includes(source)) {
    return errorResponse(400, "bad_request", `source must be one of: ${SOURCES.join(", ")}.`);
  }
  const runSource = source as ReadinessSource;

  // An attempt recorded against a draft listing is what that listing is later published from. A
  // draft this server does not hold (drafts are in memory) still gets its run, unattached, and the
  // response says so with listingId null.
  let listingId: number | null = null;
  if (rawListingId !== undefined && rawListingId !== null) {
    if (typeof rawListingId !== "number" || !Number.isInteger(rawListingId)) {
      return errorResponse(400, "validation_failed", "listingId must be the id of a draft listing.");
    }
    if (findDraftListing(rawListingId)) listingId = rawListingId;
  }

  // A seller's own photo belongs to a listing, and a refused category gets no readiness run.
  if (runSource === "upload") {
    const category = typeof categoryId === "string" ? findCategory(categoryId) : undefined;
    if (!category) {
      return errorResponse(
        400,
        "validation_failed",
        "category is required when source is upload. Create the listing with POST /api/listings first.",
      );
    }
    if (category.blocked) {
      return NextResponse.json<CategoryRefusedResponse>(categoryRefusal(category), { status: 422 });
    }
  }

  let grid: PixelGrid;
  if (rawGrid !== undefined) {
    const parsed = parseGrid(rawGrid);
    if ("error" in parsed) return errorResponse(400, "validation_failed", parsed.error);
    grid = parsed;
  } else {
    const fixture = seededFixtureForSource(runSource);
    if (!fixture) return errorResponse(400, "bad_request", "grid is required when source is upload.");
    grid = downsampleToGrid(renderSeededFixture(fixture));
  }

  try {
    const result = analyseFlatLay(grid);
    const run = recordReadinessRun(runSource, result, listingId);
    const ledgerEntriesAfter = ledgerSummary().entries;

    const response: ReadinessRunResponse = {
      runId: run.id,
      listingId: run.listingId,
      source: runSource,
      result,
      grade: attemptGrade(result),
      providerCalls: {
        ledgerEntriesBefore,
        ledgerEntriesAfter,
        ledgerEntriesAdded: ledgerEntriesAfter - ledgerEntriesBefore,
      },
      recordedAt: new Date(run.createdAt).toISOString(),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("readiness: unexpected error", err instanceof Error ? err.message : err);
    return errorResponse(500, "server_error", "Something went wrong while checking the photo.");
  }
}
