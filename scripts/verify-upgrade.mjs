/** Offline integration checks. Build first. Starts its own server and never calls YouCam. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3197;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  env: { ...process.env, YOUCAM_MOCK: "true", YOUCAM_API_KEY: "", TRYON_SESSION_RENDER_CAP: "1", YOUCAM_MOCK_LATENCY_MS: "0", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (s) => { output += s; });
server.stderr.on("data", (s) => { output += s; });
let cookie = "";
const request = async (path, init = {}) => fetch(base + path, { ...init, headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) } });
const post = (path, body) => request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const passed = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    if (output.includes("Ready in")) {
      try { ready = (await request("/api/health")).ok; } catch {}
    }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "Server starts");
  assert.equal((await (await request("/api/status")).json()).providerMode, "mock", "Verification must use mock mode");
  assert.equal((await request("/api/tryon", { method: "POST", body: new FormData() })).status, 403);
  passed.push("try-on requires server-side consent");
  assert.equal((await post("/api/listings", { title: "Blocked", category: "intimates" })).status, 422);
  passed.push("blocked category refused before upload");
  const draft = (await (await post("/api/listings", { title: "Offline verification piece", category: "tops", sizeText: "M" })).json()).listing;
  assert.ok(draft.id);
  await post("/api/readiness", { source: "seeded-bad", listingId: draft.id });
  assert.equal((await post(`/api/listings/${draft.id}/publish`, {})).status, 409);
  passed.push("failed photo cannot publish");

  const good = Buffer.from(await (await request("/api/readiness/seeded/retake")).arrayBuffer());
  const { data, info } = await sharp(good).resize({ width: 160, height: 160, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const readinessBody = { source: "upload", listingId: draft.id, category: "tops", grid: { width: info.width, height: info.height, rgbaBase64: data.toString("base64") } };
  assert.equal((await post("/api/readiness", readinessBody)).status, 200);
  const unprepared = await post(`/api/listings/${draft.id}/publish`, {});
  assert.equal(unprepared.status, 409);
  assert.equal((await unprepared.json()).code, "photo_not_prepared");
  const prepare = () => request(`/api/listings/${draft.id}/normalise?source=upload`, { method: "POST", headers: { "Content-Type": "image/png" }, body: good });
  assert.equal((await prepare()).status, 201);
  const publish = await post(`/api/listings/${draft.id}/publish`, {});
  assert.equal(publish.status, 201);
  const listing = (await publish.json()).listing;
  assert.ok(listing.image.url.includes("/normalised?v="));
  assert.equal((await request(listing.image.url)).status, 200);
  assert.equal((await request(listing.image.url.replace(/v=[a-f0-9]+/, "v=outdated"))).status, 404);
  passed.push("uploaded listing publishes with its prepared image and rejects stale image versions");
  await post("/api/readiness", readinessBody);
  assert.equal((await post(`/api/listings/${draft.id}/publish`, {})).status, 409);
  passed.push("new photo attempt cannot reuse an older prepared image");
  await prepare();
  await post(`/api/listings/${draft.id}/publish`, {});

  const initial = await (await request("/api/consent")).json();
  const consent = await post("/api/consent", { listingId: null, scopeVersion: initial.scopeVersion, accepted: ["upload", "provider", "retention", "deletion", "preview"] });
  assert.equal(consent.status, 200);
  cookie = consent.headers.get("set-cookie").split(";")[0];
  const bad = Buffer.from(await (await request("/api/readiness/seeded/bad")).arrayBuffer());
  const makeForm = () => { const form = new FormData(); form.set("garment", new Blob([good], { type: "image/png" }), "garment.png"); form.set("person", new Blob([bad], { type: "image/png" }), "person.png"); return form; };
  const createdResponse = await request("/api/tryon", { method: "POST", body: makeForm() });
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json();
  assert.equal(created.mode, "mock");
  let result;
  for (let i = 0; i < 15; i++) { result = await (await request(`/api/tryon/${encodeURIComponent(created.renderId)}`)).json(); if (result.status === "succeeded") break; await new Promise((r) => setTimeout(r, 200)); }
  assert.equal(result.status, "succeeded");
  const image = await (await request(result.resultUrl)).text();
  assert.ok(image.includes("AI-generated preview only"));
  assert.ok(image.includes("Source photo checks"));
  passed.push("mock render completes and image includes the persistent label and photo badge");
  const capped = await (await request("/api/tryon", { method: "POST", body: makeForm() })).json();
  assert.equal(capped.mode, "precomputed");
  assert.equal(capped.fallback.reason, "fair_use_cap");
  passed.push("session cap offers a precomputed result without a live call");
  assert.ok((await request("/api/consent", { method: "DELETE" })).ok);
  assert.equal((await request("/api/tryon", { method: "POST", body: makeForm() })).status, 403);
  passed.push("withdrawal blocks further requests");
  console.log(JSON.stringify({ ok: true, mode: "offline mock only", passed }, null, 2));
} finally {
  server.kill();
  if (server.exitCode === null) await once(server, "exit");
}
