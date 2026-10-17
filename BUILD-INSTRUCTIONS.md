# Build Instructions

Everything Claude Code/Fable needs is already in this folder. Follow these steps.

1. **Open this folder** in your Claude Code/Fable environment.

2. **Tell Claude:**

   > Read CLAUDE.md and the complete build-packet folder. Begin with the P0 requirements.

3. Claude should follow **`build-packet/MASTER-BUILD-PROMPT.md`**. It lists the official requirements, judging criteria, P0 and P1 features, and the build order.

4. **Keep the HackathonOS files intact:** `CLAUDE.md`, `BUILD-INSTRUCTIONS.md`, `README-HACKATHONOS.md`, `build-packet/` and `hackathonos/`.

5. **After major milestones**, update progress in ContestForge (Active Build → feature statuses and the Rules Checklist), then use **Sync Packet** in Build Bridge. That refreshes `hackathonos/build-status.json` and the packet here.

## Good milestones to check in
- The required technology works end to end (Devpost, Perfect Corp. YouCam API, YouCam API account (yce.perfectcorp.com/ai-api), YouTube (or Vimeo; Youku per contest page), Public or shared code repository (e.g., Git hosting)).
- All P0 features work with sample data.
- Acceptance tests in `build-packet/14-acceptance-tests.md` pass.
- Demo recorded within the time limit (180 seconds).

## If something conflicts with the rules
Stop and check `build-packet/03-contest-contract.md`. Official requirements always win over the plan.
