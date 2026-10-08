import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  "email",
  "*.email",
  "recipientEmail",
  "*.recipientEmail",
  "ip",
  "*.ip",
  "remoteAddress",
  "*.remoteAddress",
] as const;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [...LOG_REDACT_PATHS],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
