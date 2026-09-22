import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { searchService } from '@/services/search-service';

export const MIN_SUGGESTION_CHARS = 2;

/** Debounced autocomplete. Returns an empty list below MIN_SUGGESTION_CHARS without hitting the API. */
export function useSearchSuggestions(input: string, { debounceMs = 180, limit = 8 } = {}) {
  const [debounced, setDebounced] = useState(input.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [input, debounceMs]);

  const enabled = debounced.length >= MIN_SUGGESTION_CHARS;
  const query = useQuery({
    queryKey: queryKeys.suggestions(debounced),
    queryFn: ({ signal }) => searchService.suggest(debounced, limit, signal),
    enabled,
    staleTime: 60_000,
    // Avoid the list collapsing between keystrokes; the previous list stays until the next one arrives.
    placeholderData: keepPreviousData,
    select: (response) => response.suggestions,
  });
  return { ...query, isDebouncing: debounced !== input.trim(), enabled };
}
