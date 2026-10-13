import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(
  new URL("../dist/reconcile-billing.mjs", import.meta.url),
);
assert.ok(existsSync(cli), `missing ${cli}; run the build first`);

// Production runs it with only the process environment: no database and no Asaas keys here.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => name !== "DATABASE_URL" && !name.startsWith("ASAAS_"),
  ),
);
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });

const help = run("--help");
assert.equal(help.status, 0, help.stderr);
assert.match(help.stdout, /--dry-run/);

const unknown = run("--dryrun");
assert.equal(unknown.status, 2, unknown.stderr);
assert.match(unknown.stderr, /Argumento desconhecido: --dryrun/);

const noDatabase = run("--dry-run");
assert.equal(noDatabase.status, 1);
assert.match(noDatabase.stderr, /DATABASE_URL must be set/);

process.stdout.write("dist reconcile billing cli: PASS\n");
