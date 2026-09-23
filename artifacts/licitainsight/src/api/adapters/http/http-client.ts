import { ApiError } from '../../errors';
import type { ApiErrorBody } from '../../types';

type QueryValue = string | number | boolean | undefined | null | (string | number)[];

/** Same origin by default (Vite proxies `/api` in dev, a reverse proxy in production), so the session cookie is first-party. */
export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

/** Serializes arrays as repeated params (`?status=open&status=closed`), per contract. */
export function toQueryString(query: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => search.append(key, String(item)));
    else search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: 'include' });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 'Não foi possível conectar ao servidor.', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error?.code) throw ApiError.fromBody(body, response.status, response.headers.get('Retry-After'));
    throw new ApiError('INTERNAL_ERROR', `HTTP ${response.status}`, response.status);
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('INTERNAL_ERROR', 'Resposta inválida do servidor.', response.status);
  }
}

export function getJson<T>(path: string, query: Record<string, QueryValue> = {}, signal?: AbortSignal): Promise<T> {
  return request<T>(`${apiBaseUrl}${path}${toQueryString(query)}`, { headers: { Accept: 'application/json' }, signal });
}

/** State-changing call. `X-Requested-With` is the CSRF header the API requires on POST/PUT/PATCH/DELETE (account-v1). */
export function sendJson<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'licita-insight' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return request<T>(`${apiBaseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
