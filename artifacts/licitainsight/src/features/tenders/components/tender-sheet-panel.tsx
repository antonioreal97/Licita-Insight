import { useId, useState } from 'react';
import { Link } from 'wouter';
import { ChevronDown, CircleAlert, ClipboardList, ExternalLink, Info, Loader2, RefreshCw } from 'lucide-react';
import { isApiError, type QualificationItem, type QualificationType, type SheetEvidence, type SheetField, type SheetFieldId, type TenderSheet } from '@/api';
import { Button } from '@/components/common/action-button';
import { signInWithGoogle, useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { cn } from '@/lib/utils';
import { useTenderSheet } from '../hooks/use-tender-sheet';
import { sheetExcerpt } from '../lib/sheet-excerpt';

type FieldCopy = { label: string; answers?: Record<string, string> };

/** Labels live here; the API sends stable ids and answer keys (CODEX_HANDOFF-015). */
const FIELDS: Record<SheetFieldId, FieldCopy> = {
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

/** Fixed display order; absent types just don't render (never "não exige" by omission). */
const QUALIFICATION_LABELS: Record<QualificationType, string> = {
  ato_societario: 'Documento societário',
  regularidade_fiscal: 'Regularidade fiscal',
  regularidade_trabalhista: 'Regularidade trabalhista',
  qualificacao_tecnica: 'Qualificação técnica',
  qualificacao_economica: 'Qualificação econômico-financeira',
};
const QUALIFICATION_ORDER: QualificationType[] = ['ato_societario', 'regularidade_fiscal', 'regularidade_trabalhista', 'qualificacao_tecnica', 'qualificacao_economica'];

function QualificationRow({ item }: { item: QualificationItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3 first:pt-0 last:pb-0" data-testid="qualification-item" data-type={item.type}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="type-ui font-medium text-foreground">{QUALIFICATION_LABELS[item.type]}</span>
        <div className="flex items-center gap-3">
          <SourceLink evidence={item.evidence} />
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 rounded-sm type-meta font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
            data-testid="button-qualification-toggle"
          >
            {open ? 'Ocultar trecho' : 'Ver trecho'}
            <ChevronDown size={13} aria-hidden="true" className={cn('transition-transform duration-fast ease-standard', open && 'rotate-180')} />
          </button>
        </div>
      </div>
      {open && <blockquote className="mt-2 border-l-2 border-primary/50 pl-3 type-meta break-words text-foreground/90">{item.evidence.text}</blockquote>}
    </div>
  );
}

function QualificationChecklist({ items }: { items: QualificationItem[] }) {
  if (items.length === 0) return null;
  const ordered = QUALIFICATION_ORDER.flatMap((type) => items.filter((item) => item.type === type));
  return (
    <section aria-label="Requisitos de habilitação encontrados">
      <h3 className="mb-2 type-eyebrow text-muted-foreground">Requisitos de habilitação encontrados</h3>
      <p className="mb-2 type-meta text-muted-foreground">
        Não é uma lista completa: pode haver mais de uma exigência do mesmo tipo na mesma página, e só uma aparece aqui. Confira sempre o edital.
      </p>
      <dl className="divide-y divide-border-subtle">
        {ordered.map((item, index) => (
          <QualificationRow key={`${item.type}-${item.evidence.page}-${index}`} item={item} />
        ))}
      </dl>
    </section>
  );
}

const GROUPS: { title: string; ids: SheetFieldId[] }[] = [
  { title: 'Participação', ids: ['consortium', 'subcontracting', 'me_epp', 'site_visit', 'samples'] },
  { title: 'Garantias e penalidades', ids: ['bid_guarantee', 'contract_guarantee', 'penalties'] },
  { title: 'Habilitação', ids: ['technical_qualification', 'financial_qualification'] },
  { title: 'Execução', ids: ['contract_term', 'delivery_term', 'price_adjustment'] },
];

const noteBox = 'flex gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground';
const errorBox = 'flex gap-2.5 rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-4 py-3 type-meta text-destructive-subtle-foreground';
const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

function SourceLink({ evidence }: { evidence: SheetEvidence | null }) {
  if (!evidence) return null;
  return (
    <a
      href={evidence.documentUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={evidence.documentTitle}
      data-testid="link-sheet-source"
      className={cn('inline-flex shrink-0 items-center gap-1 type-meta', linkClass)}
    >
      p. {evidence.page}
      <ExternalLink size={11} aria-hidden="true" />
      <span className="sr-only">
        ({evidence.documentTitle}, documento oficial, abre em nova aba)
      </span>
    </a>
  );
}

/** Collapsed preview: from the sentence about this field, with an ellipsis when the start was skipped. Expanding shows it all. */
function PreviewText({ field }: { field: SheetField }) {
  const excerpt = sheetExcerpt(field.id, field.evidence!.text);
  return <>{excerpt.trimmed ? `…${excerpt.text}` : excerpt.text}</>;
}

function FieldRow({ field }: { field: SheetField }) {
  const [open, setOpen] = useState(false);
  const passageId = useId();
  const copy = FIELDS[field.id];
  const answer = field.answer ? copy.answers?.[field.answer] : undefined;
  const categorical = Boolean(copy.answers);

  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4" data-testid={`sheet-field-${field.id}`} data-status={field.status}>
      <dt className="type-ui font-medium text-foreground">{copy.label}</dt>
      <dd className="min-w-0">
        {field.status === 'not_found' || !field.evidence ? (
          // Absence is not an answer: never render this as "não exige".
          <span className="type-meta text-muted-foreground">Não encontrado nos documentos</span>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {categorical && answer ? (
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground" data-testid="sheet-answer">
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
                className="inline-flex items-center gap-1 rounded-sm type-meta font-semibold text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
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
          </>
        )}
      </dd>
    </div>
  );
}

function SheetBody({ sheet }: { sheet: TenderSheet }) {
  const byId = new Map(sheet.fields.map((field) => [field.id, field]));
  const found = sheet.fields.filter((field) => field.status === 'found').length;
  return (
    <>
      <p className="mb-4 type-meta text-muted-foreground" data-testid="text-sheet-summary">
        {found === 0
          ? 'Nenhum dos campos foi encontrado nos documentos lidos.'
          : `${found} de ${sheet.fields.length} campos encontrados nos documentos.`}
        {sheet.unreadDocuments > 0 &&
          ` ${sheet.unreadDocuments === 1 ? '1 documento não pôde ser lido' : `${sheet.unreadDocuments} documentos não puderam ser lidos`}; a ficha pode estar incompleta.`}
      </p>
      <div className="space-y-6">
        <QualificationChecklist items={sheet.qualificationChecklist} />
        {GROUPS.map((group) => {
          const fields = group.ids.map((id) => byId.get(id)).filter((field): field is SheetField => Boolean(field));
          if (fields.length === 0) return null;
          return (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-2 type-eyebrow text-muted-foreground">{group.title}</h3>
              <dl className="divide-y divide-border-subtle">
                {fields.map((field) => (
                  <FieldRow key={field.id} field={field} />
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </>
  );
}

function SheetState({ sheet, onRetry, retrying }: { sheet: TenderSheet; onRetry: () => void; retrying: boolean }) {
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
    case 'unsupported':
      return (
        <p className={noteBox} data-testid="text-sheet-unsupported">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          Ainda não conseguimos ler o texto dos documentos deste edital (imagens digitalizadas ou formato que não lemos).
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
      return <SheetBody sheet={sheet} />;
  }
}

/** "Ficha do edital" (3.5): key rules with the official passage and page; missing fields say so. */
export function TenderSheetPanel({ tenderId }: { tenderId: string }) {
  const session = useSession();
  const billing = useBilling();
  const entitled = billing.data?.entitled === true;
  const sheet = useTenderSheet(tenderId, entitled);
  const titleId = useId();

  let body;
  if (session.status === 'anonymous') {
    body = (
      <p className={noteBox}>
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
        <span>
          Consórcio, garantia, visita técnica, habilitação e prazos, cada um com o trecho e a página do edital.{' '}
          <button type="button" onClick={() => signInWithGoogle()} className={linkClass} data-testid="button-sheet-sign-in">
            Entrar com Google
          </button>
        </span>
      </p>
    );
  } else if (session.status !== 'authenticated' || billing.isPending || (entitled && sheet.isPending)) {
    body = <div aria-busy="true" aria-label="Carregando" className="h-24 animate-pulse rounded-lg bg-muted" />;
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
  } else if (!entitled) {
    body = (
      <p className={noteBox} data-testid="text-sheet-no-access">
        <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
        <span>
          A ficha do edital faz parte da assinatura.{' '}
          <Link href={BILLING_HREF} className={linkClass}>
            Ver assinatura
          </Link>
        </span>
      </p>
    );
  } else if (sheet.data) {
    body = <SheetState sheet={sheet.data} onRetry={() => sheet.refetch()} retrying={sheet.isFetching} />;
  }

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-tender-sheet">
      <div className="mb-1 flex items-center gap-2">
        <ClipboardList size={17} aria-hidden="true" className="text-primary" />
        <h2 id={titleId} className="type-section text-foreground">
          Ficha do edital
        </h2>
      </div>
      <p className="mb-4 type-meta text-muted-foreground">Cada campo mostra o trecho oficial e a página. Campo sem trecho fica como não encontrado.</p>
      {body}
      <p className="mt-5 flex gap-2 border-t border-border-subtle pt-4 type-meta text-muted-foreground" data-testid="text-sheet-disclaimer">
        <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
        Os trechos são escolhidos automaticamente e podem não ser os únicos relevantes. Confira o edital original antes de decidir.
      </p>
    </section>
  );
}
