import { NextResponse } from "next/server";

import type { ListingPublishResponse, PublishRefusedResponse } from "@/lib/listings/contracts";
import { findDraftListing } from "@/lib/listings/drafts";
import { publishListing } from "@/lib/listings/published";
import { gradeReason } from "@/lib/readiness/grade";
import type { ApiErrorResponse } from "@/lib/tryon/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: ApiErrorResponse["code"], error: string) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

/**
 * POST /api/listings/[id]/publish — no body.
 *
 * Publishes a draft listing with the try-on readiness grade of the latest readiness attempt the
 * server recorded for it (POST /api/readiness with the listing's id). The request carries no grade
 * and no scores, so the grade cannot be set from the browser. A draft with no recorded attempt, or
 * whose latest attempt has a failing check, gets a 409 and stays a draft. This path never touches
 * the YouCam adapter.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const draft = /^\d{1,9}$/.test(id) ? findDraftListing(Number(id)) : undefined;
  if (!draft) {
    return errorResponse(404, "not_found", "Draft listing not found. Create the listing with POST /api/listings first.");
  }

  const outcome = publishListing(draft);
  if (outcome.ok) {
    return NextResponse.json<ListingPublishResponse>({ listing: outcome.listing }, { status: 201 });
  }

  const error =
    outcome.code === "photo_not_prepared"
      ? "The latest photo is not prepared yet. Run its checks and wait for image preparation before publishing."
      : outcome.code === "no_readiness_run"
      ? "This listing has no checked photo yet. Run the readiness checks on a garment photo first."
      : `The latest photo for this listing was not accepted, so the listing stays a draft.${
          outcome.graded ? ` ${gradeReason(outcome.graded)}` : ""
        }`;
  return NextResponse.json<PublishRefusedResponse>(
    { error, code: outcome.code, grade: outcome.graded?.grade ?? null, published: false },
    { status: 409 },
  );
}
