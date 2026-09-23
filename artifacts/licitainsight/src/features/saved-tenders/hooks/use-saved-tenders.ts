import { useCallback, useSyncExternalStore } from 'react';

// Saved tender ids live in this browser until a per-user saved-tenders API exists.

const STORAGE_KEY = 'licita-saved-tenders';
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) return parsed;
    console.error(`[saved-tenders] Ignoring invalid value in localStorage "${STORAGE_KEY}".`);
  } catch (error) {
    console.error(`[saved-tenders] Could not read localStorage "${STORAGE_KEY}".`, error);
  }
  return [];
}

let snapshot = read();

function write(next: string[]) {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Private mode / quota: the change still applies for this session, but won't persist.
    console.error('[saved-tenders] Could not persist saved tenders; changes will be lost on reload.', error);
  }
  listeners.forEach((listener) => listener());
}

// Another tab changed the list: re-read it so every open tab shows the same saved ids.
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  snapshot = read();
  listeners.forEach((listener) => listener());
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useSavedTenders() {
  const saved = useSyncExternalStore(subscribe, () => snapshot);
  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);
  const toggle = useCallback((id: string) => write(snapshot.includes(id) ? snapshot.filter((item) => item !== id) : [...snapshot, id]), []);
  /** Undo for a removal: puts the id back where it was. */
  const restore = useCallback((id: string, index: number) => {
    if (snapshot.includes(id)) return;
    write([...snapshot.slice(0, index), id, ...snapshot.slice(index)]);
  }, []);
  return { saved, isSaved, toggle, restore };
}
