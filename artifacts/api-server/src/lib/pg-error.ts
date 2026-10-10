/**
 * SQLSTATE (or Node network code) of a database error. Drizzle wraps driver errors in `DrizzleQueryError`, so the
 * code lives in `cause`; connection failures may also arrive as an `AggregateError` with nested `errors`.
 */
export const pgErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) {
    const code = pgErrorCode(error.cause);
    if (code) return code;
  }
  if ("errors" in error && Array.isArray(error.errors)) {
    for (const nested of error.errors) {
      const code = pgErrorCode(nested);
      if (code) return code;
    }
  }
  return undefined;
};

export const isUniqueViolation = (error: unknown): boolean => pgErrorCode(error) === "23505";

const UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "57P01",
  "28P01",
  "3D000",
  "42P01",
  "08006",
  "08001",
]);

/** The database cannot answer right now (down, unreachable, not provisioned or not migrated). */
export const isDatabaseUnavailable = (error: unknown): boolean => UNAVAILABLE_CODES.has(pgErrorCode(error) ?? "");
