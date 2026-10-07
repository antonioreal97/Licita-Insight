import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { errorHandler } from "../middlewares/error-handler";
import { createIngestRouter } from "./ingest";

const VALID_TOKEN = "0123456789abcdef0123456789abcdef";

const withIngestToken = async (
  token: string | undefined,
  fn: () => Promise<void>,
) => {
  const previous = process.env.INGEST_API_TOKEN;
  if (token === undefined) delete process.env.INGEST_API_TOKEN;
  else process.env.INGEST_API_TOKEN = token;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.INGEST_API_TOKEN;
    else process.env.INGEST_API_TOKEN = previous;
  }
};

const startTestApp = async () => {
  const calls = { pncpPost: 0, pncpGet: 0, opportunitiesPost: 0, opportunitiesGet: 0 };
  class IngestInProgressError extends Error {}
  class CultureIngestInProgressError extends Error {}

  const app = express();
  app.use(express.json());
  app.use(
    createIngestRouter({
      loadPncpIngest: async () =>
        ({
          IngestInProgressError,
          collectOptionsFromBody: (body: unknown) => body,
          startPncpIngest: async (options: unknown) => {
            calls.pncpPost += 1;
            return { runId: "pncp-run", options };
          },
          getLatestIngest: async () => {
            calls.pncpGet += 1;
            return { run: null };
          },
        }) as never,
      loadOpportunitiesIngest: async () =>
        ({
          CultureIngestInProgressError,
          startCultureIngest: async () => {
            calls.opportunitiesPost += 1;
            return { runId: "opportunities-run" };
          },
          getLatestCultureIngest: async () => {
            calls.opportunitiesGet += 1;
            return { run: null, coverage: [] };
          },
        }) as never,
    }),
  );
  app.use(errorHandler);

  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const request = (path: string, init: RequestInit = {}) =>
    fetch(`http://127.0.0.1:${address.port}${path}`, init);

  return {
    calls,
    request,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};

const errorCode = async (response: Response) => {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
};

test("ingest routes return 404 when INGEST_API_TOKEN is not configured", async () => {
  await withIngestToken(undefined, async () => {
    const app = await startTestApp();
    try {
      const response = await app.request("/v1/ingest/pncp");
      assert.equal(response.status, 404);
      assert.equal(await errorCode(response), "NOT_FOUND");
      assert.deepEqual(app.calls, {
        pncpPost: 0,
        pncpGet: 0,
        opportunitiesPost: 0,
        opportunitiesGet: 0,
      });
    } finally {
      await app.close();
    }
  });
});

test("ingest routes return 401 when the bearer token is invalid", async () => {
  await withIngestToken(VALID_TOKEN, async () => {
    const app = await startTestApp();
    try {
      const response = await app.request("/v1/ingest/pncp", {
        headers: { authorization: "Bearer wrong-token" },
      });
      assert.equal(response.status, 401);
      assert.equal(await errorCode(response), "UNAUTHENTICATED");
      assert.equal(app.calls.pncpGet, 0);
    } finally {
      await app.close();
    }
  });
});

test("ingest routes pass through to handlers when the bearer token is valid", async () => {
  await withIngestToken(VALID_TOKEN, async () => {
    const app = await startTestApp();
    const auth = { authorization: `Bearer ${VALID_TOKEN}` };
    try {
      const pncpPost = await app.request("/v1/ingest/pncp", {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ days: 1 }),
      });
      assert.equal(pncpPost.status, 202);

      const pncpGet = await app.request("/v1/ingest/pncp", { headers: auth });
      assert.equal(pncpGet.status, 200);

      const opportunitiesPost = await app.request("/v1/ingest/opportunities", {
        method: "POST",
        headers: auth,
      });
      assert.equal(opportunitiesPost.status, 202);

      const opportunitiesGet = await app.request("/v1/ingest/opportunities", {
        headers: auth,
      });
      assert.equal(opportunitiesGet.status, 200);

      assert.deepEqual(app.calls, {
        pncpPost: 1,
        pncpGet: 1,
        opportunitiesPost: 1,
        opportunitiesGet: 1,
      });
    } finally {
      await app.close();
    }
  });
});
