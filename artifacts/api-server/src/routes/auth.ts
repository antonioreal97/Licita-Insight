import { Router, type IRouter } from "express";
import { GetAuthSessionResponse } from "@workspace/api-zod";
import { InvalidParameterError } from "../lib/api-error";
import {
  devLoginEnabled,
  googleOAuthConfigured,
  publicAppOrigin,
  sessionSecret,
} from "../auth/config";
import { logger } from "../lib/logger";
import {
  asyncHandler,
  authContext,
  clearOAuthCookie,
  clearSessionCookie,
  OAUTH_COOKIE,
  requireAuth,
  requireCsrf,
  sessionToken,
  setOAuthCookie,
  setSessionCookie,
} from "../auth/http";
import {
  createSession,
  revokeSession,
  upsertDevUser,
  upsertGoogleUser,
} from "../auth/session-service";
import {
  googleAuthorizationUrl,
  exchangeGoogleCode,
} from "../auth/google-oauth";
import {
  codeChallenge,
  randomToken,
  safeReturnTo,
  signOAuthState,
  verifyOAuthState,
} from "../auth/tokens";

const router: IRouter = Router();

const loginRedirect = (code: string): string =>
  `/login?${new URLSearchParams({ error: code })}`;

router.get("/v1/auth/google/start", (req, res) => {
  if (!googleOAuthConfigured()) {
    clearOAuthCookie(res);
    logger.warn(
      { operation: "google_oauth_start" },
      "Google OAuth is unavailable because credentials are not configured",
    );
    res.redirect(302, loginRedirect("oauth_unavailable"));
    return;
  }
  try {
    const verifier = randomToken(48);
    const state = randomToken();
    const nonce = randomToken();
    setOAuthCookie(
      res,
      signOAuthState(
        {
          state,
          verifier,
          nonce,
          returnTo: safeReturnTo(req.query.returnTo),
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
        sessionSecret(),
      ),
    );
    res.redirect(
      302,
      googleAuthorizationUrl({ state, nonce, challenge: codeChallenge(verifier) }),
    );
  } catch (error) {
    clearOAuthCookie(res);
    logger.error(
      { err: error, operation: "google_oauth_start" },
      "Google OAuth could not be initialized",
    );
    res.redirect(302, loginRedirect("oauth_unavailable"));
  }
});

router.get(
  "/v1/auth/google/callback",
  asyncHandler(async (req, res) => {
    if (req.query.error === "access_denied") {
      clearOAuthCookie(res);
      res.redirect(302, loginRedirect("access_denied"));
      return;
    }
    const cookie = (req.cookies as Record<string, unknown> | undefined)?.[
      OAUTH_COOKIE
    ];
    const state = verifyOAuthState(
      typeof cookie === "string" ? cookie : undefined,
      sessionSecret(),
    );
    clearOAuthCookie(res);
    if (!state || req.query.state !== state.state) {
      res.redirect(302, loginRedirect("invalid_state"));
      return;
    }
    if (typeof req.query.code !== "string") {
      res.redirect(302, loginRedirect("oauth_failed"));
      return;
    }
    try {
      const identity = await exchangeGoogleCode({
        code: req.query.code,
        verifier: state.verifier,
        nonce: state.nonce,
      });
      const user = await upsertGoogleUser(identity);
      const session = await createSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);
      res.redirect(302, new URL(state.returnTo, publicAppOrigin()).toString());
    } catch (error) {
      res.redirect(
        302,
        loginRedirect(
          error instanceof Error && error.name === "EmailNotVerifiedError"
            ? "email_not_verified"
            : "oauth_failed",
        ),
      );
    }
  }),
);

router.get("/v1/auth/session", requireAuth, (req, res) => {
  res.json(GetAuthSessionResponse.parse({ user: authContext(res).user }));
});

router.post(
  "/v1/auth/logout",
  requireCsrf,
  asyncHandler(async (req, res) => {
    await revokeSession(sessionToken(req));
    clearSessionCookie(res);
    res.status(204).end();
  }),
);

if (devLoginEnabled()) {
  router.post(
    "/v1/auth/dev-login",
    requireCsrf,
    asyncHandler(async (req, res) => {
      const body =
        req.body !== null && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim() : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (name?.length ?? 0) > 120) {
        throw new InvalidParameterError("Development login body is invalid", [
          { field: email ? "name" : "email", issue: "invalid_value" },
        ]);
      }
      const user = await upsertDevUser({ email, name: name || null });
      const session = await createSession(user.id);
      setSessionCookie(res, session.token, session.expiresAt);
      res.status(204).end();
    }),
  );
}

export default router;
