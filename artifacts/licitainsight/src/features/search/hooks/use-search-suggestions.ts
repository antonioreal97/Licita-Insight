import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { searchService } from '@/services/search-service';

const MIN_CHARS = 2;

/** Debounced autocomplete. Returns an empty list below MIN_CHARS without hitting the API. */
export function useSearchSuggestions(input: string, { debounceMs = 180, limit = 8 } = {}) {
  const [debounced, setDebounced] = useState(input.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), debounceMs);
    return () => clearTimeout(timer);
  }, [input, debounceMs]);

  return useQuery({
    queryKey: queryKeys.suggestions(debounced),
    queryFn: ({ signal }) => searchService.suggest(debounced, limit, signal),
    enabled: debounced.length >= MIN_CHARS,
    staleTime: 60_000,
    select: (response) => response.suggestions,
  });
}
