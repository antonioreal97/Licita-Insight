import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const commands = [
  "collect-pncp",
  "collect-transparency",
  "collect-opportunities",
  "collect-funding",
  "collect-culture-federal",
  "collect-international",
  "backfill-platform",
  "backfill-display-titles",
  "review-estimated-values",
  "refresh-profile-keywords",
];
const env = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== "DATABASE_URL" && !name.endsWith("_DRY_RUN")),
);

for (const name of commands) {
  const cli = fileURLToPath(new URL(`../dist/${name}.mjs`, import.meta.url));
  assert.ok(existsSync(cli), `missing ${cli}; run the build first`);
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], { env, encoding: "utf8" });

  const help = run("--help");
  assert.equal(help.status, 0, `${name}: ${help.stderr}`);
  assert.match(help.stdout, new RegExp(name));

  const unknown = run("--unknown");
  assert.equal(unknown.status, 2, `${name}: ${unknown.stderr}`);

  const noDatabase = run();
  assert.equal(noDatabase.status, 1, `${name}: ${noDatabase.stderr}`);
  assert.match(noDatabase.stderr, /DATABASE_URL must be set/);

  const failedDatabase = spawnSync(process.execPath, [cli], {
    env: { ...env, DATABASE_URL: "postgres://invalid:invalid@127.0.0.1:1/invalid" },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(failedDatabase.status, 1, `${name}: ${failedDatabase.stderr}`);
}

process.stdout.write("dist manual commands: PASS\n");
