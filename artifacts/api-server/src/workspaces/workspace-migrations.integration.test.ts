import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { readCutoverState, verifyWorkspaceSchema } from "./cutover-state";
import { dropTestDatabase } from "./drop-test-database";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations",
);
const scopedTables = [
  "company_tender_fits",
  "saved_tenders",
  "saved_searches",
  "notifications",
  "email_deliveries",
  "email_delivery_notifications",
  "recommendation_events",
  "recommendation_dismissals",
  "recommendation_interest_profiles",
  "user_recommendations",
  "ai_jobs",
];

/** Copy of the migrations folder whose journal stops at `lastIdx`, to stand a database at an older version. */
const migrationsUpTo = (lastIdx: number): string => {
  const folder = mkdtempSync(path.join(tmpdir(), "licita-migrations-"));
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = path.join(folder, "meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ idx: number }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
  writeFileSync(journalPath, JSON.stringify(journal));
  return folder;
};

const runMigrations = async (pool: pg.Pool, lastIdx?: number): Promise<void> => {
  const folder = lastIdx === undefined ? migrationsFolder : migrationsUpTo(lastIdx);
  try {
    await migrate(drizzle(pool), { migrationsFolder: folder });
  } finally {
    if (folder !== migrationsFolder) rmSync(folder, { recursive: true, force: true });
  }
};

const catalog = async (pool: pg.Pool) => ({
  columns: (
    await pool.query(`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name`)
  ).rows,
  constraints: (
    await pool.query(`
      select c.relname as relation, con.conname as name, pg_get_constraintdef(con.oid, true) as definition,
             con.convalidated as validated
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
      order by c.relname, con.conname`)
  ).rows,
  indexes: (
    await pool.query(`
      select i.tablename as relation, i.indexname as name, i.indexdef as definition, x.indisvalid as valid
      from pg_indexes i
      join pg_class c on c.relname = i.indexname
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = i.schemaname
      join pg_index x on x.indexrelid = c.oid
      where i.schemaname = 'public'
      order by i.tablename, i.indexname`)
  ).rows,
});

const rowCounts = async (pool: pg.Pool): Promise<Record<string, number>> => {
  const counts: Record<string, number> = {};
  for (const table of scopedTables) {
    counts[table] = Number((await pool.query(`select count(*) as count from "${table}"`)).rows[0].count);
  }
  return counts;
};

const insertLegacyRows = async (pool: pg.Pool): Promise<void> => {
  await pool.query(`
    insert into users (id, email) values ('user-a', 'a@example.test'), ('user-b', 'b@example.test');
    insert into tenders (id, pncp_control_number, title, organization_id, organization_name,
      modality, modality_label, status, estimated_value_status, source_id, source_name,
      search_text, title_norm, object_norm, items_norm, organization_norm, other_norm, raw_payload, fetched_at)
    values ('tender-1', 'tender-1', 'TEST DATA edital', 'org', 'Org', 'pregao', 'Pregão', 'open', 'not_informed',
      'pncp', 'PNCP', 'x', 'x', '', '', '', '', '{}', now());
    insert into saved_tenders (user_id, tender_id) values ('user-a', 'tender-1'), ('user-b', 'tender-1');
    insert into saved_searches (id, user_id, name, query) values ('search-a', 'user-a', 'Busca', 'q=TEST');
    insert into notifications (id, user_id, type, dedupe_key) values ('notification-a', 'user-a', 'test', 'dedupe-a');
    insert into email_deliveries (id, user_id, mode, dedupe_key, recipient_email, subject, html_body, text_body)
    values ('delivery-a', 'user-a', 'digest', 'delivery-a', 'a@example.test', 'TEST', '<p>TEST</p>', 'TEST');
    insert into email_delivery_notifications (delivery_id, notification_id) values ('delivery-a', 'notification-a');
    insert into company_tender_fits (id, user_id, tender_id, profile_version, tender_fingerprint, requested_model,
      prompt_version, status)
    values ('fit-a', 'user-a', 'tender-1', 1, 'fingerprint', 'model', 1, 'ready');
    insert into recommendation_events (user_id, type, normalized_terms) values ('user-a', 'search', '["teste"]');
    insert into recommendation_dismissals (user_id, tender_id) values ('user-b', 'tender-1');
    insert into recommendation_interest_profiles (user_id, profile) values ('user-a', '{}');
    insert into user_recommendations (user_id, tender_id, rank, score) values ('user-a', 'tender-1', 1, 0.5);
    insert into ai_jobs (id, kind, dedupe_key, tender_id, user_id, lane)
    values ('job-fit', 'fit', 'fit:user-a:tender-1', 'tender-1', 'user-a', 'interactive'),
           ('job-index', 'index', 'index:tender-1', 'tender-1', null, 'batch');
  `);
};

// Opt-in: creates and drops its own databases next to PNCP_TEST_DATABASE_URL, like `verify:migrations`.
test("workspace migrations W1/W2 with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const databaseUrl = (name: string): string => {
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.pathname = `/${name}`;
    url.searchParams.delete("options");
    return url.toString();
  };
  const upgradedName = `licita_ws_upgrade_${suffix}`;
  const concurrentName = `licita_ws_concurrent_${suffix}`;
  const admin = new pg.Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  await admin.query(`create database "${upgradedName}"`);
  await admin.query(`create database "${concurrentName}"`);
  const upgraded = new pg.Pool({ connectionString: databaseUrl(upgradedName), max: 1 });
  const concurrent = new pg.Pool({ connectionString: databaseUrl(concurrentName), max: 1 });
  t.after(async () => {
    await upgraded.end();
    await concurrent.end();
    for (const name of [upgradedName, concurrentName]) await dropTestDatabase(admin, name);
    await admin.end();
  });

  await t.test("upgrade from 0041 applies 0042 through 0045 from main before W1 and W2", async () => {
    await runMigrations(upgraded, 41);
    await insertLegacyRows(upgraded);
    const before = await rowCounts(upgraded);

    await assert.rejects(verifyWorkspaceSchema(upgraded), (error: Error) => {
      assert.match(error.message, /table workspace_cutover_events/);
      assert.match(error.message, /table workspaces\b/);
      assert.match(error.message, /column saved_tenders\.workspace_id/);
      return true;
    });

    await runMigrations(upgraded, 42);
    const usageColumns = await upgraded.query("select column_name from information_schema.columns where table_name = 'users' and column_name in ('usage_purposes', 'applicant_types')");
    assert.equal(usageColumns.rows.length, 2);
    await runMigrations(upgraded, 43);
    const opportunityColumns = await upgraded.query(
      `select column_name from information_schema.columns
       where table_name = 'cultural_opportunities'
         and (column_name like 'application_%' or column_name like 'notice_%')`,
    );
    assert.equal(opportunityColumns.rows.length, 11);
    await assert.rejects(verifyWorkspaceSchema(upgraded), /table workspaces\b/);
    await runMigrations(upgraded, 44);
    const searchIndexes = await upgraded.query(
      "select indexname from pg_indexes where schemaname = 'public' and indexname = 'tenders_open_published_at_idx'",
    );
    assert.equal(searchIndexes.rows.length, 1);
    await assert.rejects(verifyWorkspaceSchema(upgraded), /table workspaces\b/);
    await runMigrations(upgraded, 45);
    const idbConstraint = await upgraded.query(
      "select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'cultural_opportunities_source_check'",
    );
    assert.match(idbConstraint.rows[0]?.definition ?? "", /idb/);
    await assert.rejects(verifyWorkspaceSchema(upgraded), /table workspaces\b/);
    await runMigrations(upgraded, 46);
    await assert.rejects(verifyWorkspaceSchema(upgraded), (error: Error) => {
      assert.doesNotMatch(error.message, /table /);
      for (const table of scopedTables) assert.match(error.message, new RegExp(`column ${table}\\.workspace_id`));
      return true;
    });

    await runMigrations(upgraded);
    assert.deepEqual(await verifyWorkspaceSchema(upgraded), { mode: "legacy", writesPaused: false });
    assert.deepEqual(await rowCounts(upgraded), before);
    for (const table of scopedTables) {
      const assigned = await upgraded.query(`select count(*) as count from "${table}" where workspace_id is not null`);
      assert.equal(Number(assigned.rows[0].count), 0, `${table} must keep workspace_id null until W3`);
    }

    // Production applies these files by hand; a second run must change nothing.
    const schemaBefore = await catalog(upgraded);
    for (const file of ["0047_workspaces_foundation.sql", "0048_workspace_scope_expand.sql"]) {
      await upgraded.query(readFileSync(path.join(migrationsFolder, file), "utf8"));
    }
    assert.deepEqual(await catalog(upgraded), schemaBefore);

    await upgraded.query(
      `insert into workspace_cutover_events (mode, writes_paused, actor, reason)
       values ('legacy', true, 'teste', 'pause: TEST'), ('workspaces', true, 'teste', 'cut: TEST')`,
    );
    assert.deepEqual(await readCutoverState(upgraded), { mode: "workspaces", writesPaused: true });
    const audit = await upgraded.query(
      "select db_user, client_app, details from workspace_cutover_events order by id desc limit 1",
    );
    assert.ok(audit.rows[0].db_user);
    assert.equal(typeof audit.rows[0].client_app, "string");
    assert.deepEqual(audit.rows[0].details, {});
    await assert.rejects(
      upgraded.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('hybrid', false, 'teste', 'x')",
      ),
      /workspace_cutover_events_mode_check/,
    );
    await assert.rejects(
      upgraded.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ('legacy', false, '  ', 'x')",
      ),
      /workspace_cutover_events_actor_check/,
    );
  });

  await t.test("the concurrent production variant builds the same schema as the versioned 0048", async () => {
    await runMigrations(concurrent, 46);
    const statements = readFileSync(
      path.join(migrationsFolder, "manual/0048_workspace_scope_expand_concurrently.sql"),
      "utf8",
    ).split("--> statement-breakpoint");
    // One statement per query, outside any transaction block, as psql runs it without -1.
    for (const statement of statements) await concurrent.query(statement);

    const versioned = await catalog(upgraded);
    const manual = await catalog(concurrent);
    assert.deepEqual(manual.columns, versioned.columns);
    assert.deepEqual(manual.constraints, versioned.constraints);
    assert.deepEqual(manual.indexes, versioned.indexes);
    assert.ok(manual.indexes.every((index) => index.valid === true));
    assert.ok(manual.constraints.every((constraint) => constraint.validated === true));

    // Then the regular 0048 apply is a no-op on top of it.
    await runMigrations(concurrent);
    assert.deepEqual(await catalog(concurrent), manual);
    assert.deepEqual(await verifyWorkspaceSchema(concurrent), { mode: "legacy", writesPaused: false });
  });
});
