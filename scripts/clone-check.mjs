/**
 * Clone check: fails when a fresh clone would need something README.md does not mention.
 *
 * The repository has to run in offline mock mode from `git clone`, `npm install` and `npm run dev`
 * and nothing else. This script checks the parts of that promise that drift as the code grows:
 *
 *   - the files a clone needs are in the tree, and the mock render the fixtures point at exists
 *   - .gitignore keeps .env out of the repository and .env.example in it
 *   - every environment variable the code reads is in .env.example and in README.md
 *   - .env.example carries no credential values, so a copy of it still starts in mock mode
 *   - every npm script and the Node.js version in package.json are in README.md
 *   - that Node.js version covers what every package in package-lock.json needs
 *   - LICENSE matches the licence in package.json and README.md links to it
 *   - every asset under public/ is listed in PROVENANCE.md
 *
 * It only reads files: no network, no git, nothing beyond Node.js itself, so it runs before
 * `npm install`. It does not start the app, and does not replace following the README from a real
 * clone on another machine.
 *
 * Run with `npm run clone-check`. It is a separate step: `npm run build` does not run it.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** This file holds the patterns below as text, so it is left out of the scan. */
const SELF = "scripts/clone-check.mjs";

/** What `npm install` and `npm run dev` need from the repository to reach offline mock mode. */
const REQUIRED_FILES = [
  "README.md",
  "LICENSE",
  "PROVENANCE.md",
  ".env.example",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "next.config.mjs",
  "tsconfig.json",
  "lib/youcam/fixtures/file-upload.response.json",
  "lib/youcam/fixtures/task-create.response.json",
  "lib/youcam/fixtures/task-status.running.json",
  "lib/youcam/fixtures/task-status.success.json",
  "public/mock/mock-render.svg",
  "public/mock/precomputed-render.svg",
];

const SUCCESS_FIXTURE = "lib/youcam/fixtures/task-status.success.json";

const CODE_ROOTS = ["app", "components", "lib", "scripts"];
const CODE_FILES = ["next.config.mjs"];
const CODE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

/** The ways the code reads an environment variable by name. */
const ENV_READS = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g,
  // The envInt and envStr helpers in lib/youcam/adapter.ts take the variable name as a string.
  /\benv(?:Int|Str)\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
];

/** Set by Node.js or Next.js, never by the person running the project. */
const ENV_SET_BY_TOOLING = ["NODE_ENV"];

/** A variable with one of these endings holds a credential and must be empty in .env.example. */
const CREDENTIAL_NAME = /(?:_KEY|_SECRET|_TOKEN|_PASSWORD)$/;

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function repoPath(file) {
  return relative(ROOT, file).replace(/\\/g, "/");
}

function walk(dir, keep, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, keep, out);
    else if (keep(entry.name)) out.push(full);
  }
  return out;
}

/** Every environment variable the code reads, with the first file that reads it. */
function envNamesRead() {
  const names = new Map();
  const files = [
    ...CODE_ROOTS.flatMap((root) => walk(join(ROOT, root), (name) => CODE_EXTENSIONS.includes(extname(name)))),
    ...CODE_FILES.map((file) => join(ROOT, file)),
  ];
  for (const file of files) {
    const path = repoPath(file);
    if (path === SELF) continue;
    const source = readFileSync(file, "utf8");
    for (const pattern of ENV_READS) {
      for (const m of source.matchAll(pattern)) {
        if (!ENV_SET_BY_TOOLING.includes(m[1]) && !names.has(m[1])) names.set(m[1], path);
      }
    }
  }
  return names;
}

/** NAME=value lines of .env.example, commented out or not, with any trailing comment removed. */
function envExampleEntries(text) {
  const entries = new Map();
  for (const m of text.matchAll(/^#?[ \t]*([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
    entries.set(m[1], m[2].replace(/\s+#.*$/, "").trim());
  }
  return entries;
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** The lowest version a semver range such as ">=20.9.0" or "^18.18.0 || >= 20.0.0" accepts. */
function lowestVersion(range) {
  let lowest = null;
  for (const m of range.matchAll(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/g)) {
    const version = [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
    if (!lowest || compareVersions(version, lowest) < 0) lowest = version;
  }
  return lowest;
}

/** [20, 9, 0] as "20.9" and [20, 0, 0] as "20", the way README.md writes it. */
function shortVersion([major, minor, patch]) {
  if (patch) return `${major}.${minor}.${patch}`;
  return minor ? `${major}.${minor}` : `${major}`;
}

const results = [];

function check(name, problems) {
  results.push({ name, problems });
}

const missing = REQUIRED_FILES.filter((path) => !existsSync(join(ROOT, path)));
check(
  "the files a fresh clone needs are in the tree",
  missing.map((path) => `${path} is missing`),
);

// Everything below reads those files, so there is nothing more to check without them.
if (missing.length === 0) {
  const readme = read("README.md");
  const envExample = read(".env.example");
  const provenance = read("PROVENANCE.md");
  const licence = read("LICENSE");
  const pkg = JSON.parse(read("package.json"));

  {
    const problems = [];
    // YouCam API V2 shape: data.results.url.
    const url = JSON.parse(read(SUCCESS_FIXTURE))?.data?.results?.url;
    if (typeof url !== "string" || !url.startsWith("/")) {
      problems.push(`${SUCCESS_FIXTURE} does not point at a file under public/, so mock mode would leave this app`);
    } else if (!existsSync(join(ROOT, "public", url))) {
      problems.push(`${SUCCESS_FIXTURE} points at ${url}, and public${url} is missing`);
    }
    check("the mock render the fixtures point at is in public/", problems);
  }

  {
    const problems = [];
    const lines = read(".gitignore")
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^\/|\/$/g, ""));
    if (!lines.includes(".env")) problems.push(".gitignore does not ignore .env");
    if (!lines.includes("node_modules")) problems.push(".gitignore does not ignore node_modules");
    if (!lines.includes(".next")) problems.push(".gitignore does not ignore .next");
    if ((lines.includes(".env.*") || lines.includes(".env*")) && !lines.includes("!.env.example")) {
      problems.push(".gitignore ignores .env.example: add the line !.env.example");
    }
    check(".gitignore keeps .env out of the repository and .env.example in it", problems);
  }

  const envNames = envNamesRead();
  const documented = envExampleEntries(envExample);

  {
    const problems = [];
    for (const [name, path] of envNames) {
      if (!documented.has(name)) problems.push(`${name} (read in ${path}) is not in .env.example`);
      if (!readme.includes(`\`${name}\``)) problems.push(`${name} (read in ${path}) is not in README.md`);
    }
    check(`all ${envNames.size} environment variables the code reads are in .env.example and README.md`, problems);
  }

  {
    const problems = [];
    for (const [name, value] of documented) {
      if (CREDENTIAL_NAME.test(name) && value !== "") problems.push(`${name} has a value in .env.example: leave it empty`);
    }
    check(".env.example carries no credential values", problems);
  }

  {
    const problems = [];
    if (!readme.includes("npm install")) problems.push("README.md does not mention npm install");
    for (const script of Object.keys(pkg.scripts ?? {})) {
      if (!readme.includes(`npm run ${script}`)) problems.push(`npm run ${script} is not in README.md`);
    }
    const nodeFloor = lowestVersion(pkg.engines?.node ?? "");
    if (!nodeFloor) problems.push("package.json has no engines.node, so the Node.js version a clone needs is not stated");
    else if (!readme.includes(`Node.js ${shortVersion(nodeFloor)}`)) {
      problems.push(`README.md does not name Node.js ${shortVersion(nodeFloor)}`);
    }
    check("every npm script and the Node.js version are in README.md", problems);
  }

  {
    // A dependency that needs a newer Node.js than package.json states only warns at npm install
    // (EBADENGINE) and then fails at run time, so the stated floor must cover every package.
    const problems = [];
    const nodeFloor = lowestVersion(pkg.engines?.node ?? "");
    const lock = JSON.parse(read("package-lock.json"));
    let needed = null;
    let neededBy = "";
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      if (path === "" || typeof entry?.engines?.node !== "string") continue;
      const floor = lowestVersion(entry.engines.node);
      if (floor && (!needed || compareVersions(floor, needed) > 0)) {
        needed = floor;
        neededBy = path.replace(/^.*node_modules\//, "");
      }
    }
    if (nodeFloor && needed && compareVersions(nodeFloor, needed) < 0) {
      problems.push(
        `${neededBy} needs Node.js ${needed.join(".")} but package.json states ${pkg.engines.node}: raise engines.node and the README requirement`,
      );
    }
    check("the Node.js version in package.json covers every dependency in package-lock.json", problems);
  }

  {
    const problems = [];
    if (!pkg.license) problems.push("package.json has no license field");
    else if (!licence.includes(pkg.license)) problems.push(`LICENSE does not name the ${pkg.license} licence from package.json`);
    if (!readme.includes("](LICENSE)")) problems.push("README.md does not link to LICENSE");
    check("LICENSE matches package.json and README.md links to it", problems);
  }

  {
    // Markdown under public/ is a licence note about the assets, not an asset.
    const assets = walk(join(ROOT, "public"), (name) => extname(name) !== ".md").map(repoPath);
    check(
      `all ${assets.length} assets under public/ are listed in PROVENANCE.md`,
      assets.filter((path) => !provenance.includes(path)).map((path) => `${path} is not in PROVENANCE.md`),
    );
  }
}

const failed = results.filter((r) => r.problems.length > 0);

for (const r of results) {
  const line = `  ${r.problems.length === 0 ? "ok  " : "FAIL"}  ${r.name}`;
  if (r.problems.length === 0) console.log(line);
  else console.error([line, ...r.problems.map((p) => `          ${p}`)].join("\n"));
}

if (failed.length > 0) {
  console.error(
    `\nclone-check: ${failed.length} of ${results.length} checks failed. A fresh clone would need something README.md does not mention.`,
  );
  process.exit(1);
}

console.log(`\nclone-check: ${results.length} checks passed. Nothing a fresh clone needs is missing or undocumented.`);
