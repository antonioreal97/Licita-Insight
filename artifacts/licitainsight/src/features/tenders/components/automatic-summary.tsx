import * as React from 'react';
import type { AiGeneratedSummary } from '@/api';

export const AUTOMATIC_SUMMARY_LABEL = 'Resumo automático dos trechos abaixo. Confira no edital.';

const citationPattern = /(\[\d+\])/gu;

export function AutomaticSummary({
  summary,
  heading,
  citationHref,
}: {
  summary: AiGeneratedSummary | null;
  heading: string;
  citationHref: (citation: number) => string;
}) {
  if (!summary) return null;
  return (
    <section className="rounded-lg border border-primary/20 bg-primary/5 p-4" aria-label={heading} data-testid="automatic-summary">
      <h3 className="type-ui font-semibold text-foreground">{heading}</h3>
      <p className="mt-1 type-meta text-muted-foreground">{AUTOMATIC_SUMMARY_LABEL}</p>
      <p className="mt-3 type-body break-words text-foreground/90" data-testid="automatic-summary-text">
        {summary.text.split(citationPattern).map((part, index) => {
          const match = /^\[(\d+)\]$/u.exec(part);
          if (!match) return part;
          const citation = Number(match[1]);
          if (!summary.citations.includes(citation)) return part;
          return (
            <a
              key={`${citation}-${index}`}
              href={citationHref(citation)}
              className="mx-0.5 rounded-lg font-semibold text-primary underline underline-offset-2 focus-visible:focus-ring"
              aria-label={`Ir para o trecho ${citation}`}
            >
              {part}
            </a>
          );
        })}
      </p>
    </section>
  );
}
