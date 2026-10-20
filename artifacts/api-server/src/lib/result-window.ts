import { InvalidParameterError } from "./api-error";

/**
 * Deepest result a paginated list serves: past it, refining the filters is the way forward. Keeps a client (or an
 * agent) from walking the whole base page by page and keeps OFFSET cheap. `total` still reports the real count.
 */
export const MAX_RESULT_WINDOW = 1_000;

export const assertWithinResultWindow = (page: number, pageSize: number): void => {
  if (page * pageSize > MAX_RESULT_WINDOW) {
    throw new InvalidParameterError(
      `Only the first ${MAX_RESULT_WINDOW} results can be paged; refine the filters to see more`,
      [{ field: "page", issue: "beyond_result_window" }],
    );
  }
};

/** Caps `totalPages` at the last page inside the window so pagers never offer a page the API refuses. */
export const withinResultWindow = <T extends { pagination: { pageSize: number; totalPages: number } }>(
  result: T,
): T => ({
  ...result,
  pagination: {
    ...result.pagination,
    totalPages: Math.min(
      result.pagination.totalPages,
      Math.floor(MAX_RESULT_WINDOW / result.pagination.pageSize),
    ),
  },
});
