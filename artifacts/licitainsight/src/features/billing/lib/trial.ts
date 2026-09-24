import type { BillingResponse } from '@/api';
import { parseApiDate } from '@/lib/format';

/** The shell warns (amber badge, top banner) from this many days left. */
export const TRIAL_WARNING_DAYS = 3;

/** Where every "assine" link points: the billing section of Configurações. */
export const BILLING_HREF = '/settings#assinatura';

const saoPauloDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** `YYYY-MM-DD` of `date` in São Paulo. */
export const saoPauloDate = (date: Date = new Date()) => saoPauloDay.format(date);

/** Calendar days from today to the trial end, in São Paulo time (0 = ends today). `null` when the date is missing or invalid. */
export function trialDaysLeft(trialEndsAt: string | null | undefined, now: Date = new Date()): number | null {
  const end = parseApiDate(trialEndsAt ?? null);
  if (!end) return null;
  const days = (Date.parse(saoPauloDate(end)) - Date.parse(saoPauloDate(now))) / 86_400_000;
  return Math.max(0, Math.round(days));
}

/** "hoje", "1 dia", "5 dias". */
export const daysLabel = (days: number) => (days === 0 ? 'hoje' : days === 1 ? '1 dia' : `${days} dias`);

export type TrialState =
  { kind: 'active'; endsAt: string | null; daysLeft: number | null; ending: boolean } | { kind: 'expired'; endsAt: string } | { kind: 'none' };

/**
 * Trial as the UI shows it. Works with APIs that don't send `source`/`trialEndsAt` yet (→ `none`).
 * `expired` only for accounts that never paid (status none/pending): a lapsed subscription keeps its own copy.
 */
export function trialState(billing: BillingResponse, now: Date = new Date()): TrialState {
  const endsAt = billing.trialEndsAt ?? null;
  if (billing.source === 'trial') {
    const daysLeft = trialDaysLeft(endsAt, now);
    return { kind: 'active', endsAt, daysLeft, ending: daysLeft !== null && daysLeft <= TRIAL_WARNING_DAYS };
  }
  const end = parseApiDate(endsAt);
  if (!billing.entitled && endsAt && end && end <= now && (billing.status === 'none' || billing.status === 'pending')) return { kind: 'expired', endsAt };
  return { kind: 'none' };
}
