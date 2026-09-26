import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Agent, createServer, get } from "node:http";
import net from "node:net";
import test from "node:test";
import { configureHttpServer } from "./server-runtime";

test("SIGTERM waits for an in-flight request and exits cleanly", async () => {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/graceful-shutdown-fixture.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? "postgres://unused",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const port = await new Promise<number>((resolve, reject) => {
    child.once("exit", (code) => reject(new Error(`fixture exited ${code}`)));
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/READY (\d+)/);
      if (match) resolve(Number(match[1]));
    });
  });
  const request = fetch(`http://127.0.0.1:${port}/slow`);
  await new Promise((resolve) => setTimeout(resolve, 25));
  child.kill("SIGTERM");
  assert.equal(await (await request).text(), "completed");
  const [code, signal] = await new Promise<
    [number | null, NodeJS.Signals | null]
  >((resolve) => {
    child.once("exit", (exitCode, exitSignal) =>
      resolve([exitCode, exitSignal]),
    );
  });
  assert.equal(code, 0);
  assert.equal(signal, null);
});

test("HTTP server configuration exposes connection and socket bounds", async () => {
  const server = createServer();
  configureHttpServer(server, {
    headersTimeoutMs: 1234,
    requestTimeoutMs: 2345,
    keepAliveTimeoutMs: 3456,
    maxRequestsPerSocket: 7,
    maxConnections: 8,
    shutdownTimeoutMs: 9,
  });
  assert.equal(server.headersTimeout, 1234);
  assert.equal(server.requestTimeout, 2345);
  assert.equal(server.keepAliveTimeout, 3456);
  assert.equal(server.maxRequestsPerSocket, 7);
  assert.equal(server.maxConnections, 8);
});

test("slow headers are closed after headersTimeout", async () => {
  const config = {
    headersTimeoutMs: 40,
    requestTimeoutMs: 1_000,
    keepAliveTimeoutMs: 1_000,
    maxRequestsPerSocket: 10,
    maxConnections: 10,
    shutdownTimeoutMs: 1_000,
  };
  const server = createServer(
    {
      connectionsCheckingInterval: 10,
      headersTimeout: config.headersTimeoutMs,
      requestTimeout: config.requestTimeoutMs,
    },
    (_req, res) => res.end("ok"),
  );
  configureHttpServer(server, config);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  const socket = net.createConnection(address.port, "127.0.0.1");
  try {
    await once(socket, "connect");
    socket.write("GET / HTTP/1.1\r\nHost: localhost\r\nX-Slow:");
    socket.resume();
    await Promise.race([
      once(socket, "close"),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("slow header socket stayed open")),
          750,
        ),
      ),
    ]);
    assert.equal(socket.destroyed, true);
  } finally {
    socket.destroy();
    server.close();
  }
});

test("maxRequestsPerSocket asks the client to close the exhausted socket", async () => {
  const server = createServer((_req, res) => res.end("ok"));
  configureHttpServer(server, {
    headersTimeoutMs: 1_000,
    requestTimeoutMs: 1_000,
    keepAliveTimeoutMs: 1_000,
    maxRequestsPerSocket: 1,
    maxConnections: 10,
    shutdownTimeoutMs: 1_000,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing address");
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const response = await new Promise<import("node:http").IncomingMessage>(
      (resolve, reject) => {
        get({ host: "127.0.0.1", port: address.port, agent }, resolve).once(
          "error",
          reject,
        );
      },
    );
    response.resume();
    await once(response, "end");
    assert.equal(response.headers.connection, "close");
  } finally {
    agent.destroy();
    server.close();
  }
});
