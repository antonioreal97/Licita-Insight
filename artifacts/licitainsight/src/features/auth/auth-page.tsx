import { useEffect, useState } from 'react';
import { Link, Redirect, useSearch } from 'wouter';
import { CircleAlert, LockKeyhole } from 'lucide-react';
import { Button, buttonClass } from '@/components/common/action-button';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { LegalLinks } from '@/features/legal/legal-content';
import { cn } from '@/lib/utils';
import { signInWithGoogle, useSession } from './hooks/use-session';

const DEFAULT_RETURN_TO = '/dashboard';

/** Only same-origin relative paths: `/x` yes; `//host`, `/\host`, absolute URLs and `/login` (loop) no. */
function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.startsWith('/login')) return DEFAULT_RETURN_TO;
  return value;
}

// `?error=` codes the API sends back from the Google callback (docs/contracts/account-v1.md).
const errorCopy: Record<string, { title: string; detail: string }> = {
  access_denied: { title: 'Login cancelado', detail: 'Você não autorizou o acesso na tela do Google. Tente de novo quando quiser.' },
  invalid_state: { title: 'A tentativa de login expirou', detail: 'Por segurança, comece o login novamente.' },
  email_not_verified: {
    title: 'E-mail não verificado',
    detail: 'Seu e-mail ainda não foi verificado no Google. Verifique-o na sua conta Google e tente novamente.',
  },
  // Sent by /auth/google/start when Google credentials aren't set: retrying can't work, so the button is hidden.
  oauth_unavailable: {
    title: 'Login com Google indisponível',
    detail: 'Login com Google ainda não está configurado neste ambiente. Fale com o administrador.',
  },
  oauth_failed: { title: 'Não foi possível entrar com o Google', detail: 'Houve uma falha ao concluir o login. Tente novamente em instantes.' },
};
const unknownError = { title: 'Não foi possível entrar', detail: 'Ocorreu um erro inesperado no login. Tente novamente.' };

/** `/register` and `/forgot-password` (email/password era): replace with `/login`, keeping `returnTo`. */
export function LoginRedirect() {
  const returnTo = new URLSearchParams(useSearch()).get('returnTo');
  return <Redirect to={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login'} replace />;
}

/** Google "G" mark, official colors (brand guidelines: keep the mark as-is on a neutral button). */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-[18px]">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function AuthPage() {
  const params = new URLSearchParams(useSearch());
  const returnTo = safeReturnTo(params.get('returnTo'));
  const errorCode = params.get('error');
  const error = errorCode ? (errorCopy[errorCode] ?? unknownError) : null;
  const { status } = useSession();
  // Owner decision: 7-day trial. The API (`/billing/plan`) wins when it answers.
  const trialDays = usePublicPlan().data?.trialDays ?? 7;
  // Full-page navigation to Google: keep the button busy until the page unloads (no double submit).
  const [redirecting, setRedirecting] = useState(false);
  // Back from Google restores this page from the bfcache with the button still busy: reset it.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => event.persisted && setRedirecting(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  if (status === 'authenticated') return <Redirect to={returnTo} replace />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground lg:grid lg:grid-cols-2">
      {/* Phones and tablets: a petróleo bar carries the brand, so the sign-in starts right under it. */}
      <header className="bg-petroleo px-5 py-2.5 sm:px-10 lg:hidden">
        <BrandLink logoClassName="h-11" />
      </header>
      <BrandPanel />
      <main
        id="conteudo"
        tabIndex={-1}
        className="flex flex-1 flex-col px-5 pt-8 pb-10 outline-none sm:justify-center sm:px-10 sm:py-16 lg:bg-surface-sunken lg:px-12"
      >
        {/* From lg the sign-in sits on a card over the calm surface (mist in Gelo, petróleo-deep in Petróleo). */}
        <div className="mx-auto w-full max-w-[420px] lg:max-w-[480px] lg:rounded-2xl lg:border lg:border-card-border lg:bg-card lg:p-10 xl:p-12">
          <h1 className="text-balance type-titulo-2">Entre com sua conta Google.</h1>
          <p className="mt-3 type-corpo text-muted-foreground">
            Salve editais, acompanhe prazo, status, valor e novos anexos e receba alertas das suas buscas.
          </p>
          {error && (
            <div
              role="alert"
              data-testid="alert-auth-error"
              className="mt-6 flex gap-3 rounded-lg border border-destructive-subtle-border bg-destructive-subtle p-4 text-destructive-subtle-foreground"
            >
              <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
              <div>
                <p className="type-ui font-semibold">{error.title}</p>
                <p className="mt-1 type-ui">{error.detail}</p>
              </div>
            </div>
          )}
          {errorCode === 'oauth_unavailable' ? (
            <Link href="/search" data-testid="link-auth-public-search" className={cn(buttonClass('outline', 'lg'), 'mt-6 h-12 w-full')}>
              Pesquisar editais sem entrar
            </Link>
          ) : (
            <>
              <Button
                variant="outline"
                size="lg"
                data-testid="button-auth-google"
                loading={redirecting}
                onClick={() => {
                  setRedirecting(true);
                  signInWithGoogle(returnTo);
                }}
                className={cn('h-12 w-full gap-3 border-border-strong text-[length:var(--type-body-size)]', error ? 'mt-6' : 'mt-8')}
              >
                <GoogleMark />
                Entrar com Google
              </Button>
              <p data-testid="text-login-trial" className="mt-4 type-ui text-muted-foreground">
                Primeiro acesso? A conta é criada automaticamente e você ganha{' '}
                <strong className="font-semibold text-foreground">{trialDays} dias de acesso completo</strong>.
              </p>
            </>
          )}
          <div className="mt-8 border-t border-border pt-6">
            <p className="flex items-start gap-2.5 type-ui text-muted-foreground">
              {/* Nudged so the icon centres on the first line of text (16 px icon, 22 px line). */}
              <LockKeyhole size={16} aria-hidden className="mt-[3px] shrink-0" />
              <span>Usamos seu nome, e-mail e foto do Google apenas para identificar sua conta.</span>
            </p>
            <LegalLinks className="mt-2 gap-y-0 pl-[26px] type-ui [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center" />
          </div>
        </div>
      </main>
    </div>
  );
}

/** Lima logo for the petróleo surfaces (pinned in both themes, so `BrandLogo`'s theme switch doesn't apply). */
function BrandLink({ logoClassName }: { logoClassName: string }) {
  return (
    <Link href="/" aria-label="Pardal Digital, início" className="inline-flex min-h-11 w-fit items-center rounded-lg focus-visible:outline-lima">
      <img src={`${import.meta.env.BASE_URL}brand/pardal-logo-lima.svg`} alt="" draggable={false} className={cn('w-auto', logoClassName)} />
    </Link>
  );
}

/**
 * Large screens: the landing hero's brand panel (petróleo, gelo text, lima accent) with one of its photos.
 * Lima text is safe here because the panel stays petróleo in both themes (8.98:1).
 */
function BrandPanel() {
  return (
    <div className="hidden min-h-[100dvh] flex-col overflow-hidden bg-petroleo p-12 text-gelo lg:flex xl:p-16 2xl:p-20">
      <BrandLink logoClassName="h-14 2xl:h-16" />
      <div className="mt-12 xl:mt-16">
        <p className="type-rotulo text-lima">Pesquisa com contexto</p>
        <p className="mt-4 max-w-[16ch] text-balance type-titulo-1 xl:text-[3.25rem] 2xl:text-[4rem]">
          A decisão começa <span className="text-lima">antes do lance.</span>
        </p>
        <p className="mt-5 max-w-sm type-corpo text-gelo/80 2xl:max-w-md 2xl:type-corpo-grande">
          Organize o mercado público em um lugar feito para leitura rápida e ação segura.
        </p>
      </div>
      <div className="relative -mr-12 -mb-12 mt-12 min-h-56 flex-1 overflow-hidden rounded-tl-[4rem] xl:-mr-16 xl:-mb-16 xl:mt-16 2xl:-mr-20 2xl:-mb-20 2xl:rounded-tl-[5rem]">
        <img
          src={`${import.meta.env.BASE_URL}brand/auth-side.jpg`}
          alt=""
          width={2048}
          height={1367}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover object-[42%_28%]"
        />
        <p className="absolute bottom-8 left-8 rounded-pill bg-lima px-3.5 py-2 type-ui font-bold text-petroleo">
          Dados públicos do PNCP · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
