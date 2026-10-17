"use client";

import { useRef, useState, type ReactNode } from "react";

import { PREVIEW_ONLY_LABEL, SERVING_MODES } from "@/lib/tryon/contracts";
import { BADGE_SCOPE_NOTE, type RenderBadge } from "@/lib/tryon/honesty";
import type { RenderMode } from "@/lib/tryon/render-id";

interface Props {
  /** Same-origin URL of the labelled image, /api/tryon/[renderId]/image. Never a provider URL. */
  url: string;
  originalUrl?: string;
  mode: RenderMode;
  badge: RenderBadge;
  label?: string;
  /** Extra actions shown beside the download button, e.g. save or remove. */
  children?: ReactNode;
  /** Told when the labelled image has loaded or could not be loaded. */
  onImageState?: (state: "ready" | "unavailable") => void;
}

const DOWNLOAD_NAME = "secondhand-fit-preview-only";

const ALT: Record<RenderMode, string> = {
  live: "AI-generated preview of the uploaded garment on the uploaded photo — preview only",
  mock: "Placeholder image from offline mock mode, not a live result — preview only",
  precomputed: "Precomputed example render, not a live result and not made from the uploaded photo — preview only",
};

function saveAs(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Downloads the image exactly as shown. The label and badge are already burned into it by the
 * server, so the PNG is a straight copy; nothing is composed here that could be left out.
 */
async function downloadLabelled(img: HTMLImageElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The image could not be encoded.");
    const url = URL.createObjectURL(blob);
    saveAs(url, `${DOWNLOAD_NAME}.png`);
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    // Some browsers will not read an SVG back out of a canvas. The SVG carries the same label.
    saveAs(img.currentSrc || img.src, `${DOWNLOAD_NAME}.svg`);
  }
}

/**
 * The one way a render is put on screen: the labelled image, the persistent preview-only label,
 * and the readiness badge inherited from the garment photo. Used by the try-on result and the
 * watchlist, so neither can show a render without them.
 */
export function RenderPreview({ url, mode, badge, label = PREVIEW_ONLY_LABEL, children, onImageState, originalUrl }: Props) {
  const [compare, setCompare] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");

  return (
    <div className="render-preview">
      {originalUrl ? <div className="comparison-control"><button type="button" className="secondary" aria-pressed={compare} onClick={() => setCompare(!compare)}>{compare ? "Show preview only" : "Compare with original"}</button></div> : null}
      <figure className="render-frame">
        <div className={compare && originalUrl ? "render-media comparing" : "render-media"}>
        {compare && originalUrl ? <div className="original-photo"><span className="media-tag">Original</span><img src={originalUrl} alt="Your original photo before this preview" /></div> : null}
        <div className="generated-photo">
        {state === "unavailable" ? (
          <p className="render-missing" role="status">
            This preview could not be loaded. A preview stays available only while the server and the YouCam API
            still hold the render.
          </p>
        ) : (
          <img
            ref={imgRef}
            src={url}
            alt={ALT[mode]}
            onLoad={() => {
              setState("ready");
              onImageState?.("ready");
            }}
            onError={() => {
              setState("unavailable");
              onImageState?.("unavailable");
            }}
          />
        )}
        </div></div>
        <p className="render-label">{label}</p>
        <figcaption className="render-caption">
          <p className="render-badge">
            <span className={`grade-pill grade-${badge.grade ?? "none"}`} aria-hidden="true">
              {badge.grade ?? "–"}
            </span>
            <strong>{badge.title}</strong>
          </p>
          <details><summary>Photo grade and preview details</summary><p>
            {badge.reason} {badge.basis ? `${badge.basis} ` : ""}
            {BADGE_SCOPE_NOTE}
          </p>
          <p className="muted">
            Source: {SERVING_MODES[mode].label}. The label and the badge are part of the image itself, so they stay
            on it when it is saved or downloaded.
          </p></details>
        </figcaption>
      </figure>
      <p className="render-actions">
        <button
          type="button"
          className="secondary"
          disabled={state !== "ready"}
          onClick={() => {
            if (imgRef.current) void downloadLabelled(imgRef.current);
          }}
        >
          Download preview
        </button>
        {children}
      </p>
    </div>
  );
}
