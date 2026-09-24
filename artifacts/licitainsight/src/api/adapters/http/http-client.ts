import { ApiError } from '../../errors';
import type { ApiErrorBody, DownloadedFile } from '../../types';

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

/** Fetch with the session cookie. Non-2xx → `ApiError` (contract body when present). */
async function send(url: string, init: RequestInit): Promise<Response> {
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
  return response;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await send(url, init);
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('INTERNAL_ERROR', 'Resposta inválida do servidor.', response.status);
  }
}

/** `attachment; filename="a.json"` or RFC 5987 `filename*=UTF-8''a.json` → `a.json`. */
function filenameFrom(disposition: string | null): string | null {
  const match = disposition?.match(/filename\*=(?:UTF-8'')?([^;]+)|filename="?([^";]+)"?/i);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.trim().replace(/^"|"$/g, ''));
  } catch (error) {
    console.error('[http] Nome de arquivo inválido em Content-Disposition.', error);
    return null;
  }
}

/** File download (`Content-Disposition: attachment`): the body as a Blob plus the server's filename. */
export async function getFile(path: string, signal?: AbortSignal): Promise<DownloadedFile> {
  const response = await send(`${apiBaseUrl}${path}`, { headers: { Accept: 'application/json' }, signal });
  try {
    return { blob: await response.blob(), filename: filenameFrom(response.headers.get('Content-Disposition')) };
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('INTERNAL_ERROR', 'Não foi possível ler o arquivo recebido.', response.status);
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
