import { ApiError } from '../../errors';
import type { ApiErrorBody } from '../../types';

type QueryValue = string | number | boolean | undefined | null | (string | number)[];

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');

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

export async function getJson<T>(path: string, query: Record<string, QueryValue> = {}, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}${toQueryString(query)}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR', 'Não foi possível conectar ao servidor.', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    if (body?.error?.code) throw ApiError.fromBody(body, response.status, response.headers.get('Retry-After'));
    throw new ApiError('INTERNAL_ERROR', `HTTP ${response.status}`, response.status);
  }

  return (await response.json()) as T;
}
