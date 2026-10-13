import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { Check, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';
import { isApiError, type CompanyMacroregion, type CompanyProfile, type CompanyProfileInput, type CompanySize, type MunicipalityReference } from '@/api';
import { Button } from '@/components/common/action-button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { trackProfileSetup } from '@/features/analytics/google-analytics';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { toast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/format';
import { UFS } from '@/lib/ufs';
import { cn } from '@/lib/utils';
import { PROFILE_LIMITS } from '@/services/ai-service';
import { SmartKeywordCombobox } from './keyword-combobox';
import {
  useCompanyProfile,
  useCompanyRegionPreview,
  useDeleteCompanyProfile,
  useProfileCategories,
  useProfileDescriptionSuggestions,
  useProfileMunicipalities,
  useProfilePlatforms,
  useSaveCompanyProfile,
} from '../hooks/use-company-profile';

const sizeOptions: { value: CompanySize; label: string; hint: string }[] = [
  { value: 'me_epp', label: 'ME ou EPP', hint: 'Microempresa ou empresa de pequeno porte (LC 123/2006).' },
  { value: 'cooperative', label: 'Cooperativa', hint: '' },
  { value: 'other', label: 'Demais portes', hint: 'Avisamos quando o edital for exclusivo para ME/EPP, com o trecho que diz isso.' },
];

const macroregions: { value: CompanyMacroregion; label: string }[] = [
  { value: 'north', label: 'Norte' },
  { value: 'northeast', label: 'Nordeste' },
  { value: 'central_west', label: 'Centro-Oeste' },
  { value: 'southeast', label: 'Sudeste' },
  { value: 'south', label: 'Sul' },
];

type Draft = {
  description: string;
  offerings: string[];
  exclusions: string[];
  selectedCategories: string[];
  selectedKeywords: string[];
  excludedKeywords: string[];
  registeredPlatforms: string[];
  national: boolean;
  regions: CompanyMacroregion[];
  states: string[];
  municipalities: MunicipalityReference[];
  headquarters: MunicipalityReference | null;
  radiusKm: 50 | 100 | 200 | 300 | 500;
  coverageMode: 'strict' | 'prioritize';
  acceptsRemote: boolean;
  min: string;
  max: string;
  size: CompanySize | null;
};

const emptyDraft: Draft = {
  description: '',
  offerings: [],
  exclusions: [],
  selectedCategories: [],
  selectedKeywords: [],
  excludedKeywords: [],
  registeredPlatforms: [],
  national: true,
  regions: [],
  states: [],
  municipalities: [],
  headquarters: null,
  radiusKm: 100,
  coverageMode: 'strict',
  acceptsRemote: false,
  min: '',
  max: '',
  size: null,
};

const toDraft = (profile: CompanyProfile): Draft => ({
  description: profile.description,
  offerings: profile.offerings,
  exclusions: profile.exclusions,
  selectedCategories: profile.selectedCategories ?? [],
  selectedKeywords: profile.selectedKeywords ?? [],
  excludedKeywords: profile.excludedKeywords ?? [],
  registeredPlatforms: profile.registeredPlatforms ?? [],
  national: profile.coverage.scope === 'national',
  regions: profile.coverage.scope === 'custom' ? profile.coverage.regions : [],
  states: profile.coverage.scope === 'custom' ? profile.coverage.states : [],
  municipalities: profile.coverage.scope === 'custom' ? profile.coverage.municipalities : [],
  headquarters: profile.coverage.scope === 'custom' ? (profile.coverage.radius?.center ?? null) : null,
  radiusKm: profile.coverage.scope === 'custom' ? (profile.coverage.radius?.km ?? 100) : 100,
  coverageMode: profile.coverage.mode,
  acceptsRemote: profile.coverage.acceptsRemote,
  min: profile.valueRange.min === null ? '' : String(profile.valueRange.min),
  max: profile.valueRange.max === null ? '' : String(profile.valueRange.max),
  size: profile.size,
});

/** Whole reais: "1.500.000" or "1500000" → 1500000; empty → null. */
const parseReais = (value: string): number | null => {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

const reaisLabel = (value: string) => {
  const number = parseReais(value);
  return number === null ? '' : number.toLocaleString('pt-BR');
};

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

type Errors = Partial<Record<'description' | 'offerings' | 'exclusions' | 'states' | 'valueRange' | 'size' | 'form', string>>;

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  const length = draft.description.trim().length;
  if (length < PROFILE_LIMITS.descriptionMin) errors.description = `Escreva pelo menos ${PROFILE_LIMITS.descriptionMin} caracteres.`;
  if (draft.offerings.length === 0) errors.offerings = 'Adicione pelo menos um produto ou serviço.';
  if (!draft.national && draft.states.length === 0 && draft.regions.length === 0 && draft.municipalities.length === 0 && !draft.headquarters)
    errors.states = 'Escolha uma macrorregião, UF, município ou cidade-sede com raio.';
  const min = parseReais(draft.min);
  const max = parseReais(draft.max);
  if (min !== null && max !== null && min > max) errors.valueRange = 'O valor mínimo é maior que o máximo.';
  if (!draft.size) errors.size = 'Escolha o porte da empresa.';
  return errors;
}

const toInput = (draft: Draft): CompanyProfileInput => ({
  description: draft.description.trim(),
  offerings: draft.offerings,
  exclusions: draft.exclusions,
  selectedCategories: draft.selectedCategories,
  selectedKeywords: draft.selectedKeywords,
  excludedKeywords: draft.excludedKeywords,
  registeredPlatforms: draft.registeredPlatforms,
  coverage: draft.national
    ? { scope: 'national', mode: draft.coverageMode, acceptsRemote: draft.acceptsRemote }
    : {
        scope: 'custom',
        mode: draft.coverageMode,
        acceptsRemote: draft.acceptsRemote,
        regions: [...draft.regions].sort(),
        states: [...draft.states].sort(),
        municipalities: draft.municipalities,
        radius: draft.headquarters ? { center: draft.headquarters, km: draft.radiusKm } : null,
      },
  valueRange: { min: parseReais(draft.min), max: parseReais(draft.max) },
  size: draft.size!,
});

/** API `details[].field` ("coverage.states", "offerings[2]") → the field that shows the message. */
function serverErrors(error: unknown): Errors {
  if (!isApiError(error) || error.code !== 'INVALID_PARAMETER' || error.details.length === 0) {
    return {
      form:
        isApiError(error) && error.requestId
          ? `Não foi possível salvar o perfil. Tente de novo. (ref. ${error.requestId})`
          : 'Não foi possível salvar o perfil. Tente de novo.',
    };
  }
  const errors: Errors = {};
  for (const { field } of error.details) {
    if (field.startsWith('description')) errors.description = 'Revise a descrição.';
    else if (field.startsWith('offerings'))
      errors.offerings = `Revise os termos: de ${PROFILE_LIMITS.termMin} a ${PROFILE_LIMITS.termMax} caracteres, sem repetir.`;
    else if (field.startsWith('exclusions'))
      errors.exclusions = `Revise os termos: de ${PROFILE_LIMITS.termMin} a ${PROFILE_LIMITS.termMax} caracteres, sem repetir.`;
    else if (field.startsWith('selectedCategories') || field.startsWith('selectedKeywords') || field.startsWith('excludedKeywords'))
      errors.form = 'Revise os filtros inteligentes selecionados.';
    else if (field.startsWith('registeredPlatforms')) errors.form = 'Revise as plataformas em que a empresa é cadastrada.';
    else if (field.startsWith('coverage')) errors.states = 'Revise a área de atuação.';
    else if (field.startsWith('valueRange')) errors.valueRange = 'Revise a faixa de valor.';
    else if (field.startsWith('size')) errors.size = 'Escolha o porte da empresa.';
    else errors.form = 'Revise os campos destacados.';
  }
  return errors;
}

/** Selected option card: sálvia fill, so every text inside takes its petróleo ink (muted text fails AA on sálvia). */
const selectedOption = 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground **:text-primary-subtle-foreground';
const errorText = 'mt-1.5 type-meta font-normal text-destructive';
const chipInput =
  'h-[2.625rem] min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[length:var(--type-ui-size)] font-normal text-foreground transition-[border-color,box-shadow] duration-fast ease-standard placeholder:text-muted-foreground focus:border-ring aria-[invalid=true]:border-destructive dark:bg-card';

function TermsField({
  id,
  label,
  hint,
  placeholder,
  terms,
  onChange,
  error,
  testId,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  terms: string[];
  onChange: (terms: string[]) => void;
  error?: string;
  testId: string;
}) {
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const full = terms.length >= PROFILE_LIMITS.terms;

  const add = () => {
    const parts = text
      .split(/[,;\n]/)
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...terms];
    let skipped = 0;
    for (const part of parts) {
      const valid = part.length >= PROFILE_LIMITS.termMin && part.length <= PROFILE_LIMITS.termMax;
      if (!valid || next.some((term) => fold(term) === fold(part)) || next.length >= PROFILE_LIMITS.terms) skipped += 1;
      else next.push(part);
    }
    onChange(next);
    setText('');
    setNote(
      skipped > 0
        ? `${skipped === 1 ? '1 termo ficou de fora' : `${skipped} termos ficaram de fora`}: repetido, fora de ${PROFILE_LIMITS.termMin}–${PROFILE_LIMITS.termMax} caracteres ou acima de ${PROFILE_LIMITS.terms}.`
        : null,
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    } else if (event.key === 'Backspace' && !text && terms.length > 0) {
      onChange(terms.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block type-meta font-semibold text-muted-foreground">
        {label}
      </label>
      <p id={`${id}-hint`} className="mt-1 type-meta text-muted-foreground">
        {hint}
      </p>
      {terms.length > 0 && (
        <ul aria-label={label} className="mt-2.5 flex flex-wrap gap-1.5" data-testid={`${testId}-list`}>
          {terms.map((term) => (
            <li key={term} className="inline-flex items-center gap-1 rounded-pill bg-secondary py-1 pr-1 pl-2.5 text-xs font-medium text-secondary-foreground">
              {term}
              <button
                type="button"
                aria-label={`Remover ${term}`}
                onClick={() => onChange(terms.filter((item) => item !== term))}
                className="grid h-5 w-5 place-items-center rounded-full text-secondary-foreground/70 transition-colors duration-fast ease-standard hover:bg-foreground/10 hover:text-secondary-foreground focus-visible:focus-ring"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex gap-2">
        <input
          id={id}
          value={text}
          disabled={full}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => text.trim() && add()}
          placeholder={full ? `Limite de ${PROFILE_LIMITS.terms} termos` : placeholder}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
          aria-invalid={error ? true : undefined}
          maxLength={400}
          autoComplete="off"
          data-testid={`${testId}-input`}
          className={cn(chipInput, 'disabled:cursor-not-allowed disabled:opacity-50')}
        />
        <Button type="button" variant="outline" className="h-[2.625rem]" disabled={full || !text.trim()} onClick={add} data-testid={`${testId}-add`}>
          <Plus size={14} aria-hidden="true" />
          Adicionar
        </Button>
      </div>
      {note && <p className="mt-1.5 type-meta text-muted-foreground">{note}</p>}
      {error && (
        <p id={`${id}-error`} className={errorText}>
          {error}
        </p>
      )}
    </div>
  );
}

function MunicipalityAutocomplete({
  label,
  hint,
  selected,
  onSelect,
  testId,
}: {
  label: string;
  hint: string;
  selected: MunicipalityReference[];
  onSelect: (city: MunicipalityReference) => void;
  testId: string;
}) {
  const [query, setQuery] = useState('');
  const results = useProfileMunicipalities(query);
  const suggestions = (results.data?.data ?? []).filter((city) => !selected.some(({ ibgeCode }) => ibgeCode === city.ibgeCode));
  const listId = `${testId}-results`;
  return (
    <div>
      <label htmlFor={testId} className="block type-meta font-semibold text-muted-foreground">
        {label}
      </label>
      <p id={`${testId}-hint`} className="mt-1 type-meta text-muted-foreground">
        {hint}
      </p>
      <div className="relative mt-2.5">
        <input
          id={testId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={query.trim().length >= 2 && suggestions.length > 0}
          aria-controls={listId}
          aria-describedby={`${testId}-hint`}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Digite o nome da cidade"
          className={chipInput}
          data-testid={testId}
        />
        {query.trim().length >= 2 && (
          <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 ">
            {results.isFetching ? (
              <li className="px-3 py-2 type-meta text-muted-foreground">Buscando municípios…</li>
            ) : suggestions.length === 0 ? (
              <li className="px-3 py-2 type-meta text-muted-foreground">Nenhum município encontrado.</li>
            ) : (
              suggestions.map((city) => (
                <li key={city.ibgeCode} role="option" aria-selected="false">
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left type-ui hover:bg-muted focus-visible:focus-ring"
                    onClick={() => {
                      onSelect(city);
                      setQuery('');
                    }}
                  >
                    {city.name} — {city.state}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function DeleteProfileButton() {
  const [open, setOpen] = useState(false);
  const remove = useDeleteCompanyProfile();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        setOpen(next);
        if (next) remove.reset();
      }}
    >
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} data-testid="button-delete-company-profile">
        <Trash2 size={14} aria-hidden="true" />
        Apagar perfil
      </Button>
      <AlertDialogContent className="sm:max-w-md" data-testid="dialog-delete-company-profile">
        <AlertDialogHeader>
          <AlertDialogTitle className="type-title">Apagar o perfil da empresa?</AlertDialogTitle>
          <AlertDialogDescription className="type-meta text-muted-foreground">
            Os selos de aderência somem da busca e do detalhe. Editais salvos, buscas e alertas continuam.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="type-meta text-destructive">
            Não foi possível apagar agora. Tente de novo.
          </p>
        )}
        <AlertDialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={remove.isPending}
            data-testid="button-confirm-delete-company-profile"
            onClick={() =>
              remove.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  toast({ title: 'Perfil apagado' });
                },
              })
            }
          >
            Apagar perfil
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Company profile (CODEX_HANDOFF-013). Anyone signed in can keep it; the fit badges need access. */
export function CompanyProfileSection() {
  const profile = useCompanyProfile();
  const billing = useBilling();
  const save = useSaveCompanyProfile();
  const categories = useProfileCategories();
  const platforms = useProfilePlatforms();
  const saved = profile.data?.profile ?? null;
  const regionPreview = useCompanyRegionPreview(Boolean(saved));
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [descriptionForSuggestions, setDescriptionForSuggestions] = useState('');
  const [dismissedSuggestion, setDismissedSuggestion] = useState('');
  const descriptionSuggestions = useProfileDescriptionSuggestions(descriptionForSuggestions);
  const ids = useId();
  const profileStartTracked = useRef(false);

  useEffect(() => {
    if (!profile.isSuccess || saved || profileStartTracked.current) return;
    profileStartTracked.current = true;
    trackProfileSetup('profile_setup_start');
  }, [profile.isSuccess, saved]);

  // Load the stored profile into the form, and again after each save (new `version`). Keyed on the version, not the
  // object, so a background refetch of the same profile doesn't wipe what the user is typing.
  const savedKey = saved ? `${saved.version}` : 'none';
  useEffect(() => {
    setDraft(saved ? toDraft(saved) : emptyDraft);
    setErrors({});
    setSubmitted(false);
  }, [savedKey]);

  useEffect(() => {
    const description = draft.description.trim();
    const timer = window.setTimeout(() => setDescriptionForSuggestions(description), 650);
    return () => window.clearTimeout(timer);
  }, [draft.description]);

  const set = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (submitted) setErrors(validate(next));
  };

  const dirty = JSON.stringify(saved ? toDraft(saved) : emptyDraft) !== JSON.stringify(draft);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      document.getElementById(`${ids}-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    save.mutate(toInput(draft), {
      onSuccess: (response) => {
        if (!saved) trackProfileSetup('profile_setup_complete');
        toast({
          title: 'Perfil salvo',
          description:
            billing.data?.entitled && response.profile?.version !== saved?.version ? 'Os selos de aderência serão recalculados em instantes.' : undefined,
        });
      },
      onError: (error) => setErrors(serverErrors(error)),
    });
  };

  const descriptionLength = draft.description.trim().length;
  const suggestions = descriptionSuggestions.data;
  const showSuggestions = Boolean(
    suggestions &&
    dismissedSuggestion !== descriptionForSuggestions &&
    (suggestions.keywords.some(({ displayTerm }) => !draft.selectedKeywords.includes(displayTerm)) ||
      suggestions.categories.some(({ slug }) => !draft.selectedCategories.includes(slug))),
  );
  const acceptSuggestions = () => {
    if (!suggestions) return;
    set({
      selectedKeywords: [...new Set([...draft.selectedKeywords, ...suggestions.keywords.map(({ displayTerm }) => displayTerm)])].slice(0, PROFILE_LIMITS.terms),
      selectedCategories: [...new Set([...draft.selectedCategories, ...suggestions.categories.map(({ slug }) => slug)])],
    });
    setDismissedSuggestion(descriptionForSuggestions);
  };

  return (
    <section
      id="perfil-empresa"
      aria-labelledby="settings-company"
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7"
      data-testid="section-company-profile"
    >
      <h2 id="settings-company" className="type-section">
        Perfil da empresa
      </h2>
      <p className="mt-1 type-meta text-muted-foreground">
        Usamos o perfil para indicar, na busca e no detalhe, quais editais combinam com a sua empresa. A descrição e os termos vão para o serviço de IA que faz
        a avaliação; nome e e-mail não.
      </p>

      {billing.data && !billing.data.entitled && (
        <p
          role="note"
          className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground"
          data-testid="text-company-profile-no-access"
        >
          A aderência aparece durante o teste ou com a assinatura. O perfil fica guardado.{' '}
          <Link href={BILLING_HREF} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring">
            Ver assinatura
          </Link>
        </p>
      )}

      {profile.isError ? (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground"
        >
          Não foi possível carregar o perfil.
          <Button variant="outline" size="sm" onClick={() => profile.refetch()}>
            <RefreshCw size={14} aria-hidden="true" />
            Tentar novamente
          </Button>
        </div>
      ) : profile.isPending ? (
        <p className="mt-5 type-meta text-muted-foreground">Carregando perfil…</p>
      ) : (
        <form noValidate onSubmit={onSubmit} className="mt-6 grid gap-7" data-testid="form-company-profile">
          <label className="field">
            O que a empresa fornece
            <textarea
              id={`${ids}-description`}
              value={draft.description}
              maxLength={PROFILE_LIMITS.descriptionMax}
              onChange={(event) => set({ description: event.target.value })}
              placeholder="Ex.: Prestamos serviços de limpeza e conservação predial, com fornecimento de materiais, para órgãos públicos."
              aria-describedby={`${ids}-description-hint${errors.description ? ` ${ids}-description-error` : ''}`}
              aria-invalid={errors.description ? true : undefined}
              data-testid="input-company-description"
            />
            <span id={`${ids}-description-hint`} className="type-meta font-normal">
              Uma a três frases. {descriptionLength}/{PROFILE_LIMITS.descriptionMax}
            </span>
            {errors.description && (
              <span id={`${ids}-description-error`} className="type-meta font-normal text-destructive">
                {errors.description}
              </span>
            )}
          </label>

          {descriptionSuggestions.isFetching && descriptionForSuggestions.length >= PROFILE_LIMITS.descriptionMin && (
            <p role="status" className="type-meta text-muted-foreground">
              Analisando a descrição com o vocabulário dos editais…
            </p>
          )}
          {showSuggestions && suggestions && (
            <section
              aria-labelledby={`${ids}-automatic-suggestions`}
              className="rounded-xl border border-primary/25 bg-primary-subtle/40 p-4"
              data-testid="profile-description-suggestions"
            >
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h3 id={`${ids}-automatic-suggestions`} className="type-ui font-semibold">
                    Sugestões a partir da sua descrição
                  </h3>
                  <p className="mt-1 type-meta text-muted-foreground">Calculadas na nossa base, sem chamada de IA.</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {suggestions.categories.map((category) => (
                      <button
                        key={category.slug}
                        type="button"
                        onClick={() => set({ selectedCategories: [...new Set([...draft.selectedCategories, category.slug])] })}
                        className="rounded-pill border border-primary/25 bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary"
                      >
                        + {category.label}
                      </button>
                    ))}
                    {suggestions.keywords.map((keyword) => (
                      <button
                        key={keyword.normalizedTerm}
                        type="button"
                        onClick={() => set({ selectedKeywords: [...new Set([...draft.selectedKeywords, keyword.displayTerm])].slice(0, PROFILE_LIMITS.terms) })}
                        className="rounded-pill border border-primary/25 bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary"
                      >
                        + {keyword.displayTerm}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={acceptSuggestions}>
                      <Check size={14} aria-hidden />
                      Aceitar todas
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDismissedSuggestion(descriptionForSuggestions)}>
                      Recusar
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}

          <fieldset>
            <legend className="type-meta font-semibold text-muted-foreground">Categorias de interesse</legend>
            <p className="mt-1 type-meta text-muted-foreground">
              A mesma taxonomia usada para classificar os editais. O número mostra os editais abertos agora. Escolha até 20.
            </p>
            {categories.isPending ? (
              <p className="mt-3 type-meta text-muted-foreground">Carregando categorias…</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="profile-category-list">
                {(categories.data?.data ?? []).map((category) => {
                  const checked = draft.selectedCategories.includes(category.slug);
                  return (
                    <label
                      key={category.slug}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2',
                        checked ? selectedOption : 'border-border bg-surface hover:border-border-strong',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 type-ui">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!checked && draft.selectedCategories.length >= 20}
                          onChange={() =>
                            set({
                              selectedCategories: checked
                                ? draft.selectedCategories.filter((slug) => slug !== category.slug)
                                : [...draft.selectedCategories, category.slug].slice(0, 20),
                            })
                          }
                          className="size-4 accent-primary disabled:opacity-50"
                        />
                        <span>{category.label}</span>
                      </span>
                      <span className="shrink-0 type-data text-muted-foreground">{category.openTenderCount.toLocaleString('pt-BR')}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="type-meta font-semibold text-muted-foreground">Sou cadastrado em (opcional)</legend>
            <p className="mt-1 type-meta text-muted-foreground">
              Plataformas de disputa e SICAF. Editais nessas plataformas sobem nas recomendações, e avisamos quando a disputa for em outra. Não muda os selos de
              aderência.
            </p>
            {platforms.isPending ? (
              <p className="mt-3 type-meta text-muted-foreground">Carregando plataformas…</p>
            ) : platforms.isError ? (
              <p role="alert" className={errorText}>
                Não foi possível carregar as plataformas. Recarregue a página.
              </p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="profile-platform-list">
                {platforms.data.data.map((platform) => {
                  const checked = draft.registeredPlatforms.includes(platform.slug);
                  return (
                    <label
                      key={platform.slug}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2',
                        checked ? selectedOption : 'border-border bg-surface hover:border-border-strong',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 type-ui">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            set({
                              registeredPlatforms: checked
                                ? draft.registeredPlatforms.filter((slug) => slug !== platform.slug)
                                : [...draft.registeredPlatforms, platform.slug],
                            })
                          }
                          className="size-4 accent-primary"
                          data-testid={`checkbox-platform-${platform.slug}`}
                        />
                        <span>{platform.label}</span>
                      </span>
                      <span className="shrink-0 type-data text-muted-foreground">
                        {platform.openTenderCount === null ? 'cadastro federal' : platform.openTenderCount.toLocaleString('pt-BR')}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <SmartKeywordCombobox
            label="Palavras-chave inteligentes"
            hint="Digite pelo menos 2 caracteres. As sugestões e relações vêm dos títulos, objetos e itens dos editais abertos."
            placeholder="Ex.: som, ilumin, painel de led"
            selected={draft.selectedKeywords}
            onChange={(selectedKeywords) => set({ selectedKeywords })}
            testId="smart-keywords"
          />

          <SmartKeywordCombobox
            label="Palavras-chave a excluir"
            hint="Editais que contenham estes termos não entram nas recomendações nem nos alertas do perfil."
            placeholder="Ex.: dedetização"
            selected={draft.excludedKeywords}
            onChange={(excludedKeywords) => set({ excludedKeywords })}
            testId="smart-exclusions"
          />

          {suggestions && (
            <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 type-ui font-medium" data-testid="profile-open-tender-preview">
              ≈ {suggestions.estimatedOpenTenderCount.toLocaleString('pt-BR')} editais abertos combinam com seu perfil
            </p>
          )}

          <TermsField
            id={`${ids}-offerings`}
            label="Produtos e serviços principais"
            hint="Os termos que aparecem nos editais que interessam. Enter ou vírgula adiciona."
            placeholder="Ex.: limpeza predial, jardinagem"
            terms={draft.offerings}
            onChange={(offerings) => set({ offerings })}
            error={errors.offerings}
            testId="terms-offerings"
          />

          <TermsField
            id={`${ids}-exclusions`}
            label="O que a empresa não atende (opcional)"
            hint="Temas vizinhos que não são com vocês. Ajuda a tirar falsos positivos."
            placeholder="Ex.: material de limpeza, dedetização"
            terms={draft.exclusions}
            onChange={(exclusions) => set({ exclusions })}
            error={errors.exclusions}
            testId="terms-exclusions"
          />

          <fieldset aria-describedby={errors.states ? `${ids}-states-error` : undefined} className="rounded-xl border border-border bg-surface p-4 sm:p-5">
            <legend className="px-1 type-ui font-semibold text-foreground">Onde você atende</legend>
            <p className="type-meta text-muted-foreground">Combine macrorregiões, UFs, municípios e um raio a partir da sua cidade-sede.</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 type-ui">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  id={`${ids}-states`}
                  name={`${ids}-coverage`}
                  checked={draft.national}
                  onChange={() => set({ national: true })}
                  className="h-4 w-4 accent-primary"
                  data-testid="radio-coverage-national"
                />
                Brasil inteiro
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name={`${ids}-coverage`}
                  checked={!draft.national}
                  onChange={() => set({ national: false })}
                  className="h-4 w-4 accent-primary"
                  data-testid="radio-coverage-custom"
                />
                Definir minha região
              </label>
            </div>

            {!draft.national && (
              <div className="mt-5 grid gap-5">
                <div>
                  <p className="type-meta font-semibold text-muted-foreground">Macrorregiões</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Macrorregiões">
                    {macroregions.map((region) => {
                      const on = draft.regions.includes(region.value);
                      return (
                        <label
                          key={region.value}
                          className={cn(
                            'cursor-pointer rounded-pill border px-3 py-1.5 type-meta font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                            on
                              ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
                              : 'border-border bg-background hover:border-border-strong',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => set({ regions: on ? draft.regions.filter((item) => item !== region.value) : [...draft.regions, region.value] })}
                          />
                          {region.label}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="type-meta font-semibold text-muted-foreground">UFs</p>
                  <div className="mt-2 grid grid-cols-5 gap-1.5 sm:grid-cols-9" role="group" aria-label="Estados" data-testid="group-coverage-states">
                    {UFS.map((uf) => {
                      const on = draft.states.includes(uf);
                      return (
                        <label
                          key={uf}
                          className={cn(
                            'flex h-9 cursor-pointer items-center justify-center rounded-lg border text-xs font-semibold transition-colors duration-fast ease-standard has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                            on
                              ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
                              : 'border-border bg-background text-foreground hover:border-border-strong',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={on}
                            onChange={() => set({ states: on ? draft.states.filter((item) => item !== uf) : [...draft.states, uf] })}
                          />
                          {uf}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <MunicipalityAutocomplete
                    label="Municípios específicos"
                    hint="Base oficial do IBGE, com UF para diferenciar cidades de mesmo nome."
                    selected={draft.municipalities}
                    onSelect={(city) => set({ municipalities: [...draft.municipalities, city] })}
                    testId={`${ids}-municipality`}
                  />
                  {draft.municipalities.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Municípios selecionados">
                      {draft.municipalities.map((city) => (
                        <li
                          key={city.ibgeCode}
                          className="inline-flex items-center gap-1 rounded-pill bg-secondary py-1 pr-1 pl-2.5 text-xs font-medium text-secondary-foreground"
                        >
                          {city.name}-{city.state}
                          <button
                            type="button"
                            aria-label={`Remover ${city.name}-${city.state}`}
                            onClick={() => set({ municipalities: draft.municipalities.filter(({ ibgeCode }) => ibgeCode !== city.ibgeCode) })}
                            className="grid size-5 place-items-center rounded-full hover:bg-foreground/10 focus-visible:focus-ring"
                          >
                            <X size={12} aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
                  <MunicipalityAutocomplete
                    label="Cidade-sede para o raio (opcional)"
                    hint="Selecione a sede e depois a distância máxima."
                    selected={draft.headquarters ? [draft.headquarters] : []}
                    onSelect={(city) => set({ headquarters: city })}
                    testId={`${ids}-headquarters`}
                  />
                  <label className="field">
                    Raio máximo
                    <select
                      value={draft.radiusKm}
                      disabled={!draft.headquarters}
                      onChange={(event) => set({ radiusKm: Number(event.target.value) as Draft['radiusKm'] })}
                      data-testid="select-coverage-radius"
                    >
                      {[50, 100, 200, 300, 500].map((km) => (
                        <option key={km} value={km}>
                          {km} km
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {draft.headquarters && (
                  <p className="flex flex-wrap items-center gap-2 type-meta text-muted-foreground">
                    Raio a partir de{' '}
                    <span className="font-semibold text-foreground">
                      {draft.headquarters.name}-{draft.headquarters.state}
                    </span>
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline focus-visible:focus-ring"
                      onClick={() => set({ headquarters: null })}
                    >
                      Remover raio
                    </button>
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 grid gap-3">
              <fieldset>
                <legend className="type-meta font-semibold text-muted-foreground">Como usar a região</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label
                    className={cn(
                      'cursor-pointer rounded-lg border p-3',
                      draft.coverageMode === 'strict' ? selectedOption : 'border-border bg-background',
                    )}
                  >
                    <span className="flex items-start gap-2 type-ui font-medium">
                      <input
                        type="radio"
                        name={`${ids}-coverage-mode`}
                        checked={draft.coverageMode === 'strict'}
                        onChange={() => set({ coverageMode: 'strict' })}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      Somente na minha região
                    </span>
                    <span className="mt-1 block pl-6 type-meta text-muted-foreground">Editais fora dela não entram nas recomendações e alertas.</span>
                  </label>
                  <label
                    className={cn(
                      'cursor-pointer rounded-lg border p-3',
                      draft.coverageMode === 'prioritize' ? selectedOption : 'border-border bg-background',
                    )}
                  >
                    <span className="flex items-start gap-2 type-ui font-medium">
                      <input
                        type="radio"
                        name={`${ids}-coverage-mode`}
                        checked={draft.coverageMode === 'prioritize'}
                        onChange={() => set({ coverageMode: 'prioritize' })}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      Priorizar minha região
                    </span>
                    <span className="mt-1 block pl-6 type-meta text-muted-foreground">Outros podem aparecer identificados como “Fora da sua região”.</span>
                  </label>
                </div>
              </fieldset>
              <label className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 type-ui">
                <input
                  type="checkbox"
                  checked={draft.acceptsRemote}
                  onChange={(event) => set({ acceptsRemote: event.target.checked })}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="font-medium">Aceito contratos executados à distância/remotos</span>
                  <span className="mt-1 block type-meta text-muted-foreground">
                    Considerado quando a categoria permite execução remota, como software ou consultoria.
                  </span>
                </span>
              </label>
            </div>

            {errors.states && (
              <p id={`${ids}-states-error`} className={errorText}>
                {errors.states}
              </p>
            )}
            {saved && (
              <p role="status" className="mt-4 rounded-lg border border-border bg-muted px-4 py-3 type-ui font-medium" data-testid="profile-region-preview">
                {regionPreview.isPending
                  ? 'Calculando editais abertos na sua região…'
                  : `≈ ${(regionPreview.data?.count ?? 0).toLocaleString('pt-BR')} editais abertos na sua região`}
                {dirty ? <span className="ml-1 type-meta font-normal text-muted-foreground">(salve para atualizar)</span> : null}
              </p>
            )}
          </fieldset>

          <fieldset aria-describedby={`${ids}-value-hint${errors.valueRange ? ` ${ids}-valueRange-error` : ''}`}>
            <legend className="type-meta font-semibold text-muted-foreground">Faixa de valor (opcional)</legend>
            <p id={`${ids}-value-hint`} className="mt-1 type-meta text-muted-foreground">
              Em reais, sem centavos. Editais sem valor publicado não são descartados.
            </p>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
              <label className="field">
                De
                <input
                  id={`${ids}-valueRange`}
                  inputMode="numeric"
                  value={reaisLabel(draft.min)}
                  onChange={(event) => set({ min: event.target.value.replace(/\D/g, '') })}
                  placeholder="sem mínimo"
                  aria-invalid={errors.valueRange ? true : undefined}
                  data-testid="input-company-value-min"
                />
              </label>
              <label className="field">
                Até
                <input
                  inputMode="numeric"
                  value={reaisLabel(draft.max)}
                  onChange={(event) => set({ max: event.target.value.replace(/\D/g, '') })}
                  placeholder="sem máximo"
                  aria-invalid={errors.valueRange ? true : undefined}
                  data-testid="input-company-value-max"
                />
              </label>
            </div>
            {errors.valueRange && (
              <p id={`${ids}-valueRange-error`} className={errorText}>
                {errors.valueRange}
              </p>
            )}
          </fieldset>

          <fieldset aria-describedby={errors.size ? `${ids}-size-error` : undefined}>
            <legend className="type-meta font-semibold text-muted-foreground">Porte</legend>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {sizeOptions.map((option, index) => (
                <label
                  key={option.value}
                  className={cn(
                    'flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors duration-fast ease-standard has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    draft.size === option.value ? selectedOption : 'border-border bg-surface hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    id={index === 0 ? `${ids}-size` : undefined}
                    name={`${ids}-size`}
                    checked={draft.size === option.value}
                    onChange={() => set({ size: option.value })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                    data-testid={`radio-size-${option.value}`}
                  />
                  <span>
                    <span className="block type-ui font-medium text-foreground">{option.label}</span>
                    {option.hint && <span className="mt-0.5 block type-meta text-muted-foreground">{option.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
            {errors.size && (
              <p id={`${ids}-size-error`} className={errorText}>
                {errors.size}
              </p>
            )}
          </fieldset>

          {errors.form && (
            <p
              role="alert"
              id={`${ids}-form`}
              className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground"
            >
              {errors.form}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <span className="type-meta text-muted-foreground" data-testid="text-company-profile-updated">
              {saved ? `Salvo em ${formatDateTime(saved.updatedAt)}` : 'Ainda não salvo'}
            </span>
            <div className="flex flex-wrap gap-2">
              {saved && <DeleteProfileButton />}
              <Button type="submit" loading={save.isPending} disabled={!dirty} data-testid="button-save-company-profile">
                Salvar perfil
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
