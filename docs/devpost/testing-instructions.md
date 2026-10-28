# Testing instructions for reviewers

Paste from the next heading to the end of the file. Replace the two `NOT SET` URLs first, and walk
through the steps once on the deployed URL in a private browser window.

## Access

- Working demo: NOT SET
- Code repository: https://github.com/mjcole76/secondhand-fit
- No account, login or payment is needed. Nothing has to be installed.
- The demo may take up to a minute to wake on the first visit.

The try-on page shows a banner naming how the next preview is made: **live** (the Perfect Corp.
YouCam Apparel Virtual Try-On API), **mock** (offline fixtures, no API call) or a stored example
labelled **Not a live result**. `/status` shows the mode and the remaining unit budget.

## 1. See a bad flat-lay rejected (no upload needed)

1. Open **Sell** (`/sell/new`).
2. Expand **Try a sample photo check** and choose **Seeded bad flat-lay** (a creased T-shirt on a
   checked duvet, half in shadow).
3. Expected: **Retake needed**, grade C, and three numbered retake instructions for background
   separation, flatness and occlusion/shadow, with a score for each of the four checks. The page
   states that no API units were spent.

## 2. See the retake accepted and prepared (no upload needed)

1. On the same page, choose **Seeded retake** (the same T-shirt flat on a plain sheet in even light).
2. Expected: **Photo accepted**, grade A, and **Prepared for try-on**: a before/after slider of the
   original and the server-prepared image, a list of what changed, and the try-on input limits it
   was checked against.

## 3. See a refused category

1. On `/sell/new`, choose **Swimwear** or **Intimates** as the category.
2. Expected: the listing is refused with the reason and a link to the scope statement
   (`/methods#scope`). The photo step does not open.

## 4. See graded listings

1. Open **Browse** (`/listings`). Each demo listing shows its grade.
2. Open a listing. Expected: the grade letter and what it describes; **Why this grade?** gives the
   reason it is not higher and the per-check breakdown. The licence of each demo drawing is shown on
   the page.

## 5. Run a try-on

1. On a listing, choose **Try this piece on**.
2. Read the consent statement, tick all five items and choose **Agree and choose photos**. No file
   picker or camera is offered before this. The listing's prepared garment image loads
   automatically.
3. Choose **Take a photo** (front camera on a phone) or **Choose a photo**: a waist-up photo of
   yourself, facing the camera, with both shoulders visible. The photo is checked on the device
   first; a photo that fails shows what to change and **Create preview** stays disabled.
4. Choose **Create preview**. Expected: the progress list marks each real stage as it happens
   (checking images, uploading, task queued, generating, finishing), with elapsed time and the
   timeout. The result shows "AI-generated preview only. No fit, size, condition or authenticity
   claim is made." and the garment photo's grade, both also burned into the image.
5. **Download preview** saves the labelled image. **Save to watchlist** adds it to `/watchlist`.
6. Under **Consent recorded · privacy and controls**, **Withdraw consent** deletes the consent
   record and returns to the statement.

## 6. If the unit budget or session cap is reached

Each browser session can create 5 previews in 24 hours, and the demo has a fixed API unit budget.
Past either limit no API call is made; the page says why and offers a stored example labelled
**Not a live result**, which was not made from your images.

## 7. Run it locally in offline mock mode

Requires Node.js 20.9 or newer. No API key or `.env` file is needed.

```bash
git clone https://github.com/mjcole76/secondhand-fit
cd secondhand-fit
npm install
npm run dev               # http://localhost:3000
```

With no API key the app runs in mock mode and makes no outbound request. For live mode, see
"Live mode" in the repository `README.md`.

## What the app does not do

Secondhand Fit shows an AI-generated preview of appearance only. It makes no statement about fit,
size, condition or authenticity. The try-on handles upper-body garments only.
