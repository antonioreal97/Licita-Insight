const STORAGE_KEY = 'licita-search-navigation';

type SearchStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

function browserStorage(): SearchStorage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

/** The latest canonical search query, scoped to this browser tab. */
export function readRememberedSearch(storage: SearchStorage | null = browserStorage()): string {
  if (!storage) return '';
  try {
    const value = storage.getItem(STORAGE_KEY);
    return value?.startsWith('?') ? value.slice(1) : '';
  } catch (error) {
    console.error('[search] Não foi possível restaurar os filtros da navegação.', error);
    return '';
  }
}

/** An empty canonical query is the default search, so there is nothing to retain. */
export function rememberSearch(search: string, storage: SearchStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    if (search) storage.setItem(STORAGE_KEY, search);
    else storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[search] Não foi possível preservar os filtros da navegação.', error);
  }
}

