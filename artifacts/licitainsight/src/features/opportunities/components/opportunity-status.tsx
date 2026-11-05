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
  procurement: 'Licitação internacional',
};

export const opportunitySourceLabels: Record<OpportunitySource, string> = {
  mapas: 'Mapas Culturais',
  finep: 'FINEP',
  cnpq: 'CNPq',
  capes: 'CAPES',
  transferegov: 'Transferegov.br',
  funarte: 'Funarte',
  minc: 'Ministério da Cultura',
  salic: 'Lei Rouanet (Salic)',
  worldbank: 'Banco Mundial',
  eu_ft: 'União Europeia (Funding & Tenders)',
  idb: 'BID',
  fap: 'FAPs estaduais',
};

/** Credit a source requires as a condition of reuse, printed next to the link to the official notice. */
export const opportunitySourceAttributions: Partial<Record<OpportunitySource, string>> = {
  idb: 'Fonte: BID (Banco Interamericano de Desenvolvimento), CC BY 4.0',
};

/** Sources of each side of the hub, for the source filter. */
export const INTERNATIONAL_SOURCES: OpportunitySource[] = ['worldbank', 'eu_ft', 'idb'];
export const INTERNATIONAL_KINDS: OpportunityKind[] = ['procurement', 'funding', 'innovation', 'partnership'];
export const NATIONAL_KINDS: OpportunityKind[] = ['culture', 'funding', 'innovation', 'partnership'];

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

/** Marks what a person published with no sign of a public call, so nobody takes it for an official notice. */
export function IndividualListingBadge() {
  return (
    <span
      data-testid="badge-individual-listing"
      className="rounded-pill border border-warning/40 bg-warning-subtle px-2.5 py-1 text-xs font-semibold text-warning-subtle-foreground"
    >
      Anúncio individual
    </span>
  );
}
