"use client";

import { BeforeAfter, type BeforeAfterImage } from "@/components/BeforeAfter";
import type { NormaliseResponse, NormalisedPair } from "@/lib/normalise/contracts";
import { VERDICT_MARK, VERDICT_WORD } from "@/lib/readiness/instructions";

export type NormaliseState =
  | { state: "idle" }
  | { state: "working"; before: BeforeAfterImage }
  | {
      state: "done";
      pair: NormalisedPair;
      /** True when stored with a draft listing; false for the seeded example prepared at build time. */
      stored: boolean;
      providerCalls?: NormaliseResponse["providerCalls"];
    }
  | { state: "refused" | "failed"; message: string };

/** The accepted photo next to the garment image a try-on will send, with what changed and why. */
export function NormalisedPreview({ status }: { status: NormaliseState }) {
  if (status.state === "idle") return null;

  return (
    <section className="normalised" aria-labelledby="normalised-heading">
      <h3 id="normalised-heading">Prepared for try-on</h3>
      <p className="muted">
        Once a photo is accepted, this app&apos;s server makes the garment image a try-on sends to the YouCam Apparel
        VTO API: upright, cropped to the garment, plain surface flattened to neutral grey, and sized within the
        API&apos;s input limits. The original is kept next to it.
      </p>

      {status.state === "working" ? (
        <>
          <BeforeAfter before={status.before} after={null} />
          <p role="status">Preparing the garment image on the server…</p>
        </>
      ) : null}

      {status.state === "refused" || status.state === "failed" ? (
        <div className={`banner ${status.state === "refused" ? "warn" : "bad"}`} role="alert">
          {status.message}
        </div>
      ) : null}

      {status.state === "done" ? (
        <>
          <BeforeAfter before={status.pair.original} after={status.pair.normalised} />

          <h4>What changed</h4>
          <ul className="change-list">
            {status.pair.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.label}</strong>
                {step.applied ? ": " : " (unchanged): "}
                {step.detail}
              </li>
            ))}
          </ul>

          <h4>VTO input limits</h4>
          <ul className="change-list">
            {status.pair.constraints.map((c) => {
              const verdict = c.ok ? "pass" : "fail";
              return (
                <li key={c.id}>
                  <span className={`verdict ${verdict}`}>
                    <span aria-hidden="true">{VERDICT_MARK[verdict]}</span> {VERDICT_WORD[verdict]}
                  </span>{" "}
                  {c.label}: {c.actual} (limit: {c.limit})
                </li>
              );
            })}
          </ul>
          {status.pair.constraintsConfirmed ? null : (
            <p className="muted">
              These limits are transcribed from the YouCam API documentation and have not yet been confirmed by a live
              render.
            </p>
          )}

          <p className="muted" role="status">
            {status.stored
              ? "Stored with this draft listing, next to the original."
              : "Seeded example, prepared when the app was built. Fill in the listing details to store it with a listing."}{" "}
            {status.providerCalls
              ? `No API units were spent: the usage ledger had ${status.providerCalls.ledgerEntriesBefore} entries before this step and ${status.providerCalls.ledgerEntriesAfter} after it (${status.providerCalls.ledgerEntriesAdded} added).`
              : "No API call was made."}
          </p>
        </>
      ) : null}
    </section>
  );
}
