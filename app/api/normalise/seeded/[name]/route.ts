import { NextResponse } from "next/server";

import { normaliseSeededFixture } from "@/lib/normalise/seeded";
import { SEEDED_FIXTURE_NAMES, isSeededFixtureName } from "@/lib/readiness/seeded";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const dynamicParams = false;

/** Only fixtures the pipeline accepts have a normalised image. */
export function generateStaticParams() {
  return SEEDED_FIXTURE_NAMES.filter((name) => normaliseSeededFixture(name).ok).map((name) => ({ name }));
}

/** GET /api/normalise/seeded/[name] — the normalised image of a seeded fixture, as PNG. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const outcome = isSeededFixtureName(name) ? normaliseSeededFixture(name) : null;
  if (!outcome?.ok) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(outcome.normalised.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
