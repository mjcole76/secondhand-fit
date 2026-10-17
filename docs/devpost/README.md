# Devpost submission package

Everything needed to fill in the 'Enter a Submission' page for the **YouCam API Skin AI &
eCommerce VTO Hackathon** (https://youcam-api-skin-ai-ecommerce.devpost.com/), kept in the
repository so the entry is written during the build and not on the last day.

This folder is the **draft** of the entry. It is not the entry: the Devpost form has not been
filled in, and several fields cannot be filled in yet (see [Blockers](#blockers)).

- Last updated: 2026-10-01
- Entry status on Devpost: **not started**
- All materials are in English, as the rules require.

## Deadline

The official rules give the Submission Period as "Sep 29, 2026 (12:00 pm Eastern Time) – Nov 2,
2026 (11:45 am Eastern Time)". The project plan uses **2026-11-02 06:00 UTC** as the deadline, which
is earlier than 11:45 am Eastern on that date. Work to the earlier time. Drafts can be saved on
Devpost before the period ends; after it ends, nothing in the submission can be changed.

## Files

| File | What it holds |
|---|---|
| [`description.md`](description.md) | The project name, the elevator pitch, the "Built with" list and the text description, written to be pasted into the form. |
| [`testing-instructions.md`](testing-instructions.md) | Reviewer testing instructions, written to be pasted into the form. |
| [`screenshots.md`](screenshots.md) | The shot list for the image gallery, with what each screenshot must show and which ones can be captured today. |
| `screenshots/` | Where the captured screenshots go. It does not exist yet: no submission screenshot has been captured. |

## Field by field

"Official" means the item is in the official rules or on the contest page (`build-packet/03-contest-contract.md`).
"Form" means it is a standard field of the Devpost project form. The form for this hackathon has not
been opened yet, so its exact fields, limits and any hackathon-specific questions are **unverified**
(open question in the contest contract). Read the live form first and add any field missing here.

| Field | Basis | Value or source | Status |
|---|---|---|---|
| Project name | Form | `Secondhand Fit` | Ready |
| Elevator pitch | Form | [`description.md`](description.md#elevator-pitch) | Draft ready |
| Text description (features, functionality, consumer/eCommerce value) | Official | [`description.md`](description.md#about-the-project) | Draft; contains blocks marked PENDING for features that are not built |
| YouCam API used | Official (the video must name it; the project must integrate at least one) | Perfect Corp. YouCam API — Apparel Virtual Try-On | Named in the draft; a live render from this codebase is still unconfirmed |
| Built with | Form | [`description.md`](description.md#built-with) | Draft ready |
| Screenshots | Official | [`screenshots.md`](screenshots.md) | **Not captured** |
| Working demo URL | Official (free of charge to judges until the end of the Judging Period) | **Not set** — the app is not deployed | **Blocked** |
| Code repository URL | Official (public with a licence, or private and shared with contact_event@PerfectCorp.com) | **Not set** — the project has not been pushed to a Git host | **Blocked** |
| Demo video URL | Official (1–3 minutes, public on YouTube or Vimeo) | **Not set** — the video is not recorded | **Blocked** (separate P0 feature) |
| Testing instructions | Build plan (`build-packet/16-demo-plan.md`); where they go on the form is unverified | [`testing-instructions.md`](testing-instructions.md) | Draft; not yet walked through on a deployed URL |
| Track or category (eCommerce VTO) | Unverified — the rules do not say whether the form asks for one | `eCommerce VTO`, if the form asks | To check on the form |
| New build or significant update | Official | New build: all application code was written on or after 2026-09-30 (`PROVENANCE.md`, section 1) | Stated in the draft |
| Special Awards opt-in | Official, optional | The entrant's decision; eligibility information must be true | Open |

## Blockers

These fields need something that does not exist yet. None of them can be closed from inside the
repository.

1. **Working demo URL.** The app has to be deployed to a public, unauthenticated URL that stays up
   until the end of the Judging Period (Nov 20, 2026).
2. **Repository URL.** The repository has to be published; see "Publishing the repository" in the
   root `README.md` and the open items in `PROVENANCE.md`.
3. **Demo video URL.** The video has to be recorded and published; see `build-packet/16-demo-plan.md`.
4. **Screenshots.** They should be captured from the deployed app once the screens in
   [`screenshots.md`](screenshots.md) exist.
5. **The description must match the build.** The rules require the project to "function as depicted
   in the video and/or text description". The draft marks every statement about an unbuilt feature
   as PENDING; those blocks have to be confirmed or deleted before the text is pasted.

## Before submitting

Do these in order, on the day the entry is filled in.

- [ ] Open the 'Enter a Submission' form and compare its fields with the table above. Add any
      field that is missing here.
- [ ] Re-read [`description.md`](description.md) against the deployed app. Delete each PENDING block
      whose feature did not ship; remove the marker from each one that did. No PENDING marker may
      reach Devpost.
- [ ] Walk through [`testing-instructions.md`](testing-instructions.md) on the deployed URL in a
      private browser window, exactly as written, and correct any step that does not match.
- [ ] Capture the screenshots listed in [`screenshots.md`](screenshots.md) and add each one that
      shows a photograph or a person to the asset register in `PROVENANCE.md`, section 2.
- [ ] Replace every `NOT SET` in this folder with the real URL, and open each URL while logged out:
      demo, repository, video.
- [ ] Complete the entrant confirmation at the end of `PROVENANCE.md`.
- [ ] Save the form as a draft, read the preview, then submit. Keep the confirmation email.

## URLs

| Item | URL |
|---|---|
| Working demo | NOT SET |
| Code repository | NOT SET |
| Demo video | NOT SET |
