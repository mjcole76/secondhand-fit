/**
 * Buyer photo quality gate — the ONE place its numbers and verdicts live.
 *
 * The browser runs it as soon as a photo is chosen, so a photo that is too small, too dark, washed
 * out or has nothing in the middle of the frame is turned back with retake instructions before any
 * upload and before any API unit is spent. POST /api/tryon runs the same checks again on the bytes
 * it receives (lib/tryon/selfie.ts), so the gate cannot be skipped by a modified client.
 *
 * PROVENANCE: the thresholds are PROVISIONAL, set by reasoning, not calibrated against live renders.
 * The checks are plain pixel statistics. They cannot tell whether a person is in the photo; the
 * "subject" check only finds photos whose middle is almost uniform (a wall, a ceiling, a covered lens).
 *
 * Imported by browser code, so it must not import anything server-only.
 */

export const SELFIE_GATE = {
  version: "2026-10-01.provisional-1",

  /** Shorter side of the photo as it is uploaded, after the browser has scaled it down. */
  minShortSidePx: 480,
  /** The browser scales the photo to at most this on the longer side before upload; the server too. */
  uploadMaxSidePx: 1600,
  /** JPEG quality the browser and the server re-encode the photo at. Re-encoding drops all metadata. */
  jpegQuality: 0.9,
  /** Decoded pixel count above which the server refuses a file (decompression-bomb guard). */
  maxInputPixels: 50_000_000,

  /** The light and subject checks run on a copy scaled to at most this on the longer side. */
  analysisMaxSidePx: 256,
  /** Mean luma (0–255) below this is too dark. */
  minMeanLuma: 55,
  /** Mean luma above this is washed out. */
  maxMeanLuma: 230,
  /** Luma standard deviation inside the middle region below this means nothing distinct is there. */
  minCentreStdDev: 14,
  /** The middle region: this share of the width and of the height, centred. */
  centreFrac: { x: 0.5, y: 0.6 },
} as const;

export type SelfieCheckId = "size" | "light" | "subject";

export interface SelfieCheck {
  id: SelfieCheckId;
  label: string;
  passed: boolean;
  /** What was measured, in plain words. */
  detail: string;
  /** Set when the check failed: what to do differently. */
  instruction?: string;
}

export interface SelfieGateResult {
  passed: boolean;
  version: string;
  width: number;
  height: number;
  checks: SelfieCheck[];
  /** Retake instructions for the failed checks, most important first, at most three. */
  instructions: string[];
}

export interface LumaStats {
  meanLuma: number;
  centreStdDev: number;
}

/**
 * Mean luma of the whole image and the luma spread inside the middle region. `data` is interleaved
 * pixels with `channels` values each (RGBA from a canvas, RGB or grey from sharp); alpha is ignored.
 */
export function lumaStats(data: ArrayLike<number>, width: number, height: number, channels: number): LumaStats {
  const x0 = Math.floor((width * (1 - SELFIE_GATE.centreFrac.x)) / 2);
  const x1 = Math.max(x0 + 1, Math.ceil((width * (1 + SELFIE_GATE.centreFrac.x)) / 2));
  const y0 = Math.floor((height * (1 - SELFIE_GATE.centreFrac.y)) / 2);
  const y1 = Math.max(y0 + 1, Math.ceil((height * (1 + SELFIE_GATE.centreFrac.y)) / 2));

  let sum = 0;
  let centreSum = 0;
  let centreSq = 0;
  let centreCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const luma = channels < 3 ? data[i] : 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += luma;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        centreSum += luma;
        centreSq += luma * luma;
        centreCount++;
      }
    }
  }
  const pixels = Math.max(1, width * height);
  const centreMean = centreCount > 0 ? centreSum / centreCount : 0;
  const variance = centreCount > 0 ? Math.max(0, centreSq / centreCount - centreMean * centreMean) : 0;
  return { meanLuma: Math.round(sum / pixels), centreStdDev: Math.round(Math.sqrt(variance)) };
}

/** Pass/fail per check with retake instructions, from the photo's size and its luma statistics. */
export function evaluateSelfie(size: { width: number; height: number }, stats: LumaStats): SelfieGateResult {
  const G = SELFIE_GATE;
  const shortSide = Math.min(size.width, size.height);

  const sizeCheck: SelfieCheck = {
    id: "size",
    label: "Large enough",
    passed: shortSide >= G.minShortSidePx,
    detail: `${size.width} × ${size.height} px; the shorter side needs at least ${G.minShortSidePx} px.`,
  };
  if (!sizeCheck.passed) {
    sizeCheck.instruction = `Use a larger photo, at least ${G.minShortSidePx} px on its shorter side. A photo straight from the phone camera, taken upright, is large enough.`;
  }

  const tooDark = stats.meanLuma < G.minMeanLuma;
  const tooBright = stats.meanLuma > G.maxMeanLuma;
  const lightCheck: SelfieCheck = {
    id: "light",
    label: "Evenly lit",
    passed: !tooDark && !tooBright,
    detail: `Average brightness ${stats.meanLuma} of 255; between ${G.minMeanLuma} and ${G.maxMeanLuma} passes.`,
  };
  if (tooDark) {
    lightCheck.instruction = "Move somewhere brighter, or face a window, and retake: the photo is too dark.";
  } else if (tooBright) {
    lightCheck.instruction =
      "Step out of direct light, or turn so a bright window is not behind you, and retake: the photo is washed out.";
  }

  const subjectCheck: SelfieCheck = {
    id: "subject",
    label: "Something in the middle of the frame",
    passed: stats.centreStdDev >= G.minCentreStdDev,
    detail: `Contrast in the middle of the photo ${stats.centreStdDev}; at least ${G.minCentreStdDev} passes. This is a contrast check, not person detection.`,
  };
  if (!subjectCheck.passed) {
    subjectCheck.instruction =
      "Stand in the middle of the frame, close enough that you take up most of its height, and retake.";
  }

  // Order of importance: a photo that is too small cannot be rescued, then framing, then light.
  const checks = [sizeCheck, subjectCheck, lightCheck];
  const instructions = checks.flatMap((c) => (c.instruction ? [c.instruction] : [])).slice(0, 3);
  return {
    passed: checks.every((c) => c.passed),
    version: G.version,
    width: size.width,
    height: size.height,
    checks,
    instructions,
  };
}
