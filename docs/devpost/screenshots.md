# Devpost screenshots — shot list

The contest page requires screenshots of the project. It gives no minimum count or format (open
question in `build-packet/03-contest-contract.md`); check the limits shown on the form's image
gallery before uploading.

**No submission screenshot has been captured yet.** Last updated 2026-10-01.

## Shot list

The list follows `build-packet/16-demo-plan.md`. "Can be captured today" means the screen exists in
the code as of the date above; it does not mean the shot is final, because the screens will change
as the remaining features are built. Capture the final set from the deployed app.

| # | File name | Route | What it must show | Can be captured today |
|---|---|---|---|---|
| 1 | `01-rejection.png` | `/sell/new` | The seeded bad flat-lay with "Retake needed", the three retake instructions and the per-check scores | Yes |
| 2 | `02-retake-accepted.png` | `/sell/new` | The seeded retake with "Photo accepted" | Yes |
| 3 | `03-before-after.png` | `/sell/new` | The original photo next to the normalised garment image | No — normalisation is not built |
| 4 | `04-listing-grade.png` | Listing page | A published listing with its readiness grade and the reason it is not higher | No — listing grades are not built |
| 5 | `05-render.png` | `/try` | A live render with "Source: live YouCam Apparel VTO render" and the preview-only label legible | No — a live render has not been confirmed; today only the mock placeholder can be shown |
| 6 | `06-budget-fallback.png` | `/try` | The precomputed example under the "Not a live result" banner | Partly — the fallback image is still a drawn placeholder |
| 7 | `07-blocked-category.png` | `/sell/new` | A refused category with the reason and the link to the scope statement | Yes |
| 8 | `08-methods.png` | `/methods` | The scope statement and the readiness checks section | Yes |
| 9 | `09-seller-insights.png` | Seller dashboard | Try-on counts and grade history | No — seller insights (P1) are not built |
| 10 | `10-mobile-sell.png` | `/sell/new` on a phone | The seller flow in a mobile browser | Yes |

Leave out any shot whose feature does not ship. A screenshot of a screen that is not in the
submitted app must not be uploaded.

## Capture rules

1. Capture from the deployed demo URL, so the screenshots show what the judges will see.
2. Use a clean browser window: no bookmarks bar, extensions, other tabs or personal information in
   view.
3. A mock or precomputed result must be visibly labelled as such in the shot. Never crop out the
   "Source" banner, the "Not a live result" banner or the preview-only label.
4. People: use only the entrant's own likeness or a person who has given written permission
   (`PROVENANCE.md`, section 6, rule 4).
5. Garments: use only photos already listed in the asset register (`PROVENANCE.md`, section 2).
   Avoid visible brand logos and printed artwork.
6. Add a row to the asset register for every screenshot that shows a photograph or a person.
7. Save the files in `docs/devpost/screenshots/` under the names above.

The images under `hackathonos/qa/screenshots/` are automated QA captures of the unfinished build.
They are not submission screenshots.
