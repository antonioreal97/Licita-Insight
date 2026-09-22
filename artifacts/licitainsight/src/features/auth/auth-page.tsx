import { useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Check, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/common/action-button';

// DS-DEBT: raw hex colors. TODO(auth): demo-only form; no auth API yet.
export default function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const [sent, setSent] = useState(false);
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  return (
    <div className="grid min-h-[100dvh] bg-[#f5f7f6] lg:grid-cols-[.9fr_1.1fr]">
      <div className="hidden bg-[#172f2e] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#6ad4b4] text-xs font-bold text-[#172f2e]">LI</span>
          <span className="font-semibold">
            Licita <span className="text-[#6ad4b4]">Insight</span>
          </span>
        </Link>
        <div>
          <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6ad4b4]">Pesquisa com contexto</div>
          <h1 className="max-w-md text-5xl font-semibold leading-[1.02] tracking-[-.06em]">A decisão começa antes do lance.</h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-[#b0c8c0]">Organize o mercado público em um lugar feito para leitura rápida e ação segura.</p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#77988d]">ambiente demonstrativo · 2024</div>
      </div>
      <div className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[420px]">
          <Link href="/" className="mb-12 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#172f2e] text-xs font-bold text-[#6ad4b4]">LI</span>
            <span className="font-semibold">
              Licita <span className="text-[#278f73]">Insight</span>
            </span>
          </Link>
          {sent ? (
            <div className="rounded-xl border border-[#b8d7cc] bg-white p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e1f4ed] text-[#278f73]">
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
                <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  {isForgot ? 'recuperar acesso' : isRegister ? 'comece pelo radar' : 'bem-vinda de volta'}
                </div>
                <h1 className="text-3xl font-semibold tracking-[-.05em]">
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
                  <input data-testid="input-auth-email" type="email" required placeholder="voce@empresa.com.br" />
                </label>
                {!isForgot && (
                  <label className="field">
                    Senha
                    <input data-testid="input-auth-password" type="password" required placeholder="••••••••" />
                  </label>
                )}
                {isRegister && (
                  <label className="field">
                    Empresa
                    <input data-testid="input-auth-company" required placeholder="Nome da empresa" />
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
              <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
                <LockKeyhole size={12} /> Seus dados ficam protegidos
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
