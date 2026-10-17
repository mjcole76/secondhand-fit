/**
 * Copy guard: fails when claim vocabulary appears in user-facing copy.
 *
 * Secondhand Fit shows an appearance preview and nothing else. It must never say, or imply, that a
 * garment fits, is true to size, matches measurements, is authentic, is in a given condition, or
 * that anything is guaranteed. This script enforces that mechanically instead of by convention.
 *
 * What is scanned
 *   - app/, components/, lib/ (.ts, .tsx): every string literal, template string and piece of JSX
 *     text. Comments, identifiers and import paths are not copy and are not scanned.
 *   - public/ (.svg): the whole file, because the drawings carry burned-in text.
 *
 * The banned terms may appear only inside the REVIEWED_PHRASES below: the product name and the
 * wording that refuses a claim. Anything else is a violation, exit code 1.
 *
 * Run with `npm run copy-guard`. It is a separate step: `npm run build` does not run it. Chain it
 * in front of the build, or run it in CI, to make a banned term stop a release.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CODE_ROOTS = ["app", "components", "lib"];
const ASSET_ROOTS = ["public"];

/** Claim vocabulary from build-packet/10-technical-architecture.md (copyGuardLint), with inflections. */
const BANNED = [
  { term: "fit", pattern: /\bfit(?:s|ted|ting)?\b/gi },
  { term: "true to size", pattern: /\btrue[\s-]+to[\s-]+size\b/gi },
  { term: "measurements", pattern: /\bmeasurements?\b/gi },
  { term: "authentic", pattern: /\bauthentic(?:ally|ity)?\b/gi },
  { term: "condition grade", pattern: /\bcondition[\s-]+grad(?:e|es|ed|ing)\b/gi },
  { term: "guarantee", pattern: /\bguarante(?:e|es|ed|eing)\b/gi },
];

/**
 * The only wording a banned term may appear in. Add a phrase here only after reviewing that it
 * names the product or refuses a claim; never to make a claim pass.
 */
const REVIEWED_PHRASES = [
  { phrase: "Secondhand Fit", why: "the product name" },
  { phrase: "secondhand-fit", why: "the product name as a slug, in download file names and service ids" },
  {
    phrase: "No fit, size, condition or authenticity claim is made",
    why: "the preview-only label (PREVIEW_ONLY_LABEL), which refuses the claim",
  },
];

/** Exact wording and exact case; only the whitespace between words may differ (JSX text wraps). */
function phraseRegex(phrase) {
  const words = phrase.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(words.join("\\s+"), "g");
}

const REVIEWED = REVIEWED_PHRASES.map((p) => phraseRegex(p.phrase));

/** Banned terms left in `text` once the reviewed phrases are blanked out, with their offsets. */
function findBanned(text) {
  let rest = text;
  for (const re of REVIEWED) rest = rest.replace(re, (m) => " ".repeat(m.length));
  const hits = [];
  for (const { term, pattern } of BANNED) {
    for (const m of rest.matchAll(pattern)) hits.push({ term, found: m[0], index: m.index });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** The guard checks itself first, so a broken rule cannot pass silently. */
function selfTest() {
  const mustFlag = [
    "Guaranteed to fit",
    "Runs true to size",
    "Measurements match the label",
    "An authentic piece",
    "Condition grade: excellent",
    "A secondhand fit you will love",
  ];
  const mustPass = [
    "Secondhand Fit",
    "secondhand-fit-preview-only.png",
    "AI-generated preview only. No fit, size, condition or authenticity claim is made.",
    "Authenticating with the YouCam API",
    "Try-on readiness: grade B",
    "A benefit of the outfit",
  ];
  const wrong = [
    ...mustFlag.filter((s) => findBanned(s).length === 0).map((s) => `not flagged: "${s}"`),
    ...mustPass.filter((s) => findBanned(s).length > 0).map((s) => `wrongly flagged: "${s}"`),
  ];
  if (wrong.length > 0) {
    console.error(`copy-guard: self-test failed, the rules are broken.\n  ${wrong.join("\n  ")}`);
    process.exit(2);
  }
}

function walk(dir, extensions, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extensions, out);
    else if (extensions.includes(extname(entry.name))) out.push(full);
  }
  return out;
}

/** Every piece of text in a source file that can end up in front of a user. */
function copyStrings(file, source) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const out = [];
  const visit = (node) => {
    // Module specifiers are paths, not copy.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isJsxText(node)) {
      out.push({ text: node.text, offset: node.pos });
    } else if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail
    ) {
      // +1 steps over the opening quote, backtick or closing brace of the previous substitution.
      out.push({ text: node.text, offset: node.getStart(sf) + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out.map((s) => ({ ...s, lineOf: (index) => sf.getLineAndCharacterOfPosition(s.offset + index).line + 1 }));
}

function excerpt(text, index, length) {
  const from = Math.max(0, index - 30);
  const to = Math.min(text.length, index + length + 30);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).replace(/\s+/g, " ")}${to < text.length ? "…" : ""}`;
}

selfTest();

const violations = [];
let filesChecked = 0;
let stringsChecked = 0;

for (const root of CODE_ROOTS) {
  for (const file of walk(join(ROOT, root), [".ts", ".tsx"])) {
    filesChecked++;
    for (const s of copyStrings(file, readFileSync(file, "utf8"))) {
      stringsChecked++;
      for (const hit of findBanned(s.text)) {
        violations.push({ file, line: s.lineOf(hit.index), ...hit, context: excerpt(s.text, hit.index, hit.found.length) });
      }
    }
  }
}

for (const root of ASSET_ROOTS) {
  for (const file of walk(join(ROOT, root), [".svg"])) {
    filesChecked++;
    stringsChecked++;
    const text = readFileSync(file, "utf8");
    for (const hit of findBanned(text)) {
      const line = text.slice(0, hit.index).split("\n").length;
      violations.push({ file, line, ...hit, context: excerpt(text, hit.index, hit.found.length) });
    }
  }
}

if (violations.length > 0) {
  console.error(`copy-guard: ${violations.length} banned claim term(s) in user-facing copy.\n`);
  for (const v of violations) {
    console.error(`  ${relative(ROOT, v.file).replace(/\\/g, "/")}:${v.line}  "${v.found}" (banned: ${v.term})`);
    console.error(`    ${v.context}`);
  }
  console.error(
    "\nReword the copy so it describes appearance only. The reviewed wording a banned term may appear in is listed in scripts/copy-guard.mjs.",
  );
  process.exit(1);
}

console.log(
  `copy-guard: ${stringsChecked} strings in ${filesChecked} files checked, 0 banned claim terms (${BANNED.length} rules, ${REVIEWED_PHRASES.length} reviewed phrases).`,
);
