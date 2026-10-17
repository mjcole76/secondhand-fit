import { NextResponse } from "next/server";

import type { SeededNormaliseResponse } from "@/lib/normalise/contracts";
import { seededPair, seededRefusal } from "@/lib/normalise/seeded";
import { NORMALISE_SETTINGS } from "@/lib/normalise/settings";
import { SEEDED_FIXTURE_NAMES, seededFixtureInfo } from "@/lib/readiness/seeded";

export const runtime = "nodejs";
export const dynamic = "force-static";

/**
 * GET /api/normalise/seeded — the seeded pair through the normalisation pipeline: the bad flat-lay
 * is refused, the retake is normalised. Computed by the same code at build time; nothing here is
 * hand-written.
 */
export async function GET() {
  const body: SeededNormaliseResponse = {
    settingsVersion: NORMALISE_SETTINGS.version,
    fixtures: SEEDED_FIXTURE_NAMES.map((name) => {
      const info = seededFixtureInfo(name);
      return { name, source: info.source, title: info.title, pair: seededPair(name), refusal: seededRefusal(name) };
    }),
  };
  return NextResponse.json(body);
}
