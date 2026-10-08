import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { errorHandler, notFoundHandler } from "./middlewares/error-handler";
import { requestContext } from "./middlewares/request-context";
import { createStaticApp } from "./static-app";

const rawRequest = (
  port: number,
  requestPath: string,
  method = "GET",
): Promise<{ status: number; body: string; cacheControl?: string }> =>
  new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, path: requestPath, method },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            ...(res.headers["cache-control"]
              ? { cacheControl: res.headers["cache-control"] }
              : {}),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });

test("serves the SPA without intercepting API, methods or path traversal", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "licitai-static-"));
  const staticDir = path.join(parent, "public");
  await mkdir(path.join(staticDir, "assets"), { recursive: true });
  await writeFile(
    path.join(staticDir, "index.html"),
    "<html>PARDAL DIGITAL SPA</html>",
  );
  await writeFile(path.join(staticDir, "assets/index-AbCdEf12.js"), "ASSET");
  // Copied from public/ as-is, no content hash: a new favicon must reach returning visitors.
  await writeFile(path.join(staticDir, "favicon.svg"), "FAVICON");
  await writeFile(path.join(parent, "secret.txt"), "MUST NOT LEAK");

  const app = express();
  app.use(requestContext);
  app.use("/api", (_req, res) => res.status(404).json({ api: "not-found" }));
  app.use(createStaticApp(staticDir));
  app.use(notFoundHandler, errorHandler);
  const server = createServer(app);
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");

  try {
    const root = await rawRequest(address.port, "/");
    assert.equal(root.status, 200);
    assert.match(root.body, /PARDAL DIGITAL SPA/);
    assert.equal(root.cacheControl, "no-cache");

    const deepLink = await rawRequest(address.port, "/tenders/PNCP-123");
    assert.equal(deepLink.status, 200);
    assert.match(deepLink.body, /PARDAL DIGITAL SPA/);
    assert.equal(deepLink.cacheControl, "no-cache");

    const asset = await rawRequest(address.port, "/assets/index-AbCdEf12.js");
    assert.equal(asset.status, 200);
    assert.equal(asset.body, "ASSET");
    assert.equal(asset.cacheControl, "public, max-age=31536000, immutable");

    const favicon = await rawRequest(address.port, "/favicon.svg");
    assert.equal(favicon.status, 200);
    assert.equal(favicon.body, "FAVICON");
    assert.equal(favicon.cacheControl, "no-cache");

    const api = await rawRequest(address.port, "/api/x");
    assert.equal(api.status, 404);
    assert.deepEqual(JSON.parse(api.body), { api: "not-found" });

    const post = await rawRequest(address.port, "/tenders/PNCP-123", "POST");
    assert.equal(post.status, 404);
    assert.doesNotMatch(post.body, /PARDAL DIGITAL SPA/);

    for (const traversal of [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/%2E%2E%2Fsecret.txt",
    ]) {
      const response = await rawRequest(address.port, traversal);
      assert.doesNotMatch(response.body, /MUST NOT LEAK/);
    }
  } finally {
    server.close();
    await rm(parent, { recursive: true, force: true });
  }
});
