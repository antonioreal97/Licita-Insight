import { useCallback, useSyncExternalStore } from 'react';

// Local-only store until the saved-tenders API exists (future CODEX_HANDOFF).
// Swap the storage calls for a service when it does; the hook signature stays the same.

const STORAGE_KEY = 'licita-saved-tenders';
const DEFAULT_SAVED = ['pe-042-2026', 'pe-301-2026'];
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : DEFAULT_SAVED;
  } catch {
    return DEFAULT_SAVED;
  }
}

let snapshot = read();

function write(next: string[]) {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode): keep in-memory state only.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useSavedTenders() {
  const saved = useSyncExternalStore(subscribe, () => snapshot);
  const isSaved = useCallback((id: string) => saved.includes(id), [saved]);
  const toggle = useCallback((id: string) => write(snapshot.includes(id) ? snapshot.filter((item) => item !== id) : [...snapshot, id]), []);
  return { saved, isSaved, toggle };
}
