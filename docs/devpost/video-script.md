# Demo video script (target 2:45, limit 3:00)

Rules this script follows: 1–3 minutes, public on YouTube, says and shows which YouCam API is used,
shows the app working on desktop **and** a phone, no third-party brands or copyrighted music. Record
on the deployed URL in live mode so the try-on is a real YouCam render.

**Before recording**

- Deploy, confirm one live render works, and check `/status` shows enough units left.
- Use a fresh browser profile (no bookmarks bar or extensions). Zoom to 110–125% so text is readable.
- Have a waist-up photo of yourself, facing the camera, with both shoulders in frame.
- Phone: open the deployed URL in the phone browser and screen-record it (iOS Control Centre or
  Android quick settings).
- Music: none, or a track from the YouTube Audio Library.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Desktop, `/sell/new` → **Try a sample photo check** → **Seeded bad flat-lay**. Rejection appears. | "This is what a resale listing photo really looks like: crumpled, on a checked duvet, half in shadow. Secondhand Fit catches it before a single API unit is spent." |
| 0:15–0:35 | Scroll slowly over the four check scores and the three retake instructions. Pause on "No API units were spent". | "Four checks run right in the browser: framing, background, flatness and shadow. The seller gets three specific instructions on how to retake it, not a generic error." |
| 0:35–0:55 | Choose **Seeded retake**. Show **Photo accepted**, grade A, then drag the before/after slider. | "Here's the retake. Every check passes. The server then prepares the image for try-on: upright, metadata stripped, cropped to the garment, background flattened and sized within the YouCam API's input limits." |
| 0:55–1:05 | Choose **Swimwear** in Category. The refusal appears. | "Categories the try-on shouldn't handle are refused before any photo is even requested." |
| 1:05–1:20 | `/listings`, then open a listing. Expand **Why this grade?** | "Every listing carries a grade for its source photo. The grade follows the weakest check, so one bad result can never be averaged away." |
| 1:20–1:35 | **Try this piece on** → consent screen. Tick the five items. | "Buyers see in plain language what gets uploaded, where it's sent and when it's deleted. The server refuses any try-on without this consent." |
| 1:35–2:05 | Upload your photo → **Create preview**. Let the real stages tick through. Result appears. Say the API name while the "Source: live YouCam Apparel VTO render" banner is visible. | "The server calls the **Perfect Corp YouCam Apparel Virtual Try-On API**. It uploads the garment and my photo, creates the task and polls it with a hard timeout. Each stage on screen is a real state change, not a timer." |
| 2:05–2:20 | Zoom in on the label and grade burned into the image. Click **Download preview**, then **Save to watchlist** → `/watchlist`. | "Every render says what it is: an AI-generated preview only, with no fit, size, condition or authenticity claim. And it says how good the source photo was. The label stays on downloads and in the watchlist." |
| 2:20–2:35 | Phone recording: `/sell/new` bad flat-lay rejection, then a listing page. | "Sellers shoot on phones, so the whole flow works in a mobile browser." |
| 2:35–2:45 | `/status` page showing the budget, then the home page. | "A unit budget that fails closed, an offline mock mode for anyone who clones the repo, and honesty on every render. Secondhand Fit: try-on for the listings that need it most." |

**On-screen text** (add in the editor): at 0:00 "Secondhand Fit", and during 1:35–2:05 "Powered by
Perfect Corp. YouCam API — Apparel Virtual Try-On".

**Upload to YouTube:** visibility **Public**, title "Secondhand Fit — YouCam Apparel VTO for resale
listings", and the repository URL in the description. Open the link in a private window to confirm
it plays while logged out.
