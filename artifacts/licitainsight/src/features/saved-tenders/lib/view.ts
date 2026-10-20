/** The board lives as the "Mural" tab of Visão geral; the calendar has its own page in the sidebar. */
export const MURAL_HREF = '/dashboard?aba=mural';
export const CALENDAR_HREF = '/calendario';

/** Old `/saved-tenders?view=board|calendar` links (help, e-mails, bookmarks) land on the new homes. */
export const legacyViewRedirect = (value: string | null): string | null =>
  value === 'board' ? MURAL_HREF : value === 'calendar' ? CALENDAR_HREF : null;
