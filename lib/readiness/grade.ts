/**
 * Try-on readiness grade for a garment photo: A, B or C.
 *
 * Worst-check-dominant: the grade is read off the single weakest check and nothing is averaged, so
 * one failing check gives the lowest grade however well the other three scored. The verdict
 * cut-offs it reads are the ones in lib/readiness/thresholds.ts; this file adds no number of its
 * own.
 *
 *   A — every check passed
 *   B — the weakest check is a warning
 *   C — at least one check failed, or the garment edges were not found
 *
 * The grade describes the photo as try-on input. It says nothing about the garment itself.
 * Imported by browser and server code, so it must stay free of server-only imports.
 */

import type { AttemptGrade, CheckId, CheckReason, ReadinessResult, Verdict } from "./contracts";
import { CHECK_LABELS, summaryFor } from "./instructions";
import { READINESS_THRESHOLDS } from "./thresholds";

export type ReadinessGrade = "A" | "B" | "C";

export const READINESS_GRADES: readonly ReadinessGrade[] = ["A", "B", "C"];

export interface GradedReadiness {
  grade: ReadinessGrade;
  /** The check that decides the grade. */
  weakestCheck: CheckId;
  weakestReason: CheckReason;
}

/** What each grade means, for the methods page and the listing page. Reviewed copy. */
export const GRADE_MEANINGS: Record<ReadinessGrade, string> = {
  A: "Every photo check passed.",
  B: "No check failed, and the weakest check is a warning.",
  C: "At least one check failed, or the garment edges were not found. A photo with this grade is not published.",
};

const GRADE_FOR_VERDICT: Record<Verdict, ReadinessGrade> = { pass: "A", warn: "B", fail: "C" };
const SEVERITY: Record<Verdict, number> = { fail: 0, warn: 1, pass: 2 };

export function isCheckId(value: unknown): value is CheckId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CHECK_LABELS, value);
}

/** Grades a readiness result by its weakest check. Returns null when there are no checks to grade. */
export function gradeReadiness(result: ReadinessResult): GradedReadiness | null {
  const priority: readonly CheckId[] = READINESS_THRESHOLDS.instructions.priority;
  // Worst verdict first, then lowest score, then the order a seller would fix things in.
  const weakest = [...result.checks].sort(
    (a, b) =>
      SEVERITY[a.verdict] - SEVERITY[b.verdict] || a.score - b.score || priority.indexOf(a.id) - priority.indexOf(b.id),
  )[0];
  if (!weakest) return null;
  return { grade: GRADE_FOR_VERDICT[weakest.verdict], weakestCheck: weakest.id, weakestReason: weakest.reason };
}

/** Why the grade is not higher, in the reviewed copy from lib/readiness/instructions.ts. */
export function gradeReason(graded: GradedReadiness): string {
  if (graded.grade === "A") return "All four photo checks passed.";
  if (graded.weakestReason === "not_found") {
    return "Lowest grade: the garment edges could not be found in the photo.";
  }
  const label = CHECK_LABELS[graded.weakestCheck];
  const summary = summaryFor(graded.weakestCheck, graded.weakestReason);
  return graded.grade === "B"
    ? `Not grade A because of a warning on the ${label} check. ${summary}`
    : `Lowest grade because the ${label} check failed. ${summary}`;
}

/** The grade of one attempt together with its reason, as the readiness routes return it. */
export function attemptGrade(result: ReadinessResult): AttemptGrade | null {
  const graded = gradeReadiness(result);
  return graded ? { ...graded, reason: gradeReason(graded) } : null;
}
