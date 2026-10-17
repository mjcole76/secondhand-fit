# Acceptance Tests

## 1. Bad flat-lay is rejected with specific instructions and zero API spend
**Steps:** Open /sell/new, upload the seeded 'crumpled on a patterned duvet, half in shadow' fixture, submit for readiness checks.

**Expected:** Readiness result is a rejection; up to three concrete retake instructions are shown naming the specific failing checks; the UsageLedger records no entry and no outbound YouCam request is made (assert via network mock).

## 2. Retake passes and receives a grade
**Steps:** In the same flow, upload the seeded retake fixture of the same garment.

**Expected:** All hard checks pass, a grade (A or B) is assigned, the normalised preview and before/after comparison render, and the listing can be published with a visible 'try-on ready' badge showing the grade and the weakest check.

## 3. Consent is mandatory and enforced server-side
**Steps:** Attempt to POST /api/tryon for a listing from a session with no ConsentRecord.

**Expected:** Request is refused with a clear error and no provider call is made; the UI redirects to the consent gate.

## 4. End-to-end live try-on returns a labelled render
**Steps:** From a published listing, accept consent, upload a permitted test selfie, wait for the render.

**Expected:** A YouCam Apparel VTO task is created server-side, polling completes within the bounded timeout, the render displays with the inherited readiness badge, the persistent preview-only label is visible on screen and burned into the image, and unitsSpent is recorded in UsageLedger.

## 5. Credentials never reach the browser
**Steps:** Load every route with devtools open; grep the client bundle and all network responses for the credential env var names and values.

**Expected:** No match anywhere in client JS, HTML or JSON responses; all provider traffic originates from server routes.

## 6. Cache prevents duplicate spend
**Steps:** Repeat the identical (listing, selfie) try-on in the same session.

**Expected:** The second result is served from cache with source='cache', a visible 'no API units spent' note, and no new UsageLedger spend entry.

## 7. Budget cap triggers the labelled precomputed run
**Steps:** Set the configured unit cap to the current spend and request a new try-on.

**Expected:** A precomputed demo render is shown, clearly labelled as precomputed and not a live API result, with an explanatory banner; no provider call is attempted.

## 8. Silent failure is reported, not hidden
**Steps:** Run the pinned fixture known from calibration to return the original clothing (or inject the recorded fixture response in mock mode).

**Expected:** detectSilentFailure flags the render, status is 'unreliable', and the UI shows an explicit warning with the reason instead of presenting a clean success.

## 9. Blocked categories are refused
**Steps:** Attempt to create a listing under a blocked category (intimates or swim).

**Expected:** Creation is refused with a plain explanation and a link to the scope statement; no upload or readiness run is created.

## 10. No claim language anywhere
**Steps:** Run the copy-guard CI lint across all user-facing strings and manually review the render result, listing detail and watchlist screens.

**Expected:** Lint passes with zero banned terms; no screen asserts fit, size, measurements, condition or authenticity.

## 11. Small-sample suppression in seller insights
**Steps:** View insights for a listing with fewer try-ons than the configured minimum.

**Expected:** Counts are shown but every rate or percentage reads 'not enough data yet'; no computed rate is displayed.

## 12. Session data deletion works
**Steps:** Complete a try-on, save it, then use the delete-my-data action.

**Expected:** Buyer selfie, render, watchlist entries and consent record for the session are removed from storage and database, and a confirmation is shown; the render URL no longer resolves.

## 13. Offline mock mode runs the full flow without units
**Steps:** Set the mock environment flag, clone-fresh, seed, and run the seller and buyer flows.

**Expected:** Every step completes using pinned fixtures, the mode banner reads 'offline mock', and zero outbound provider requests occur.

## 14. Judge-facing demo is reachable and free
**Steps:** Open the public deployment URL in a fresh private browser window with no credentials.

**Expected:** Home, listings, methods and status pages load; the seeded demo listing supports a complete try-on (live, cached or labelled precomputed) with no login or payment.

## Feature acceptance (from the feature map)
- [ ] **P0 Server-side YouCam Apparel VTO integration (upload → task → bounded polling)** — A live render completes end to end from the deployed environment; client bundle and network responses contain no credentials; pinned fixtures exist for offline mock mode.
- [ ] **P0 Seller readiness checker with specific retake instructions** — The seeded bad flat-lay is rejected with three specific instructions and zero provider calls recorded.
- [ ] **P0 Local normalisation of accepted garment images** — A normalised asset is produced within the documented input constraints and the before/after comparison renders correctly for the seeded pair.
- [ ] **P0 Try-on readiness grade on the listing** — Every published listing displays a letter grade plus text reason; a single hard-failing check cannot be averaged into a higher grade.
- [ ] **P0 Buyer consent gate enforced server-side** — A try-on request without a matching current-version consent record is refused server-side and no provider call is made.
- [ ] **P0 Buyer selfie capture and single render with honest progress** — A render completes and displays within the bounded timeout, or a clear timeout state appears; progress stages reflect real state transitions rather than a fake timer.
- [ ] **P0 Readiness badge and preview-only honesty label on every render** — The label is visible on the result, watchlist and any downloaded image; the copy-guard lint passes with zero banned claim terms.
- [ ] **P0 Blocked categories and published scope exclusions** — Selecting a blocked category refuses listing creation before upload, with the reason shown and linked to the scope statement.
- [ ] **P0 Unit budget guard with labelled precomputed fallback** — With the cap set to current spend, a try-on returns a precomputed render explicitly labelled as not live, and no provider call is attempted.
- [ ] **P0 Seeded demo listing set with the bad flat-lay and its retake** — A judge landing cold on the deployed URL can reproduce the rejection and the passing retake without uploading anything, and each asset's licence is documented.
- [ ] **P0 Public repository with README, setup instructions and licence** — A fresh clone runs in offline mock mode following only the README, with no undocumented steps.
- [ ] **P0 Devpost submission package (description, screenshots, demo URL, testing instructions)** — All mandatory Devpost fields are filled and saved before the deadline, in English, with a working public demo link.
- [ ] **P0 1–3 minute YouTube demo video** — Video is publicly visible, runs between 60 and 180 seconds, names the API on screen and in audio, and shows live app footage on both form factors.
- [ ] **P1 Empirical calibration harness and threshold provenance** — Every threshold in the config file traces to at least one recorded calibration observation, and the run log is committed to the repository.
- [ ] **P1 Silent-failure detection on returned renders** — The pinned silent-failure fixture produces an 'unreliable' status and a visible warning rather than a clean success state.
- [ ] **P1 Content-addressed render cache** — A repeated identical try-on returns source='cache' with no new ledger spend entry.
- [ ] **P1 Public methods page documenting checks, thresholds and limitations** — Every check listed in the code appears on /methods with a threshold, a provenance note and a stated limitation.
- [ ] **P1 Seller insights: try-on counts and grade history with small-sample suppression** — A listing below the sample threshold shows counts but no computed rate; grade history shows one point per readiness attempt.
- [ ] **P1 Offline mock mode from pinned fixtures** — With the mock flag set and no credentials configured, both flows complete and zero outbound provider requests occur.
- [ ] **P1 Session data deletion and short retention on buyer assets** — After deletion, the selfie, render, watchlist entries and consent record for the session are gone and the render URL no longer resolves.
- [ ] **P1 Copy-guard CI lint and automated accessibility check** — Introducing a banned term into any user-facing string fails CI; axe reports no critical violations on the main routes.
