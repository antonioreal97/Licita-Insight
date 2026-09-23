import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ForbiddenError, UnauthenticatedError } from "../lib/api-error";
import { isProduction, publicAppOrigin } from "./config";
import { readSession, type AuthContext } from "./session-service";

export const SESSION_COOKIE = "licita_session";
export const OAUTH_COOKIE = "licita_oauth";

const cookieBase = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProduction(),
});

export const setSessionCookie = (
  res: Response,
  token: string,
  expiresAt: Date,
): void => {
  res.cookie(SESSION_COOKIE, token, {
    ...cookieBase(),
    path: "/",
    expires: expiresAt,
  });
};

export const clearSessionCookie = (res: Response): void => {
  res.clearCookie(SESSION_COOKIE, { ...cookieBase(), path: "/" });
};

export const setOAuthCookie = (res: Response, value: string): void => {
  res.cookie(OAUTH_COOKIE, value, {
    ...cookieBase(),
    path: "/api/v1/auth/google/callback",
    maxAge: 10 * 60 * 1000,
  });
};

export const clearOAuthCookie = (res: Response): void => {
  res.clearCookie(OAUTH_COOKIE, {
    ...cookieBase(),
    path: "/api/v1/auth/google/callback",
  });
};

export const sessionToken = (req: Request): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    SESSION_COOKIE
  ];
  return typeof value === "string" ? value : undefined;
};

export const requireCsrf: RequestHandler = (req, _res, next) => {
  try {
    if (
      req.header("x-requested-with") !== "licita-insight" ||
      req.header("origin") !== publicAppOrigin()
    ) {
      throw new ForbiddenError("CSRF validation failed");
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = sessionToken(req);
    const session = await readSession(token);
    if (!token || !session) {
      if (token) clearSessionCookie(res);
      throw new UnauthenticatedError();
    }
    res.locals.auth = session.context;
    if (session.renewedUntil) {
      setSessionCookie(res, token, session.renewedUntil);
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const authContext = (res: Response): AuthContext =>
  res.locals.auth as AuthContext;

export const asyncHandler =
  (
    handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  ): RequestHandler =>
  (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
