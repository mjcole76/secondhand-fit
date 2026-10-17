/**
 * Unit tests for the YouCam adapter (API V2): the pinned fixtures, the response parsers, the
 * error-code messages, the pre-upload input checks and the request contract of the live path.
 *
 * No test reaches the network. Every test replaces globalThis.fetch with a recorder that answers
 * from the fixtures, so the live path can be checked request by request without an API key.
 *
 * Run with `npm run test` (compiles with tsconfig.test.json into .test-build/, then node --test).
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, test } from "node:test";

import sharp from "sharp";

import {
  GARMENT_CATEGORIES,
  YOUCAM_ERROR_CODES,
  YOUCAM_ERROR_MESSAGES,
  YOUCAM_PINNED,
  YouCamError,
  checkTask,
  createTryOnTask,
  extractFeatureCost,
  getYouCamConfig,
  parseFileUpload,
  parseTaskCreate,
  parseTaskStatus,
  prepareImageInput,
  refreshFeatureCost,
  runApparelTryOn,
  sniffImageMime,
  taskBody,
  uploadImage,
  userMessageForErrorCode,
} from "../adapter";
import errorFixture from "../fixtures/error.response.json";
import fileUploadFixture from "../fixtures/file-upload.response.json";
import taskCreateFixture from "../fixtures/task-create.response.json";
import taskErrorFixture from "../fixtures/task-status.error.json";
import taskRunningFixture from "../fixtures/task-status.running.json";
import taskSuccessFixture from "../fixtures/task-status.success.json";

// ---------------------------------------------------------------------------
// Harness: environment and a recording fetch
// ---------------------------------------------------------------------------

const ENV_KEYS = [
  "YOUCAM_API_KEY",
  "YOUCAM_SECRET_KEY",
  "YOUCAM_MOCK",
  "YOUCAM_BASE_URL",
  "YOUCAM_VTO_FEATURE",
  "YOUCAM_VTO_CATEGORY",
  "YOUCAM_MOCK_LATENCY_MS",
] as const;
type EnvKey = (typeof ENV_KEYS)[number];

const TEST_KEY = "test-api-key-not-a-real-credential";
const BASE = "https://youcam.test.invalid";

function setEnv(values: Partial<Record<EnvKey, string>>): void {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** Parsed JSON for a JSON body, the byte length for a binary body. */
  body: unknown;
}

let calls: RecordedCall[] = [];
const realFetch = globalThis.fetch;
let savedEnv: Partial<Record<EnvKey, string | undefined>> = {};

function installFetch(answer: (call: RecordedCall) => Response): void {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const raw = init?.body;
    const call: RecordedCall = {
      url,
      method: init?.method ?? "GET",
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
      body: typeof raw === "string" ? JSON.parse(raw) : raw instanceof Uint8Array ? raw.length : undefined,
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
}

/** A fetch that fails the test if anything is requested. */
function forbidNetwork(): void {
  installFetch((call) => {
    throw new Error(`unexpected outbound request: ${call.method} ${call.url}`);
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const PUT_URL = fileUploadFixture.data.files[0].requests[0].url;
const TASK_ID = taskCreateFixture.data.task_id;

/** Answers the documented V2 routes from the fixtures; anything else is a 404. */
function v2Provider(overrides: { taskStatus?: unknown; taskCreate?: [unknown, number]; featureCost?: unknown } = {}) {
  return (call: RecordedCall): Response => {
    if (call.url === PUT_URL) return new Response(null, { status: 200 });
    const path = new URL(call.url).pathname;
    if (call.method === "POST" && path === "/s2s/v2.0/file/cloth") return json(fileUploadFixture);
    if (call.method === "POST" && path === "/s2s/v2.0/task/cloth") {
      return overrides.taskCreate ? json(...overrides.taskCreate) : json(taskCreateFixture);
    }
    if (call.method === "GET" && path === `/s2s/v2.0/task/cloth/${TASK_ID}`) {
      return json(overrides.taskStatus ?? taskSuccessFixture);
    }
    if (call.method === "GET" && path === "/s2s/v2.0/credit/feature-cost") {
      return json(overrides.featureCost ?? { status: 200, data: {} });
    }
    return json({ status: 404, error: "not found" }, 404);
  };
}

async function image(format: "jpeg" | "png" | "webp", width: number, height: number): Promise<Uint8Array> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 80 } } });
  const out = format === "jpeg" ? base.jpeg() : format === "png" ? base.png() : base.webp();
  return new Uint8Array(await out.toBuffer());
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  calls = [];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------
// Fixtures and parsers
// ---------------------------------------------------------------------------

describe("pinned V2 fixtures", () => {
  test("file upload: data.files[0].file_id and the PUT request descriptor", () => {
    const { fileId, put } = parseFileUpload(fileUploadFixture.data);
    assert.equal(fileId, "mock-file");
    assert.equal(put.method, "PUT");
    assert.equal(put.url, PUT_URL);
    assert.deepEqual(put.headers, { "Content-Type": "image/jpeg" });
  });

  test("task create: data.task_id", () => {
    assert.equal(parseTaskCreate(taskCreateFixture.data), "mock-task");
  });

  test("task status running: data.task_status running", () => {
    assert.deepEqual(parseTaskStatus(taskRunningFixture.data, taskRunningFixture), {
      state: "running",
      providerStatus: "running",
    });
  });

  test("task status success: data.results.url", () => {
    assert.deepEqual(parseTaskStatus(taskSuccessFixture.data, taskSuccessFixture), {
      state: "succeeded",
      providerStatus: "success",
      resultUrl: "/mock/mock-render.svg",
    });
  });

  test("task status error: failed, with the error_code's own message", () => {
    const status = parseTaskStatus(taskErrorFixture.data, taskErrorFixture);
    assert.equal(status.state, "failed");
    assert.equal(status.providerStatus, "error");
    assert.equal(status.errorCode, "error_no_shoulder");
    assert.equal(status.error, YOUCAM_ERROR_MESSAGES.error_no_shoulder);
  });

  test("task status error: error_code on the envelope is used when data has none", () => {
    const status = parseTaskStatus({ task_status: "error" }, { status: 200, error_code: "error_inference" });
    assert.equal(status.errorCode, "error_inference");
    assert.equal(status.error, YOUCAM_ERROR_MESSAGES.error_inference);
  });

  test("success without data.results.url is reported as a failure, not a clean success", () => {
    const status = parseTaskStatus({ task_status: "success", results: {} });
    assert.equal(status.state, "failed");
    assert.equal(status.resultUrl, undefined);
  });

  test("missing fields are refused", () => {
    assert.throws(() => parseFileUpload({ files: [] }), YouCamError);
    assert.throws(() => parseTaskCreate({}), YouCamError);
  });
});

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

describe("documented error codes", () => {
  const documented = [
    "error_no_shoulder",
    "error_large_face_angle",
    "exceed_max_filesize",
    "invalid_parameter",
    "error_download_image",
    "error_decode_image",
    "error_inference",
    "error_nsfw_content_detected",
    "error_multiple_people",
    "error_unsupport_ratio",
    "unknown_internal_error",
  ];

  test("all eleven are pinned", () => {
    assert.deepEqual([...YOUCAM_ERROR_CODES].sort(), [...documented].sort());
  });

  test("each maps to its own distinct user-facing message", () => {
    const messages = documented.map((code) => userMessageForErrorCode(code));
    for (const [i, code] of documented.entries()) {
      assert.equal(messages[i], YOUCAM_ERROR_MESSAGES[code as keyof typeof YOUCAM_ERROR_MESSAGES], code);
      assert.ok(messages[i].length >= 40, `${code} has a specific message`);
      assert.ok(!messages[i].includes(code), `${code} is explained, not echoed`);
    }
    assert.equal(new Set(messages).size, documented.length);
  });

  test("an unknown code and a missing code get messages of their own", () => {
    const known = new Set(documented.map((code) => userMessageForErrorCode(code)));
    const unknown = userMessageForErrorCode("error_something_new");
    const missing = userMessageForErrorCode(undefined);
    assert.ok(!known.has(unknown));
    assert.ok(!known.has(missing));
    assert.ok(unknown.includes("error_something_new"));
  });
});

// ---------------------------------------------------------------------------
// Input preparation: before any request is issued
// ---------------------------------------------------------------------------

describe("pre-upload input checks", () => {
  test("a JPEG inside the limits is sent unchanged", async () => {
    forbidNetwork();
    const jpeg = await image("jpeg", 64, 48);
    const out = await prepareImageInput(jpeg, "Garment image");
    assert.equal(out.contentType, "image/jpeg");
    assert.deepEqual(out.bytes, jpeg);
    assert.deepEqual(out.changes, []);
    assert.equal(calls.length, 0);
  });

  test("a PNG inside the limits is sent unchanged", async () => {
    forbidNetwork();
    const png = await image("png", 64, 48);
    const out = await prepareImageInput(png, "Garment image");
    assert.equal(out.contentType, "image/png");
    assert.deepEqual(out.bytes, png);
    assert.equal(calls.length, 0);
  });

  test("WebP is converted to JPEG with sharp", async () => {
    forbidNetwork();
    const out = await prepareImageInput(await image("webp", 64, 48), "Garment image");
    assert.equal(out.contentType, "image/jpeg");
    assert.equal(sniffImageMime(out.bytes), "image/jpeg");
    assert.deepEqual([out.width, out.height], [64, 48]);
    assert.ok(out.changes.includes("converted from WebP to JPEG"));
    assert.equal(calls.length, 0);
  });

  test("a type other than JPG, JPEG, PNG or WebP is refused", async () => {
    forbidNetwork();
    const gif = new Uint8Array(Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(32)]));
    await assert.rejects(prepareImageInput(gif, "Garment image"), (err: unknown) => {
      assert.ok(err instanceof YouCamError);
      assert.equal(err.kind, "validation");
      assert.match(err.message, /unsupported file type/);
      return true;
    });
    assert.equal(calls.length, 0);
  });

  test("a long side over 4096 px is scaled down to 4096 px", async () => {
    forbidNetwork();
    const out = await prepareImageInput(await image("png", 5000, 50), "Garment image");
    assert.equal(out.contentType, "image/png");
    assert.equal(Math.max(out.width, out.height), YOUCAM_PINNED.input.maxSidePx);
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    assert.equal(meta.width, YOUCAM_PINNED.input.maxSidePx);
    assert.equal(calls.length, 0);
  });

  test("a file of 10 MB or more is refused", async () => {
    forbidNetwork();
    const noise = await sharp(randomBytes(2000 * 2000 * 3), { raw: { width: 2000, height: 2000, channels: 3 } })
      .png({ compressionLevel: 0 })
      .toBuffer();
    assert.ok(noise.length >= YOUCAM_PINNED.input.maxBytes);
    await assert.rejects(prepareImageInput(new Uint8Array(noise), "Garment image"), (err: unknown) => {
      assert.ok(err instanceof YouCamError);
      assert.equal(err.kind, "validation");
      assert.match(err.message, /under 10 MB/);
      return true;
    });
    assert.equal(calls.length, 0);
  });

  test("an empty file is refused", async () => {
    forbidNetwork();
    await assert.rejects(prepareImageInput(new Uint8Array(0), "Buyer photo"), YouCamError);
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("configuration", () => {
  test("no API key means mock mode", () => {
    setEnv({});
    const cfg = getYouCamConfig();
    assert.equal(cfg.mode, "mock");
    assert.equal(cfg.mockReason, "YOUCAM_API_KEY is not set");
  });

  test("an API key alone is enough for live mode; YOUCAM_SECRET_KEY is not needed", () => {
    setEnv({ YOUCAM_API_KEY: TEST_KEY, YOUCAM_MOCK: "false" });
    const cfg = getYouCamConfig();
    assert.equal(cfg.mode, "live");
    assert.equal(cfg.apiVersion, "v2.0");
    assert.equal(cfg.baseUrl, "https://yce-api-01.perfectcorp.com");
  });

  test("YOUCAM_BASE_URL overrides the host", () => {
    setEnv({ YOUCAM_API_KEY: TEST_KEY, YOUCAM_BASE_URL: `${BASE}/` });
    assert.equal(getYouCamConfig().baseUrl, BASE);
  });

  test("a category outside the documented enum is ignored, with a note", () => {
    setEnv({ YOUCAM_VTO_CATEGORY: "dresses" });
    const cfg = getYouCamConfig();
    assert.equal(cfg.category, "upper_body");
    assert.match(cfg.categoryNote, /not one of/);
  });

  test("the task body is src_file_id, ref_file_id and garment_category, never template_id", () => {
    setEnv({});
    const cfg = getYouCamConfig();
    assert.deepEqual([...GARMENT_CATEGORIES], ["upper_body", "lower_body", "full_body", "auto", "shoes"]);
    for (const category of GARMENT_CATEGORIES) {
      const body = taskBody({ personFileId: "p", garmentFileId: "g", category }, cfg);
      assert.deepEqual(body, { src_file_id: "p", ref_file_id: "g", garment_category: category });
      assert.ok(!("template_id" in body));
    }
    assert.throws(
      () => taskBody({ personFileId: "p", garmentFileId: "g", category: "hats" as never }, cfg),
      YouCamError,
    );
  });
});

// ---------------------------------------------------------------------------
// Live path, against a recording fetch (no network)
// ---------------------------------------------------------------------------

describe("live request contract", () => {
  test("Bearer key on every API request, V2 paths only, exact PUT headers, documented task body", async () => {
    setEnv({ YOUCAM_API_KEY: TEST_KEY, YOUCAM_MOCK: "false", YOUCAM_BASE_URL: BASE });
    const resultUrl = "https://results.mock.invalid/render.jpg";
    installFetch(v2Provider({ taskStatus: { status: 200, data: { task_status: "success", results: { url: resultUrl } } } }));
    const cfg = getYouCamConfig();

    const garment = await prepareImageInput(await image("jpeg", 64, 48), "Garment image");
    const uploaded = await uploadImage(garment, "garment.jpg", cfg);
    const task = await createTryOnTask({ personFileId: "person-file", garmentFileId: uploaded.fileId }, cfg);
    const status = await checkTask(task, cfg);

    assert.equal(uploaded.fileId, "mock-file");
    assert.equal(task.taskId, TASK_ID);
    assert.equal(status.state, "succeeded");
    assert.equal(status.resultUrl, resultUrl);

    const api = calls.filter((c) => c.url.startsWith(BASE));
    assert.deepEqual(
      api.map((c) => `${c.method} ${new URL(c.url).pathname}`),
      ["POST /s2s/v2.0/file/cloth", "POST /s2s/v2.0/task/cloth", `GET /s2s/v2.0/task/cloth/${TASK_ID}`],
    );
    for (const c of api) assert.equal(c.headers.Authorization, `Bearer ${TEST_KEY}`, c.url);

    assert.deepEqual(api[0].body, {
      files: [{ content_type: "image/jpeg", file_name: "garment.jpg", file_size: garment.bytes.length }],
    });

    const put = calls.find((c) => c.url === PUT_URL);
    assert.ok(put, "the bytes were sent to the returned URL");
    assert.equal(put.method, "PUT");
    assert.deepEqual(put.headers, fileUploadFixture.data.files[0].requests[0].headers);
    assert.equal(put.body, garment.bytes.length);

    assert.deepEqual(api[1].body, { src_file_id: "person-file", ref_file_id: "mock-file", garment_category: "upper_body" });
    assert.equal(calls.length, 4);
  });

  test("a failed task reports the error_code's own message", async () => {
    setEnv({ YOUCAM_API_KEY: TEST_KEY, YOUCAM_MOCK: "false", YOUCAM_BASE_URL: BASE });
    installFetch(v2Provider({ taskStatus: taskErrorFixture }));
    const cfg = getYouCamConfig();
    const status = await checkTask({ taskId: TASK_ID, feature: "cloth", createdAt: Date.now(), mode: "live" }, cfg);
    assert.equal(status.state, "failed");
    assert.equal(status.errorCode, "error_no_shoulder");
    assert.equal(status.error, YOUCAM_ERROR_MESSAGES.error_no_shoulder);
  });

  test("an error envelope becomes a YouCamError carrying the code and its message, sent once", async () => {
    setEnv({ YOUCAM_API_KEY: TEST_KEY, YOUCAM_MOCK: "false", YOUCAM_BASE_URL: BASE });
    installFetch(v2Provider({ taskCreate: [errorFixture, 400] }));
    const cfg = getYouCamConfig();
    await assert.rejects(createTryOnTask({ personFileId: "p", garmentFileId: "g" }, cfg), (err: unknown) => {
      assert.ok(err instanceof YouCamError);
      assert.equal(err.errorCode, "invalid_parameter");
      assert.equal(err.message, YOUCAM_ERROR_MESSAGES.invalid_parameter);
      assert.equal(err.httpStatus, 400);
      return true;
    });
    assert.equal(calls.length, 1);
  });

  test("unit cost: GET /s2s/v2.0/credit/feature-cost with the Bearer key", async () => {
    setEnv({ YOUCAM_API_KEY: TEST_KEY, YOUCAM_MOCK: "false", YOUCAM_BASE_URL: BASE });
    installFetch(v2Provider({ featureCost: { status: 200, data: { cloth: 3 } } }));
    const info = await refreshFeatureCost(getYouCamConfig());
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).pathname, "/s2s/v2.0/credit/feature-cost");
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.Authorization, `Bearer ${TEST_KEY}`);
    assert.equal(info.state, "ok");
    assert.equal(info.units, 3);
  });

  test("feature-cost extraction accepts a few plausible shapes and nothing else", () => {
    assert.equal(extractFeatureCost({ cloth: 2 }, "cloth"), 2);
    assert.equal(extractFeatureCost([{ feature: "cloth", cost: 4 }, { feature: "hair", cost: 1 }], "cloth"), 4);
    assert.equal(extractFeatureCost({ features: { cloth: { credit: 5 } } }, "cloth"), 5);
    assert.equal(extractFeatureCost({ hair: 1 }, "cloth"), undefined);
  });
});

// ---------------------------------------------------------------------------
// Mock mode end to end
// ---------------------------------------------------------------------------

describe("mock mode", () => {
  test("a full try-on completes from the fixtures with zero outbound requests", async () => {
    setEnv({ YOUCAM_MOCK: "true", YOUCAM_MOCK_LATENCY_MS: "0" });
    forbidNetwork();
    const out = await runApparelTryOn({
      garment: await image("webp", 96, 128),
      person: await image("jpeg", 96, 128),
    });
    assert.equal(out.mode, "mock");
    assert.equal(out.status.state, "succeeded");
    assert.equal(out.status.resultUrl, taskSuccessFixture.data.results.url);
    assert.equal(out.garment.contentType, "image/jpeg");
    assert.equal(calls.length, 0);
    assert.equal(await refreshFeatureCost(getYouCamConfig()).then((i) => i.state), "mock");
    assert.equal(calls.length, 0);
  });
});
