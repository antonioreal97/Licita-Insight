import { Bell } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { PageTitle } from '@/components/common/page-title';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

export default function MonitoringPage() {
  return (
    <>
      <PageTitle
        eyebrow="sinais importantes"
        title="Monitoramento"
        description="Acompanhe mudanças nos editais que importam para o seu negócio."
        action={
          // TODO(monitoring): aria-disabled (not `disabled`) so the tooltip works and a click explains why.
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                aria-disabled="true"
                data-testid="button-monitoring-settings"
                className="cursor-not-allowed opacity-70"
                onClick={() => toast({ title: 'Preferências de alerta em breve', description: 'Os alertas chegam junto com o monitoramento de editais.' })}
              >
                <Bell size={14} aria-hidden="true" />
                Preferências de alerta
                <span className="rounded-xs bg-secondary px-1 py-px type-label font-bold text-secondary-foreground">em breve</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Em breve: escolha como e quando receber alertas</TooltipContent>
          </Tooltip>
        }
      />
      <div className="rounded-xl border border-border bg-card px-5 py-8">
        <h2 className="type-section text-foreground">Nenhum alerta ligado</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Os editais vêm do banco, atualizado todo dia com as publicações novas do PNCP. O acompanhamento de mudanças em editais salvos ainda não registra
          alertas.
        </p>
      </div>
    </>
  );
}
