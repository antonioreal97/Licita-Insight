import { useId, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowDown, ArrowRight, Info, Loader2, Scale } from 'lucide-react';
import type { CompanyProfile, FitReason, SheetFieldId, TenderDetail, TenderSheet } from '@/api';
import { Button, buttonClass } from '@/components/common/action-button';
import { signInWithGoogle, useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { FitBadge, PROFILE_HREF, reasonText } from '@/features/company-profile/components/fit-badge';
import { useCompanyProfile, useTenderFits } from '@/features/company-profile/hooks/use-company-profile';
import { DeadlineIndicator } from '@/features/tenders/components/deadline-indicator';
import { SourceLink } from '@/features/tenders/components/source-link';
import { ValueDisplay } from '@/features/tenders/components/value-display';
import { useTenderSheet } from '@/features/tenders/hooks/use-tender-sheet';
import { FIELDS } from '@/features/tenders/lib/sheet-labels';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AUTO_PASSAGES_NOTICE } from '../lib/provenance';
import { ErrorLine, withRef } from './error-line';
import { ProvenanceLabel } from './provenance-label';

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';
const noteBox = 'flex gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground';
const lineSkeleton = <div aria-busy="true" aria-label="Carregando" className="h-5 w-2/3 animate-pulse rounded-lg bg-muted" />;

/** Rules a bidder weighs first. Only a found passage with a categorical answer shows here; the rest stays in the ficha. */
const DECISION_FIELDS: SheetFieldId[] = ['me_epp', 'consortium', 'site_visit', 'samples', 'bid_guarantee'];
const VALUE_REASONS = new Set<FitReason['kind']>(['out_of_value_range', 'value_not_published']);

function Row({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4" data-testid={testId}>
      <dt className="type-ui font-medium text-foreground">{label}</dt>
      <dd className="min-w-0 space-y-1.5">{children}</dd>
    </div>
  );
}

function profileRange({ min, max }: CompanyProfile['valueRange']) {
  if (min !== null && max !== null) return `Seu perfil diz: faixa de ${formatCurrency(min)} a ${formatCurrency(max)}.`;
  if (min !== null) return `Seu perfil diz: a partir de ${formatCurrency(min)}.`;
  if (max !== null) return `Seu perfil diz: até ${formatCurrency(max)}.`;
  return 'Sem faixa de valor no seu perfil.';
}

const PROFILE_SIZE: Record<CompanyProfile['size'], string> = {
  me_epp: 'Seu perfil diz que vocês são ME/EPP.',
  cooperative: 'Seu perfil diz que vocês são cooperativa.',
  other: 'Seu perfil diz que vocês não são ME/EPP.',
};

/** Reading of the documents: rules found with a categorical answer, then how much of the ficha was found. */
function FoundRows({ sheet, profile }: { sheet: TenderSheet; profile: CompanyProfile | null }) {
  if (sheet.status !== 'ready') {
    return (
      <Row label="Leitura" testId="decision-row-reading">
        <span className="type-meta text-muted-foreground">A ficha não pôde ser montada. Veja o motivo na ficha do edital.</span>
      </Row>
    );
  }
  const byId = new Map(sheet.fields.map((field) => [field.id, field]));
  const found = sheet.fields.filter((field) => field.status === 'found').length;
  return (
    <>
      {DECISION_FIELDS.map((id) => {
        const field = byId.get(id);
        const answer = field?.status === 'found' && field.evidence && field.answer ? FIELDS[id].answers?.[field.answer] : undefined;
        if (!field || !answer) return null;
        return (
          <Row key={id} label={FIELDS[id].label} testId={`decision-row-${id}`}>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="type-ui font-semibold text-foreground">{answer}</span>
              <SourceLink evidence={field.evidence} />
            </p>
            {id === 'me_epp' && profile && <ProvenanceLabel kind="profile">{PROFILE_SIZE[profile.size]}</ProvenanceLabel>}
          </Row>
        );
      })}
      <Row label="Leitura" testId="decision-row-reading">
        <span className="type-meta text-muted-foreground">
          {found === 0 ? 'Nenhum dos campos foi encontrado nos documentos lidos.' : `${found} de ${sheet.fields.length} campos encontrados nos documentos.`}
          {sheet.unreadDocuments > 0 &&
            ` ${sheet.unreadDocuments === 1 ? '1 documento não pôde ser lido' : `${sheet.unreadDocuments} documentos não puderam ser lidos`}; a ficha pode estar incompleta.`}
        </span>
      </Row>
    </>
  );
}

/**
 * "Antes de decidir": what weighs on the decision, each line with its origin (official, found in the edital,
 * automatic fit, the user's profile). Shows facts, never a verdict. The only place on the detail that explains the access gate.
 */
export function DecisionPanel({ tender }: { tender: TenderDetail }) {
  const session = useSession();
  const billing = useBilling();
  const entitled = billing.data?.entitled === true;
  const profile = useCompanyProfile();
  const fits = useTenderFits([tender.id]);
  const sheet = useTenderSheet(tender.id, entitled);
  const titleId = useId();

  const companyProfile = entitled ? (profile.data?.profile ?? null) : null;
  const fit = fits.data?.results[tender.id];
  const meEpp = sheet.data?.status === 'ready' ? sheet.data.fields.find((field) => field.id === 'me_epp') : undefined;
  const meEppShown = Boolean(meEpp?.status === 'found' && meEpp.evidence && meEpp.answer && FIELDS.me_epp.answers?.[meEpp.answer]);
  const valueReasons = fit?.reasons.filter((reason) => VALUE_REASONS.has(reason.kind)) ?? [];
  const fitReasons = fit?.reasons.filter((reason) => !VALUE_REASONS.has(reason.kind) && !(meEppShown && reason.kind === 'size_restricted')) ?? [];

  let fitRow: ReactNode = null;
  if (entitled) {
    let body: ReactNode;
    if (profile.isPending) body = lineSkeleton;
    else if (profile.isError || fits.isError) {
      body = (
        <ErrorLine
          testId="text-fit-error"
          message={withRef('Não foi possível avaliar a aderência agora.', profile.error ?? fits.error)}
          onRetry={() => (profile.isError ? profile.refetch() : fits.refetch())}
        />
      );
    } else if (!companyProfile) {
      body = (
        <p className="type-meta text-foreground" data-testid="text-fit-invite">
          Cadastre o que sua empresa fornece e onde atua para ver a aderência e sua faixa de valor aqui.{' '}
          <Link href={PROFILE_HREF} className={linkClass}>
            Cadastrar perfil
          </Link>
        </p>
      );
    } else if (!fit || fit.status === 'pending') {
      body = (
        <p role="status" className="flex items-center gap-2 type-meta text-muted-foreground" data-testid="text-fit-pending">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Avaliando a aderência ao seu perfil…
        </p>
      );
    } else {
      body = (
        <>
          <FitBadge fit={{ ...fit, reasons: [] }} className="text-xs" />
          {fitReasons.length > 0 && (
            <ul className="space-y-1.5">
              {fitReasons.map((reason, index) => (
                <li key={`${reason.kind}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-foreground/90">
                  {reasonText(reason)}
                  {reason.kind === 'size_restricted' && <SourceLink evidence={reason.evidence} />}
                </li>
              ))}
            </ul>
          )}
          <ProvenanceLabel kind="automatic">
            Avaliação automática com base no{' '}
            <Link href={PROFILE_HREF} className={linkClass}>
              perfil da empresa
            </Link>
            .
          </ProvenanceLabel>
        </>
      );
    }
    fitRow = (
      <Row label="Aderência" testId="decision-row-fit">
        {body}
      </Row>
    );
  }

  let found: ReactNode = null;
  /** True only once the sheet's passages are on screen; loading, error and reading states get no notice. */
  let passagesShown = false;
  let gate: ReactNode = null;
  if (session.status === 'anonymous') {
    gate = (
      <div className={cn(noteBox, 'flex-wrap items-center justify-between')} data-testid="text-decision-gate" data-reason="anonymous">
        <span className="flex gap-2.5">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          Entre com Google para ver a ficha, a aderência ao seu perfil e o que preparar.
        </span>
        <Button size="sm" onClick={() => signInWithGoogle()} data-testid="button-decision-sign-in">
          Entrar com Google
        </Button>
      </div>
    );
  } else if (billing.isError) {
    gate = <ErrorLine testId="text-decision-billing-error" message={withRef('Não foi possível verificar sua assinatura.', billing.error)} onRetry={() => billing.refetch()} />;
  } else if (billing.data?.entitled === false) {
    gate = (
      <div className={cn(noteBox, 'flex-wrap items-center justify-between')} data-testid="text-decision-gate" data-reason="no-access">
        <span className="flex gap-2.5">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          Ficha, aderência e checklist fazem parte da assinatura.
        </span>
        <Link href={BILLING_HREF} className={buttonClass('primary', 'sm')} data-testid="link-decision-subscribe">
          Ver assinatura
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    );
  } else if (!entitled || sheet.isPending) {
    found = lineSkeleton;
  } else if (sheet.isError) {
    found = <ErrorLine testId="text-decision-sheet-error" message={withRef('Não foi possível carregar a ficha.', sheet.error)} onRetry={() => sheet.refetch()} />;
  } else if (sheet.data.status === 'not_started' || sheet.data.status === 'processing') {
    found = (
      <p role="status" className="flex items-center gap-2 type-meta text-muted-foreground" data-testid="text-decision-sheet-building">
        <Loader2 size={14} aria-hidden="true" className="animate-spin" />
        Lendo os documentos… (até um minuto na primeira vez)
      </p>
    );
  } else {
    passagesShown = true;
    found = (
      <dl className="divide-y divide-border-subtle">
        <FoundRows sheet={sheet.data} profile={companyProfile} />
      </dl>
    );
  }

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-decision">
      <div className="mb-4 flex items-center gap-2">
        <Scale size={17} aria-hidden="true" className="text-primary" />
        <h2 id={titleId} className="type-section text-foreground">
          Antes de decidir
        </h2>
      </div>
      <dl className="divide-y divide-border-subtle">
        <Row label="Prazo de propostas" testId="decision-row-deadline">
          <DeadlineIndicator deadline={tender.proposalDeadline} status={tender.status} variant="inline" />
        </Row>
        <Row label="Valor estimado" testId="decision-row-value">
          <ValueDisplay value={tender.estimatedValue} status={tender.estimatedValueStatus} flag={tender.estimatedValueFlag} nullLabel="Sigiloso / não informado" className="type-ui" />
          {companyProfile && <ProvenanceLabel kind="profile">{profileRange(companyProfile.valueRange)}</ProvenanceLabel>}
          {companyProfile &&
            valueReasons.map((reason) => (
              <ProvenanceLabel key={reason.kind} kind="automatic">
                {reasonText(reason)}
              </ProvenanceLabel>
            ))}
        </Row>
        {fitRow}
      </dl>
      {gate && <div className="mt-5">{gate}</div>}
      {found && (
        <div className="mt-5 border-t border-border-subtle pt-5">
          {/* The detail's only warning about automatic passages: here they first appear, before the decision. */}
          {passagesShown && (
            <p className="mb-3" data-testid="text-sheet-disclaimer">
              <ProvenanceLabel kind="found">Encontrado no edital. {AUTO_PASSAGES_NOTICE}</ProvenanceLabel>
            </p>
          )}
          {found}
        </div>
      )}
      {entitled && (
        <a href="#ficha" className={cn('mt-5 inline-flex items-center gap-1 type-meta', linkClass)} data-testid="link-decision-sheet">
          Ver ficha completa
          <ArrowDown size={13} aria-hidden="true" />
        </a>
      )}
    </section>
  );
}
