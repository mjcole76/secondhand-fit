import { NextResponse } from "next/server";

import { LISTING_CATEGORIES, findCategory } from "@/lib/listings/categories";
import {
  LISTING_LIMITS,
  categoryRefusal,
  type CategoryRefusedResponse,
  type ListingCreateResponse,
  type ListingsResponse,
} from "@/lib/listings/contracts";
import { createDraftListing } from "@/lib/listings/drafts";
import { listPublishedListings } from "@/lib/listings/published";
import type { ApiErrorResponse } from "@/lib/tryon/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: ApiErrorResponse["code"], error: string) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

/**
 * GET /api/listings — the published listings for the browse grid, each with its try-on readiness
 * grade, the reason the grade is not higher and the per-check breakdown.
 */
export async function GET() {
  return NextResponse.json<ListingsResponse>({ listings: listPublishedListings() });
}

/**
 * POST /api/listings
 * JSON: { title: string, category: string, sizeText?: string }
 *
 * Creates a draft listing from the details the seller enters before the photo step. The category
 * is checked first: a category on the refused list (lib/listings/categories.ts) gets a 422 with
 * the reason and the location of the scope statement, and nothing is created — no draft, no
 * upload, no readiness run. This path never touches the YouCam adapter.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "bad_request", "Expected a JSON body with a title and a category.");
  }
  if (!body || typeof body !== "object") {
    return errorResponse(400, "bad_request", "Expected a JSON body with a title and a category.");
  }

  const { title, category: categoryId, sizeText } = body as Record<string, unknown>;

  const category = typeof categoryId === "string" ? findCategory(categoryId) : undefined;
  if (!category) {
    return errorResponse(
      400,
      "validation_failed",
      `category must be one of: ${LISTING_CATEGORIES.map((c) => c.id).join(", ")}.`,
    );
  }
  if (category.blocked) {
    return NextResponse.json<CategoryRefusedResponse>(categoryRefusal(category), { status: 422 });
  }

  const cleanTitle = typeof title === "string" ? title.trim() : "";
  if (cleanTitle.length === 0 || cleanTitle.length > LISTING_LIMITS.titleMaxChars) {
    return errorResponse(
      400,
      "validation_failed",
      `title is required and must be at most ${LISTING_LIMITS.titleMaxChars} characters.`,
    );
  }

  if (sizeText !== undefined && sizeText !== null && typeof sizeText !== "string") {
    return errorResponse(400, "validation_failed", "sizeText must be text.");
  }
  const cleanSize = typeof sizeText === "string" ? sizeText.trim() : "";
  if (cleanSize.length > LISTING_LIMITS.sizeTextMaxChars) {
    return errorResponse(
      400,
      "validation_failed",
      `sizeText must be at most ${LISTING_LIMITS.sizeTextMaxChars} characters.`,
    );
  }

  const listing = createDraftListing({ title: cleanTitle, category, sizeText: cleanSize || null });
  return NextResponse.json<ListingCreateResponse>({ listing }, { status: 201 });
}
