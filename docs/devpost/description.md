# Devpost description

Paste-ready text for the Devpost project form. Every statement below describes code that is in this
repository and was checked against the running app on 2026-10-28. Before pasting, confirm the one
item marked **CHECK** against the deployed app.

## Project name

Secondhand Fit

## Elevator pitch

Try-on for resale listings: a pre-flight check tells sellers how to retake a bad flat-lay before any
API unit is spent, and every YouCam Apparel VTO render is labelled preview-only.

## Built with

Next.js, React, TypeScript, Node.js, sharp, Perfect Corp. YouCam API (Apparel Virtual Try-On), REST,
Render

## About the project

Paste from the next heading to the end of the file.

## Inspiration

Virtual try-on is built for clean catalogue images. Resale listings never have them. A one-of-one
garment on a peer-to-peer marketplace is photographed once, with a phone, crumpled on a patterned
duvet, half in shadow, sometimes with a hanger or a hand in the shot. Sent straight to a try-on
endpoint, a photo like that spends API units and can come back as a render that quietly failed, and
the buyer is shown it as if it were reliable. The seller gets no guidance on what to fix. The buyer
gets no signal about how much to trust what they see.

## What it does

Secondhand Fit puts a pre-flight check in front of the **Perfect Corp. YouCam API — Apparel Virtual
Try-On**, and an honesty layer behind it.

**For the seller**

- **Photo checks before any API call.** The garment photo is checked in the browser for framing,
  background separation, flatness and occlusion/shadow. Each check gives a score out of 100 and a
  pass, warn or fail verdict.
- **Specific retake instructions.** A photo with a failing check is rejected, and the seller gets up
  to three ordered, concrete instructions ("Move the garment to a plain, single-colour surface",
  "Lay the garment flat and smooth out the creases", "Even out the light…") instead of a generic
  error. No API unit is spent on a photo that would not work.
- **Server-side preparation.** An accepted photo is prepared on the server: turned upright, metadata
  removed, cropped to the garment with padding, plain background flattened only where the match is
  confident, and sized within the try-on API's input limits. The seller sees a before/after slider
  and a list of exactly what changed.
- **A grade on every listing.** Each published listing carries a source-photo grade (A, B or C) with
  the reason it is not higher. The grade follows the weakest check, so one failing check cannot be
  averaged away, and a photo with a failing check cannot be published.
- **Refused categories.** Intimates and swimwear are refused when the listing is created, before a
  photo is requested, with the reason shown and a link to the published scope statement.
  Lower-body garments, dresses and accessories are refused for now because the try-on handles
  upper-body garments only.

**For the buyer**

- **Consent first, enforced by the server.** The try-on starts with a plain-language statement of
  what is uploaded, where it is sent and when it is deleted. The server refuses any try-on request
  without a current consent record, before any API call. Consent can be withdrawn at any time.
- **One render, honest progress.** The server uploads the listing's prepared garment image and the
  buyer's photo to the YouCam Apparel VTO API, creates the task and polls it with a hard timeout. The
  progress stages on screen are the server's real state transitions, not a timer. A render that does
  not finish in time says so.
- **Preview only, always.** Every render carries the label "AI-generated preview only. No fit, size,
  condition or authenticity claim is made." with the garment photo's grade. Both are burned into the
  image itself, so the watchlist and any downloaded copy keep them. A copy-guard script in the
  repository fails the build check if product copy makes a fit, size, condition or authenticity
  claim.
- **Watchlist.** Buyers can save previews, which keep their label, grade and a link back to the
  listing.

**For whoever pays for the API**

- **A unit budget that fails closed.** Every call is recorded in a usage ledger. When the budget is
  reached or a browser session reaches its daily cap, no API call is made and a stored example is
  offered, labelled "Not a live result". It is never passed off as a live render.
- **Offline mock mode.** With no API key the whole flow runs from pinned fixtures and makes no
  outbound request, so anyone can run it from a clone.

## How we built it

Secondhand Fit is a Next.js 15 and TypeScript web app, written during the Submission Period as a new
build.

- **YouCam integration.** One server-side adapter (`lib/youcam/adapter.ts`) runs the whole flow
  against the YouCam API V2 over REST: check both images against the API's input limits (scaling,
  converting or refusing as needed), upload the garment, upload the buyer photo, create the
  `cloth` try-on task, poll with a bounded timeout and limited retries, and fetch the result. The
  API key is read from a server-only environment variable. The browser never receives a credential
  or a provider URL; the result image is served through a same-origin proxy that burns in the label.
  Each documented API error code has its own plain-language message.
- **Readiness checks.** Four deterministic image heuristics run on a canvas in the browser, with
  every threshold in one file. The server scores the same analysis grid with the same code. The
  readiness path never imports the YouCam adapter, so it cannot spend a unit.
- **Normalisation.** sharp handles orientation, metadata removal, cropping, conservative background
  flattening and resizing.
- **Verification.** 32 unit tests for the adapter, an offline end-to-end script covering consent,
  blocked categories, publishing, labelled renders, the budget cap and withdrawal, a copy-guard
  lint, and a clone check that fails if a fresh clone would need anything the README leaves out.

## Challenges we ran into

- **Working backwards from the endpoint.** The seller checks only make sense if they reflect what the
  try-on endpoint needs, so the endpoint paths, field names and input limits are pinned in one place
  and the app shows on `/status` whether a live render has confirmed them.
- **Not overclaiming.** A try-on render says nothing about how a garment fits, and product copy
  easily implies that it does. The preview-only label is one shared constant, and a lint enforces
  the wording across the app.
- **Honest fallbacks.** It is tempting to show a stored example when a live call fails. Secondhand
  Fit offers it only on request and labels it as not live.

## Accomplishments that we're proud of

- A judge can reproduce the whole seller story, from the rejected flat-lay to the accepted retake, a
  before/after and a graded listing, without uploading anything and without spending an API unit.
- Every render, everywhere it appears, says what it is and what it is not.

## What we learned

Most of the work in a dependable try-on product sits before and after the API call: deciding when
not to call it, and being clear about what comes back.

## Known limitations

- Flatness is an edge-density proxy, so a bold print or stripe also lowers the score.
- Background colours are learned from the border of the photo, so a garment that covers most of the
  border is reported as "garment edges not found".
- Thin hangers, and shadows that fall only on the garment, are not reliably detected.
- The try-on handles upper-body garments only.
- The readiness thresholds are provisional. They have not been calibrated against a large set of
  live API runs on degraded photos.
- Listings, consent records and the ledger are kept in server memory in this prototype, so a restart
  clears listings published by visitors. The seeded demo listings are rebuilt on every start.
- The demo listing garments are drawings generated by the project's own code, not photographs, so the
  project owns them outright.

## What's next for Secondhand Fit

- Seller insights: try-on counts and grade history per listing, with rates hidden at small sample
  sizes.
- Calibrating the thresholds against live renders, and flagging renders that quietly returned the
  original clothing.
- Durable storage and seller accounts.
- An embeddable try-on button or listing import for existing resale marketplaces.
- Garment categories beyond the upper body.

---

**CHECK before pasting:** "Render" in *Built with* assumes the app was deployed with `render.yaml`.
Replace it with the host actually used.
