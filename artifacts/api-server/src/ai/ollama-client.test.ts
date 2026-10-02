import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createOllamaClient, OllamaError, ollamaConfig } from "./ollama-client";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("reads defaults and overrides from the environment", () => {
  for (const name of [
    "OLLAMA_BASE_URL", "OLLAMA_TEACHER_MODEL", "OLLAMA_EMBED_MODEL",
    "OLLAMA_TEACHER_TIMEOUT_MS", "OLLAMA_EMBED_TIMEOUT_MS", "OLLAMA_KEEP_ALIVE",
  ]) delete process.env[name];
  assert.deepEqual(ollamaConfig(), {
    baseUrl: "http://localhost:11434",
    teacherModel: "gemma4:12b",
    embedModel: "bge-m3",
    teacherTimeoutMs: 300_000,
    embedTimeoutMs: 60_000,
    keepAlive: "10m",
  });
  process.env.OLLAMA_BASE_URL = "http://host.docker.internal:11434/";
  process.env.OLLAMA_KEEP_ALIVE = "30m";
  assert.equal(ollamaConfig().baseUrl, "http://host.docker.internal:11434");
  assert.equal(ollamaConfig().keepAlive, "30m");
});

test("generateJson posts a structured, non-thinking request and parses the JSON answer", async () => {
  let calls = 0;
  const client = createOllamaClient({
    config: { baseUrl: "http://ollama.test", teacherModel: "gemma4:12b", keepAlive: "10m" },
    fetch: async (input, init) => {
      calls += 1;
      assert.equal(String(input), "http://ollama.test/api/generate");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(body.model, "gemma4:12b");
      assert.equal(body.stream, false);
      assert.equal(body.think, false);
      assert.equal(body.keep_alive, "10m");
      assert.deepEqual(body.options, { temperature: 0.1 });
      assert.deepEqual(body.format, { type: "object" });
      return json({ model: "gemma4:12b", response: '{"itens":[]}' });
    },
  });
  const result = await client.generateJson({ prompt: "p", schema: { type: "object" } });
  assert.equal(calls, 1);
  assert.deepEqual(result.value, { itens: [] });
  assert.equal(result.model, "gemma4:12b");
});

test("embed sends the whole batch and validates the vectors", async () => {
  const client = createOllamaClient({
    config: { baseUrl: "http://ollama.test", embedModel: "bge-m3" },
    fetch: async (input, init) => {
      assert.equal(String(input), "http://ollama.test/api/embed");
      const body = JSON.parse(String(init?.body)) as { input: string[]; model: string };
      assert.equal(body.model, "bge-m3");
      return json({ embeddings: body.input.map((_, index) => [index, 1]) });
    },
  });
  const result = await client.embed(["a", "b", "c"]);
  assert.deepEqual(result.embeddings, [[0, 1], [1, 1], [2, 1]]);
  assert.equal(result.model, "bge-m3");

  const broken = createOllamaClient({ fetch: async () => json({ embeddings: [[1]] }) });
  await assert.rejects(broken.embed(["a", "b"]), (error) => error instanceof OllamaError && error.kind === "invalid_response");
});

test("retries a 5xx exactly once", async () => {
  let calls = 0;
  const client = createOllamaClient({
    fetch: async () => {
      calls += 1;
      return calls === 1 ? json({ error: "loading" }, 503) : json({ response: '{"ok":true}' });
    },
  });
  assert.deepEqual((await client.generateJson({ prompt: "p", schema: {} })).value, { ok: true });
  assert.equal(calls, 2);

  calls = 0;
  const failing = createOllamaClient({ fetch: async () => { calls += 1; return json({}, 500); } });
  await assert.rejects(failing.generateJson({ prompt: "p", schema: {} }), (error) =>
    error instanceof OllamaError && error.kind === "http" && error.status === 500);
  assert.equal(calls, 2);
});

test("does not retry a 4xx", async () => {
  let calls = 0;
  const client = createOllamaClient({ fetch: async () => { calls += 1; return json({ error: "model not found" }, 404); } });
  await assert.rejects(client.embed(["a"]), (error) => error instanceof OllamaError && error.status === 404);
  assert.equal(calls, 1);
});

test("Ollama out of the air fails after one retry without leaking the prompt", async () => {
  let calls = 0;
  const client = createOllamaClient({
    fetch: async () => {
      calls += 1;
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) });
    },
  });
  await assert.rejects(client.generateJson({ prompt: "SEGREDO DO EDITAL", schema: {} }), (error) => {
    assert.ok(error instanceof OllamaError);
    assert.equal(error.kind, "unavailable");
    assert.doesNotMatch(error.message, /SEGREDO/u);
    return true;
  });
  assert.equal(calls, 2);
});

test("a timeout is reported without a retry", async () => {
  let calls = 0;
  const client = createOllamaClient({
    config: { teacherTimeoutMs: 20 },
    fetch: async (_input, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    },
  });
  await assert.rejects(client.generateJson({ prompt: "p", schema: {} }), (error) =>
    error instanceof OllamaError && error.kind === "timeout");
  assert.equal(calls, 1);
});

test("a non-JSON model answer is an invalid response", async () => {
  const client = createOllamaClient({ fetch: async () => json({ response: "isto não é json" }) });
  await assert.rejects(client.generateJson({ prompt: "p", schema: {} }), (error) =>
    error instanceof OllamaError && error.kind === "invalid_response");
});
