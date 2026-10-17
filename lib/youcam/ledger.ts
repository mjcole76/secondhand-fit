/**
 * Append-only usage ledger and unit budget guard.
 *
 * Rows are only ever appended: a reservation that turns out not to be spent is handed back with a
 * "release" row, never by editing or removing the original.
 *
 * In-memory for now (resets when the server process restarts). The Prisma-backed UsageLedger
 * table replaces the storage in a later build step; the interface stays the same. Until then
 * YOUCAM_UNITS_SPENT_BASELINE carries spend from before the current process into the guard.
 */

import { getYouCamConfig, type ProviderMode } from "./adapter";

export type LedgerMode = ProviderMode | "precomputed" | "cache";

/**
 * task     — a try-on admitted by the guard; its units are reserved before the provider is called.
 * release  — the provider flow failed before a task existed, so the reserved units are handed back.
 * fallback — a precomputed run was served. Never spends units.
 */
export type LedgerEvent = "task" | "release" | "fallback";

export interface LedgerEntry {
  id: number;
  /** Hashed anonymous session id (lib/tryon/session.ts); null outside a buyer session. */
  sessionKey: string | null;
  endpoint: string;
  event: LedgerEvent;
  /** Negative on a release row. */
  unitsSpent: number;
  /** "estimate" until observed spend is recorded from a provider response. */
  unitsSource: "estimate" | "observed";
  mode: LedgerMode;
  /** Why a release or fallback row was written. */
  reason?: string;
  /** On a release row: id of the task row it hands back. */
  releases?: number;
  /** Estimated units left in the budget once this row is applied. */
  runningRemainingEstimate: number;
  createdAt: number;
}

type LedgerStore = { entries: LedgerEntry[]; nextId: number };
const g = globalThis as unknown as { __usageLedger?: LedgerStore };

function store(): LedgerStore {
  if (!g.__usageLedger) g.__usageLedger = { entries: [], nextId: 1 };
  return g.__usageLedger;
}

function append(entry: Omit<LedgerEntry, "id" | "createdAt" | "runningRemainingEstimate">): LedgerEntry {
  const s = store();
  const counted = entry.mode === "live" ? entry.unitsSpent : 0;
  const row: LedgerEntry = Object.freeze({
    ...entry,
    id: s.nextId++,
    runningRemainingEstimate: Math.max(0, unitBudget() - unitsSpent() - counted),
    createdAt: Date.now(),
  });
  s.entries.push(row);
  return row;
}

/** Units already spent before this process started, as entered by the operator (default 0). */
export function unitsSpentBaseline(): number {
  const n = Number.parseInt(process.env.YOUCAM_UNITS_SPENT_BASELINE ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Baseline plus units spent against the live provider. Mock and precomputed runs never count. */
export function unitsSpent(): number {
  return store()
    .entries.filter((e) => e.mode === "live")
    .reduce((sum, e) => sum + e.unitsSpent, unitsSpentBaseline());
}

export function unitBudget(): number {
  return getYouCamConfig().unitBudget;
}

/** False once the budget cannot cover one more call, including when the cap equals current spend. */
export function canAffordLiveCall(estimatedUnits: number): boolean {
  return unitBudget() - unitsSpent() >= Math.max(1, estimatedUnits);
}

/**
 * Budget check and reservation in one synchronous step, so two requests arriving together cannot
 * both pass the check before either is recorded. Returns null when the budget cannot cover the call.
 * The check also runs in mock mode, where a task reserves 0 units, so the guard can be exercised
 * offline.
 */
export function reserveTask(input: {
  sessionKey: string | null;
  endpoint: string;
  mode: ProviderMode;
  estimatedUnits: number;
}): LedgerEntry | null {
  if (!canAffordLiveCall(input.estimatedUnits)) return null;
  return append({
    sessionKey: input.sessionKey,
    endpoint: input.endpoint,
    event: "task",
    unitsSpent: input.mode === "live" ? input.estimatedUnits : 0,
    unitsSource: "estimate",
    mode: input.mode,
  });
}

/** Hands back a reservation when the provider flow failed before a task existed. */
export function releaseTask(task: LedgerEntry, reason: string): LedgerEntry {
  return append({
    sessionKey: task.sessionKey,
    endpoint: task.endpoint,
    event: "release",
    unitsSpent: task.unitsSpent === 0 ? 0 : -task.unitsSpent,
    unitsSource: "observed",
    mode: task.mode,
    reason,
    releases: task.id,
  });
}

/** Records that a precomputed run was served in place of a provider call. */
export function recordFallback(input: { sessionKey: string | null; endpoint: string; reason: string }): LedgerEntry {
  return append({
    sessionKey: input.sessionKey,
    endpoint: input.endpoint,
    event: "fallback",
    unitsSpent: 0,
    unitsSource: "observed",
    mode: "precomputed",
    reason: input.reason,
  });
}

function releasedTaskIds(entries: readonly LedgerEntry[]): Set<number> {
  const ids = new Set<number>();
  for (const e of entries) if (e.event === "release" && e.releases !== undefined) ids.add(e.releases);
  return ids;
}

/** Creation times of the tasks a session started at or after `since` (released ones excluded), oldest first. */
export function sessionTaskTimes(sessionKey: string, since: number): number[] {
  const entries = store().entries;
  const released = releasedTaskIds(entries);
  return entries
    .filter((e) => e.event === "task" && e.sessionKey === sessionKey && e.createdAt >= since && !released.has(e.id))
    .map((e) => e.createdAt);
}

export type BudgetBand = "healthy" | "low" | "exhausted";

export function budgetBand(): BudgetBand {
  const remaining = unitBudget() - unitsSpent();
  if (!canAffordLiveCall(getYouCamConfig().estimatedUnitCost)) return "exhausted";
  if (remaining <= Math.max(10, unitBudget() * 0.1)) return "low";
  return "healthy";
}

export interface LedgerSummary {
  budget: number;
  /** Includes `baseline`. */
  spent: number;
  baseline: number;
  remainingEstimate: number;
  band: BudgetBand;
  entries: number;
  liveCalls: number;
  mockCalls: number;
  cacheCalls: number;
  precomputedCalls: number;
  /** Reservations handed back because the provider flow failed before a task existed. */
  releasedCalls: number;
  /** Precomputed runs by the reason they were served. */
  fallbackReasons: Record<string, number>;
}

export function ledgerSummary(): LedgerSummary {
  const entries = store().entries;
  const released = releasedTaskIds(entries);
  const tasks = entries.filter((e) => e.event === "task" && !released.has(e.id));
  const fallbacks = entries.filter((e) => e.event === "fallback");
  const fallbackReasons: Record<string, number> = {};
  for (const e of fallbacks) {
    const reason = e.reason ?? "unknown";
    fallbackReasons[reason] = (fallbackReasons[reason] ?? 0) + 1;
  }
  const spent = unitsSpent();
  const budget = unitBudget();
  return {
    budget,
    spent,
    baseline: unitsSpentBaseline(),
    remainingEstimate: Math.max(0, budget - spent),
    band: budgetBand(),
    entries: entries.length,
    liveCalls: tasks.filter((e) => e.mode === "live").length,
    mockCalls: tasks.filter((e) => e.mode === "mock").length,
    cacheCalls: entries.filter((e) => e.mode === "cache").length,
    precomputedCalls: fallbacks.length,
    releasedCalls: released.size,
    fallbackReasons,
  };
}
