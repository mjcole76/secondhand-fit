# Devpost screenshots

Captured on 2026-10-28 from a production build (`npm run build && npm start`) in offline mock mode,
at 1440 px wide (desktop) and 390 px wide (phone). The files are in `screenshots/`. Upload them in
this order. Check the image limits shown on the Devpost form first.

| # | File | Shows |
|---|---|---|
| 0 | `00-home.png` | Home page with the creator's existing YouCam example (labelled preview only) |
| 1 | `01-rejection.png` | The seeded bad flat-lay rejected: four check scores, grade C and three ordered retake instructions, 0 API units spent |
| 2 | `02-retake-before-after.png` | The seeded retake accepted (grade A) with the before/after of the server-prepared image and the try-on input limits |
| 3 | `03-blocked-category.png` | Swimwear refused before any photo is requested, linked to the scope statement |
| 4 | `04-listings.png` | Demo listings, each with its grade |
| 5 | `05-listing-grade.png` | A grade B listing page with the grade, its meaning and the drawing's licence |
| 6 | `06-consent.png` | The five-part consent statement shown before any photo is chosen |
| 7 | `07-progress.png` | A try-on in progress, with real stages and elapsed time |
| 8 | `08-render-labelled.png` | The finished preview with the preview-only label and grade burned into the image |
| 9 | `09-methods.png` | The methods and scope page |
| 10 | `10-status.png` | The status page: mode, budget and pinned API facts |
| 11 | `11-mobile-retake.png` | Phone: the retake instructions on the seller page |
| 12 | `12-mobile-listing.png` | Phone: a graded listing |

## Replace two shots after deploying

`07-progress.png` and `08-render-labelled.png` show the **mock** placeholder (clearly labelled "MOCK
RENDER — offline fixture"). After the first live render on the deployed app, capture both again so
they show a live YouCam result under "Source: live YouCam Apparel VTO render". Use a photo of
yourself or of someone who has agreed to it, and add it to the asset register in `PROVENANCE.md`.

The person in `00-home.png`, `07-progress.png` and `08-render-labelled.png` is the creator-supplied,
Gemini-generated demonstration image `public/demo/person.jpg` (see `PROVENANCE.md`). No real person
appears.

## Capture rules

- Never crop out the "Source" banner, a "Not a live result" banner or the preview-only label.
- No browser bookmarks, extensions, other tabs or personal information in view.
