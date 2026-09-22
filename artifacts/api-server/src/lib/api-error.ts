export type ApiErrorCode =
  | "INVALID_PARAMETER"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SEARCH_UNAVAILABLE"
  | "INGEST_IN_PROGRESS";

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class InvalidParameterError extends ApiError {
  constructor(message: string, details: ApiErrorDetail[]) {
    super(400, "INVALID_PARAMETER", message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(404, "NOT_FOUND", message);
  }
}
