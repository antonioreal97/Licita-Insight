import type { OpportunityArea, OpportunityKind, OpportunityProgram, OpportunitySource, OpportunityStatus } from '@/api';

export const opportunityAreaLabels: Record<OpportunityArea, string> = {
  audiovisual: 'Audiovisual',
  musica: 'Música',
  teatro: 'Teatro',
  danca: 'Dança',
  circo: 'Circo',
  'artes-visuais': 'Artes visuais',
  literatura: 'Livro e literatura',
  patrimonio: 'Patrimônio e memória',
  'culturas-populares': 'Culturas populares e tradicionais',
  artesanato: 'Artesanato',
  'cultura-digital': 'Cultura digital e games',
  gastronomia: 'Gastronomia',
  'gestao-producao': 'Gestão e produção cultural',
  formacao: 'Formação e pesquisa',
  diversidade: 'Diversidade e direitos',
  outras: 'Outras áreas',
};

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
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-xs font-semibold ${tones[status]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {opportunityStatusLabels[status]}
    </span>
  );
}
