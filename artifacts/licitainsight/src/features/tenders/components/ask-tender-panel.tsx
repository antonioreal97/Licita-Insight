import { useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { CircleAlert, ExternalLink, FileSearch, Info, Loader2, MessageSquareQuote, RefreshCw, SearchX } from 'lucide-react';
import { isApiError, type AskTenderPassage, type AskTenderResult, type TenderAskStatus } from '@/api';
import { Button } from '@/components/common/action-button';
import { useSession } from '@/features/auth/hooks/use-session';
import { useBilling } from '@/features/billing/hooks/use-billing';
import { BILLING_HREF } from '@/features/billing/lib/trial';
import { IncludedInAccessHint } from '@/features/opportunities/components/access-gate';
import { ASK_MAX_LENGTH, ASK_MIN_LENGTH } from '@/services/ai-service';
import { cn } from '@/lib/utils';
import { useAskStatus, useAskTender } from '../hooks/use-ask-tender';
import { markQuestionTerms, questionStems } from '../lib/question-terms';
import { AutomaticSummary } from './automatic-summary';

/** Fill the field, never submit: each question spends quota (5 a day on the trial). */
const SUGGESTIONS = [
  'Pode participar em consórcio?',
  'Exige visita técnica?',
  'Qual garantia é exigida?',
  'Há benefício para ME/EPP?',
  'Qual a multa por descumprimento?',
];

/** Newest first; older ones stay visible for comparison within the visit. */
const MAX_HISTORY = 5;

type Entry = { id: number; question: string } & ({ state: 'pending' } | { state: 'done'; result: AskTenderResult } | { state: 'error'; error: unknown });

/** Documents leave the index 90 days after the proposal deadline; saving the tender brings them back. */
const EXPIRED_MESSAGE = 'Os documentos deste edital saíram do índice 90 dias depois do prazo da proposta. Salve o edital para consultá-los de novo.';

const noteBox = 'flex gap-2.5 rounded-lg border border-border bg-muted px-4 py-3 type-meta text-foreground';
const errorBox = 'flex gap-2.5 rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-4 py-3 type-meta text-destructive-subtle-foreground';
const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

const withRef = (message: string, error: unknown) => (isApiError(error) && error.requestId ? `${message} (ref. ${error.requestId})` : message);

function quotaLabel({ used, limit }: TenderAskStatus['quota']) {
  const left = Math.max(0, limit - used);
  return `${left} de ${limit} ${limit === 1 ? 'pergunta' : 'perguntas'} hoje`;
}

function askErrorMessage(error: unknown, limit: number | undefined) {
  if (!isApiError(error)) return 'Não foi possível consultar o edital. Tente de novo.';
  switch (error.code) {
    case 'AI_QUOTA_EXCEEDED':
      return `Você usou ${limit ? `as ${limit} perguntas` : 'todas as perguntas'} de hoje. A cota renova à meia-noite (horário de Brasília).`;
    case 'AI_UNAVAILABLE':
      return 'A consulta ao edital está indisponível agora. Os documentos continuam na lista ao lado.';
    case 'SUBSCRIPTION_REQUIRED':
      return 'Seu acesso terminou. Assine para continuar perguntando ao edital.';
    case 'INVALID_PARAMETER':
      return `Escreva a pergunta com ${ASK_MIN_LENGTH} a ${ASK_MAX_LENGTH} caracteres.`;
    case 'CONFLICT':
      return error.detail('index_expired') ? EXPIRED_MESSAGE : withRef('Não foi possível consultar o edital. Tente de novo.', error);
    case 'NETWORK_ERROR':
      return 'Sem conexão com o servidor. Tente de novo.';
    default:
      return withRef('Não foi possível consultar o edital. Tente de novo.', error);
  }
}

/** Documents the index could not read: a "not found" (and any answer) is read with that in mind. */
function unreadDocuments(status: TenderAskStatus | undefined) {
  return status?.unreadDocuments ?? 0;
}

const unreadNote = (count: number) =>
  count === 1 ? '1 documento não pôde ser lido' : `${count} documentos não puderam ser lidos`;

function Passage({ passage, stems, id }: { passage: AskTenderPassage; stems: Set<string>; id: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, passage.relevance)) * 100);
  return (
    <li id={id} className="scroll-mt-24 rounded-lg border border-border-subtle bg-surface p-4" data-testid="ask-passage">
      {/* Marks only help the eye find the answer inside ~700 chars; the text itself is the official passage, unchanged. */}
      <blockquote className="border-l-2 border-primary/50 pl-3 type-body break-words text-foreground/90">
        {markQuestionTerms(passage.text, stems).map((part, index) =>
          part.match ? (
            <mark key={index} className="rounded-sm bg-primary/15 px-0.5 text-inherit">
              {part.text}
            </mark>
          ) : (
            part.text
          ),
        )}
      </blockquote>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <a
          href={passage.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-ask-passage-source"
          className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5 type-meta', linkClass)}
        >
          <span className="truncate" title={passage.documentTitle}>
            {passage.documentTitle}
          </span>
          <span className="shrink-0">· página {passage.page}</span>
          <ExternalLink size={12} aria-hidden="true" className="shrink-0" />
          <span className="sr-only">(documento oficial, abre em nova aba)</span>
        </a>
        {/* Jev returns a calibrated probability; say exactly that instead of an abstract "relevância". */}
        <span className="type-meta tabular-nums text-muted-foreground" title="Probabilidade estimada de este trecho responder à pergunta">
          {pct}% de chance de responder
        </span>
      </div>
    </li>
  );
}

const passageKey = (passage: AskTenderPassage) => `${passage.documentId}-${passage.page}-${passage.text.slice(0, 24)}`;

/** The best passage first; the rest, also above the threshold, are labelled as supporting so they don't read as equally good answers. */
function Passages({ entryId, question, passages, summary }: { entryId: number; question: string; passages: AskTenderPassage[]; summary: AskTenderResult['summary'] }) {
  const stems = questionStems(question);
  const [best, ...others] = [...passages].sort((a, b) => b.relevance - a.relevance);
  if (!best) return null;
  return (
    <>
      <AutomaticSummary summary={summary} heading="Resposta" citationHref={(citation) => `#ask-passage-${entryId}-${citation}`} />
      <ol className="space-y-3" aria-label="Trecho que melhor responde">
        <Passage passage={best} stems={stems} id={`ask-passage-${entryId}-1`} />
      </ol>
      {others.length > 0 && (
        <>
          <h3 className="pt-1 type-meta font-semibold text-muted-foreground">Outros trechos que podem ajudar</h3>
          <ol className="space-y-3" aria-label="Outros trechos que podem ajudar">
            {others.map((passage, index) => (
              <Passage key={passageKey(passage)} passage={passage} stems={stems} id={`ask-passage-${entryId}-${index + 2}`} />
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function Answer({ entry, status }: { entry: Entry; status: TenderAskStatus | undefined }) {
  return (
    <article aria-label={`Pergunta: ${entry.question}`} className="space-y-3" data-testid="ask-entry">
      <p className="flex items-start gap-2 type-ui font-semibold">
        <MessageSquareQuote size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
        <span className="break-words">{entry.question}</span>
      </p>
      {entry.state === 'pending' && (
        <p role="status" className="flex items-center gap-2 type-meta text-muted-foreground">
          <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          Procurando nos documentos…
        </p>
      )}
      {entry.state === 'error' && (
        <p role="alert" className={errorBox} data-testid="text-ask-error">
          <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {askErrorMessage(entry.error, status?.quota.limit)}
            {isApiError(entry.error) && entry.error.code === 'SUBSCRIPTION_REQUIRED' && (
              <>
                {' '}
                <Link href={BILLING_HREF} className={linkClass}>
                  Ver assinatura
                </Link>
              </>
            )}
          </span>
        </p>
      )}
      {entry.state === 'done' && entry.result.status === 'answered' && (
        <Passages entryId={entry.id} question={entry.question} passages={entry.result.passages} summary={entry.result.summary} />
      )}
      {entry.state === 'done' && entry.result.status === 'not_found' && (
        <div className={noteBox} data-testid="text-ask-not-found">
          <SearchX size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-semibold">Não encontrei isso no edital.</span> Nenhum trecho dos documentos responde com segurança. Tente outras palavras ou
            confira os documentos.
            {unreadDocuments(status) > 0 && ` ${unreadNote(unreadDocuments(status))} e ficaram de fora.`}
          </span>
        </div>
      )}
      {entry.state === 'done' && entry.result.status === 'processing' && (
        <p className={noteBox}>
          <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
          Ainda estamos lendo os documentos. Pergunte de novo em alguns segundos; esta tentativa não contou na cota.
        </p>
      )}
    </article>
  );
}

function AskForm({ tenderId, status }: { tenderId: string; status: TenderAskStatus }) {
  const ask = useAskTender(tenderId);
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState<Entry[]>([]);
  const nextId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const exhausted = status.quota.used >= status.quota.limit;
  const question = draft.trim();
  const tooShort = question.length < ASK_MIN_LENGTH;
  const pending = history.some((entry) => entry.state === 'pending');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (tooShort || pending || exhausted) return;
    const id = nextId.current++;
    setHistory((list) => [{ id, question, state: 'pending' as const }, ...list].slice(0, MAX_HISTORY));
    setDraft('');
    try {
      const result = await ask.mutateAsync(question);
      setHistory((list) => list.map((entry) => (entry.id === id ? { id, question, state: 'done', result } : entry)));
    } catch (error) {
      setHistory((list) => list.map((entry) => (entry.id === id ? { id, question, state: 'error', error } : entry)));
      setDraft((current) => current || question);
    }
  };

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`${hintId}-input`} className="sr-only">
          Pergunta sobre o edital
        </label>
        <input
          ref={inputRef}
          id={`${hintId}-input`}
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={ASK_MAX_LENGTH}
          placeholder="Ex.: Exige atestado de capacidade técnica?"
          aria-describedby={hintId}
          disabled={exhausted}
          data-testid="input-ask-tender"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-base outline-none transition-[border-color,box-shadow] duration-fast ease-standard placeholder:text-muted-foreground hover:border-border-strong focus:border-ring focus:ring-3 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
        />
        <Button type="submit" size="lg" loading={pending} disabled={tooShort || exhausted} data-testid="button-ask-tender">
          Perguntar
        </Button>
      </form>
      <p id={hintId} className="mt-2 type-meta text-muted-foreground" data-testid="text-ask-quota">
        {exhausted
          ? 'Você usou todas as perguntas de hoje. A cota renova à meia-noite (horário de Brasília).'
          : `${quotaLabel(status.quota)}. Repetir uma pergunta já feita não gasta cota.`}
      </p>

      {status.unreadDocuments > 0 && (
        <p className="mt-2 flex gap-1.5 type-meta text-muted-foreground" data-testid="text-ask-partial">
          <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
          {unreadNote(status.unreadDocuments)}; as respostas vêm só dos demais e podem estar incompletas.
        </p>
      )}

      {history.length === 0 && !exhausted && (
        <ul aria-label="Sugestões de pergunta" className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                data-testid="button-ask-suggestion"
                onClick={() => {
                  setDraft(suggestion);
                  inputRef.current?.focus();
                }}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-fast ease-standard hover:border-border-strong hover:bg-surface-sunken focus-visible:focus-ring"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <div aria-live="polite" className="mt-6 space-y-6 border-t border-border-subtle pt-6">
          {history.map((entry) => (
            <Answer key={entry.id} entry={entry} status={status} />
          ))}
        </div>
      )}
    </>
  );
}

function IndexState({ status, onRetry, retrying }: { status: TenderAskStatus; onRetry: () => void; retrying: boolean }) {
  switch (status.index) {
    case 'not_started':
    case 'processing':
      return (
        <p role="status" className={noteBox} data-testid="text-ask-indexing">
          <Loader2 size={15} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-muted-foreground" />
          <span>
            Lendo os documentos do edital. Na primeira vez leva de alguns segundos a um minuto; a pergunta libera sozinha quando terminar.
          </span>
        </p>
      );
    case 'no_documents':
      return (
        <p className={noteBox} data-testid="text-ask-no-documents">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          A fonte não publicou documentos para consultar neste edital.
        </p>
      );
    case 'unsupported':
      return (
        <p className={noteBox} data-testid="text-ask-unsupported">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          Ainda não conseguimos ler o texto dos documentos deste edital: são imagens digitalizadas ou estão num formato que não lemos (como planilhas).
          Consulte os documentos na lista.
        </p>
      );
    case 'expired':
      return (
        <p className={noteBox} data-testid="text-ask-expired">
          <Info size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />
          {EXPIRED_MESSAGE}
        </p>
      );
    case 'failed':
      return (
        <div role="alert" className={cn(errorBox, 'flex-wrap items-center justify-between')} data-testid="text-ask-failed">
          <span className="flex gap-2.5">
            <CircleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
            Não conseguimos ler os documentos agora. A fonte pode estar fora do ar.
          </span>
          <Button variant="outline" size="sm" loading={retrying} onClick={onRetry} data-testid="button-ask-retry-index">
            <RefreshCw size={14} aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      );
    default:
      return null;
  }
}

/**
 * "Perguntar ao edital" (ai-v1). Jev picks official passages; an optional summary only rewrites those passages.
 * Visitors and accounts without access see the title and one line ("Antes de decidir" explains the gate); with access → index state, quota and the question form.
 */
export function AskTenderPanel({ tenderId }: { tenderId: string }) {
  const session = useSession();
  const billing = useBilling();
  const entitled = billing.data?.entitled === true;
  const status = useAskStatus(tenderId, entitled);
  const titleId = useId();
  const gated = session.status === 'anonymous' || billing.data?.entitled === false;

  let body;
  if (gated) {
    body = null;
  } else if (session.status !== 'authenticated' || billing.isPending || (entitled && status.isPending)) {
    body = <div aria-busy="true" aria-label="Carregando" className="h-11 animate-pulse rounded-lg bg-muted" />;
  } else if (billing.isError || status.isError) {
    const error = billing.error ?? status.error;
    body = (
      <div role="alert" className={cn(errorBox, 'flex-wrap items-center justify-between')} data-testid="text-ask-status-error">
        <span>{withRef('Não foi possível carregar a consulta ao edital.', error)}</span>
        <Button variant="outline" size="sm" onClick={() => (billing.isError ? billing.refetch() : status.refetch())}>
          <RefreshCw size={14} aria-hidden="true" />
          Tentar de novo
        </Button>
      </div>
    );
  } else if (status.data) {
    body =
      status.data.index === 'ready' ? (
        <AskForm tenderId={tenderId} status={status.data} />
      ) : (
        <IndexState status={status.data} onRetry={() => status.refetch()} retrying={status.isFetching} />
      );
  }

  return (
    <section aria-labelledby={titleId} className="rounded-xl border border-border bg-card p-5 sm:p-7" data-testid="panel-ask-tender">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <FileSearch size={17} aria-hidden="true" className="text-primary" />
        <h2 id={titleId} className="type-section text-foreground">
          Perguntar ao edital
        </h2>
        {gated && <IncludedInAccessHint className="ml-1" />}
      </div>
      {!gated && (
        <>
          <p className="mt-1 mb-4 type-meta text-muted-foreground">Os trechos vêm dos documentos oficiais; quando disponível, um resumo curto ajuda a lê-los.</p>
          {body}
        </>
      )}
    </section>
  );
}
