"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ConsentGate } from "@/components/ConsentGate";
import { ModeBanner } from "@/components/ModeBanner";
import { RenderPreview } from "@/components/RenderPreview";
import { SelfieCapture } from "@/components/SelfieCapture";
import {
  GARMENT_GRID_FIELD,
  LISTING_ID_FIELD,
  PREVIEW_ONLY_LABEL,
  TRYON_START_LIMIT_MS,
  TRYON_STREAM_MEDIA_TYPE,
  type ApiErrorResponse,
  type ConsentStatusResponse,
  type FallbackOffer,
  type ServingState,
  type StageTimestamp,
  type TryOnCreateResponse,
  type TryOnStatusResponse,
  type TryOnStreamEvent,
} from "@/lib/tryon/contracts";
import { garmentAnalysisGrid } from "@/lib/tryon/garment-grid";
import { renderBadge } from "@/lib/tryon/honesty";
import type { BrowserSelfie } from "@/lib/tryon/selfie-capture";
import { saveToWatchlist } from "@/lib/tryon/watchlist";

type Phase = "idle" | "submitting" | "polling" | "finishing" | "succeeded" | "failed" | "timeout";

interface Props {
  /** How the next try-on will be served, as computed by the server when the page was rendered. */
  serving: ServingState;
  timeoutMs: number;
  /** Published listing the try-on is for, or null when the runner is opened on its own. */
  listingId: string | null;
  listingTitle: string | null;
  listingImageUrl: string | null;
  /** This session's consent for the listing, as the server saw it when the page was rendered. */
  initialConsent: ConsentStatusResponse;
}

type RowKey = StageTimestamp["stage"] | "generating" | "finishing" | "succeeded";

/**
 * Every row is marked only when something real happens: the server streams the stages up to the
 * queued task as it starts them, the status proxy reports generating and success, and the browser
 * marks the last two when it starts and finishes loading the labelled image. Nothing advances on
 * a timer.
 */
const STAGE_ROWS: { key: RowKey; label: string }[] = [
  { key: "validating", label: "Checking both images" },
  { key: "uploading_garment", label: "Uploading the garment image" },
  { key: "uploading_photo", label: "Uploading your photo" },
  { key: "task_created", label: "Try-on task queued" },
  { key: "generating", label: "Generating the render" },
  { key: "finishing", label: "Finishing: fetching the render and adding its label" },
  { key: "succeeded", label: "Preview on screen" },
];
const ROW_ORDER = STAGE_ROWS.map((r) => r.key);
const ROW_LABEL = Object.fromEntries(STAGE_ROWS.map((r) => [r.key, r.label])) as Record<RowKey, string>;

/** Extra wait past the server's render timeout before the browser stops waiting on its own. */
const CLIENT_GRACE_MS = 15_000;
/** Longest one status check may take. */
const POLL_REQUEST_LIMIT_MS = 15_000;
/** Longest the finished render's labelled image may take to load. */
const FINISH_LIMIT_MS = 30_000;

const seconds = (ms: number) => Math.round(ms / 1000);

async function fetchWithLimit(url: string, signal: AbortSignal, limitMs: number): Promise<Response> {
  const local = new AbortController();
  const onAbort = () => local.abort();
  signal.addEventListener("abort", onAbort);
  const timer = window.setTimeout(() => local.abort(), limitMs);
  try {
    return await fetch(url, { cache: "no-store", signal: local.signal });
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

type StartAnswer = { httpStatus: number; body: TryOnCreateResponse | ApiErrorResponse | null };

/**
 * POST /api/tryon asking for the streamed form, reporting each server stage as its line arrives.
 * Resolves with the final status and body; httpStatus 0 means the stream ended without one.
 */
async function requestStart(
  form: FormData,
  signal: AbortSignal,
  onStage: (stage: StageTimestamp["stage"]) => void,
): Promise<StartAnswer> {
  const res = await fetch("/api/tryon", {
    method: "POST",
    body: form,
    signal,
    headers: { Accept: `${TRYON_STREAM_MEDIA_TYPE}, application/json` },
  });

  if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes(TRYON_STREAM_MEDIA_TYPE)) {
    const body = (await res.json().catch(() => null)) as TryOnCreateResponse | ApiErrorResponse | null;
    if (res.ok && body && "stages" in body) for (const s of body.stages) onStage(s.stage);
    return { httpStatus: res.status, body };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      let event: TryOnStreamEvent;
      try {
        event = JSON.parse(line) as TryOnStreamEvent;
      } catch {
        continue;
      }
      if (event.type === "stage") onStage(event.stage);
      else if (event.type === "done") {
        void reader.cancel().catch(() => {});
        return { httpStatus: event.httpStatus, body: event.body };
      }
    }
    if (done) return { httpStatus: 0, body: null };
  }
}

export function TryOnRunner({ serving: initialServing, timeoutMs, listingId, listingTitle, listingImageUrl, initialConsent }: Props) {
  const [serving, setServing] = useState<ServingState>(initialServing);
  const [pendingOffer, setPendingOffer] = useState<FallbackOffer | null>(null);
  const [listingPhotoError, setListingPhotoError] = useState<string | null>(null);
  const [photoRetry, setPhotoRetry] = useState(0);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [acceptedOffer, setAcceptedOffer] = useState<FallbackOffer | null>(null);
  const [garment, setGarment] = useState<File | null>(null);
  const [selfie, setSelfie] = useState<BrowserSelfie | null>(null);
  const [garmentPreview, setGarmentPreview] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentStatusResponse>(initialConsent);
  const [consentNotice, setConsentNotice] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [created, setCreated] = useState<TryOnCreateResponse | null>(null);
  const [status, setStatus] = useState<TryOnStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retake, setRetake] = useState<string[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [saved, setSaved] = useState<"no" | "yes" | "failed">("no");
  /** When each stage was reached, in ms since the try-on started. */
  const [reached, setReached] = useState<Partial<Record<RowKey, number>>>({});
  /** Stages that started and did not complete. */
  const [stopped, setStopped] = useState<RowKey[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");
  const reachedRef = useRef<Set<RowKey>>(new Set());
  const lastStageRef = useRef<RowKey | null>(null);
  const finishTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!garment) {
      setGarmentPreview(null);
      return;
    }
    const url = URL.createObjectURL(garment);
    setGarmentPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [garment]);

  useEffect(() => {
    if (!selfie) { setPersonPreview(null); return; }
    const url = URL.createObjectURL(selfie.blob);
    setPersonPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [selfie]);

  useEffect(() => {
    if (!consent.consented || !listingImageUrl) return;
    const controller = new AbortController();
    setListingPhotoError(null);
    setGarment(null);
    void fetch(listingImageUrl, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Listing image unavailable");
        const blob = await res.blob();
        if (!blob.type.startsWith("image/")) throw new Error("Invalid image");
        if (!controller.signal.aborted) setGarment(new File([blob], "listing-garment.png", { type: blob.type }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setListingPhotoError("The listing photo could not be loaded. It may have expired. Retry or return to the listing.");
      });
    return () => controller.abort();
  }, [consent.consented, listingImageUrl, photoRetry]);

  useEffect(() => {
    if (phase !== "submitting" && phase !== "polling" && phase !== "finishing") return;
    const id = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    },
    [],
  );

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  /** The counter ticks every half second; this pins it to the moment the run actually ended. */
  function freezeElapsed() {
    setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
  }

  function clearFinishTimer() {
    if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
    finishTimerRef.current = null;
  }

  /** Marks a stage as reached, once, and announces it. */
  function enter(key: RowKey, spoken?: string) {
    if (reachedRef.current.has(key)) return;
    reachedRef.current.add(key);
    const at = Date.now() - startedAtRef.current;
    setReached((prev) => ({ ...prev, [key]: at }));
    if (lastStageRef.current === null || ROW_ORDER.indexOf(key) > ROW_ORDER.indexOf(lastStageRef.current)) {
      lastStageRef.current = key;
    }
    setAnnouncement(spoken ?? `${ROW_LABEL[key]}.`);
  }

  /** Ends the run as failed or timed out; the stage in progress is marked as not completed. */
  function stop(next: "failed" | "timeout", message: string, retakeSteps?: string[]) {
    clearFinishTimer();
    freezeElapsed();
    const at = lastStageRef.current;
    if (at) setStopped((prev) => (prev.includes(at) ? prev : [...prev, at]));
    setError(message);
    setRetake(retakeSteps && retakeSteps.length > 0 ? retakeSteps : null);
    go(next);
    setAnnouncement(`${next === "timeout" ? "Timed out" : "Failed"}. ${message}`);
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    clearFinishTimer();
    reachedRef.current = new Set();
    lastStageRef.current = null;
    go("idle");
    setCreated(null);
    setStatus(null);
    setAcceptedOffer(null);
    setPendingOffer(null);
    setError(null);
    setRetake(null);
    setElapsed(0);
    setReached({});
    setStopped([]);
    setAnnouncement("");
    setSaved("no");
  }

  function showOffer(offer: FallbackOffer) {
    setAcceptedOffer(offer);
    setSaved("no");
    setAnnouncement("A precomputed example render is shown. This is not a live result.");
  }

  /** The render exists; what is left is loading its labelled image, which is bounded too. */
  function beginFinishing() {
    go("finishing");
    enter("finishing");
    clearFinishTimer();
    finishTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== "finishing") return;
      stop("timeout", `The render finished, but its labelled image did not load within ${seconds(FINISH_LIMIT_MS)} s.`);
    }, FINISH_LIMIT_MS);
  }

  function onResultImage(state: "ready" | "unavailable", precomputed: boolean) {
    const current = phaseRef.current;
    const finishing = current === "finishing" || (current === "timeout" && lastStageRef.current === "finishing");
    if (!finishing) return;
    if (state === "ready") {
      // A late image still counts: the run did produce it, so it is shown as done, not as timed out.
      clearFinishTimer();
      freezeElapsed();
      setStopped((prev) => prev.filter((k) => k !== "finishing"));
      setError(null);
      go("succeeded");
      enter(
        "succeeded",
        precomputed
          ? "A precomputed example render is shown. This is not a live result."
          : "Preview on screen. This is an AI-generated preview only.",
      );
    } else if (current === "finishing") {
      stop("failed", "The render finished, but its labelled image could not be loaded.");
    }
  }

  async function pollUntilDone(renderId: string, firstDelayMs: number, serverTimeoutMs: number, signal: AbortSignal) {
    // The server reports a timeout once its own limit passes. This is the browser's backstop for a
    // server that stops answering, so the wait can never be open-ended.
    const limitMs = serverTimeoutMs + CLIENT_GRACE_MS;
    const deadline = Date.now() + limitMs;
    let delay = Math.max(500, firstDelayMs);

    while (!signal.aborted) {
      await new Promise((r) => setTimeout(r, Math.max(0, Math.min(delay, deadline - Date.now()))));
      if (signal.aborted) return;
      if (Date.now() >= deadline) {
        stop("timeout", `No final answer about the render within ${seconds(limitMs)} s, so this page stopped waiting.`);
        return;
      }

      let body: TryOnStatusResponse;
      try {
        const res = await fetchWithLimit(`/api/tryon/${encodeURIComponent(renderId)}`, signal, POLL_REQUEST_LIMIT_MS);
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as ApiErrorResponse | null;
          if (err?.code === "consent_required") {
            // Consent was withdrawn or lapsed while the render was running: the server stopped checking it.
            returnToConsentGate(`The try-on was stopped. ${err.error}`);
            return;
          }
          stop("failed", err?.error ?? `Status check failed (HTTP ${res.status}).`);
          return;
        }
        body = (await res.json()) as TryOnStatusResponse;
      } catch {
        if (signal.aborted) return;
        setAnnouncement("Could not reach the server to check progress; trying again.");
        delay = Math.min(delay * 2, 5000);
        continue;
      }
      setStatus(body);

      if (body.status === "succeeded") {
        beginFinishing();
        return;
      }
      if (body.status === "failed") {
        stop("failed", body.error ?? "The render failed.");
        return;
      }
      if (body.status === "timeout") {
        stop("timeout", body.error ?? "The render did not finish in time.");
        return;
      }
      if (body.status === "generating") enter("generating");
      if (body.transientError) setAnnouncement(`Still generating. ${body.transientError}`);
      delay = Math.max(500, body.pollAfterMs || delay);
    }
  }

  /** Back to the consent statement: the chosen images are dropped, nothing has been uploaded. */
  function returnToConsentGate(notice: string | null) {
    reset();
    setGarment(null);
    setSelfie(null);
    setConsent({ consented: false, scopeVersion: consent.scopeVersion, listingId });
    setConsentNotice(notice);
  }

  async function withdraw() {
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const query = listingId ? `?listingId=${encodeURIComponent(listingId)}` : "";
      const res = await fetch(`/api/consent${query}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      returnToConsentGate("Your consent was withdrawn and its record deleted. No try-on can run until you agree again.");
    } catch {
      setWithdrawError("Your consent could not be withdrawn. Please try again.");
    } finally {
      setWithdrawing(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!garment || !selfie || !consent.consented) return;

    abortRef.current?.abort();
    clearFinishTimer();
    const controller = new AbortController();
    abortRef.current = controller;

    startedAtRef.current = Date.now();
    reachedRef.current = new Set();
    lastStageRef.current = null;
    setReached({});
    setStopped([]);
    setElapsed(0);
    setError(null);
    setRetake(null);
    setStatus(null);
    setCreated(null);
    setAcceptedOffer(null);
    setPendingOffer(null);
    setSaved("no");
    go("submitting");
    enter("validating");

    const form = new FormData();
    form.set("garment", garment);
    // The checked copy from SelfieCapture: upright, scaled down, re-encoded without metadata.
    form.set("person", selfie.blob, "person.jpg");
    // Consent itself is not sent: the server looks up this session's record for the listing.
    if (listingId) form.set(LISTING_ID_FIELD, listingId);

    // The server grades the garment photo from this small analysis grid and signs the grade into
    // the render id. If the photo cannot be read here, the render's badge says it was not graded.
    try {
      form.set(GARMENT_GRID_FIELD, JSON.stringify(await garmentAnalysisGrid(garment)));
    } catch {
      // No grid, no grade. The server still validates the image itself.
    }
    if (controller.signal.aborted) return;

    let startTimedOut = false;
    const startTimer = window.setTimeout(() => {
      startTimedOut = true;
      controller.abort();
    }, TRYON_START_LIMIT_MS);

    let answer: StartAnswer;
    try {
      answer = await requestStart(form, controller.signal, (stage) => enter(stage));
    } catch {
      if (startTimedOut) {
        stop(
          "timeout",
          `The server did not confirm the try-on task within ${seconds(TRYON_START_LIMIT_MS)} s, so this page stopped waiting. If the task was created after that, its API units were still spent.`,
        );
        return;
      }
      if (controller.signal.aborted) return;
      stop("failed", "Could not reach the server to start the try-on.");
      return;
    } finally {
      window.clearTimeout(startTimer);
    }

    if (answer.httpStatus === 0 || !answer.body) {
      stop(
        "failed",
        "The server stopped answering before it confirmed the try-on task. If the task was created, its API units were spent.",
      );
      return;
    }

    if (answer.httpStatus !== 200 || !("renderId" in answer.body)) {
      const err = answer.body as ApiErrorResponse;
      if (err.code === "consent_required") {
        // The server holds no current consent record (lapsed, withdrawn, or the statement changed).
        returnToConsentGate(`The try-on was not started. ${err.error}`);
        return;
      }
      if (err.code === "start_timeout") {
        stop("timeout", err.error);
        return;
      }
      stop("failed", err.error ?? `The try-on could not start (HTTP ${answer.httpStatus}).`, err.retake);
      return;
    }

    const body = answer.body;
    setCreated(body);
    setServing(body.serving);

    if (body.status === "succeeded") {
      // Keep a budget/provider fallback as an offer until the buyer explicitly chooses it.
      if (body.mode === "precomputed" && body.fallback) {
        setPendingOffer({ renderId: body.renderId, resultUrl: `/api/tryon/${encodeURIComponent(body.renderId)}/image`, fallback: body.fallback });
        stop("failed", body.fallback.message);
      } else {
        setStatus({ ...body, elapsedMs: 0, resultUrl: `/api/tryon/${encodeURIComponent(body.renderId)}/image` });
        beginFinishing();
      }
      return;
    }

    enter("task_created");
    go("polling");
    await pollUntilDone(body.renderId, body.pollAfterMs, body.timeoutMs, controller.signal);
  }

  const busy = phase === "submitting" || phase === "polling" || phase === "finishing";
  const timeoutSeconds = seconds(created?.timeoutMs || timeoutMs);
  const startSeconds = seconds(TRYON_START_LIMIT_MS);
  const latestIndex = ROW_ORDER.reduce((max, key, i) => (reached[key] !== undefined ? i : max), -1);

  // An accepted precomputed offer replaces the failed render on screen and is labelled as such.
  const offer = phase === "failed" || phase === "timeout" ? pendingOffer ?? status?.fallbackOffer : undefined;
  const fallback = acceptedOffer?.fallback;
  const result = acceptedOffer
    ? {
        renderId: acceptedOffer.renderId,
        url: acceptedOffer.resultUrl,
        mode: "precomputed" as const,
        label: PREVIEW_ONLY_LABEL,
        badge: renderBadge({ m: "precomputed" }),
      }
    : status?.status === "succeeded" && status.resultUrl
      ? {
          renderId: status.renderId,
          url: status.resultUrl,
          mode: status.mode,
          label: status.label || PREVIEW_ONLY_LABEL,
          badge: status.badge,
        }
      : null;

  function saveResult() {
    if (!result) return;
    const ok = saveToWatchlist({
      renderId: result.renderId,
      mode: result.mode,
      badge: result.badge,
      savedAt: Date.now(),
      ...(listingId ? { listingId, listingTitle: listingTitle ?? undefined } : {}),
    });
    setSaved(ok ? "yes" : "failed");
    setAnnouncement(ok ? "Preview saved to your watchlist." : "The preview could not be saved in this browser.");
  }

  return (
    <div className="try-studio">
      <div className="studio-status">
        <ModeBanner heading="Next preview" mode={serving.mode} />
        <span className="muted">{serving.session.remaining} of {serving.session.cap} previews left this session</span>
        <details><summary>Usage details</summary><p>{serving.detail}</p><p>The allowance resets on a rolling {serving.session.windowHours}-hour window. When live service is unavailable, an example is offered for you to choose.</p></details>
      </div>
      <div className="sr-only" aria-live="polite">{announcement}</div>
      {!consent.consented ? (
        <ConsentGate listingId={listingId} listingTitle={listingTitle} notice={consentNotice}
          onConsented={(next) => { setConsent(next); setConsentNotice(null); setWithdrawError(null); setAnnouncement("Consent recorded. Choose your photos."); }} />
      ) : (
        <div className="try-workspace">
          <div className="try-inputs">
            <div className="panel-heading"><span className="eyebrow">01 / Your images</span><span className="muted">JPEG · PNG · WebP</span></div>
            <form onSubmit={onSubmit} className="card input-card">
              <div className="source-grid">
                <div className="garment-source">
                  <label htmlFor="garment">{listingTitle ?? "The garment"}</label>
                  {garmentPreview ? <img className="preview-thumb source-image" src={garmentPreview} alt="Garment image selected for this preview" /> : <div className="photo-empty"><span aria-hidden="true">↥</span><p>{listingImageUrl && !listingPhotoError ? "Loading listing photo" : "Start with a clear garment photo"}</p></div>}
                  {listingImageUrl ? <p className="muted source-note">Photo from this listing</p> : <input id="garment" name="garment" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(ev) => { reset(); setGarment(ev.target.files?.[0] ?? null); }} />}
                  {listingPhotoError ? <div className="banner bad" role="alert"><p>{listingPhotoError}</p><button type="button" className="secondary" onClick={() => setPhotoRetry((n) => n + 1)}>Retry photo</button></div> : null}
                </div>
                <SelfieCapture disabled={busy} onChange={(photo) => { reset(); setSelfie(photo); }} />
              </div>
              <div className="studio-submit"><button type="submit" disabled={busy || !garment || !selfie}>{busy ? "Creating preview…" : "Create preview ↗"}</button>{phase !== "idle" ? <button type="button" className="secondary" onClick={reset}>{busy ? "Cancel wait" : "Clear result"}</button> : null}</div>
              <p className="muted">{!garment ? "Choose a garment image to begin." : !selfie ? "Add a photo of you to continue." : "Both images are ready. One preview is created per request."}</p>
              {busy ? <p className="muted">Cancelling stops this page waiting. An API task already started may still use units.</p> : null}
            </form>
            <details className="consent-record"><summary>Consent recorded · privacy and controls</summary><p>Both images are sent to the Perfect Corp. YouCam Apparel Virtual Try-On API each time you create a preview. Statement {consent.scopeVersion}.</p><p>{consent.expiresAt ? `Consent expires ${new Date(consent.expiresAt).toLocaleString()}.` : ""} <Link href="/methods">Read the methods and scope</Link>.</p><button type="button" className="secondary" disabled={busy || withdrawing} onClick={withdraw}>{withdrawing ? "Withdrawing…" : "Withdraw consent"}</button>{withdrawError ? <p role="alert">{withdrawError}</p> : null}</details>
            {listingId ? <Link className="back-to-listing" href={`/listings/${encodeURIComponent(listingId)}`}>← View listing details</Link> : <Link className="back-to-listing" href="/listings">Browse another piece →</Link>}
          </div>
          <section className="try-output" aria-label="Result" aria-busy={busy}>
            <div className="panel-heading"><span className="eyebrow">02 / Your preview</span><span className="muted">{result ? "Ready to review" : "Appearance only"}</span></div>
            {phase !== "idle" ? <div className="progress-summary" role="status"><span className={busy ? "status-dot working" : "status-dot"} /><strong>{busy ? ROW_LABEL[STAGE_ROWS[Math.max(0, latestIndex)].key] : phase === "succeeded" ? "Preview ready" : acceptedOffer ? "Example selected" : "Preview unavailable"}</strong><span>{elapsed}s</span></div> : null}
            {(phase === "failed" || phase === "timeout") && !acceptedOffer ? <div className="banner bad" role="alert"><p>{error}</p>{retake ? <ol>{retake.map((item) => <li key={item}>{item}</li>)}</ol> : null}</div> : null}
            {offer && !acceptedOffer ? <div className="fallback-choice"><p>A stored example is available. It was not made from your images.</p><button type="button" className="secondary" onClick={() => showOffer(offer)}>Show example preview</button></div> : null}
            {fallback ? <div className="banner warn" role="status">Not a live result: {fallback.message}</div> : null}
            {result ? (
              <div className="result-card">
                <ModeBanner heading="Source" mode={result.mode} />
                <RenderPreview key={result.renderId} url={result.url} mode={result.mode} badge={result.badge} label={result.label}
                  originalUrl={result.mode === "live" ? personPreview ?? undefined : undefined}
                  onImageState={acceptedOffer ? undefined : (state) => onResultImage(state, result.mode === "precomputed")}>
                  <button type="button" className="secondary" disabled={saved === "yes" || (!acceptedOffer && phase !== "succeeded")} onClick={saveResult}>{saved === "yes" ? "Saved to watchlist" : "Save to watchlist"}</button>
                </RenderPreview>
                {saved === "yes" ? <p className="muted">Saved in this browser. <Link href="/watchlist">Open watchlist →</Link></p> : null}
                {saved === "failed" ? <p role="alert">This browser could not save the preview. You can still download it.</p> : null}
              </div>
            ) : <div className={`result-empty ${busy ? "is-working" : ""}`}><div className="empty-orbit" aria-hidden="true">s.</div><h2>{busy ? "A new look is taking shape." : "Your next possibility goes here."}</h2><p>{busy ? "Progress reflects the server’s actual response. You can follow each step below." : "Add your images and create a preview. Then compare, download, or keep it on your watchlist."}</p><span className="eyebrow">Powered by YouCam</span></div>}
            {phase !== "idle" ? <details className="progress-details"><summary>Timing and processing steps</summary><p className="muted">Limits: {startSeconds}s to queue, then {timeoutSeconds}s to generate. Times below mark observed events.</p><ol className="stages">{STAGE_ROWS.map((row, i) => { const at = reached[row.key]; const state = stopped.includes(row.key) ? "stopped" : at !== undefined ? (i === latestIndex && busy ? "active" : "done") : "pending"; return <li key={row.key} className={state}><span className="stage-mark" aria-hidden="true">{state === "stopped" ? "×" : state === "done" ? "✓" : "○"}</span><span>{row.label}<span className="sr-only">: {state}</span></span><span className="stage-time muted">{at !== undefined ? `${(at / 1000).toFixed(1)}s` : "Pending"}</span></li>; })}</ol></details> : null}
          </section>
        </div>
      )}
      {created || status ? <details className="developer-panel"><summary>Technical details</summary><pre>{JSON.stringify({ created, status }, null, 2)}</pre></details> : null}
    </div>
  );
}
