import {
  googleClientId,
  googleClientSecret,
  publicAppOrigin,
} from "./config";
import { verifyGoogleIdToken, type GoogleIdentity } from "./tokens";

export const googleRedirectUri = (): string =>
  `${publicAppOrigin()}/api/v1/auth/google/callback`;

export const googleAuthorizationUrl = (input: {
  state: string;
  nonce: string;
  challenge: string;
}): string => {
  const query = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query}`;
};

export const exchangeGoogleCode = async (input: {
  code: string;
  verifier: string;
  nonce: string;
}): Promise<GoogleIdentity> => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: input.verifier,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.id_token !== "string") {
    throw new Error(`Google token exchange failed with ${response.status}`);
  }
  return verifyGoogleIdToken(body.id_token, {
    clientId: googleClientId(),
    nonce: input.nonce,
  });
};
