import { Link } from 'wouter';
import { Plus } from 'lucide-react';
import { PageTitle } from '@/components/common/page-title';

export default function SavedSearchesPage() {
  return (
    <>
      <PageTitle
        eyebrow="seus alertas"
        title="Buscas salvas"
        description="Consultas que você escolheu acompanhar. A frequência define quando avisaremos sobre novidades."
        action={
          <Link
            href="/search"
            data-testid="button-new-saved-search"
            className="inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg bg-primary px-3.5 type-ui font-semibold text-primary-foreground shadow-xs transition-[background-color,scale] duration-fast ease-standard hover:bg-primary-hover active:scale-[0.98] active:bg-primary-active focus-visible:focus-ring sm:self-auto"
          >
            <Plus size={15} aria-hidden="true" />
            Nova busca
          </Link>
        }
      />
      <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        Nenhuma busca salva. Esta lista ainda não grava consultas; os editais da pesquisa vêm do banco.
      </div>
    </>
  );
}
