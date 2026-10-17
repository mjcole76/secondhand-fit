# HackathonOS files in this project

This folder is connected to **ContestForge (HackathonOS)** through **Build Bridge**.

| | |
|---|---|
| Contest | YouCam API Skin AI & eCommerce VTO Hackathon |
| Project | Secondhand Fit |
| Build Packet | v1 |
| Framework | Next.js |

## What is here

- **`build-packet/`** — the Build Packet: contest brief, official rules, Contest Contract, judging criteria, winner research, selected concept, product spec, feature map (P0–P3), architecture, UI and API plans, build sequence, acceptance tests, compliance checklist, demo plan, submission checklist, and `MASTER-BUILD-PROMPT.md`.
- **`hackathonos/`** — machine-readable context:
  - `contest.json` — contest facts, required technologies, mandatory rules, disqualification risks
  - `requirements.json` — the Rules Checklist with current statuses
  - `criteria.json` — published judging criteria and weights
  - `build-status.json` — feature and requirement status from ContestForge
  - `project.json` — the selected concept and this project's settings
  - `bridge-manifest.json` — the permanent link to ContestForge and the list of files Build Bridge manages
- **`CLAUDE.md`** — instructions Claude Code reads first.
- **`BUILD-INSTRUCTIONS.md`** — what to do next, step by step.

## Where things are stored

- **Contest requirements:** `build-packet/02-official-rules.md`, `build-packet/03-contest-contract.md`, `hackathonos/requirements.json`
- **Compliance:** `build-packet/15-compliance-checklist.md` and `hackathonos/build-status.json`

## How Build Bridge treats this folder

Build Bridge only writes the files listed in `hackathonos/bridge-manifest.json`. It never touches application code (`src/`, `app/`, `pages/`, `components/`, `lib/`, `public/`, `package.json`). If you edit a managed file, the next sync reports a conflict instead of overwriting it. Disconnecting in ContestForge never deletes this folder.
