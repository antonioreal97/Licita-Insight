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
  | "AI_UNAVAILABLE"
  | "SERVICE_OVERLOADED"
  | "REQUEST_TIMEOUT"
  | "PAYLOAD_TOO_LARGE"
  | "MAINTENANCE_IN_PROGRESS"
  | "WORKSPACE_NOT_FOUND"
  | "WORKSPACE_LIMIT_REACHED"
  | "WORKSPACE_READ_ONLY"
  | "WORKSPACE_ARCHIVED"
  | "PROFILE_VERSION_CONFLICT"
  | "FEATURE_DISABLED";

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
    readonly details?: ApiErrorDetail[] | Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class InvalidParameterError extends ApiError {
  declare readonly details: ApiErrorDetail[];

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
  constructor(message = "The daily AI question limit has been reached", details?: ApiErrorDetail[]) {
    super(429, "AI_QUOTA_EXCEEDED", message, details);
  }
}

/** Workspace cutover pause or state change (docs/contracts/workspace-cutover-v1.md); writes only, never reads. */
export class MaintenanceInProgressError extends ApiError {
  readonly retryAfterSeconds = 60;

  constructor() {
    super(503, "MAINTENANCE_IN_PROGRESS", "Manutenção rápida em andamento. Tente de novo em alguns minutos.");
  }
}

/** Same answer for a missing workspace and someone else's, so ids cannot be enumerated. */
export class WorkspaceNotFoundError extends ApiError {
  constructor() {
    super(404, "WORKSPACE_NOT_FOUND", "Workspace was not found");
  }
}

export class WorkspaceLimitReachedError extends ApiError {
  constructor(maximum: number) {
    super(402, "WORKSPACE_LIMIT_REACHED", `The account can have at most ${maximum} active workspaces`);
  }
}

export class WorkspaceReadOnlyError extends ApiError {
  constructor() {
    super(402, "WORKSPACE_READ_ONLY", "This workspace is read-only on the current plan");
  }
}

export class WorkspaceArchivedError extends ApiError {
  constructor() {
    super(409, "WORKSPACE_ARCHIVED", "This workspace is archived");
  }
}

export class FeatureDisabledError extends ApiError {
  constructor() {
    super(422, "FEATURE_DISABLED", "This workspace journey is not enabled");
  }
}

export class ProfileVersionConflictError extends ApiError {
  constructor(current: { revision: number; answers: Record<string, unknown> }) {
    super(409, "PROFILE_VERSION_CONFLICT", "The profile was changed elsewhere; reload before saving", current);
  }
}

export class AiUnavailableError extends ApiError {
  constructor(message = "The tender question service is temporarily unavailable") {
    super(503, "AI_UNAVAILABLE", message);
  }
}
