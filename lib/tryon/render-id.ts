/**
 * Opaque, tamper-evident render ids.
 *
 * The browser only ever sees `renderId`. It encodes the provider task handle plus the start time
 * and mode, signed with HMAC-SHA256, so the polling route can re-derive the task without a
 * database and without exposing provider identifiers unsigned. Once Prisma lands, the id can
 * become a plain database key; the API contract does not change.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { CheckId, CheckReason } from "@/lib/readiness/contracts";
import type { ReadinessGrade } from "@/lib/readiness/grade";

export type RenderMode = "live" | "mock" | "precomputed";

export type GradeSource = "listing" | "sent_lower" | "sent";

export interface RenderTicket {
  v: 1;
  /** Provider task id (or a synthetic id for precomputed runs). */
  t: string;
  /** Feature slug the task was created under. */
  f: string;
  /** Task creation time (ms since epoch). */
  c: number;
  m: RenderMode;
  /** Estimated units recorded in the ledger for this render. */
  u: number;
  /**
   * Readiness grade of the garment photo when the render was requested, with the check that
   * decided it and why. Absent when the photo was not graded. Signed with the rest of the ticket,
   * so the badge on a render cannot be edited from the browser.
   */
  g?: ReadinessGrade;
  k?: CheckId;
  r?: CheckReason;
  /**
   * Where the grade came from: inherited from the published listing, or read off the garment image
   * sent for the render (alone, or because it graded lower than the listing). Absent on older ids,
   * which were always graded on the image sent.
   */
  s?: GradeSource;
  /**
   * Published listing the buyer consented for when the render was requested. Absent when the
   * try-on had no listing. The polling route checks the session's consent for it again.
   */
  l?: string;
  /** Random nonce so identical tickets do not collide. */
  n: string;
}

const g = globalThis as unknown as { __renderIdFallbackSecret?: string };

function secret(): string {
  const configured = process.env.RENDER_ID_SECRET?.trim();
  if (configured) return configured;
  if (!g.__renderIdFallbackSecret) g.__renderIdFallbackSecret = randomBytes(32).toString("hex");
  return g.__renderIdFallbackSecret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

export function encodeRenderId(ticket: Omit<RenderTicket, "v" | "n">): string {
  const full: RenderTicket = { v: 1, n: randomBytes(6).toString("hex"), ...ticket };
  const payload = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${payload}.${sign(payload)}`;
}

export function decodeRenderId(renderId: string): RenderTicket | null {
  const [payload, sig] = renderId.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RenderTicket;
    if (parsed.v !== 1 || typeof parsed.t !== "string" || typeof parsed.c !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}
