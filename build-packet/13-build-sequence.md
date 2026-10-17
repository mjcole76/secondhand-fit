# Build Sequence

Keep a working application after every step. Commit after each step.

## Step 1: 1. Scaffold a deployed, working shell
Next.js (App Router) + TypeScript, Tailwind, Prisma + Postgres, object storage binding, Vercel deployment. Ship a landing page, a /status page and a health check on day one. Create the GitHub repo with licence and start the README in the same commit. Working application from this step onward.

## Step 2: 2. Integrate the YouCam Apparel VTO API first (builder lesson: integrate the sponsor technology first)
Read the official YouCam API docs and record the real endpoint paths, auth scheme, model/version slug, category enum values, input image constraints and observed per-call unit cost into a single-file adapter plus a docs note. Build an admin-only page that runs one manual garment+person render end-to-end: upload → create task → bounded poll → display result. Capture the raw request/response as pinned fixtures and build offline mock mode against them immediately. Do not proceed until a live render succeeds from the deployed environment.

## Step 3: 3. Calibration phase on deliberately degraded inputs
Assemble the small owned/openly-licensed garment photo set. Run a scripted matrix of degradations (crumpled, patterned background, cropped edge, hand/hanger occlusion, heavy shadow, low resolution) through the API, recording for each whether it errored, produced a plausible render, or returned the original clothing. Store every run in CalibrationSample. Budget this explicitly against the free unit allocation and log spend. Output: a thresholds file plus a written method note. This is the empirical basis for everything downstream and the core of the technical write-up.

## Step 4: 4. P0 seller readiness pipeline
Implement computeFramingScore, computeBackgroundSeparationScore, computeFlatnessScore, computeOcclusionShadowScore, gradeReadiness and generateRetakeInstructions against the calibrated thresholds. Build /sell/new with the dropzone, check panel and retake instruction list. Persist ReadinessRun per attempt. App still fully working; no provider calls in this path.

## Step 5: 5. P0 normalisation, listing publish and browse
Add normaliseGarmentImage (orient, crop, conservative background suppression, resize/encode to the verified constraints), the before/after slider, publish flow with the readiness grade badge, blocked-category refusal, and the /listings and /listings/[id] pages seeded with demo listings including the deliberately bad flat-lay and its passing retake.

## Step 6: 6. P0 buyer flow wired to the adapter from step 2
Consent gate with recorded consent, selfie capture with local quality gate, POST /api/tryon with server-side consent enforcement, bounded polling proxy, RenderProgress stages, and RenderResultCard with the inherited readiness badge, burned-in and on-page preview-only label, and save-to-watchlist. P0 is now feature-complete end to end.

## Step 7: 7. P0 demo resilience: budget guard, precomputed fallback, mode banner
UsageLedger writes on every call, budget check before each call, labelled precomputed run when the cap is hit or the provider errors, per-session fair-use cap, and the /status page reporting the current mode. Guarantees the judge-facing demo never appears broken.

## Step 8: 8. P0 submission scaffolding (written while building, not at the end)
Finish the README with setup, environment variables, mock mode and calibration instructions; confirm the repo is public with a licence; capture first-pass screenshots; draft the Devpost description naming the YouCam Apparel VTO API and the eCommerce VTO track. P0 complete before any P1 work starts.

## Step 9: 9. P1 trust layer: silent-failure detection and render cache
Implement detectSilentFailure using the calibration observations, surface the 'unreliable render' state, and add content-addressed caching keyed on garment+selfie+model version with the 'no units spent' note.

## Step 10: 10. P1 methods page, seller insights and copy guard
Publish /methods documenting each check, its threshold, its calibration provenance and its limitations plus the explicit refusal list. Add seller insights with try-on counts, grade history and small-sample suppression. Add the copy-guard CI lint and an axe accessibility check to CI.

## Step 11: 11. P1 polish: responsive, accessibility, error and empty states
Sweep all breakpoints, keyboard paths, aria-live announcements, error and empty states, and reduced-motion handling. Re-run the full acceptance test list.

## Step 12: 12. Demo video and final submission
Record the 1–3 minute video opening on the bad flat-lay rejection within the first 15 seconds, show the retake grading, then the render with its badge and label, and state the YouCam Apparel VTO API by name with a shot of the working app on both desktop and mobile browser. Upload publicly to YouTube with only original or licensed audio. Submit on Devpost with description, screenshots, repo URL, live demo URL and testing instructions before the deadline; opt in to any applicable Special Awards.

## Step 13: 13. P2 only if time remains
Watchlist enhancements, grade distribution across the demo catalogue, shareable render permalinks with the label preserved, additional garment categories — none of which may delay steps 1–12.
