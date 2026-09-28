import type { QualificationType, SheetFieldId } from '@/api';

type FieldCopy = { label: string; answers?: Record<string, string> };

/** Labels live here; the API sends stable ids and answer keys (CODEX_HANDOFF-015). */
export const FIELDS: Record<SheetFieldId, FieldCopy> = {
  consortium: { label: 'Consórcio', answers: { allowed: 'Permitido', forbidden: 'Vedado' } },
  subcontracting: { label: 'Subcontratação', answers: { allowed: 'Permitida', limited: 'Permitida com limites', forbidden: 'Vedada' } },
  me_epp: { label: 'ME/EPP', answers: { exclusive: 'Exclusivo para ME/EPP', quota: 'Cota reservada para ME/EPP', benefits_only: 'Só os benefícios da LC 123' } },
  site_visit: { label: 'Visita técnica', answers: { mandatory: 'Obrigatória', optional: 'Facultativa', waived: 'Dispensada' } },
  samples: { label: 'Amostra ou prova de conceito', answers: { required: 'Exige', not_required: 'Não exige' } },
  bid_guarantee: { label: 'Garantia de proposta', answers: { required: 'Exige', not_required: 'Não exige' } },
  contract_guarantee: { label: 'Garantia contratual', answers: { required: 'Exige', not_required: 'Não exige' } },
  penalties: { label: 'Multas' },
  technical_qualification: { label: 'Qualificação técnica' },
  financial_qualification: { label: 'Qualificação econômico-financeira' },
  contract_term: { label: 'Vigência do contrato' },
  delivery_term: { label: 'Prazo de entrega ou execução' },
  price_adjustment: { label: 'Reajuste' },
};

export const QUALIFICATION_LABELS: Record<QualificationType, string> = {
  ato_societario: 'Documento societário',
  regularidade_fiscal: 'Regularidade fiscal',
  regularidade_trabalhista: 'Regularidade trabalhista',
  qualificacao_tecnica: 'Qualificação técnica',
  qualificacao_economica: 'Qualificação econômico-financeira',
};

/** Fixed display order; absent types just don't render (never "não exige" by omission). */
export const QUALIFICATION_ORDER: QualificationType[] = ['ato_societario', 'regularidade_fiscal', 'regularidade_trabalhista', 'qualificacao_tecnica', 'qualificacao_economica'];
