import { NextResponse } from "next/server";

import { SEEDED_DRAWING_NAMES, isSeededDrawingName, renderSeededDrawing } from "@/lib/listings/seeded-set";
import { encodePng } from "@/lib/readiness/png";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return SEEDED_DRAWING_NAMES.map((name) => ({ name }));
}

/** GET /api/listings/seeded/[name] — a drawing of the seeded demo listing set as a PNG. */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  if (!isSeededDrawingName(name)) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(encodePng(renderSeededDrawing(name))), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
