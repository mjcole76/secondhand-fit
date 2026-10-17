# UI Specification

## Pages
| Page | Route | Purpose |
|---|---|---|
| Home / Landing | `/` | One-screen statement of the problem with a visible before/after of a bad flat-lay versus the normalised, accepted image; entry points to the seller flow and to the demo listing grid. Carries the global honesty footer. |
| Browse listings | `/listings` | Grid of demo and user-created listings, each tile showing the garment thumbnail and its readiness grade badge, so the grade is legible before any interaction. |
| Listing detail (buyer view) | `/listings/[id]` | Garment photo, seller-entered details, readiness grade with per-check breakdown in plain language, try-on count, and the 'Try it on' call to action. |
| Consent gate | `/listings/[id]/try-on/consent` | Plain-language consent screen before any camera or file picker: what is uploaded, that it is sent to the Perfect Corp YouCam Apparel VTO API for rendering, retention window, deletion control, and the no-fit-claim statement. |
| Try-on capture and result | `/listings/[id]/try-on` | Selfie capture/upload with framing guidance, honest async progress state, then the render shown with the inherited readiness badge, preview-only label, silent-failure warning if triggered, and save-to-watchlist. |
| Create listing (seller capture flow) | `/sell/new` | Guided upload with live readiness checks, per-check results, ordered retake instructions, retake loop, and the normalised preview before publishing. |
| Seller dashboard | `/sell` | The seller's listings with readiness grade, grade history across retakes, try-on counts, and small-sample suppression on any rate. |
| Watchlist | `/watchlist` | Buyer's saved renders, each still labelled preview-only with its readiness badge and the source listing link. |
| How we grade (methods) | `/methods` | Public methods page: each readiness check, what it measures, the current threshold, how thresholds were derived from real API runs on deliberately degraded inputs, known limitations, and what the product explicitly refuses to claim. |
| Status / budget | `/status` | Judge-facing transparency page: live vs mock vs precomputed mode, remaining unit budget band, cache hit behaviour, and a statement of what is precomputed in the demo. |

## Components
- **FlatLayDropzone** — Accepts a photo via file picker or mobile camera, validates MIME type and size client-side, renders the image to a canvas for analysis.
- **ReadinessCheckPanel** — Shows each check (framing, background separation, flatness, occlusion/shadow) with its verdict, score bar and plain-language explanation.
- **RetakeInstructionList** — Renders up to three ordered, concrete retake instructions generated deterministically from failed checks, each with an example illustration.
- **ReadinessGradeBadge** — Reusable A/B/C badge with a tooltip naming the weakest check; used on listing tiles, listing detail, render results and watchlist items. Never colour-only — always includes the letter and text.
- **BeforeAfterSlider** — Compares the original upload with the normalised garment image; the key visual proof of the pre-processing pipeline.
- **NormalisedPreview** — Displays the cropped, background-suppressed, correctly oriented garment exactly as it will be sent to the VTO endpoint.
- **ConsentDialog** — Blocking, plain-language consent with explicit scope checkboxes and a recorded acceptance; cannot be bypassed by direct navigation.
- **SelfieCapture** — Camera or upload with simple framing guidance and a local quality gate (face present-ish, resolution, not overly dark) before spending a unit.
- **RenderProgress** — Honest async progress: queued → uploading → generating → finishing, with elapsed time, a stated timeout, and an aria-live announcement for screen readers.
- **RenderResultCard** — The render with burned-in and on-page preview-only label, inherited readiness badge, silent-failure warning slot, save and delete actions.
- **HonestyLabel** — Persistent component stating 'visual preview only — not a fit, size, condition or authenticity guarantee'; required on every surface that shows a render.
- **BlockedCategoryNotice** — Explains why intimates, swim and other excluded categories are refused, shown at listing creation.
- **BudgetModeBanner** — Names the current mode (live API / cached / labelled precomputed demo / offline mock) wherever a render is produced.
- **SellerInsightsTable** — Try-on counts and grade history per listing with explicit 'not enough data' cells below the minimum sample threshold.
- **MethodsSection** — Reusable block rendering a check definition, its threshold, its provenance from the calibration run, and its stated limitation.

## States
- Empty: Browse listings with no user-created listings — seeded demo listings shown with an explicit 'demo listing' label and provenance note.; Seller dashboard with no listings — a short explainer of the readiness pipeline plus a call to upload the first flat-lay.; Seller insights with fewer try-ons than the minimum sample threshold — cells read 'not enough data yet' instead of a percentage.; Watchlist empty — prompt pointing at the demo listing with the worked before/after example.; Grade history for a listing with a single attempt — timeline shows one point and states that history appears after a retake.; Calibration samples table empty (fresh clone) — points to the calibration script and the pinned fixtures.
- Loading: Client-side readiness analysis: per-check skeleton rows that resolve individually as each canvas pass completes, so the seller sees progress rather than one blocking spinner.; Normalisation: before/after panel with the 'after' side skeletonised while sharp processes the image.; Try-on: staged progress (validating → uploading garment → uploading photo → task queued → generating → finishing) driven by real state transitions, showing elapsed seconds and the stated timeout, with an aria-live region announcing each stage.; Cache hit: an immediate result with a 'served from cache — no API units spent' note instead of a fake delay.; Seller insights: skeleton table rows while counts load.; Status page: live budget read with a loading state and an explicit 'estimate' label if the provider balance read is unavailable.
- Error: Unsupported file type or oversized image on upload — named limits shown, no API call made.; Readiness checks fail — not shown as an error but as a retake screen with up to three specific instructions and the original photo still visible.; Garment bounding box could not be found at all (e.g. garment fills the entire frame or is indistinguishable from the background) — explicit 'we could not find the garment edges' state with a plain-surface instruction, rather than a silent low score.; Blocked category selected — refusal with the reason and a pointer to the scope statement.; Try-on attempted without a valid consent record — server refuses with a redirect back to the consent gate.; Selfie fails the local quality gate (too small, too dark, no detectable subject) — retake prompt before any unit is spent.; YouCam upload rejected (format/size/constraint violation) — the exact provider-reported reason surfaced verbatim in a developer-visible panel plus a plain-language user message; the unit ledger records zero spend.; VTO task creation fails (auth, quota, service error) — mode switches to labelled precomputed fallback with an explanation banner.; Polling exceeds the bounded timeout — 'render did not finish in time' state with retry and fallback options; partial spend recorded honestly.; Silent failure detected (render appears to retain the original clothing) — result shown but labelled 'this render looks unreliable' with the detection reason, never presented as a clean success.; Unit budget cap reached — precomputed labelled run served and the status banner explains why.; Per-session fair-use cap reached — clear message with the reset window and the precomputed alternative.; Database or storage unavailable — friendly failure page that still renders the methods and status pages from static content.; Direct navigation to a try-on result id that does not belong to the current session — 404 rather than leaking another session's render.

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

## Responsive
- Mobile-first: the seller capture flow is designed for a phone held one-handed, since the source photo is taken on a phone.
- Direct camera capture on mobile (capture attribute) with file upload fallback on desktop.
- Readiness check panel stacks vertically on small screens and sits beside the image preview on desktop.
- Before/after slider becomes a stacked two-image comparison below a defined breakpoint where the slider handle would be too cramped.
- Render result fills the viewport width on mobile with the honesty label pinned beneath the image and always in view without scrolling.
- Listing grid: one column on phones, two on tablets, three or four on desktop, with the grade badge legible at the smallest tile size.
- Seller insights table converts to stacked cards on narrow screens rather than horizontal scrolling.
- Tap targets at least 44px; no hover-only interactions.
