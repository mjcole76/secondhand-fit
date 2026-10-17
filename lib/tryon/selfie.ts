/**
 * Server-side intake of the buyer photo for POST /api/tryon, using sharp.
 *
 * Decodes the photo as received, turns it upright from its EXIF orientation, scales it to at most
 * SELFIE_GATE.uploadMaxSidePx and re-encodes it as a fresh JPEG. sharp writes no metadata unless
 * asked to, so EXIF, GPS, timestamps and colour profiles never reach the YouCam API. The quality
 * gate (lib/tryon/selfie-gate.ts) then runs on the re-encoded photo, the same checks the browser
 * ran, so a photo that fails is refused before any provider call. Server-only.
 */

import sharp from "sharp";

import { SELFIE_GATE, evaluateSelfie, lumaStats, type SelfieGateResult } from "./selfie-gate";

const FORMATS = ["jpeg", "png", "webp"];

export type PreparedSelfie =
  | { ok: true; bytes: Uint8Array; gate: SelfieGateResult }
  | { ok: false; error: string; retake: string[] };

export async function prepareSelfieUpload(received: Uint8Array): Promise<PreparedSelfie> {
  const input = Buffer.from(received.buffer, received.byteOffset, received.byteLength);
  const unreadable: PreparedSelfie = {
    ok: false,
    error: "Buyer photo: this file could not be read as a photo.",
    retake: ["Use a JPEG, PNG or WebP photo, or take one with the camera button."],
  };

  const meta = await sharp(input, { limitInputPixels: SELFIE_GATE.maxInputPixels })
    .metadata()
    .catch(() => null);
  if (!meta || !meta.format || !FORMATS.includes(meta.format) || !meta.width || !meta.height) return unreadable;

  let bytes: Buffer;
  let width: number;
  let height: number;
  let pixels: Buffer;
  let analysisWidth: number;
  let analysisHeight: number;
  let channels: number;
  try {
    const out = await sharp(input, { limitInputPixels: SELFIE_GATE.maxInputPixels })
      .autoOrient()
      .resize({
        width: SELFIE_GATE.uploadMaxSidePx,
        height: SELFIE_GATE.uploadMaxSidePx,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: Math.round(SELFIE_GATE.jpegQuality * 100) })
      .toBuffer({ resolveWithObject: true });
    bytes = out.data;
    width = out.info.width;
    height = out.info.height;

    const analysis = await sharp(bytes)
      .resize({
        width: SELFIE_GATE.analysisMaxSidePx,
        height: SELFIE_GATE.analysisMaxSidePx,
        fit: "inside",
        withoutEnlargement: true,
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    pixels = analysis.data;
    analysisWidth = analysis.info.width;
    analysisHeight = analysis.info.height;
    channels = analysis.info.channels;
  } catch {
    return unreadable;
  }

  const gate = evaluateSelfie({ width, height }, lumaStats(pixels, analysisWidth, analysisHeight, channels));
  if (!gate.passed) {
    return {
      ok: false,
      error: "Buyer photo: it did not pass the photo checks, so nothing was sent to the YouCam API.",
      retake: gate.instructions,
    };
  }
  return { ok: true, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), gate };
}
