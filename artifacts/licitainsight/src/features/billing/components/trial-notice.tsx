import { useState } from 'react';
import { Clock, X } from 'lucide-react';
import { Link } from 'wouter';
import { useSession } from '@/features/auth/hooks/use-session';
import { optionalStorageAllowed } from '@/features/privacy/cookie-consent';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useBilling } from '../hooks/use-billing';
import { BILLING_HREF, daysLabel, saoPauloDate, trialState } from '../lib/trial';

/** Header badge: "Teste · N dias" during the trial (amber in the last days), "Dev" for BILLING_DEV_ENTITLED. Nothing for a paid plan. */
export function AccessBadge() {
  const { status } = useSession();
  const billing = useBilling();
  if (status !== 'authenticated' || !billing.data) return null;

  if (billing.data.source === 'dev') {
    return (
      <Link
        href={BILLING_HREF}
        data-testid="badge-access-dev"
        title="Acesso de desenvolvimento (BILLING_DEV_ENTITLED). Não é uma assinatura paga."
        className="rounded-full border border-border bg-muted px-2 py-0.5 type-label font-bold text-muted-foreground hover:text-foreground focus-visible:focus-ring"
      >
        Dev
      </Link>
    );
  }

  const trial = trialState(billing.data);
  if (trial.kind !== 'active') return null;
  const label = trial.daysLeft === null ? 'Teste' : `Teste · ${daysLabel(trial.daysLeft)}`;
  return (
    <Link
      href={BILLING_HREF}
      data-testid="badge-access-trial"
      aria-label={
        trial.daysLeft === null
          ? 'Período de teste. Ver assinatura'
          : `Período de teste, termina ${trial.daysLeft === 0 ? 'hoje' : `em ${daysLabel(trial.daysLeft)}`}. Ver assinatura`
      }
      className={cn(
        'whitespace-nowrap rounded-full px-2.5 py-0.5 type-label font-bold transition-colors duration-fast ease-standard focus-visible:focus-ring',
        trial.ending
          ? 'bg-warning-subtle text-warning-subtle-foreground hover:bg-warning-subtle/80'
          : 'bg-primary-subtle text-primary-subtle-foreground hover:bg-primary-subtle/80',
      )}
    >
      {label}
    </Link>
  );
}

const DISMISS_KEY = 'licita-trial-banner-dismissed';

function readDismissedOn(): string | null {
  if (!optionalStorageAllowed()) return null;
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch (error) {
    console.error('[billing] Não foi possível ler o aviso de teste dispensado.', error);
    return null;
  }
}

function writeDismissedOn(day: string) {
  // Without cookie consent the dismissal only lasts for this page load.
  if (!optionalStorageAllowed()) return;
  try {
    localStorage.setItem(DISMISS_KEY, day);
  } catch (error) {
    console.error('[billing] Não foi possível guardar o aviso de teste dispensado.', error);
  }
}

/** Top banner in the last days of the trial. Dismissing hides it until the next day (São Paulo). */
export function TrialEndingBanner() {
  const { status } = useSession();
  const billing = useBilling();
  const [dismissedOn, setDismissedOn] = useState(readDismissedOn);
  if (status !== 'authenticated' || !billing.data) return null;

  const trial = trialState(billing.data);
  const today = saoPauloDate();
  if (trial.kind !== 'active' || !trial.ending || trial.daysLeft === null || dismissedOn === today) return null;

  return (
    <div
      role="status"
      data-testid="banner-trial-ending"
      className="flex items-center gap-3 border-b border-warning/40 bg-warning-subtle px-4 py-2.5 text-warning-subtle-foreground sm:px-8"
    >
      <Clock size={16} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <p className="min-w-0 flex-1 type-ui">
        <span className="font-semibold">
          {trial.daysLeft === 0 ? 'Seu teste termina hoje' : `Seu teste termina em ${daysLabel(trial.daysLeft)}`}
          {trial.endsAt ? ` (${formatDate(trial.endsAt)})` : ''}.
        </span>{' '}
        Assine para continuar salvando, monitorando editais e recebendo alertas.{' '}
        <Link href={BILLING_HREF} data-testid="link-trial-banner-subscribe" className="font-semibold underline underline-offset-2 focus-visible:focus-ring">
          Ver assinatura
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dispensar aviso até amanhã"
        data-testid="button-dismiss-trial-banner"
        onClick={() => {
          writeDismissedOn(today);
          setDismissedOn(today);
        }}
        className="-mr-1 shrink-0 rounded-md p-1.5 transition-colors duration-fast ease-standard hover:bg-warning/15 focus-visible:focus-ring"
      >
        <X size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}
