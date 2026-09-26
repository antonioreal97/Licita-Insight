import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApiError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} was not found`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) {
    _next(error);
    return;
  }
  const requestId = String(res.locals.requestId ?? "unknown");

  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
        requestId,
      },
    });
    return;
  }

  const errorCode =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const errorMessage = error instanceof Error ? error.message : "";
  if (
    errorCode === "ETIMEDOUT" ||
    errorCode === "53300" ||
    /timeout exceeded when trying to connect|connection timeout/i.test(
      errorMessage,
    )
  ) {
    res.status(503).json({
      error: {
        code: "SERVICE_OVERLOADED",
        message: "Database connection is temporarily unavailable",
        requestId,
      },
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId,
      },
    });
    return;
  }

  logger.error(
    {
      err: error,
      requestId,
      method: req.method,
      path: req.path,
    },
    "Unhandled request error",
  );
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId,
    },
  });
};
