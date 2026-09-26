import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash } from "node:crypto";
import type { AuthContext } from "../auth/session-service";
import { ApiError } from "../lib/api-error";
import { incrementMetric } from "../metrics";

const SESSION_COOKIE = "licita_session";

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, now: number): { allowed: boolean; remaining: number; resetAt: number };
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  consume(key: string, limit: number, windowMs: number, now: number) {
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    if (this.entries.size > 10_000 && entry.count === 1) {
      for (const [candidate, value] of this.entries) if (value.resetAt <= now) this.entries.delete(candidate);
    }
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }
}

export type ProtectionConfig = {
  anonymousPerMinute: number;
  authenticatedPerMinute: number;
  authPerMinute: number;
  ingestPerMinute: number;
  /** Cap on session lookups per IP: a request carrying a `licita_session` cookie costs one DB read before it can be limited. */
  preAuthPerMinute: number;
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
  preAuthPerMinute: positiveInteger("RATE_LIMIT_PREAUTH_PER_MINUTE", 600),
  maxInflightAnonymous: positiveInteger("MAX_INFLIGHT_PER_ANON", 10),
  maxInflightAuthenticated: positiveInteger("MAX_INFLIGHT_PER_USER", 20),
  maxInflightGlobal: positiveInteger("MAX_INFLIGHT_GLOBAL", 200),
  requestTimeoutMs: positiveInteger("REQUEST_TIMEOUT_MS", 30_000),
  longRequestTimeoutMs: positiveInteger("LONG_REQUEST_TIMEOUT_MS", 120_000),
});

const isHealth = (path: string) => path === "/api/healthz" || path === "/api/readyz";
// The Asaas route validates asaas-access-token before processing the body.
const isExempt = (path: string) => path === "/api/v1/billing/asaas/webhook";
const isIngest = (path: string) => path.startsWith("/api/v1/ingest/");
const isAuthLimited = (path: string) =>
  path === "/api/v1/auth/google/start" || path === "/api/v1/auth/google/callback" || path === "/api/v1/auth/dev-login";
const isPublicRead = (req: Request) => req.method === "GET" && (
  req.path === "/api/v1/tenders/search" ||
  req.path === "/api/v1/search/suggestions" ||
  /^\/api\/v1\/tenders\/[^/]+$/.test(req.path) ||
  req.path === "/api/v1/opportunities" ||
  /^\/api\/v1\/opportunities\/[^/]+$/.test(req.path)
);

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
  store: RateLimitStore = new MemoryRateLimitStore(),
  now: () => number = Date.now,
  resolveAuth: RequestHandler = resolveOptionalAuth,
): RequestHandler => {
  const inflightByClient = new Map<string, number>();
  let inflightGlobal = 0;

  return (req, res, next) => {
    if (isHealth(req.path)) {
      next();
      return;
    }
    // The session token is random and checked against the database, so ANY cookie value (forged or not) costs a DB
    // read before the per-client limits below can apply. Cap those lookups per IP first; the bucket is generous and
    // separate from the public-read one, so real users behind a shared IP are not charged twice.
    if (!auth(res) && !isExempt(req.path) && (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE]) {
      const lookup = store.consume(`preauth:ip:${req.ip}`, config.preAuthPerMinute, 60_000, now());
      if (!lookup.allowed) {
        incrementMetric("licitai_http_rate_limited_total", { type: "preauthentication" });
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((lookup.resetAt - now()) / 1000))));
        next(new ApiError(429, "RATE_LIMITED", "Request rate limit exceeded"));
        return;
      }
    }
    resolveAuth(req, res, (sessionError?: unknown) => {
      if (sessionError) {
        next(sessionError);
        return;
      }
      const key = clientKey(req, res);
      const authenticated = Boolean(auth(res));
      if (!isExempt(req.path) && (isPublicRead(req) || isAuthLimited(req.path) || isIngest(req.path))) {
        const limit = isAuthLimited(req.path)
          ? config.authPerMinute
          : isIngest(req.path)
            ? config.ingestPerMinute
            : authenticated ? config.authenticatedPerMinute : config.anonymousPerMinute;
        const namespace = isAuthLimited(req.path) ? "auth" : isIngest(req.path) ? "ingest" : "public";
        const result = store.consume(`${namespace}:${key}`, limit, 60_000, now());
        res.setHeader("RateLimit-Limit", String(limit));
        res.setHeader("RateLimit-Remaining", String(result.remaining));
        res.setHeader("RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
        if (!result.allowed) {
          incrementMetric("licitai_http_rate_limited_total", { type: "window" });
          res.setHeader("Retry-After", String(Math.max(1, Math.ceil((result.resetAt - now()) / 1000))));
          next(new ApiError(429, "RATE_LIMITED", "Request rate limit exceeded"));
          return;
        }
      }

      const perClientLimit = authenticated ? config.maxInflightAuthenticated : config.maxInflightAnonymous;
      if ((inflightByClient.get(key) ?? 0) >= perClientLimit) {
        incrementMetric("licitai_http_rate_limited_total", { type: "concurrency" });
        res.setHeader("Retry-After", "1");
        next(new ApiError(429, "RATE_LIMITED", "Too many requests in progress"));
        return;
      }
      if (inflightGlobal >= config.maxInflightGlobal) {
        incrementMetric("licitai_http_global_shed_total");
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
    });
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
        hasSessionCookie ? "private, no-cache" : "public, max-age=30, stale-while-revalidate=120",
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
