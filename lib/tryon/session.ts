/**
 * Anonymous buyer session: a random id in an httpOnly cookie, used only to match consent records
 * and to count try-ons for the per-session fair-use cap. The consent store and the ledger keep a
 * SHA-256 hash of the id, never the id itself.
 *
 * The cookie is first set by POST /api/consent, when the buyer accepts the consent statement.
 * Clearing cookies starts a new session with no consent; the unit budget is the hard limit, the
 * per-session cap is a fair-use limit.
 */

import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "sf_session";

const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;
const ID_PATTERN = /^[a-f0-9]{32}$/;

export function newSessionId(): string {
  return randomBytes(16).toString("hex");
}

function parseSessionId(value: string | null | undefined): string | null {
  return value && ID_PATTERN.test(value) ? value : null;
}

/** Reads the session id from a request's Cookie header. Anything malformed counts as no session. */
export function readSessionId(req: Request): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return parseSessionId(rest.join("="));
  }
  return null;
}

/** The hashed identifier the ledger keeps for a session id. */
export function sessionKey(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
}

/** Ledger key for a raw cookie value, or null when there is no valid session yet. */
export function sessionKeyFromCookie(value: string | null | undefined): string | null {
  const id = parseSessionId(value);
  return id ? sessionKey(id) : null;
}

export function sessionCookieOptions(req: Request) {
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: proto.startsWith("https"),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  };
}
