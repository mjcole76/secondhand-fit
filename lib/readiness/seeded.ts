/**
 * Seeded readiness fixtures: a deliberately bad flat-lay and its passing retake.
 *
 * Both are DRAWINGS produced by the code in this file — a plain T-shirt shape, written for this
 * project, with no photograph, brand or third-party material involved. The bad one is crumpled, on
 * a checked duvet, half in shadow; the retake is the same garment laid flat on a plain sheet in
 * even light. Because they are generated pixel by pixel, the server and every browser see exactly
 * the same image, so the readiness result for each is reproducible.
 *
 * They are the bad flat-lay and its retake in the seeded demo listing set (lib/listings/seeded-set.ts),
 * whose licence and provenance are recorded in PROVENANCE.md, section 2.
 */

import type { PixelGrid, ReadinessSource, SeededFixtureInfo, SeededFixtureName } from "./contracts";

export const SEEDED_FIXTURE_SIZE = { width: 480, height: 640 } as const;

export const SEEDED_FIXTURE_NAMES: readonly SeededFixtureName[] = ["bad", "retake"];

const SOURCES: Record<SeededFixtureName, ReadinessSource> = { bad: "seeded-bad", retake: "seeded-retake" };

const COPY: Record<SeededFixtureName, { title: string; description: string; alt: string }> = {
  bad: {
    title: "Seeded bad flat-lay",
    description: "Crumpled T-shirt on a checked duvet, half in shadow.",
    alt: "Drawing of a crumpled rust-coloured T-shirt lying at an angle on a blue and cream checked duvet, with the lower right half of the picture in shadow.",
  },
  retake: {
    title: "Seeded retake",
    description: "The same T-shirt laid flat on a plain sheet in even light.",
    alt: "Drawing of the same rust-coloured T-shirt laid flat and straight on a plain pale sheet in even light.",
  },
};

export function isSeededFixtureName(value: string): value is SeededFixtureName {
  return (SEEDED_FIXTURE_NAMES as readonly string[]).includes(value);
}

export function seededFixtureForSource(source: ReadinessSource): SeededFixtureName | null {
  return source === "seeded-bad" ? "bad" : source === "seeded-retake" ? "retake" : null;
}

export function seededFixtureInfo(name: SeededFixtureName): SeededFixtureInfo {
  return {
    name,
    source: SOURCES[name],
    ...COPY[name],
    imageUrl: `/api/readiness/seeded/${name}`,
    ...SEEDED_FIXTURE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Scene description
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

const GARMENT: Rgb = [188, 84, 62];
const PLAIN_SHEET: Rgb = [226, 223, 216];
const DUVET_LIGHT: Rgb = [232, 224, 205];
const DUVET_BLUE: Rgb = [120, 150, 185];

/** T-shirt outline in garment-local coordinates, both axes 0–1. */
const TEE_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [0.22, 0.0],
  [0.78, 0.0],
  [1.0, 0.22],
  [0.87, 0.36],
  [0.76, 0.27],
  [0.76, 1.0],
  [0.24, 1.0],
  [0.24, 0.27],
  [0.13, 0.36],
  [0.0, 0.22],
];

/** Crease lines across the crumpled garment, as [u0, v0, u1, v1] in garment-local coordinates. */
const CREASES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.28, 0.18, 0.7, 0.3],
  [0.3, 0.42, 0.72, 0.34],
  [0.26, 0.52, 0.6, 0.66],
  [0.4, 0.5, 0.74, 0.58],
  [0.28, 0.78, 0.7, 0.7],
  [0.34, 0.9, 0.74, 0.84],
  [0.36, 0.12, 0.3, 0.6],
  [0.52, 0.2, 0.46, 0.74],
  [0.66, 0.16, 0.7, 0.62],
  [0.58, 0.62, 0.64, 0.96],
  [0.38, 0.64, 0.32, 0.96],
  [0.05, 0.22, 0.2, 0.3],
  [0.8, 0.14, 0.95, 0.26],
  [0.44, 0.3, 0.6, 0.46],
];

function insideTee(u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = TEE_OUTLINE.length - 1; i < TEE_OUTLINE.length; j = i++) {
    const [ui, vi] = TEE_OUTLINE[i];
    const [uj, vj] = TEE_OUTLINE[j];
    if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

function insideCollar(u: number, v: number): boolean {
  const du = (u - 0.5) / 0.14;
  const dv = v / 0.085;
  return du * du + dv * dv < 1;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function scale(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** The retake: flat, straight, centred, plain sheet, light falling off very gently across the frame. */
function sampleRetake(fx: number, fy: number): Rgb {
  const { width, height } = SEEDED_FIXTURE_SIZE;
  const light = 1 - 0.05 * (0.5 * (fx / width) + 0.5 * (fy / height));
  const u = (fx - 75) / 330;
  const v = (fy - 125) / 400;
  if (!insideTee(u, v)) return scale(PLAIN_SHEET, light);

  let shade = 1;
  if (insideCollar(u, v)) shade = 0.7;
  else if (v > 0.95 && v < 0.962) shade = 0.93;
  return scale(GARMENT, light * shade);
}

const BAD_TILT = (14 * Math.PI) / 180;
const BAD_COS = Math.cos(BAD_TILT);
const BAD_SIN = Math.sin(BAD_TILT);
const BAD_GARMENT = { cx: 236, cy: 328, width: 290, height: 360 };
const DUVET_CHECK_PX = 46;

/** The bad flat-lay: tilted, warped and creased garment on a checked duvet, lower right in shadow. */
function sampleBad(fx: number, fy: number): Rgb {
  const shadow = 1 - 0.45 * smoothstep(-22, 22, 0.8 * fx + 0.6 * fy - 400);

  const dx = fx - BAD_GARMENT.cx;
  const dy = fy - BAD_GARMENT.cy;
  const lx = dx * BAD_COS + dy * BAD_SIN;
  const ly = -dx * BAD_SIN + dy * BAD_COS;
  const wx = lx + 8 * Math.sin(ly / 37 + 0.6);
  const wy = ly + 6 * Math.sin(lx / 29 + 1.1);
  const u = wx / BAD_GARMENT.width + 0.5;
  const v = wy / BAD_GARMENT.height + 0.5;

  if (!insideTee(u, v)) {
    const cell = (Math.floor(fx / DUVET_CHECK_PX) + Math.floor(fy / DUVET_CHECK_PX)) & 1;
    return scale(cell ? DUVET_BLUE : DUVET_LIGHT, shadow);
  }

  // Each crease is a dark valley with a lighter ridge beside it.
  const px = u * BAD_GARMENT.width;
  const py = v * BAD_GARMENT.height;
  let dark = 0;
  let ridge = 0;
  for (const [u0, v0, u1, v1] of CREASES) {
    const ax = u0 * BAD_GARMENT.width;
    const ay = v0 * BAD_GARMENT.height;
    const bx = u1 * BAD_GARMENT.width - ax;
    const by = v1 * BAD_GARMENT.height - ay;
    const len = Math.hypot(bx, by);
    const t = Math.min(1, Math.max(0, ((px - ax) * bx + (py - ay) * by) / (len * len)));
    const ex = px - ax - t * bx;
    const ey = py - ay - t * by;
    const side = bx * (py - ay) - by * (px - ax) >= 0 ? 1 : -1;
    const d = side * Math.hypot(ex, ey);
    dark += 0.42 * Math.exp(-((d / 3.2) ** 2));
    ridge += 0.15 * Math.exp(-(((d - 7) / 4) ** 2));
  }
  const creaseShade = Math.min(1.2, Math.max(0.5, 1 - dark + ridge));
  const shade = (insideCollar(u, v) ? 0.7 : 1) * creaseShade;
  return scale(GARMENT, shade * shadow);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const rendered = new Map<SeededFixtureName, PixelGrid>();

/** Renders a fixture to RGBA pixels with 2×2 supersampling. Deterministic; memoised per process. */
export function renderSeededFixture(name: SeededFixtureName): PixelGrid {
  const cached = rendered.get(name);
  if (cached) return cached;

  const grid = rasteriseScene(name === "bad" ? sampleBad : sampleRetake);
  rendered.set(name, grid);
  return grid;
}

/**
 * Rasterises a scene at SEEDED_FIXTURE_SIZE with 2×2 supersampling. Also draws the other garments
 * of the seeded demo listing set (lib/listings/seeded-set.ts).
 */
export function rasteriseScene(sample: (fx: number, fy: number) => readonly [number, number, number]): PixelGrid {
  const { width, height } = SEEDED_FIXTURE_SIZE;
  const data = new Uint8ClampedArray(width * height * 4);
  const offsets = [0.25, 0.75];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const oy of offsets) {
        for (const ox of offsets) {
          const c = sample(x + ox, y + oy);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const o = (y * width + x) * 4;
      data[o] = Math.round(r / 4);
      data[o + 1] = Math.round(g / 4);
      data[o + 2] = Math.round(b / 4);
      data[o + 3] = 255;
    }
  }

  return { width, height, data };
}
