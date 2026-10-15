import type { CompanyProfileInput, TenderSearchParams } from '@/api';
import { combinedOfferingTerms, listsForSave } from '@/features/company-profile/components/offering-terms-state';

export type GuidedDraft = Omit<CompanyProfileInput, 'size'> & { size: CompanyProfileInput['size'] | null };
export const emptyGuidedDraft = (): GuidedDraft => ({
  description: '',
  offerings: [],
  selectedKeywords: [],
  selectedCategories: [],
  exclusions: [],
  excludedKeywords: [],
  registeredPlatforms: [],
  coverage: { scope: 'national', mode: 'strict', acceptsRemote: false },
  valueRange: { min: null, max: null },
  size: null,
});
export function hasProfileContent(profile: GuidedDraft | null | undefined) {
  return Boolean(profile && (profile.description.trim() || combinedOfferingTerms(profile).length || profile.selectedCategories.length));
}
export function profileProgress(profile: GuidedDraft | null | undefined) {
  const items = [
    {
      key: 'terms',
      done: Boolean(profile && combinedOfferingTerms(profile).length),
      text: 'Conte o que você vende ou faz',
      reward: 'encontre editais ligados ao seu trabalho',
      step: 0,
    },
    {
      key: 'region',
      done: Boolean(
        profile &&
        (profile.coverage.scope === 'national' ||
          profile.coverage.states.length ||
          profile.coverage.regions.length ||
          profile.coverage.municipalities.length ||
          profile.coverage.radius),
      ),
      text: 'Adicione onde você atende',
      reward: 'recomendações da sua região, conforme sua preferência',
      step: 1,
    },
    {
      key: 'value',
      done: Boolean(profile && (profile.valueRange.min !== null || profile.valueRange.max !== null)),
      text: 'Defina a faixa de valor',
      reward: 'menos editais fora do seu tamanho',
      step: 2,
    },
    {
      key: 'size',
      done: Boolean(profile?.size),
      text: 'Informe o porte da empresa',
      reward: 'identifique restrições para ME/EPP',
      step: 3,
    },
    {
      key: 'platforms',
      done: Boolean(profile?.registeredPlatforms.length),
      text: 'Informe as plataformas em que está cadastrado',
      reward: 'identifique quando o edital usar outra plataforma',
      step: 3,
    },
  ];
  return { percent: items.filter((item) => item.done).length * 20, next: items.filter((item) => !item.done).slice(0, 3) };
}
export function validateGuidedStep(draft: GuidedDraft, step: number): string | null {
  if (step === 0 && !combinedOfferingTerms(draft).length) return 'Adicione pelo menos um termo do que sua empresa vende ou faz.';
  const coverage = draft.coverage;
  if (
    step === 1 &&
    coverage.scope === 'custom' &&
    !coverage.states.length &&
    !coverage.regions.length &&
    !coverage.municipalities.length &&
    !coverage.radius
  )
    return 'Escolha um estado, município, macrorregião ou raio.';
  const { min, max } = draft.valueRange;
  if (
    step === 2 &&
    ((min !== null && (!Number.isSafeInteger(min) || min < 0)) || (max !== null && (!Number.isSafeInteger(max) || max < 0)))
  )
    return 'Informe valores inteiros válidos em reais.';
  if (step === 2 && min !== null && max !== null && min > max) return 'O valor mínimo deve ser menor ou igual ao máximo.';
  if (step === 3 && !draft.size) return 'Escolha o porte para salvar o perfil. As plataformas são opcionais.';
  return null;
}
export function guidedProfileInput(draft: GuidedDraft): CompanyProfileInput {
  // The existing PUT requires a description. Derive it transparently from the user's terms, without another question or model call.
  return {
    ...draft,
    ...listsForSave(draft),
    size: draft.size!,
    description: draft.description.trim() || `A empresa vende ou faz: ${combinedOfferingTerms(draft).join(', ')}.`.slice(0, 600),
  };
}
export function guidedAlertParams(profile: CompanyProfileInput): TenderSearchParams {
  return {
    q: combinedOfferingTerms(profile).join(' '),
    mode: 'keyword',
    status: ['open'],
    valueMin: profile.valueRange.min ?? undefined,
    valueMax: profile.valueRange.max ?? undefined,
  };
}
