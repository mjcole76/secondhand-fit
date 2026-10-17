import { NextResponse } from "next/server";

import { encodePng } from "@/lib/readiness/png";
import { SEEDED_FIXTURE_NAMES, isSeededFixtureName, renderSeededFixture } from "@/lib/readiness/seeded";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SEEDED_FIXTURE_NAMES.map((name) => ({ name }));
}

/**
 * GET /api/readiness/seeded/[name] — the drawn fixture as a PNG, so the browser can feed it through
 * the same decode-and-analyse path as an uploaded photo.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!isSeededFixtureName(name)) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(encodePng(renderSeededFixture(name))), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
