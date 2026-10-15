import React, { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { isApiError, type CompanyProfile, type CompanyProfileInput } from '@/api';
import { Button, buttonClass } from '@/components/common/action-button';
import { ErrorState } from '@/components/common/query-states';
import { OfferingTermsField } from '@/features/company-profile/components/offering-terms-field';
import { combinedOfferingTerms } from '@/features/company-profile/components/offering-terms-state';
import { useProfileMatchPreview, useProfilePlatforms, useSaveCompanyProfile } from '@/features/company-profile/hooks/use-company-profile';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { useRecommendations } from '@/features/recommendations/hooks/use-recommendations';
import { useCreateSavedSearch } from '@/features/saved-searches/hooks/use-saved-searches';
import { savedSearchQuery } from '@/services/account-service';
import { queryKeys } from '@/services/query-keys';
import { RegionStep } from './region-step';
import { ProfileMeter } from './profile-meter';
import { emptyGuidedDraft, guidedAlertParams, guidedProfileInput, validateGuidedStep, type GuidedDraft } from './profile-progress';

const titles = ['O que você vende ou faz?', 'Onde você atende?', 'Qual faixa de valor faz sentido?', 'Qual é o porte da sua empresa?'];
const hints = [
  'Escolha os termos que descrevem seu trabalho.',
  'Aproxime a seleção da sua área de atendimento.',
  'Ajude a selecionar contratos do tamanho da sua empresa.',
  'Finalize o essencial. Os cadastros em plataformas são opcionais.',
];

function MatchCounter({ draft }: { draft: GuidedDraft }) {
  const termsKey = JSON.stringify([combinedOfferingTerms(draft), draft.selectedCategories]);
  const [debouncedKey, setDebouncedKey] = useState(termsKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKey(termsKey), 600);
    return () => window.clearTimeout(timer);
  }, [termsKey]);
  const [terms, categories] = JSON.parse(debouncedKey) as [string[], string[]];
  const preview = useProfileMatchPreview(terms, categories);
  const hasTerms = combinedOfferingTerms(draft).length + draft.selectedCategories.length > 0;
  const updating = termsKey !== debouncedKey || preview.isFetching;
  return (
    <div className="rounded-xl border border-border bg-accent p-4 text-accent-foreground" data-testid="guided-match-counter">
      <p role="status" aria-live="polite" aria-atomic="true" className="type-ui font-semibold">
        {!hasTerms
          ? 'Adicione um termo para estimar os editais abertos.'
          : updating
            ? 'Calculando editais abertos que combinam…'
            : preview.isError
              ? 'Não foi possível calcular agora.'
              : preview.data
                ? `≈ ${preview.data.estimatedOpenTenderCount.toLocaleString('pt-BR')} editais abertos combinam`
                : 'Calculando editais abertos que combinam…'}
      </p>
      <p className="mt-1 type-meta">
        Estimativa por termos e categorias. Região, valor e porte não entram neste contador; a seleção final pode ser diferente.
      </p>
      {preview.isError && hasTerms && (
        <button type="button" className="mt-2 type-meta font-semibold underline" onClick={() => void preview.refetch()}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

function Completion({ profile, onComplete }: { profile: CompanyProfileInput; onComplete: () => void }) {
  const recommendations = useRecommendations(3);
  const billing = useBilling();
  const alert = useCreateSavedSearch();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  const items = recommendations.data?.data.slice(0, 3) ?? [];
  const [alertQuery, setAlertQuery] = useState(() => guidedAlertParams(profile).q ?? '');
  const alertParams = { ...guidedAlertParams(profile), q: alertQuery.trim() };
  const invalidAlertQuery = !alertParams.q || savedSearchQuery(alertParams).length > 2000;
  const alertError =
    isApiError(alert.error) && alert.error.status === 409
      ? 'Esta busca já está salva ou você atingiu o limite. Confira suas buscas salvas.'
      : isApiError(alert.error) && alert.error.status === 402
        ? 'Seu acesso mudou. Confira a assinatura para criar o alerta.'
        : 'Não foi possível criar o alerta. Seu perfil continua salvo; tente novamente.';
  return (
    <section className="mx-auto max-w-3xl space-y-6" data-testid="guided-completion">
      <div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-pill bg-primary-subtle px-3 py-1 type-meta text-primary-subtle-foreground">
          <Check size={15} aria-hidden /> Perfil salvo
        </p>
        <h1 ref={title} tabIndex={-1} className="type-title">
          Seu próximo edital começa aqui.
        </h1>
        <p className="mt-2 type-ui text-muted-foreground">
          Seu perfil já está pronto para orientar a seleção. Você pode ajustá-lo quando quiser.
        </p>
      </div>
      <ProfileMeter profile={profile} />
      <div>
        <h2 className="type-section">Primeiras recomendações</h2>
        {!billing.data?.entitled ? (
          <p className="mt-3 type-ui text-muted-foreground">
            Recomendações e alertas ficam disponíveis durante o teste ou com assinatura. Seu perfil está salvo e a busca continua aberta.
          </p>
        ) : recommendations.isError ? (
          <div className="mt-3">
            <ErrorState error={recommendations.error} onRetry={() => void recommendations.refetch()} />
          </div>
        ) : recommendations.isPending ? (
          <p role="status" className="mt-3 type-ui">
            Buscando recomendações…
          </p>
        ) : items.length === 0 ? (
          <p className="mt-3 type-ui text-muted-foreground">
            Ainda não encontramos recomendações para mostrar. Explore editais e ajuste seus termos quando quiser.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {items.map(({ tender, reasons }) => (
              <li key={tender.id} className="p-4">
                <Link href={`/tenders/${encodeURIComponent(tender.id)}`} className="type-ui font-semibold hover:underline">
                  {tender.title}
                </Link>
                <p className="mt-2 type-meta text-muted-foreground">{reasons.map((reason) => reason.text).join(' · ')}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="type-section">Continue acompanhando</h2>
        <p className="mt-2 break-words type-meta text-muted-foreground">
          O alerta procura todas as palavras abaixo e usa sua faixa de valor. Região, porte, plataformas e exclusões do perfil não entram
          nesta busca salva; os resultados podem ser diferentes das recomendações.
        </p>
        {!alert.isSuccess && (
          <label className="field mt-4">
            Termos do alerta
            <input
              value={alertQuery}
              onChange={(event) => setAlertQuery(event.target.value)}
              aria-invalid={invalidAlertQuery || undefined}
            />
            <span className="type-meta font-normal">Você pode ajustar os termos antes de criar o alerta.</span>
          </label>
        )}
        {invalidAlertQuery && (
          <p className="mt-2 type-meta">Use ao menos um termo e reduza o texto se ultrapassar o limite da busca salva.</p>
        )}
        {alert.isSuccess ? (
          <p role="status" className="mt-4 type-ui font-semibold">
            Alerta criado. Você pode ajustar os termos em{' '}
            <Link href="/saved-searches" className="underline">
              Buscas salvas
            </Link>
            .
          </p>
        ) : billing.data?.entitled ? (
          <Button
            className="mt-4"
            disabled={invalidAlertQuery}
            loading={alert.isPending}
            onClick={() => alert.mutate({ name: 'Editais do meu perfil', params: alertParams, alertsEnabled: true })}
          >
            Criar alerta destes editais
          </Button>
        ) : (
          <Link href="/settings?billing=required#assinatura" className={`${buttonClass('outline')} mt-4`}>
            Ver acesso aos alertas
          </Link>
        )}
        {alert.isError && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground"
          >
            {alertError}
            {isApiError(alert.error) && alert.error.requestId ? ` (ref. ${alert.error.requestId})` : ''}{' '}
            <Link href="/saved-searches" className="underline">
              Ver buscas salvas
            </Link>
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={onComplete}>
          Ir para a Visão geral
        </Button>
        <Link href="/search" className={buttonClass('ghost')}>
          Explorar editais
        </Link>
      </div>
    </section>
  );
}

export function GuidedOnboarding({
  initialProfile,
  initialStep = 0,
  onDismiss,
  onComplete,
}: {
  initialProfile: CompanyProfile | null;
  initialStep?: number;
  onDismiss: () => void;
  onComplete: () => void;
}) {
  const [draft, setDraft] = useState<GuidedDraft>(() => initialProfile ?? emptyGuidedDraft());
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<CompanyProfileInput | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const save = useSaveCompanyProfile();
  const platforms = useProfilePlatforms();
  const client = useQueryClient();
  const id = useId();
  useEffect(() => {
    title.current?.focus();
  }, [step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const update = (patch: Partial<GuidedDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };
  const move = (next: number) => {
    setError(null);
    setStep(next);
  };
  const finish = () => {
    for (let index = 0; index < 4; index++) {
      const found = validateGuidedStep(draft, index);
      if (found) {
        setStep(index);
        setError(found);
        return;
      }
    }
    const input = guidedProfileInput(draft);
    save.mutate(input, {
      onSuccess: () => {
        // The profile hook deliberately stays untouched; invalidate recommendations at this integration boundary.
        void client.invalidateQueries({ queryKey: queryKeys.me.recommendations });
        setCompleted(input);
      },
      onError: (failure) =>
        setError(
          `Não foi possível salvar o perfil. Seus dados continuam nesta tela. Tente novamente.${isApiError(failure) && failure.requestId ? ` (ref. ${failure.requestId})` : ''}`,
        ),
    });
  };
  const advance = (event: FormEvent) => {
    event.preventDefault();
    const found = validateGuidedStep(draft, step);
    if (found) {
      setError(found);
      return;
    }
    if (step === 3) finish();
    else move(step + 1);
  };
  if (completed) return <Completion profile={completed} onComplete={onComplete} />;
  return (
    <section className="mx-auto max-w-3xl" aria-labelledby={`${id}-title`} data-testid="guided-onboarding">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="type-meta font-semibold text-muted-foreground">Começo guiado · cerca de 3 minutos</p>
        <Button variant="ghost" onClick={onDismiss} disabled={save.isPending}>
          Continuar depois
        </Button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="type-meta font-semibold">
        Passo {step + 1} de 4
      </p>
      <div className="mt-3 flex gap-2" aria-hidden>
        {titles.map((_, index) => (
          <span key={index} className={`h-1.5 flex-1 rounded-pill ${index <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>
      <h1 id={`${id}-title`} ref={title} tabIndex={-1} className="mt-7 type-title">
        {titles[step]}
      </h1>
      <p className="mt-2 type-ui text-muted-foreground">{hints[step]}</p>
      <div className="mt-5">
        <MatchCounter draft={draft} />
      </div>
      <form onSubmit={advance} className="mt-6 space-y-6" noValidate>
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
          {step === 0 && (
            <>
              <OfferingTermsField id={`${id}-terms`} lists={draft} onChange={update} />
              <p className="mt-5 type-meta text-muted-foreground">
                A descrição do perfil será{' '}
                {draft.description ? 'mantida como já está salva.' : 'montada com estes termos. Você poderá editá-la no perfil.'}
              </p>
            </>
          )}
          {step === 1 && <RegionStep value={draft.coverage} onChange={(coverage) => update({ coverage })} />}
          {step === 2 && (
            <fieldset>
              <legend className="type-ui font-semibold">Faixa de valor em reais (opcional)</legend>
              <p className="mt-2 type-meta text-muted-foreground">
                Deixe em branco para não limitar. Editais sem valor publicado não são descartados nas recomendações do perfil.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {(['min', 'max'] as const).map((key) => (
                  <label key={key} className="field">
                    {key === 'min' ? 'Valor mínimo (R$)' : 'Valor máximo (R$)'}
                    <input
                      inputMode="numeric"
                      value={draft.valueRange[key] ?? ''}
                      placeholder={key === 'min' ? 'Sem mínimo' : 'Sem máximo'}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, '');
                        update({ valueRange: { ...draft.valueRange, [key]: digits ? Number(digits) : null } });
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {step === 3 && (
            <div className="space-y-6">
              <fieldset>
                <legend className="type-ui font-semibold">Porte da empresa</legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['me_epp', 'ME ou EPP'],
                      ['cooperative', 'Cooperativa'],
                      ['other', 'Outro porte'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 rounded-lg border border-border p-3 type-ui">
                      <input type="radio" name={`${id}-size`} checked={draft.size === value} onChange={() => update({ size: value })} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="type-ui font-semibold">Plataformas em que já está cadastrado (opcional)</legend>
                <p className="mt-2 type-meta text-muted-foreground">
                  Isso ajuda a identificar editais que pedem outro cadastro. Se não usa nenhuma, pode deixar em branco.
                </p>
                {platforms.isError ? (
                  <p className="mt-3 type-meta">
                    Não foi possível carregar as plataformas. Você pode adicioná-las depois.{' '}
                    <button type="button" className="underline" onClick={() => void platforms.refetch()}>
                      Tentar novamente
                    </button>
                  </p>
                ) : platforms.isPending ? (
                  <p role="status" className="mt-3 type-meta">
                    Carregando plataformas…
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {platforms.data.data.map((platform) => (
                      <label key={platform.slug} className="flex items-center gap-2 type-ui">
                        <input
                          type="checkbox"
                          checked={draft.registeredPlatforms.includes(platform.slug)}
                          onChange={() =>
                            update({
                              registeredPlatforms: draft.registeredPlatforms.includes(platform.slug)
                                ? draft.registeredPlatforms.filter((slug) => slug !== platform.slug)
                                : [...draft.registeredPlatforms, platform.slug],
                            })
                          }
                        />
                        {platform.label}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </div>
          )}
        </div>
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-ui text-destructive-subtle-foreground"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={step === 0 || save.isPending} onClick={() => move(step - 1)}>
            <ArrowLeft size={15} aria-hidden />
            Voltar
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => (step === 3 ? onDismiss() : move(step + 1))}>
              Pular{step === 3 ? ' e sair' : ''}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {step === 3 ? 'Salvar e ver editais' : 'Avançar'}
              <ArrowRight size={15} aria-hidden />
            </Button>
          </div>
        </div>
        <p className="type-meta text-muted-foreground">
          Só salvamos ao concluir. Ao sair, o rascunho é descartado. Os termos e o porte são necessários para salvar; você pode pular agora
          e voltar a eles no final.
        </p>
      </form>
    </section>
  );
}
