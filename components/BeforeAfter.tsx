"use client";

import { useId, useState } from "react";

export interface BeforeAfterImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

interface Props {
  before: BeforeAfterImage;
  /** Null while the normalised image is being made: the after side shows a placeholder. */
  after: BeforeAfterImage | null;
}

/**
 * The original photo against the normalised garment image. On wider screens both share one frame,
 * split by a divider moved with a native range input (so it works from the keyboard); on narrow
 * screens they stack. The "what changed" list beside it is the text version of the comparison.
 */
export function BeforeAfter({ before, after }: Props) {
  const [split, setSplit] = useState(50);
  const sliderId = useId();
  const aspectRatio = before.width > 0 && before.height > 0 ? `${before.width} / ${before.height}` : "3 / 4";

  return (
    <div className="before-after">
      <div className="ba-compare">
        <div className="ba-frame" style={{ aspectRatio }}>
          <img className="ba-image" src={before.url} alt={before.alt} width={before.width} height={before.height} />
          {after ? (
            <img
              className="ba-image"
              src={after.url}
              alt={after.alt}
              width={after.width}
              height={after.height}
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            />
          ) : (
            <div className="ba-image ba-pending" style={{ clipPath: `inset(0 0 0 ${split}%)` }} aria-hidden="true" />
          )}
          <span className="ba-divider" style={{ left: `${split}%` }} aria-hidden="true" />
          <span className="ba-tag ba-tag-before" aria-hidden="true">
            Before
          </span>
          <span className="ba-tag ba-tag-after" aria-hidden="true">
            After
          </span>
        </div>
        <label htmlFor={sliderId}>Divider: right shows more of the original, left more of the normalised image</label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={split}
          disabled={!after}
          aria-valuetext={`${split}% original, ${100 - split}% normalised`}
          onChange={(ev) => setSplit(Number(ev.target.value))}
        />
      </div>

      <div className="ba-stack">
        <figure>
          <img src={before.url} alt={before.alt} width={before.width} height={before.height} />
          <figcaption>Before: the photo as received</figcaption>
        </figure>
        <figure>
          {after ? (
            <img src={after.url} alt={after.alt} width={after.width} height={after.height} />
          ) : (
            <div className="ba-pending ba-pending-box" aria-hidden="true" />
          )}
          <figcaption>After: the garment image prepared for try-on</figcaption>
        </figure>
      </div>
    </div>
  );
}
