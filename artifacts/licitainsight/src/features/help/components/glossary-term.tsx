import React, { useId, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, CircleHelp, X } from 'lucide-react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { GLOSSARY_DISCLAIMER_SHORT, glossaryById, type GlossaryEntry } from '../glossary';

export const glossaryAnchor = (id: string) => `termo-${id}`;

const linkClass = 'font-semibold text-primary underline-offset-4 hover:underline focus-visible:focus-ring';

/** Definition body, shared by the popover and tests. `action` sits beside the title (the popover's close button). */
export function GlossaryDefinition({ entry, titleId, action }: { entry: GlossaryEntry; titleId: string; action?: ReactNode }) {
  const [location] = useLocation();
  const anchor = glossaryAnchor(entry.id);
  return (
    <div className="space-y-2 type-meta text-foreground" data-testid={`glossary-definition-${entry.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p id={titleId} className="type-ui font-semibold text-foreground">
          {entry.term}
        </p>
        {action}
      </div>
      <p>{entry.definition}</p>
      <p>
        <span className="font-semibold">O que fazer: </span>
        {entry.whatToDo}
      </p>
      {entry.sources.length > 0 && (
        <ul aria-label="Fontes oficiais" className="space-y-1">
          {entry.sources.map((source) => (
            <li key={`${source.url}-${source.label}`}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className={cn('inline-flex items-center gap-1', linkClass)}>
                {source.label}
                <ArrowUpRight size={13} aria-hidden="true" className="shrink-0" />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border-subtle pt-2 text-muted-foreground">{GLOSSARY_DISCLAIMER_SHORT}</p>
      {location === '/ajuda' ? (
        // Already on /ajuda: a plain in-page jump (a router push would not scroll).
        <a href={`#${anchor}`} className={linkClass} data-testid={`link-glossary-${entry.id}`}>
          Ver no glossário
        </a>
      ) : (
        <Link href={`/ajuda#${anchor}`} className={linkClass} data-testid={`link-glossary-${entry.id}`}>
          Ver no glossário
        </Link>
      )}
    </div>
  );
}

/**
 * A glossary term that opens its definition in a popover. Radix gives the keyboard and screen reader contract:
 * a real <button> with aria-expanded/aria-controls, Enter/Space to open, focus moved into the dialog, Esc to close
 * and focus back on the term. Taps work the same on touch screens.
 * `inline`: the word itself, dotted underline. `icon`: a help icon beside a label the term can't wrap (a checkbox label).
 */
export function GlossaryTerm({
  termId,
  children,
  variant = 'inline',
  className,
}: {
  termId: string;
  children?: ReactNode;
  variant?: 'inline' | 'icon';
  className?: string;
}) {
  const titleId = useId();
  const entry = glossaryById.get(termId);
  if (!entry) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {variant === 'icon' ? (
          <button
            type="button"
            aria-label={`O que é ${entry.term}?`}
            className={cn(
              'inline-flex size-7 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring',
              className,
            )}
            data-testid={`glossary-icon-${entry.id}`}
          >
            <CircleHelp size={14} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              'inline cursor-help rounded-sm p-0 text-left underline decoration-dotted decoration-1 underline-offset-[3px] transition-colors duration-fast ease-standard hover:decoration-solid focus-visible:focus-ring',
              className,
            )}
            data-testid={`glossary-term-${entry.id}`}
          >
            {children ?? entry.term}
            <span className="sr-only"> (o que é?)</span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        align="start"
        collisionPadding={16}
        className="w-[min(22rem,calc(100vw-2rem))] motion-reduce:animate-none"
      >
        <GlossaryDefinition
          entry={entry}
          titleId={titleId}
          action={
            <PopoverPrimitive.Close
              aria-label="Fechar definição"
              className="-mt-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-pill text-muted-foreground transition-colors duration-fast ease-standard hover:bg-muted hover:text-foreground focus-visible:focus-ring"
            >
              <X size={14} aria-hidden="true" />
            </PopoverPrimitive.Close>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
