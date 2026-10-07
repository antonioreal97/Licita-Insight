import { PncpError } from "./pncp-client";

export const classifyPncpRefreshFailure = (
  error: unknown,
): "source_removed" | "error" =>
  error instanceof PncpError && error.status === 410
    ? "source_removed"
    : "error";
