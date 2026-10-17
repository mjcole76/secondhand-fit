# HackathonOS Build Project

This application is being built for:

**YouCam API Skin AI & eCommerce VTO Hackathon** (sponsor: Perfect Corp)

Selected project:

**Secondhand Fit** — Try-on for resale listings, where the only photo is a wrinkled flat-lay on someone's bedroom floor.

Deadline: November 2, 2026 at 6:00 AM UTC (as written: "Submission Period: Sep 29, 2026(12:00 pm Eastern Time) – Nov 2, 2026(11:45 am Eastern Time) (“Submission Period”).")
Demo video limit: 180 seconds

## Before building, read

1. `build-packet/00-START-HERE.md`
2. `build-packet/MASTER-BUILD-PROMPT.md`

Then review:

- `build-packet/03-contest-contract.md`
- `build-packet/04-judging-criteria.md`
- `build-packet/08-product-spec.md`
- `build-packet/13-build-sequence.md`
- `build-packet/15-compliance-checklist.md`

## Important

- Official contest requirements have priority.
- Do not remove required functionality.
- Do not invent contest requirements.
- Build P0 requirements first.
- Maintain a working application.
- When a planned change conflicts with an official requirement, flag the conflict before implementing it.

## Project at a glance

- **Target user:** Buyers on peer-to-peer resale marketplaces, and the individual sellers listing one-of-one items with phone photos.
- **Core problem:** Virtual try-on tooling assumes clean e-commerce catalogue imagery. Resale listings never have it: garments are crumpled, shot on patterned duvets, half in shadow, partially occluded by hands or hangers. Sending those images straight to a try-on endpoint wastes API units and produces renders that silently fail or return the original clothing, which then gets presented to a buyer as if it were reliable. Sellers get no actionable guidance and buyers get no signal about how much to trust what they are seeing.
- **Primary workflow:** Seller opens the Create Listing page and uploads a phone flat-lay photo of a garment. → Browser-side readiness checks run on the image (garment bounding box / framing, background separation, flatness / wrinkle proxy via edge density, occlusion and shadow proxies) and return a pass/fail per check. → If any check fails, the seller sees up to three specific, ordered retake instructions (e.g. 'lay the garment flat on a plain single-colour surface', 'move the garment fully inside the frame', 'remove the hanger/hand from the shot') and can retake without any API call being made. → When checks pass, the server normalises the accepted image (auto-orient, crop to garment bounding box with padding, conservative background suppression, resize/encode to the documented VTO input constraints) and stores it with a computed readiness grade (A/B/C) and a per-check breakdown. → Listing publishes with a visible 'try-on ready' badge showing the grade and the reason the grade is not higher. → Buyer opens the listing, taps Try it on, reads and accepts a plain-language consent screen covering what is uploaded, where it is sent and when it is deleted. → Buyer uploads or captures one selfie; the server validates it, strips metadata, and checks the render cache and the API unit budget. → Server calls the YouCam Apparel Virtual Try-On API server-to-server (upload → create task → bounded polling with timeout and retry) using the normalised garment image and the buyer photo, with honest progress states in the UI. → Render returns and is displayed with the readiness badge inherited from the garment, a persistent preview-only label, and an explicit statement that no fit, size or condition claim is being made; if a silent-failure signal is detected the render is labelled as unreliable rather than shown as a clean success. → Buyer saves the render to a watchlist; the listing's try-on counter increments and the seller sees try-on count plus readiness grade history on their listing dashboard, with rates suppressed at small sample sizes.
- **Framework:** Next.js

### Mandatory technologies [Official]
- **Devpost** — Registration and submission platform for the hackathon.
- **Perfect Corp. YouCam API** — At least one YouCam API must be integrated into a working web or mobile application; judging references the Skin, Beauty, Fashion, Jewelry & Watch, Hair & Beard categories.
- **YouCam API account (yce.perfectcorp.com/ai-api)** — Entrants must create a free YouCam API account and redeem the code for 1,000 free API units.
- **YouTube (or Vimeo; Youku per contest page)** — Demo video must be publicly hosted; YouTube highly preferred.
- **Public or shared code repository (e.g., Git hosting)** — A repository URL with all source code, assets and instructions must be provided; specific host is not named.

### P0 features (build these first)
- Server-side YouCam Apparel VTO integration (upload → task → bounded polling) — accept when: A live render completes end to end from the deployed environment; client bundle and network responses contain no credentials; pinned fixtures exist for offline mock mode.
- Seller readiness checker with specific retake instructions — accept when: The seeded bad flat-lay is rejected with three specific instructions and zero provider calls recorded.
- Local normalisation of accepted garment images — accept when: A normalised asset is produced within the documented input constraints and the before/after comparison renders correctly for the seeded pair.
- Try-on readiness grade on the listing — accept when: Every published listing displays a letter grade plus text reason; a single hard-failing check cannot be averaged into a higher grade.
- Buyer consent gate enforced server-side — accept when: A try-on request without a matching current-version consent record is refused server-side and no provider call is made.
- Buyer selfie capture and single render with honest progress — accept when: A render completes and displays within the bounded timeout, or a clear timeout state appears; progress stages reflect real state transitions rather than a fake timer.
- Readiness badge and preview-only honesty label on every render — accept when: The label is visible on the result, watchlist and any downloaded image; the copy-guard lint passes with zero banned claim terms.
- Blocked categories and published scope exclusions — accept when: Selecting a blocked category refuses listing creation before upload, with the reason shown and linked to the scope statement.
- Unit budget guard with labelled precomputed fallback — accept when: With the cap set to current spend, a try-on returns a precomputed render explicitly labelled as not live, and no provider call is attempted.
- Seeded demo listing set with the bad flat-lay and its retake — accept when: A judge landing cold on the deployed URL can reproduce the rejection and the passing retake without uploading anything, and each asset's licence is documented.
- Public repository with README, setup instructions and licence — accept when: A fresh clone runs in offline mock mode following only the README, with no undocumented steps.
- Devpost submission package (description, screenshots, demo URL, testing instructions) — accept when: All mandatory Devpost fields are filled and saved before the deadline, in English, with a working public demo link.
- 1–3 minute YouTube demo video — accept when: Video is publicly visible, runs between 60 and 180 seconds, names the API on screen and in audio, and shows live app footage on both form factors.

### Judging criteria [Official]
- Technological Implementation (Equally weighted)
- Design (Equally weighted)
- Potential Impact (Equally weighted)
- Quality of the Idea (Equally weighted)
- Stage One viability screen (pass/fail) (Pass/fail)

### Critical compliance issues right now
- Mandatory requirement is missing.
- Mandatory requirement is missing.
- Mandatory requirement is missing.
- Required sponsor technology Devpost has not been verified in the build (Devpost submission package (description, screenshots, demo URL, testing instructions): Not Started).
- Required sponsor technology Perfect Corp. YouCam API has not been verified in the build (Server-side YouCam Apparel VTO integration (upload → task → bounded polling): Not Started).
- Required technology YouCam API account (yce.perfectcorp.com/ai-api) is not covered by any P0 feature.
- Required technology YouTube (or Vimeo; Youku per contest page) is not covered by any P0 feature.
- Required technology Public or shared code repository (e.g., Git hosting) is not covered by any P0 feature.

## Files managed by HackathonOS (ContestForge)

`CLAUDE.md`, `BUILD-INSTRUCTIONS.md`, `README-HACKATHONOS.md`, `build-packet/` and `hackathonos/` are generated by ContestForge and updated when you sync. Do not edit or delete them while building; edits are detected as conflicts on the next sync. Put your own notes in other files.
