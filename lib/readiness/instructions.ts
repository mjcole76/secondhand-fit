/**
 * Reviewed copy for the readiness checks and the deterministic rule-to-copy mapping that turns
 * failed checks into retake instructions. Everything a seller reads about a check comes from the
 * tables in this file, so the checker can only describe the photo — never the garment itself.
 */

import type { CheckId, CheckReason, CheckResult, RetakeInstruction, Verdict } from "./contracts";
import { READINESS_THRESHOLDS } from "./thresholds";

/** A verdict is always shown as a word with a mark beside it, never by colour alone. */
export const VERDICT_WORD: Record<Verdict, string> = { pass: "Pass", warn: "Warning", fail: "Fail" };
export const VERDICT_MARK: Record<Verdict, string> = { pass: "✓", warn: "!", fail: "✕" };

export const CHECK_LABELS: Record<CheckId, string> = {
  framing: "Framing",
  background: "Background separation",
  flatness: "Flatness",
  occlusion_shadow: "Occlusion and shadow",
};

/** What each check looks at, shown under its label. */
export const CHECK_DESCRIPTIONS: Record<CheckId, string> = {
  framing: "Is the whole garment inside the photo, with a border around it?",
  background: "Does the garment stand out from a plain surface?",
  flatness: "Is the garment laid flat? Estimated from edge density, a proxy for creases.",
  occlusion_shadow: "Is the light even, with no hands, hangers or other objects in the shot?",
};

const SUMMARIES: Record<CheckId, Partial<Record<CheckReason, string>>> = {
  framing: {
    ok: "The whole garment is inside the photo with a clear border.",
    clipped: "Part of the garment is cut off at the edge of the photo.",
    too_tight: "The garment is very close to the edge of the photo.",
    too_small: "The garment takes up only a small part of the photo.",
  },
  background: {
    ok: "The surface is plain and the garment stands out from it.",
    patterned: "The surface behind the garment is patterned or textured.",
    low_contrast: "The garment colour is close to the surface colour.",
  },
  flatness: {
    ok: "The garment looks flat, with few creases.",
    creased: "There are many folds or creases across the garment.",
  },
  occlusion_shadow: {
    ok: "The light is even and nothing else is in the shot.",
    shadow: "Part of the photo is much darker than the rest.",
    intrusion: "Something other than the garment is in the shot.",
  },
};

const NOT_FOUND_SUMMARY = "Not scored — we could not find the garment edges.";

export function summaryFor(id: CheckId, reason: CheckReason): string {
  if (reason === "not_found") return NOT_FOUND_SUMMARY;
  return SUMMARIES[id][reason] ?? SUMMARIES[id].ok ?? "";
}

interface InstructionCopy {
  title: string;
  detail: string;
}

const INSTRUCTIONS: Record<CheckId, Partial<Record<CheckReason, InstructionCopy>>> = {
  background: {
    patterned: {
      title: "Move the garment to a plain, single-colour surface",
      detail:
        "The surface behind the garment has a busy pattern or texture. A plain sheet, a bare floor or a table in one colour works; checked, striped or printed bedding does not.",
    },
    low_contrast: {
      title: "Use a surface that contrasts with the garment",
      detail:
        "The garment colour is close to the surface colour, so its outline is hard to pick out. Put a light garment on a darker surface, or a dark garment on a lighter one.",
    },
  },
  flatness: {
    creased: {
      title: "Lay the garment flat and smooth out the creases",
      detail:
        "There are many folds and creases across the garment. Spread it out, straighten the sleeves and hem, and press the fabric flat with your hands before you retake the photo.",
    },
  },
  occlusion_shadow: {
    shadow: {
      title: "Even out the light so no shadow falls across the shot",
      detail:
        "One part of the photo is much darker than the rest. Stand so your own shadow is out of the frame, or move to a spot with even daylight and turn off any single strong lamp.",
    },
    intrusion: {
      title: "Remove hands, hangers and other objects from the shot",
      detail:
        "Something other than the garment is in the frame or overlapping it. Take the garment off the hanger, keep hands and feet out of the frame, and clear other items off the surface.",
    },
  },
  framing: {
    clipped: {
      title: "Move the garment fully inside the frame",
      detail:
        "Part of the garment is cut off at the edge of the photo. Step back or hold the phone higher until the whole garment is visible with a border of surface around it.",
    },
    too_tight: {
      title: "Leave a border of surface around the garment",
      detail:
        "The garment almost touches the edge of the photo. Step back slightly so there is a clear margin on all four sides.",
    },
    too_small: {
      title: "Move closer so the garment fills more of the photo",
      detail:
        "The garment takes up only a small part of the photo. Hold the phone closer, directly above the garment, while keeping a border on all four sides.",
    },
  },
};

/** Shown instead of per-check instructions when no garment outline could be found at all. */
const NOT_FOUND_INSTRUCTIONS: Array<InstructionCopy & { checkId: CheckId }> = [
  {
    checkId: "background",
    title: "Lay the garment on a plain surface that contrasts with it",
    detail:
      "We could not find the garment edges. This happens when the surface is patterned or is a similar colour to the garment. Use a plain, single-colour surface that is clearly lighter or darker than the garment.",
  },
  {
    checkId: "framing",
    title: "Show the whole garment with a border of surface around it",
    detail:
      "It also happens when the garment fills the whole photo. Step back until the surface is visible on all four sides of the garment.",
  },
];

/**
 * Maps the checks that did not pass to at most three ordered, concrete retake instructions.
 * Failing checks come before warnings; within each group the order follows
 * READINESS_THRESHOLDS.instructions.priority. Same input, same output — no model involved.
 */
export function generateRetakeInstructions(checks: CheckResult[], garmentFound: boolean): RetakeInstruction[] {
  const { max, priority } = READINESS_THRESHOLDS.instructions;

  if (!garmentFound) {
    return NOT_FOUND_INSTRUCTIONS.slice(0, max).map((copy, i) => ({
      order: i + 1,
      checkId: copy.checkId,
      checkLabel: CHECK_LABELS[copy.checkId],
      severity: "required",
      title: copy.title,
      detail: copy.detail,
    }));
  }

  const rank = (c: CheckResult) => (c.verdict === "fail" ? 0 : 1) * priority.length + priority.indexOf(c.id);

  const out: RetakeInstruction[] = [];
  for (const check of checks.filter((c) => c.verdict !== "pass").sort((a, b) => rank(a) - rank(b))) {
    const copy = INSTRUCTIONS[check.id][check.reason];
    if (!copy) continue;
    out.push({
      order: out.length + 1,
      checkId: check.id,
      checkLabel: CHECK_LABELS[check.id],
      severity: check.verdict === "fail" ? "required" : "optional",
      title: copy.title,
      detail: copy.detail,
    });
    if (out.length >= max) break;
  }
  return out;
}
