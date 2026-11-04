import type { RecommendationDismissReason, TenderSummary } from '@/api';
export const TRIAGE_GOAL = 10;
export const DISMISS_LABELS: Record<RecommendationDismissReason, string> = {
  not_offering: 'Não faço isso', region: 'Fora da minha região', value: 'Valor fora da minha faixa', deadline: 'Prazo curto',
};
export type TriageAction = 'interest' | 'dismiss' | 'skip';
export type TriageProgress = { reviewed: string[]; interested: number; skipped: number };
export const emptyProgress = (): TriageProgress => ({ reviewed: [], interested: 0, skipped: 0 });
export const triageDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
export function advanceProgress(progress: TriageProgress, id: string, action: TriageAction): TriageProgress {
  if (progress.reviewed.includes(id) || progress.reviewed.length >= TRIAGE_GOAL) return progress;
  return { reviewed: [...progress.reviewed, id], interested: progress.interested + Number(action === 'interest'), skipped: progress.skipped + Number(action === 'skip') };
}
export function shortcutAction(key: string, interactive: boolean, modified = false): TriageAction | null {
  if (interactive || modified) return null;
  return ({ ArrowLeft: 'dismiss', ArrowRight: 'interest', ArrowDown: 'skip' } as const)[key as 'ArrowLeft'] ?? null;
}
export function swipeAction(dx: number, dy: number): TriageAction | null {
  if (Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? 'interest' : 'dismiss';
}
export function suggestedExclusion(tender: TenderSummary): string {
  const generic = new Set(['contratação', 'contratacao', 'serviços', 'servicos', 'serviço', 'servico', 'fornecimento', 'aquisição', 'aquisicao', 'empresa', 'especializada', 'registro', 'preços', 'precos', 'para', 'com']);
  return (tender.displayTitle || tender.title).toLocaleLowerCase('pt-BR').split(/[^\p{L}\p{N}-]+/u).find(word => word.length >= 4 && !generic.has(word)) ?? '';
}
export function dismissalMessage(reason: RecommendationDismissReason | undefined, tender: TenderSummary): string {
  if (reason === 'region' && tender.location.state) return `Entendi: menos editais em ${tender.location.state} nas próximas recomendações.`;
  if (reason === 'value' && tender.estimatedValue && !tender.estimatedValueFlag) return 'Entendi: menos editais com valor próximo a este nas próximas recomendações.';
  if (reason === 'deadline') return 'Entendi: menos editais com prazo nos próximos 3 dias.';
  if (reason === 'not_offering') return 'Entendi: menos editais sobre este serviço nas próximas recomendações.';
  return 'Edital dispensado. Suas escolhas ajudam a ajustar as próximas recomendações.';
}

/** Copy of the dashboard triage entry: count is already gated to profile + region. */
export function triageEntryCopy(count: number, reviewedCount: number): { title: string; subtitle: string } {
  if (!count) {
    return {
      title: 'Confira sua triagem de hoje',
      subtitle: `Triagem de hoje: ${reviewedCount} de ${TRIAGE_GOAL}.`,
    };
  }
  const title =
    count === 1
      ? '1 edital na sua região para triar'
      : `${count} editais na sua região para triar`;
  const subtitle = reviewedCount
    ? `Triagem de hoje: ${reviewedCount} de ${TRIAGE_GOAL}.`
    : 'Combinam com o que você oferece. Interessa ou não? Suas escolhas melhoram a seleção.';
  return { title, subtitle };
}
