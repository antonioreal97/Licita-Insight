import type { Server } from "node:http";
import { logger } from "./lib/logger";

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export type HttpServerConfig = {
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  keepAliveTimeoutMs: number;
  maxRequestsPerSocket: number;
  maxConnections: number;
  shutdownTimeoutMs: number;
};

export const httpServerConfig = (): HttpServerConfig => ({
  headersTimeoutMs: positiveInteger("HTTP_HEADERS_TIMEOUT_MS", 15_000),
  requestTimeoutMs: positiveInteger("HTTP_REQUEST_TIMEOUT_MS", 30_000),
  keepAliveTimeoutMs: positiveInteger("HTTP_KEEP_ALIVE_TIMEOUT_MS", 65_000),
  maxRequestsPerSocket: positiveInteger("HTTP_MAX_REQUESTS_PER_SOCKET", 1_000),
  maxConnections: positiveInteger("HTTP_MAX_CONNECTIONS", 1_000),
  shutdownTimeoutMs: positiveInteger("SHUTDOWN_TIMEOUT_MS", 15_000),
});

export const configureHttpServer = (server: Server, config: HttpServerConfig): void => {
  server.headersTimeout = config.headersTimeoutMs;
  server.requestTimeout = config.requestTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.maxRequestsPerSocket = config.maxRequestsPerSocket;
  server.maxConnections = config.maxConnections;
};

export const installGracefulShutdown = (options: {
  server: Server;
  stopSchedulers: () => void;
  closePool: () => Promise<void>;
  timeoutMs: number;
  exit?: (code: number) => void;
}): (() => Promise<void>) => {
  let shuttingDown = false;
  const exit = options.exit ?? ((code) => process.exit(code));
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ timeoutMs: options.timeoutMs }, "Graceful shutdown started");
    options.stopSchedulers();
    let timer: NodeJS.Timeout | undefined;
    const closed = new Promise<void>((resolve) => options.server.close(() => resolve()));
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        logger.warn("Graceful shutdown deadline reached; closing active connections");
        options.server.closeAllConnections?.();
        resolve();
      }, options.timeoutMs);
      timer.unref();
    });
    await Promise.race([closed, deadline]);
    if (timer) clearTimeout(timer);
    await options.closePool();
    logger.info("Graceful shutdown completed");
    exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
  return shutdown;
};
