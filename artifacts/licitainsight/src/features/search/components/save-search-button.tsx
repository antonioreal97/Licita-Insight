import { Bookmark } from 'lucide-react';
import { Button } from '@/components/common/action-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

/**
 * TODO(saved-searches): wire once the saved-searches API exists.
 * Uses aria-disabled (not `disabled`) so the tooltip still works on hover/focus and a click explains why.
 */
export function SaveSearchButton() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          aria-disabled="true"
          data-testid="button-save-search"
          className="cursor-not-allowed self-start opacity-70 sm:self-auto"
          onClick={() => toast({ title: 'Buscas salvas em breve', description: 'Em breve você poderá salvar esta busca e receber alertas de novos editais.' })}
        >
          <Bookmark size={14} aria-hidden />
          Salvar busca
          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-secondary-foreground">em breve</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Em breve: salve esta busca e receba alertas</TooltipContent>
    </Tooltip>
  );
}
