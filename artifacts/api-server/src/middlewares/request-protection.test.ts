import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { errorHandler } from "./error-handler";
import { requestContext } from "./request-context";
import {
  createRequestProtection,
  MemoryRateLimitStore,
  publicHttpCache,
  type ProtectionConfig,
} from "./request-protection";

const defaults: ProtectionConfig = {
  anonymousPerMinute: 60,
  authenticatedPerMinute: 240,
  authPerMinute: 20,
  ingestPerMinute: 3,
  maxInflightAnonymous: 10,
  maxInflightAuthenticated: 20,
  maxInflightGlobal: 200,
  requestTimeoutMs: 1_000,
  longRequestTimeoutMs: 1_000,
};

const listen = async (app: Express) => {
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const protectedApp = (config: Partial<ProtectionConfig> = {}) => {
  const app = express();
  app.set("trust proxy", true);
  app.use(requestContext, cookieParser());
  app.use((req, res, next) => {
    const userId = req.header("x-test-user");
    if (userId) res.locals.auth = { user: { id: userId } };
    next();
  });
  app.use(
    createRequestProtection(
      { ...defaults, ...config },
      new MemoryRateLimitStore(),
    ),
  );
  return app;
};

test("fixed window uses IP for anonymous clients and user id for authenticated clients", async () => {
  const app = protectedApp({
    anonymousPerMinute: 2,
    authenticatedPerMinute: 1,
  });
  app.get("/api/v1/tenders/search", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    assert.equal(
      (
        await fetch(`${baseUrl}/api/v1/tenders/search`, {
          headers: { "x-forwarded-for": "198.51.100.1" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/v1/tenders/search`, {
          headers: { "x-forwarded-for": "198.51.100.1" },
        })
      ).status,
      200,
    );
    const limited = await fetch(`${baseUrl}/api/v1/tenders/search`, {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
    assert.equal(
      ((await limited.json()) as { error: { code: string } }).error.code,
      "RATE_LIMITED",
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/v1/tenders/search`, {
          headers: { "x-test-user": "u1" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/v1/tenders/search`, {
          headers: { "x-test-user": "u2" },
        })
      ).status,
      200,
    );
  } finally {
    server.close();
  }
});

test("N+1 inflight request is rejected and the slot returns after completion", async () => {
  const app = protectedApp({ maxInflightAnonymous: 1 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  app.get("/slow", async (_req, res) => {
    await gate;
    res.json({ ok: true });
  });
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const first = fetch(`${baseUrl}/slow`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const rejected = await fetch(`${baseUrl}/slow`);
    assert.equal(rejected.status, 429);
    assert.equal(rejected.headers.get("retry-after"), "1");
    release();
    assert.equal((await first).status, 200);
    assert.equal((await fetch(`${baseUrl}/slow`)).status, 200);
  } finally {
    server.close();
  }
});

test("an aborted client releases its inflight slot", async () => {
  const app = protectedApp({ maxInflightAnonymous: 1 });
  let started!: () => void;
  let release!: () => void;
  const didStart = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  app.get("/slow", async (_req, res) => {
    started();
    await gate;
    if (!res.headersSent) res.end("late");
  });
  app.get("/fast", (_req, res) => res.end("ok"));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const controller = new AbortController();
    const request = fetch(`${baseUrl}/slow`, { signal: controller.signal });
    await didStart;
    controller.abort();
    await assert.rejects(request, /abort/i);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await fetch(`${baseUrl}/fast`)).status, 200);
  } finally {
    release();
    server.close();
  }
});

test("global shedding returns 503 while health remains exempt", async () => {
  const app = protectedApp({ maxInflightGlobal: 1 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  app.get("/slow", async (_req, res) => {
    await gate;
    res.end("ok");
  });
  app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const first = fetch(`${baseUrl}/slow`, {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(
      (
        await fetch(`${baseUrl}/slow`, {
          headers: { "x-forwarded-for": "198.51.100.2" },
        })
      ).status,
      503,
    );
    assert.equal((await fetch(`${baseUrl}/api/healthz`)).status, 200);
    release();
    await first;
  } finally {
    server.close();
  }
});

test("application timeout uses the error envelope and releases inflight capacity", async () => {
  const app = protectedApp({ requestTimeoutMs: 30, maxInflightAnonymous: 1 });
  app.get("/slow", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!res.headersSent) res.end("late");
  });
  app.get("/fast", (_req, res) => res.end("ok"));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const timedOut = await fetch(`${baseUrl}/slow`);
    assert.equal(timedOut.status, 503);
    assert.equal(
      ((await timedOut.json()) as { error: { code: string } }).error.code,
      "REQUEST_TIMEOUT",
    );
    assert.equal((await fetch(`${baseUrl}/fast`)).status, 200);
  } finally {
    server.close();
  }
});

test("public cache emits weak ETag/304 and session requests are private", async () => {
  const app = express();
  app.use(cookieParser());
  app.get("/public", publicHttpCache, (_req, res) =>
    res.json({ value: "x".repeat(1200) }),
  );
  const { server, baseUrl } = await listen(app);
  try {
    const first = await fetch(`${baseUrl}/public`);
    const etag = first.headers.get("etag");
    assert.match(first.headers.get("cache-control") ?? "", /^public,/);
    assert.match(etag ?? "", /^W\//);
    assert.equal(
      (
        await fetch(`${baseUrl}/public`, {
          headers: { "if-none-match": etag! },
        })
      ).status,
      304,
    );
    const privateResponse = await fetch(`${baseUrl}/public`, {
      headers: { cookie: "licita_session=fake" },
    });
    assert.equal(
      privateResponse.headers.get("cache-control"),
      "private, no-cache",
    );
    assert.match(privateResponse.headers.get("vary") ?? "", /Cookie/);
  } finally {
    server.close();
  }
});

test("oversized JSON body returns the existing envelope shape with 413", async () => {
  const app = express();
  app.use(requestContext, express.json({ limit: "32b" }));
  app.post("/body", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/body`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(100) }),
    });
    assert.equal(response.status, 413);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "PAYLOAD_TOO_LARGE",
    );
  } finally {
    server.close();
  }
});

test("pool acquisition timeout becomes a 503 error envelope", async () => {
  const app = express();
  app.use(requestContext);
  app.get("/database", (_req, _res, next) =>
    next(new Error("timeout exceeded when trying to connect")),
  );
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const response = await fetch(`${baseUrl}/database`);
    assert.equal(response.status, 503);
    assert.equal(
      ((await response.json()) as { error: { code: string } }).error.code,
      "SERVICE_OVERLOADED",
    );
  } finally {
    server.close();
  }
});

test("ingest is strictly limited while token-protected Asaas webhook is window-exempt", async () => {
  const app = protectedApp({ ingestPerMinute: 1, anonymousPerMinute: 1 });
  app.all("/api/v1/ingest/pncp", (_req, res) => res.json({ ok: true }));
  app.post("/api/v1/billing/asaas/webhook", (_req, res) =>
    res.json({ ok: true }),
  );
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    assert.equal((await fetch(`${baseUrl}/api/v1/ingest/pncp`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/v1/ingest/pncp`)).status, 429);
    assert.equal(
      (
        await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, {
          method: "POST",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, {
          method: "POST",
        })
      ).status,
      200,
    );
  } finally {
    server.close();
  }
});
