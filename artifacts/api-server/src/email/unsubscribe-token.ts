import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "../auth/config";

const VERSION = "v1";
const CONTEXT = "licitai:email-unsubscribe";
const tokenIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const signature = (tokenId: string, secret: string): string =>
  createHmac("sha256", secret)
    .update(`${CONTEXT}:${VERSION}:${tokenId}`)
    .digest("base64url");

export const createUnsubscribeToken = (
  tokenId: string,
  secret = sessionSecret(),
): string => `${VERSION}.${tokenId}.${signature(tokenId, secret)}`;

export const verifyUnsubscribeToken = (
  token: string,
  secret = sessionSecret(),
): string | null => {
  const [version, tokenId, received, extra] = token.split(".");
  if (
    version !== VERSION ||
    !tokenId ||
    !tokenIdPattern.test(tokenId) ||
    !received ||
    extra !== undefined
  ) {
    return null;
  }
  const expected = signature(tokenId, secret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return null;
  }
  return tokenId;
};
