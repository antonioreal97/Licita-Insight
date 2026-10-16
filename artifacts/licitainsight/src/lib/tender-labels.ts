import type { Modality, SortOption, TenderStatus } from '@/api/types';

export const statusLabels: Record<TenderStatus, string> = {
  open: 'Aberto',
  under_review: 'Em análise',
  closed: 'Encerrado',
  suspended: 'Suspenso',
  cancelled: 'Revogado',
  direct: 'Contratação direta',
};

export const modalityLabels: Record<Modality, string> = {
  pregao_eletronico: 'Pregão eletrônico',
  pregao_presencial: 'Pregão presencial',
  concorrencia: 'Concorrência',
  concorrencia_eletronica: 'Concorrência eletrônica',
  dispensa: 'Dispensa',
  inexigibilidade: 'Inexigibilidade',
  credenciamento: 'Credenciamento',
  leilao: 'Leilão',
  dialogo_competitivo: 'Diálogo competitivo',
  other: 'Outra',
};

export const sortLabels: Record<SortOption, string> = {
  relevance: 'Relevância',
  deadline_asc: 'Prazo mais próximo',
  published_desc: 'Mais recentes',
  first_seen_desc: 'Mais recentes no Pardal',
  value_desc: 'Maior valor',
  value_asc: 'Menor valor',
};
