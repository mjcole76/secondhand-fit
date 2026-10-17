/**
 * Browser-only: turns the chosen garment photo into the small analysis grid the readiness checks
 * run on, so POST /api/tryon can grade the photo and sign the grade into the render id. Same
 * decode and box-filter path as the seller readiness checker; only the grid leaves the browser
 * here, and only to this app's own server.
 */

import { downsampleToGrid } from "@/lib/readiness/analyse";
import type { ReadinessRunRequest } from "@/lib/readiness/contracts";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";

export type GarmentGridPayload = NonNullable<ReadinessRunRequest["grid"]>;

export async function garmentAnalysisGrid(file: Blob): Promise<GarmentGridPayload> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();

    const scale = Math.min(
      1,
      READINESS_THRESHOLDS.analysis.decodeMaxSidePx / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const grid = downsampleToGrid({
      width: canvas.width,
      height: canvas.height,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    });

    let binary = "";
    const step = 0x8000;
    for (let i = 0; i < grid.data.length; i += step) {
      binary += String.fromCharCode.apply(null, grid.data.subarray(i, i + step) as unknown as number[]);
    }
    return { width: grid.width, height: grid.height, rgbaBase64: btoa(binary) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
