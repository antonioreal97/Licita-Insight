import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/common/action-button';

// TODO(auth): demo-only form; no auth API yet.
export default function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const [sent, setSent] = useState(false);
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  return (
    <div className="grid min-h-[100dvh] bg-background text-foreground lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden bg-sidebar p-10 text-sidebar-strong-foreground lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">LI</span>
          <span className="font-semibold">
            Licita <span className="text-sidebar-primary">Insight</span>
          </span>
        </Link>
        <div>
          <div className="mb-4 type-eyebrow text-sidebar-primary">Pesquisa com contexto</div>
          <p className="max-w-md text-5xl font-semibold leading-[1.02] tracking-display">A decisão começa antes do lance.</p>
          <p className="mt-6 max-w-sm text-sm leading-7 text-sidebar-muted-foreground">
            Organize o mercado público em um lugar feito para leitura rápida e ação segura.
          </p>
        </div>
        <div className="type-eyebrow text-sidebar-subtle-foreground">ambiente demonstrativo · {new Date().getFullYear()}</div>
      </div>
      <main id="conteudo" tabIndex={-1} className="flex items-center justify-center p-5 outline-none sm:p-10">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-12 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-sidebar text-xs font-bold text-sidebar-primary">LI</span>
            <span className="font-semibold">
              Licita <span className="text-primary">Insight</span>
            </span>
          </Link>
          {sent ? (
            <div role="status" className="rounded-xl border border-border bg-surface p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
                <Check size={22} />
              </div>
              <h1 className="mt-5 text-2xl font-semibold">Confira seu e-mail</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Enviamos um link de acesso para você continuar a demonstração.</p>
              <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-primary">
                Voltar para entrar
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="mb-3 type-eyebrow font-bold text-primary">
                  {isForgot ? 'recuperar acesso' : isRegister ? 'comece pelo radar' : 'bem-vinda de volta'}
                </div>
                <h1 className="text-3xl font-semibold tracking-display">
                  {isForgot ? 'Redefina sua senha.' : isRegister ? 'Monte seu espaço de pesquisa.' : 'Entre no seu workspace.'}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {isForgot
                    ? 'Digite o e-mail usado na sua conta.'
                    : isRegister
                      ? 'Ambiente demonstrativo, sem compromisso.'
                      : 'Veja o que mudou no seu radar.'}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isForgot) setSent(true);
                  else window.history.pushState({}, '', '/dashboard');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="space-y-4"
              >
                <label className="field">
                  E-mail profissional
                  <input data-testid="input-auth-email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br" />
                </label>
                {!isForgot && (
                  <div>
                    <label className="field">
                      Senha
                      <input
                        data-testid="input-auth-password"
                        type="password"
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                        required
                        placeholder="••••••••"
                      />
                    </label>
                    {!isRegister && (
                      <Link
                        href="/forgot-password"
                        data-testid="link-auth-forgot"
                        className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
                      >
                        Esqueci minha senha
                      </Link>
                    )}
                  </div>
                )}
                {isRegister && (
                  <label className="field">
                    Empresa
                    <input data-testid="input-auth-company" autoComplete="organization" required placeholder="Nome da empresa" />
                  </label>
                )}
                <Button type="submit" data-testid="button-auth-submit" className="mt-2 h-11 w-full">
                  {isForgot ? 'Enviar link de acesso' : isRegister ? 'Criar espaço demonstrativo' : 'Entrar no Licita Insight'}
                  <ArrowRight size={15} />
                </Button>
              </form>
              <div className="mt-7 text-center text-xs text-muted-foreground">
                {isForgot ? (
                  <Link href="/login" className="font-semibold text-primary">
                    Voltar para entrar
                  </Link>
                ) : isRegister ? (
                  <>
                    Já tem acesso?{' '}
                    <Link href="/login" className="font-semibold text-primary">
                      Entrar
                    </Link>
                  </>
                ) : (
                  <>
                    Ainda não tem acesso?{' '}
                    <Link href="/register" className="font-semibold text-primary">
                      Criar espaço
                    </Link>
                  </>
                )}
              </div>
              <div className="mt-8 flex items-center justify-center gap-2 text-3xs text-muted-foreground">
                <LockKeyhole size={12} /> Seus dados ficam protegidos
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
