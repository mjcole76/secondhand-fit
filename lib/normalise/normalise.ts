/**
 * Garment image normalisation — server side, deterministic, no network.
 *
 * Turns an accepted flat-lay into the garment image a try-on sends to the YouCam Apparel VTO API:
 *
 *   1. orient      upright from the file's EXIF orientation tag (applied by sharp in ./decode.ts)
 *   2. metadata    keep pixels only: both outputs are re-encoded, so no camera, date or location data survives
 *   3. gate        the server's own readiness check; a photo it does not accept is not normalised
 *   4. crop        to the garment's bounding box from the readiness segmentation, plus padding
 *   5. background  flatten plain surface to a neutral colour, only where the surface match is confident
 *   6. resize      to the output size, inside the VTO side limits
 *   7. encode      PNG, then measured against YOUCAM_PINNED.input; an image outside them is refused
 *
 * The segmentation is the readiness checker's own (lib/readiness/analyse.ts), so the crop and the
 * grade come from the same pass over the same pixels. Every number comes from
 * lib/normalise/settings.ts or YOUCAM_PINNED.input. Server-only: it reads the adapter's pinned
 * limits but never calls the provider.
 */

import { createHash } from "node:crypto";

import { READINESS_CHECKS, assembleReadinessResult, segmentGarment, type Segmentation } from "@/lib/readiness/analyse";
import type { AttemptGrade, PixelGrid, ReadinessResult, ReadinessSource } from "@/lib/readiness/contracts";
import { attemptGrade } from "@/lib/readiness/grade";
import { encodePng } from "@/lib/readiness/png";
import { YOUCAM_PINNED } from "@/lib/youcam/adapter";

import type { ConstraintCheck, NormaliseStep, NormalisedImageInfo, NormalisedPair } from "./contracts";
import { NORMALISE_SETTINGS as N } from "./settings";

export interface EncodedImage {
  bytes: Buffer;
  width: number;
  height: number;
  sha256: string;
}

export interface NormaliseReport {
  steps: NormaliseStep[];
  crop: { x: number; y: number; width: number; height: number };
  suppressedAreaFrac: number;
  constraints: ConstraintCheck[];
  withinConstraints: boolean;
  constraintsConfirmed: boolean;
  grade: AttemptGrade | null;
  settingsVersion: string;
}

export type NormaliseOutcome =
  | { ok: true; original: EncodedImage; normalised: EncodedImage; report: NormaliseReport }
  | { ok: false; code: "readiness_not_accepted"; result: ReadinessResult }
  | { ok: false; code: "outside_input_limits"; result: ReadinessResult; report: NormaliseReport };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function percent(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

function encode(grid: PixelGrid): EncodedImage {
  const bytes = encodePng(grid);
  return { bytes, width: grid.width, height: grid.height, sha256: createHash("sha256").update(bytes).digest("hex") };
}

// ---------------------------------------------------------------------------
// 1–2. Orientation and transparency
// ---------------------------------------------------------------------------

/** What each EXIF orientation tag made the decoder do, for the "what changed" list. */
const ORIENTATION_WORDS: Record<number, string> = {
  2: "mirrored left to right",
  3: "rotated 180°",
  4: "mirrored top to bottom",
  5: "flipped across its diagonal",
  6: "rotated 90° clockwise",
  7: "flipped across its other diagonal",
  8: "rotated 90° anticlockwise",
};

/** A copy of the pixels with any transparency flattened onto white, as the readiness grid does. */
function flattenOntoWhite(src: PixelGrid): PixelGrid {
  const data = new Uint8ClampedArray(src.width * src.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const a = src.data[i + 3] / 255;
    data[i] = src.data[i] * a + 255 * (1 - a);
    data[i + 1] = src.data[i + 1] * a + 255 * (1 - a);
    data[i + 2] = src.data[i + 2] * a + 255 * (1 - a);
    data[i + 3] = 255;
  }
  return { width: src.width, height: src.height, data };
}

// ---------------------------------------------------------------------------
// 4. Crop to the garment
// ---------------------------------------------------------------------------

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the frame edge cut into the padding on at least one side. */
  paddingClipped: boolean;
}

/** The garment's bounding box from the analysis grid, scaled to full resolution and padded. */
function garmentCrop(seg: Segmentation, W: number, H: number): Crop {
  // Grid pixel x covers source columns [floor(x·W/w), floor((x+1)·W/w)), as in downsampleToGrid.
  const x0 = Math.floor((seg.box.x0 * W) / seg.width);
  const x1 = Math.floor(((seg.box.x1 + 1) * W) / seg.width);
  const y0 = Math.floor((seg.box.y0 * H) / seg.height);
  const y1 = Math.floor(((seg.box.y1 + 1) * H) / seg.height);
  const pad = Math.round(N.paddingFrac * Math.max(x1 - x0, y1 - y0));

  const cx0 = Math.max(0, x0 - pad);
  const cy0 = Math.max(0, y0 - pad);
  const cx1 = Math.min(W, x1 + pad);
  const cy1 = Math.min(H, y1 + pad);
  return {
    x: cx0,
    y: cy0,
    width: cx1 - cx0,
    height: cy1 - cy0,
    paddingClipped: cx0 > x0 - pad || cy0 > y0 - pad || cx1 < x1 + pad || cy1 < y1 + pad,
  };
}

// ---------------------------------------------------------------------------
// 5. Conservative background suppression
// ---------------------------------------------------------------------------

/**
 * Per analysis-grid pixel, how far (0–1) to blend towards the neutral colour. Only pixels the
 * segmentation matched to the surface palette qualify, and only once they are more than guardCells
 * away from anything that did not match — garment, other objects, or unmatched surface alike —
 * so edges, thin straps and anything uncertain stay exactly as photographed.
 */
function suppressionWeights(seg: Segmentation): Float32Array {
  const { width: w, height: h, surface } = seg;
  const { guardCells, featherCells } = N.background;
  const cap = guardCells + featherCells;

  // Chessboard distance to the nearest non-surface pixel, capped. Two-pass distance transform.
  const dist = new Uint8Array(w * h);
  for (let i = 0; i < dist.length; i++) dist[i] = surface[i] ? cap : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (x > 0) d = Math.min(d, dist[i - 1] + 1);
      if (y > 0) {
        d = Math.min(d, dist[i - w] + 1);
        if (x > 0) d = Math.min(d, dist[i - w - 1] + 1);
        if (x < w - 1) d = Math.min(d, dist[i - w + 1] + 1);
      }
      dist[i] = d;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
      let d = dist[i];
      if (x < w - 1) d = Math.min(d, dist[i + 1] + 1);
      if (y < h - 1) {
        d = Math.min(d, dist[i + w] + 1);
        if (x < w - 1) d = Math.min(d, dist[i + w + 1] + 1);
        if (x > 0) d = Math.min(d, dist[i + w - 1] + 1);
      }
      dist[i] = d;
    }
  }

  const weights = new Float32Array(w * h);
  for (let i = 0; i < weights.length; i++) weights[i] = clamp01((dist[i] - guardCells) / Math.max(1, featherCells));
  return weights;
}

/** Bilinear sample of a grid-sized map at fractional grid coordinates, clamped at the edges. */
function sampleMap(map: Float32Array, w: number, h: number, gx: number, gy: number): number {
  const x = Math.min(w - 1, Math.max(0, gx));
  const y = Math.min(h - 1, Math.max(0, gy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = map[y0 * w + x0] * (1 - fx) + map[y0 * w + x1] * fx;
  const bottom = map[y1 * w + x0] * (1 - fx) + map[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

// ---------------------------------------------------------------------------
// 6. Resize (with the suppression applied in the same pass)
// ---------------------------------------------------------------------------

/** Output size: longer side at most outputMaxSidePx, shorter side at least the VTO minimum. */
function outputSize(cw: number, ch: number): { width: number; height: number; scale: number } {
  let scale = Math.min(1, N.outputMaxSidePx / Math.max(cw, ch));
  const I = YOUCAM_PINNED.input;
  scale = Math.max(scale, I.minSidePx / Math.min(cw, ch), I.minLongSidePx / Math.max(cw, ch));
  return { width: Math.max(1, Math.round(cw * scale)), height: Math.max(1, Math.round(ch * scale)), scale };
}

/**
 * Renders the crop at the output size: box-filtered when shrinking, bilinear otherwise, then
 * blended towards the neutral colour by the suppression weight at that point.
 */
function renderOutput(
  src: PixelGrid,
  crop: Crop,
  width: number,
  height: number,
  seg: Segmentation,
  weights: Float32Array,
): { grid: PixelGrid; suppressedAreaFrac: number } {
  const out = new Uint8ClampedArray(width * height * 4);
  const shrinking = width < crop.width;
  const neutral = N.background.neutral;
  const toGridX = seg.width / src.width;
  const toGridY = seg.height / src.height;
  let suppressed = 0;

  for (let oy = 0; oy < height; oy++) {
    const sy0 = crop.y + Math.floor((oy * crop.height) / height);
    const sy1 = Math.max(sy0 + 1, crop.y + Math.floor(((oy + 1) * crop.height) / height));
    const cy = crop.y + ((oy + 0.5) * crop.height) / height; // source-space centre of this output row
    for (let ox = 0; ox < width; ox++) {
      const cx = crop.x + ((ox + 0.5) * crop.width) / width;
      let r = 0;
      let g = 0;
      let b = 0;

      if (shrinking) {
        const sx0 = crop.x + Math.floor((ox * crop.width) / width);
        const sx1 = Math.max(sx0 + 1, crop.x + Math.floor(((ox + 1) * crop.width) / width));
        for (let sy = sy0; sy < sy1; sy++) {
          for (let sx = sx0; sx < sx1; sx++) {
            const i = (sy * src.width + sx) * 4;
            r += src.data[i];
            g += src.data[i + 1];
            b += src.data[i + 2];
          }
        }
        const count = (sy1 - sy0) * (sx1 - sx0);
        r /= count;
        g /= count;
        b /= count;
      } else {
        const fx = Math.min(src.width - 1, Math.max(0, cx - 0.5));
        const fy = Math.min(src.height - 1, Math.max(0, cy - 0.5));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(src.width - 1, x0 + 1);
        const y1 = Math.min(src.height - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const at = (x: number, y: number, c: number) => src.data[(y * src.width + x) * 4 + c];
        const lerp = (c: number) =>
          (at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx) * (1 - ty) + (at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx) * ty;
        r = lerp(0);
        g = lerp(1);
        b = lerp(2);
      }

      const wt = sampleMap(weights, seg.width, seg.height, cx * toGridX - 0.5, cy * toGridY - 0.5);
      suppressed += wt;
      const o = (oy * width + ox) * 4;
      out[o] = Math.round(r * (1 - wt) + neutral[0] * wt);
      out[o + 1] = Math.round(g * (1 - wt) + neutral[1] * wt);
      out[o + 2] = Math.round(b * (1 - wt) + neutral[2] * wt);
      out[o + 3] = 255;
    }
  }
  return { grid: { width, height, data: out }, suppressedAreaFrac: suppressed / (width * height) };
}

// ---------------------------------------------------------------------------
// 7. VTO input limits
// ---------------------------------------------------------------------------

function checkConstraints(width: number, height: number, bytes: number): ConstraintCheck[] {
  const I = YOUCAM_PINNED.input;
  return [
    {
      id: "format",
      label: "File type",
      limit: I.allowedMime.join(", "),
      actual: "image/png",
      ok: (I.allowedMime as readonly string[]).includes("image/png"),
    },
    {
      id: "dimensions",
      label: "Image sides",
      limit: `at least ${I.minLongSidePx} × ${I.minSidePx} px, at most ${I.maxSidePx} px per side`,
      actual: `${width} × ${height} px`,
      ok:
        Math.min(width, height) >= I.minSidePx &&
        Math.max(width, height) >= I.minLongSidePx &&
        Math.max(width, height) <= I.maxSidePx,
    },
    {
      id: "bytes",
      label: "File size",
      limit: `at most ${formatBytes(I.maxBytes)}`,
      actual: formatBytes(bytes),
      ok: bytes <= I.maxBytes,
    },
  ];
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Runs the pipeline on one image whose pixels are already upright. `orientation` is the tag the
 * decoder applied, and `receivedSize` the upright size before the decoder scaled it, both for the
 * report only. Pure apart from hashing; makes no network call.
 */
export function normaliseGarmentImage(
  input: PixelGrid,
  opts: { orientation: number; source: ReadinessSource; receivedSize?: { width: number; height: number } },
): NormaliseOutcome {
  const upright = flattenOntoWhite(input);
  const received = opts.receivedSize;
  const scaledOnReceipt = received !== undefined && (received.width !== upright.width || received.height !== upright.height);

  const seg = segmentGarment(upright);
  const result = assembleReadinessResult(
    seg,
    READINESS_CHECKS.map((c) => c.compute(seg)),
  );
  if (!result.accepted) return { ok: false, code: "readiness_not_accepted", result };

  const crop = garmentCrop(seg, upright.width, upright.height);
  const size = outputSize(crop.width, crop.height);
  const { grid, suppressedAreaFrac } = renderOutput(upright, crop, size.width, size.height, seg, suppressionWeights(seg));
  const normalised = encode(grid);
  const constraints = checkConstraints(normalised.width, normalised.height, normalised.bytes.length);
  const I = YOUCAM_PINNED.input;

  const turned = ORIENTATION_WORDS[opts.orientation];
  const cropped = crop.width < upright.width || crop.height < upright.height;
  const steps: NormaliseStep[] = [
    {
      id: "orient",
      label: "Orientation",
      applied: Boolean(turned),
      detail: turned
        ? `Turned upright on the server from the photo's orientation tag (${turned}).`
        : "Already upright: the image carried no orientation tag.",
    },
    {
      id: "metadata",
      label: "Metadata",
      applied: true,
      detail: `Re-encoded from pixels only, so no camera, date or location metadata is kept in either image.${
        scaledOnReceipt && received
          ? ` Received at ${received.width} × ${received.height} px; worked on and stored at ${upright.width} × ${upright.height} px.`
          : ""
      }`,
    },
    {
      id: "crop",
      label: "Crop to garment",
      applied: cropped,
      detail: cropped
        ? `Cropped to the garment with ${percent(N.paddingFrac)} padding: ${upright.width} × ${upright.height} to ${crop.width} × ${crop.height} px.${
            crop.paddingClipped ? " The padding is narrower where the garment is close to the frame edge." : ""
          }`
        : "Not cropped: with padding, the garment already spans the whole photo.",
    },
    {
      id: "background",
      label: "Background",
      applied: suppressedAreaFrac >= 0.005,
      detail:
        suppressedAreaFrac >= 0.005
          ? `Plain surface flattened to neutral grey on ${percent(suppressedAreaFrac)} of the image. A band around the garment, and anything that did not clearly match the surface, is left as photographed.`
          : "Left as photographed: no part of the surface matched confidently enough to flatten.",
    },
    {
      id: "resize",
      label: "Resize",
      applied: size.scale !== 1,
      detail:
        size.scale === 1
          ? `Kept at ${grid.width} × ${grid.height} px: already between ${I.minLongSidePx} × ${I.minSidePx} px and ${I.maxSidePx} px per side.`
          : `Scaled ${size.scale < 1 ? "down" : "up"} to ${grid.width} × ${grid.height} px (longer side at most ${N.outputMaxSidePx} px, at least ${I.minLongSidePx} × ${I.minSidePx} px).`,
    },
    {
      id: "encode",
      label: "Encode",
      applied: true,
      detail: `Encoded as PNG, ${formatBytes(normalised.bytes.length)}.`,
    },
  ];

  const report: NormaliseReport = {
    steps,
    crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
    suppressedAreaFrac: Math.round(suppressedAreaFrac * 1000) / 1000,
    constraints,
    withinConstraints: constraints.every((c) => c.ok),
    constraintsConfirmed: YOUCAM_PINNED.verification.liveRenderConfirmed,
    grade: attemptGrade(result),
    settingsVersion: N.version,
  };
  if (!report.withinConstraints) return { ok: false, code: "outside_input_limits", result, report };

  return { ok: true, original: encode(upright), normalised, report };
}

/** The response shape for a stored or seeded pair. */
export function describePair(
  source: ReadinessSource,
  original: EncodedImage,
  normalised: EncodedImage,
  report: NormaliseReport,
  urls: { original: string; normalised: string },
  subject: string,
): NormalisedPair {
  const info = (image: EncodedImage, url: string, alt: string): NormalisedImageInfo => ({
    url,
    alt,
    width: image.width,
    height: image.height,
    bytes: image.bytes.length,
    contentType: "image/png",
    sha256: image.sha256,
  });
  return {
    source,
    original: info(original, urls.original, `${subject}, before normalisation: upright, otherwise as photographed.`),
    normalised: info(
      normalised,
      urls.normalised,
      `${subject}, after normalisation: cropped to the garment, with the plain surface around it flattened to neutral grey.`,
    ),
    steps: report.steps,
    crop: report.crop,
    suppressedAreaFrac: report.suppressedAreaFrac,
    constraints: report.constraints,
    withinConstraints: report.withinConstraints,
    constraintsConfirmed: report.constraintsConfirmed,
    grade: report.grade,
    settingsVersion: report.settingsVersion,
  };
}
