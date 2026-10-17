/**
 * Server-side decode of a seller's garment photo for normalisation, using sharp.
 *
 * Takes the file exactly as the seller picked it (JPEG, PNG or WebP), turns it upright from its
 * EXIF orientation tag, scales it down to the working size and hands back RGBA pixels. Only pixels
 * come out: EXIF, GPS, timestamps and colour profiles are all left behind, and the stored images
 * are re-encoded from these pixels. Server-only.
 */

import sharp from "sharp";

import type { PixelGrid } from "@/lib/readiness/contracts";

import { NORMALISE_SETTINGS as N } from "./settings";

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDecodeError";
  }
}

export interface DecodedUpload {
  /** Upright, at most uploadMaxSidePx on the longer side, alpha channel included. */
  pixels: PixelGrid;
  /** EXIF orientation 1–8 the file carried; 1 when it had none. Already applied to `pixels`. */
  orientation: number;
  /** Size of the upright photo as received, before it was scaled to the working size. */
  receivedSize: { width: number; height: number };
}

const FORMATS = ["jpeg", "png", "webp"];

export async function decodeUpload(bytes: Uint8Array): Promise<DecodedUpload> {
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const meta = await sharp(input, { limitInputPixels: N.maxInputPixels })
    .metadata()
    .catch(() => null);
  if (!meta) {
    throw new ImageDecodeError("This file could not be read as an image. Use a JPEG, PNG or WebP photo.");
  }
  if (!meta.format || !FORMATS.includes(meta.format)) {
    throw new ImageDecodeError("Unsupported file type. Use a JPEG, PNG or WebP photo.");
  }
  if (!meta.width || !meta.height) {
    throw new ImageDecodeError("This image has no readable size.");
  }

  const orientation = meta.orientation && meta.orientation >= 1 && meta.orientation <= 8 ? meta.orientation : 1;
  // Orientations 5–8 swap width and height once applied.
  const receivedSize =
    orientation >= 5 ? { width: meta.height, height: meta.width } : { width: meta.width, height: meta.height };

  try {
    const { data, info } = await sharp(input, { limitInputPixels: N.maxInputPixels })
      .autoOrient()
      .resize({
        width: N.uploadMaxSidePx,
        height: N.uploadMaxSidePx,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      pixels: {
        width: info.width,
        height: info.height,
        data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      },
      orientation,
      receivedSize,
    };
  } catch {
    throw new ImageDecodeError("This image could not be decoded. Use a JPEG, PNG or WebP photo.");
  }
}
