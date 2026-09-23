import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  codeChallenge,
  safeReturnTo,
  signOAuthState,
  verifyOAuthState,
  type OAuthState,
} from "./tokens";

const secret = "test-session-secret-with-at-least-32-characters";
const state: OAuthState = {
  state: "state",
  verifier: "verifier",
  nonce: "nonce",
  returnTo: "/saved-tenders?monitored=true",
  expiresAt: 2_000,
};

describe("OAuth token helpers", () => {
  it("accepts only local return paths", () => {
    assert.equal(safeReturnTo("/monitoring"), "/monitoring");
    assert.equal(safeReturnTo("//attacker.example"), "/dashboard");
    assert.equal(safeReturnTo("https://attacker.example"), "/dashboard");
    assert.equal(safeReturnTo("/safe\\evil"), "/dashboard");
  });

  it("verifies signed, unexpired OAuth state and rejects tampering", () => {
    const token = signOAuthState(state, secret);
    assert.deepEqual(verifyOAuthState(token, secret, 1_000), state);
    assert.equal(verifyOAuthState(`${token}x`, secret, 1_000), null);
    assert.equal(verifyOAuthState(token, secret, 2_001), null);
  });

  it("creates the RFC 7636 SHA-256 challenge", () => {
    assert.equal(
      codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});
