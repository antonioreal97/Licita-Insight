import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/hooks/use-session';
import { optionalStorageAllowed } from '@/features/privacy/cookie-consent';
import { emptyProgress, TRIAGE_GOAL, triageDay, type TriageProgress } from './triage-state';
const STORAGE_KEY = 'pardal-triage-v1';
function readProgress(user: string, day: string): TriageProgress {
  try {
    if (!optionalStorageAllowed()) return emptyProgress();
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
    if (stored?.user === user && stored.day === day && Array.isArray(stored.progress?.reviewed)
      && stored.progress.reviewed.every((id: unknown) => typeof id === 'string') && stored.progress.reviewed.length <= TRIAGE_GOAL
      && Number.isInteger(stored.progress.interested) && stored.progress.interested >= 0
      && Number.isInteger(stored.progress.skipped) && stored.progress.skipped >= 0
      && stored.progress.interested + stored.progress.skipped <= stored.progress.reviewed.length) return stored.progress;
  } catch (error) {
    console.error('[triage] Não foi possível ler o progresso da triagem.', error);
  }
  return emptyProgress();
}
export function useTriageProgress() {
  const { user } = useSession();
  const client = useQueryClient();
  const [day, setDay] = useState(triageDay);
  useEffect(() => { const timer = window.setInterval(() => setDay(triageDay()), 60_000); return () => clearInterval(timer); }, []);
  const userId = user?.id ?? '';
  const key = ['me', 'triage', userId, day];
  const query = useQuery({ queryKey: key, queryFn: () => readProgress(userId, day), initialData: () => readProgress(userId, day), staleTime: Infinity, gcTime: Infinity });
  const update = (progress: TriageProgress) => {
    client.setQueryData(key, progress);
    try {
      if (optionalStorageAllowed()) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ user: userId, day, progress }));
    } catch (error) {
      console.error('[triage] Não foi possível guardar o progresso da triagem; ele segue só nesta página.', error);
    }
  };
  return { progress: query.data, update };
}
