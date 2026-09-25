export type ApiErrorCode =
  | "INVALID_PARAMETER"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "SEARCH_UNAVAILABLE"
  | "INGEST_IN_PROGRESS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "SUBSCRIPTION_REQUIRED"
  | "BILLING_UNAVAILABLE"
  | "AI_QUOTA_EXCEEDED"
  | "AI_UNAVAILABLE";

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

export class SubscriptionRequiredError extends ApiError {
  constructor(message = "An active subscription is required") {
    super(402, "SUBSCRIPTION_REQUIRED", message);
  }
}

export class BillingUnavailableError extends ApiError {
  constructor(message: string) {
    super(503, "BILLING_UNAVAILABLE", message);
  }
}

export class AiQuotaExceededError extends ApiError {
  constructor(message = "The daily AI question limit has been reached") {
    super(429, "AI_QUOTA_EXCEEDED", message);
  }
}

export class AiUnavailableError extends ApiError {
  constructor(message = "The tender question service is temporarily unavailable") {
    super(503, "AI_UNAVAILABLE", message);
  }
}
