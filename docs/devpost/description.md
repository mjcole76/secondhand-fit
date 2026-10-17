# Devpost description — draft

Draft text for the Devpost project form. Last updated 2026-10-01 against the code in this
repository.

**How to use this file.** Each section below maps to one field of the form. Paragraphs that begin
with `[PENDING: …]` describe a feature that is planned but **not built** as of the date above. Before
pasting, check each one against the deployed app: delete the paragraph if the feature did not ship,
or remove the marker if it did. Everything without a marker describes code that exists today, but
none of it has been confirmed on a deployed URL, and no live YouCam render has completed from this
codebase yet — re-read it all against the running app before submitting.

## Project name

Secondhand Fit

## Elevator pitch

Try-on for resale listings: a pre-flight check tells sellers how to retake a bad flat-lay before any
API unit is spent, and every YouCam Apparel VTO render is labelled preview-only.

(181 characters. Check the limit shown on the form.)

## Built with

Next.js, React, TypeScript, Node.js, Perfect Corp. YouCam API (Apparel Virtual Try-On), REST

Add the hosting platform once the app is deployed.

## About the project

Paste from the next heading to the end of the file.

## The problem

Virtual try-on is built for clean catalogue images. Resale listings never have them. A one-of-one
garment on a peer-to-peer marketplace is photographed once, with a phone, crumpled on a patterned
duvet, half in shadow, sometimes with a hanger or a hand in the shot. Sent straight to a try-on
endpoint, a photo like that spends API units and can come back as a render that quietly failed, and
the buyer is shown it as if it were reliable. The seller gets no guidance on what to fix. The buyer
gets no signal about how much to trust what they see.

## What it does

Secondhand Fit is a web app that puts a pre-flight check in front of the **Perfect Corp. YouCam
API — Apparel Virtual Try-On**, and an honesty layer behind it.

**For the seller**

- **Readiness checks before any API call.** The garment photo is checked in the browser for framing,
  background separation, flatness and occlusion/shadow. Each check gives a score out of 100 and a
  pass, warn or fail verdict.
- **Specific retake instructions.** A photo with a failing check is rejected, and the seller gets up
  to three ordered, concrete instructions on how to retake it, in place of a generic error. No API
  unit is spent on a photo that would not work.
- **Refused categories.** Intimates and swimwear are refused when the listing is created, before a
  photo is requested, with the reason shown. Lower-body garments, dresses and accessories are not
  available yet, and the app says so. The full list is published in the app's scope statement.

[PENDING: local normalisation] An accepted photo is normalised on the server (auto-orient, crop to
the garment, conservative background suppression, resize to the try-on input constraints) and shown
next to the original as a before/after.

[PENDING: readiness grade] Each listing carries a readiness grade of A, B or C with the reason it is
not higher. The grade follows the weakest check, so one poor result cannot be averaged away.

**For the buyer**

- **Consent first.** The try-on states what is uploaded and where it is sent, and the server refuses
  any request that does not carry the current consent.
- **One render, honest progress.** The server calls the YouCam Apparel Virtual Try-On API: it
  uploads the garment image and the buyer's photo, creates the try-on task and polls it with a hard
  timeout. The progress stages on screen are the server's real state transitions, with elapsed time
  and the timeout stated. A render that does not finish in time says so.
- **Preview only, always.** Every render carries the label "AI-generated preview only. No fit, size,
  condition or authenticity claim is made." The label is shown under the render and burned into the
  image itself, so a saved or downloaded copy keeps it. Secondhand Fit never makes a statement about
  fit, size, condition or authenticity, and a copy check in the repository flags wording that does.
- **A readiness badge on the render.** The render carries the try-on readiness grade of the garment
  photo (A, B or C, following the weakest check) with the reason it is not higher, so the buyer can
  see how good the source photo was. The badge is on the result, in the image and on the watchlist
  of saved previews.

[PENDING: readiness grade from the listing] The badge on a render is taken from the published
listing's stored grade. Today the garment photo is graded when the try-on is requested.

[PENDING: seeded demo listings] The demo ships with seeded listings made from the builder's own or
openly licensed garment photos, including a deliberately bad flat-lay and its passing retake.

**For whoever pays for the API**

- **A unit budget that fails closed.** Every call is recorded in a usage ledger. When the configured
  budget is reached, a browser session reaches its daily cap, or the provider returns an error, the
  app serves a precomputed example and labels it "Not a live result". It never makes an
  uncontrolled paid call and never passes an example off as a live render.
- **Offline mock mode.** With no credentials configured the whole flow runs from pinned fixtures and
  makes no outbound request, so a reviewer can inspect it without an API key.

## eCommerce value

Resale is the part of fashion eCommerce where try-on is hardest and where it matters most: every
item is unique, the photo is whatever the seller's phone took, and returns are rarely possible.

- **Sellers** get a listing that is ready for try-on without a studio or a model, and they are told
  exactly what to fix when it is not.
- **Buyers** get a preview of a one-of-one garment on themselves, with a plain statement of what the
  preview does and does not tell them.
- **Marketplaces** stop paying for renders that were never going to work, because a photo that fails
  the checks is turned back before an API unit is spent, and they avoid showing a failed render as
  if it were a result.

## How it was built

Secondhand Fit is a Next.js and TypeScript web app, written during the Submission Period as a new
build.

- **YouCam integration.** One server-side adapter performs the whole flow against the YouCam Apparel
  Virtual Try-On API (V2) over REST: check both images against the API's input limits, upload the
  garment image, upload the buyer's photo, create the try-on task, poll with a bounded timeout and
  retry, retrieve the result. Every request carries the API key as a Bearer token, read from a
  server-only environment variable. Each documented API error code is shown to the buyer as its own
  plain-language message. The browser never receives a credential or a provider URL; the result
  image is served through a same-origin proxy.
- **Readiness checks.** The four checks are deterministic image heuristics that run on a canvas in
  the browser, with every threshold in one documented file. The server scores the same analysis
  grid with the same code. The readiness path does not import the YouCam adapter, so it cannot spend
  a unit.
- **Budget guard.** An append-only ledger is checked before every try-on, together with a
  per-session fair-use cap. A banner names how renders are served (live, precomputed or mock), and
  the status page shows the budget band.

## Challenges

- **Working backwards from the endpoint.** The seller-side checks only make sense if they reflect
  what the try-on endpoint actually needs, so the endpoint paths, field names and input constraints
  are pinned in one place and marked unverified until a live render confirms them.
- **Not overclaiming.** A try-on render says nothing about how a garment fits, and it is easy for
  product copy to imply that it does. The preview-only label is a shared constant used wherever a
  render is shown.

## Known limitations

- Flatness is an edge-density proxy, so a bold print or stripe also lowers the score.
- The surface colours are learned from the border of the photo, so a garment that covers most of
  the border is reported as "garment edges not found".
- Thin hangers, and shadows that fall only on the garment, are not reliably detected.
- The try-on handles upper-body garments only.
- The readiness thresholds are provisional: they have not yet been calibrated against live API runs
  on degraded photos.
- The refused-category list holds the project's own exclusions and has not yet been checked against
  the YouCam API and Perfect Corp. terms of service.

Remove the last two bullets only if the calibration and the terms check have actually been done by
submission time.

## What's next

- Seller accounts and durable listing history.
- An embeddable try-on entry point or listing import for existing resale marketplaces, so the
  readiness grade travels with a real listing.
- A segmentation model for background suppression on genuinely messy backgrounds.
- Garment categories beyond the upper body.
