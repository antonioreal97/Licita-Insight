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
          className="w-9 cursor-not-allowed px-0 opacity-70 sm:w-auto sm:px-3.5"
          onClick={() => toast({ title: 'Buscas salvas em breve', description: 'Em breve você poderá salvar esta busca e receber alertas de novos editais.' })}
        >
          <Bookmark size={14} aria-hidden />
          {/* Icon-only on phones so it shares the title row; the name stays for screen readers. */}
          <span className="sr-only sm:not-sr-only">Salvar busca</span>
          <span className="hidden rounded-xs bg-secondary px-1 py-px type-label font-bold text-secondary-foreground sm:inline">em breve</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Em breve: salve esta busca e receba alertas</TooltipContent>
    </Tooltip>
  );
}
