# Secondhand Fit studio upgrade

October 16, 2026

## What changed

- Dark desktop interface with responsive mobile layouts, a visual homepage, and simpler browsing.
- The homepage uses the creator's existing example. Gemini made the source person and jacket images. The creator used YouCam for the try-on. The original/try-on switch does not make an API call.
- A two-column try-on workspace keeps the garment, buyer photo, progress, and result together. Long diagnostics, processing timestamps, and consent records are expandable.
- Live results can be compared with the original buyer photo. Changing either input clears the old result. Downloaded previews retain their label and source-photo badge in a smaller band.
- Grades now say “Source photo checks.” They describe provisional photo heuristics, not the item or the accuracy of a generated result. The scoring thresholds are unchanged.
- Published uploaded listings now carry their prepared garment image. Opening a listing's try-on loads that image after consent, without asking the buyer to upload it again.
- Uploaded listings cannot publish until the latest photo has been prepared. A newer attempt cannot reuse an older prepared photo. A stale image URL returns an error rather than silently displaying a replacement.
- Cap and provider fallbacks are offered for explicit selection. They do not automatically replace a failed personal preview.
- Saved previews retain a link to the associated listing. Original buyer photos are not added to localStorage.
- The existing server-side YouCam adapter, consent enforcement, category restrictions, budget limits, and timeouts remain in place.

## Run on Windows

1. Extract this ZIP into a new folder. Keep your existing project as a backup.
2. Open a terminal in the extracted `secondhand-fit` folder. Use Node.js 20.9 or later.
3. Run `npm ci`.
4. For offline testing, run `npm run dev` without an environment file. It uses mock mode when no API key is present.
5. Open http://localhost:3000. Mock mode shows a labelled placeholder, not a generated try-on.
6. To restore your existing live connection, copy your private `.env` from the previous project into this folder. Confirm `YOUCAM_MOCK` is not set to `true`, then restart the server. Live requests spend your API units.

The ZIP deliberately excludes `.env`, dependencies, build caches, and temporary test output. It includes `.env.example`. No API key was read or used during this upgrade.

### Using `run-dev.bat`

Double-click `run-dev.bat` as an alternative to steps 2–4. It starts the development server at http://localhost:3001, on port 3001 rather than 3000. It:

- Checks that Node.js 20.9 or later is installed.
- Runs `npm ci` on first use if dependencies are missing.
- Always runs the project's own Next.js (15.5.x). The earlier version called `npx next`. When run before `npm ci`, that silently used a globally installed Next.js 15.1.6, and the server then returned 500 errors.
- Stops with a message if port 3001 is already in use, instead of failing partway through startup.

Close the server window, or press Ctrl+C, to stop it.

## Quick walkthrough

- Open the homepage and switch the existing example between Original and Try-on.
- Open Browse, select a demo listing, and choose Try this piece on.
- Accept all five consent items. The garment image loads automatically.
- Choose a photo of you. The on-device checks must pass before Create preview is enabled.
- Create a preview. In offline mode, the result explicitly says mock. Save it to the watchlist or download the labelled image.
- Open Sell, enter listing details, and upload a garment photo. For a repeatable demo, expand Try a sample photo check and choose Seeded bad flat-lay, then Seeded retake. Wait for preparation and publish the accepted photo.
- Expand privacy controls in the try-on workspace to withdraw consent.

## Verification

Run these from the project folder:

```sh
npm run typecheck
npm test
npm run copy-guard
npm run clone-check
npm run build
npm run verify-upgrade
```

The new integration command starts a temporary production server on port 3197 with mock mode forced and the API key cleared in that child process. Run it after a successful build.

Stop any running development server, including `run-dev.bat`, before `npm run build`. Both use the `.next` folder, and a build overwrites the files a running dev server depends on.

Re-verified on October 16, 2026, on Windows 10 with Node.js 22.19: all six commands above passed. `run-dev.bat` started cleanly in mock mode, and `/`, `/listings`, `/try`, `/sell/new`, `/watchlist`, `/api/status` and `/api/health` all returned 200.

Verified during this upgrade:

- TypeScript validation and the Next.js production build.
- All 29 existing adapter tests.
- Copy guard with zero prohibited claims, plus all nine clone-readiness checks.
- Offline integration checks covering consent, blocked categories, rejected photos, prepared listing images, stale photo versions, completed renders with labels, the session cap, and withdrawal.
- Chromium browser checks at desktop and mobile widths covering uploads, mock completion, watchlist save and removal, listing-photo auto-load, download, fallback opt-in, withdrawal, and absence of horizontal overflow. The original-photo comparison controls were also exercised using a simulated live-mode status in the offline test.

No live YouCam request was made. The original-photo comparison is available for live results. The offline mock placeholder does not present itself as a personal comparison.

## Current limits

This remains a local prototype. Listings, prepared images, consent records, budgets, and render links use process memory. Listings and images can disappear when the server restarts or storage limits evict them. Multiple server processes do not share this state. The watchlist stores browser-local references, not permanent image files. Persistent storage and session isolation are needed before treating it as a public marketplace.

The photo heuristics have not been calibrated against a representative set of live YouCam results. A photo grade should not be used as a product-quality or render-accuracy claim.

Prices, seller condition fields, checkout, and inventory were not added. This upgrade concentrates on the existing photo-check and preview workflow.

HackathonOS-generated packets and their historical QA files are preserved. Their old status text and schedules are not an updated assessment of this version. In particular, the packet's 06:00 UTC deadline does not match its own quoted 11:45 a.m. Eastern time. Recheck the official contest page before submitting. No deployment or contest submission was made.
