import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { promisify } from "node:util";
import test from "node:test";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { errorHandler } from "./error-handler";
import { requestContext } from "./request-context";
import {
  createRequestProtection,
  MemoryRateLimitStore,
  publicHttpCache,
  rateLimitProfile,
  type ProtectionConfig,
  type RateLimitResult,
  type RateLimitStore,
} from "./request-protection";

const execFileAsync = promisify(execFile);

test("request protection loads without DATABASE_URL", async () => {
  const moduleUrl = new URL("./request-protection.ts", import.meta.url).href;
  const env = { ...process.env };
  delete env.DATABASE_URL;
  await execFileAsync(
    "pnpm",
    ["exec", "tsx", "--eval", `import(${JSON.stringify(moduleUrl)}).then(() => {})`],
    { env },
  );
});

const defaults: ProtectionConfig = {
  anonymousPerMinute: 60,
  authenticatedPerMinute: 240,
  authPerMinute: 20,
  ingestPerMinute: 3,
  aiPerMinute: 60,
  writePerMinute: 60,
  billingPerMinute: 5,
  privacyPerHour: 5,
  publicWritePerMinute: 10,
  preAuthPerMinute: 600,
  rateLimitMaxEntries: 100_000,
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

const protectedApp = (
  config: Partial<ProtectionConfig> = {},
  options: { now?: () => number; store?: RateLimitStore; metrics?: Array<Record<string, string>> } = {},
) => {
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
      options.store ?? new MemoryRateLimitStore(),
      options.now ?? Date.now,
      undefined,
      (name, labels = {}) => {
        if (name === "licitai_http_rate_limited_total") options.metrics?.push(labels);
      },
    ),
  );
  return app;
};

test("one trusted Fly proxy hop ignores a forged X-Forwarded-For prefix", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(requestContext, cookieParser());
  app.use(
    createRequestProtection(
      { ...defaults, anonymousPerMinute: 2 },
      new MemoryRateLimitStore(),
    ),
  );
  app.get("/api/v1/tenders/search", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const requestFromFlyClient = (forgedPrefix: string) =>
      fetch(`${baseUrl}/api/v1/tenders/search`, {
        // fly-proxy appends the actual client address on the right. Only that
        // nearest forwarded hop is trusted; client-supplied prefixes are not.
        headers: {
          "x-forwarded-for": `${forgedPrefix}, 198.51.100.25`,
        },
      });
    assert.equal((await requestFromFlyClient("203.0.113.1")).status, 200);
    assert.equal((await requestFromFlyClient("203.0.113.2")).status, 200);
    assert.equal((await requestFromFlyClient("203.0.113.3")).status, 429);
  } finally {
    server.close();
  }
});

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
  app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.get("/public", publicHttpCache, (_req, res) =>
    res.json({ value: "x".repeat(1200) }),
  );
  app.get("/pending", publicHttpCache, (_req, res) => {
    res.locals.publicCachePolicy = "no-store";
    res.json({ detailsFetchedAt: null });
  });
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
    assert.equal((await fetch(`${baseUrl}/pending`)).headers.get("cache-control"), "no-store");
  } finally {
    server.close();
  }
});

test("a forged session cookie cannot force unlimited session lookups", async () => {
  let lookups = 0;
  const app = express();
  app.set("trust proxy", true);
  app.use(requestContext, cookieParser());
  app.use(
    createRequestProtection(
      { ...defaults, preAuthPerMinute: 3 },
      new MemoryRateLimitStore(),
      Date.now,
      // Stand-in for the real resolver: it only reads the DB when a session cookie is present.
      (req, _res, next) => {
        if ((req.cookies as Record<string, unknown> | undefined)?.licita_session) lookups += 1;
        next();
      },
    ),
  );
  app.get("/api/v1/tenders/search", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const withCookie = { headers: { cookie: "licita_session=forged" } };
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1)
      statuses.push((await fetch(`${baseUrl}/api/v1/tenders/search`, withCookie)).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    assert.equal(lookups, 3, "requests over the pre-auth limit must not reach the session lookup");
    // Requests without a cookie never touch the session lookup or the pre-auth bucket.
    const before = lookups;
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/search`)).status, 200);
    assert.equal(lookups, before);
  } finally {
    server.close();
  }
});

test("ETag ignores the per-request server timing so conditional requests still hit", async () => {
  const app = express();
  app.use(cookieParser());
  let call = 0;
  // Same content, but `meta.tookMs` changes on every request, like the real search response.
  app.get("/search", publicHttpCache, (_req, res) => {
    call += 1;
    res.json({ data: [{ id: "a" }], meta: { total: 1, tookMs: 10 + call } });
  });
  const { server, baseUrl } = await listen(app);
  try {
    const first = await fetch(`${baseUrl}/search`);
    const etag = first.headers.get("etag");
    assert.match(etag ?? "", /^W\//);
    const second = await fetch(`${baseUrl}/search`, { headers: { "if-none-match": etag! } });
    assert.equal(second.status, 304);
    // A real content change still gets a new ETag.
    const changed = express();
    changed.use(cookieParser());
    changed.get("/search", publicHttpCache, (_req, res) => res.json({ data: [{ id: "b" }], meta: { total: 1, tookMs: 10 } }));
    const other = await listen(changed);
    try {
      const third = await fetch(`${other.baseUrl}/search`);
      assert.notEqual(third.headers.get("etag"), etag);
    } finally {
      other.server.close();
    }
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

const fakeRequest = (method: string, path: string) => ({ method, path }) as express.Request;

test("each route maps to its rate limit profile and the first match wins", () => {
  const cases: Array<[string, string, boolean, string | null]> = [
    ["GET", "/api/healthz", false, null],
    ["GET", "/api/readyz", false, null],
    ["POST", "/api/v1/billing/asaas/webhook", false, null],
    ["GET", "/assets/index.js", false, null],
    ["GET", "/api/v1/auth/google/start", false, "auth"],
    ["GET", "/api/v1/auth/google/callback", false, "auth"],
    ["POST", "/api/v1/auth/dev-login", false, "auth"],
    ["POST", "/api/v1/ingest/pncp", false, "ingest"],
    ["GET", "/api/v1/tenders/t1/ask-status", true, "ai"],
    ["POST", "/api/v1/tenders/t1/ask", true, "ai"],
    ["GET", "/api/v1/tenders/t1/sheet", true, "ai"],
    ["GET", "/api/v1/me/fit", true, "ai"],
    // Highlights only read stored sheets: no AI window.
    ["GET", "/api/v1/me/tender-highlights", true, "public"],
    ["POST", "/api/v1/me/billing/checkout", true, "billing"],
    ["POST", "/api/v1/me/billing/cancel", true, "billing"],
    ["GET", "/api/v1/me/export", true, "privacy"],
    ["DELETE", "/api/v1/me", true, "privacy"],
    ["POST", "/api/v1/email/unsubscribe", false, "public_write"],
    ["POST", "/api/v1/email/unsubscribe", true, "public_write"],
    ["POST", "/api/v1/auth/logout", false, "public_write"],
    ["POST", "/api/v1/auth/logout", true, "write"],
    ["PUT", "/api/v1/me/saved-tenders/t1", true, "write"],
    ["PATCH", "/api/v1/me/saved-searches/s1", true, "write"],
    ["DELETE", "/api/v1/me/saved-searches/s1", true, "write"],
    ["PUT", "/api/v1/me/company-profile", true, "write"],
    ["POST", "/api/v1/profile/keywords/from-description", true, "write"],
    ["POST", "/api/v1/me/notifications/read", true, "write"],
    ["GET", "/api/v1/tenders/search", false, "public"],
    ["GET", "/api/v1/tenders/t1", true, "public"],
    ["GET", "/api/v1/me/billing", true, "public"],
    ["GET", "/api/v1/profile/categories", true, "public"],
    ["GET", "/api/v1/profile/keywords/suggest", true, "public"],
    ["GET", "/api/v1/auth/session", false, "public"],
    ["GET", "/api/v1/billing/plan", false, "public"],
    ["GET", "/api/v1/not-mapped-yet", false, "public"],
  ];
  for (const [method, path, authenticated, expected] of cases) {
    assert.equal(rateLimitProfile(fakeRequest(method, path), authenticated), expected, `${method} ${path}`);
  }
});

test("each profile answers 429 with Retry-After and RateLimit-* for its own window", async () => {
  const clock = 1_000_000;
  const metrics: Array<Record<string, string>> = [];
  const app = protectedApp(
    { aiPerMinute: 1, writePerMinute: 1, billingPerMinute: 1, privacyPerHour: 1, publicWritePerMinute: 1 },
    { now: () => clock, metrics },
  );
  app.all(/.*/, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const cases: Array<{ method: string; path: string; user?: string; profile: string; windowSeconds: number }> = [
      { method: "GET", path: "/api/v1/tenders/t1/ask-status", user: "u1", profile: "ai", windowSeconds: 60 },
      { method: "PUT", path: "/api/v1/me/saved-tenders/t1", user: "u1", profile: "write", windowSeconds: 60 },
      { method: "POST", path: "/api/v1/me/billing/checkout", user: "u1", profile: "billing", windowSeconds: 60 },
      { method: "GET", path: "/api/v1/me/export", user: "u1", profile: "privacy", windowSeconds: 3600 },
      { method: "POST", path: "/api/v1/email/unsubscribe", profile: "public_write", windowSeconds: 60 },
    ];
    for (const { method, path, user, profile, windowSeconds } of cases) {
      const init = { method, headers: user ? { "x-test-user": user } : {} };
      const allowed = await fetch(`${baseUrl}${path}`, init);
      assert.equal(allowed.status, 200, `${profile}: first request`);
      assert.equal(allowed.headers.get("ratelimit-limit"), "1");
      assert.equal(allowed.headers.get("ratelimit-remaining"), "0");
      assert.equal(allowed.headers.get("ratelimit-reset"), String(windowSeconds));
      assert.equal(allowed.headers.get("ratelimit-policy"), `1;w=${windowSeconds}`);
      const limited = await fetch(`${baseUrl}${path}`, init);
      assert.equal(limited.status, 429, `${profile}: second request`);
      assert.equal(limited.headers.get("retry-after"), String(windowSeconds), profile);
      const body = (await limited.json()) as { error: { code: string; requestId: string } };
      assert.equal(body.error.code, "RATE_LIMITED");
      assert.ok(body.error.requestId);
    }
    assert.deepEqual(
      metrics.map((labels) => labels.profile),
      ["ai", "write", "billing", "privacy", "public_write"],
    );
    assert.ok(metrics.every((labels) => labels.type === "window"));
  } finally {
    server.close();
  }
});

test("buckets of different profiles are independent", async () => {
  const app = protectedApp({ aiPerMinute: 1, writePerMinute: 1, authenticatedPerMinute: 2 });
  app.all(/.*/, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const as = (user: string, method = "GET") => ({ method, headers: { "x-test-user": user } });
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/t1/ask-status`, as("u1"))).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/t2/sheet`, as("u1"))).status, 429);
    // Blowing the AI limit neither blocks search nor writes for the same user…
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/search`, as("u1"))).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/v1/me/saved-tenders/t1`, as("u1", "PUT"))).status, 200);
    // …and it does not touch another user's AI bucket.
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/t1/ask-status`, as("u2"))).status, 200);
    // An unmapped API route shares the read bucket (2/min for users): search + this one exhaust it.
    assert.equal((await fetch(`${baseUrl}/api/v1/me/notifications/unread-count`, as("u1"))).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/search`, as("u1"))).status, 429);
  } finally {
    server.close();
  }
});

test("unmapped API routes fall into the public read bucket while exempt paths have no window", async () => {
  const app = protectedApp({
    anonymousPerMinute: 1,
    publicWritePerMinute: 1,
    aiPerMinute: 1,
    writePerMinute: 1,
    billingPerMinute: 1,
    privacyPerHour: 1,
  });
  app.all(/.*/, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const unmapped = await fetch(`${baseUrl}/api/v1/some-new-route`);
    assert.equal(unmapped.status, 200);
    assert.equal(unmapped.headers.get("ratelimit-policy"), "1;w=60");
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/search`)).status, 429);
    for (let i = 0; i < 5; i += 1) {
      const health = await fetch(`${baseUrl}/api/healthz`);
      assert.equal(health.status, 200);
      assert.equal(health.headers.get("ratelimit-limit"), null);
      assert.equal((await fetch(`${baseUrl}/api/readyz`)).status, 200);
      const webhook = await fetch(`${baseUrl}/api/v1/billing/asaas/webhook`, { method: "POST" });
      assert.equal(webhook.status, 200);
      assert.equal(webhook.headers.get("ratelimit-limit"), null);
      // The static app (non-API paths) keeps only the concurrency limits.
      assert.equal((await fetch(`${baseUrl}/assets/app.js`)).status, 200);
    }
  } finally {
    server.close();
  }
});

test("an asynchronous store (shared between replicas) plugs into the same middleware", async () => {
  const memory = new MemoryRateLimitStore();
  const keys: string[] = [];
  const asyncStore: RateLimitStore = {
    consume: async (key, limit, windowMs, now): Promise<RateLimitResult> => {
      keys.push(key);
      await new Promise((resolve) => setTimeout(resolve, 1));
      return memory.consume(key, limit, windowMs, now);
    },
  };
  const app = protectedApp({ aiPerMinute: 1 }, { store: asyncStore });
  app.all(/.*/, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  const { server, baseUrl } = await listen(app);
  try {
    const init = { method: "POST", headers: { "x-test-user": "u1" } };
    assert.equal((await fetch(`${baseUrl}/api/v1/tenders/t1/ask`, init)).status, 200);
    const limited = await fetch(`${baseUrl}/api/v1/tenders/t1/ask`, init);
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get("retry-after"));
    assert.deepEqual(keys, ["ai:user:u1", "ai:user:u1"]);
  } finally {
    server.close();
  }
});

test("memory store sweeps expired windows and never grows past its cap", () => {
  const store = new MemoryRateLimitStore({ maxEntries: 100, sweepEvery: 50 });
  for (let i = 0; i < 10_000; i += 1) store.consume(`ip:${i}`, 10, 60_000, 0);
  assert.equal(store.size, 100, "a flood of new IPs is bounded by maxEntries");

  // Below the cap, expired windows go away on the amortized sweep (every 50 calls), not only when the cap is hit.
  const amortized = new MemoryRateLimitStore({ maxEntries: 1_000, sweepEvery: 50 });
  for (let i = 0; i < 100; i += 1) amortized.consume(`ip:${i}`, 10, 60_000, 0);
  for (let i = 0; i < 49; i += 1) amortized.consume("ip:steady", 1_000, 60_000, 120_000);
  assert.equal(amortized.size, 101, "no sweep before the 50th call");
  amortized.consume("ip:steady", 1_000, 60_000, 120_000);
  assert.equal(amortized.size, 1);

  // Live windows below the cap keep counting: eviction never resets an active client early.
  const small = new MemoryRateLimitStore({ maxEntries: 10, sweepEvery: 1_000 });
  small.consume("ip:a", 2, 60_000, 0);
  for (let i = 0; i < 5; i += 1) small.consume(`ip:other-${i}`, 2, 60_000, 0);
  small.consume("ip:a", 2, 60_000, 1);
  assert.equal(small.consume("ip:a", 2, 60_000, 2).allowed, false);

  // At the cap with only live windows, the oldest window is dropped first.
  const full = new MemoryRateLimitStore({ maxEntries: 2, sweepEvery: 1_000 });
  full.consume("ip:old", 1, 60_000, 0);
  full.consume("ip:mid", 1, 60_000, 1);
  full.consume("ip:new", 1, 60_000, 2);
  assert.equal(full.size, 2);
  assert.equal(full.consume("ip:mid", 1, 60_000, 3).allowed, false, "mid is still tracked");
  assert.equal(full.consume("ip:new", 1, 60_000, 3).allowed, false, "new is still tracked");
});
