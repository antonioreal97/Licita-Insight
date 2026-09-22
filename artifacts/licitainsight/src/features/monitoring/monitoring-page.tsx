import { Bell } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';

export default function MonitoringPage() {
  return (
    <>
      <PageTitle
        eyebrow="sinais importantes"
        title="Monitoramento"
        description="Acompanhe mudanças nos editais que importam para o seu negócio."
        action={
          <Button variant="outline" data-testid="button-monitoring-settings">
            <Bell size={14} />
            Preferências de alerta
          </Button>
        }
      />
      <div className="rounded-xl border border-border bg-card px-5 py-8">
        <h2 className="type-section text-foreground">Nenhum alerta ligado</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Os editais vêm do banco, atualizado todo dia com as publicações novas do PNCP. O acompanhamento de mudanças em editais salvos ainda não registra alertas.
        </p>
      </div>
    </>
  );
}
