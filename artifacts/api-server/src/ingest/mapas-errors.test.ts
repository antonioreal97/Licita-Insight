import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FEDERAL_INSTALLATION,
  STATE_INSTALLATIONS,
} from "./cultural-installations";
import {
  httpMapasError,
  publicInstallationFailure,
  transportMapasError,
} from "./mapas-errors";

const mt = STATE_INSTALLATIONS.find((installation) => installation.id === "mt");
const to = STATE_INSTALLATIONS.find((installation) => installation.id === "to");
assert.ok(mt?.kind === "mapas");
assert.ok(to?.kind === "mapas");

const tlsFailure = (code: string) => {
  const cause = Object.assign(new Error("TLS failed"), { code });
  return transportMapasError(
    new TypeError("fetch failed", { cause }),
    "https://example.gov.br",
  );
};

test("classifies 403 as blocked and 429 as a temporary degraded source", () => {
  assert.deepEqual(
    publicInstallationFailure(
      httpMapasError(403, "https://example", null),
      FEDERAL_INSTALLATION,
    ),
    {
      outcome: "blocked",
      message:
        "Acesso bloqueado pelo site; pedimos liberação ao órgão responsável.",
    },
  );
  assert.equal(
    publicInstallationFailure(
      httpMapasError(429, "https://example", 2_000),
      FEDERAL_INSTALLATION,
    ).outcome,
    "degraded",
  );
});

test("classifies expired, self-signed, incomplete-chain and pin errors", () => {
  assert.deepEqual(
    publicInstallationFailure(tlsFailure("CERT_HAS_EXPIRED"), mt),
    {
      outcome: "degraded",
      message:
        "O certificado do site do governo estadual expirou em 14/07/2026; tentaremos novamente no próximo ciclo.",
    },
  );
  assert.match(
    publicInstallationFailure(tlsFailure("DEPTH_ZERO_SELF_SIGNED_CERT"), to)
      .message,
    /autoassinado e de outro endereço/,
  );
  assert.match(
    publicInstallationFailure(tlsFailure("UNABLE_TO_VERIFY_LEAF_SIGNATURE"), mt)
      .message,
    /cadeia de certificados incompleta/,
  );
  assert.match(
    publicInstallationFailure(tlsFailure("CULTURE_TLS_PIN_MISMATCH"), mt)
      .message,
    /impressão digital autorizada/,
  );
});
