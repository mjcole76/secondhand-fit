import { NextResponse } from "next/server";

import { seededDemoListings, seededRejection, seededSetAssets } from "@/lib/listings/seeded-set";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/listings/seeded — the seeded demo listing set: the listings it publishes with their
 * grades, the refused bad flat-lay, and every picture with its licence. Computed by the same
 * scoring code at build time; nothing here is hand-written.
 */
export async function GET() {
  return NextResponse.json({
    thresholdVersion: READINESS_THRESHOLDS.version,
    listings: seededDemoListings(),
    refused: seededRejection(),
    assets: seededSetAssets(),
  });
}
