import type { OpportunityApplication, OpportunitySummary } from '@/api';

/** "na"/"no" and "pela"/"pelo" before the platform name, from its article. */
const contraction = (article: OpportunityApplication['article'], feminine: string, masculine: string) =>
  article === 'a' ? feminine : masculine;

/** Main action of the detail page: "Inscrever-se na Plataforma Sucupira". */
export const applicationActionText = (application: OpportunityApplication): string =>
  application.label ? `Inscrever-se ${contraction(application.article, 'na', 'no')} ${application.label}` : 'Abrir o link de inscrição';

/** Discreet badge of a list row: "Inscrição pela Plataforma Sucupira". Only for a known platform. */
export const applicationBadgeText = (application: OpportunityApplication | null | undefined): string | null =>
  application?.label ? `Inscrição ${contraction(application.article, 'pela', 'pelo')} ${application.label}` : null;

/** Where the link came from, in the words of the notice. */
export const applicationOriginText = (application: OpportunityApplication, sourceUrl: string | null): string => {
  if (application.origin === 'document') {
    return application.documentTitle ? `Indicado no edital: ${application.documentTitle}` : 'Indicado no edital.';
  }
  return application.url === sourceUrl ? 'A inscrição é feita na própria página da chamada, na fonte.' : 'Indicado na página da chamada, na fonte.';
};

export const linkHost = (value: string): string | null => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/** Text when no link was found: the notice was read and says none, or it was not read yet. */
export const NO_APPLICATION_TEXT = 'O edital não indica um link de inscrição. Consulte o documento oficial.';
export const UNREAD_APPLICATION_TEXT = 'Consulte o edital na fonte para saber onde se inscrever.';

export const missingApplicationText = (opportunity: Pick<OpportunitySummary, 'applicationCheckedAt'>): string =>
  opportunity.applicationCheckedAt ? NO_APPLICATION_TEXT : UNREAD_APPLICATION_TEXT;

export type RegistrationDates = {
  from: string | null;
  to: string | null;
  /** True when the dates were read from the notice because the source publishes none. */
  fromNotice: boolean;
};

/** The registration dates to show: the source's own, else the notice's. */
export const registrationDates = (
  opportunity: Pick<OpportunitySummary, 'registrationFrom' | 'registrationTo' | 'noticeDates'>,
): RegistrationDates => {
  if (opportunity.registrationFrom || opportunity.registrationTo || !opportunity.noticeDates) {
    return { from: opportunity.registrationFrom, to: opportunity.registrationTo, fromNotice: false };
  }
  return { from: opportunity.noticeDates.registrationFrom, to: opportunity.noticeDates.registrationTo, fromNotice: true };
};

export const NOTICE_DATE_NOTE = 'conforme o edital';

const clock = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' });

/** True when a notice closes at a stated hour ("até as 18h"), not at the end of the day. */
export const closesAtStatedHour = (value: string | null): boolean => {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && clock.format(date) !== '23:59:59';
};
