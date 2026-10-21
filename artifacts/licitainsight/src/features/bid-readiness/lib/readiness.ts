import type {
  CompanyDocumentChecklistItem,
  CompanyDocumentKind,
  CompanyDocumentsResponse,
  QualificationType,
  TenderHighlights,
  TenderSheet,
} from '@/api';

const qualificationDocuments: Record<QualificationType, CompanyDocumentKind[]> = {
  ato_societario: ['articles_of_association'],
  regularidade_fiscal: ['sicaf', 'cnd_federal', 'crf_fgts', 'state_tax_clearance', 'municipal_tax_clearance'],
  regularidade_trabalhista: ['cndt'],
  qualificacao_tecnica: ['technical_capacity_certificate', 'professional_council_registration'],
  qualificacao_economica: ['bankruptcy_clearance', 'balance_sheet'],
};

const highlightDocuments: Partial<Record<TenderHighlights['requirements'][number]['code'], CompanyDocumentKind[]>> = {
  technical_certificate: ['technical_capacity_certificate'],
  technical_qualification: ['technical_capacity_certificate', 'professional_council_registration'],
  minimum_capital: ['balance_sheet'],
};

export function requiredDocumentKinds(input: { highlights?: TenderHighlights; sheet?: TenderSheet }): CompanyDocumentKind[] | null {
  const hasReadySheet = input.sheet?.status === 'ready' || input.highlights !== undefined;
  if (!hasReadySheet) return null;
  const kinds = new Set<CompanyDocumentKind>();
  for (const item of input.sheet?.qualificationChecklist ?? []) {
    for (const kind of qualificationDocuments[item.type]) kinds.add(kind);
  }
  for (const requirement of input.highlights?.requirements ?? []) {
    for (const kind of highlightDocuments[requirement.code] ?? []) kinds.add(kind);
  }
  return [...kinds];
}

export type TenderReadiness = { state: 'ready'; required: number } | { state: 'missing'; labels: string[] } | null;

/** Same rule as the API: a kind that expires but has no date is "unknown" and never counts as in good standing. */
export function documentValidity(item: CompanyDocumentChecklistItem | undefined, asOf: string): 'valid' | 'unknown' | 'invalid' {
  const document = item?.document;
  if (document?.status !== 'have') return 'invalid';
  if (document.expiresAt) return document.expiresAt >= asOf ? 'valid' : 'invalid';
  return item!.catalog.suggestedValidityDays === null ? 'valid' : 'unknown';
}

export function tenderReadiness(
  documents: CompanyDocumentsResponse | undefined,
  input: { highlights?: TenderHighlights; sheet?: TenderSheet },
): TenderReadiness {
  if (!documents) return null;
  const required = requiredDocumentKinds(input);
  if (!required || required.length === 0) return null;
  const items = new Map(documents.items.map((item) => [item.catalog.kind, item]));
  const missing = required.flatMap((kind) => {
    const item = items.get(kind);
    const validity = documentValidity(item, documents.asOf);
    const label = item?.catalog.label ?? kind;
    if (validity === 'valid') return [];
    return [validity === 'unknown' ? `${label} (sem validade informada)` : label];
  });
  return missing.length === 0 ? { state: 'ready', required: required.length } : { state: 'missing', labels: missing };
}
