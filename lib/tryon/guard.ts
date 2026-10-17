/**
 * Admission guard for try-on requests: the unit budget first, then the per-session fair-use cap.
 *
 * Server-only. A request the guard does not admit is served the labelled precomputed run and never
 * reaches the YouCam adapter. If the guard itself throws it fails closed the same way. Both checks
 * also run in mock mode, so the fallback can be reproduced without credentials.
 */

import { getYouCamConfig, type YouCamConfig } from "@/lib/youcam/adapter";
import {
  canAffordLiveCall,
  recordFallback,
  reserveTask,
  sessionTaskTimes,
  type LedgerEntry,
} from "@/lib/youcam/ledger";

import type { FallbackInfo, ServingState, SessionAllowance } from "./contracts";
import { encodeRenderId } from "./render-id";

export const FAIR_USE_WINDOW_HOURS = 24;
const FAIR_USE_WINDOW_MS = FAIR_USE_WINDOW_HOURS * 60 * 60 * 1000;
const DEFAULT_SESSION_RENDER_CAP = 5;

/** Try-on renders one session may start per window. TRYON_SESSION_RENDER_CAP overrides the default. */
export function sessionRenderCap(): number {
  const n = Number.parseInt(process.env.TRYON_SESSION_RENDER_CAP ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SESSION_RENDER_CAP;
}

export function sessionAllowance(sessionKey: string | null, now = Date.now()): SessionAllowance {
  const cap = sessionRenderCap();
  const times = sessionKey ? sessionTaskTimes(sessionKey, now - FAIR_USE_WINDOW_MS) : [];
  return {
    cap,
    used: times.length,
    remaining: Math.max(0, cap - times.length),
    windowHours: FAIR_USE_WINDOW_HOURS,
    resetAt: times.length > 0 ? times[0] + FAIR_USE_WINDOW_MS : undefined,
  };
}

function utcTime(ms: number): string {
  return `${new Date(ms).toISOString().slice(11, 16)} UTC`;
}

const EXAMPLE_OFFER = "a precomputed example is available to choose. It is not a live result.";

function budgetFallback(): FallbackInfo {
  return {
    reason: "budget_exhausted",
    message: `The live API unit budget for this demo is used up, so ${EXAMPLE_OFFER}`,
  };
}

function fairUseFallback(allowance: SessionAllowance): FallbackInfo {
  const opens = allowance.resetAt ? ` The next one opens up at ${utcTime(allowance.resetAt)}.` : "";
  const why =
    allowance.cap === 0
      ? "Try-on renders are switched off for visitor sessions on this deployment"
      : `This browser session has used its ${allowance.cap} try-on renders for the last ${allowance.windowHours} hours`;
  return {
    reason: "fair_use_cap",
    message: `${why}, so ${EXAMPLE_OFFER}${opens}`,
    resetAt: allowance.resetAt,
  };
}

/**
 * `userMessage` is the specific explanation for a documented provider error_code (see
 * YOUCAM_ERROR_MESSAGES in lib/youcam/adapter.ts), shown ahead of the fallback notice.
 */
export function providerErrorFallback(providerMessage?: string, errorKind?: string, userMessage?: string): FallbackInfo {
  return {
    reason: "provider_error",
    message: `${userMessage ? `${userMessage} ` : ""}The YouCam API call could not be completed, so ${EXAMPLE_OFFER}`,
    providerMessage,
    errorKind,
  };
}

export type Admission = { admitted: true; reservation: LedgerEntry } | { admitted: false; fallback: FallbackInfo };

/**
 * Decides whether a try-on may reach the adapter and, if so, reserves its units in the ledger.
 * Synchronous on purpose: there is no await between the checks and the reservation.
 */
export function admitTryOn(sessionKey: string, cfg: YouCamConfig): Admission {
  try {
    if (!canAffordLiveCall(cfg.estimatedUnitCost)) return { admitted: false, fallback: budgetFallback() };

    const allowance = sessionAllowance(sessionKey);
    if (allowance.remaining <= 0) return { admitted: false, fallback: fairUseFallback(allowance) };

    const reservation = reserveTask({
      sessionKey,
      endpoint: `task/${cfg.feature}`,
      mode: cfg.mode,
      estimatedUnits: cfg.estimatedUnitCost,
    });
    if (!reservation) return { admitted: false, fallback: budgetFallback() };
    return { admitted: true, reservation };
  } catch (err) {
    console.error("tryon guard: failing closed", err instanceof Error ? err.message : err);
    return {
      admitted: false,
      fallback: {
        reason: "guard_error",
        message: `The budget check could not be completed, so no API call was made and ${EXAMPLE_OFFER}`,
      },
    };
  }
}

/** Records a labelled precomputed run in the ledger and returns its render id. Never spends units. */
export function issuePrecomputedRender(
  feature: string,
  sessionKey: string | null,
  reason: FallbackInfo["reason"],
): string {
  recordFallback({ sessionKey, endpoint: `task/${feature}`, reason });
  return encodeRenderId({ t: "precomputed", f: feature, c: Date.now(), m: "precomputed", u: 0 });
}

/** How the next try-on from this session will be served, for the mode banner and /api/status. */
export function servingState(sessionKey: string | null, cfg: YouCamConfig = getYouCamConfig()): ServingState {
  const session = sessionAllowance(sessionKey);
  if (!canAffordLiveCall(cfg.estimatedUnitCost)) {
    return {
      mode: "precomputed",
      detail:
        "The live API unit budget for this demo is used up. Try-ons offer a precomputed example and no API call is made.",
      session,
    };
  }
  if (session.remaining <= 0) {
    const opens = session.resetAt ? ` The next one opens up at ${utcTime(session.resetAt)}.` : "";
    return {
      mode: "precomputed",
      detail:
        session.cap === 0
          ? "Try-on renders are switched off for visitor sessions on this deployment. Try-ons offer a precomputed example and no API call is made."
          : `This browser session has used its ${session.cap} try-on renders for the last ${session.windowHours} hours. Until one opens up, try-ons offer a precomputed example and no API call is made.${opens}`,
      session,
    };
  }
  if (cfg.mode === "mock") {
    return {
      mode: "mock",
      detail: `${cfg.mockReason}. Pinned fixtures are replayed: no API call is made and no API units are spent.`,
      session,
    };
  }
  return {
    mode: "live",
    detail: "Try-ons are rendered now by the Perfect Corp. YouCam Apparel Virtual Try-On API.",
    session,
  };
}
