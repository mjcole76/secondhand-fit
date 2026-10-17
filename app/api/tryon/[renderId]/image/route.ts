import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { YouCamError, checkTask, fetchResultImage, getYouCamConfig, type TaskHandle } from "@/lib/youcam/adapter";
import { burnInLabel, type BurnInSource } from "@/lib/tryon/burn-in";
import { renderBadge } from "@/lib/tryon/honesty";
import { decodeRenderId } from "@/lib/tryon/render-id";
import { recallResultUrl, rememberResultUrl } from "@/lib/tryon/result-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRECOMPUTED_ASSET = "/mock/precomputed-render.svg";
/** Only this project's own placeholder drawings are ever read from disk. */
const PLACEHOLDER_ASSET = /^\/mock\/[a-z0-9-]+\.svg$/;

async function readPlaceholder(assetPath: string): Promise<BurnInSource | null> {
  if (!PLACEHOLDER_ASSET.test(assetPath)) return null;
  try {
    const text = await readFile(path.join(process.cwd(), "public", "mock", path.basename(assetPath)), "utf8");
    return { kind: "placeholder-svg", text };
  } catch {
    return null;
  }
}

function labelledResponse(svg: string) {
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": 'inline; filename="secondhand-fit-preview-only.svg"',
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=600",
      "X-Preview-Only": "true",
    },
  });
}

/**
 * GET /api/tryon/[renderId]/image
 *
 * Same-origin image proxy, and the only way a render reaches a browser. Every response is the
 * render with the preview-only label and the readiness badge burned in (lib/tryon/burn-in.ts), so
 * the image shown on a page, saved from it or downloaded is always labelled. Live renders are
 * downloaded server-side from the provider result URL, so the browser never receives a provider
 * URL. Mock and precomputed renders use the builder-owned placeholder drawings under /public/mock.
 * A render that cannot be labelled is not served.
 */
export async function GET(req: Request, ctx: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await ctx.params;
  const ticket = decodeRenderId(renderId);
  if (!ticket) return new NextResponse("Not found", { status: 404 });

  const info = { mode: ticket.m, badge: renderBadge(ticket) };

  /** Placeholder drawings carry their own preview-only line, so the plain file is a safe last resort. */
  const servePlaceholder = async (assetPath: string) => {
    const source = await readPlaceholder(assetPath);
    const svg = source ? burnInLabel(source, info) : null;
    if (svg) return labelledResponse(svg);
    if (PLACEHOLDER_ASSET.test(assetPath)) return NextResponse.redirect(new URL(assetPath, req.url), 302);
    return new NextResponse("Render image unavailable", { status: 502 });
  };

  if (ticket.m === "precomputed") return servePlaceholder(PRECOMPUTED_ASSET);

  const cfg = getYouCamConfig();
  const handle: TaskHandle = { taskId: ticket.t, feature: ticket.f, createdAt: ticket.c, mode: ticket.m };

  try {
    let resultUrl = recallResultUrl(renderId);
    if (!resultUrl) {
      const status = await checkTask(handle, cfg);
      if (status.state !== "succeeded" || !status.resultUrl) {
        return new NextResponse("Render is not ready", { status: 409 });
      }
      resultUrl = status.resultUrl;
      rememberResultUrl(renderId, resultUrl);
    }

    if (ticket.m === "mock" || resultUrl.startsWith("/")) return servePlaceholder(resultUrl);

    const image = await fetchResultImage(resultUrl);
    const svg = burnInLabel({ kind: "raster", bytes: image.bytes }, info);
    if (!svg) {
      console.error("tryon image: result is not a JPEG, PNG or WebP image; not served unlabelled");
      return new NextResponse("Render image unavailable: unsupported image type", { status: 502 });
    }
    return labelledResponse(svg);
  } catch (err) {
    if (err instanceof YouCamError) {
      return new NextResponse(`Render image unavailable: ${err.message}`, { status: 502 });
    }
    console.error("tryon image: unexpected error", err instanceof Error ? err.message : err);
    return new NextResponse("Render image unavailable", { status: 500 });
  }
}
