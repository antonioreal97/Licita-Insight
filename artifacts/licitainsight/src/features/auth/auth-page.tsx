import { useEffect, useState } from 'react';
import { Link, Redirect, useSearch } from 'wouter';
import { CircleAlert, LockKeyhole } from 'lucide-react';
import { BrandLogo } from '@/components/brand-icon';
import { Button } from '@/components/common/action-button';
import { usePublicPlan } from '@/features/billing/hooks/use-public-plan';
import { LegalLinks } from '@/features/legal/legal-content';
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
    <div className="grid min-h-[100dvh] bg-background text-foreground lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex w-fit items-center">
          <BrandLogo className="h-24" />
        </Link>
        <div>
          <div className="mb-4 type-rotulo text-sidebar-muted-foreground">Pesquisa com contexto</div>
          <p className="max-w-md type-titulo-1">A decisão começa antes do lance.</p>
          <p className="mt-6 max-w-sm type-corpo text-sidebar-muted-foreground">
            Organize o mercado público em um lugar feito para leitura rápida e ação segura.
          </p>
        </div>
        <div className="type-eyebrow text-sidebar-subtle-foreground">Dados públicos do PNCP · {new Date().getFullYear()}</div>
      </div>
      <main id="conteudo" tabIndex={-1} className="flex items-center justify-center p-5 outline-none sm:p-10">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="mb-12 flex w-fit items-center lg:hidden">
            <BrandLogo className="h-16" />
          </Link>
          <div className="mb-8">
            <h1 className="type-titulo-2">Entre com sua conta Google.</h1>
            <p className="mt-2 type-body text-muted-foreground">Salve editais, monitore mudanças e receba alertas das suas buscas.</p>
          </div>
          {error && (
            <div
              role="alert"
              data-testid="alert-auth-error"
              className="mb-5 flex gap-3 rounded-lg border border-destructive-subtle-border bg-destructive-subtle p-4 text-destructive-subtle-foreground"
            >
              <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
              <div>
                <p className="type-ui font-semibold">{error.title}</p>
                <p className="mt-0.5 type-meta">{error.detail}</p>
              </div>
            </div>
          )}
          {errorCode === 'oauth_unavailable' ? (
            <Link
              href="/search"
              data-testid="link-auth-public-search"
              className="flex h-11 w-full items-center justify-center rounded-pill border border-border bg-card px-4 type-ui font-semibold text-foreground transition-colors duration-fast ease-standard hover:bg-muted focus-visible:focus-ring"
            >
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
                className="w-full gap-3"
              >
                <GoogleMark />
                Entrar com Google
              </Button>
              <p className="mt-3 text-center type-meta text-muted-foreground">Primeiro acesso? A conta é criada automaticamente.</p>
              <p data-testid="text-login-trial" className="mt-1 text-center type-meta font-semibold text-foreground">
                Ao entrar pela primeira vez, você ganha {trialDays} dias de acesso completo.
              </p>
            </>
          )}
          <p className="mt-8 flex items-start justify-center gap-2 text-balance text-center type-meta text-muted-foreground">
            <LockKeyhole size={12} aria-hidden className="mt-0.5 shrink-0" />
            Usamos seu nome, e-mail e foto do Google apenas para identificar sua conta.
          </p>
          <LegalLinks className="mt-3 justify-center text-center type-meta" />
        </div>
      </main>
    </div>
  );
}
