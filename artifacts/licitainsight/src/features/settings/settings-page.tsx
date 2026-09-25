import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, LogOut } from 'lucide-react';
import { useSearch } from 'wouter';
import { useLocationProperty } from 'wouter/use-browser-location';
import { isApiError, type BillingResponse } from '@/api';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { ErrorState } from '@/components/common/query-states';
import { UserAvatar } from '@/components/app-shell';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { daysLabel, trialEndPhrase, trialState, type TrialState } from '@/features/billing/lib/trial';
import { useSession, useSignOut } from '@/features/auth/hooks/use-session';
import { toast } from '@/hooks/use-toast';
import { formatCurrencyPrecise, formatDate } from '@/lib/format';
import { accountService } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';
import { CompanyProfileSection } from '@/features/company-profile/components/company-profile-section';
import { AccountDataSection } from './components/account-data-section';
import { NotificationPreferencesSection } from './components/notification-preferences-section';
import { useNotificationPreferences } from './hooks/use-notification-preferences';

// Profile comes from the Google session (read-only). Sections without an `id` have no settings yet.
const sections = [
  { name: 'Assinatura', id: 'assinatura' },
  { name: 'Perfil e conta', id: 'perfil' },
  { name: 'Perfil da empresa', id: 'perfil-empresa' },
  { name: 'Notificações', id: 'notificacoes' },
  { name: 'Seus dados', id: 'seus-dados' },
  { name: 'Preferências de busca', id: null },
  { name: 'Aparência', id: null },
];

export default function SettingsPage() {
  // Rendered inside <RequireAuth>, so the session is known here.
  const { user } = useSession();
  const signOut = useSignOut();
  // Links like "/settings#assinatura" (shell badge, trial banner, notifications): wouter doesn't scroll to the hash on pushState.
  // Scroll again once the sections above settle: "Carregando…" placeholders grow and would push the anchor down.
  const hash = useLocationProperty(() => window.location.hash);
  const billingPending = useBilling().isPending;
  const prefsPending = useNotificationPreferences().isPending;
  useEffect(() => {
    if (hash.length > 1) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' });
  }, [hash, billingPending, prefsPending]);

  return (
    <>
      <PageTitle eyebrow="workspace" title="Configurações" description="Sua conta e como o LicitAI avisa você." />
      <p
        role="note"
        data-testid="text-settings-readonly"
        className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-muted-foreground"
      >
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
        Nome, e-mail e foto vêm da sua conta Google e não são editados aqui. Preferências de busca e aparência ainda não são configuráveis.
      </p>
      <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
        {/* In-page anchors, not tabs: the page is short enough to scroll; later sections are labelled as coming later. */}
        {/* min-w-0: a grid item sizes to its content, so without it the chip row widens the page on mobile. */}
        <nav aria-label="Seções" className="min-w-0">
          <ul className="flex gap-2 overflow-x-auto xl:block xl:space-y-1">
            {sections.map(({ name, id }, index) => (
              <li key={name} className="shrink-0">
                {id ? (
                  <a
                    href={`#${id}`}
                    data-testid={`button-settings-${index}`}
                    className="flex whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold text-foreground transition-colors duration-fast ease-standard hover:bg-muted focus-visible:focus-ring"
                  >
                    {name}
                  </a>
                ) : (
                  <span
                    data-testid={`button-settings-${index}`}
                    className="flex items-center gap-2 whitespace-nowrap px-3 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    {name}
                    <span className="rounded-xs bg-secondary px-1 py-px type-label font-bold text-secondary-foreground">em breve</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="space-y-6">
          <BillingSection />
          <section id="perfil" aria-labelledby="settings-profile" className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7">
            <h2 id="settings-profile" className="type-section">
              Perfil e conta
            </h2>
            {user && (
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <UserAvatar user={user} className="size-14" />
                <div className="min-w-0 flex-1">
                  <div data-testid="text-settings-name" className="truncate type-body font-semibold">
                    {user.name ?? 'Nome não informado'}
                  </div>
                  <div data-testid="text-settings-email" className="truncate type-ui text-muted-foreground">
                    {user.email}
                  </div>
                  <div className="mt-1 type-meta text-muted-foreground">
                    Conta Google · desde <span className="type-data">{formatDate(user.createdAt)}</span>
                  </div>
                </div>
                <Button variant="outline" data-testid="button-settings-sign-out" loading={signOut.isPending} onClick={() => signOut.mutate()}>
                  <LogOut size={14} aria-hidden />
                  Sair
                </Button>
              </div>
            )}
          </section>
          <CompanyProfileSection />
          <NotificationPreferencesSection />
          <AccountDataSection />
        </div>
      </div>
    </>
  );
}

function billingCopy(billing: BillingResponse): string {
  const until = billing.currentPeriodEnd ? formatDate(billing.currentPeriodEnd) : null;
  switch (billing.status) {
    case 'active':
      return until ? `Assinatura ativa até ${until}.` : 'Assinatura ativa.';
    case 'pending':
      return 'Pagamento pendente. Conclua no Asaas para liberar salvar e monitorar.';
    case 'past_due':
      return 'Pagamento em atraso. A assinatura está pausada até a regularização.';
    case 'canceled':
      return billing.entitled && until ? `Cancelada. O acesso segue até ${until}.` : 'Assinatura encerrada.';
    default:
      return 'Você ainda não assinou. A busca e o detalhe do edital continuam abertos.';
  }
}

function checkoutLabel(billing: BillingResponse, trial: TrialState): string {
  if (billing.status === 'pending') return 'Continuar pagamento';
  if (billing.status === 'past_due') return 'Regularizar pagamento';
  return trial.kind === 'active' ? 'Assinar agora' : 'Assinar';
}

function trialCopy(trial: Extract<TrialState, { kind: 'active' }>): string {
  if (!trial.endsAt || trial.daysLeft === null) return 'Você está no período de teste, com acesso completo.';
  if (trial.daysLeft === 0)
    return `Seu período de teste termina ${trialEndPhrase(trial.endsAt)}. Até lá, o acesso é completo. Assine para não perder o acesso.`;
  return `Período de teste até ${formatDate(trial.endsAt)} (faltam ${daysLabel(trial.daysLeft)}), com acesso completo. Assine quando quiser para não perder o acesso.`;
}

function billingErrorMessage(error: unknown, fallback: string) {
  if (isApiError(error) && error.code === 'BILLING_UNAVAILABLE') return error.message;
  return fallback;
}

function BillingSection() {
  const search = useSearch();
  const billingFlag = new URLSearchParams(search).get('billing');
  const billing = useBilling();
  const plan = usePublicPlan();
  const queryClient = useQueryClient();
  const paid = billing.data?.source === 'subscription' || (billing.data?.entitled === true && !billing.data.source);

  useEffect(() => {
    // Back from Asaas: poll until the webhook lands. A trial or dev access is already `entitled`, so wait for a paid source.
    if (billingFlag !== 'return' || paid) return;
    const timer = window.setInterval(() => {
      void billing.refetch();
    }, 2000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 20_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [paid, billing.refetch, billingFlag]);

  const checkout = useMutation({
    mutationFn: () => accountService.startCheckout(),
    onSuccess: ({ url }) => {
      if (!url.startsWith('https://')) {
        console.error('[billing] Checkout URL rejeitada.');
        toast({ variant: 'destructive', title: 'Pagamento indisponível', description: 'O link de pagamento não é válido.' });
        return;
      }
      window.location.assign(url);
    },
    onError: (error) => {
      console.error('[billing] Falha ao abrir o checkout.', error);
      toast({
        variant: 'destructive',
        title: 'Pagamento indisponível',
        description: billingErrorMessage(error, 'Não foi possível abrir o pagamento. Tente de novo.'),
      });
    },
  });

  const cancel = useMutation({
    mutationFn: () => accountService.cancelBilling(),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.me.billing, next);
      toast({
        title: 'Assinatura cancelada',
        description: next.entitled ? 'O acesso segue até o fim do período já pago.' : 'A assinatura foi encerrada.',
      });
    },
    onError: (error) => {
      console.error('[billing] Falha ao cancelar a assinatura.', error);
      toast({
        variant: 'destructive',
        title: 'Não foi possível cancelar',
        description: billingErrorMessage(error, 'Tente de novo.'),
      });
    },
  });

  const trial: TrialState = billing.data ? trialState(billing.data) : { kind: 'none' };
  // The price comes from the API only (public plan first, then billing); nothing shown when it isn't configured.
  const price = plan.data?.monthlyBrl ?? billing.data?.monthlyBrl ?? null;
  const showCheckout = billing.data !== undefined && (!billing.data.entitled || trial.kind === 'active' || billing.data.source === 'dev');
  // During a trial with days to spare the checkout is secondary; once it ends (or is about to) it is the main action.
  const checkoutPrimary = billing.data !== undefined && (!billing.data.entitled || (trial.kind === 'active' && trial.ending));

  return (
    <section
      id="assinatura"
      aria-labelledby="settings-billing"
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7"
      data-testid="section-billing"
    >
      <h2 id="settings-billing" className="type-section">
        Assinatura
      </h2>
      <p className="mt-1 type-meta text-muted-foreground">
        Um plano mensal libera salvar editais, guardar buscas, receber alertas no app e por e-mail e ver as chamadas culturais.
        {price !== null ? ` ${formatCurrencyPrecise(price)} por mês.` : ''}
      </p>
      {billingFlag === 'required' && trial.kind !== 'expired' && (
        <p role="status" data-testid="text-billing-required" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground">
          Assine para salvar e acompanhar editais.
        </p>
      )}
      {billingFlag === 'return' && (
        <p role="status" data-testid="text-billing-return" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground">
          {paid ? 'Pagamento confirmado.' : 'Confirmando o pagamento…'}
        </p>
      )}
      {billing.isError ? (
        <div className="mt-5">
          <ErrorState error={billing.error} onRetry={() => billing.refetch()} />
        </div>
      ) : !billing.data ? (
        <p className="mt-5 type-meta text-muted-foreground">Carregando assinatura…</p>
      ) : (
        <>
          {trial.kind === 'expired' ? (
            <div
              data-testid="text-trial-expired"
              className="mt-5 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-warning-subtle-foreground"
            >
              <p className="type-ui font-semibold">
                {plan.data ? `Seu teste de ${plan.data.trialDays} dias terminou` : 'Seu teste terminou'} {trialEndPhrase(trial.endsAt)}.
              </p>
              <p className="mt-0.5 type-meta">
                Assine para voltar a salvar e monitorar editais, receber alertas no app e por e-mail e ver as chamadas culturais. Seus editais e buscas salvos continuam guardados
                na sua conta.
              </p>
            </div>
          ) : (
            <p data-testid="text-billing-status" className="mt-5 type-ui text-foreground">
              {trial.kind === 'active'
                ? trialCopy(trial)
                : billing.data.source === 'dev' && billing.data.status === 'none'
                  ? 'Acesso de desenvolvimento (BILLING_DEV_ENTITLED). Não é uma assinatura paga.'
                  : billingCopy(billing.data)}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {showCheckout && (
              <Button
                variant={checkoutPrimary ? 'primary' : 'outline'}
                size={trial.kind === 'expired' ? 'lg' : 'md'}
                data-testid="button-billing-checkout"
                loading={checkout.isPending}
                onClick={() => checkout.mutate()}
              >
                {checkoutLabel(billing.data, trial)}
              </Button>
            )}
            {billing.data.canCancel && (
              <Button variant="outline" data-testid="button-billing-cancel" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancelar assinatura
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
