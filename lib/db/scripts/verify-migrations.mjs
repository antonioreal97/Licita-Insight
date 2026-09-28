import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";

const sourceUrl =
  process.env.MIGRATIONS_TEST_DATABASE_URL ??
  process.env.PNCP_TEST_DATABASE_URL ??
  process.env.DATABASE_URL;
if (!sourceUrl) {
  throw new Error(
    "MIGRATIONS_TEST_DATABASE_URL, PNCP_TEST_DATABASE_URL or DATABASE_URL is required",
  );
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const migrateName = `licita_verify_migrate_${suffix}`;
const pushName = `licita_verify_push_${suffix}`;
const databaseUrl = (databaseName) => {
  const url = new URL(sourceUrl);
  url.pathname = `/${databaseName}`;
  url.searchParams.delete("options");
  return url.toString();
};
const adminUrl = databaseUrl("postgres");

const run = (command, args, databaseName) => {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl(databaseName) },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
    );
  }
};

const runMigrate = () => run("node", ["scripts/migrate.mjs"], migrateName);
const runPush = (args) => run("pnpm", args, pushName);
const normalize = (value) => value?.replaceAll(/\s+/g, " ").trim() ?? null;

const catalog = async (connectionString) => {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const sections = {};
    sections.extensions = (
      await client.query(`
        select extname as name
        from pg_extension
        where extname <> 'plpgsql'
        order by extname
      `)
    ).rows;
    sections.relations = (
      await client.query(`
        select c.relname as name, c.relkind as kind, c.relpersistence as persistence
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind in ('r', 'p', 'S', 'v', 'm')
        order by c.relname
      `)
    ).rows;
    sections.columns = (
      await client.query(`
        select c.relname as relation, a.attname as name,
               pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
               a.attnotnull as not_null,
               a.attidentity as identity,
               a.attgenerated as generated,
               pg_get_expr(ad.adbin, ad.adrelid) as default_expression
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
        where n.nspname = 'public'
          and c.relkind in ('r', 'p', 'v', 'm')
          and a.attnum > 0 and not a.attisdropped
        order by c.relname, a.attname
      `)
    ).rows.map((row) => ({ ...row, default_expression: normalize(row.default_expression) }));
    sections.constraints = (
      await client.query(`
        select c.relname as relation,
               pg_get_constraintdef(con.oid, true) as definition
        from pg_constraint con
        join pg_class c on c.oid = con.conrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
        order by c.relname, pg_get_constraintdef(con.oid, true)
      `)
    ).rows.map((row) => ({ ...row, definition: normalize(row.definition) }));
    sections.indexes = (
      await client.query(`
        select tablename as relation, indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public'
        order by tablename, indexname
      `)
    ).rows.map((row) => ({ ...row, definition: normalize(row.definition) }));
    sections.views = (
      await client.query(`
        select viewname as name, definition
        from pg_views
        where schemaname = 'public'
        order by viewname
      `)
    ).rows.map((row) => ({ ...row, definition: normalize(row.definition) }));
    return sections;
  } finally {
    await client.end();
  }
};

const printDiff = (expected, actual) => {
  for (const section of Object.keys(expected)) {
    const left = new Set(expected[section].map((entry) => JSON.stringify(entry)));
    const right = new Set(actual[section].map((entry) => JSON.stringify(entry)));
    const removed = [...left].filter((entry) => !right.has(entry));
    const added = [...right].filter((entry) => !left.has(entry));
    if (removed.length === 0 && added.length === 0) continue;
    process.stderr.write(`--- push/${section}\n+++ migrate/${section}\n`);
    for (const entry of removed) process.stderr.write(`-${entry}\n`);
    for (const entry of added) process.stderr.write(`+${entry}\n`);
  }
};

const admin = new pg.Client({ connectionString: adminUrl });
await admin.connect();
try {
  await admin.query(`create database "${migrateName}"`);
  await admin.query(`create database "${pushName}"`);

  const startedAt = performance.now();
  runMigrate();
  const firstMigrateMs = performance.now() - startedAt;
  runMigrate();

  runPush(["run", "prepare-extensions"]);
  runPush(["run", "push-force"]);

  const expected = await catalog(databaseUrl(pushName));
  const actual = await catalog(databaseUrl(migrateName));
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    printDiff(expected, actual);
    throw new Error("versioned migrations differ from prepare-extensions + push-force");
  }
  process.stdout.write(
    `migrations parity: PASS (empty diff, first migrate ${firstMigrateMs.toFixed(0)} ms, second migrate idempotent)\n`,
  );
} finally {
  for (const databaseName of [migrateName, pushName]) {
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1",
      [databaseName],
    );
    await admin.query(`drop database if exists "${databaseName}"`);
  }
  await admin.end();
}
