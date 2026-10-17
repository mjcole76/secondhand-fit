import { NextResponse } from "next/server";

import { YouCamError, checkTask, getYouCamConfig, type TaskHandle } from "@/lib/youcam/adapter";
import { consentRequiredError, findCurrentConsent } from "@/lib/tryon/consent";
import { issuePrecomputedRender, providerErrorFallback } from "@/lib/tryon/guard";
import { renderBadge } from "@/lib/tryon/honesty";
import { decodeRenderId } from "@/lib/tryon/render-id";
import { rememberResultUrl } from "@/lib/tryon/result-cache";
import { readSessionId, sessionKey } from "@/lib/tryon/session";
import {
  PREVIEW_ONLY_LABEL,
  SERVING_MODES,
  type ApiErrorResponse,
  type FallbackOffer,
  type TryOnStatusResponse,
} from "@/lib/tryon/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A labelled precomputed run offered when a task that was created then failed or timed out. */
function offerPrecomputed(req: Request, feature: string, providerMessage?: string): FallbackOffer {
  const sessionId = readSessionId(req);
  const offerId = issuePrecomputedRender(feature, sessionId ? sessionKey(sessionId) : null, "provider_error");
  return {
    renderId: offerId,
    resultUrl: `/api/tryon/${offerId}/image`,
    fallback: providerErrorFallback(providerMessage, "poll"),
  };
}

/**
 * GET /api/tryon/[renderId]
 *
 * Bounded polling proxy. Each call performs at most one provider status check and reports an
 * honest state: queued | generating | succeeded | timeout | failed. The hard timeout is measured
 * from task creation, so a client cannot poll forever. A failed or timed-out render comes with an
 * offer of the labelled precomputed run.
 *
 * Before any provider status call, the session must still hold current consent for the listing
 * signed into the render id; withdrawn, lapsed or outdated consent gets 403 consent_required.
 * Precomputed runs make no provider call and are not checked.
 */
export async function GET(req: Request, ctx: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await ctx.params;
  const ticket = decodeRenderId(renderId);
  if (!ticket) {
    return NextResponse.json<ApiErrorResponse>({ error: "Render not found.", code: "not_found" }, { status: 404 });
  }

  const cfg = getYouCamConfig();
  const elapsedMs = Date.now() - ticket.c;
  const base = {
    renderId,
    mode: ticket.m,
    live: SERVING_MODES[ticket.m].live,
    modeLabel: SERVING_MODES[ticket.m].label,
    elapsedMs,
    timeoutMs: cfg.pollTimeoutMs,
    pollAfterMs: cfg.pollIntervalMs,
    label: PREVIEW_ONLY_LABEL,
    badge: renderBadge(ticket),
  };

  if (ticket.m === "precomputed") {
    const body: TryOnStatusResponse = { ...base, status: "succeeded", resultUrl: `/api/tryon/${renderId}/image` };
    return NextResponse.json(body);
  }

  const listingId = ticket.l ?? null;
  const sessionId = readSessionId(req);
  if (!findCurrentConsent(sessionId ? sessionKey(sessionId) : null, listingId)) {
    return NextResponse.json<ApiErrorResponse>(consentRequiredError(listingId), { status: 403 });
  }

  const handle: TaskHandle = { taskId: ticket.t, feature: ticket.f, createdAt: ticket.c, mode: ticket.m };

  try {
    const status = await checkTask(handle, cfg);

    if (status.state === "succeeded" && status.resultUrl) {
      rememberResultUrl(renderId, status.resultUrl);
      const body: TryOnStatusResponse = {
        ...base,
        status: "succeeded",
        providerStatus: status.providerStatus,
        resultUrl: `/api/tryon/${renderId}/image`,
      };
      return NextResponse.json(body);
    }

    if (status.state === "failed") {
      const body: TryOnStatusResponse = {
        ...base,
        status: "failed",
        providerStatus: status.providerStatus,
        error: status.error ?? "The provider reported that the render failed.",
        fallbackOffer: offerPrecomputed(req, ticket.f, status.error),
      };
      return NextResponse.json(body);
    }

    if (elapsedMs >= cfg.pollTimeoutMs) {
      const error = `The render did not finish within ${Math.round(cfg.pollTimeoutMs / 1000)} seconds.`;
      const body: TryOnStatusResponse = {
        ...base,
        status: "timeout",
        providerStatus: status.providerStatus,
        error,
        fallbackOffer: offerPrecomputed(req, ticket.f, error),
      };
      return NextResponse.json(body);
    }

    const body: TryOnStatusResponse = {
      ...base,
      status: status.state === "queued" ? "queued" : "generating",
      providerStatus: status.providerStatus,
      pollAfterMs: Math.min(status.pollingIntervalMs ?? cfg.pollIntervalMs, 5_000),
    };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof YouCamError) {
      if (err.retryable && elapsedMs < cfg.pollTimeoutMs) {
        const body: TryOnStatusResponse = { ...base, status: "generating", transientError: err.message };
        return NextResponse.json(body);
      }
      // A documented error_code carries its own user-facing message; otherwise the provider's reason.
      const error = err.errorCode ? err.message : (err.providerMessage ?? err.message);
      const body: TryOnStatusResponse = {
        ...base,
        status: elapsedMs >= cfg.pollTimeoutMs ? "timeout" : "failed",
        error,
        fallbackOffer: offerPrecomputed(req, ticket.f, err.providerMessage ?? err.message),
      };
      return NextResponse.json(body);
    }
    console.error("tryon status: unexpected error", err instanceof Error ? err.message : err);
    return NextResponse.json<ApiErrorResponse>(
      { error: "Could not read the render status.", code: "server_error" },
      { status: 500 },
    );
  }
}
