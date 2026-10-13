import type pg from "pg";

/**
 * Drops the database an integration test created. `pool.end()` resolves before its sockets close, and a backend
 * terminated while it is leaving raises on a client nobody listens to any more, which fails the test: wait for the
 * connections to close on their own and terminate only what is left.
 */
export async function dropTestDatabase(admin: pg.Client, name: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await admin.query<{ open: number }>(
      "select count(*)::int as open from pg_stat_activity where datname = $1",
      [name],
    );
    if (rows[0]!.open === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [name]);
  await admin.query(`drop database if exists "${name}"`);
}
