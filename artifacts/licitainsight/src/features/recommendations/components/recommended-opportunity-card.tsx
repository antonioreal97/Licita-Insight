import React from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import type { OpportunitySummary } from '@/api';
import { ApplicationBadge } from '@/features/opportunities/components/application-panel';

/**
 * The whole card opens the opportunity, like the tender rows below it: one link (the title) stretched over the card,
 * so the application badge and the reasons stay plain text and there is no nested interactive element.
 */
export function RecommendedOpportunityCard({ opportunity, reasons }: { opportunity: OpportunitySummary; reasons: string[] }) {
  const titleId = `opportunity-title-${opportunity.id}`;
  return (
    <article
      aria-labelledby={titleId}
      data-testid={`card-recommended-opportunity-${opportunity.id}`}
      className="group relative border-b border-border px-4 py-4 transition-colors duration-fast ease-standard last:border-0 hover:bg-surface-sunken active:bg-surface-sunken has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-2 type-meta text-muted-foreground">
        <span className="rounded-full bg-secondary px-2 py-1 text-secondary-foreground">{opportunity.sourceName}</span>
        <span>{opportunity.opportunityType ?? 'Oportunidade'}</span>
        <ApplicationBadge application={opportunity.application} />
      </div>
      <h3 id={titleId} className="mt-2 type-section text-foreground">
        <Link
          href={`/oportunidades/${encodeURIComponent(opportunity.id)}`}
          data-testid={`link-recommended-opportunity-${opportunity.id}`}
          className="underline-offset-4 transition-colors duration-fast ease-standard after:absolute after:inset-0 after:content-[''] group-hover:text-primary group-hover:underline focus-visible:outline-none"
        >
          {opportunity.title}
        </Link>
      </h3>
      <p className="mt-1 type-meta text-muted-foreground">{opportunity.organizationName}</p>
      {reasons.length > 0 && (
        <ul className="mt-2 type-meta text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      )}
      <span
        aria-hidden="true"
        className="mt-3 inline-flex items-center gap-1 type-ui font-semibold text-primary transition-transform duration-fast ease-standard group-hover:translate-x-0.5"
      >
        Ver oportunidade <ArrowRight size={14} />
      </span>
    </article>
  );
}
