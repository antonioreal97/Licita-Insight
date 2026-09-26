import pg from "pg";

const { Client } = pg;

export const SCALE_DATABASE = "licita_scale";
const DEFAULT_URL = "postgres://licita:licita@localhost:5432/postgres";

export const adminDatabaseUrl = (): string => {
  const url = new URL(process.env.SCALE_ADMIN_DATABASE_URL ?? DEFAULT_URL);
  url.pathname = "/postgres";
  url.searchParams.delete("options");
  return url.toString();
};

export const scaleDatabaseUrl = (): string => {
  const url = new URL(process.env.SCALE_ADMIN_DATABASE_URL ?? DEFAULT_URL);
  url.pathname = `/${SCALE_DATABASE}`;
  url.searchParams.delete("options");
  return url.toString();
};

export const withAdmin = async <T>(run: (client: pg.Client) => Promise<T>): Promise<T> => {
  const client = new Client({ connectionString: adminDatabaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
};

export const dropScaleDatabase = async (): Promise<void> => {
  await withAdmin(async (admin) => {
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [SCALE_DATABASE],
    );
    await admin.query(`drop database if exists ${SCALE_DATABASE}`);
  });
};
