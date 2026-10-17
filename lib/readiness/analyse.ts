/**
 * Seller readiness checks — deterministic image heuristics, no model and no network.
 *
 * The same code runs in the browser (on canvas pixels, before anything is uploaded) and on the
 * server (to confirm and record a run). It never imports the YouCam adapter: a readiness check
 * cannot spend an API unit.
 *
 * Pipeline: downsample to a small grid → learn the surface colours from the border ring →
 * everything that is not surface is foreground → the largest foreground blob is the garment →
 * four checks score framing, background separation, flatness and occlusion/shadow.
 *
 * Every number used here comes from lib/readiness/thresholds.ts.
 */

import type { CheckId, CheckReason, CheckResult, PixelGrid, ReadinessResult, Verdict } from "./contracts";
import { CHECK_LABELS, generateRetakeInstructions, summaryFor } from "./instructions";
import { READINESS_THRESHOLDS as T } from "./thresholds";

type Rgb = [number, number, number];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Linear ramp to a 0–100 score: `worst` maps to 0 and `best` to 100, in either direction. */
function ramp(value: number, worst: number, best: number): number {
  return 100 * clamp01((value - worst) / (best - worst));
}

// ---------------------------------------------------------------------------
// Downsampling
// ---------------------------------------------------------------------------

/**
 * Box-filters the image down to the analysis grid and flattens transparency onto white.
 * Written out by hand (rather than left to canvas scaling) so every browser and the server
 * produce the same grid from the same pixels.
 */
export function downsampleToGrid(src: PixelGrid, maxSide: number = T.analysis.gridMaxSidePx): PixelGrid {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor((y * src.height) / height);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * src.height) / height));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor((x * src.width) / width);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * src.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3] / 255;
          r += src.data[i] * a + 255 * (1 - a);
          g += src.data[i + 1] * a + 255 * (1 - a);
          b += src.data[i + 2] * a + 255 * (1 - a);
        }
      }
      const count = (sy1 - sy0) * (sx1 - sx0);
      const o = (y * width + x) * 4;
      out[o] = Math.round(r / count);
      out[o + 1] = Math.round(g / count);
      out[o + 2] = Math.round(b / count);
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// Mask helpers (3×3 morphology, connected components)
// ---------------------------------------------------------------------------

/** A pixel survives when it and its 8 neighbours are set. `outside` is the value beyond the frame. */
function erode(mask: Uint8Array, w: number, h: number, outside: 0 | 1): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let keep = 1;
      for (let dy = -1; dy <= 1 && keep; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? outside : mask[ny * w + nx];
          if (!v) {
            keep = 0;
            break;
          }
        }
      }
      out[y * w + x] = keep;
    }
  }
  return out;
}

/** A pixel is set when it or any of its 8 neighbours is set. */
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) {
            hit = 1;
            break;
          }
        }
      }
      out[y * w + x] = hit;
    }
  }
  return out;
}

/**
 * 4-connected flood fill from `seeds` through pixels where `allowed` is set.
 * Marks reached pixels in `reached` and returns how many there were.
 */
function flood(seeds: number[], allowed: (i: number) => boolean, reached: Uint8Array, w: number, h: number): number {
  const stack: number[] = [];
  let count = 0;
  for (const s of seeds) {
    if (!reached[s] && allowed(s)) {
      reached[s] = 1;
      stack.push(s);
    }
  }
  while (stack.length > 0) {
    const i = stack.pop() as number;
    count++;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && !reached[i - 1] && allowed(i - 1)) {
      reached[i - 1] = 1;
      stack.push(i - 1);
    }
    if (x < w - 1 && !reached[i + 1] && allowed(i + 1)) {
      reached[i + 1] = 1;
      stack.push(i + 1);
    }
    if (y > 0 && !reached[i - w] && allowed(i - w)) {
      reached[i - w] = 1;
      stack.push(i - w);
    }
    if (y < h - 1 && !reached[i + w] && allowed(i + w)) {
      reached[i + w] = 1;
      stack.push(i + w);
    }
  }
  return count;
}

function isFrameRing(i: number, w: number, h: number): boolean {
  const x = i % w;
  const y = (i - x) / w;
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

// ---------------------------------------------------------------------------
// Surface palette
// ---------------------------------------------------------------------------

/**
 * Learns the surface colours from the border ring with a one-pass "leader" clustering: each ring
 * pixel joins the first cluster within clusterRadius, or starts a new one. Clusters holding at
 * least paletteMinShare of the ring become the palette. A garment that pokes into the ring stays
 * out of the palette unless it covers a large share of it.
 */
function borderPalette(px: PixelGrid["data"], w: number, h: number): Rgb[] {
  const S = T.segmentation;
  const ring = Math.max(2, Math.round(S.borderRingFrac * Math.min(w, h)));
  const radiusSq = S.clusterRadius * S.clusterRadius;
  const clusters: Array<{ r: number; g: number; b: number; n: number }> = [];
  let total = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      total++;
      let joined = false;
      for (const c of clusters) {
        const dr = r - c.r / c.n;
        const dg = g - c.g / c.n;
        const db = b - c.b / c.n;
        if (dr * dr + dg * dg + db * db <= radiusSq) {
          c.r += r;
          c.g += g;
          c.b += b;
          c.n++;
          joined = true;
          break;
        }
      }
      if (!joined && clusters.length < S.maxClusters) clusters.push({ r, g, b, n: 1 });
    }
  }

  return clusters
    .filter((c) => c.n / total >= S.paletteMinShare)
    .map((c): Rgb => [c.r / c.n, c.g / c.n, c.b / c.n]);
}

/**
 * Returns a function giving the RGB distance from a colour to the surface palette: the nearest
 * palette colour or the nearest point on the line between any two of them. The lines cover the
 * in-between colours a surface really shows — soft shadow edges and blended pattern edges.
 */
function surfaceDistance(palette: Rgb[]): (r: number, g: number, b: number) => number {
  const segments: Array<{ a: Rgb; d: Rgb; lenSq: number }> = [];
  for (let i = 0; i < palette.length; i++) {
    for (let j = i + 1; j < palette.length; j++) {
      const a = palette[i];
      const d: Rgb = [palette[j][0] - a[0], palette[j][1] - a[1], palette[j][2] - a[2]];
      segments.push({ a, d, lenSq: d[0] * d[0] + d[1] * d[1] + d[2] * d[2] });
    }
  }
  return (r, g, b) => {
    let best = Number.POSITIVE_INFINITY;
    for (const c of palette) {
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      best = Math.min(best, dr * dr + dg * dg + db * db);
    }
    for (const s of segments) {
      if (s.lenSq === 0) continue;
      const pr = r - s.a[0];
      const pg = g - s.a[1];
      const pb = b - s.a[2];
      const t = clamp01((pr * s.d[0] + pg * s.d[1] + pb * s.d[2]) / s.lenSq);
      const dr = pr - t * s.d[0];
      const dg = pg - t * s.d[1];
      const db = pb - t * s.d[2];
      best = Math.min(best, dr * dr + dg * dg + db * db);
    }
    return Math.sqrt(best);
  };
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

export interface Segmentation {
  width: number;
  height: number;
  /** 0–255 luminance per grid pixel. */
  lum: Float32Array;
  /** |dL/dx| + |dL/dy| per grid pixel; 0 on the outermost ring. */
  grad: Float32Array;
  /** 1 where the pixel matches the surface palette. */
  surface: Uint8Array;
  /** 1 on the garment: the largest non-surface blob, minus anything counted as an intrusion. */
  garment: Uint8Array;
  /** 1 on other objects: separate blobs, and non-garment colour entering from the frame edge. */
  clutter: Uint8Array;
  /** False when no garment outline could be separated from the surface. */
  found: boolean;
  box: { x0: number; y0: number; x1: number; y1: number };
  garmentArea: number;
  clutterArea: number;
  /** Garment pixels on the outermost ring of the frame. */
  clippedEdgePixels: number;
  paletteSize: number;
  /** RGB distance from the garment's median colour to the surface palette. */
  garmentSurfaceContrast: number;
}

function medianColour(px: PixelGrid["data"], mask: Uint8Array, count: number): Rgb {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    hist[0][px[i * 4]]++;
    hist[1][px[i * 4 + 1]]++;
    hist[2][px[i * 4 + 2]]++;
  }
  const median = (bins: Uint32Array) => {
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += bins[v];
      if (seen * 2 >= count) return v;
    }
    return 255;
  };
  return [median(hist[0]), median(hist[1]), median(hist[2])];
}

/** Separates the garment from the surface. Accepts any size; larger inputs are downsampled first. */
export function segmentGarment(input: PixelGrid): Segmentation {
  const S = T.segmentation;
  const grid = downsampleToGrid(input);
  const { width: w, height: h, data: px } = grid;
  const n = w * h;

  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];

  const grad = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      grad[i] = Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w]);
    }
  }

  const palette = borderPalette(px, w, h);
  const toSurface = surfaceDistance(palette);
  const surface = new Uint8Array(n);
  const foreground = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const isSurface =
      palette.length > 0 && toSurface(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) <= S.backgroundMatchDistance;
    surface[i] = isSurface ? 1 : 0;
    foreground[i] = isSurface ? 0 : 1;
  }

  // Opening (erode then dilate) drops speckle and hairline structures before blobs are measured.
  const opened = dilate(erode(foreground, w, h, 1), w, h);
  for (let i = 0; i < n; i++) opened[i] = opened[i] && foreground[i] ? 1 : 0;

  // Connected blobs of the opened foreground; the largest one is taken to be the garment.
  const labels = new Int32Array(n);
  const sizes: number[] = [0];
  const visited = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!opened[i] || visited[i]) continue;
    const label = sizes.length;
    sizes.push(
      flood(
        [i],
        (j) => {
          if (!opened[j]) return false;
          labels[j] = label;
          return true;
        },
        visited,
        w,
        h,
      ),
    );
  }
  let garmentLabel = 0;
  for (let l = 1; l < sizes.length; l++) if (sizes[l] > sizes[garmentLabel]) garmentLabel = l;
  const blobArea = sizes[garmentLabel];

  const blob = new Uint8Array(n);
  if (garmentLabel > 0) for (let i = 0; i < n; i++) blob[i] = labels[i] === garmentLabel ? 1 : 0;

  // Pixels of the blob whose colour is not a lighter or darker version of the garment's median
  // colour. Where such a region reaches the frame edge it is treated as something entering the
  // shot (a hand, an arm, a rail) rather than as garment.
  const dominant = medianColour(px, blob, blobArea);
  const domSq = dominant[0] * dominant[0] + dominant[1] * dominant[1] + dominant[2] * dominant[2];
  const foreign = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!blob[i]) continue;
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const s =
      domSq < 1 ? 1 : Math.min(1.6, Math.max(0.3, (r * dominant[0] + g * dominant[1] + b * dominant[2]) / domSq));
    const dr = r - s * dominant[0];
    const dg = g - s * dominant[1];
    const db = b - s * dominant[2];
    foreign[i] = Math.sqrt(dr * dr + dg * dg + db * db) > S.foreignColourDistance ? 1 : 0;
  }
  const ringSeeds: number[] = [];
  for (let i = 0; i < n; i++) if (foreign[i] && isFrameRing(i, w, h)) ringSeeds.push(i);
  const intrusion = new Uint8Array(n);
  flood(ringSeeds, (j) => foreign[j] === 1, intrusion, w, h);

  const garment = new Uint8Array(n);
  const clutter = new Uint8Array(n);
  const strayMin = S.strayMinAreaFrac * n;
  let garmentArea = 0;
  let clutterArea = 0;
  let clippedEdgePixels = 0;
  const box = { x0: w, y0: h, x1: -1, y1: -1 };
  for (let i = 0; i < n; i++) {
    if (blob[i] && !intrusion[i]) {
      garment[i] = 1;
      garmentArea++;
      const x = i % w;
      const y = (i - x) / w;
      if (x < box.x0) box.x0 = x;
      if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y;
      if (y > box.y1) box.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) clippedEdgePixels++;
    } else if (intrusion[i] || (opened[i] && sizes[labels[i]] >= strayMin)) {
      clutter[i] = 1;
      clutterArea++;
    }
  }

  const found =
    palette.length > 0 && garmentArea / n >= S.minGarmentAreaFrac && blobArea / n <= S.maxGarmentAreaFrac;

  return {
    width: w,
    height: h,
    lum,
    grad,
    surface,
    garment,
    clutter,
    found,
    box,
    garmentArea,
    clutterArea,
    clippedEdgePixels,
    paletteSize: palette.length,
    garmentSurfaceContrast: found ? toSurface(dominant[0], dominant[1], dominant[2]) : 0,
  };
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function buildCheck(
  id: CheckId,
  rawScore: number,
  reasonWhenNotPassing: CheckReason,
  metrics: Record<string, number>,
): CheckResult {
  const score = Math.round(Math.min(100, Math.max(0, rawScore)));
  const { passAt, warnAt } = T.checks[id];
  const verdict: Verdict = score >= passAt ? "pass" : score >= warnAt ? "warn" : "fail";
  const reason: CheckReason = verdict === "pass" ? "ok" : reasonWhenNotPassing;
  return { id, label: CHECK_LABELS[id], score, verdict, reason, summary: summaryFor(id, reason), assessed: true, metrics };
}

/** Explicit "could not find the garment edges" result, rather than a silent low score. */
function notScored(id: CheckId, seg: Segmentation): CheckResult {
  return {
    id,
    label: CHECK_LABELS[id],
    score: 0,
    verdict: "fail",
    reason: "not_found",
    summary: summaryFor(id, "not_found"),
    assessed: false,
    metrics: {
      surfaceColours: seg.paletteSize,
      largestBlobAreaFrac: round3(seg.garmentArea / (seg.width * seg.height)),
    },
  };
}

/** Is the whole garment inside the photo, large enough, with a border on all four sides? */
export function computeFramingScore(seg: Segmentation): CheckResult {
  if (!seg.found) return notScored("framing", seg);
  const C = T.checks.framing;
  const { width: w, height: h, box } = seg;

  const minMargin = Math.min(box.x0 / w, (w - 1 - box.x1) / w, box.y0 / h, (h - 1 - box.y1) / h);
  const clippedEdgeFrac = seg.clippedEdgePixels / (2 * w + 2 * h - 4);
  const clipped = clippedEdgeFrac > C.clippedEdgeFrac;
  const boxAreaFrac = ((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)) / (w * h);

  const marginScore = clipped ? 0 : ramp(minMargin, 0, C.marginBest);
  const sizeScore = ramp(boxAreaFrac, C.boxAreaWorst, C.boxAreaBest);
  const reason: CheckReason = clipped ? "clipped" : marginScore <= sizeScore ? "too_tight" : "too_small";

  return buildCheck("framing", Math.min(marginScore, sizeScore), reason, {
    minMarginFrac: round3(minMargin),
    clippedEdgeFrac: round3(clippedEdgeFrac),
    boxAreaFrac: round3(boxAreaFrac),
  });
}

/** Is the surface plain, and is the garment's colour clearly different from it? */
export function computeBackgroundSeparationScore(seg: Segmentation): CheckResult {
  if (!seg.found) return notScored("background", seg);
  const C = T.checks.background;
  const { width: w, height: h } = seg;
  const n = w * h;

  // Texture is measured on everything that is neither garment nor clutter, a few pixels clear of both.
  let guard: Uint8Array = new Uint8Array(n);
  for (let i = 0; i < n; i++) guard[i] = seg.garment[i] || seg.clutter[i] ? 1 : 0;
  for (let k = 0; k < C.garmentGuardPx; k++) guard = dilate(guard, w, h);

  let region = 0;
  let edges = 0;
  for (let i = 0; i < n; i++) {
    if (guard[i] || isFrameRing(i, w, h)) continue;
    region++;
    if (seg.grad[i] > T.analysis.edgeMagnitude) edges++;
  }
  const textureEdgeDensity = region > 0 ? edges / region : 0;

  const textureScore = ramp(textureEdgeDensity, C.textureEdgeDensityWorst, C.textureEdgeDensityBest);
  const contrastScore = ramp(seg.garmentSurfaceContrast, C.contrastWorst, C.contrastBest);
  const reason: CheckReason = textureScore <= contrastScore ? "patterned" : "low_contrast";

  return buildCheck("background", Math.min(textureScore, contrastScore), reason, {
    textureEdgeDensity: round3(textureEdgeDensity),
    garmentSurfaceContrast: round3(seg.garmentSurfaceContrast),
    surfaceColours: seg.paletteSize,
  });
}

/**
 * Edge density inside the garment as a stand-in for "is this laid flat". It is a proxy: a bold
 * print or stripe also raises it. That limitation is deliberate and documented.
 */
export function computeFlatnessScore(seg: Segmentation): CheckResult {
  if (!seg.found) return notScored("flatness", seg);
  const C = T.checks.flatness;
  const { width: w, height: h } = seg;

  let interior: Uint8Array = seg.garment;
  for (let k = 0; k < C.interiorErodePx; k++) interior = erode(interior, w, h, 0);
  let interiorArea = 0;
  for (let i = 0; i < interior.length; i++) interiorArea += interior[i];
  if (interiorArea < 40) {
    interior = seg.garment;
    interiorArea = seg.garmentArea;
  }

  let edges = 0;
  for (let i = 0; i < interior.length; i++) {
    if (interior[i] && seg.grad[i] > T.analysis.edgeMagnitude) edges++;
  }
  const edgeDensity = interiorArea > 0 ? edges / interiorArea : 0;

  return buildCheck("flatness", ramp(edgeDensity, C.edgeDensityWorst, C.edgeDensityBest), "creased", {
    interiorEdgeDensity: round3(edgeDensity),
    interiorAreaFrac: round3(interiorArea / (w * h)),
  });
}

/**
 * Shadow: brightness of the surface compared across coarse blocks of the frame.
 * Occlusion: other objects in the shot, and non-garment colour entering from the frame edge.
 */
export function computeOcclusionShadowScore(seg: Segmentation): CheckResult {
  if (!seg.found) return notScored("occlusion_shadow", seg);
  const C = T.checks.occlusion_shadow;
  const { width: w, height: h } = seg;

  let brightest = 0;
  let darkest = Number.POSITIVE_INFINITY;
  let blocksUsed = 0;
  for (let by = 0; by < C.blockGrid; by++) {
    const y0 = Math.floor((by * h) / C.blockGrid);
    const y1 = Math.floor(((by + 1) * h) / C.blockGrid);
    for (let bx = 0; bx < C.blockGrid; bx++) {
      const x0 = Math.floor((bx * w) / C.blockGrid);
      const x1 = Math.floor(((bx + 1) * w) / C.blockGrid);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * w + x;
          if (seg.surface[i]) {
            sum += seg.lum[i];
            count++;
          }
        }
      }
      const area = (y1 - y0) * (x1 - x0);
      if (area === 0 || count / area < C.blockMinSurfaceFrac) continue;
      const mean = sum / count;
      blocksUsed++;
      if (mean > brightest) brightest = mean;
      if (mean < darkest) darkest = mean;
    }
  }
  const shadowRatio = blocksUsed >= 2 && brightest > 0 ? (brightest - darkest) / brightest : 0;
  const intrusionAreaFrac = seg.clutterArea / (w * h);

  const shadowScore = ramp(shadowRatio, C.shadowRatioWorst, C.shadowRatioBest);
  const intrusionScore = ramp(intrusionAreaFrac, C.intrusionAreaWorst, 0);
  const reason: CheckReason = shadowScore <= intrusionScore ? "shadow" : "intrusion";

  return buildCheck("occlusion_shadow", Math.min(shadowScore, intrusionScore), reason, {
    shadowRatio: round3(shadowRatio),
    intrusionAreaFrac: round3(intrusionAreaFrac),
    surfaceBlocksUsed: blocksUsed,
  });
}

/** The four checks in display order. The browser runs them one at a time so each row resolves on its own. */
export const READINESS_CHECKS: ReadonlyArray<{ id: CheckId; compute: (seg: Segmentation) => CheckResult }> = [
  { id: "framing", compute: computeFramingScore },
  { id: "background", compute: computeBackgroundSeparationScore },
  { id: "flatness", compute: computeFlatnessScore },
  { id: "occlusion_shadow", compute: computeOcclusionShadowScore },
];

/** Combines the per-check results into the accept/reject decision and the retake instructions. */
export function assembleReadinessResult(seg: Segmentation, checks: CheckResult[]): ReadinessResult {
  const accepted = seg.found && checks.every((c) => c.verdict !== "fail");
  return {
    accepted,
    garmentFound: seg.found,
    checks,
    instructions: generateRetakeInstructions(checks, seg.found),
    thresholdVersion: T.version,
    grid: { width: seg.width, height: seg.height },
  };
}

/** Runs the whole readiness pipeline on one image. Pure and deterministic; makes no network call. */
export function analyseFlatLay(input: PixelGrid): ReadinessResult {
  const seg = segmentGarment(input);
  return assembleReadinessResult(
    seg,
    READINESS_CHECKS.map((c) => c.compute(seg)),
  );
}
