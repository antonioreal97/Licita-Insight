import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { createFeatureFlagsRouter } from "./feature-flags";

test("public feature flags are small, unauthenticated and cacheable", async () => {
  const app = express();
  app.use(
    "/api",
    createFeatureFlagsRouter(() => ({
      schemaVersion: 1,
      enabledJourneys: ["funding"],
    })),
  );
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/public/feature-flags`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("cache-control"),
      "public, max-age=60, stale-while-revalidate=300",
    );
    assert.deepEqual(await response.json(), {
      schemaVersion: 1,
      enabledJourneys: ["funding"],
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
