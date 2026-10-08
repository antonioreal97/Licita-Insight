import type { MapasInstallation } from "./cultural-installations";

export type MapasErrorKind =
  | "blocked"
  | "rate_limited"
  | "tls_expired"
  | "tls_name_mismatch"
  | "tls_self_signed"
  | "tls_untrusted_ca"
  | "tls_incomplete_chain"
  | "tls_pin_mismatch"
  | "invalid_response"
  | "network"
  | "http";

export class MapasClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: MapasErrorKind,
    readonly retryAfterMs: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MapasClientError";
  }
}

const errorCode = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? errorCode(error.cause) : null;
};

const transportKind = (code: string | null): MapasErrorKind => {
  switch (code) {
    case "CERT_HAS_EXPIRED":
      return "tls_expired";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "tls_name_mismatch";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return "tls_self_signed";
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
      return "tls_untrusted_ca";
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "tls_incomplete_chain";
    case "CULTURE_TLS_PIN_MISMATCH":
    case "CULTURE_TLS_PIN_HOST_MISMATCH":
      return "tls_pin_mismatch";
    default:
      return "network";
  }
};

const errorText = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  const causeText =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  return causeText ? `${error.message}: ${causeText}` : error.message;
};

export const transportMapasError = (
  error: unknown,
  url: string,
): MapasClientError =>
  new MapasClientError(
    `Mapas Culturais request failed for ${url}: ${errorText(error)}`,
    0,
    transportKind(errorCode(error)),
    null,
    error instanceof Error ? { cause: error } : undefined,
  );

export const httpMapasError = (
  status: number,
  url: string,
  retryAfterMs: number | null,
): MapasClientError => {
  const kind: MapasErrorKind =
    status === 403 ? "blocked" : status === 429 ? "rate_limited" : "http";
  return new MapasClientError(
    `Mapas Culturais listing failed (${status}) for ${url}`,
    status,
    kind,
    retryAfterMs,
  );
};

export type PublicInstallationFailure = {
  outcome: "blocked" | "degraded" | "failed";
  message: string;
};

export const publicInstallationFailure = (
  error: unknown,
  installation: MapasInstallation,
): PublicInstallationFailure => {
  if (!(error instanceof MapasClientError)) {
    return { outcome: "failed", message: "Não foi possível conectar à fonte." };
  }
  switch (error.kind) {
    case "blocked":
      return {
        outcome: "blocked",
        message:
          "Acesso bloqueado pelo site; pedimos liberação ao órgão responsável.",
      };
    case "rate_limited":
      return {
        outcome: "degraded",
        message:
          "O site limitou temporariamente as consultas; tentaremos novamente no próximo ciclo.",
      };
    case "tls_expired": {
      const expiry = installation.tlsDiagnosis?.expiresOn;
      const formatted = expiry
        ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
            new Date(`${expiry}T12:00:00Z`),
          )
        : null;
      return {
        outcome: "degraded",
        message: formatted
          ? `O certificado do site do governo estadual expirou em ${formatted}; tentaremos novamente no próximo ciclo.`
          : "O certificado do site do governo estadual expirou; tentaremos novamente no próximo ciclo.",
      };
    }
    case "tls_name_mismatch":
      return {
        outcome: "degraded",
        message:
          "O certificado do site do governo estadual pertence a outro endereço; a fonte não foi aceita.",
      };
    case "tls_self_signed":
      return {
        outcome: "degraded",
        message: installation.tlsDiagnosis?.alsoWrongName
          ? "O site do governo estadual usa certificado autoassinado e de outro endereço; a fonte não foi aceita."
          : "O site do governo estadual usa certificado autoassinado; a fonte não foi aceita.",
      };
    case "tls_untrusted_ca":
      return {
        outcome: "degraded",
        message:
          "A autoridade certificadora do site do governo estadual não é reconhecida; a fonte não foi aceita.",
      };
    case "tls_incomplete_chain":
      return {
        outcome: "degraded",
        message:
          "O site do governo estadual enviou uma cadeia de certificados incompleta; a fonte não foi aceita.",
      };
    case "tls_pin_mismatch":
      return {
        outcome: "degraded",
        message:
          "O certificado da fonte mudou e não corresponde à impressão digital autorizada; a fonte não foi aceita.",
      };
    default:
      return {
        outcome: "failed",
        message: "Não foi possível conectar à fonte.",
      };
  }
};
