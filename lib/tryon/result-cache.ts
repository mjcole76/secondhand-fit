/**
 * Short-lived in-memory cache of provider result URLs keyed by render id, so the image proxy route
 * does not need to re-poll the provider on every request. Best-effort only: on a cold instance the
 * proxy falls back to one status check.
 */

interface CachedResult {
  resultUrl: string;
  storedAt: number;
}

const TTL_MS = 30 * 60 * 1000;
const g = globalThis as unknown as { __renderResultCache?: Map<string, CachedResult> };

function map(): Map<string, CachedResult> {
  if (!g.__renderResultCache) g.__renderResultCache = new Map();
  return g.__renderResultCache;
}

export function rememberResultUrl(renderId: string, resultUrl: string): void {
  map().set(renderId, { resultUrl, storedAt: Date.now() });
}

export function recallResultUrl(renderId: string): string | undefined {
  const hit = map().get(renderId);
  if (!hit) return undefined;
  if (Date.now() - hit.storedAt > TTL_MS) {
    map().delete(renderId);
    return undefined;
  }
  return hit.resultUrl;
}
