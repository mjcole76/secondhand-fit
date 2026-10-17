import type { Metadata } from "next";
import Link from "next/link";

import {
  BLOCKED_CATEGORIES,
  OPEN_CATEGORIES,
  PROVIDER_TERMS_CHECK,
  SCOPE_STATEMENT_VERSION,
  type BlockBasis,
} from "@/lib/listings/categories";
import { GRADE_MEANINGS, READINESS_GRADES } from "@/lib/readiness/grade";
import { PREVIEW_ONLY_LABEL } from "@/lib/tryon/contracts";
import { BADGE_SCOPE_NOTE } from "@/lib/tryon/honesty";
import pkg from "@/package.json";

/** The licence, Node.js floor and repository link come from package.json, as the clone check reads them. */
const manifest: { license: string; engines: { node: string }; repository?: string | { url: string } } = pkg;
const repositoryUrl =
  typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url.replace(/^git\+/, "");
const nodeFloor = manifest.engines.node.replace(/^>=\s*/, "");

/** The README's Setup commands for offline mock mode. */
const SETUP_COMMANDS = ["git clone <repository-url>", "cd secondhand-fit", "npm install", "npm run dev"].join("\n");

export const metadata: Metadata = {
  title: "Methods and scope — Secondhand Fit",
  description: "What Secondhand Fit will and will not list, and why. Preview only.",
};

function refused(basis: BlockBasis) {
  return BLOCKED_CATEGORIES.filter((c) => c.basis === basis);
}

export default function MethodsPage() {
  return (
    <>
      <h1>Methods and scope</h1>
      <p className="lede">
        What Secondhand Fit will and will not list, and why. The lists on this page are rendered from the same category
        table the server uses to refuse a listing, so the page and the behaviour cannot drift apart.
      </p>

      <section id="scope" className="card" aria-labelledby="scope-heading">
        <h2 id="scope-heading">Scope statement</h2>
        <p className="muted">Version {SCOPE_STATEMENT_VERSION}</p>

        <h3>Categories that can be listed</h3>
        <ul>
          {OPEN_CATEGORIES.map((c) => (
            <li key={c.id}>
              <strong>{c.label}</strong> — {c.examples}
            </li>
          ))}
        </ul>

        <h3>Categories that are refused</h3>
        <ul>
          {refused("product_policy").map((c) => (
            <li key={c.id}>
              <strong>{c.label}</strong> — {c.examples}. {c.reason}
            </li>
          ))}
        </ul>

        <h3>Categories that are not available yet</h3>
        <ul>
          {refused("not_supported").map((c) => (
            <li key={c.id}>
              <strong>{c.label}</strong> — {c.examples}. {c.reason}
            </li>
          ))}
        </ul>

        <h3>YouCam API terms</h3>
        <p>
          Renders are produced by the Perfect Corp. YouCam Apparel Virtual Try-On API, and use of that API is subject to
          the YouCam API and Perfect Corp. terms of service.
        </p>
        <div className={`banner ${PROVIDER_TERMS_CHECK.verified ? "ok" : "warn"}`}>
          {PROVIDER_TERMS_CHECK.verified
            ? "The refused list has been checked against the YouCam API and Perfect Corp. terms of service."
            : PROVIDER_TERMS_CHECK.note}
        </div>

        <h3>Where the refusal happens</h3>
        <p>
          The category is the first thing a seller chooses on the <Link href="/sell/new">Sell</Link> page. Choosing a
          refused category shows the reason and a link back to this statement, and the photo step does not open. The
          server enforces the same list: it creates no listing and records no readiness run for a refused category, and
          nothing is sent to the YouCam API.
        </p>

        <h3>What a preview does not claim</h3>
        <p>{PREVIEW_ONLY_LABEL}</p>
      </section>

      <section className="card" aria-labelledby="checks-heading">
        <h2 id="checks-heading">Readiness checks</h2>
        <p>
          Four checks run on a garment photo before it is accepted: framing, background separation, flatness and
          occlusion/shadow. They run on the <Link href="/sell/new">Sell</Link> page, where each result is shown with
          its score. The thresholds are provisional and have not yet been calibrated against live API runs; the
          per-check write-up will be added to this page when they are.
        </p>

        <h3 id="grade">Try-on readiness grade</h3>
        <p>
          Each check gives a score out of 100 and a verdict: pass, warning or fail. The grade is read off the single
          weakest check and nothing is averaged, so three high scores cannot lift the grade of a photo whose fourth
          check failed.
        </p>
        <ul>
          {READINESS_GRADES.map((grade) => (
            <li key={grade}>
              <strong>Grade {grade}</strong> — {GRADE_MEANINGS[grade]}
            </li>
          ))}
        </ul>
        <p>
          A published <Link href="/listings">listing</Link> shows its grade as a badge with the reason the grade is not
          higher and the weakest check by name. The server takes the grade from the readiness attempt it recorded for
          the listing, never from the publish request. {BADGE_SCOPE_NOTE}
        </p>
      </section>

      <section id="source" className="card" aria-labelledby="source-heading">
        <h2 id="source-heading">Source code and licence</h2>
        <p>
          Secondhand Fit is released under the {manifest.license} licence, in the <code>LICENSE</code> file at the root
          of the repository. It covers the source code, the placeholder renders and the drawings of the demo listing
          set. Third-party packages keep their own licences, listed in <code>PROVENANCE.md</code> with the origin of
          every file and picture. The YouCam API is a Perfect Corp. service used under its own terms of service, and the
          licence grants no rights to it.
        </p>
        {repositoryUrl ? (
          <p>
            Repository: <a href={repositoryUrl}>{repositoryUrl}</a>
          </p>
        ) : (
          <div className="banner warn">The repository has not been published to a Git host yet, so there is no link.</div>
        )}

        <h3>Running it offline from a clone</h3>
        <p>
          It needs Node.js {nodeFloor} or newer, with npm, and nothing else: no API key, no database and no{" "}
          <code>.env</code> file.
        </p>
        <pre>
          <code>{SETUP_COMMANDS}</code>
        </pre>
        <p>
          Then open http://localhost:3000. With no YouCam credentials the app runs in offline mock mode: it replays
          recorded API responses, makes no outbound request and spends no API units, and the mode banner reads{" "}
          <code>mock</code>. If a key is set in the shell or in <code>.env.local</code>, start it with{" "}
          <code>YOUCAM_MOCK=true npm run dev</code> instead. <code>README.md</code> at the root of the repository has
          the step-by-step walkthrough, every environment variable, live mode and how to calibrate the readiness
          checks.
        </p>
      </section>
    </>
  );
}
