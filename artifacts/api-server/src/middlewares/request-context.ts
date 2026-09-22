import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

export const requestContext: RequestHandler = (req, res, next) => {
  const suppliedRequestId = req.header("x-request-id");
  const requestId =
    suppliedRequestId && suppliedRequestId.length <= 128
      ? suppliedRequestId
      : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};
