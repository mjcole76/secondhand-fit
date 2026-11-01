# Secondhand Fit

**Live demo:** https://secondhand-fit.onrender.com · **Demo video:** https://youtu.be/IQ6xkc6ZnL8 ·
**Reviewer steps:** [docs/devpost/testing-instructions.md](docs/devpost/testing-instructions.md)

The October 16 studio upgrade is included. Run `npm run verify-upgrade` after `npm run build` for the new offline integration checks. Start with [UPGRADE-NOTES.md](UPGRADE-NOTES.md) for the updated walkthrough and verification results.

Try-on for resale listings, where the only garment photo is a wrinkled flat-lay on someone's bedroom
floor. Built for the **YouCam API Skin AI & eCommerce VTO Hackathon** (sponsor: Perfect Corp.) on the
**Perfect Corp. YouCam API — Apparel Virtual Try-On** (eCommerce VTO track).

Every render is an AI-generated preview only. The product never makes a fit, size, condition or
authenticity claim.

## What is implemented

- **Seller readiness checker** — `/sell/new` runs four deterministic checks on a garment photo in
  the browser before anything is sent anywhere: framing, background separation, flatness (an
  edge-density proxy) and occlusion/shadow. Each check gives a 0–100 score and a pass/warn/fail
  verdict; one failing check rejects the photo and the seller gets up to three ordered, specific
  retake instructions. The scoring lives in `lib/readiness/analyse.ts`, the retake copy in
  `lib/readiness/instructions.ts`, and every threshold in `lib/readiness/thresholds.ts`. The path
  never imports the YouCam adapter, so it cannot spend an API unit.
- **Local normalisation** — an accepted photo is prepared for try-on on the server
  (`lib/normalise/`, using sharp): upright from its EXIF tag, metadata dropped, cropped to the
  garment with padding, plain background flattened only where the match is confident, resized and
  measured against the pinned VTO input limits. `/sell/new` shows the before/after under "Prepared
  for try-on". No provider call is made. The pair is kept in memory against the draft listing.
- **Try-on readiness grade on the listing** — an accepted photo can be published from `/sell/new`,
  and the listing carries a grade badge on its tile (`/listings`) and its page (`/listings/[id]`):
  the letter, the reason the grade is not higher and the weakest check by name. The grade is read
  off the weakest check and nothing is averaged; a photo with a failing check keeps grade C and is
  not published. See [Try-on readiness grade on the listing](#try-on-readiness-grade-on-the-listing).
- **Seeded demo listing set** — three demo listings on `/listings` and the refused bad flat-lay
  their story starts from, all drawn by the project's own code under the MIT licence, with the
  licence shown in the product and recorded in `PROVENANCE.md`. See
  [Seeded demo listing set](#seeded-demo-listing-set).
- **Blocked categories and scope statement** — the category is the first thing a seller chooses on
  `/sell/new`. Intimates and swimwear are refused by policy, and lower-body, dress and accessory
  categories are refused because the try-on handles upper-body garments only for now. The refusal
  shows the reason and links to the scope statement published at `/methods#scope`, and the photo
  step does not open. `POST /api/listings` and `POST /api/readiness` enforce the same list
  server-side. The list lives in `lib/listings/categories.ts`.
- **Single-file YouCam adapter** — `lib/youcam/adapter.ts` performs the whole server-to-server flow
  against the YouCam API V2: input check → upload garment → upload buyer photo → create try-on task
  → bounded polling with timeout and retry → result retrieval. Every request to the API carries
  `Authorization: Bearer <YOUCAM_API_KEY>`; there is no separate auth call. The key is read from a
  server-only environment variable and never reaches the browser, API responses or logs. Every
  outbound request has a 15-second timeout, a status check is one attempt per poll, and task
  creation (which spends units) is never re-sent once it may have reached the provider. Each
  documented provider `error_code` is shown to the buyer as its own plain-language message. See
  [Verifying the YouCam integration](#verifying-the-youcam-integration).
- **Try-on API** — `POST /api/tryon` (validate, consent check, budget guard, upload + create task),
  `GET /api/tryon/[renderId]` (bounded polling proxy with honest states), and
  `GET /api/tryon/[renderId]/image` (same-origin image proxy so the browser never sees a provider URL).
- **Try-on runner page** — `/try` runs one garment + photo render with real stage transitions,
  elapsed time, the stated timeout, an aria-live announcer and the persistent preview-only label.
- **Consent gate** — `/try` shows the consent statement first; `POST /api/consent` records it on
  the server (in memory) and `POST /api/tryon` refuses a request without a current-version record
  before any provider call (`lib/tryon/consent.ts`).
- **Buyer photo capture** — **Take a photo** (front camera) or **Choose a photo**, then local
  checks for size (at least 480 px on the shorter side), light and contrast in the middle of the
  frame (`lib/tryon/selfie-gate.ts`). A failing photo is not uploaded. The browser and the server
  both re-encode the photo as a fresh JPEG, which drops all metadata, and the server runs the same
  checks again (`lib/tryon/selfie.ts`).
- **Preview-only label and readiness badge on every render** — a render carries the label
  "AI-generated preview only. No fit, size, condition or authenticity claim is made." and a try-on
  readiness grade (A, B or C) for the garment photo. Both are shown beside the render and burned
  into the image the server sends, so the result, the watchlist (`/watchlist`) and any saved or
  downloaded copy carry them. See
  [Preview-only label and readiness badge](#preview-only-label-and-readiness-badge).
- **Copy guard** — `npm run copy-guard` (`scripts/copy-guard.mjs`) exits with an error when claim
  vocabulary (fit, true to size, measurements, authentic, condition grade, guarantee) appears in
  user-facing copy outside the reviewed wording that refuses the claim.
- **Fail-closed budget guard** — an append-only usage ledger, a budget check before every try-on and
  a per-session fair-use cap; when the unit budget or the cap is reached, or the provider errors, a
  precomputed example is offered for explicit selection and labelled as not live. A mode banner names how renders
  are served: live, cached, precomputed or mock. See [Unit budget guard](#unit-budget-guard).
- **Offline mock mode** — with `YOUCAM_MOCK=true` or no credentials, the flow replays the pinned
  fixtures in `lib/youcam/fixtures/` and performs zero outbound requests.
- **Status page** — `/status` and `GET /api/status` show the current mode, budget band and the
  pinned provider facts (no secrets): the V2 endpoints, the auth model, the input limits, the
  documented error codes and, in live mode, the unit cost the API reports.

## Setup

Requirements: Node.js 20.9 or newer, with npm. Nothing else: there is no database to create, no
seed step and no account to open. Offline mock mode needs no API key and no `.env` file. The 20.9
floor comes from sharp, which the server uses to decode an uploaded garment photo and to re-encode
the buyer photo: on Node.js 20.0 to 20.8, `npm install` warns `EBADENGINE`, and those two steps
(and with them every try-on on `/try`) are not supported. Check with `node -v`.

```bash
git clone <repository-url>
cd secondhand-fit
npm install
npm run dev               # http://localhost:3000
```

With no `.env` file the YouCam credentials are unset, so the adapter runs in offline mock mode: it
replays the pinned fixtures in `lib/youcam/fixtures/`, makes zero outbound requests and spends no
API units. The mode banner on the home page, `/try` and `/status` reads `mock` and gives the reason.

Next.js also takes the keys from the shell environment and from `.env.local`. If `YOUCAM_API_KEY`
is set in either, the app runs live and spends units. To force offline mock mode whatever else is
set, start it with the mock flag:

```bash
YOUCAM_MOCK=true npm run dev
# PowerShell: $env:YOUCAM_MOCK="true"; npm run dev
# Any shell: put YOUCAM_MOCK=true in .env and run npm run dev
```

The banner reason then reads "YOUCAM_MOCK=true" instead of "YOUCAM_API_KEY is not set".

On Windows, `run-dev.bat` starts the same development server on port 3001 instead. It runs
`npm ci` itself on first use, always uses the project's own Next.js, and opens the app in your
browser. Double-click `create-desktop-shortcut.bat` once to put a "Secondhand Fit" shortcut to it
on your desktop. If port 3000 is taken,
`npm run dev -- -p 3001` does the same on any system; use that port in the URLs below.

Mock mode runs the same way from a production build: `npm run build`, then `npm run start`.

### Offline mock mode walkthrough

1. Open http://localhost:3000. The banner reads "Mode: mock — offline fixtures, not a live result",
   followed by the reason "YOUCAM_API_KEY is not set" (or "YOUCAM_MOCK=true" when started with the
   mock flag). If it reads `live`, stop and restart with the mock flag as shown above.
2. Open `/sell/new`. Under **Try a sample photo check**, choose **Seeded bad flat-lay**: the outcome is
   "Retake needed" with three retake instructions. Choose **Seeded retake**: the outcome is "Photo
   accepted". Neither needs an upload. Each outcome shows the photo's grade: C for the bad
   flat-lay, A for the retake. Under the accepted retake, "Prepared for try-on" shows the original
   beside the normalised garment image, with a divider to drag. Open `/listings`: the demo listing "Rust T-shirt" shows the badge
   "Source photo checks: grade A" with its reason. To publish a listing yourself, fill in the listing
   details (any title, category **Tops and T-shirts**), choose **Continue to the photo**, then
   **Seeded retake** again and then **Publish listing**.
3. Still on `/sell/new`, choose **Intimates** or **Swimwear** as the category: the listing is
   refused with the reason and a link to the scope statement at `/methods#scope`.
4. Open `/try` (or **Try it on** on a listing page, which opens `/try?listing=<id>`). The consent
   statement comes first: tick all five parts and choose **Agree and choose photos**.
   The server records the consent (`POST /api/consent`) and only then do the garment picker and
   the photo step appear; `POST /api/tryon` refuses with `403 consent_required`, before any
   provider call, when the session has no current-version consent record for that listing.
   **Withdraw consent** deletes the record.
   A listing’s garment photo now loads automatically after consent. On the standalone `/try` page, choose both files. For an offline test: open
   `/api/readiness/seeded/retake` and `/api/readiness/seeded/bad` in the browser and save both
   PNGs. Pick the retake under **Garment image**. Under **Your photo**, choose **Choose a photo**
   (**Take a photo** opens the camera on a phone) and pick the other PNG. The photo checks run at
   once and must all pass before **Create preview** is offered: the photo needs at least 480 px on its
   shorter side (both seeded PNGs are 480 × 640), an average brightness between 55 and 230, and
   some contrast in the middle of the frame. A smaller, very dark, washed-out or blank image is
   refused with retake instructions and is not uploaded. The checks measure pixels only and do not
   look for a person, so the drawing is accepted. Any JPEG, PNG or WebP that passes works: in mock
   mode both files go no further than this app's own server, and the placeholder render is not
   made from them. Choose **Create preview**. The task stays "running" for about four seconds and then
   returns the placeholder render `public/mock/mock-render.svg` under the banner "Source: mock —
   offline fixtures, not a live result". Under the image are the preview-only label and the
   readiness badge (with the seeded retake as the garment image, "Source photo checks: grade A"), and
   the same words are in a band at the bottom of the image itself.
5. Choose **Download preview**: the saved file has the band in it. Choose **Save to
   watchlist**, then open `/watchlist`: the preview is listed with its badge and label.
6. Open `/status`: the mock call is counted under "Calls this process" and spent units stay at 0.
7. To see the budget fallback offline, follow [Unit budget guard](#unit-budget-guard).

### Live mode

Live mode needs a free YouCam API account (https://yce.perfectcorp.com/ai-api).

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Fill in `YOUCAM_API_KEY` in `.env`, leave `YOUCAM_MOCK=false` and restart the server. The API Key
is all the V2 API needs; the console's Secret Key is not used. `.env` is gitignored; never commit it. The endpoint pins are unverified until a live
render completes — see [Verifying the YouCam integration](#verifying-the-youcam-integration).

### Environment variables

All of them are read on the server only. None is required for offline mock mode.

| Name | Required | Purpose |
|---|---|---|
| `YOUCAM_API_KEY` | Live mode | API Key from the YouCam API console (https://yce.perfectcorp.com/ai-api), sent as `Authorization: Bearer <key>` on every request. |
| `YOUCAM_SECRET_KEY` | No | Optional and unused. The YouCam API V2 has no auth endpoint, so the console's Secret Key is not read by the app. |
| `YOUCAM_UNIT_BUDGET` | No | Stop making live calls when the ledger reaches this many units (default 900). |
| `YOUCAM_UNITS_SPENT_BASELINE` | No | Units already spent on the account before this server process started (default 0). Added to the ledger's spend, because the ledger is in-memory and restarts at 0. |
| `TRYON_SESSION_RENDER_CAP` | No | Try-on renders one anonymous browser session may start in any 24 hours (default 5). |
| `YOUCAM_MOCK` | No | `true` forces offline mock mode even when keys are set. Mock mode is also forced when the keys are empty. |
| `RENDER_ID_SECRET` | No | HMAC secret for the opaque render ids returned to the browser. Falls back to a per-process random key. |

Optional adapter overrides (`YOUCAM_BASE_URL`, `YOUCAM_VTO_FEATURE`, `YOUCAM_VTO_CATEGORY`,
`YOUCAM_POLL_TIMEOUT_MS`, `YOUCAM_POLL_INTERVAL_MS`, `YOUCAM_VTO_UNIT_COST`,
`YOUCAM_MOCK_LATENCY_MS`) are documented in `.env.example`. `YOUCAM_VTO_CATEGORY` must be one of
`upper_body`, `lower_body`, `full_body`, `auto` or `shoes`; any other value is ignored and `/status`
says so. Override a value only after confirming it against the live API.

### Clone check

```bash
npm run clone-check
```

`scripts/clone-check.mjs` checks that a fresh clone needs nothing this README leaves out. It fails,
with exit code 1, when a file the mock-mode path needs is missing, when `.gitignore` would let
`.env` into the repository or keep `.env.example` out of it, when the code reads an environment
variable that is not named in both `.env.example` and this README, when `.env.example` carries a
credential value, when an npm script or the Node.js version in `package.json` is not in this README,
when a package in `package-lock.json` needs a newer Node.js than `package.json` states, when `LICENSE` and `package.json` disagree, or when an asset under `public/` has no row in
`PROVENANCE.md`. It only reads files (no network, no git) and needs nothing but Node.js, so it runs
before `npm install` too. Run it after adding an environment variable, a script or an asset.

It does not start the app, so it does not replace following [Setup](#setup) from a real clone on
another machine. It is a separate step and `npm run build` does not run it. The script was written
alongside a file-by-file read of the code, which found every environment variable documented, but
the script itself has not been run yet: the first run should be read with that in mind.

### What is in the repository

| Path | Contents |
|---|---|
| `app/` | Next.js routes: pages (`/`, `/listings`, `/listings/[id]`, `/sell/new`, `/try`, `/watchlist`, `/methods`, `/status`) and API route handlers. |
| `components/` | Client components for the seller flow, the readiness checker, the before/after view, the consent gate, the buyer photo capture, the try-on runner, the labelled render and the watchlist, and the mode banner and the listing readiness badge. |
| `lib/youcam/` | The single-file YouCam adapter, the usage ledger, the mock-mode fixtures and the adapter's unit tests (`__tests__/`). |
| `lib/readiness/` | Readiness checks, thresholds, the readiness grade, retake copy and the two seeded fixtures. |
| `lib/normalise/` | Garment image normalisation, its settings, the in-memory store of original/normalised pairs and the seeded pair. |
| `lib/listings/`, `lib/tryon/` | Listing categories, drafts and published listings; try-on contracts, render ids, result cache, the budget and fair-use guard, the anonymous session, consent records, the buyer photo checks, the readiness badge, the label burn-in and the browser watchlist. |
| `scripts/` | The copy guard, run with `npm run copy-guard`, and the clone check, run with `npm run clone-check`. |
| `public/mock/` | Placeholder renders for mock mode and the precomputed fallback, with their licence note. |
| `docs/devpost/` | The draft Devpost submission package: description, reviewer testing instructions and the screenshot shot list. |
| `.env.example` | Every environment variable, with comments. |
| `PROVENANCE.md` | Where every source file and asset came from, and the dependency licences. |
| `LICENSE` | The MIT licence. |

## Blocked categories and scope statement

Open `/sell/new` and choose **Intimates** or **Swimwear** in the category picker: the refusal
appears with the reason and a link to `/methods#scope`, the Continue button is disabled and the
photo step stays closed. The server refuses the same request independently:

```bash
curl -s -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" -d '{"title":"Blue bikini","category":"swim"}'
# -> HTTP 422, code "category_blocked", reason, scopeUrl "/methods#scope", listingCreated false

curl -s -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" -d '{"title":"Grey T-shirt","category":"tops","sizeText":"M"}'
# -> HTTP 201, a draft listing
```

Category ids: `tops`, `shirts`, `knitwear`, `outerwear` (can be listed); `intimates`, `swim`
(refused by policy); `bottoms`, `dresses`, `footwear_accessories` (not available yet). Draft
listings are kept in memory and reset when the server restarts.

The refused list has **not yet been checked against the YouCam API and Perfect Corp. terms of
service** (`PROVIDER_TERMS_CHECK.verified` is `false` in `lib/listings/categories.ts`, and the
scope statement says so). When the terms have been read, add any category they exclude, flip that
flag and bump `SCOPE_STATEMENT_VERSION`.

## Seller readiness checker

Open `/sell/new`. Your own photo can be checked once the listing details are accepted. Two seeded
examples run without filling anything in or uploading anything:

- **Seeded bad flat-lay** — a creased T-shirt on a checked duvet, half in shadow. It is rejected
  with three retake instructions (background separation, flatness, occlusion/shadow).
- **Seeded retake** — the same T-shirt laid flat on a plain sheet in even light. It is accepted.

Both are drawings generated by `lib/readiness/seeded.ts` (not photographs) and served as PNGs, so
they go through the same decode-and-analyse path as an uploaded photo. They are part of the
[seeded demo listing set](#seeded-demo-listing-set).

API, for checking the same thing without a browser:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/readiness/seeded` | The seeded fixtures, and the readiness result and grade each one produces. |
| `GET` | `/api/readiness/seeded/bad`, `/api/readiness/seeded/retake` | The fixture images (PNG). |
| `POST` | `/api/readiness` | Scores an analysis grid server-side with the same code, records the attempt in memory, and reports the usage-ledger entry count before and after. Body: `{"source":"seeded-bad"}`, `{"source":"seeded-retake"}`, or `{"source":"upload","category":"tops","grid":{"width":…,"height":…,"rgbaBase64":"…"}}`. For `upload` the listing category is required, and a refused category gets a 422 and no run. An optional `"listingId"` records the attempt against that draft listing. The response includes the attempt's `grade`. |

```bash
curl -s -X POST http://localhost:3000/api/readiness \
  -H "Content-Type: application/json" -d '{"source":"seeded-bad"}'
# -> result.accepted false, three result.instructions, providerCalls.ledgerEntriesAdded 0
```

The thresholds are **provisional** (`calibrated: false` in `lib/readiness/thresholds.ts`). They were
set against the two drawn fixtures and have not been calibrated against live YouCam runs on degraded
inputs or tested on real phone photos. Known limits of the heuristics: flatness is an edge-density
proxy, so a bold print or stripe also lowers the score; the surface colours are learned from the
border of the photo, so a garment that covers most of the border is reported as "garment edges not
found"; thin hangers and shadows that fall only on the garment are not reliably detected. Readiness
runs are kept in memory and reset when the server restarts.

## Try-on readiness grade on the listing

**The rule.** `gradeReadiness` in `lib/readiness/grade.ts` reads the grade off the single weakest of
the four checks: A when every check passed, B when the weakest check is a warning, C when a check
failed or the garment edges were not found. Nothing is averaged, so three high scores cannot lift
a photo whose fourth check failed. The seeded bad flat-lay scores 100 on framing and still gets
grade C. The verdict cut-offs are the ones in `lib/readiness/thresholds.ts`, so the grade is as
provisional as they are.

**Publishing.** On `/sell/new`, an accepted photo shows its grade and a **Publish listing** button.
The readiness attempt is recorded against the draft listing on the server, and
`POST /api/listings/[id]/publish` (no body) publishes the draft with the grade of the latest
recorded attempt. The request carries no grade and no scores, so the grade cannot be set from the
browser. A draft with no recorded attempt, or whose latest attempt has a failing check, gets a 409
and stays a draft: published listings are grade A or B, and grade C is shown only to the seller on
the rejected attempt.

**Where it shows.** `components/ReadinessBadge.tsx` is the one component that renders a listing's
grade: the letter, "Source photo checks: grade A", the reason the grade is not higher and the weakest
check with its score. `/listings` shows it on every tile and `/listings/[id]` shows it with the
four check scores behind it. `GET /api/listings` returns the same data. The grade rule is also
published at `/methods#grade`.

**Demo listings.** `/listings` always includes the three listings of the
[seeded demo listing set](#seeded-demo-listing-set), each labelled as a demo listing and graded by
the same code at run time.

```bash
curl -s -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" -d '{"title":"Grey T-shirt","category":"tops"}'
# -> HTTP 201, listing.id 1

curl -s -X POST http://localhost:3000/api/readiness \
  -H "Content-Type: application/json" -d '{"source":"seeded-bad","listingId":1}'
curl -s -X POST http://localhost:3000/api/listings/1/publish
# -> HTTP 409, code "readiness_not_accepted", grade "C"

curl -s -X POST http://localhost:3000/api/readiness \
  -H "Content-Type: application/json" -d '{"source":"seeded-retake","listingId":1}'
curl -s -X POST http://localhost:3000/api/listings/1/publish
# -> HTTP 201, listing.readiness.grade "A" with reason and per-check scores

curl -s http://localhost:3000/api/listings
# -> the published listing and the three demo listings, each with readiness.grade and readiness.reason
```

Limits to know about:

- Built and type-checked only. The publish button, the tiles and the listing page have not been
  looked at in a browser, and the publish endpoint has not been called against a running server.
  The build output confirms the grades of the two seeded drawings (C and A).
- A seller's photo and its normalised copy are kept in memory against the draft, but the listing
  does not show them yet: it shows a placeholder where the photo will be, and publishing does not
  wait for a normalised asset.
- The scores come from the small analysis grid the browser sends, scored again on the server. The
  server does not see the full photo.
- Drafts, readiness attempts and published listings are in memory. They reset when the server
  restarts, and on a serverless host each instance has its own copy, so a draft created on one
  instance may not be publishable from another until database-backed storage is built.
- There are no seller accounts: anyone who knows a draft's id can publish it from its latest
  recorded attempt.
- A try-on render still takes its badge from the garment image chosen on `/try`, not from a
  published listing.

## Seeded demo listing set

A judge landing on the app cold can see the whole readiness story without uploading anything or
signing in. `lib/listings/seeded-set.ts` defines the set:

| Picture | Where | Outcome from the checks (build output) |
|---|---|---|
| Seeded bad flat-lay — creased T-shirt on a checked duvet, half in shadow | Shown on `/listings` and `/listings/demo-tee` as the refused first photo; run it on `/sell/new` | Refused, grade C, three retake instructions; never listed |
| Rust T-shirt — the retake, laid flat on a plain sheet | `/listings/demo-tee` | Grade A |
| Teal crew-neck jumper — plain sheet, even light | `/listings/demo-jumper` | Grade A |
| Navy button-up shirt — plain sheet, light fading towards one corner | `/listings/demo-shirt` | Grade B, warning on occlusion and shadow |

No grade is written by hand: each picture is graded when it is first requested, by the same code
as a seller's photo, and a picture the checks do not accept is left off the list. The grades in the
table are the ones the current provisional thresholds give, read from the build output.

**Licence and provenance.** All four pictures are drawings generated pixel by pixel by this
project's own code (`lib/readiness/seeded.ts` and `lib/listings/seeded-set.ts`). They are not
photographs and show no real garment, person, brand or third-party material, and they are released
under the repository's MIT licence. Each has a row in `PROVENANCE.md`, section 2, and the same facts
are shown on `/listings` ("Pictures in the demo set") and on each demo listing's page.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/listings/seeded` | The demo listings with their grades, the refused bad flat-lay with its retake instructions, and every picture with its licence. |
| `GET` | `/api/listings/seeded/jumper`, `/api/listings/seeded/shirt` | The two garment drawings (PNG). The bad flat-lay and the retake are at `/api/readiness/seeded/bad` and `/retake`. |

Limits to know about:

- Built and type-checked only. The grades above come from the build output; the pages have not
  been looked at in a browser.
- The set holds drawings because no photographs were available to this build. Real photos of the
  entrant's own garments can be added later, each with its `PROVENANCE.md` row first.
- The demo listings carry no size: the seller field is left empty, and the app never infers one.

## Unit budget guard

Every try-on passes through one guard (`lib/tryon/guard.ts`) before the YouCam adapter can be
reached. It checks, in order:

1. **The unit budget.** Spend is `YOUCAM_UNITS_SPENT_BASELINE` plus the live rows of the usage
   ledger (`lib/youcam/ledger.ts`). If the budget cannot cover one more render, the request is
   refused. A cap equal to current spend counts as reached.
2. **The per-session fair-use cap.** One anonymous browser session may start
   `TRYON_SESSION_RENDER_CAP` renders (default 5) in any 24 hours. The session is a random id in an
   httpOnly cookie, set the first time a try-on is run; the ledger keeps only a hash of it.

A refused request gets the precomputed example (`public/mock/precomputed-render.svg`) with
`mode: "precomputed"`, `live: false`, a banner that begins "Not a live result" and gives the reason,
and "Source: precomputed example — not a live result" on the result. No provider call is attempted.
The same example is served when the provider errors before a task exists, and is offered behind a
button when a render fails or times out after the task was created. If the guard itself throws, it
fails closed the same way.

The ledger is append-only. An admitted request reserves its units before the provider is called, in
the same synchronous step as the check, so two requests arriving together cannot both pass. If the
provider then fails before a task exists, a `release` row hands the units back.

Both checks also run in offline mock mode (a mock task reserves 0 units), so the fallback can be
reproduced without credentials:

```bash
YOUCAM_UNIT_BUDGET=0 npm run dev
# PowerShell: $env:YOUCAM_UNIT_BUDGET=0; npm run dev
# Any shell: put YOUCAM_UNIT_BUDGET=0 in .env and run npm run dev
```

With a fresh process spend is 0, so a cap of 0 is "the cap set to current spend". The banner on
`/try` reads "Mode: precomputed example — not a live result", and a try-on returns the precomputed
example at once. `/status` shows band `exhausted` and counts the run under "Precomputed runs by
reason" as `budget_exhausted`, with no live or mock call added. `TRYON_SESSION_RENDER_CAP=1` shows
the per-session cap the same way on the second try-on.

Limits to know about:

- The ledger is in memory. It restarts at 0 with the server process, and on a serverless host each
  instance has its own copy, so the budget is only as tight as `YOUCAM_UNITS_SPENT_BASELINE` is
  kept up to date. Database-backed storage is a later build step.
- Spend is recorded as the estimate in `YOUCAM_VTO_UNIT_COST` (default 1) per render. The observed
  cost has not been captured from a live run yet.
- The session cap is a fair-use limit, not a security control: clearing cookies starts a new
  session. The unit budget is the hard limit.
- "Cached" is named in the mode banner but nothing is served from a cache yet; the render cache is a
  later build step.

## Preview-only label and readiness badge

Every render carries two things, in the same words wherever it appears:

- **The preview-only label** — "AI-generated preview only. No fit, size, condition or authenticity
  claim is made." (`PREVIEW_ONLY_LABEL` in `lib/tryon/contracts.ts`).
- **The readiness badge** — the try-on readiness grade of the garment photo the render was made
  from, with the reason it is not higher, and the note that the grade describes the photo and not
  the garment.

**The grade.** `lib/readiness/grade.ts` reads the grade off the weakest of the four readiness
checks and averages nothing: A when every check passed, B when the weakest check is a warning, C
when a check failed or the garment edges were not found. It uses the verdict cut-offs already in
`lib/readiness/thresholds.ts` and adds no number of its own, so it is as provisional as they are.

**How a render inherits it.** `/try` sends the garment photo's small analysis grid (at most 160
pixels on its longer side) with the try-on request. The server scores the grid with the same code
as the seller checker, and signs the grade into the opaque render id (`lib/tryon/render-id.ts`).
The badge is rebuilt from the signed id every time the render is served, so it cannot be edited
from the browser. A render with no grid reads "not graded". A precomputed example also reads "not
graded", because it was made in advance and not from the uploaded garment photo.

**Burned into the image.** `GET /api/tryon/[renderId]/image` is the only way a render reaches a
browser, and it never sends the bare render. `lib/tryon/burn-in.ts` wraps it in an SVG: the render
on top, untouched, and a band underneath with the label, the badge and how the render was served
(live, mock or precomputed). The image on the page, a copy saved from it and the **Download
labelled image** file (a PNG copy of that SVG, or the SVG itself where a browser will not export
it) therefore all carry the label. A provider result that is not a JPEG, PNG or WebP is not served.

**Where it shows.** `components/RenderPreview.tsx` is the one component that puts a render on
screen, with the label pinned under the image and the badge below it. The try-on result and the
watchlist both use it.

**Watchlist.** **Save to watchlist** under a result stores the render id and its badge in this
browser's localStorage; `/watchlist` lists the saved previews and can remove them. Nothing is
stored on the server.

**Copy guard.** `npm run copy-guard` parses `app/`,
`components/` and `lib/` with the TypeScript compiler and checks every string literal, template
string and piece of JSX text, plus the SVG files in `public/`, for claim vocabulary: fit, true to
size, measurements, authentic, condition grade, guarantee. A banned term may appear only inside
the reviewed phrases listed at the top of the script (the product name and the label that refuses
the claim). Anything else exits with code 1. It needs the dev dependencies (`typescript`) to be installed.
It is a separate step and `npm run build` does not run it: run it before a release, or chain it in
front of the build (`"build": "node scripts/copy-guard.mjs && next build"`) so a banned term stops
the build.

Limits to know about:

- Built and type-checked only. The label band, the PNG download and the watchlist have not been
  looked at in a browser, and no live render has passed through the burn-in.
- The grade on a render comes from a grid the browser computed for the garment image chosen on
  `/try`. It is scored on the server, but it is not yet taken from a published listing's grade.
- The band wraps its text by an estimated character width, since SVG text does not wrap itself. On
  an unusual system font a long line could run close to the edge of the band.
- The watchlist lives in one browser, and a saved live render can be shown only while the YouCam
  API still serves the result (and, without `RENDER_ID_SECRET`, while the same server process is
  running). When it cannot be loaded, the entry says so and keeps its label and badge.
- The copy guard does not scan Markdown and is not wired into the build, and there is no CI
  workflow or automated accessibility check yet.

## Verifying the YouCam integration

The adapter targets the **YouCam API V2** (https://yce.perfectcorp.com/document/index.html) and pins
everything it relies on in `YOUCAM_PINNED` (top of `lib/youcam/adapter.ts`):

| Step | Request | What the adapter reads |
|---|---|---|
| Auth | `Authorization: Bearer <YOUCAM_API_KEY>` on every request to the API host | — (V2 has no auth endpoint and no token exchange) |
| Upload | `POST /s2s/v2.0/file/cloth` with `{"files":[{"content_type","file_name","file_size"}]}` | `data.files[0].file_id` and `data.files[0].requests[0]` = `{method: "PUT", url, headers}`; the bytes are then sent to `url` with exactly those headers and nothing added |
| Task | `POST /s2s/v2.0/task/cloth` with `{"src_file_id": <buyer photo>, "ref_file_id": <garment>, "garment_category": "upper_body"}` | `data.task_id`. `template_id` is never sent |
| Poll | `GET /s2s/v2.0/task/cloth/{task_id}` | `data.task_status`: `running`, `success` or `error`; on success `data.results.url` (valid about 2 hours) |
| Unit cost | `GET /s2s/v2.0/credit/feature-cost` | shown on `/status` in live mode, checked at most once an hour |

The host is `https://yce-api-01.perfectcorp.com`, overridable with `YOUCAM_BASE_URL`.
`garment_category` is one of `upper_body`, `lower_body`, `full_body`, `auto`, `shoes`.

**Input limits, checked before any request is sent.** JPG, JPEG and PNG only: WebP is converted to
JPEG with sharp, and any other type is refused. An image whose longest side is over 4096 px is
scaled down to 4096 px, and one under 512 × 384 px (the minimum other live integrations report from the
clothes documentation) is scaled up to it. A file that is still 10 MB or more is refused. Each render
is estimated at 2 units, the Clothes VTO price in the live unit catalogue.

**Errors.** The API reports errors as `{status, error, error_code}`. Each documented code
(`error_no_shoulder`, `error_large_face_angle`, `exceed_max_filesize`, `invalid_parameter`,
`error_download_image`, `error_decode_image`, `error_inference`, `error_nsfw_content_detected`,
`error_multiple_people`, `error_unsupport_ratio`, `unknown_internal_error`) has its own
plain-language message in `YOUCAM_ERROR_MESSAGES`, shown on `/try`; the raw code stays in the
developer panel. A code outside that list gets a generic message that names it.

**Not yet verified.** All of the above comes from the documentation and none of it has been confirmed
by a live render from this codebase. Three points are not covered by the documentation summary the
adapter was written from, and are read defensively: the shape of the feature-cost response, whether
a failed task carries `error_code` inside `data` or on the envelope (both are read), and whether
"10 MB" means 10 × 1024² bytes (the value pinned) or 10,000,000.

1. Put the API Key in `.env` and set `YOUCAM_MOCK=false`.
2. Run `/try` with a garment image and a photo. A provider rejection surfaces its own message, and
   the verbatim reason (with the API key and signed URL query strings removed) is in the developer
   panel.
3. Open `/status`, **Observed live responses**: the latest response of each kind (`file-upload`,
   `task-create`, `task-status.running`, `task-status.success`, `task-status.error`, `feature-cost`,
   or `.http-<code>` for a rejection) is shown with every string replaced by its length, except
   short enum-like words such as status values and error codes, so no credential, id or URL
   appears. Compare it with the pins, correct any field via the matching environment override, then
   update the pinned default and the fixture of the same name in `lib/youcam/fixtures/`. The list
   is in memory and clears on restart.
4. Record the unit cost per render (from **Unit cost reported by the API** on `/status`) in
   `YOUCAM_VTO_UNIT_COST` and flip `verification.liveRenderConfirmed` to `true` in `YOUCAM_PINNED`.

### Unit tests

```bash
npm run test
```

`lib/youcam/__tests__/adapter.test.ts` checks the pinned fixtures against the V2 shapes, that each
of the thirteen error codes has its own message, the input checks (WebP converted, other types
refused, long side scaled to 4096 px, 10 MB refused) and the live request contract: the Bearer
header on every API request, the four V2 paths and nothing else, the upload sent with exactly the
returned headers, the task body without `template_id`, and a mock-mode try-on with zero outbound
requests. No test reaches the network: `fetch` is replaced by a recorder that answers from the
fixtures. The script compiles the adapter and its tests with `tsconfig.test.json` into
`.test-build/` (gitignored) and runs them with Node.js's built-in test runner, so it needs nothing
beyond the dev dependencies. It is a separate step and `npm run build` does not run it.

## Calibrating the readiness thresholds

The thresholds have not been calibrated yet, and the scripted calibration runner
(`build-packet/13-build-sequence.md`, step 3) is not built. Until it is, calibration is a manual
procedure, and it needs live mode because it spends API units:

1. Complete [Verifying the YouCam integration](#verifying-the-youcam-integration) first, so the
   observed unit cost is known. Keep `YOUCAM_UNIT_BUDGET` below the account balance.
2. Assemble a small set of flat-lay photos listed in `PROVENANCE.md`, each degraded in one way only:
   a patterned surface, creases, a hard shadow, a hanger or hand in the shot, a garment cut off by
   the frame. Keep one clean photo of each garment as the control.
3. For each photo, note the four check scores from `/sell/new`, then run it through `/try` with the
   same permitted person photo and record the outcome: provider error, plausible render, or a render
   that kept the original clothing.
4. For each check, move `passAt` and `warnAt` in `lib/readiness/thresholds.ts` to the scores that
   separate the plausible renders from the other two outcomes. Bump `version`, describe the runs in
   `provenance`, and set `calibrated` to `true` only when every threshold traces to a recorded run.
5. Commit the run log with the change, and run `npm run build` to confirm the seeded bad flat-lay
   is still rejected and the seeded retake is still accepted (`/api/readiness/seeded`).

## Scripts

```bash
npm run dev         # development server
npm run build       # production build
npm run start       # serve the production build
npm run typecheck   # tsc --noEmit
npm run test        # YouCam adapter unit tests, offline
npm run copy-guard  # check user-facing copy for banned claim terms
npm run clone-check # check that a fresh clone needs nothing the README leaves out
```

On a fresh clone, run `npm run build` (or start `npm run dev`) once before `npm run typecheck`:
`next-env.d.ts` refers to route types that Next.js generates into `.next/`, and that folder is not
in the repository.

## Next build steps

Seller insights (try-on counts and grade history), threshold calibration against live API runs,
a content-addressed render cache, and durable storage (for example Prisma) for the ledger,
listings, normalised images, consent records, renders and the watchlist. See
`build-packet/13-build-sequence.md`.

## Originality and provenance

Secondhand Fit is a new build written during the contest Submission Period. `PROVENANCE.md` is the
self-audit of where every source file and asset came from, the licences of the third-party
dependencies, and the terms under which the YouCam API is used. It also holds the rules for adding
new code or assets (every seeded demo photo needs a provenance and licence row before it is
committed) and the entrant's sign-off checklist, which must be completed before submission.

## Publishing the repository

The source is at https://github.com/mjcole76/secondhand-fit. The contest needs the repository either
public with a licence (MIT, see `LICENSE`) or private and shared with contact_event@PerfectCorp.com.
Before submitting:

1. Make the repository public (GitHub: Settings → General → Danger Zone → Change visibility), or
   add contact_event@PerfectCorp.com as a collaborator.
2. Check that `.env` is not committed (`git status`); `.gitignore` excludes `.env` and `.env.*` and
   keeps `.env.example`.
3. Run `npm run clone-check` and fix anything it reports.
4. Open the repository URL in a private browser window to confirm judges can see it.

## Deploying the demo

The contest needs a working demo that judges can open free of charge until the end of the Judging
Period. Secondhand Fit keeps listings, consent records, the unit ledger and render ids in server
memory, so deploy it as **one long-running Node.js process**. A serverless host (one function
instance per request) would lose the consent record between the consent call and the try-on call.

`render.yaml` deploys it on [Render](https://render.com) as a single web service:

1. In Render, choose **New → Blueprint** and connect this repository.
2. When asked for `YOUCAM_API_KEY`, paste the API Key from https://yce.perfectcorp.com/ai-api. Leave
   it empty to deploy in offline mock mode (no units spent; renders are labelled as mock).
3. Wait for the build, then open the service URL and check `/api/health` and `/status`.
4. Run one try-on on the deployed URL and confirm `/status` reports a live render. Then follow
   [Verifying the YouCam integration](#verifying-the-youcam-integration).

Notes:

- The free plan sleeps after about 15 minutes idle, and the first request after that takes up to a
  minute. A restart clears in-memory listings published by visitors; the seeded demo listings are
  rebuilt on every start, so the judge walkthrough always works. The paid "starter" plan stays
  awake for the Judging Period.
- `RENDER_ID_SECRET` is generated once by Render so render ids survive restarts.
- Keep `YOUCAM_UNIT_BUDGET` below the units left on the account, and set
  `YOUCAM_UNITS_SPENT_BASELINE` to the units already spent, so the budget guard falls back to the
  labelled precomputed example before the account runs out.
- Any other host works the same way: Node.js 20.9 or later, `npm ci && npm run build`, then
  `npm start` (Next.js reads the `PORT` environment variable).

## Devpost submission package

`docs/devpost/` holds the Devpost entry, ready to paste: the field-by-field table and
pre-submission checklist (`README.md`), the description (`description.md`), the reviewer testing
instructions (`testing-instructions.md`), the screenshot list (`screenshots.md`, captured images in
`screenshots/`) and the demo video script (`video-script.md`). The demo and video URLs are filled in
once the app is deployed and the video is published.

## Licence

Secondhand Fit is released under the [MIT Licence](LICENSE). This covers the source code and the
project's own assets: the placeholder renders in `public/mock/` and the drawings of the seeded demo
listing set generated by `lib/readiness/seeded.ts` and `lib/listings/seeded-set.ts`.

Third-party dependencies are installed by npm and stay under their own licences, listed in
`PROVENANCE.md`. The YouCam API is a Perfect Corp. service used under the YouCam API and Perfect
Corp. terms of service; the MIT licence grants no rights to it, and "YouCam" and "Perfect Corp." are
named only to identify the API. The HackathonOS planning documents (`build-packet/`, `hackathonos/`)
are not part of the application; see `PROVENANCE.md`, section 5.

The app shows the same facts at `/methods#source` (**Source and licence** in the footer): the
licence, the Node.js version and the offline mock-mode setup commands, so someone who finds the
deployed app can run it from a clone. The licence and Node.js version are read from `package.json`.
The repository link on that page comes from `"repository"` in `package.json`.
