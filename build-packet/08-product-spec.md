# Product Specification

## Product Brief
Secondhand Fit is a web application that makes generative apparel virtual try-on work for peer-to-peer resale listings, where the only available garment image is a wrinkled flat-lay shot on a bed or floor with a phone. It adds a seller-side pre-flight pipeline (flatness, background separation, framing and occlusion checks with concrete retake instructions, plus local normalisation) that is engineered backwards from the documented input constraints of the Perfect Corp YouCam Apparel Virtual Try-On API, and a buyer-side consented single-selfie try-on whose render always carries a readiness badge and a preview-only label with a hard exclusion on fit, size and condition claims. The headline of the product is the readiness grade and the honesty layer around the render, not the render itself. Note on facts: contest requirements referenced in this spec come from the supplied contest record; all YouCam API endpoint paths, parameter names, category enums, image constraints and per-call unit costs are UNVERIFIED placeholders in this document and must be read from the official YouCam API documentation and confirmed against live calls during Step 2 of the build sequence.

## Target User
Primary: individual sellers listing one-of-one garments on peer-to-peer resale marketplaces using phone photos, who have no studio, no model and no way to make a listing try-on-ready. Secondary: buyers on those marketplaces who cannot picture a unique, effectively non-returnable item on themselves. The seller is the one who does the work in the product; the buyer is the one who gets the payoff.

## Main Problem
Virtual try-on tooling assumes clean e-commerce catalogue imagery. Resale listings never have it: garments are crumpled, shot on patterned duvets, half in shadow, partially occluded by hands or hangers. Sending those images straight to a try-on endpoint wastes API units and produces renders that silently fail or return the original clothing, which then gets presented to a buyer as if it were reliable. Sellers get no actionable guidance and buyers get no signal about how much to trust what they are seeing.

## Product Promise
Before a single API unit is spent, Secondhand Fit tells a seller exactly what is wrong with their flat-lay and how to retake it; after the render, it tells the buyer how much to trust the result and refuses to make any fit, size or condition claim.

## Primary Workflow
1. Seller opens the Create Listing page and uploads a phone flat-lay photo of a garment.
2. Browser-side readiness checks run on the image (garment bounding box / framing, background separation, flatness / wrinkle proxy via edge density, occlusion and shadow proxies) and return a pass/fail per check.
3. If any check fails, the seller sees up to three specific, ordered retake instructions (e.g. 'lay the garment flat on a plain single-colour surface', 'move the garment fully inside the frame', 'remove the hanger/hand from the shot') and can retake without any API call being made.
4. When checks pass, the server normalises the accepted image (auto-orient, crop to garment bounding box with padding, conservative background suppression, resize/encode to the documented VTO input constraints) and stores it with a computed readiness grade (A/B/C) and a per-check breakdown.
5. Listing publishes with a visible 'try-on ready' badge showing the grade and the reason the grade is not higher.
6. Buyer opens the listing, taps Try it on, reads and accepts a plain-language consent screen covering what is uploaded, where it is sent and when it is deleted.
7. Buyer uploads or captures one selfie; the server validates it, strips metadata, and checks the render cache and the API unit budget.
8. Server calls the YouCam Apparel Virtual Try-On API server-to-server (upload → create task → bounded polling with timeout and retry) using the normalised garment image and the buyer photo, with honest progress states in the UI.
9. Render returns and is displayed with the readiness badge inherited from the garment, a persistent preview-only label, and an explicit statement that no fit, size or condition claim is being made; if a silent-failure signal is detected the render is labelled as unreliable rather than shown as a clean success.
10. Buyer saves the render to a watchlist; the listing's try-on counter increments and the seller sees try-on count plus readiness grade history on their listing dashboard, with rates suppressed at small sample sizes.

## Functional Requirements
- A seller must be able to create a listing by uploading one garment photo, with title, category and size text fields (size is stored as seller-entered text and never interpreted by the system).
- Readiness checks must run before any outbound API call and must be able to reject an image entirely, with the rejection reason expressed as concrete retake instructions rather than a generic error.
- Each readiness check must produce a numeric score plus a pass/warn/fail verdict, and all thresholds must live in one centralised, documented configuration file.
- An accepted image must be normalised server-side and stored separately from the original upload, so the original can be shown in a before/after view.
- Every listing must carry a readiness grade (A/B/C) derived deterministically from the per-check scores, using worst-check-dominant logic rather than an average.
- Categories flagged as blocked (intimates, swim, and any category the YouCam terms exclude — to be verified against the official terms) must be refused at listing creation with a plain explanation.
- A buyer must pass an explicit consent step before any camera or file access for the selfie, and consent must be recorded with a timestamp and the scope accepted.
- All YouCam API calls must be made server-side; API credentials must never be present in client bundles or network responses to the browser.
- The try-on call must be implemented as asynchronous task creation plus bounded polling with a hard timeout, and must surface honest states (queued, generating, timed out, failed, unreliable result) rather than spinning indefinitely.
- Every rendered image shown anywhere in the product must carry the readiness badge and a preview-only label; the label must be part of the rendered page and also burned into any downloadable/shareable image.
- The system must never output a statement about fit, size, fabric condition, authenticity or measurement; copy must be restricted to appearance preview language.
- Renders must be cached by content hash of (normalised garment image + buyer photo + model/parameter version) so repeat attempts do not spend units.
- The system must check the remaining API unit budget before each call and fall back to a clearly labelled precomputed demo run when the configured cap is reached.
- A per-visitor fair-use cap must limit live renders per session/day, with a clear message and the precomputed fallback offered instead.
- Seller insights must show try-on count and readiness grade history for their listings, with any percentage or rate suppressed below a documented minimum sample size.
- Uploaded buyer selfies must be deleted (or verifiably expired) after a short documented retention window, with a visible 'delete my session data now' action.
- The application must ship with a seeded demo listing set (openly licensed or builder-owned garment photos) including at least one deliberately bad flat-lay and its passing retake.
- The repository must contain full source, setup instructions, environment variable documentation, a licence, and the calibration method write-up.
- The app must run in an offline mock mode (no YouCam calls) driven by pinned fixtures captured from real API runs, so reviewers can inspect the flow without spending units.

## Required Contest Integrations
- **Perfect Corp. YouCam API — Apparel / Virtual Try-On (eCommerce VTO track)** — The render engine on the critical path of the buyer flow. Server-side integration only: file upload, asynchronous task creation, bounded polling, result retrieval, and (if available) an account balance/credit read used by the budget guard. The entire seller-side readiness and normalisation pipeline is designed backwards from this endpoint's documented input requirements, so the integration is a design constraint rather than a single call. Exact endpoint paths, model/version slug, category enum values, image size and format constraints, and per-call unit cost must be read from the official YouCam API documentation and confirmed empirically — treat every such value in this spec as unverified. _(satisfies: Mandatory: 'At least one Perfect Corp. YouCam API integrated in a working app' and 'The solution must be a functional web or mobile prototype integrating at least one YouCam API')_
- **YouCam API account (yce.perfectcorp.com/ai-api) and the optional 1,000 free-unit redeem code** — Free account created and credentials stored as server-only environment variables. The optional redeem code is requested and applied to fund the calibration phase and the judge-facing live demo. A unit ledger in the database records spend per call so the remaining budget is known at all times. _(satisfies: Mandatory: 'Create a free YouCam API account'; Optional: 'Redeem the 1,000 free API units code')_
- **Devpost** — Registration via 'Join Hackathon' and submission of all required fields: text description of features and eCommerce value, screenshots, repository URL, demo video URL, working demo URL and testing instructions, plus track selection (eCommerce VTO) and any Special Award opt-ins. _(satisfies: Mandatory: 'Register on Devpost via Join Hackathon' and 'Submit all required fields on the Enter a Submission page before Nov 2, 2026 11:45 am ET')_
- **YouTube (public video hosting)** — Host the 1–3 minute demo video publicly and link it on the Devpost submission form. The video shows the end-to-end flow on the target device (desktop and mobile browser), names the YouCam API used, and uses only licensed or original audio and assets. _(satisfies: Mandatory: 'Demo video between 1 and 3 minutes', 'Video explains which YouCam API(s) are used', 'Video includes footage of the Project functioning on its target device', 'Video publicly hosted on YouTube (preferred) or Vimeo')_
- **Public Git repository (e.g. GitHub) with an open licence** — Public repository containing all source code, seeded demo assets with provenance/licence notes, environment setup instructions, calibration script and method write-up, and offline mock mode instructions. If kept private instead, it must be shared with contact_event@PerfectCorp.com. _(satisfies: Mandatory: 'Code repository URL provided with full source, assets and setup instructions' and 'Repository is public with relevant licensing, or private and shared with contact_event@PerfectCorp.com')_
- **Publicly hosted deployment (Vercel)** — Free, unauthenticated, judge-accessible live URL running the full flow with seeded demo listings, available through the end of the Judging Period, with a labelled precomputed fallback so it never appears broken if units run out. _(satisfies: Mandatory: 'Working demo accessible free of charge to judges until the end of the Judging Period' and 'Project runs consistently on its intended platform and matches the description')_
- **REST over HTTPS (standard HTTP integration)** — All YouCam calls made as plain server-side REST requests from Next.js route handlers through a single-file API adapter, with typed request/response models and pinned fixtures. _(satisfies: Recommended: 'REST API (standard HTTP integration)' per the contest page)_

## Error States
- Unsupported file type or oversized image on upload — named limits shown, no API call made.
- Readiness checks fail — not shown as an error but as a retake screen with up to three specific instructions and the original photo still visible.
- Garment bounding box could not be found at all (e.g. garment fills the entire frame or is indistinguishable from the background) — explicit 'we could not find the garment edges' state with a plain-surface instruction, rather than a silent low score.
- Blocked category selected — refusal with the reason and a pointer to the scope statement.
- Try-on attempted without a valid consent record — server refuses with a redirect back to the consent gate.
- Selfie fails the local quality gate (too small, too dark, no detectable subject) — retake prompt before any unit is spent.
- YouCam upload rejected (format/size/constraint violation) — the exact provider-reported reason surfaced verbatim in a developer-visible panel plus a plain-language user message; the unit ledger records zero spend.
- VTO task creation fails (auth, quota, service error) — mode switches to labelled precomputed fallback with an explanation banner.
- Polling exceeds the bounded timeout — 'render did not finish in time' state with retry and fallback options; partial spend recorded honestly.
- Silent failure detected (render appears to retain the original clothing) — result shown but labelled 'this render looks unreliable' with the detection reason, never presented as a clean success.
- Unit budget cap reached — precomputed labelled run served and the status banner explains why.
- Per-session fair-use cap reached — clear message with the reset window and the precomputed alternative.
- Database or storage unavailable — friendly failure page that still renders the methods and status pages from static content.
- Direct navigation to a try-on result id that does not belong to the current session — 404 rather than leaking another session's render.

## Empty States
- Browse listings with no user-created listings — seeded demo listings shown with an explicit 'demo listing' label and provenance note.
- Seller dashboard with no listings — a short explainer of the readiness pipeline plus a call to upload the first flat-lay.
- Seller insights with fewer try-ons than the minimum sample threshold — cells read 'not enough data yet' instead of a percentage.
- Watchlist empty — prompt pointing at the demo listing with the worked before/after example.
- Grade history for a listing with a single attempt — timeline shows one point and states that history appears after a retake.
- Calibration samples table empty (fresh clone) — points to the calibration script and the pinned fixtures.

## Loading States
- Client-side readiness analysis: per-check skeleton rows that resolve individually as each canvas pass completes, so the seller sees progress rather than one blocking spinner.
- Normalisation: before/after panel with the 'after' side skeletonised while sharp processes the image.
- Try-on: staged progress (validating → uploading garment → uploading photo → task queued → generating → finishing) driven by real state transitions, showing elapsed seconds and the stated timeout, with an aria-live region announcing each stage.
- Cache hit: an immediate result with a 'served from cache — no API units spent' note instead of a fake delay.
- Seller insights: skeleton table rows while counts load.
- Status page: live budget read with a loading state and an explicit 'estimate' label if the provider balance read is unavailable.

## Security Requirements
- YouCam credentials stored only as server-side environment variables; never imported into client components, never echoed in API responses, never logged.
- All provider traffic routed through Next.js route handlers; the browser never receives a provider URL with credentials or a signed provider token.
- Consent enforced server-side: no try-on request is processed without a matching ConsentRecord at the current scope version.
- EXIF and all image metadata stripped on ingest for both garment photos and buyer selfies.
- MIME sniffing plus extension and byte-size validation on every upload; reject anything not a supported raster image.
- Private object storage with short-lived signed read URLs; buyer assets and renders scoped to the session that created them.
- Short documented retention window on buyer selfies and renders with an expiry sweep, plus a user-triggered delete-everything action that confirms deletion.
- Rate limiting per session and per IP on upload, readiness and try-on routes; hard daily cap on live renders.
- Fail-closed behaviour: if the budget guard, consent check or cache lookup errors, the system falls back to the labelled precomputed run rather than making an uncontrolled paid call.
- Admin-only calibration route protected by a server-side token and disabled by default in production.
- No accounts and no PII fields in the MVP beyond hashed session identifiers, reducing the breach surface.
- Copy-guard CI lint prevents claim language from shipping; build fails if banned vocabulary appears in user-facing strings.
- Demo assets limited to builder-owned or openly licensed photographs, with licence and provenance recorded in the repository.

## Accessibility
- Readiness grades and check verdicts communicated with text and icons, never colour alone.
- All async progress announced through aria-live polite regions, including stage changes, timeouts and silent-failure warnings.
- Full keyboard operability for the upload, retake, consent, capture and save flows; visible focus rings throughout.
- Consent dialog implemented as a proper modal with focus trap, labelled heading and an explicit close/decline path.
- Meaningful alt text on every image, including generated renders ('AI-generated preview of [garment title] on an uploaded photo — preview only').
- Before/after slider has a keyboard-accessible control and a text fallback listing what changed (cropped, reoriented, background suppressed).
- Form fields labelled, errors associated with inputs via aria-describedby, and error summaries focusable.
- WCAG AA contrast on all text, badges and disclaimers; disclaimers never rendered as low-contrast fine print.
- Respect prefers-reduced-motion for progress animations and tile reveals.
- Automated axe checks run in CI on the main routes.

## Responsive Behavior
- Mobile-first: the seller capture flow is designed for a phone held one-handed, since the source photo is taken on a phone.
- Direct camera capture on mobile (capture attribute) with file upload fallback on desktop.
- Readiness check panel stacks vertically on small screens and sits beside the image preview on desktop.
- Before/after slider becomes a stacked two-image comparison below a defined breakpoint where the slider handle would be too cramped.
- Render result fills the viewport width on mobile with the honesty label pinned beneath the image and always in view without scrolling.
- Listing grid: one column on phones, two on tablets, three or four on desktop, with the grade badge legible at the smallest tile size.
- Seller insights table converts to stacked cards on narrow screens rather than horizontal scrolling.
- Tap targets at least 44px; no hover-only interactions.
