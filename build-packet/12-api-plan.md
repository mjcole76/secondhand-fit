# API Plan

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/listings` | Create a draft listing with metadata; refuses blocked categories. |
| POST | `/api/listings/[id]/upload` | Accept the original flat-lay, strip metadata, validate MIME/size, store, and return an asset reference. |
| POST | `/api/listings/[id]/readiness` | Run/confirm server-side readiness scoring on the uploaded asset, persist a ReadinessRun, and return per-check verdicts, grade and ordered retake instructions. |
| POST | `/api/listings/[id]/normalise` | Auto-orient, crop to garment bbox, conservatively suppress background, resize/encode to the documented VTO input constraints, store the normalised asset and its hash. |
| POST | `/api/listings/[id]/publish` | Publish a listing once an accepted normalised asset and grade exist. |
| GET | `/api/listings` | List published listings with grade badges for the browse grid. |
| POST | `/api/consent` | Record buyer consent for a session + listing with the current scope version. |
| POST | `/api/tryon` | Validate consent, fair-use cap and budget; hash the buyer photo; return a cached render if present, otherwise upload both images to YouCam and create the VTO task; returns a render id. |
| GET | `/api/tryon/[renderId]` | Bounded polling proxy: report queued/running/succeeded/timeout/failed/unreliable and return the result URL and badge payload when ready. |
| POST | `/api/tryon/[renderId]/save` | Save a successful render to the session watchlist and increment the listing try-on counter. |
| GET | `/api/seller/insights` | Return per-listing try-on counts and grade history with small-sample suppression applied server-side. |
| GET | `/api/status` | Report current mode (live/cache/precomputed/mock), remaining unit budget band and cache statistics for the judge-facing status page. |
| POST | `/api/session/delete` | Delete all buyer assets, renders and watchlist items for the current session and confirm deletion. |
| POST | `/api/admin/calibrate` | Guarded calibration runner: submits pinned degraded fixtures to the API, records outcomes into CalibrationSample, and writes the derived threshold report. Disabled in production without an admin token. |

## Contest integrations
- **Perfect Corp. YouCam API — Apparel / Virtual Try-On (eCommerce VTO track)** — The render engine on the critical path of the buyer flow. Server-side integration only: file upload, asynchronous task creation, bounded polling, result retrieval, and (if available) an account balance/credit read used by the budget guard. The entire seller-side readiness and normalisation pipeline is designed backwards from this endpoint's documented input requirements, so the integration is a design constraint rather than a single call. Exact endpoint paths, model/version slug, category enum values, image size and format constraints, and per-call unit cost must be read from the official YouCam API documentation and confirmed empirically — treat every such value in this spec as unverified.
- **YouCam API account (yce.perfectcorp.com/ai-api) and the optional 1,000 free-unit redeem code** — Free account created and credentials stored as server-only environment variables. The optional redeem code is requested and applied to fund the calibration phase and the judge-facing live demo. A unit ledger in the database records spend per call so the remaining budget is known at all times.
- **Devpost** — Registration via 'Join Hackathon' and submission of all required fields: text description of features and eCommerce value, screenshots, repository URL, demo video URL, working demo URL and testing instructions, plus track selection (eCommerce VTO) and any Special Award opt-ins.
- **YouTube (public video hosting)** — Host the 1–3 minute demo video publicly and link it on the Devpost submission form. The video shows the end-to-end flow on the target device (desktop and mobile browser), names the YouCam API used, and uses only licensed or original audio and assets.
- **Public Git repository (e.g. GitHub) with an open licence** — Public repository containing all source code, seeded demo assets with provenance/licence notes, environment setup instructions, calibration script and method write-up, and offline mock mode instructions. If kept private instead, it must be shared with contact_event@PerfectCorp.com.
- **Publicly hosted deployment (Vercel)** — Free, unauthenticated, judge-accessible live URL running the full flow with seeded demo listings, available through the end of the Judging Period, with a labelled precomputed fallback so it never appears broken if units run out.
- **REST over HTTPS (standard HTTP integration)** — All YouCam calls made as plain server-side REST requests from Next.js route handlers through a single-file API adapter, with typed request/response models and pinned fixtures.

Keep API keys server-side. Handle provider failures with a visible, recoverable error state.
