import { NextResponse } from "next/server";

import { IMAGE_VARIANTS, findNormalisation, type ImageVariant } from "@/lib/normalise/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/listings/[id]/images/original|normalised — one image of the listing's stored pair, as
 * PNG. The original is the photo upright with its metadata removed; the normalised one is the
 * garment image a try-on sends to the YouCam Apparel VTO API.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await ctx.params;
  const stored = /^\d{1,9}$/.test(id) ? findNormalisation(Number(id)) : undefined;
  if (!stored || !(IMAGE_VARIANTS as readonly string[]).includes(variant)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const image = stored[variant as ImageVariant];
  const version = new URL(req.url).searchParams.get("v");
  if (version && version !== image.sha256.slice(0, 12)) return new NextResponse("Photo replaced. Open the updated listing.", { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
