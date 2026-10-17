"use client";
import { useState } from "react";
import { PREVIEW_ONLY_LABEL } from "@/lib/tryon/contracts";

export function DemoShowcase() {
  const [original, setOriginal] = useState(false);
  return (
    <div className="demo-showcase">
      <div className="demo-photo">
        <img src={original ? "/demo/person.jpg" : "/demo/youcam-jacket-preview.jpg"} alt={original ? "Gemini-generated source person in a gray shirt" : "Previously created YouCam preview of the green jacket on the source person"} />
        <div className="demo-photo-top"><span className="photo-chip">{original ? "SOURCE PHOTO" : "YOUCAM EXAMPLE"}</span><span className="photo-chip">PREVIEW ONLY</span></div>
        <div className="demo-switch" role="group" aria-label="Example comparison"><button type="button" aria-pressed={original} onClick={() => setOriginal(true)}>Original</button><button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>Try-on</button></div>
      </div>
      <div className="demo-garment"><img src="/demo/jacket.jpg" alt="Gemini-generated source green jacket" /><div><span className="eyebrow">The starting piece</span><p>Green utility jacket</p><span className="muted">Demonstration image</span></div></div>
      <p className="demo-caption">Existing example supplied by the creator. Person and jacket generated with Gemini, try-on produced with YouCam. No new render runs on this page.</p>
      <p className="demo-scope">{PREVIEW_ONLY_LABEL} Source photo checks were not recorded for this example.</p>
    </div>
  );
}
