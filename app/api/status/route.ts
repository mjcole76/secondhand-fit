import { NextResponse } from "next/server";

import { servingState } from "@/lib/tryon/guard";
import { readSessionId, sessionKey } from "@/lib/tryon/session";
import { describeAdapter, refreshFeatureCost } from "@/lib/youcam/adapter";
import { ledgerSummary } from "@/lib/youcam/ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/status — how the next try-on will be served (live | cache | precomputed | mock), the
 * unit budget band, the caller's fair-use allowance and the adapter pins: the V2 endpoints, the
 * Bearer API key auth model, the input limits, the documented error codes and the unit cost the API
 * reports (GET /s2s/v2.0/credit/feature-cost, live mode only, cached). Contains no secrets.
 */
export async function GET(req: Request) {
  await refreshFeatureCost();
  const adapter = describeAdapter();
  const ledger = ledgerSummary();
  const sessionId = readSessionId(req);
  const serving = servingState(sessionId ? sessionKey(sessionId) : null);
  return NextResponse.json({
    mode: serving.mode,
    modeDetail: serving.detail,
    providerMode: adapter.mode,
    mockReason: adapter.mockReason,
    budget: {
      band: ledger.band,
      budget: ledger.budget,
      spentEstimate: ledger.spent,
      baseline: ledger.baseline,
      remainingEstimate: ledger.remainingEstimate,
      note: "Spend is an estimate (YOUCAM_VTO_UNIT_COST per render) until observed unit cost is captured from live runs. adapter.featureCost is what the API's feature-cost endpoint reports; it is shown, not yet used by the guard.",
    },
    session: serving.session,
    calls: {
      live: ledger.liveCalls,
      mock: ledger.mockCalls,
      cache: ledger.cacheCalls,
      precomputed: ledger.precomputedCalls,
      released: ledger.releasedCalls,
      precomputedByReason: ledger.fallbackReasons,
    },
    adapter,
    generatedAt: new Date().toISOString(),
  });
}
