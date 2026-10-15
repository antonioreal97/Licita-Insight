import React from 'react';
import { ExternalLink, FileText, LogIn } from 'lucide-react';
import type { OpportunityApplication, OpportunitySummary } from '@/api';
import { buttonClass } from '@/components/common/action-button';
import { cn } from '@/lib/utils';
import {
  applicationActionText,
  applicationBadgeText,
  applicationOriginText,
  linkHost,
  missingApplicationText,
} from '../lib/application';

type PanelOpportunity = Pick<OpportunitySummary, 'application' | 'applicationCheckedAt' | 'sourceUrl'>;

const NEW_TAB = <span className="sr-only">(abre em nova aba)</span>;

/** "Onde se inscrever": the platform the notice indicates, with the notice at the source as the secondary action. */
export function ApplicationPanel({ opportunity, className }: { opportunity: PanelOpportunity; className?: string }) {
  const application = opportunity.application ?? null;
  const host = application && !application.label ? linkHost(application.url) : null;
  return (
    <section
      aria-labelledby="opportunity-application"
      data-testid="section-opportunity-application"
      className={cn('rounded-xl border border-border bg-card p-5 sm:p-7', className)}
    >
      <h2 id="opportunity-application" className="type-section text-foreground">
        Onde se inscrever
      </h2>
      {application ? (
        <>
          <p data-testid="text-application-origin" className="mt-2 type-ui text-muted-foreground">
            {applicationOriginText(application, opportunity.sourceUrl)}
            {host && <> Endereço: <span className="font-semibold text-foreground">{host}</span>.</>}
          </p>
          <p className="mt-1 type-meta text-muted-foreground">Confira as regras e o prazo no edital antes de enviar a inscrição.</p>
        </>
      ) : (
        <p data-testid="text-application-missing" className="mt-2 type-ui text-muted-foreground">
          {missingApplicationText(opportunity)}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {application && (
          <a
            href={application.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-opportunity-application"
            className={cn(buttonClass('primary', 'lg'), 'h-auto min-h-11 whitespace-normal py-2 text-center')}
          >
            <LogIn size={16} aria-hidden="true" />
            {applicationActionText(application)}
            <ExternalLink size={16} aria-hidden="true" />
            {NEW_TAB}
          </a>
        )}
        {opportunity.sourceUrl && (
          <a
            href={opportunity.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-opportunity-source"
            className={cn(buttonClass('outline', application ? 'md' : 'lg'), 'h-auto min-h-9 whitespace-normal py-2 text-center')}
          >
            <FileText size={16} aria-hidden="true" />
            Ver edital na fonte
            <ExternalLink size={14} aria-hidden="true" />
            {NEW_TAB}
          </a>
        )}
      </div>
    </section>
  );
}

/** Discreet badge for list rows and recommendations; nothing when no known platform was found. */
export function ApplicationBadge({ application, className }: { application: OpportunityApplication | null | undefined; className?: string }) {
  const text = applicationBadgeText(application);
  if (!text) return null;
  return (
    <span data-testid="badge-opportunity-application" className={cn('inline-flex items-center gap-1 type-meta text-muted-foreground', className)}>
      <LogIn size={12} aria-hidden="true" className="shrink-0" />
      {text}
    </span>
  );
}
