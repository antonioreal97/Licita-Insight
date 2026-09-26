import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import express from "express";
import { createReadinessHandler } from "./health";

const request = async (handler: ReturnType<typeof createReadinessHandler>) => {
  const app = express();
  app.get("/api/readyz", handler);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  try {
    return await fetch(`http://127.0.0.1:${address.port}/api/readyz`);
  } finally {
    server.close();
  }
};

test("readiness returns 200 when the database responds", async () => {
  const response = await request(
    createReadinessHandler(async () => ({ rows: [{ "?column?": 1 }] }), 25),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("readiness returns 503 when the database is unavailable", async () => {
  const response = await request(
    createReadinessHandler(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      });
    }, 25),
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
});

test("readiness returns 503 when the database misses the two-second budget", async () => {
  const response = await request(
    createReadinessHandler(() => new Promise(() => undefined), 10),
  );
  assert.equal(response.status, 503);
});
