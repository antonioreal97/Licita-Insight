import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, CircleAlert, ClipboardList, Info, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { isApiError, type ChecklistKey, type QualificationItem, type QualificationType, type RegistrationRequirement, type SheetField, type SheetFieldId, type TenderSheet } from '@/api';
import { Button } from '@/components/common/action-button';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { IncludedInAccessHint } from '@/features/opportunities/components/access-gate';
import { ChecklistControl, ChecklistSummary } from '@/features/participation/components/prep-checklist';
import { ProvenanceLabel } from '@/features/participation/components/provenance-label';
import { cn } from '@/lib/utils';
import { useTenderSheet } from '../hooks/use-tender-sheet';
import { tendersExhaustedMessage } from '../lib/ai-quota';
import { registrationRequirementText } from '../lib/registration-requirement';
import { sheetExcerpt } from '../lib/sheet-excerpt';
import { FIELDS, QUALIFICATION_LABELS, QUALIFICATION_ORDER } from '../lib/sheet-labels';
import { SourceLink } from './source-link';
import { AutomaticSummary } from './automatic-summary';
import { DocumentReadingNotice } from './document-reading-notice';

/** One row per requirement type; each official passage keeps its own page link. `prep`: the user's mark, in "O que preparar". */
function QualificationRow({ type, items, sourceNumbers, prep }: { type: QualificationType; items: QualificationItem[]; sourceNumbers: number[]; prep?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const passagesId = useId();
  const single = items.length === 1;
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4" data-testid="qualification-item" data-type={type}>
      <dt className="type-ui font-medium text-foreground">{QUALIFICATION_LABELS[type]}</dt>
      <dd className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="type-meta text-muted-foreground">{single ? 'Exigido' : `Exigido em ${items.length} trechos`}</span>
          {items.map((item, index) => (
            <span key={`${item.evidence.documentUrl}-${item.evidence.page}`} id={`sheet-summary-source-${sourceNumbers[index]}`} className="scroll-mt-24">
              <SourceLink evidence={item.evidence} />
            </span>
          ))}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={passagesId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg type-meta font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
            data-testid="button-qualification-toggle"
          >
            {open ? 'Ocultar' : single ? 'Ver trecho' : 'Ver trechos'}
            <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
          </button>
        </div>
        {open && (
          <div id={passagesId} className="mt-2 space-y-2">
            {items.map((item) => (
              <blockquote key={`${item.evidence.documentUrl}-${item.evidence.page}`} className="border-l-2 border-primary/50 pl-3 type-meta break-words text-foreground/90">
                {!single && <span className="mr-1.5 font-semibold text-muted-foreground">p. {item.evidence.page}</span>}
                {item.evidence.text}
              </blockquote>
            ))}
          </div>
        )}
        {prep}
      </dd>
    </div>
  );
}

/** Groups, in the order a bidder asks: can I take part, what must I prepare, what is at stake, how it runs. */
const GROUPS: { title: string; ids: SheetFieldId[]; prepare?: boolean }[] = [
  { title: 'Quem pode participar', ids: ['consortium', 'subcontracting', 'me_epp', 'site_visit', 'samples'] },
  { title: 'O que preparar', ids: ['technical_qualification', 'financial_qualification', 'site_visit', 'samples', 'bid_guarantee'], prepare: true },
  { title: 'Garantias e multas', ids: ['bid_guarantee', 'contract_guarantee', 'penalties'] },
  { title: 'Execução do contrato', ids: ['contract_term', 'delivery_term', 'price_adjustment'] },
];

/** Only a found passage with this exact answer moves the field into "O que preparar"; anything else stays in its own group. */
const PREPARE_WHEN: Partial<Record<SheetFieldId, string>> = { site_visit: 'mandatory', samples: 'required', bid_guarantee: 'required' };
const toPrepare = (field: SheetField) => field.status === 'found' && Boolean(field.evidence) && PREPARE_WHEN[field.id] === field.answer;

/** A checklist item of these types already cites the passage; the single fixed field would repeat it. */
const COVERED_BY_CHECKLIST: Partial<Record<SheetFieldId, QualificationType>> = {
  technical_qualification: 'qualificacao_tecnica',
  financial_qualification: 'qualificacao_economica',
};

/** Key the user's mark is stored under (participation-v1) for each field that can appear in "O que preparar". */
const PREP_KEY: Partial<Record<SheetFieldId, ChecklistKey>> = { ...COVERED_BY_CHECKLIST, site_visit: 'site_visit', samples: 'samples', bid_guarantee: 'bid_guarantee' };

const noteBox = 'flex gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground';
const errorBox = 'flex gap-2.5 rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-4 py-3 type-meta text-destructive-subtle-foreground';

/** Collapsed preview: from the sentence about this field, with an ellipsis when the start was skipped. Expanding shows it all. */
function PreviewText({ field }: { field: SheetField }) {
  const excerpt = sheetExcerpt(field.id, field.evidence!.text);
  return <>{excerpt.trimmed ? `…${excerpt.text}` : excerpt.text}</>;
}

function FieldRow({ field, sourceNumber, prep }: { field: SheetField; sourceNumber?: number; prep?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const passageId = useId();
  const copy = FIELDS[field.id];
  const answer = field.answer ? copy.answers?.[field.answer] : undefined;
  const categorical = Boolean(copy.answers);

  return (
    <div
      id={sourceNumber ? `sheet-summary-source-${sourceNumber}` : undefined}
      className="scroll-mt-24 grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4"
      data-testid={`sheet-field-${field.id}`}
      data-status={field.status}
    >
      <dt className="type-ui font-medium text-foreground">{copy.label}</dt>
      <dd className="min-w-0">
        {field.status === 'not_found' || !field.evidence ? (
          // Absence is not an answer: never render this as "não exige".
          <span className="type-meta text-muted-foreground">Não encontrado nos documentos</span>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {categorical && answer ? (
                <span className="rounded-lg bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground" data-testid="sheet-answer">
                  {answer}
                </span>
              ) : !categorical ? (
                <span id={passageId} className={cn('min-w-0 flex-1 type-meta break-words text-foreground/90', !open && 'line-clamp-3')}>
                  {open ? field.evidence.text : <PreviewText field={field} />}
                </span>
              ) : (
                // Found a passage but the category was unclear: show the text, do not guess.
                <span className="type-meta text-muted-foreground">Sem resposta clara; veja o trecho.</span>
              )}
              <SourceLink evidence={field.evidence} />
              <button
                type="button"
                aria-expanded={open}
                aria-controls={passageId}
                onClick={() => setOpen((value) => !value)}
                className="inline-flex items-center gap-1 rounded-lg type-meta font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
                data-testid="button-sheet-toggle"
              >
                {open ? 'Ocultar trecho' : categorical ? 'Ver trecho' : 'Ver tudo'}
                <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
              </button>
            </div>
            {categorical && open && (
              <blockquote id={passageId} className="mt-2 border-l-2 border-primary/50 pl-3 type-meta break-words text-foreground/90">
                {field.evidence.text}
              </blockquote>
            )}
            {prep}
          </>
        )}
      </dd>
    </div>
  );
}

/** Found by rule in the edital text; the deadline counts weekends and national holidays only. */
function RegistrationRequirementAlert({ requirement }: { requirement: RegistrationRequirement }) {
  const [open, setOpen] = useState(false);
  const passageId = useId();
  return (
    <div
      role="note"
      className="mb-4 flex gap-2.5 rounded-lg bg-warning-subtle px-4 py-3 type-meta text-warning-subtle-foreground ring-1 ring-warning/40"
      data-testid="alert-registration-requirement"
    >
      <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">Credenciamento prévio exigido</p>
        <p className="mt-0.5" data-testid="text-registration-requirement">
          {registrationRequirementText(requirement)}
        </p>
        {requirement.deadline && <p className="mt-0.5">Feriados estaduais e municipais não entram na conta; confira o calendário local.</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <SourceLink evidence={requirement.evidence} />
          <button
            type="button"
            aria-expanded={open}
            aria-controls={passageId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg font-semibold transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
            data-testid="button-registration-requirement-toggle"
          >
            {open ? 'Ocultar trecho' : 'Ver trecho'}
            <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
          </button>
        </div>
        {open && (
          <blockquote id={passageId} className="mt-2 border-l-2 border-warning/60 pl-3 break-words">
            {requirement.evidence.text}
          </blockquote>
        )}
      </div>
    </div>
  );
}

function SheetBody({ sheet, tenderId }: { sheet: TenderSheet; tenderId: string }) {
  const byId = new Map(sheet.fields.map((field) => [field.id, field]));
  const found = sheet.fields.filter((field) => field.status === 'found').length;
  const fieldSourceNumbers = new Map<SheetFieldId, number>();
  const qualificationSourceNumbers = new Map<QualificationItem, number>();
  let sourceNumber = 1;
  for (const field of sheet.fields) {
    if (field.status === 'found' && field.evidence) fieldSourceNumbers.set(field.id, sourceNumber++);
  }
  for (const item of sheet.qualificationChecklist) qualificationSourceNumbers.set(item, sourceNumber++);
  const checklist = new Map<QualificationType, QualificationItem[]>();
  for (const item of sheet.qualificationChecklist) checklist.set(item.type, [...(checklist.get(item.type) ?? []), item]);
  const covered = (id: SheetFieldId) => {
    const type = COVERED_BY_CHECKLIST[id];
    return type !== undefined && checklist.has(type);
  };
  // Absence is not an answer: the fields the documents never mention are named together at the end, as "não encontrados".
  const missing: SheetField[] = [];

  const sections = GROUPS.map((group) => {
    const fields = group.ids
      .filter((id) => !covered(id))
      .map((id) => byId.get(id))
      .filter((field): field is SheetField => Boolean(field))
      // A mandatory site visit, required sample or required bid guarantee is listed only in "O que preparar"; any other answer stays in its own group.
      .filter((field) => (group.prepare ? PREPARE_WHEN[field.id] === undefined || toPrepare(field) : !toPrepare(field)));
    const shown = fields.filter((field) => field.status !== 'not_found' && field.evidence);
    missing.push(...fields.filter((field) => !shown.includes(field)));
    const qualification = group.prepare ? QUALIFICATION_ORDER.filter((type) => checklist.has(type)) : [];
    const empty = shown.length === 0 && qualification.length === 0;
    if (empty && !group.prepare) return null;
    // Only requirements found in the current ficha can be marked; a mark never creates a requirement.
    const prepKeys: ChecklistKey[] = group.prepare ? [...qualification, ...shown.map((field) => PREP_KEY[field.id]!)] : [];
    return (
      <section key={group.title} aria-label={group.title} data-testid={group.prepare ? 'sheet-group-prepare' : undefined}>
        <h3 className="mb-2 type-eyebrow text-muted-foreground">{group.title}</h3>
        {empty ? (
          <p className="type-meta text-muted-foreground" data-testid="text-prepare-empty">
            Nenhuma exigência encontrada nos documentos lidos. Confira o edital.
          </p>
        ) : (
          <>
            {group.prepare && <ChecklistSummary tenderId={tenderId} keys={prepKeys} />}
            <dl className="divide-y divide-border-subtle">
              {qualification.map((type) => (
                <QualificationRow
                  key={type}
                  type={type}
                  items={checklist.get(type)!}
                  sourceNumbers={checklist.get(type)!.map((item) => qualificationSourceNumbers.get(item)!)}
                  prep={<ChecklistControl tenderId={tenderId} itemKey={type} label={QUALIFICATION_LABELS[type]} />}
                />
              ))}
              {shown.map((field) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  sourceNumber={fieldSourceNumbers.get(field.id)}
                  prep={group.prepare ? <ChecklistControl tenderId={tenderId} itemKey={PREP_KEY[field.id]!} label={FIELDS[field.id].label} /> : undefined}
                />
              ))}
            </dl>
          </>
        )}
        {group.prepare && !empty && <p className="mt-2 type-meta text-muted-foreground">Pode haver outras exigências. Confira sempre o edital.</p>}
      </section>
    );
  });

  return (
    <>
      {sheet.summary && (
        <div className="mb-4">
          <AutomaticSummary summary={sheet.summary} heading="Resumo" citationHref={(citation) => `#sheet-summary-source-${citation}`} />
        </div>
      )}
      <p className="mb-4 type-meta text-muted-foreground" data-testid="text-sheet-summary">
        {found === 0
          ? 'Nenhum dos campos foi encontrado nos documentos lidos.'
          : `${found} de ${sheet.fields.length} campos encontrados nos documentos.`}
        {sheet.unreadDocuments > 0 && (
          <> <DocumentReadingNotice reading={sheet.documentReading} /> A ficha pode estar incompleta.</>
        )}
      </p>
      {sheet.registrationRequirement && <RegistrationRequirementAlert requirement={sheet.registrationRequirement} />}
      <div className="space-y-6">
        {sections}
        {missing.length > 0 && (
          <p className="type-meta text-muted-foreground" data-testid="text-sheet-missing">
            <span className="font-semibold text-foreground/80">Não encontrados nos documentos:</span>{' '}
            {missing.map((field) => FIELDS[field.id].label).join(', ')}.
          </p>
        )}
      </div>
    </>
  );
}

function SheetState({ sheet, tenderId, onRetry, retrying }: { sheet: TenderSheet; tenderId: string; onRetry: () => void; retrying: boolean }) {
  switch (sheet.status) {
    case 'not_started':
    case 'processing':
      return (
        <p role="status" className={noteBox} data-testid="text-sheet-building">
          <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
          Lendo os documentos para montar a ficha. Na primeira vez leva de alguns segundos a um minuto.
        </p>
      );
    case 'no_documents':
      return (
        <p className={noteBox} data-testid="text-sheet-no-documents">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          A fonte não publicou documentos para montar a ficha.
        </p>
      );
    case 'ocr_processing':
      return (
        <p role="status" className={noteBox} data-testid="text-sheet-ocr-processing">
          <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
          Lendo documento digitalizado; pode levar alguns minutos.
        </p>
      );
    case 'unsupported':
      return (
        <p className={noteBox} data-testid="text-sheet-unsupported">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          <DocumentReadingNotice reading={sheet.documentReading} />
        </p>
      );
    case 'expired':
      return (
        <p className={noteBox} data-testid="text-sheet-expired">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          Os documentos deste edital saíram do índice 90 dias depois do prazo da proposta. Salve o edital para gerar a ficha de novo.
        </p>
      );
    case 'failed':
      return (
        <div role="alert" className={cn(errorBox, 'flex-wrap items-center justify-between')} data-testid="text-sheet-failed">
          <span className="flex gap-2.5">
            <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            Não conseguimos ler os documentos agora. A fonte pode estar fora do ar.
          </span>
          <Button variant="outline" size="sm" loading={retrying} onClick={onRetry}>
            <RefreshCw size={14} aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      );
    default:
      return <SheetBody sheet={sheet} tenderId={tenderId} />;
  }
}

/**
 * "Ficha do edital" (3.5): key rules with the official passage and page; missing fields say so.
 * Visitors and accounts without access see the title and one line: "Antes de decidir" explains the gate once.
 */
export function TenderSheetPanel({ tenderId }: { tenderId: string }) {
  const session = useSession();
  const billing = useBilling();
  const entitled = billing.data?.entitled === true;
  const sheet = useTenderSheet(tenderId, entitled);
  const titleId = useId();
  const gated = session.status === 'anonymous' || billing.data?.entitled === false;

  let body;
  if (gated) {
    body = null;
  } else if (session.status !== 'authenticated' || billing.isPending || (entitled && sheet.isPending)) {
    body = <div aria-busy="true" aria-label="Carregando" className="h-24 animate-pulse rounded-lg bg-muted" />;
  } else if (isApiError(sheet.error) && sheet.error.code === 'AI_QUOTA_EXCEEDED' && sheet.error.detail('daily_tenders')) {
    body = (
      <p className={noteBox} data-testid="text-sheet-quota">
        <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        {tendersExhaustedMessage(undefined)}
      </p>
    );
  } else if (billing.isError || sheet.isError) {
    const error = billing.error ?? sheet.error;
    body = (
      <div role="alert" className={cn(errorBox, 'flex-wrap items-center justify-between')} data-testid="text-sheet-error">
        <span>{isApiError(error) && error.requestId ? `Não foi possível carregar a ficha. (ref. ${error.requestId})` : 'Não foi possível carregar a ficha.'}</span>
        <Button variant="outline" size="sm" onClick={() => (billing.isError ? billing.refetch() : sheet.refetch())}>
          <RefreshCw size={14} aria-hidden="true" />
          Tentar de novo
        </Button>
      </div>
    );
  } else if (sheet.data) {
    body = <SheetState sheet={sheet.data} tenderId={tenderId} onRetry={() => sheet.refetch()} retrying={sheet.isFetching} />;
  }

  return (
    <section id="ficha" aria-labelledby={titleId} className="scroll-mt-24 rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-tender-sheet">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ClipboardList size={17} aria-hidden="true" className="text-primary" />
        <h2 id={titleId} className="type-section text-foreground">
          Ficha do edital
        </h2>
        {gated && <IncludedInAccessHint className="ml-1" />}
      </div>
      {!gated && (
        <>
          <ProvenanceLabel kind="found" className="mt-1 mb-4 flex">
            Encontrado no edital. Cada campo mostra o trecho oficial e a página; campo sem trecho fica como não encontrado.
          </ProvenanceLabel>
          {body}
        </>
      )}
    </section>
  );
}
