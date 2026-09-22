import type { ApiErrorBody, ApiErrorCode } from './types';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(code: ApiErrorCode, message: string, status: number, opts: { requestId?: string; retryAfterSeconds?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = opts.requestId;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }

  /** Errors worth retrying automatically (transient on the server or network). */
  get isTransient() {
    return this.code === 'NETWORK_ERROR' || this.code === 'SEARCH_UNAVAILABLE' || this.code === 'RATE_LIMITED' || this.status >= 500;
  }

  static fromBody(body: ApiErrorBody, status: number, retryAfter?: string | null) {
    const seconds = retryAfter ? Number(retryAfter) : undefined;
    return new ApiError(body.error.code, body.error.message, status, {
      requestId: body.error.requestId,
      retryAfterSeconds: Number.isFinite(seconds) ? seconds : undefined,
    });
  }
}

export const isApiError = (value: unknown): value is ApiError => value instanceof ApiError;
