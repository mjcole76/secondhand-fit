/**
 * Browser-only: turns the photo the buyer took or picked into the copy that is uploaded, and runs
 * the quality gate on it (lib/tryon/selfie-gate.ts). The copy is upright, at most
 * SELFIE_GATE.uploadMaxSidePx on its longer side and a fresh JPEG, so it carries no EXIF, GPS or
 * timestamps and stays well under the request size limit. Nothing leaves the browser here.
 */

import { SELFIE_GATE, evaluateSelfie, lumaStats, type SelfieGateResult } from "./selfie-gate";

export interface BrowserSelfie {
  /** The JPEG that is uploaded. */
  blob: Blob;
  gate: SelfieGateResult;
}

export class SelfieReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfieReadError";
  }
}

function drawScaled(img: HTMLImageElement, maxSide: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new SelfieReadError("This browser cannot prepare the photo (no canvas).");
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

export async function prepareSelfie(file: Blob): Promise<BrowserSelfie> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new SelfieReadError(
        "This file could not be read as a photo. Use a JPEG, PNG or WebP photo, or take one with the camera button.",
      );
    }
    if (!img.naturalWidth || !img.naturalHeight) throw new SelfieReadError("This photo has no readable size.");

    // Browsers apply the EXIF orientation when drawing, so both copies are upright.
    const upload = drawScaled(img, SELFIE_GATE.uploadMaxSidePx);
    const analysis = drawScaled(img, SELFIE_GATE.analysisMaxSidePx);
    const { width, height } = analysis.canvas;
    const stats = lumaStats(analysis.ctx.getImageData(0, 0, width, height).data, width, height, 4);
    const gate = evaluateSelfie({ width: upload.canvas.width, height: upload.canvas.height }, stats);

    const blob = await new Promise<Blob | null>((resolve) =>
      upload.canvas.toBlob(resolve, "image/jpeg", SELFIE_GATE.jpegQuality),
    );
    if (!blob) throw new SelfieReadError("The photo could not be prepared for upload in this browser.");
    return { blob, gate };
  } finally {
    URL.revokeObjectURL(url);
  }
}
