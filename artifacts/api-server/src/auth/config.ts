const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured`);
  return value;
};

export const publicAppOrigin = (): string => {
  const configured = required("PUBLIC_APP_ORIGIN");
  const url = new URL(configured);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.origin !== configured.replace(/\/$/, "")
  ) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTP(S) origin without a path");
  }
  return url.origin;
};

export const googleClientId = (): string => required("GOOGLE_CLIENT_ID");
export const googleClientSecret = (): string => required("GOOGLE_CLIENT_SECRET");
export const googleOAuthConfigured = (): boolean =>
  Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
export const sessionSecret = (): string => {
  const secret = required("SESSION_SECRET");
  if (secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  return secret;
};

export const isProduction = (): boolean => process.env.NODE_ENV === "production";
export const devLoginEnabled = (): boolean =>
  !isProduction() && process.env.AUTH_DEV_LOGIN === "true";
