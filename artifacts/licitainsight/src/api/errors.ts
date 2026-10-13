import type { ApiErrorBody, ApiErrorCode, ApiErrorDetail } from './types';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly details: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, status: number, opts: { requestId?: string; retryAfterSeconds?: number; details?: ApiErrorDetail[] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = opts.requestId;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.details = opts.details ?? [];
  }

  /** First detail with this `issue` (e.g. 409 `duplicate`, `restore_expired`). */
  detail(issue: string) {
    return this.details.find((d) => d.issue === issue);
  }

  /**
   * Errors worth retrying automatically (transient on the server or network). Maintenance is a 503 too, but the API
   * asks to wait (`Retry-After`): the person tries again, the app does not.
   */
  get isTransient() {
    if (this.code === 'MAINTENANCE_IN_PROGRESS') return false;
    return this.code === 'NETWORK_ERROR' || this.code === 'SEARCH_UNAVAILABLE' || this.code === 'RATE_LIMITED' || this.code === 'SERVICE_OVERLOADED' || this.status >= 500;
  }

  static fromBody(body: ApiErrorBody, status: number, retryAfter?: string | null) {
    const seconds = retryAfter ? Number(retryAfter) : undefined;
    return new ApiError(body.error.code, body.error.message, status, {
      requestId: body.error.requestId,
      retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
      details: body.error.details,
    });
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;
