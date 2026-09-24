import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

const tokenId = "1c3f65a0-9d34-4dca-8ef7-973cf04bb85e";
const secret = "test-secret-at-least-32-characters-long";

describe("email unsubscribe token", () => {
  it("round-trips an opaque id without an expiry", () => {
    const token = createUnsubscribeToken(tokenId, secret);
    assert.equal(verifyUnsubscribeToken(token, secret), tokenId);
    assert.equal(token.includes("@"), false);
  });

  it("rejects tampering, malformed values, and a different secret", () => {
    const token = createUnsubscribeToken(tokenId, secret);
    assert.equal(verifyUnsubscribeToken(`${token}x`, secret), null);
    assert.equal(verifyUnsubscribeToken(token, `${secret}-other`), null);
    assert.equal(verifyUnsubscribeToken("invalid", secret), null);
  });
});
