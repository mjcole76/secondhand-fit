# Finish line

**Deadline: Monday Nov 2, 2026, 11:45 am Eastern (16:45 UTC). Aim to submit Sunday Nov 1.**

The app is finished and verified: typecheck, 32 unit tests, the copy guard, the clone check, the
production build and the offline end-to-end checks all pass. What is left can only be done from your
accounts. Do these in order. Each step says roughly how long it takes.

## 1. Make the repository public (2 min)

GitHub → `mjcole76/secondhand-fit` → Settings → General → Danger Zone → **Change visibility →
Public**. Then open https://github.com/mjcole76/secondhand-fit in a private window to check that it
loads.

The contest also accepts a private repository shared with contact_event@PerfectCorp.com.

## 2. Deploy the demo (15 min)

1. Sign in at https://render.com with GitHub.
2. **New → Blueprint** → pick `secondhand-fit`. Render reads `render.yaml`.
3. When it asks for `YOUCAM_API_KEY`, paste the API Key from https://yce.perfectcorp.com/ai-api.
4. Wait for the deploy (about 5 minutes). Open `<your-url>/api/health`: it should say `"ok":true`.
5. The free plan sleeps when idle, and the first visit then takes about a minute. Judging runs to
   Nov 20. Switching the service to the **Starter** plan (about $7 a month) keeps it awake. This is
   optional.

## 3. Prove a live render (10 min, uses about 2 units)

1. On the deployed URL, open a listing → **Try this piece on** → consent → choose a waist-up photo
   of yourself → **Create preview**.
2. The result should show "Source: live YouCam Apparel VTO render".
3. Open `/status` and check **Observed live responses**.
   - If the render failed, **Technical details** on `/try` shows the provider's reason.
   - If the feature is the problem, set `YOUCAM_VTO_FEATURE=cloth-v3` in Render's Environment tab
     and redeploy.
4. Once it works, set `liveRenderConfirmed: true` in `lib/youcam/adapter.ts` (near line 130) and
   commit. Optional, but `/status` will then say "yes".
5. Capture `docs/devpost/screenshots/07-progress.png` and `08-render-labelled.png` again from this
   live run.

## 4. Record and upload the video (1–2 hours)

Follow `docs/devpost/video-script.md`. Keep it between 1:00 and 3:00. Say "Perfect Corp YouCam
Apparel Virtual Try-On API" out loud and show it on screen. Include phone footage. Upload to YouTube
as **Public**, and check that it plays in a private window.

## 5. Fill in Devpost (30 min)

Go to https://youcam-api-skin-ai-ecommerce.devpost.com/ → Enter a Submission.

| Field | Source |
|---|---|
| Name, pitch, description, built with | `docs/devpost/description.md` |
| Testing instructions | `docs/devpost/testing-instructions.md`, with the demo URL filled in |
| Screenshots | `docs/devpost/screenshots/`, in the order in `screenshots.md` |
| Demo URL | Your Render URL |
| Repository URL | https://github.com/mjcole76/secondhand-fit |
| Video URL | Your YouTube link |

Save as a draft. Read the preview. Then **Submit**, and keep the confirmation email.

## 6. Sign-offs only you can make (5 min)

- `LICENSE` names "Marshall Coleman" as the copyright holder. Change it if that is wrong.
- Fill in the "Entrant confirmation" checklist at the end of `PROVENANCE.md`.
- Keep the YouCam account's API units above the demo budget until judging ends on Nov 20.
