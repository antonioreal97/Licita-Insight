import type { OpportunityKind, OpportunityProgram, OpportunitySource, OpportunityStatus } from '@/api';

export const opportunityStatusLabels: Record<OpportunityStatus, string> = {
  open: 'Inscrições abertas',
  upcoming: 'Inscrições em breve',
  closed: 'Inscrições encerradas',
  undated: 'Prazo não informado',
};

export const opportunityProgramLabels: Record<OpportunityProgram, string> = {
  audiovisual: 'Audiovisual',
  lpg: 'Lei Paulo Gustavo',
  fac: 'Fundo de Apoio à Cultura',
  fsa: 'Fundo Setorial do Audiovisual',
};

export const opportunityKindLabels: Record<OpportunityKind, string> = {
  culture: 'Cultura',
  funding: 'Fomento',
  innovation: 'Inovação',
  partnership: 'Parceria',
};

export const opportunitySourceLabels: Record<OpportunitySource, string> = {
  mapas: 'Mapas Culturais',
  finep: 'FINEP',
  cnpq: 'CNPq',
  capes: 'CAPES',
};

const tones: Record<OpportunityStatus, string> = {
  open: 'bg-status-open text-status-open-foreground',
  upcoming: 'bg-status-under-review text-status-under-review-foreground',
  closed: 'bg-status-closed text-status-closed-foreground',
  undated: 'bg-status-suspended text-status-suspended-foreground',
};

export function OpportunityStatusBadge({ status }: { status: OpportunityStatus }) {
  return (
    <span
      data-testid={`opportunity-status-${status}`}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-2xs font-semibold ${tones[status]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {opportunityStatusLabels[status]}
    </span>
  );
}
