import { Plus } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';

export default function SavedSearchesPage() {
  return (
    <>
      <PageTitle
        eyebrow="seus alertas"
        title="Buscas salvas"
        description="Consultas que você escolheu acompanhar. A frequência define quando avisaremos sobre novidades."
        action={
          <Button data-testid="button-new-saved-search">
            <Plus size={15} />
            Nova busca
          </Button>
        }
      />
      <div className="rounded-xl border border-dashed border-border-strong bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        Nenhuma busca salva. Esta lista ainda não grava consultas; os editais da pesquisa vêm do banco.
      </div>
    </>
  );
}
