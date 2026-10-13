import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import express from "express";
import pg from "pg";
import { dropTestDatabase } from "./drop-test-database";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations",
);
const LOCK_KEY = "licitai:workspace-cutover";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover lock and flag are its own.
test("workspace domain and write gate with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseName = `licita_ws_c1_${suffix}`;
  const restrictedRole = `licita_ws_c1_reader_${suffix}`;
  const databaseUrl = (name: string, user?: { name: string; password: string }): string => {
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.pathname = `/${name}`;
    url.searchParams.delete("options");
    if (user) {
      url.username = user.name;
      url.password = user.password;
    }
    return url.toString();
  };
  const admin = new pg.Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  const owner = new pg.Pool({ connectionString: databaseUrl(databaseName), max: 4 });
  await migrate(drizzle(owner), { migrationsFolder });
  await owner.query("create table gate_probe_writes (id serial primary key, mode text not null)");

  process.env.DATABASE_URL = databaseUrl(databaseName);
  const { db, pool } = await import("@workspace/db");
  const schema = await import("@workspace/db/schema");
  const { withCutoverGate } = await import("./cutover-gate");
  const { createWorkspace, defaultWorkspaceId, listWorkspaces, requireWorkspaceMember } = await import(
    "./workspace-service"
  );
  const { saveWorkspaceProfileStep } = await import("./workspace-profile-service");
  const { errorHandler } = await import("../middlewares/error-handler");
  const { requestContext } = await import("../middlewares/request-context");
  const { WorkspaceLimitReachedError, WorkspaceNotFoundError, ProfileVersionConflictError } = await import(
    "../lib/api-error"
  );

  const restrictedPassword = randomUUID();
  let restricted: pg.Pool | undefined;
  t.after(async () => {
    await restricted?.end();
    await pool.end();
    await owner.end();
    await dropTestDatabase(admin, databaseName);
    await admin.query(`drop role if exists "${restrictedRole}"`);
    await admin.end();
  });

  const app = express();
  app.use(requestContext);
  app.post("/probe", async (req, res, next) => {
    try {
      const database = req.header("x-restricted") ? drizzle(restricted!, { schema }) : db;
      const state = await withCutoverGate(
        { kind: "http" },
        async (tx, current) => {
          await tx.execute(sql`insert into gate_probe_writes (mode) values (${current.mode})`);
          return current;
        },
        database,
      );
      res.json(state);
    } catch (error) {
      next(error);
    }
  });
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const probe = (headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/probe`, { method: "POST", headers });
  const probeWrites = async () => Number((await owner.query("select count(*) as count from gate_probe_writes")).rows[0].count);

  /** The owner's state change: exclusive lock with lock_timeout 5s, then the new row (docs/contracts/workspace-cutover-v1.md). */
  const changeState = async (
    client: pg.PoolClient | pg.Client,
    mode: "legacy" | "workspaces",
    writesPaused: boolean,
    commit = true,
  ) => {
    await client.query("begin");
    await client.query("set local lock_timeout = '5s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [LOCK_KEY]);
    await client.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
    if (commit) await client.query("commit");
  };

  await owner.query(`
    insert into users (id, email, trial_ends_at) values
      ('free-user', 'free@example.test', now() - interval '1 day'),
      ('trial-user', 'trial@example.test', now() + interval '7 days'),
      ('other-user', 'other@example.test', now() + interval '7 days')`);

  const create = (ownerUserId: string, name: string, isDefault = false) =>
    withCutoverGate({ kind: "http" }, (tx) =>
      createWorkspace(tx, { ownerUserId, type: "procurement", name, isDefault }),
    );

  await t.test("concurrent creations at the free limit: exactly one wins, with its owner membership", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) => create("free-user", `Espaço ${index}`)),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of results.filter((result) => result.status === "rejected")) {
      assert.ok((result as PromiseRejectedResult).reason instanceof WorkspaceLimitReachedError);
    }
    const rows = await owner.query(
      `select w.limit_slot, m.role from workspaces w
       join workspace_members m on m.workspace_id = w.id and m.user_id = w.owner_user_id
       where w.owner_user_id = 'free-user'`,
    );
    assert.deepEqual(rows.rows, [{ limit_slot: 1, role: "owner" }]);
  });

  await t.test("concurrent creations under trial get distinct slots 1..5 and the sixth hits the limit", async () => {
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, index) => create("trial-user", `Espaço ${index}`, index === 0)),
    );
    assert.ok(created.every((workspace) => workspace.accessMode === "write" && workspace.role === "owner"));
    const slots = await owner.query(
      "select limit_slot from workspaces where owner_user_id = 'trial-user' order by limit_slot",
    );
    assert.deepEqual(slots.rows.map((row) => row.limit_slot), [1, 2, 3, 4, 5]);
    const members = await owner.query(
      "select count(*) as count from workspace_members where user_id = 'trial-user' and role = 'owner'",
    );
    assert.equal(Number(members.rows[0].count), 5);
    await assert.rejects(create("trial-user", "Sexto"), WorkspaceLimitReachedError);
    const expectedDefault = await owner.query("select 'ws_' || md5('pardal-digital:procurement:' || $1) as id", [
      "trial-user",
    ]);
    assert.equal(defaultWorkspaceId("trial-user"), expectedDefault.rows[0].id);
    assert.equal(
      (await owner.query("select count(*) as count from workspaces where id = $1 and is_default", [expectedDefault.rows[0].id]))
        .rows[0].count,
      "1",
    );
  });

  await t.test("membership: foreign and missing ids answer the same 404; downgrade keeps the lowest slot writable", async () => {
    const ids = (
      await owner.query("select id from workspaces where owner_user_id = 'trial-user' order by limit_slot")
    ).rows.map((row) => row.id as string);
    for (const id of [ids[0]!, `ws_${"0".repeat(32)}`, "not-an-id"]) {
      await assert.rejects(requireWorkspaceMember(db, "other-user", id), WorkspaceNotFoundError);
    }
    assert.equal((await requireWorkspaceMember(db, "trial-user", ids[2]!)).accessMode, "write");

    await owner.query("update users set trial_ends_at = now() - interval '1 second' where id = 'trial-user'");
    const modes = await Promise.all(ids.map(async (id) => (await requireWorkspaceMember(db, "trial-user", id)).accessMode));
    assert.deepEqual(modes, ["write", "read_only", "read_only", "read_only", "read_only"]);

    await owner.query("update workspaces set archived_at = now() where id = $1", [ids[0]]);
    await owner.query(
      `insert into user_workspace_preferences (user_id, active_workspace_id) values ('trial-user', $1)`,
      [ids[0]],
    );
    await owner.query("update workspace_members set last_selected_at = now() where workspace_id = $1", [ids[3]]);
    const listed = await listWorkspaces(db, "trial-user");
    assert.deepEqual(listed.limits, { used: 4, maximum: 1 });
    assert.equal(listed.workspaces.length, 4);
    assert.deepEqual(
      listed.workspaces.map((workspace) => workspace.accessMode),
      ["write", "read_only", "read_only", "read_only"],
    );
    // Slot 2 is now the only writable one; the most recently selected (slot 4) is read-only and skipped.
    assert.equal(listed.activeWorkspaceId, ids[1]);
    const preference = await owner.query("select active_workspace_id from user_workspace_preferences where user_id = 'trial-user'");
    assert.equal(preference.rows[0].active_workspace_id, ids[0], "GET must not write the resolved preference");
    assert.equal((await listWorkspaces(db, "trial-user", { archived: true })).workspaces.length, 5);
    await owner.query("update users set trial_ends_at = now() + interval '7 days' where id = 'trial-user'");
    await owner.query("update workspaces set archived_at = null where id = $1", [ids[0]]);
  });

  await t.test("profile saves merge steps, bump revision every time and reject a stale baseRevision", async () => {
    const workspaceId = defaultWorkspaceId("trial-user");
    const member = await requireWorkspaceMember(db, "trial-user", workspaceId);
    const save = (body: unknown) =>
      withCutoverGate({ kind: "http" }, (tx) => saveWorkspaceProfileStep(tx, member, body));
    const first = await save({
      schemaVersion: 1,
      step: "objective",
      baseRevision: 0,
      answers: { selectedKeywords: ["manutenção predial"] },
    });
    assert.deepEqual([first.revision, first.profileVersion, first.completeness.percent], [1, 1, 50]);

    await assert.rejects(
      save({ schemaVersion: 1, step: "objective", baseRevision: 0, answers: { selectedKeywords: ["outra aba"] } }),
      (error) =>
        error instanceof ProfileVersionConflictError &&
        JSON.stringify(error.details) ===
          JSON.stringify({ revision: 1, answers: { selectedKeywords: ["manutenção predial"] } }),
    );
    const region = await save({
      schemaVersion: 1,
      step: "region",
      baseRevision: 1,
      answers: { coverage: { scope: "national", mode: "strict", acceptsRemote: false } },
    });
    assert.deepEqual([region.revision, region.profileVersion, region.completeness.complete], [2, 2, true]);
    const platforms = await save({
      schemaVersion: 1,
      step: "qualification",
      baseRevision: 2,
      answers: { registeredPlatforms: ["comprasnet"] },
    });
    assert.deepEqual([platforms.revision, platforms.profileVersion], [3, 2], "platforms do not feed the fit");

    const stored = await owner.query(
      `select p.revision, p.profile_version, p.answers, w.onboarding_status
       from workspace_profiles p join workspaces w on w.id = p.workspace_id where p.workspace_id = $1`,
      [workspaceId],
    );
    assert.deepEqual(stored.rows[0].answers, {
      selectedKeywords: ["manutenção predial"],
      coverage: { scope: "national", mode: "strict", acceptsRemote: false },
      registeredPlatforms: ["comprasnet"],
    });
    assert.equal(stored.rows[0].onboarding_status, "complete");
    const signals = await owner.query(
      "select kind, value, profile_version from workspace_profile_signals where workspace_id = $1 order by kind",
      [workspaceId],
    );
    assert.deepEqual(signals.rows, [
      { kind: "keyword", value: "manutenção predial", profile_version: 2 },
      { kind: "platform", value: "comprasnet", profile_version: 2 },
    ]);
  });

  await t.test("a pause waits for the mutation in flight, which commits in the old mode", async () => {
    let release!: () => void;
    let started!: () => void;
    const inFlightStarted = new Promise<void>((resolve) => (started = resolve));
    const inFlight = withCutoverGate({ kind: "http" }, async (tx, state) => {
      started();
      await new Promise<void>((resolve) => (release = resolve));
      await tx.execute(sql`insert into gate_probe_writes (mode) values (${state.mode})`);
      return state;
    });
    await inFlightStarted;
    const pauser = await owner.connect();
    let paused = false;
    const pause = changeState(pauser, "legacy", true).then(() => (paused = true));
    await sleep(300);
    assert.equal(paused, false, "the exclusive lock must wait for the shared one");
    const refused = await probe();
    assert.equal(refused.status, 503, "a new mutation behind a waiting pause answers 503 at once");
    release();
    assert.deepEqual(await inFlight, { mode: "legacy", writesPaused: false });
    await pause;
    pauser.release();
    assert.equal(await probeWrites(), 1);
  });

  await t.test("during the pause a mutation answers 503 with Retry-After and writes nothing; reads still work", async () => {
    const response = await probe();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    const body = (await response.json()) as { error: { code: string; message: string; requestId: string } };
    assert.equal(body.error.code, "MAINTENANCE_IN_PROGRESS");
    assert.equal(body.error.message, "Manutenção rápida em andamento. Tente de novo em alguns minutos.");
    assert.ok(body.error.requestId);
    assert.equal(await probeWrites(), 1);
    assert.equal((await listWorkspaces(db, "trial-user")).workspaces.length, 5);
  });

  await t.test("a pause fails after 5 s if a mutation stays in flight, and the state does not change", async () => {
    await owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('legacy', false, 'teste', 'resume: TEST')",
    );
    let release!: () => void;
    let started!: () => void;
    const inFlightStarted = new Promise<void>((resolve) => (started = resolve));
    const inFlight = withCutoverGate({ kind: "http" }, async () => {
      started();
      await new Promise<void>((resolve) => (release = resolve));
    });
    await inFlightStarted;
    const pauser = await owner.connect();
    await assert.rejects(changeState(pauser, "legacy", true), /lock timeout/);
    await pauser.query("rollback");
    pauser.release();
    release();
    await inFlight;
    const latest = await owner.query("select mode, writes_paused from workspace_cutover_events order by id desc limit 1");
    assert.deepEqual(latest.rows[0], { mode: "legacy", writes_paused: false });
  });

  await t.test("during the cutover transaction a mutation answers 503 at once; after resume it writes in the new mode", async () => {
    const cutter = await owner.connect();
    await changeState(cutter, "workspaces", true, false);
    const startedAt = Date.now();
    const refused = await probe();
    assert.equal(refused.status, 503);
    assert.ok(Date.now() - startedAt < 1_000, "HTTP never waits for the exclusive lock");
    await cutter.query("commit");
    assert.equal((await probe()).status, 503, "still paused until the owner resumes");
    await changeState(cutter, "workspaces", false);
    cutter.release();
    const accepted = await probe();
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { mode: "workspaces", writesPaused: false });
    const written = await owner.query("select mode from gate_probe_writes order by id desc limit 1");
    assert.equal(written.rows[0].mode, "workspaces");
  });

  await t.test("a flag read error answers 500 with requestId and writes nothing", async () => {
    await admin.query(`create role "${restrictedRole}" login password '${restrictedPassword}'`);
    await owner.query(`grant usage on schema public to "${restrictedRole}"`);
    await owner.query(`grant select, insert on gate_probe_writes to "${restrictedRole}"`);
    await owner.query(`grant usage on sequence gate_probe_writes_id_seq to "${restrictedRole}"`);
    restricted = new pg.Pool({
      connectionString: databaseUrl(databaseName, { name: restrictedRole, password: restrictedPassword }),
      max: 1,
    });
    const before = await probeWrites();
    const response = await probe({ "x-restricted": "1" });
    assert.equal(response.status, 500);
    const body = (await response.json()) as { error: { code: string; requestId: string } };
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
    assert.equal(await probeWrites(), before);
  });
});
