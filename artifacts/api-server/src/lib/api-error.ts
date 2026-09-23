export type ApiErrorCode =
  | "INVALID_PARAMETER"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SEARCH_UNAVAILABLE"
  | "INGEST_IN_PROGRESS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT";

export interface ApiErrorDetail {
  field: string;
  issue: string;
  existingId?: string;
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

export class UnauthenticatedError extends ApiError {
  constructor(message = "Authentication is required") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "The request is not allowed") {
    super(403, "FORBIDDEN", message);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, details: ApiErrorDetail[]) {
    super(409, "CONFLICT", message, details);
  }
}
