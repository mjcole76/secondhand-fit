/**
 * Burns the preview-only label and the readiness badge into a render.
 *
 * Server-only. The render is wrapped in an SVG: the original image on top, untouched, and a band
 * underneath carrying the label, the badge and how the render was served. The image proxy route
 * serves only this wrapped form, so every copy of a render that reaches a browser — shown on a
 * page, saved from it or downloaded — already carries the label. The render's own pixels are not
 * re-encoded and no image library is involved.
 */

import { sniffImageMime } from "@/lib/youcam/adapter";

import { PREVIEW_ONLY_LABEL, SERVING_MODES } from "./contracts";
import { type RenderBadge } from "./honesty";
import type { RenderMode } from "./render-id";

export type BurnInSource =
  /** A provider render. Embedded as a data URI, so nothing inside it can run. */
  | { kind: "raster"; bytes: Uint8Array }
  /** One of this project's own placeholder drawings under public/mock. Inlined as a nested SVG. */
  | { kind: "placeholder-svg"; text: string };

export interface BurnInInfo {
  mode: RenderMode;
  badge: RenderBadge;
}

interface Size {
  width: number;
  height: number;
}

/** Used when the image header cannot be read; the image is then letterboxed inside this frame. */
const FALLBACK_SIZE: Size = { width: 768, height: 1024 };
const MAX_SIDE_PX = 16_384;

const BAND_BG = "#1c1c1a";
const BAND_FG = "#ffffff";
const FONT_FAMILY = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif";
/** Average glyph width as a share of the font size. Deliberately wide, so wrapped lines stay inside the band. */
const GLYPH_WIDTH_EM = 0.6;
const LINE_HEIGHT_EM = 1.35;

// ---------------------------------------------------------------------------
// Image size from the file header
// ---------------------------------------------------------------------------

function u16be(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1];
}

function u16le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u24le(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

function pngSize(b: Uint8Array): Size | null {
  if (b.length < 24) return null;
  return { width: ((u16be(b, 16) << 16) | u16be(b, 18)) >>> 0, height: ((u16be(b, 20) << 16) | u16be(b, 22)) >>> 0 };
}

/** Walks the JPEG segments to the first start-of-frame marker, which holds the dimensions. */
function jpegSize(b: Uint8Array): Size | null {
  let o = 2;
  while (o + 8 < b.length) {
    if (b[o] !== 0xff || b[o + 1] === 0xff) {
      o++;
      continue;
    }
    const marker = b[o + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      o += 2;
      continue;
    }
    const startOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (startOfFrame) return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
    const length = u16be(b, o + 2);
    if (length < 2) return null;
    o += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): Size | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8X") return { width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  if (chunk === "VP8L") {
    const bits = (u16le(b, 21) | (u16le(b, 23) << 16)) >>> 0;
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  return null;
}

function svgSize(text: string): Size | null {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return null;
  const attr = (name: string) => Number(new RegExp(`\\s${name}="\\s*([0-9.]+)(?:px)?\\s*"`, "i").exec(root)?.[1]);
  const width = attr("width");
  const height = attr("height");
  if (width > 0 && height > 0) return { width, height };
  const box = /\sviewBox="\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*"/i.exec(root);
  return box ? { width: Number(box[1]), height: Number(box[2]) } : null;
}

function usable(size: Size | null): Size {
  if (!size) return FALLBACK_SIZE;
  const { width, height } = size;
  const ok = (v: number) => Number.isFinite(v) && v >= 1 && v <= MAX_SIDE_PX;
  return ok(width) && ok(height) ? { width: Math.round(width), height: Math.round(height) } : FALLBACK_SIZE;
}

// ---------------------------------------------------------------------------
// Band text
// ---------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Greedy word wrap. SVG text does not wrap on its own. */
function wrap(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** The words burned into the image: the label, then the badge, then how the render was served. */
export function burnInText(info: BurnInInfo): { label: string; badge: string; source: string } {
  return {
    label: PREVIEW_ONLY_LABEL,
    badge: `${info.badge.title}. Photo assessment only.`,
    source: `Source: ${SERVING_MODES[info.mode].label}.`,
  };
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Returns the labelled SVG for a render, or null when the source is not an image type this
 * project handles. Callers must treat null as "do not serve": an unlabelled render never goes out.
 */
export function burnInLabel(source: BurnInSource, info: BurnInInfo): string | null {
  let size: Size;
  let picture: (s: Size) => string;

  if (source.kind === "placeholder-svg") {
    const body = source.text.replace(/<\?xml[^>]*\?>/gi, "").replace(/<!DOCTYPE[^>]*>/gi, "").trim();
    if (!/^<svg\b/i.test(body)) return null;
    size = usable(svgSize(body));
    picture = (s) => `<svg x="0" y="0" width="${s.width}" height="${s.height}">${body}</svg>`;
  } else {
    const mime = sniffImageMime(source.bytes);
    if (!mime) return null;
    const { bytes } = source;
    size = usable(mime === "image/png" ? pngSize(bytes) : mime === "image/jpeg" ? jpegSize(bytes) : webpSize(bytes));
    const href = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    picture = (s) =>
      `<image x="0" y="0" width="${s.width}" height="${s.height}" preserveAspectRatio="xMidYMid meet" href="${href}"/>`;
  }

  const { width, height } = size;
  const pad = Math.max(6, Math.round(width * 0.02));
  const labelPx = Math.max(11, Math.round(width * 0.023));
  const detailPx = Math.max(10, Math.round(width * 0.019));
  const charsAt = (fontPx: number) => Math.max(8, Math.floor((width - 2 * pad) / (fontPx * GLYPH_WIDTH_EM)));

  const text = burnInText(info);
  const rows: string[] = [];
  let y = height + pad;
  const addBlock = (content: string, fontPx: number, weight: 400 | 700) => {
    for (const line of wrap(content, charsAt(fontPx))) {
      y += Math.round(fontPx * LINE_HEIGHT_EM);
      rows.push(
        `<text x="${pad}" y="${y - Math.round(fontPx * 0.3)}" font-family="${FONT_FAMILY}" font-size="${fontPx}" font-weight="${weight}" fill="${BAND_FG}">${escapeXml(line)}</text>`,
      );
    }
    y += Math.round(fontPx * 0.4);
  };
  addBlock(text.label, labelPx, 700);
  addBlock(text.badge, detailPx, 400);
  addBlock(text.source, detailPx, 400);
  const total = y + pad;

  const title = escapeXml(`${text.label} ${text.badge} ${text.source}`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<rect width="${width}" height="${total}" fill="#ffffff"/>`,
    picture(size),
    `<rect x="0" y="${height}" width="${width}" height="${total - height}" fill="${BAND_BG}"/>`,
    ...rows,
    `</svg>`,
  ].join("\n");
}
