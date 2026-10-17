import { NextResponse } from "next/server";

import { findPublishedListing } from "@/lib/listings/published";
import {
  acceptsFullScope,
  consentExpiresAt,
  findCurrentConsent,
  parseListingId,
  recordConsent,
  withdrawConsent,
} from "@/lib/tryon/consent";
import {
  CONSENT_SCOPE_VERSION,
  type ApiErrorResponse,
  type ConsentRequest,
  type ConsentStatusResponse,
} from "@/lib/tryon/contracts";
import {
  SESSION_COOKIE,
  newSessionId,
  readSessionId,
  sessionCookieOptions,
  sessionKey as hashSessionId,
} from "@/lib/tryon/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(status: number, code: ApiErrorResponse["code"], error: string) {
  return NextResponse.json<ApiErrorResponse>({ error, code }, { status });
}

function notConsented(listingId: string | null): ConsentStatusResponse {
  return { consented: false, scopeVersion: CONSENT_SCOPE_VERSION, listingId };
}

/**
 * POST /api/consent
 * JSON: { listingId?, scopeVersion, accepted: ConsentScopeId[] }
 *
 * Records the buyer's consent for this session and listing at the current scope version. The
 * statement version and every scope item must match what the server currently shows, otherwise
 * nothing is recorded. Starts the anonymous session if there is none yet.
 */
export async function POST(req: Request) {
  let body: Partial<ConsentRequest>;
  try {
    body = (await req.json()) as Partial<ConsentRequest>;
  } catch {
    return errorResponse(400, "bad_request", "Expected a JSON body.");
  }

  const listingId = parseListingId(body.listingId);
  if (listingId === undefined) return errorResponse(400, "bad_request", "The listing id is not valid.");
  if (listingId !== null && !findPublishedListing(listingId)) {
    return errorResponse(404, "not_found", "That listing is not published, so there is nothing to try on.");
  }
  if (body.scopeVersion !== CONSENT_SCOPE_VERSION) {
    return errorResponse(
      409,
      "consent_required",
      "The consent statement has changed since this page was opened. Reload the page and read it again.",
    );
  }
  if (!acceptsFullScope(body.accepted)) {
    return errorResponse(400, "consent_required", "Every part of the consent statement needs to be accepted.");
  }

  const existingSessionId = readSessionId(req);
  const sessionId = existingSessionId ?? newSessionId();
  const record = recordConsent(req, hashSessionId(sessionId), listingId);

  const res = NextResponse.json<ConsentStatusResponse>({
    consented: true,
    scopeVersion: record.scopeVersion,
    listingId,
    acceptedAt: record.acceptedAt,
    expiresAt: consentExpiresAt(record),
  });
  if (!existingSessionId) res.cookies.set(SESSION_COOKIE, sessionId, sessionCookieOptions(req));
  return res;
}

/** GET /api/consent?listingId= — whether this session holds current consent for the listing. */
export async function GET(req: Request) {
  const listingId = parseListingId(new URL(req.url).searchParams.get("listingId"));
  if (listingId === undefined) return errorResponse(400, "bad_request", "The listing id is not valid.");

  const sessionId = readSessionId(req);
  const record = findCurrentConsent(sessionId ? hashSessionId(sessionId) : null, listingId);
  if (!record) return NextResponse.json(notConsented(listingId));
  return NextResponse.json<ConsentStatusResponse>({
    consented: true,
    scopeVersion: record.scopeVersion,
    listingId,
    acceptedAt: record.acceptedAt,
    expiresAt: consentExpiresAt(record),
  });
}

/** DELETE /api/consent — withdraws consent: deletes every consent record this session holds. */
export async function DELETE(req: Request) {
  const listingId = parseListingId(new URL(req.url).searchParams.get("listingId")) ?? null;
  const sessionId = readSessionId(req);
  const deleted = sessionId ? withdrawConsent(hashSessionId(sessionId)) : 0;
  return NextResponse.json<ConsentStatusResponse>({ ...notConsented(listingId), deleted });
}
