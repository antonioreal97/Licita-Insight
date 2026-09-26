export type DocumentFailureKind = "transient" | "permanent";

export class DocumentFetchError extends Error {
  constructor(
    message: string,
    readonly kind: DocumentFailureKind,
  ) {
    super(message);
    this.name = "DocumentFetchError";
  }
}

export const documentRetryDelayMs = (attemptCount: number): number => {
  if (attemptCount <= 1) return 5 * 60_000;
  if (attemptCount === 2) return 30 * 60_000;
  if (attemptCount === 3) return 2 * 60 * 60_000;
  return 24 * 60 * 60_000;
};

export const documentRetrySchedule = (
  failureKind: DocumentFailureKind,
  attemptCount: number,
  maxAttempts: number,
  now: Date,
): { retryable: boolean; nextRetryAt: Date | null } => {
  const retryable = failureKind === "transient" && attemptCount < maxAttempts;
  return {
    retryable,
    nextRetryAt: retryable
      ? new Date(now.getTime() + documentRetryDelayMs(attemptCount))
      : null,
  };
};

export const classifyDocumentFailure = (
  error: unknown,
): DocumentFailureKind => {
  if (error instanceof DocumentFetchError) return error.kind;
  if (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
    return "transient";
  if (error instanceof TypeError) return "transient";
  return "permanent";
};
