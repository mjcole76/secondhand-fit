/**
 * The honesty layer every render carries: the readiness badge it inherits from the garment photo.
 * The preview-only label itself is PREVIEW_ONLY_LABEL in ./contracts.
 *
 * A try-on from a published listing inherits the grade the listing was published with, unless the
 * garment image sent for the render grades lower; the badge says which one it shows.
 *
 * The badge is rebuilt from the signed render ticket each time, using the reviewed copy in
 * lib/readiness, so the same words appear on the result, on the watchlist and in the band burned
 * into the image. Imported by browser and server code, so it must stay free of server-only imports.
 */

import type { CheckId, CheckReason } from "@/lib/readiness/contracts";
import { gradeReason, isCheckId, READINESS_GRADES, type ReadinessGrade } from "@/lib/readiness/grade";

import type { GradeSource, RenderMode } from "./render-id";

export interface RenderBadge {
  /** Null when the garment photo behind the render was not graded. */
  grade: ReadinessGrade | null;
  /** Badge text, e.g. "Source photo checks: grade B". Carries the grade in words, never by colour alone. */
  title: string;
  /** Why the grade is not higher, or why there is no grade. */
  reason: string;
  /** Where the grade comes from. Absent when there is no grade, and on badges saved before it existed. */
  basis?: string;
}

const BASIS: Record<GradeSource, string> = {
  listing: "Inherited from the readiness grade this listing was published with.",
  sent_lower:
    "Graded on the garment image sent for this render, which scored lower than the listing's published photo.",
  sent: "Graded on the garment image sent for this render.",
};

/** Shown with every badge, so the grade is not read as a statement about the garment. */
export const BADGE_SCOPE_NOTE = "This provisional grade describes the source photo. It does not score the garment or predict the accuracy of the preview.";

const NOT_GRADED_TITLE = "Source photo checks: not graded";

/** The fields of a render ticket the badge is built from. */
export interface BadgeSource {
  m: RenderMode;
  g?: ReadinessGrade;
  k?: CheckId;
  r?: CheckReason;
  s?: GradeSource;
}

export function renderBadge(source: BadgeSource): RenderBadge {
  // A precomputed example was made in advance, so it does not inherit the uploaded photo's grade.
  if (source.m === "precomputed") {
    return {
      grade: null,
      title: NOT_GRADED_TITLE,
      reason: "This example was made in advance and not from your garment photo.",
    };
  }
  if (source.g && READINESS_GRADES.includes(source.g) && isCheckId(source.k)) {
    return {
      grade: source.g,
      title: `Source photo checks: grade ${source.g}`,
      reason: gradeReason({ grade: source.g, weakestCheck: source.k, weakestReason: source.r ?? "ok" }),
      basis: BASIS[source.s && Object.prototype.hasOwnProperty.call(BASIS, source.s) ? source.s : "sent"],
    };
  }
  return {
    grade: null,
    title: NOT_GRADED_TITLE,
    reason: "The readiness checks could not be run on this garment photo.",
  };
}
