import React from 'react';
import { ExternalLink, Gavel, TriangleAlert } from 'lucide-react';
import type { TenderPlatform } from '@/api';
import { cn } from '@/lib/utils';
import { missingRegistration, NOT_REGISTERED_TEXT, platformDescription } from '../lib/platform';

type Props = {
  platform: TenderPlatform | null | undefined;
  registeredPlatforms: readonly string[];
  /** `row`: only known rooms, compact. `detail`: every publisher, with an explanation when the room is unknown. */
  variant?: 'row' | 'detail';
  className?: string;
};

/** "Disputa em: <plataforma>", linking to the room when known, plus the amber registration warning. */
export function PlatformBadge({ platform, registeredPlatforms, variant = 'row', className }: Props) {
  if (!platform || (variant === 'row' && platform.kind !== 'platform')) return null;
  const { label, hint } = platformDescription(platform);
  const missing = missingRegistration(platform, registeredPlatforms);
  const text = variant === 'row' ? 'text-xs' : 'type-meta';
  return (
    <span data-testid="badge-platform" data-kind={platform.kind} className={cn('relative z-raised inline-flex flex-wrap items-center gap-1.5', className)}>
      <span title={hint ?? undefined} className={cn('inline-flex items-center gap-1 font-medium text-foreground/80', text)}>
        <Gavel size={variant === 'row' ? 11 : 13} aria-hidden="true" className="shrink-0 text-foreground-subtle" />
        {platform.url ? (
          <a
            href={platform.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-platform"
            className="inline-flex items-center gap-1 underline-offset-4 hover:text-primary hover:underline focus-visible:focus-ring"
          >
            {label}
            <ExternalLink size={variant === 'row' ? 10 : 12} aria-hidden="true" />
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        ) : (
          label
        )}
      </span>
      {variant === 'detail' && hint && <span className="type-meta text-muted-foreground">{hint}</span>}
      {missing && (
        <span
          data-testid="badge-platform-not-registered"
          className={cn('inline-flex items-center gap-1 rounded-lg bg-warning-subtle px-1.5 py-px font-semibold text-warning-subtle-foreground ring-1 ring-inset ring-warning/40', text)}
        >
          <TriangleAlert size={variant === 'row' ? 11 : 12} aria-hidden="true" />
          {NOT_REGISTERED_TEXT}
        </span>
      )}
    </span>
  );
}
