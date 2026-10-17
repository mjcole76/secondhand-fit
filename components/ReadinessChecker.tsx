"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { NormalisedPreview, type NormaliseState } from "@/components/NormalisedPreview";
import { ReadinessBadge } from "@/components/ReadinessBadge";
import type {
  NormaliseRefusedResponse,
  NormaliseResponse,
  SeededNormaliseResponse,
} from "@/lib/normalise/contracts";
import { NORMALISE_SETTINGS } from "@/lib/normalise/settings";
import {
  READINESS_CHECKS,
  assembleReadinessResult,
  downsampleToGrid,
  segmentGarment,
} from "@/lib/readiness/analyse";
import type {
  CheckId,
  CheckResult,
  PixelGrid,
  ReadinessResult,
  ReadinessRunRequest,
  ReadinessRunResponse,
  ReadinessSource,
  SeededFixtureInfo,
} from "@/lib/readiness/contracts";
import { gradeReadiness } from "@/lib/readiness/grade";
import { CHECK_DESCRIPTIONS, CHECK_LABELS, VERDICT_MARK, VERDICT_WORD } from "@/lib/readiness/instructions";
import {
  listingReadiness,
  type DraftListing,
  type ListingPublishResponse,
  type PublishRefusedResponse,
  type PublishedListing,
} from "@/lib/listings/contracts";
import { READINESS_THRESHOLDS } from "@/lib/readiness/thresholds";
import type { ApiErrorResponse } from "@/lib/tryon/contracts";

export interface SeededFixtureCard extends SeededFixtureInfo {
  /** Outcome computed on the server from the same scoring code, shown before the fixture is run. */
  expectedSummary: string;
}

interface Props {
  fixtures: SeededFixtureCard[];
  /** Draft listing the seller's own photo belongs to. Null until the listing details are accepted. */
  listing: DraftListing | null;
}

type Phase = "idle" | "reading" | "checking" | "done";

type RowState = { state: "pending" | "running" } | { state: "done"; result: CheckResult };

type RecordState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; response: ReadinessRunResponse }
  | { state: "failed" };

type PublishState =
  | { state: "idle" }
  | { state: "publishing" }
  | { state: "published"; listing: PublishedListing }
  | { state: "failed"; message: string };

const PUBLISH_FAILED = "The listing could not be published. Check your connection and try again.";
const NORMALISE_FAILED =
  "The garment image could not be prepared for try-on. Check your connection and run the check again.";

const UPLOAD = READINESS_THRESHOLDS.upload;
const MAX_MB = (UPLOAD.maxBytes / (1024 * 1024)).toFixed(0);

function pendingRows(): Record<CheckId, RowState> {
  return {
    framing: { state: "pending" },
    background: { state: "pending" },
    flatness: { state: "pending" },
    occlusion_shadow: { state: "pending" },
  };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Decodes the image and reads its pixels back from a canvas no larger than decodeMaxSidePx. */
async function readPixels(url: string): Promise<{ pixels: PixelGrid; naturalWidth: number; naturalHeight: number }> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();

  const { naturalWidth, naturalHeight } = img;
  const scale = Math.min(1, READINESS_THRESHOLDS.analysis.decodeMaxSidePx / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { pixels: { width, height, data }, naturalWidth, naturalHeight };
}

/**
 * What the server normalises: the photo file itself, so the server reads its orientation tag and
 * removes its metadata. Only a file over the request limit is replaced by a PNG copy of the photo
 * as the browser shows it (already upright), at most uploadMaxSidePx and shrunk until it is under.
 */
async function photoForServer(file: Blob, url: string): Promise<Blob> {
  if ((UPLOAD.allowedMime as readonly string[]).includes(file.type) && file.size <= NORMALISE_SETTINGS.maxRequestBytes) {
    return file;
  }

  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();

  let side: number = NORMALISE_SETTINGS.uploadMaxSidePx;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob && blob.size <= NORMALISE_SETTINGS.maxRequestBytes) return blob;
    side = Math.round(side * 0.75);
  }
  throw new Error("The photo is too large to send for preparation.");
}

function toBase64(bytes: PixelGrid["data"]): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step) as unknown as number[]);
  }
  return btoa(binary);
}

export function ReadinessChecker({ fixtures, listing }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);
  const [rows, setRows] = useState<Record<CheckId, RowState>>(pendingRows);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [record, setRecord] = useState<RecordState>({ state: "idle" });
  const [publish, setPublish] = useState<PublishState>({ state: "idle" });
  const [normal, setNormal] = useState<NormaliseState>({ state: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const runRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const outcomeRef = useRef<HTMLHeadingElement | null>(null);

  const previewUrlRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      runRef.current++;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (phase === "done") outcomeRef.current?.focus();
  }, [phase, attempts]);

  function fail(message: string) {
    setError(message);
    setPhase("idle");
    setAnnouncement(message);
  }

  async function runChecks(blob: Blob, source: ReadinessSource, alt: string) {
    const run = ++runRef.current;
    const stale = () => runRef.current !== run;

    setError(null);
    setResult(null);
    setRecord({ state: "idle" });
    setPublish({ state: "idle" });
    setNormal({ state: "idle" });
    setRows(pendingRows());
    setPhase("reading");
    setAnnouncement("Reading the photo.");

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(blob);
    previewUrlRef.current = url;
    setPreview({ url, alt });

    let grid: PixelGrid;
    let size: { width: number; height: number };
    try {
      const { pixels, naturalWidth, naturalHeight } = await readPixels(url);
      if (stale()) return;
      size = { width: naturalWidth, height: naturalHeight };
      if (Math.min(naturalWidth, naturalHeight) < UPLOAD.minSidePx) {
        fail(
          `This photo is ${naturalWidth} × ${naturalHeight} pixels. The shorter side must be at least ${UPLOAD.minSidePx} pixels. No API call was made.`,
        );
        return;
      }
      grid = downsampleToGrid(pixels);
    } catch {
      if (stale()) return;
      fail("This file could not be read as an image. Use a JPEG, PNG or WebP photo. No API call was made.");
      return;
    }

    // Each check is a real pass over the pixels; its row resolves when that pass finishes.
    setPhase("checking");
    const seg = segmentGarment(grid);
    const checks: CheckResult[] = [];
    for (const check of READINESS_CHECKS) {
      setRows((r) => ({ ...r, [check.id]: { state: "running" } }));
      await yieldToBrowser();
      if (stale()) return;
      const res = check.compute(seg);
      checks.push(res);
      setRows((r) => ({ ...r, [check.id]: { state: "done", result: res } }));
    }

    const outcome = assembleReadinessResult(seg, checks);
    setResult(outcome);
    setAttempts((n) => n + 1);
    setPhase("done");
    setAnnouncement(
      outcome.accepted
        ? "Photo accepted. No check failed."
        : `Retake needed. ${outcome.instructions.length} retake ${outcome.instructions.length === 1 ? "instruction" : "instructions"} listed.`,
    );

    // Record the attempt. Only the small analysis grid is sent, and only to this app's own server.
    setRecord({ state: "saving" });
    let recordedListingId: number | null = null;
    try {
      const body: ReadinessRunRequest = {
        source,
        category: source === "upload" ? listing?.category : undefined,
        // Recorded against the draft, so the server can publish the listing from this attempt.
        listingId: listing?.id,
        grid: { width: grid.width, height: grid.height, rgbaBase64: toBase64(grid.data) },
      };
      const res = await fetch("/api/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const response = (await res.json()) as ReadinessRunResponse;
      if (stale()) return;
      setRecord({ state: "saved", response });
      recordedListingId = response.listingId;
    } catch {
      if (stale()) return;
      setRecord({ state: "failed" });
    }

    if (outcome.accepted) await prepareForTryOn(blob, { url, alt, ...size }, source, recordedListingId, stale);
  }

  /**
   * Has the server normalise the accepted photo. With a draft listing on the server it is stored
   * against the listing; a seeded example with no listing shows the pair prepared at build time.
   */
  async function prepareForTryOn(
    file: Blob,
    before: { url: string; alt: string; width: number; height: number },
    source: ReadinessSource,
    listingId: number | null,
    stale: () => boolean,
  ) {
    if (listingId === null && source === "upload") {
      setNormal({
        state: "failed",
        message:
          "This attempt is not recorded against a listing on the server, so the photo could not be prepared for try-on. Run the check again.",
      });
      return;
    }

    setNormal({ state: "working", before });
    try {
      if (listingId !== null) {
        const body = source === "upload" ? await photoForServer(file, before.url) : undefined;
        if (stale()) return;
        const res = await fetch(`/api/listings/${listingId}/normalise?source=${source}`, {
          method: "POST",
          headers: body ? { "Content-Type": body.type || "application/octet-stream" } : undefined,
          body,
        });
        const data = (await res.json()) as NormaliseResponse | NormaliseRefusedResponse | ApiErrorResponse;
        if (stale()) return;
        if (!res.ok || !("pair" in data)) {
          const refused = "normalised" in data;
          setNormal({ state: refused ? "refused" : "failed", message: "error" in data ? data.error : NORMALISE_FAILED });
          return;
        }
        setNormal({ state: "done", pair: data.pair, stored: true, providerCalls: data.providerCalls });
      } else {
        const res = await fetch("/api/normalise/seeded");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as SeededNormaliseResponse;
        if (stale()) return;
        const entry = data.fixtures.find((f) => f.source === source);
        if (!entry?.pair) {
          setNormal({ state: "refused", message: entry?.refusal ?? NORMALISE_FAILED });
          return;
        }
        setNormal({ state: "done", pair: entry.pair, stored: false });
      }
      setAnnouncement("Garment image prepared for try-on. The before and after comparison is shown with the result.");
    } catch {
      if (stale()) return;
      setNormal({ state: "failed", message: NORMALISE_FAILED });
    }
  }

  function onFileChange(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;

    if (!(UPLOAD.allowedMime as readonly string[]).includes(file.type)) {
      runRef.current++;
      fail("Unsupported file type. Use a JPEG, PNG or WebP photo. No API call was made.");
      return;
    }
    if (file.size > UPLOAD.maxBytes) {
      runRef.current++;
      fail(
        `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_MB} MB. No API call was made.`,
      );
      return;
    }
    void runChecks(file, "upload", "The flat-lay photo you selected");
  }

  async function onFixture(fixture: SeededFixtureCard) {
    let blob: Blob;
    try {
      const res = await fetch(fixture.imageUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      blob = await res.blob();
    } catch {
      runRef.current++;
      fail("The seeded example could not be loaded. Check your connection and try again.");
      return;
    }
    void runChecks(blob, fixture.source, fixture.alt);
  }

  /** The server publishes from the attempt it recorded; no grade or score is sent from here. */
  async function onPublish(listingId: number) {
    const run = runRef.current;
    setPublish({ state: "publishing" });
    try {
      const res = await fetch(`/api/listings/${listingId}/publish`, { method: "POST" });
      const data = (await res.json()) as ListingPublishResponse | PublishRefusedResponse | ApiErrorResponse;
      if (runRef.current !== run) return;
      if (!res.ok || !("listing" in data)) {
        const message = "error" in data ? data.error : PUBLISH_FAILED;
        setPublish({ state: "failed", message });
        setAnnouncement(message);
        return;
      }
      setPublish({ state: "published", listing: data.listing });
      setAnnouncement(`Listing published. Source photo checks: grade ${data.listing.readiness.grade}.`);
    } catch {
      if (runRef.current !== run) return;
      setPublish({ state: "failed", message: PUBLISH_FAILED });
      setAnnouncement(PUBLISH_FAILED);
    }
  }

  const busy = phase === "reading" || phase === "checking";
  const rejected = result !== null && !result.accepted;
  const optionalTips = result?.accepted ? result.instructions : [];

  // Same grading code as the server. The grade a listing is published with is the server's.
  const graded = result ? gradeReadiness(result) : null;
  const attempt = result && graded ? listingReadiness(graded, result.checks, result.thresholdVersion) : null;
  // The attempt can be published once the server has recorded it against the draft still shown above.
  const publishableId =
    listing && result?.accepted && record.state === "saved" && record.response.listingId === listing.id
      ? listing.id
      : null;

  return (
    <div>


      <section className="card" aria-labelledby="upload-heading">
        <h2 id="upload-heading">Check your own flat-lay</h2>
        {listing ? (
          <>
            <label htmlFor="flatlay">Garment photo</label>
            <input
              id="flatlay"
              ref={fileInputRef}
              type="file"
              accept={UPLOAD.allowedMime.join(",")}
              capture="environment"
              disabled={busy}
              aria-describedby={error ? "flatlay-limits flatlay-error" : "flatlay-limits"}
              onChange={onFileChange}
            />
            <details><summary>Photo requirements and storage</summary><p id="flatlay-limits" className="muted">
              JPEG, PNG or WebP, up to {MAX_MB} MB, shorter side at least {UPLOAD.minSidePx} pixels. The checks run in
              your browser. A small analysis copy (at most {READINESS_THRESHOLDS.analysis.gridMaxSidePx} pixels on its
              longer side) is sent to this app&apos;s server to record the attempt. If the photo is accepted, the photo
              itself is sent there too, to prepare the garment image for try-on. The server removes its metadata
              (including any location) and stores it with the draft listing at most{" "}
              {NORMALISE_SETTINGS.uploadMaxSidePx} pixels on its longer side. Nothing is sent to the YouCam API at this
              step.
            </p></details>
          </>
        ) : (
          <p className="muted">
            Fill in the listing details above first. The photo step opens once the category is accepted; a category
            that cannot be listed never reaches it.
          </p>
        )}
        {error ? (
          <div id="flatlay-error" className="banner bad" role="alert">
            {error}
          </div>
        ) : null}
      </section>

      <details className="card" aria-labelledby="seeded-heading">
        <summary id="seeded-heading">Try a sample photo check</summary>
        <p className="muted">
          No upload needed. These two are drawings made for this project, not photographs: the same T-shirt as a bad
          flat-lay and as its retake. Each one goes through exactly the same checks as a photo you upload. With the
          listing details filled in, the retake can also be published as a demo listing. Both belong to the seeded
          demo set on <Link href="/listings">Listings</Link>, where their licence is listed.
        </p>
        <div className="fixture-grid">
          {fixtures.map((fixture) => (
            <button
              key={fixture.name}
              type="button"
              className="fixture-button secondary"
              disabled={busy}
              onClick={() => void onFixture(fixture)}
            >
              <img src={fixture.imageUrl} alt="" width={fixture.width} height={fixture.height} />
              <span>
                <strong>{fixture.title}</strong>
                <span className="fixture-note">{fixture.description}</span>
                <span className="fixture-note">{fixture.expectedSummary}</span>
              </span>
            </button>
          ))}
        </div>
      </details>

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      {phase !== "idle" && preview ? (
        <section className="card" aria-label="Readiness checks">
          <div className="grid-2">
            <div>
              <h2>Your photo</h2>
              <img className="flatlay-preview" src={preview.url} alt={preview.alt} />
            </div>
            <div>
              <h2>Readiness checks</h2>
              <ul className="check-list">
                {READINESS_CHECKS.map(({ id }) => {
                  const row = rows[id];
                  if (row.state !== "done") {
                    return (
                      <li key={id} className="check-row pending">
                        <div className="check-head">
                          <strong>{CHECK_LABELS[id]}</strong>
                          <span className="muted">{row.state === "running" ? "Checking…" : "Waiting"}</span>
                        </div>
                        <div className="score-bar skeleton" aria-hidden="true" />
                        <p className="muted">{CHECK_DESCRIPTIONS[id]}</p>
                      </li>
                    );
                  }
                  const { result: check } = row;
                  return (
                    <li key={id} className={`check-row ${check.verdict}`}>
                      <div className="check-head">
                        <strong>{check.label}</strong>
                        <span className={`verdict ${check.verdict}`}>
                          <span aria-hidden="true">{VERDICT_MARK[check.verdict]}</span> {VERDICT_WORD[check.verdict]}
                          {check.assessed ? ` · ${check.score}/100` : " · not scored"}
                        </span>
                      </div>
                      <div className="score-bar" aria-hidden="true">
                        <span style={{ width: `${check.score}%` }} />
                      </div>
                      <p>{check.summary}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {phase === "done" && result ? (
        <section className="card" aria-labelledby="outcome-heading">
          <h2 id="outcome-heading" ref={outcomeRef} tabIndex={-1}>
            {rejected ? "Retake needed" : "Photo accepted"}
          </h2>

          {attempt ? <ReadinessBadge readiness={attempt} variant="attempt" /> : null}

          {rejected ? (
            <>
              <div className="banner warn">
                {result.garmentFound
                  ? "This photo was not accepted for try-on. Fix the points below and retake it."
                  : "We could not find the garment edges in this photo. Fix the points below and retake it."}
              </div>
              <ol className="instruction-list">
                {result.instructions.map((ins) => (
                  <li key={ins.order}>
                    <strong>{ins.title}</strong>
                    <p>{ins.detail}</p>
                    <p className="muted">
                      {ins.severity === "required" ? "Failed check" : "Warning from"}: {ins.checkLabel}
                    </p>
                  </li>
                ))}
              </ol>
              {listing ? (
                <p>
                  <button type="button" onClick={() => fileInputRef.current?.click()}>
                    Retake photo
                  </button>
                </p>
              ) : (
                <p className="muted">Fill in the listing details above to check a photo of your own.</p>
              )}
            </>
          ) : (
            <>
              <div className="banner ok">
                No check failed. A listing can be published with this photo, and it will carry the grade above.
              </div>
              <NormalisedPreview status={normal} />
              {publish.state === "published" ? (
                <div className="banner info" role="status">
                  <p>
                    Listing published. Its badge reads &quot;Source photo checks: grade {publish.listing.readiness.grade}
                    &quot;.
                  </p>
                  <p className="banner-detail">
                    <Link href={`/listings/${publish.listing.id}`}>View the listing</Link> ·{" "}
                    <Link href="/listings">All listings</Link>
                  </p>
                </div>
              ) : publishableId !== null ? (
                <p>
                  <button
                    type="button"
                    disabled={publish.state === "publishing" || normal.state !== "done"}
                    onClick={() => void onPublish(publishableId)}
                  >
                    {publish.state === "publishing" ? "Publishing…" : normal.state === "working" ? "Preparing photo…" : "Publish listing"}
                  </button>
                </p>
              ) : (
                <p className="muted">
                  {!listing
                    ? "Fill in the listing details above, then run the check again to publish a listing with this photo."
                    : record.state === "saving"
                      ? "The listing can be published once this attempt is recorded."
                      : "This attempt is not recorded against the listing above, so it cannot be published. Run the check again."}
                </p>
              )}
              {publish.state === "failed" ? (
                <div className="banner bad" role="alert">
                  {publish.message}
                </div>
              ) : null}
              {optionalTips.length > 0 ? (
                <>
                  <p>Optional improvements before you publish:</p>
                  <ol className="instruction-list">
                    {optionalTips.map((ins) => (
                      <li key={ins.order}>
                        <strong>{ins.title}</strong>
                        <p>{ins.detail}</p>
                        <p className="muted">Warning from: {ins.checkLabel}</p>
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </>
          )}

          <p className="muted" role="status">
            {record.state === "saving" ? "Recording this attempt…" : null}
            {record.state === "saved"
              ? `Attempt recorded as run #${record.response.runId}. No API units were spent: the usage ledger had ${record.response.providerCalls.ledgerEntriesBefore} entries before this check and ${record.response.providerCalls.ledgerEntriesAfter} after it (${record.response.providerCalls.ledgerEntriesAdded} added).`
              : null}
            {record.state === "failed"
              ? "The checks ran in your browser, but this attempt could not be recorded on the server. No API call was made."
              : null}
          </p>
          <p className="muted">
            Thresholds {result.thresholdVersion}
            {READINESS_THRESHOLDS.calibrated ? "." : " — provisional, not yet calibrated against live API runs."} The
            checks describe the photo only; they say nothing about the garment itself.
          </p>

          <details>
            <summary>Developer panel (raw scores and metrics)</summary>
            <pre>
              {JSON.stringify({ result, serverRecord: record.state === "saved" ? record.response : record.state }, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
