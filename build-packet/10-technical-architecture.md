# Technical Architecture

## Tech Stack
- TypeScript
- Next.js (App Router) with React
- Node.js server runtime for route handlers
- Tailwind CSS
- Prisma ORM
- PostgreSQL (free-tier managed Postgres)
- Vercel (hosting and deployment)
- Vercel Blob or equivalent free-tier object storage
- sharp (server-side image processing)
- HTML Canvas API (client-side readiness heuristics)
- Zod (request and configuration validation)
- Perfect Corp YouCam Apparel Virtual Try-On REST API
- Vitest (unit tests for scoring and grading logic)
- Playwright + axe-core (end-to-end and accessibility checks in CI)
- GitHub Actions (CI: tests, copy-guard lint, accessibility check)

## Architecture Idea
Next.js + TypeScript on Vercel. Browser-side pre-checks using canvas heuristics (edge density for flatness/wrinkle proxy, background variance, garment bounding box) with a lightweight segmentation pass server-side for normalisation. API routes handle YouCam upload, task creation and bounded polling. Postgres (Prisma) for listings, readiness grades and try-on counts. Content-addressed render cache keyed on garment hash + buyer photo hash. Documented calibration notebook/script showing how thresholds were derived from real API runs.

## Database
### Listing
- id
- title
- categorySlug
- sellerSizeText
- sellerNote
- originalImageKey
- normalisedImageKey
- normalisedImageHash
- readinessGrade
- readinessScoreJson
- status (draft|published|blocked)
- isDemo
- tryOnCount
- createdAt
- updatedAt

_sellerSizeText is stored verbatim and never parsed or used in any claim. isDemo marks the seeded fixture set._

### ReadinessRun
- id
- listingId
- attemptNumber
- imageKey
- framingScore
- backgroundScore
- flatnessScore
- occlusionScore
- verdictPerCheckJson
- grade
- accepted
- instructionsJson
- thresholdVersion
- createdAt

_One row per upload attempt, including rejected ones; this is what powers grade history and the retake narrative._

### ConsentRecord
- id
- sessionId
- listingId
- scopeVersion
- acceptedAt
- ipHash
- userAgentHash

_Hashed identifiers only. A try-on request without a matching, current-version consent record is refused server-side._

### TryOnRender
- id
- listingId
- sessionId
- garmentHash
- buyerPhotoHash
- cacheKey
- source (live|cache|precomputed|mock)
- providerTaskId
- status (queued|running|succeeded|timeout|failed|unreliable)
- resultImageKey
- silentFailureScore
- silentFailureVerdict
- latencyMs
- unitsSpent
- readinessGradeAtRender
- createdAt
- expiresAt

_cacheKey = hash(garmentHash + buyerPhotoHash + providerModelVersion + paramVersion). unitsSpent must be recorded from observed behaviour, not assumed._

### UsageLedger
- id
- sessionId
- endpoint
- unitsSpent
- runningRemainingEstimate
- mode
- createdAt

_Append-only. Backs the budget guard and the /status page. Remaining balance should be reconciled with the provider's balance endpoint if one exists (verify in docs)._

### WatchlistItem
- id
- sessionId
- renderId
- listingId
- createdAt

_Anonymous session-scoped; no accounts required in the MVP._

### BuyerAsset
- id
- sessionId
- imageKey
- hash
- createdAt
- deleteAfter
- deletedAt

_Short retention window enforced by an expiry sweep plus an explicit user-triggered delete. Metadata stripped on ingest._

### CalibrationSample
- id
- label
- degradationType
- inputImageKey
- measuredScoresJson
- providerOutcome
- returnedOriginalGarment
- notes
- createdAt

_Records of the deliberately degraded inputs run against the API during calibration; the evidence base for the threshold values shown on /methods._

## AI Functions
- **computeFramingScore** — Canvas/sharp-based garment bounding box estimation; scores how much of the frame the garment occupies and whether it is clipped at any edge. Deterministic CV, no model.
- **computeBackgroundSeparationScore** — Measures colour/texture variance and edge activity outside the garment bbox to estimate how distinguishable the garment is from a duvet, carpet or patterned floor.
- **computeFlatnessScore** — Edge-density and local-gradient proxy for wrinkling and folding inside the garment region — a stand-in for 'is this laid flat', explicitly documented as a proxy, not a measurement.
- **computeOcclusionShadowScore** — Detects large dark regions and high-contrast intrusions (hands, hangers, cast shadow) overlapping the garment region.
- **gradeReadiness** — Combines per-check scores into an A/B/C grade using worst-check-dominant rules from the centralised threshold file; a single hard fail cannot be averaged away.
- **generateRetakeInstructions** — Deterministic rule-to-copy mapping from failed checks to at most three ordered, concrete instructions. Template-based and reviewed, so it can never emit a fit, size or condition claim.
- **normaliseGarmentImage** — Server-side auto-orient, crop-with-padding to the garment bbox, conservative background suppression (flatten to neutral where confidence is high, leave untouched where it is not), resize and encode to the VTO input constraints.
- **detectSilentFailure** — Post-render comparison between the buyer's source photo and the render (garment-region difference and colour distance against the normalised garment) to detect the known case where the endpoint returns the original clothing; reported as a warning state, never hidden.
- **hashForCache** — Content-addressed hashing of normalised garment bytes, buyer photo bytes and provider model/parameter version to build the render cache key.
- **copyGuardLint** — Build-time lint over user-facing copy strings blocking banned claim vocabulary (fit, true to size, measurements, authentic, condition-grade, guarantee), enforced in CI rather than by convention.

## External Services
- **Perfect Corp YouCam API — Apparel Virtual Try-On** — Mandatory sponsor technology and the render engine of the buyer flow; called server-to-server with bounded polling.
- **Vercel** — Hosting for the Next.js app and route handlers; provides the free, judge-accessible demo URL.
- **Postgres (Vercel Postgres, Neon or Supabase free tier) via Prisma** — Persistence for listings, readiness runs, renders, consent, usage ledger and calibration samples.
- **Object storage (Vercel Blob or equivalent free tier)** — Private storage for original uploads, normalised garment images, buyer selfies and renders, with short retention on buyer assets.
- **sharp (server image processing)** — Orientation, cropping, resizing, encoding and metadata stripping in the normalisation pipeline.
- **GitHub** — Public repository with source, licence, setup instructions and the calibration write-up.
- **YouTube** — Public hosting of the 1–3 minute demo video required by the contest.
- **Devpost** — Registration and submission platform.
