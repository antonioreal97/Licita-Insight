export type SavedTendersView = 'list' | 'board' | 'calendar';

export const SAVED_TENDERS_VIEWS: { value: SavedTendersView; label: string }[] = [
  { value: 'list', label: 'Lista' },
  { value: 'board', label: 'Quadro' },
  { value: 'calendar', label: 'Calendário' },
];

/** `?view=board|calendar`; anything else is the list, the default. */
export const parseView = (value: string | null): SavedTendersView => (value === 'board' || value === 'calendar' ? value : 'list');

/** The list keeps no `view` param, so its old links (`?etapa=`) stay as they were. */
export const viewHref = (view: SavedTendersView) => (view === 'list' ? '/saved-tenders' : `/saved-tenders?view=${view}`);
