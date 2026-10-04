import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import type { AuthContext } from "../auth/session-service";
import { ApiError } from "../lib/api-error";
import { incrementMetric } from "../metrics";

const SESSION_COOKIE = "licita_session";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

/**
 * Fixed-window counter keyed by `<profile>:<client>`. The in-memory store only works for a single process; a store
 * shared between replicas (Redis, Postgres) can implement this interface and answer asynchronously.
 */
export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, now: number): RateLimitResult | Promise<RateLimitResult>;
}

export type MemoryRateLimitStoreOptions = {
  /** Hard cap on tracked keys. Past it, expired keys go first, then the oldest windows. */
  maxEntries?: number;
  /** Expired keys are swept once every this many calls, so the cost is amortized. */
  sweepEvery?: number;
};

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();
  private readonly maxEntries: number;
  private readonly sweepEvery: number;
  private operations = 0;

  constructor(options: MemoryRateLimitStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100_000;
    this.sweepEvery = options.sweepEvery ?? 1_000;
  }

  get size(): number {
    return this.entries.size;
  }

  consume(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
    this.operations += 1;
    if (this.operations >= this.sweepEvery) {
      this.operations = 0;
      this.sweep(now);
    }
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      // Re-insert so Map order stays "oldest window first" for the eviction below.
      this.entries.delete(key);
      if (this.entries.size >= this.maxEntries) this.sweep(now);
      // Still full of live windows: drop the oldest ones. That resets their counters early, which is the price of a
      // bounded store; the cap is sized well above the number of clients active in one window.
      for (const oldest of this.entries.keys()) {
        if (this.entries.size < this.maxEntries) break;
        this.entries.delete(oldest);
      }
      entry = { count: 0, resetAt: now + windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }

  private sweep(now: number): void {
    for (const [key, value] of this.entries) if (value.resetAt <= now) this.entries.delete(key);
  }
}

export type ProtectionConfig = {
  anonymousPerMinute: number;
  authenticatedPerMinute: number;
  authPerMinute: number;
  ingestPerMinute: number;
  /** Routes that start or poll AI work or document indexing (ask, ask-status, sheet, fit). */
  aiPerMinute: number;
  /** Authenticated writes (POST/PUT/PATCH/DELETE) not covered by a more specific profile. */
  writePerMinute: number;
  /** Checkout and cancellation, which call Asaas. */
  billingPerMinute: number;
  /** Personal data export and account deletion. */
  privacyPerHour: number;
  /** Writes without a session, such as the one-click e-mail unsubscribe. */
  publicWritePerMinute: number;
  /** Cap on session lookups per IP: a request carrying a `licita_session` cookie costs one DB read before it can be limited. */
  preAuthPerMinute: number;
  /** Upper bound on keys held by the in-memory rate limit store. */
  rateLimitMaxEntries: number;
  maxInflightAnonymous: number;
  maxInflightAuthenticated: number;
  maxInflightGlobal: number;
  requestTimeoutMs: number;
  longRequestTimeoutMs: number;
};

export const protectionConfig = (): ProtectionConfig => ({
  anonymousPerMinute: positiveInteger("RATE_LIMIT_ANON_PER_MINUTE", 60),
  authenticatedPerMinute: positiveInteger("RATE_LIMIT_USER_PER_MINUTE", 240),
  authPerMinute: positiveInteger("RATE_LIMIT_AUTH_PER_MINUTE", 20),
  ingestPerMinute: positiveInteger("RATE_LIMIT_INGEST_PER_MINUTE", 3),
  aiPerMinute: positiveInteger("RATE_LIMIT_AI_PER_MINUTE", 60),
  writePerMinute: positiveInteger("RATE_LIMIT_WRITE_PER_MINUTE", 60),
  billingPerMinute: positiveInteger("RATE_LIMIT_BILLING_PER_MINUTE", 5),
  privacyPerHour: positiveInteger("RATE_LIMIT_PRIVACY_PER_HOUR", 5),
  publicWritePerMinute: positiveInteger("RATE_LIMIT_PUBLIC_WRITE_PER_MINUTE", 10),
  preAuthPerMinute: positiveInteger("RATE_LIMIT_PREAUTH_PER_MINUTE", 600),
  rateLimitMaxEntries: positiveInteger("RATE_LIMIT_MAX_ENTRIES", 100_000),
  maxInflightAnonymous: positiveInteger("MAX_INFLIGHT_PER_ANON", 10),
  maxInflightAuthenticated: positiveInteger("MAX_INFLIGHT_PER_USER", 20),
  maxInflightGlobal: positiveInteger("MAX_INFLIGHT_GLOBAL", 200),
  requestTimeoutMs: positiveInteger("REQUEST_TIMEOUT_MS", 30_000),
  longRequestTimeoutMs: positiveInteger("LONG_REQUEST_TIMEOUT_MS", 120_000),
});

export type RateLimitProfile = "public" | "auth" | "ingest" | "ai" | "write" | "billing" | "privacy" | "public_write";

const isHealth = (path: string) => path === "/api/healthz" || path === "/api/readyz";
// The Asaas route validates asaas-access-token before processing the body.
const isExempt = (path: string) => path === "/api/v1/billing/asaas/webhook";
const isWrite = (method: string) => method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
const isAuthLimited = (path: string) =>
  path === "/api/v1/auth/google/start" || path === "/api/v1/auth/google/callback" || path === "/api/v1/auth/dev-login";
// ask-status and sheet are GETs, but the first call for a tender starts document indexing or sheet generation.
const isAi = (path: string) =>
  /^\/api\/v1\/tenders\/[^/]+\/(ask|ask-status|sheet)$/.test(path) || path === "/api/v1/me/fit";
const isBilling = (req: Request) =>
  req.method === "POST" && (req.path === "/api/v1/me/billing/checkout" || req.path === "/api/v1/me/billing/cancel");
const isPrivacy = (req: Request) =>
  (req.method === "GET" && req.path === "/api/v1/me/export") || (req.method === "DELETE" && req.path === "/api/v1/me");

/**
 * Window profile for a request, or null when it has no window (health, the Asaas webhook, non-API paths such as the
 * static app). The first match wins, so a specific profile is never also charged to `write` or `public`.
 */
export const rateLimitProfile = (req: Request, authenticated: boolean): RateLimitProfile | null => {
  if (isHealth(req.path) || isExempt(req.path) || !req.path.startsWith("/api/")) return null;
  if (isAuthLimited(req.path)) return "auth";
  if (req.path.startsWith("/api/v1/ingest/")) return "ingest";
  if (isAi(req.path)) return "ai";
  if (isBilling(req)) return "billing";
  if (isPrivacy(req)) return "privacy";
  if (req.method === "POST" && req.path === "/api/v1/email/unsubscribe") return "public_write";
  if (isWrite(req.method)) return authenticated ? "write" : "public_write";
  // Public reads (search, suggestions, detail) and any other API route share the read bucket.
  return "public";
};

const profileWindow = (
  config: ProtectionConfig,
  profile: RateLimitProfile,
  authenticated: boolean,
): { limit: number; windowMs: number } => {
  switch (profile) {
    case "auth": return { limit: config.authPerMinute, windowMs: MINUTE_MS };
    case "ingest": return { limit: config.ingestPerMinute, windowMs: MINUTE_MS };
    case "ai": return { limit: config.aiPerMinute, windowMs: MINUTE_MS };
    case "write": return { limit: config.writePerMinute, windowMs: MINUTE_MS };
    case "billing": return { limit: config.billingPerMinute, windowMs: MINUTE_MS };
    case "privacy": return { limit: config.privacyPerHour, windowMs: HOUR_MS };
    case "public_write": return { limit: config.publicWritePerMinute, windowMs: MINUTE_MS };
    case "public":
      return { limit: authenticated ? config.authenticatedPerMinute : config.anonymousPerMinute, windowMs: MINUTE_MS };
  }
};

/** Runs `use` now for a synchronous store and after the promise settles for an asynchronous one. */
const withResult = (
  result: RateLimitResult | Promise<RateLimitResult>,
  use: (value: RateLimitResult) => void,
  fail: NextFunction,
): void => {
  if (typeof (result as Promise<RateLimitResult>).then === "function") (result as Promise<RateLimitResult>).then(use, fail);
  else use(result as RateLimitResult);
};

const secondsUntil = (resetAt: number, now: number): number => Math.max(1, Math.ceil((resetAt - now) / 1000));

const auth = (res: Response): AuthContext | undefined => res.locals.auth as AuthContext | undefined;
const clientKey = (req: Request, res: Response): string => auth(res) ? `user:${auth(res)!.user.id}` : `ip:${req.ip}`;
const resolveOptionalAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (auth(res) || !(req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]) {
    next();
    return;
  }
  void import("../auth/http")
    .then(({ optionalAuth }) => optionalAuth(req, res, next))
    .catch(next);
};

export const createRequestProtection = (
  config = protectionConfig(),
  store: RateLimitStore = new MemoryRateLimitStore({ maxEntries: config.rateLimitMaxEntries }),
  now: () => number = Date.now,
  resolveAuth: RequestHandler = resolveOptionalAuth,
  countMetric: typeof incrementMetric = incrementMetric,
): RequestHandler => {
  const inflightByClient = new Map<string, number>();
  let inflightGlobal = 0;

  const admit = (req: Request, res: Response, next: NextFunction, key: string, authenticated: boolean): void => {
    const perClientLimit = authenticated ? config.maxInflightAuthenticated : config.maxInflightAnonymous;
    if ((inflightByClient.get(key) ?? 0) >= perClientLimit) {
      countMetric("licitai_http_rate_limited_total", { type: "concurrency" });
      res.setHeader("Retry-After", "1");
      next(new ApiError(429, "RATE_LIMITED", "Too many requests in progress"));
      return;
    }
    if (inflightGlobal >= config.maxInflightGlobal) {
      countMetric("licitai_http_global_shed_total");
      res.setHeader("Retry-After", "1");
      next(new ApiError(503, "SERVICE_OVERLOADED", "Service is temporarily overloaded"));
      return;
    }

    inflightByClient.set(key, (inflightByClient.get(key) ?? 0) + 1);
    inflightGlobal += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inflightGlobal -= 1;
      const nextCount = (inflightByClient.get(key) ?? 1) - 1;
      if (nextCount <= 0) inflightByClient.delete(key);
      else inflightByClient.set(key, nextCount);
    };
    res.once("finish", release);
    res.once("close", release);

    const timeoutMs = req.path.startsWith("/api/v1/ingest/") || req.path.includes("/export")
      ? config.longRequestTimeoutMs
      : config.requestTimeoutMs;
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        const requestId = String(res.locals.requestId ?? "unknown");
        res.status(503).json({ error: { code: "REQUEST_TIMEOUT", message: "Request timed out", requestId } });
      }
      release();
    }, timeoutMs);
    timer.unref();
    res.once("finish", () => clearTimeout(timer));
    res.once("close", () => clearTimeout(timer));
    next();
  };

  return (req, res, next) => {
    if (isHealth(req.path)) {
      next();
      return;
    }
    const afterAuth = () => resolveAuth(req, res, (sessionError?: unknown) => {
      if (sessionError) {
        next(sessionError);
        return;
      }
      const key = clientKey(req, res);
      const authenticated = Boolean(auth(res));
      const profile = rateLimitProfile(req, authenticated);
      if (!profile) {
        admit(req, res, next, key, authenticated);
        return;
      }
      const { limit, windowMs } = profileWindow(config, profile, authenticated);
      withResult(store.consume(`${profile}:${key}`, limit, windowMs, now()), (result) => {
        const current = now();
        res.setHeader("RateLimit-Policy", `${limit};w=${windowMs / 1000}`);
        res.setHeader("RateLimit-Limit", String(limit));
        res.setHeader("RateLimit-Remaining", String(result.remaining));
        res.setHeader("RateLimit-Reset", String(secondsUntil(result.resetAt, current)));
        if (!result.allowed) {
          countMetric("licitai_http_rate_limited_total", { type: "window", profile });
          res.setHeader("Retry-After", String(secondsUntil(result.resetAt, current)));
          next(new ApiError(429, "RATE_LIMITED", "Request rate limit exceeded"));
          return;
        }
        admit(req, res, next, key, authenticated);
      }, next);
    });
    // The session token is random and checked against the database, so ANY cookie value (forged or not) costs a DB
    // read before the per-client limits below can apply. Cap those lookups per IP first; the bucket is generous and
    // separate from the public-read one, so real users behind a shared IP are not charged twice.
    if (!auth(res) && !isExempt(req.path) && (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]) {
      withResult(store.consume(`preauth:ip:${req.ip}`, config.preAuthPerMinute, MINUTE_MS, now()), (lookup) => {
        if (!lookup.allowed) {
          countMetric("licitai_http_rate_limited_total", { type: "preauthentication", profile: "preauth" });
          res.setHeader("Retry-After", String(secondsUntil(lookup.resetAt, now())));
          next(new ApiError(429, "RATE_LIMITED", "Request rate limit exceeded"));
          return;
        }
        afterAuth();
      }, next);
      return;
    }
    afterAuth();
  };
};

/**
 * Body used for the ETag. `meta.tookMs` (server timing) differs on every request even when the content is the same,
 * so hashing it would give each response a new ETag and no conditional request would ever return 304.
 */
const etagPayload = (body: unknown): string => {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const { meta, ...rest } = body as { meta?: unknown };
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const { tookMs: _tookMs, ...stableMeta } = meta as Record<string, unknown>;
      return JSON.stringify({ ...rest, meta: stableMeta });
    }
  }
  return JSON.stringify(body);
};

export const publicHttpCache: RequestHandler = (req, res, next) => {
  const hasSessionCookie = Boolean((req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]);
  res.vary("Cookie");
  res.vary("Accept-Encoding");
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      res.setHeader(
        "Cache-Control",
        res.locals.publicCachePolicy === "no-store"
          ? "no-store"
          : hasSessionCookie ? "private, no-cache" : "public, max-age=30, stale-while-revalidate=120",
      );
      const etag = `W/"${createHash("sha1").update(etagPayload(body)).digest("base64url")}"`;
      res.setHeader("ETag", etag);
      if (req.header("if-none-match") === etag) {
        res.status(304).end();
        return res;
      }
    } else {
      res.setHeader("Cache-Control", "no-store");
    }
    return originalJson(body);
  }) as typeof res.json;
  next();
};
