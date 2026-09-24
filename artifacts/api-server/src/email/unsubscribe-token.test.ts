import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribe-token";

const tokenId = "1c3f65a0-9d34-4dca-8ef7-973cf04bb85e";
const secret = "test-secret-at-least-32-characters-long";

const restoreEnvironment = (name: string, value: string | undefined) => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

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

  it("prefers a dedicated stable secret over the session secret", () => {
    const previousSession = process.env.SESSION_SECRET;
    const previousDedicated = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    try {
      process.env.SESSION_SECRET = "session-secret-before-rotation-123456";
      process.env.EMAIL_UNSUBSCRIBE_SECRET = "dedicated-email-secret-stable-123456";
      const token = createUnsubscribeToken(tokenId);
      process.env.SESSION_SECRET = "session-secret-after-rotation-1234567";
      assert.equal(verifyUnsubscribeToken(token), tokenId);
      process.env.EMAIL_UNSUBSCRIBE_SECRET = "different-dedicated-secret-123456789";
      assert.equal(verifyUnsubscribeToken(token), null);
    } finally {
      restoreEnvironment("SESSION_SECRET", previousSession);
      restoreEnvironment("EMAIL_UNSUBSCRIBE_SECRET", previousDedicated);
    }
  });

  it("falls back to the session secret when no dedicated secret exists", () => {
    const previousSession = process.env.SESSION_SECRET;
    const previousDedicated = process.env.EMAIL_UNSUBSCRIBE_SECRET;
    try {
      delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
      process.env.SESSION_SECRET = "fallback-session-secret-before-123456";
      const token = createUnsubscribeToken(tokenId);
      assert.equal(verifyUnsubscribeToken(token), tokenId);
      process.env.SESSION_SECRET = "fallback-session-secret-after-1234567";
      assert.equal(verifyUnsubscribeToken(token), null);
    } finally {
      restoreEnvironment("SESSION_SECRET", previousSession);
      restoreEnvironment("EMAIL_UNSUBSCRIBE_SECRET", previousDedicated);
    }
  });
});
