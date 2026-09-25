import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'wouter';
import { isApiError } from '@/api';
import { Button } from '@/components/common/action-button';
import { Switch } from '@/components/ui/switch';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../hooks/use-notification-preferences';

const alertRows = [
  {
    name: 'Novos resultados',
    desc: 'Ative alertas em uma busca salva para saber quando surgirem editais novos.',
    href: '/saved-searches',
    cta: 'Buscas salvas',
  },
  {
    name: 'Mudanças em editais',
    desc: 'Monitore um edital para ser avisado quando prazo, status, valor ou documentos mudarem.',
    href: '/monitoring',
    cta: 'Monitoramento',
  },
];

const errorBox = 'rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground';

function withRef(message: string, error: unknown) {
  return isApiError(error) && error.requestId ? `${message} (ref. ${error.requestId})` : message;
}

function saveErrorMessage(error: unknown) {
  if (isApiError(error) && error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. A preferência voltou ao valor anterior.';
  return withRef('Não foi possível salvar. A preferência voltou ao valor anterior. Tente de novo.', error);
}

function PreferenceRow({ id, title, children, control }: { id: string; title: string; children: ReactNode; control: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <span className="min-w-0 flex-1">
        <label htmlFor={id} className="block type-ui font-medium">
          {title}
        </label>
        <span id={`${id}-desc`} className="mt-0.5 block type-meta text-muted-foreground">
          {children}
        </span>
      </span>
      {control}
    </div>
  );
}

/** E-mail preferences (CODEX_HANDOFF-009). Outside the subscription gate: any signed-in account can turn e-mail on or off. */
export function NotificationPreferencesSection() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const billing = useBilling();
  const email = prefs.data?.email;

  return (
    <section
      id="notificacoes"
      aria-labelledby="settings-notifications"
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7"
      data-testid="section-notification-prefs"
    >
      <h2 id="settings-notifications" className="type-section">
        Notificações
      </h2>
      <p className="mt-1 type-meta text-muted-foreground">
        Os avisos aparecem no sino, no topo da página, com ou sem e-mail. Por e-mail, você escolhe o que recebe.
      </p>

      {prefs.isError ? (
        <div role="alert" data-testid="text-notification-prefs-error" className={`mt-5 flex flex-wrap items-center justify-between gap-3 ${errorBox}`}>
          <span>{withRef('Não foi possível carregar suas preferências de e-mail.', prefs.error)}</span>
          <Button variant="outline" size="sm" data-testid="button-retry-notification-prefs" onClick={() => prefs.refetch()}>
            <RefreshCw size={14} aria-hidden />
            Tentar novamente
          </Button>
        </div>
      ) : !prefs.data || !email ? (
        <p className="mt-5 type-meta text-muted-foreground">Carregando preferências…</p>
      ) : (
        <>
          <p data-testid="text-notification-email" className="mt-5 type-ui">
            E-mails vão para <span className="font-semibold">{prefs.data.emailAddress}</span>, o e-mail da sua conta Google.
          </p>
          {billing.data && !billing.data.entitled && (
            <p
              role="note"
              data-testid="text-notification-no-access"
              className="mt-3 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground"
            >
              Enviamos e-mails só enquanto a conta tem acesso (teste ou assinatura). Suas escolhas ficam guardadas.{' '}
              <Link href={BILLING_HREF} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring">
                Ver assinatura
              </Link>
            </p>
          )}
          <div className="mt-5 divide-y divide-border">
            <PreferenceRow
              id="switch-email-digest"
              title="Resumo diário por e-mail (07:00)"
              control={
                <Switch
                  id="switch-email-digest"
                  aria-describedby="switch-email-digest-desc"
                  data-testid="switch-email-digest"
                  checked={email.digest === 'daily'}
                  onCheckedChange={(checked) => update.mutate({ email: { digest: checked ? 'daily' : 'off' } })}
                  className="mt-0.5"
                />
              }
            >
              Um e-mail por dia, às 07:00 (horário de Brasília), com os avisos novos: mudanças nos editais monitorados e editais novos das buscas salvas com
              alertas. Sem novidade, não enviamos.
            </PreferenceRow>
            <PreferenceRow
              id="switch-email-immediate"
              title="Avisos imediatos para mudanças críticas em editais monitorados"
              control={
                <Switch
                  id="switch-email-immediate"
                  aria-describedby="switch-email-immediate-desc"
                  data-testid="switch-email-immediate"
                  checked={email.immediateCritical}
                  onCheckedChange={(checked) => update.mutate({ email: { immediateCritical: checked } })}
                  className="mt-0.5"
                />
              }
            >
              Crítico é prazo alterado ou edital suspenso ou revogado. O e-mail sai logo após detectarmos a mudança, sem esperar o resumo.
            </PreferenceRow>
            <PreferenceRow
              id="switch-profile-alerts"
              title="Editais com alta aderência ao perfil da empresa"
              control={
                <Switch
                  id="switch-profile-alerts"
                  aria-describedby="switch-profile-alerts-desc"
                  data-testid="switch-profile-alerts"
                  checked={prefs.data.profileAlerts}
                  onCheckedChange={(checked) => update.mutate({ profileAlerts: checked })}
                  className="mt-0.5"
                />
              }
            >
              Inclui no sino e no resumo diário os editais novos classificados com alta aderência. Requer um perfil da empresa e acesso ativo.
            </PreferenceRow>
          </div>
          {update.isError && (
            <p role="alert" data-testid="text-notification-prefs-save-error" className={`mt-4 ${errorBox}`}>
              {saveErrorMessage(update.error)}
            </p>
          )}
        </>
      )}

      <h3 className="mt-7 type-ui font-semibold">O que gera avisos</h3>
      <div className="mt-3 divide-y divide-border">
        {alertRows.map(({ name, desc, href, cta }, index) => (
          <div key={name} data-testid={`row-notification-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
            <span className="min-w-0 flex-1">
              <span className="block type-ui font-medium">{name}</span>
              <span className="mt-0.5 block type-meta text-muted-foreground">{desc}</span>
            </span>
            <Link href={href} className="type-ui font-semibold text-primary hover:underline">
              {cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
