"use client";

import { useEffect, useRef, useState } from "react";

import { prepareSelfie, SelfieReadError, type BrowserSelfie } from "@/lib/tryon/selfie-capture";
import { SELFIE_GATE, type SelfieGateResult } from "@/lib/tryon/selfie-gate";

interface Props {
  disabled: boolean;
  /** The photo that will be uploaded once it passes the checks, or null while there is none. */
  onChange: (selfie: BrowserSelfie | null) => void;
}

type CaptureState =
  | { kind: "empty" }
  | { kind: "checking" }
  | { kind: "checked"; gate: SelfieGateResult; previewUrl: string }
  | { kind: "unreadable"; message: string };

/**
 * Buyer photo: take one with the front camera or pick one, then run the local photo checks. A photo
 * that fails is never handed to the runner, so it cannot be uploaded or spend an API unit; the
 * buyer sees what failed and up to three things to do differently.
 */
export function SelfieCapture({ disabled, onChange }: Props) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const tokenRef = useRef(0);
  const [state, setState] = useState<CaptureState>({ kind: "empty" });

  const previewUrl = state.kind === "checked" ? state.previewUrl : null;
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function onPicked(file: File | undefined) {
    const token = ++tokenRef.current;
    onChange(null);
    if (!file) {
      setState({ kind: "empty" });
      return;
    }
    setState({ kind: "checking" });
    try {
      const selfie = await prepareSelfie(file);
      if (token !== tokenRef.current) return;
      setState({ kind: "checked", gate: selfie.gate, previewUrl: URL.createObjectURL(selfie.blob) });
      onChange(selfie.gate.passed ? selfie : null);
    } catch (err) {
      if (token !== tokenRef.current) return;
      setState({
        kind: "unreadable",
        message: err instanceof SelfieReadError ? err.message : "This photo could not be read in this browser.",
      });
    }
  }

  const gate = state.kind === "checked" ? state.gate : null;
  const hasPhoto = state.kind === "checked" || state.kind === "unreadable";

  return (
    <div className="selfie-capture" role="group" aria-labelledby="selfie-heading">
      <p id="selfie-heading" className="field-heading">
        Your photo
      </p>
      {previewUrl ? <img className="preview-thumb source-image" src={previewUrl} alt="The photo of you that would be uploaded" /> : <div className="photo-empty"><span aria-hidden="true">◎</span><p>A front-facing photo of you</p></div>}

      <p className="capture-actions">
        <button type="button" disabled={disabled} onClick={() => cameraRef.current?.click()}>
          {hasPhoto ? "Retake with camera" : "Take a photo"}
        </button>
        <button type="button" className="secondary" disabled={disabled} onClick={() => libraryRef.current?.click()}>
          {hasPhoto ? "Choose another photo" : "Choose a photo"}
        </button>
      </p>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        aria-label="Take a photo of you"
        capture="user"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(ev) => {
          void onPicked(ev.target.files?.[0]);
          ev.target.value = "";
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        aria-label="Choose a photo of you"
        style={{ display: "none" }}
        disabled={disabled}
        onChange={(ev) => {
          void onPicked(ev.target.files?.[0]);
          ev.target.value = "";
        }}
      />

      <details className="photo-tips"><summary>Photo tips</summary>
      <ul className="muted framing-tips">
        <li>Face the camera, from your head to at least your hips, arms a little away from your body.</li>
        <li>Stand in front of a plain wall with the light in front of you, not behind you.</li>
        <li>Only you in the photo.</li>
      </ul>

      </details>
      <div role="status" aria-live="polite">
        {state.kind === "checking" ? <p className="muted">Checking the photo on this device…</p> : null}
        {state.kind === "unreadable" ? <p className="banner bad">{state.message}</p> : null}
        {gate ? (
          <p className={`banner ${gate.passed ? "ok" : "bad"}`}>
            {gate.passed
              ? "Photo checks passed. Metadata removed."
              : `Photo checks failed, so it will not be uploaded and no API units are spent. ${gate.instructions.length === 1 ? "One thing" : `${gate.instructions.length} things`} to change below.`}
          </p>
        ) : null}
      </div>

      {state.kind === "checked" ? (
        <>
          <details open={!state.gate.passed}><summary>Photo check details</summary>
          <ul className="selfie-checks">
            {state.gate.checks.map((check) => (
              <li key={check.id} className={check.passed ? "pass" : "fail"}>
                <span className="stage-mark" aria-hidden="true">
                  {check.passed ? "✓" : "✗"}
                </span>
                <span>
                  <strong>{check.label}</strong> ({check.passed ? "passed" : "failed"}).{" "}
                  <span className="muted">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul></details>
          {state.gate.instructions.length > 0 ? (
            <>
              <h3>Before you retake</h3>
              <ol className="change-list">
                {state.gate.instructions.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      ) : null}
      <details className="photo-tips"><summary>What the checks assess</summary><p className="muted">
        Checks run on this device before anything is uploaded (rules {SELFIE_GATE.version}, provisional). They
        measure size, brightness and contrast only; they cannot tell whether a person is in the photo.
      </p></details>
    </div>
  );
}
