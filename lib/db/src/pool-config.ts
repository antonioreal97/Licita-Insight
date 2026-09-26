import type { PoolConfig } from "pg";

const positiveInteger = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum = 1,
): number => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return value;
};

export const poolConfigFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig => ({
  connectionString: env.DATABASE_URL,
  max: positiveInteger(env, "DB_POOL_MAX", 10),
  idleTimeoutMillis: positiveInteger(env, "DB_POOL_IDLE_TIMEOUT_MS", 30_000),
  connectionTimeoutMillis: positiveInteger(env, "DB_CONNECTION_TIMEOUT_MS", 2_000),
  statement_timeout: positiveInteger(env, "DB_STATEMENT_TIMEOUT_MS", 15_000),
  application_name: env.DB_APPLICATION_NAME?.trim() || "licitai-api",
});
