import { CircleAlert, CircleCheck, RefreshCw } from 'lucide-react';
import { Link, useSearch } from 'wouter';
import { isApiError, type EmailPreferences, type UnsubscribeScope } from '@/api';
import { BrandName } from '@/components/brand-icon';
import { Button } from '@/components/common/action-button';
import { useUnsubscribe } from '@/features/settings/hooks/use-notification-preferences';

const PREFERENCES_HREF = '/settings#notificacoes';

const scopeCopy: Record<UnsubscribeScope, string> = {
  all: 'Você deixará de receber todos os e-mails de alerta do Pardal Digital: o resumo diário e os avisos imediatos.',
  digest: 'Você deixará de receber o resumo diário por e-mail.',
  immediate: 'Você deixará de receber os avisos imediatos de mudanças críticas (prazo alterado, edital suspenso ou revogado).',
};

const parseScope = (value: string | null): UnsubscribeScope => (value === 'digest' || value === 'immediate' ? value : 'all');

function resultCopy(email: EmailPreferences) {
  const digest = email.digest === 'daily';
  if (!digest && !email.immediateCritical) return 'Você não receberá mais e-mails de alerta do Pardal Digital.';
  if (digest) return 'Você não receberá mais os avisos imediatos. O resumo diário das 07:00 continua ligado.';
  return 'Você não receberá mais o resumo diário. Os avisos imediatos de mudanças críticas continuam ligados.';
}

const errorBox = 'flex gap-3 rounded-lg border border-destructive-subtle-border bg-destructive-subtle p-4 text-destructive-subtle-foreground';
const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

/** Public page behind the e-mail footer link. Never unsubscribes on load (mail scanners prefetch links): the user confirms. */
export default function UnsubscribePage() {
  const params = new URLSearchParams(useSearch());
  const token = params.get('token');
  const scope = parseScope(params.get('scope'));
  const unsubscribe = useUnsubscribe();
  const invalidLink = !token || (isApiError(unsubscribe.error) && unsubscribe.error.code === 'INVALID_PARAMETER');

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <main id="conteudo" tabIndex={-1} data-testid="page-unsubscribe" className="mx-auto w-full max-w-[480px] px-4 py-12 outline-none sm:py-20">
        <Link href="/" className="mb-12 flex items-center gap-2.5">
          <BrandName />
        </Link>
        <div className="mb-3 type-eyebrow font-bold text-primary">e-mails</div>
        <h1 className="text-3xl font-semibold tracking-display">Descadastro de e-mails</h1>

        {unsubscribe.isSuccess ? (
          <div role="status" data-testid="text-unsubscribe-success" className="mt-6 flex gap-3 rounded-lg border border-border bg-card p-4">
            <CircleCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="type-ui font-semibold">Descadastro confirmado.</p>
              <p className="mt-0.5 type-meta text-muted-foreground">{resultCopy(unsubscribe.data.email)} Os avisos no sino, dentro do app, continuam.</p>
            </div>
          </div>
        ) : invalidLink ? (
          <div role="alert" data-testid="text-unsubscribe-invalid" className={`mt-6 ${errorBox}`}>
            <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
            <div>
              <p className="type-ui font-semibold">Este link de descadastro não é válido.</p>
              <p className="mt-0.5 type-meta">
                Ele pode ter sido copiado pela metade. Use o link completo de um e-mail do Pardal Digital ou desligue os e-mails nas suas preferências.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 type-body text-muted-foreground">{scopeCopy[scope]} Os avisos no sino, dentro do app, continuam.</p>
            {unsubscribe.isError && (
              <div role="alert" data-testid="text-unsubscribe-error" className={`mt-6 ${errorBox}`}>
                <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
                <div>
                  <p className="type-ui font-semibold">
                    {isApiError(unsubscribe.error) && unsubscribe.error.code === 'NETWORK_ERROR'
                      ? 'Sem conexão com o servidor.'
                      : 'Não foi possível confirmar o descadastro.'}
                  </p>
                  <p className="mt-0.5 type-meta">
                    Nada mudou. Tente de novo em instantes.
                    {isApiError(unsubscribe.error) && unsubscribe.error.requestId ? ` (ref. ${unsubscribe.error.requestId})` : ''}
                  </p>
                </div>
              </div>
            )}
            <Button
              size="lg"
              className="mt-6 w-full"
              data-testid="button-confirm-unsubscribe"
              loading={unsubscribe.isPending}
              onClick={() => unsubscribe.mutate({ token, scope })}
            >
              {unsubscribe.isError && <RefreshCw size={16} aria-hidden />}
              {unsubscribe.isError ? 'Tentar novamente' : 'Confirmar descadastro'}
            </Button>
          </>
        )}

        <p className="mt-8 type-meta text-muted-foreground">
          <Link href={PREFERENCES_HREF} data-testid="link-unsubscribe-preferences" className={linkClass}>
            Gerenciar preferências
          </Link>{' '}
          (é preciso entrar com a conta Google).
        </p>
      </main>
    </div>
  );
}
