import React, { useId, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Flag } from 'lucide-react';
import type { TenderFeedbackKind, TenderFeedbackSection } from '@/api';
import { Button } from '@/components/common/action-button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSession } from '@/features/auth/hooks/use-session';
import { cn } from '@/lib/utils';
import { searchService } from '@/services/search-service';
import {
  FEEDBACK_KIND_OPTIONS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_PRIVACY_NOTE,
  FEEDBACK_SCOPE_NOTE,
  FEEDBACK_SECTION_OPTIONS,
  currentPagePath,
  feedbackErrorMessage,
  feedbackMessageError,
  feedbackMessageLength,
} from '../lib/tender-feedback';

/**
 * Discreet "Reportar problema" at the end of the tender page (tender-feedback-v1). Works signed in or anonymous:
 * the API links the report to the session when there is one.
 */
export function ReportProblem({ tenderId }: { tenderId: string }) {
  const ids = useId();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TenderFeedbackKind | null>(null);
  const [section, setSection] = useState<TenderFeedbackSection | ''>('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      searchService.submitFeedback(tenderId, {
        kind: kind!,
        section: section || null,
        message,
        pageUrl: currentPagePath(typeof window === 'undefined' ? undefined : window.location),
      }),
    onError: (error) => console.error('[tender-feedback] Falha ao enviar o feedback.', error),
  });

  const start = () => {
    setKind(null);
    setSection('');
    setMessage('');
    setTouched(false);
    send.reset();
    setOpen(true);
  };

  const messageError = feedbackMessageError(message);
  const kindError = kind ? null : 'Escolha o tipo de problema.';
  const showErrors = touched;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (kindError) {
      document.getElementById(`${ids}-kind-${FEEDBACK_KIND_OPTIONS[0]!.value}`)?.focus();
      return;
    }
    if (messageError) {
      document.getElementById(`${ids}-message`)?.focus();
      return;
    }
    send.mutate();
  };

  const length = feedbackMessageLength(message);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border px-5 py-4" data-testid="report-problem">
        <p className="type-meta text-muted-foreground">Viu alguma informação errada, faltando ou um link quebrado nesta página?</p>
        <Button variant="ghost" size="sm" onClick={start} aria-haspopup="dialog" data-testid="button-report-problem">
          <Flag size={14} aria-hidden="true" />
          Reportar problema
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !send.isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-report-problem">
          {send.isSuccess ? (
            <div className="grid gap-5" role="status" data-testid="report-problem-success">
              <DialogHeader>
                <CheckCircle2 size={28} aria-hidden="true" className="text-primary" />
                <DialogTitle className="type-title">Feedback enviado</DialogTitle>
                <DialogDescription className="type-body text-muted-foreground">
                  Obrigado. A equipe do Pardal Digital vai ler sua mensagem e usá-la para corrigir e melhorar a plataforma. Não respondemos cada envio individualmente.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" autoFocus onClick={() => setOpen(false)} data-testid="button-close-report-problem">
                  Fechar
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-5">
              <DialogHeader>
                <DialogTitle className="type-title">Reportar problema</DialogTitle>
                <DialogDescription className="type-meta text-muted-foreground">{FEEDBACK_SCOPE_NOTE}</DialogDescription>
              </DialogHeader>

              <fieldset className="grid gap-2" aria-describedby={showErrors && kindError ? `${ids}-kind-error` : undefined}>
                <legend className="mb-2 type-meta font-semibold text-muted-foreground">Tipo de problema</legend>
                {FEEDBACK_KIND_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    htmlFor={`${ids}-kind-${option.value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors duration-fast ease-standard',
                      'hover:border-border-strong has-[:checked]:border-primary/50 has-[:checked]:bg-primary-subtle',
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring',
                    )}
                  >
                    <input
                      id={`${ids}-kind-${option.value}`}
                      type="radio"
                      name={`${ids}-kind`}
                      value={option.value}
                      checked={kind === option.value}
                      onChange={() => setKind(option.value)}
                      className="mt-1 size-4 shrink-0 accent-primary focus-visible:outline-none"
                      data-testid={`radio-feedback-kind-${option.value}`}
                    />
                    <span>
                      <span className="block type-ui font-semibold text-foreground">{option.label}</span>
                      <span className="block type-meta text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
                {showErrors && kindError && (
                  <span id={`${ids}-kind-error`} role="alert" className="type-meta text-destructive">
                    {kindError}
                  </span>
                )}
              </fieldset>

              <label className="field" htmlFor={`${ids}-section`}>
                Parte da página (opcional)
                <select
                  id={`${ids}-section`}
                  value={section}
                  onChange={(event) => setSection(event.target.value as TenderFeedbackSection | '')}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 type-ui font-normal text-foreground focus-visible:focus-ring"
                  data-testid="select-feedback-section"
                >
                  <option value="">Não sei ou a página toda</option>
                  {FEEDBACK_SECTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field" htmlFor={`${ids}-message`}>
                O que está errado ou faltando?
                <textarea
                  id={`${ids}-message`}
                  value={message}
                  rows={5}
                  maxLength={FEEDBACK_MESSAGE_MAX + 200}
                  required
                  onChange={(event) => setMessage(event.target.value)}
                  onBlur={() => message && setTouched(true)}
                  placeholder="Ex.: O prazo de propostas aqui é 10/11, mas o edital publicado diz 12/11."
                  aria-invalid={(showErrors && Boolean(messageError)) || undefined}
                  aria-describedby={`${ids}-message-hint`}
                  data-testid="input-feedback-message"
                />
                <span id={`${ids}-message-hint`} className={cn('type-meta font-normal', showErrors && messageError && 'text-destructive')}>
                  {showErrors && messageError ? `${messageError} ` : ''}
                  {FEEDBACK_PRIVACY_NOTE} <span className="tabular-nums">{length}/{FEEDBACK_MESSAGE_MAX}</span>
                </span>
              </label>

              {status === 'anonymous' && (
                <p className="type-meta text-muted-foreground" data-testid="text-feedback-anonymous">
                  Você não entrou na sua conta: o feedback será enviado de forma anônima.
                </p>
              )}

              {send.isError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive-subtle-border bg-destructive-subtle px-3 py-2 type-meta text-destructive-subtle-foreground"
                  data-testid="text-feedback-error"
                >
                  {feedbackErrorMessage(send.error)}
                </p>
              )}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={send.isPending} data-testid="button-cancel-report-problem">
                  Cancelar
                </Button>
                <Button type="submit" loading={send.isPending} data-testid="button-submit-report-problem">
                  Enviar feedback
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
