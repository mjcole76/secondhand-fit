/**
 * Readiness run log: one row per attempt, including rejected ones.
 *
 * In-memory for now (resets when the server process restarts), like lib/youcam/ledger.ts. The
 * Prisma-backed ReadinessRun table replaces the storage in a later build step; imageKey joins the
 * row when image storage lands.
 */

import type { CheckId, CheckResult, ReadinessResult, ReadinessSource, RetakeInstruction, Verdict } from "./contracts";
import { gradeReadiness, type GradedReadiness } from "./grade";

export interface ReadinessRun {
  id: number;
  /** Draft listing the attempt belongs to. Null for a seeded example run outside a listing. */
  listingId: number | null;
  source: ReadinessSource;
  framingScore: number;
  backgroundScore: number;
  flatnessScore: number;
  occlusionScore: number;
  verdictPerCheck: Record<CheckId, Verdict>;
  /** Per-check breakdown the grade was read from. */
  checks: CheckResult[];
  /** Grade of this attempt, read off its weakest check. Rejected attempts are graded too. */
  graded: GradedReadiness | null;
  accepted: boolean;
  instructions: RetakeInstruction[];
  thresholdVersion: string;
  createdAt: number;
}

const MAX_RUNS = 500;

type RunStore = { runs: ReadinessRun[]; nextId: number };
const g = globalThis as unknown as { __readinessRuns?: RunStore };

function store(): RunStore {
  if (!g.__readinessRuns) g.__readinessRuns = { runs: [], nextId: 1 };
  return g.__readinessRuns;
}

export function recordReadinessRun(
  source: ReadinessSource,
  result: ReadinessResult,
  listingId: number | null = null,
): ReadinessRun {
  const s = store();
  const score = (id: CheckId) => result.checks.find((c) => c.id === id)?.score ?? 0;
  const verdict = (id: CheckId): Verdict => result.checks.find((c) => c.id === id)?.verdict ?? "fail";

  const run: ReadinessRun = {
    id: s.nextId++,
    listingId,
    source,
    framingScore: score("framing"),
    backgroundScore: score("background"),
    flatnessScore: score("flatness"),
    occlusionScore: score("occlusion_shadow"),
    verdictPerCheck: {
      framing: verdict("framing"),
      background: verdict("background"),
      flatness: verdict("flatness"),
      occlusion_shadow: verdict("occlusion_shadow"),
    },
    checks: result.checks,
    graded: gradeReadiness(result),
    accepted: result.accepted,
    instructions: result.instructions,
    thresholdVersion: result.thresholdVersion,
    createdAt: Date.now(),
  };
  s.runs.push(run);
  if (s.runs.length > MAX_RUNS) s.runs.splice(0, s.runs.length - MAX_RUNS);
  return run;
}

export function listReadinessRuns(): readonly ReadinessRun[] {
  return store().runs;
}

/** The most recent attempt recorded against a draft listing: the photo the listing currently has. */
export function latestReadinessRunForListing(listingId: number): ReadinessRun | undefined {
  const runs = store().runs;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].listingId === listingId) return runs[i];
  }
  return undefined;
}
