/**
 * Buyer consent records. POST /api/tryon refuses any request whose session has no record here for
 * the same listing at the current CONSENT_SCOPE_VERSION, before any provider call is made.
 *
 * Only hashed identifiers are kept: the hashed session key, and SHA-256 hashes of the client IP and
 * user agent. A record lapses after CONSENT_TTL_HOURS and is deleted when the buyer withdraws.
 *
 * In-memory for now (resets when the server process restarts, which only ever removes consent).
 * The Prisma-backed ConsentRecord table replaces the storage in a later build step. Server-only.
 */

import { createHash, randomBytes } from "node:crypto";

import {
  CONSENT_SCOPE_ITEMS,
  CONSENT_SCOPE_VERSION,
  CONSENT_TTL_HOURS,
  type ApiErrorResponse,
  type ConsentScopeId,
} from "./contracts";

const CONSENT_TTL_MS = CONSENT_TTL_HOURS * 60 * 60 * 1000;
const MAX_RECORDS = 5000;
const LISTING_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface ConsentRecord {
  id: string;
  /** Hashed anonymous session id (lib/tryon/session.ts). */
  sessionKey: string;
  /** Null when consent was given in the try-on runner without a listing. */
  listingId: string | null;
  scopeVersion: string;
  scopeAccepted: ConsentScopeId[];
  acceptedAt: number;
  ipHash: string;
  userAgentHash: string;
}

type ConsentStore = { records: Map<string, ConsentRecord> };
const g = globalThis as unknown as { __consentRecords?: ConsentStore };

function store(): ConsentStore {
  if (!g.__consentRecords) g.__consentRecords = { records: new Map() };
  return g.__consentRecords;
}

function recordKey(sessionKey: string, listingId: string | null): string {
  return `${sessionKey}|${listingId ?? ""}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function expired(record: ConsentRecord, now: number): boolean {
  return now - record.acceptedAt > CONSENT_TTL_MS;
}

function prune(now: number): void {
  const records = store().records;
  for (const [key, record] of records) if (expired(record, now)) records.delete(key);
  // Oldest first (Map keeps insertion order), so a flood of sessions drops the oldest consent.
  while (records.size > MAX_RECORDS) records.delete(records.keys().next().value as string);
}

export function consentExpiresAt(record: ConsentRecord): number {
  return record.acceptedAt + CONSENT_TTL_MS;
}

/** A listing id as sent by the client: null when absent, undefined when malformed. */
export function parseListingId(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && LISTING_ID_PATTERN.test(value) ? value : undefined;
}

/** True when `accepted` lists every scope item of the current consent statement. */
export function acceptsFullScope(accepted: unknown): accepted is ConsentScopeId[] {
  return Array.isArray(accepted) && CONSENT_SCOPE_ITEMS.every((item) => accepted.includes(item.id));
}

/** First address in X-Forwarded-For, or X-Real-IP; hashed before it is stored. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

/** Records consent at the current scope version, replacing any earlier record for the same listing. */
export function recordConsent(req: Request, sessionKey: string, listingId: string | null): ConsentRecord {
  const now = Date.now();
  prune(now);
  const record: ConsentRecord = Object.freeze({
    id: randomBytes(8).toString("hex"),
    sessionKey,
    listingId,
    scopeVersion: CONSENT_SCOPE_VERSION,
    scopeAccepted: CONSENT_SCOPE_ITEMS.map((item) => item.id),
    acceptedAt: now,
    ipHash: hash(clientIp(req)),
    userAgentHash: hash(req.headers.get("user-agent") ?? ""),
  });
  const key = recordKey(sessionKey, listingId);
  store().records.delete(key);
  store().records.set(key, record);
  return record;
}

/**
 * The session's consent record for this listing, only if it was made under the current scope
 * version and has not lapsed. Anything else counts as no consent.
 */
export function findCurrentConsent(sessionKey: string | null, listingId: string | null): ConsentRecord | null {
  if (!sessionKey) return null;
  const record = store().records.get(recordKey(sessionKey, listingId));
  if (!record) return null;
  if (record.scopeVersion !== CONSENT_SCOPE_VERSION || expired(record, Date.now())) {
    store().records.delete(recordKey(sessionKey, listingId));
    return null;
  }
  return record;
}

/** The 403 body sent when a try-on route finds no current consent; it names where to give it. */
export function consentRequiredError(listingId: string | null): ApiErrorResponse {
  return {
    error: `No current consent is recorded for this try-on (statement version ${CONSENT_SCOPE_VERSION}). Read and accept the consent statement first.`,
    code: "consent_required",
    consentUrl: listingId ? `/try?listing=${encodeURIComponent(listingId)}` : "/try",
  };
}

/** Deletes every consent record the session holds, for any listing. Returns how many were deleted. */
export function withdrawConsent(sessionKey: string): number {
  const records = store().records;
  let deleted = 0;
  for (const [key, record] of records) {
    if (record.sessionKey === sessionKey) {
      records.delete(key);
      deleted++;
    }
  }
  return deleted;
}
