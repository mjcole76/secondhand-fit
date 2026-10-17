import { NextResponse } from "next/server";

import { analyseFlatLay } from "@/lib/readiness/analyse";
import type { SeededFixturesResponse } from "@/lib/readiness/contracts";
import { attemptGrade } from "@/lib/readiness/grade";
import { SEEDED_FIXTURE_NAMES, renderSeededFixture, seededFixtureInfo } from "@/lib/readiness/seeded";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/readiness/seeded — the seeded fixtures, the readiness result and the grade each one produces.
 * Computed by the same scoring code at build time; nothing here is hand-written.
 */
export async function GET() {
  const body: SeededFixturesResponse = {
    thresholdVersion: READINESS_THRESHOLDS.version,
    fixtures: SEEDED_FIXTURE_NAMES.map((name) => {
      const expected = analyseFlatLay(renderSeededFixture(name));
      return { ...seededFixtureInfo(name), expected, grade: attemptGrade(expected) };
    }),
  };
  return NextResponse.json(body);
}
