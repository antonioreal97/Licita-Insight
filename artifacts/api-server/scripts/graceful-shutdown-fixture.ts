import { createServer } from "node:http";
import { configureHttpServer, installGracefulShutdown } from "../src/server-runtime";

const server = createServer((_req, res) => {
  setTimeout(() => res.end("completed"), 150);
});
configureHttpServer(server, {
  headersTimeoutMs: 100,
  requestTimeoutMs: 1_000,
  keepAliveTimeoutMs: 1_000,
  maxRequestsPerSocket: 2,
  maxConnections: 10,
  shutdownTimeoutMs: 1_000,
});
installGracefulShutdown({
  server,
  stopSchedulers: () => undefined,
  closePool: async () => undefined,
  timeoutMs: 1_000,
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing address");
  process.stdout.write(`READY ${address.port}\n`);
});
