import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Página não encontrada · Licita Insight';
  }, []);
  return (
    <main id="conteudo" tabIndex={-1} className="flex min-h-[100dvh] w-full items-center justify-center bg-background px-4 text-foreground outline-none">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-7">
        <div className="mb-5 grid h-10 w-10 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
          <Compass size={20} aria-hidden="true" />
        </div>
        <div className="mb-2 type-eyebrow font-bold text-primary">erro 404</div>
        <h1 className="type-title text-foreground">Página não encontrada</h1>
        <p className="mt-2 type-body text-muted-foreground">O endereço pode ter mudado ou não existe mais. Volte ao início ou explore os editais abertos.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            data-testid="link-not-found-home"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 type-ui font-semibold text-primary-foreground shadow-xs transition-colors duration-fast hover:bg-primary-hover"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar ao início
          </Link>
          <Link
            href="/search"
            data-testid="link-not-found-search"
            className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3.5 type-ui font-semibold text-foreground shadow-2xs transition-colors duration-fast hover:border-border-strong hover:bg-surface-sunken"
          >
            Explorar editais
          </Link>
        </div>
      </div>
    </main>
  );
}
