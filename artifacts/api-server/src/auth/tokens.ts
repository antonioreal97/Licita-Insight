import {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from "node:crypto";
import type { webcrypto } from "node:crypto";

const encodeJson = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const decodeJson = (value: string): unknown =>
  JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

export const randomToken = (bytes = 32): string =>
  randomBytes(bytes).toString("base64url");

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const codeChallenge = (verifier: string): string =>
  createHash("sha256").update(verifier).digest("base64url");

export const safeReturnTo = (value: unknown): string =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\")
    ? value
    : "/dashboard";

export type OAuthState = {
  state: string;
  verifier: string;
  nonce: string;
  returnTo: string;
  expiresAt: number;
};

export const signOAuthState = (state: OAuthState, secret: string): string => {
  const payload = encodeJson(state);
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

export const verifyOAuthState = (
  token: string | undefined,
  secret: string,
  now = Date.now(),
): OAuthState | null => {
  if (!token) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  const supplied = Buffer.from(suppliedSignature, "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    return null;
  }
  try {
    const value = decodeJson(payload) as Partial<OAuthState>;
    if (
      typeof value.state !== "string" ||
      typeof value.verifier !== "string" ||
      typeof value.nonce !== "string" ||
      typeof value.returnTo !== "string" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt < now
    ) {
      return null;
    }
    return value as OAuthState;
  } catch {
    return null;
  }
};

type GoogleJwk = webcrypto.JsonWebKey & { kid?: string };
type GoogleJwkSet = { keys: GoogleJwk[] };
let cachedJwks: { value: GoogleJwkSet; expiresAt: number } | null = null;

const googleJwks = async (): Promise<GoogleJwkSet> => {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) return cachedJwks.value;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google JWKS returned ${response.status}`);
  const value = (await response.json()) as GoogleJwkSet;
  if (!Array.isArray(value.keys)) throw new Error("Google JWKS is invalid");
  cachedJwks = { value, expiresAt: now + 60 * 60 * 1000 };
  return value;
};

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export const verifyGoogleIdToken = async (
  token: string,
  input: { clientId: string; nonce: string; now?: number },
): Promise<GoogleIdentity> => {
  const [encodedHeader, encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) {
    throw new Error("Google id_token has an invalid shape");
  }
  const header = decodeJson(encodedHeader) as Record<string, unknown>;
  const claims = decodeJson(encodedPayload) as Record<string, unknown>;
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Google id_token uses an unsupported key");
  }
  const jwks = await googleJwks();
  const jwk = jwks.keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("Google id_token signing key was not found");
  const validSignature = verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!validSignature) throw new Error("Google id_token signature is invalid");

  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const issuer = claims.iss;
  if (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") {
    throw new Error("Google id_token issuer is invalid");
  }
  if (claims.aud !== input.clientId) throw new Error("Google id_token audience is invalid");
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    throw new Error("Google id_token is expired");
  }
  if (claims.nonce !== input.nonce) throw new Error("Google id_token nonce is invalid");
  if (claims.email_verified !== true) {
    const error = new Error("Google email is not verified");
    error.name = "EmailNotVerifiedError";
    throw error;
  }
  if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new Error("Google id_token identity claims are incomplete");
  }
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : null,
    picture: typeof claims.picture === "string" ? claims.picture : null,
  };
};
