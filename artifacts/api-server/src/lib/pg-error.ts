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
