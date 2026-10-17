"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  CONSENT_SCOPE_ITEMS,
  CONSENT_SCOPE_VERSION,
  type ApiErrorResponse,
  type ConsentRequest,
  type ConsentScopeId,
  type ConsentStatusResponse,
} from "@/lib/tryon/contracts";

interface Props {
  listingId: string | null;
  listingTitle: string | null;
  /** Shown above the statement, e.g. when the server refused a try-on for lack of consent. */
  notice?: string | null;
  onConsented: (status: ConsentStatusResponse) => void;
}

/**
 * The consent statement shown before any camera or file picker. Accepting records consent on the
 * server (POST /api/consent); the try-on form only appears once the server has confirmed it, and
 * POST /api/tryon checks the record again on every request.
 */
export function ConsentGate({ listingId, listingTitle, notice, onConsented }: Props) {
  const [accepted, setAccepted] = useState<Set<ConsentScopeId>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const allAccepted = CONSENT_SCOPE_ITEMS.every((item) => accepted.has(item.id));
  const declineHref = listingId ? `/listings/${encodeURIComponent(listingId)}` : "/listings";

  function toggle(id: ConsentScopeId, on: boolean) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allAccepted || busy) return;
    setBusy(true);
    setError(null);
    const body: ConsentRequest = { listingId, scopeVersion: CONSENT_SCOPE_VERSION, accepted: [...accepted] };
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as ApiErrorResponse | null;
        setError(err?.error ?? `Your consent could not be recorded (HTTP ${res.status}).`);
        return;
      }
      onConsented((await res.json()) as ConsentStatusResponse);
    } catch {
      setError("Could not reach the server to record your consent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card consent-gate" onSubmit={onSubmit} aria-labelledby="consent-heading">
      <h2 id="consent-heading" ref={headingRef} tabIndex={-1}>
        Before you try it on
      </h2>
      {listingTitle ? (
        <p>
          Try-on for <strong>{listingTitle}</strong>.
        </p>
      ) : null}
      {notice ? (
        <div className="banner warn" role="alert">
          {notice}
        </div>
      ) : null}
      <p className="muted">
        Read each part and tick it to agree. Nothing is uploaded and no camera or file picker opens until you
        agree. Statement version {CONSENT_SCOPE_VERSION}.
      </p>

      <div className="consent-items">{CONSENT_SCOPE_ITEMS.map((item) => (
        <div className="consent-item" key={item.id}>
          <h3 id={`consent-${item.id}-heading`}>{item.heading}</h3>
          <p id={`consent-${item.id}-text`}>{item.text}</p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={accepted.has(item.id)}
              disabled={busy}
              onChange={(ev) => toggle(item.id, ev.target.checked)}
              aria-describedby={`consent-${item.id}-text`}
            />
            <span>{item.accept}</span>
          </label>
        </div>
      ))}</div>

      {error ? (
        <div className="banner bad" role="alert" ref={errorRef} tabIndex={-1}>
          {error}
        </div>
      ) : null}

      <p>
        <button type="submit" disabled={busy || !allAccepted}>
          {busy ? "Recording…" : "Agree and choose photos"}
        </button>{" "}
        <Link href={declineHref}>No thanks, go back</Link>
      </p>
      {!allAccepted ? (
        <p className="muted">
          {CONSENT_SCOPE_ITEMS.length - accepted.size} of {CONSENT_SCOPE_ITEMS.length} parts still to agree to.
        </p>
      ) : null}
    </form>
  );
}
