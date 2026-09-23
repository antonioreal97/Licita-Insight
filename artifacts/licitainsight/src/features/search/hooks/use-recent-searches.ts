import { useCallback, useSyncExternalStore } from 'react';
import { optionalStorageAllowed } from '@/features/privacy/cookie-consent';

const STORAGE_KEY = 'licita-recent-searches';
const MAX_ITEMS = 8;
const EMPTY: string[] = [];

// Module-level store so every consumer (and every tab, via `storage` events) sees the same list.
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    cache = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_ITEMS) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]) {
  cache = next;
  if (optionalStorageAllowed()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('[search] Não foi possível salvar as buscas recentes.', error);
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Recent free-text searches (most recent first, deduplicated case-insensitively, max 8). Local to this browser. */
export function useRecentSearches() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);

  const add = useCallback((query: string) => {
    const value = query.trim();
    if (!value) return;
    const key = value.toLocaleLowerCase('pt-BR');
    write([value, ...read().filter((item) => item.toLocaleLowerCase('pt-BR') !== key)].slice(0, MAX_ITEMS));
  }, []);

  const remove = useCallback((query: string) => write(read().filter((item) => item !== query)), []);
  const clear = useCallback(() => write([]), []);

  return { items, add, remove, clear };
}
