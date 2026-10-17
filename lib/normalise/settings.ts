/**
 * Garment image normalisation settings — the ONE place every normalisation number lives.
 *
 * An accepted flat-lay is turned into the garment image the YouCam Apparel VTO API is sent:
 * upright, cropped to the garment with padding, plain surface flattened to a neutral colour where
 * the surface match is confident, resized and encoded within the VTO input limits.
 *
 * PROVENANCE: these values are PROVISIONAL, set by reasoning and checked against the two drawn
 * fixtures only. The output limits they aim for come from YOUCAM_PINNED.input in
 * lib/youcam/adapter.ts, which is itself unverified until a live render succeeds. The server checks
 * every normalised image against YOUCAM_PINNED.input directly, not against copies of it here.
 *
 * Imported by browser code, so it must not import the server-only YouCam adapter.
 */
export const NORMALISE_SETTINGS = {
  version: "2026-10-01.provisional-1",

  /**
   * The server turns the photo upright and scales it to at most this many pixels on the longer
   * side before working on it; the stored original is this size too.
   */
  uploadMaxSidePx: 1280,
  /**
   * Largest request body the normalise route accepts. Kept under the 4.5 MB request body limit of
   * Vercel functions. A photo file above it is replaced by a smaller PNG copy made in the browser.
   */
  maxRequestBytes: 4 * 1024 * 1024,
  /** Decoded pixel count above which the server refuses a file (decompression-bomb guard). */
  maxInputPixels: 50_000_000,

  /** Padding around the garment's bounding box, as a share of the box's longer side. */
  paddingFrac: 0.08,

  /** Longer side of the normalised image. Smaller crops are not enlarged unless below the VTO minimum. */
  outputMaxSidePx: 1024,

  background: {
    /** Colour the confidently matched surface is flattened to. */
    neutral: [242, 242, 240] as const,
    /**
     * Analysis-grid pixels within this distance of anything that is not plain surface are left
     * exactly as photographed. This is what makes the suppression conservative.
     */
    guardCells: 2,
    /** Beyond the guard band the surface blends to the neutral colour over this many grid pixels. */
    featherCells: 2,
  },
} as const;

export type NormaliseSettings = typeof NORMALISE_SETTINGS;
