/**
 * Seller readiness thresholds — the ONE place every readiness number lives.
 *
 * Each check turns a raw metric into a 0–100 score (higher is better) by a linear ramp between a
 * "best" and a "worst" value, then maps the score to a verdict: pass at or above `passAt`, warn at
 * or above `warnAt`, otherwise fail. A single failing check rejects the photo.
 *
 * PROVENANCE: these values are PROVISIONAL. They were set by reasoning about the metrics and
 * checked against the two drawn fixtures in lib/readiness/seeded.ts. They have NOT been calibrated
 * against live YouCam Apparel VTO runs on degraded inputs (build-packet/13-build-sequence.md,
 * step 3). When that calibration runs, replace the values here, bump `version` and set
 * `calibrated` to true. Nothing else in the codebase hard-codes a readiness number.
 *
 * Imported by browser code, so it must not import the server-only YouCam adapter.
 */
export const READINESS_THRESHOLDS = {
  version: "2026-10-01.provisional-1",
  calibrated: false,
  provenance:
    "Provisional defaults checked against the two drawn fixtures only. Not yet calibrated against live YouCam Apparel VTO runs.",

  /** Upload limits. Mirrors YOUCAM_PINNED.input in lib/youcam/adapter.ts (unverified there too). */
  upload: {
    maxBytes: 10 * 1024 * 1024,
    allowedMime: ["image/jpeg", "image/png", "image/webp"],
    minSidePx: 256,
  },

  analysis: {
    /** The photo is drawn to a canvas no larger than this before it is read back. */
    decodeMaxSidePx: 1024,
    /** Every check runs on a box-filtered grid whose longer side is this many pixels. */
    gridMaxSidePx: 160,
    /**
     * A grid pixel counts as an "edge" when |dL/dx| + |dL/dy| (central differences on 0–255
     * luminance) exceeds this. Used by the surface-texture and flatness proxies.
     */
    edgeMagnitude: 22,
  },

  segmentation: {
    /** Width of the border ring that is assumed to show the surface, as a share of the short side. */
    borderRingFrac: 0.05,
    /** RGB radius of one surface-colour cluster in the border ring. */
    clusterRadius: 30,
    maxClusters: 32,
    /** A border cluster joins the surface palette when it holds at least this share of the ring. */
    paletteMinShare: 0.08,
    /**
     * A pixel is surface when its RGB distance to a palette colour, or to the line between two
     * palette colours (lit/shadowed and blended pattern colours), is at most this.
     */
    backgroundMatchDistance: 34,
    /** The garment outline counts as found when its area is inside this share of the frame. */
    minGarmentAreaFrac: 0.03,
    maxGarmentAreaFrac: 0.85,
    /** Separate non-surface blobs at least this large count as other objects in the shot. */
    strayMinAreaFrac: 0.004,
    /** Brightness-normalised RGB distance from the garment's median colour that marks a pixel as not garment. */
    foreignColourDistance: 55,
  },

  checks: {
    framing: {
      passAt: 70,
      warnAt: 45,
      /** Smallest gap between the garment box and the frame edge, as a share of the frame side. */
      marginBest: 0.05,
      /** Share of the outermost pixel ring covered by garment above which the garment counts as cut off. */
      clippedEdgeFrac: 0.01,
      /** Garment bounding-box area as a share of the frame. */
      boxAreaWorst: 0.12,
      boxAreaBest: 0.3,
    },
    background: {
      passAt: 70,
      warnAt: 45,
      /** Share of surface pixels that are edges (pattern / texture proxy). */
      textureEdgeDensityBest: 0.02,
      textureEdgeDensityWorst: 0.12,
      /** RGB distance between the garment's median colour and the nearest surface colour. */
      contrastWorst: 34,
      contrastBest: 90,
      /** Surface pixels this close to the garment are left out of the texture measure. */
      garmentGuardPx: 3,
    },
    flatness: {
      passAt: 70,
      warnAt: 45,
      /** Share of garment-interior pixels that are edges (wrinkle proxy, not a physical quantity). */
      edgeDensityBest: 0.03,
      edgeDensityWorst: 0.16,
      /** The garment outline is shrunk by this many grid pixels so its own silhouette is not counted. */
      interiorErodePx: 3,
    },
    occlusion_shadow: {
      passAt: 70,
      warnAt: 45,
      /** The surface is split into blockGrid × blockGrid blocks; shadow ratio = (brightest − darkest) / brightest. */
      blockGrid: 4,
      blockMinSurfaceFrac: 0.25,
      shadowRatioBest: 0.15,
      shadowRatioWorst: 0.5,
      /** Share of the frame covered by other objects or by non-garment colour entering from the frame edge. */
      intrusionAreaWorst: 0.03,
    },
  },

  instructions: {
    max: 3,
    /** The order a seller would physically fix things: surface, garment, light and clutter, then framing. */
    priority: ["background", "flatness", "occlusion_shadow", "framing"],
  },
} as const;

export type ReadinessThresholds = typeof READINESS_THRESHOLDS;
