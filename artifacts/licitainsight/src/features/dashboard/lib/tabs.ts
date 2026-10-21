export type DashboardTab = 'resumo' | 'mural';

/** `?aba=mural`; anything else is the summary. */
export const parseDashboardTab = (value: string | null): DashboardTab => (value === 'mural' ? 'mural' : 'resumo');
