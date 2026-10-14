import React, { Children, Fragment, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react';
import { segmentGlossary } from '../lib/term-detection';
import { GlossaryTerm } from './glossary-term';

/**
 * Who marked each term inside a scope (one page), so a term gets a popover only on its first occurrence.
 * A claim belongs to the GlossaryText that rendered it; after each commit the owner syncs what it actually marked,
 * and unmounting releases it.
 */
export class GlossaryTracker {
  private owners = new Map<string, string>();

  claim(termId: string, owner: string) {
    const current = this.owners.get(termId);
    if (current === undefined) {
      this.owners.set(termId, owner);
      return true;
    }
    return current === owner;
  }

  sync(owner: string, termIds: string[]) {
    this.release(owner);
    for (const termId of termIds) if (!this.owners.has(termId)) this.owners.set(termId, owner);
  }

  release(owner: string) {
    for (const [termId, current] of this.owners) if (current === owner) this.owners.delete(termId);
  }
}

const GlossaryScopeContext = createContext<GlossaryTracker | null>(null);

/** Marks each glossary term once across everything rendered inside (a page, a panel). Without a scope, once per GlossaryText. */
export function GlossaryScope({ children }: { children: ReactNode }) {
  const [tracker] = useState(() => new GlossaryTracker());
  return <GlossaryScopeContext.Provider value={tracker}>{children}</GlossaryScopeContext.Provider>;
}

/** Never marked inside: links and buttons (a button inside a button is invalid), code and form controls. */
const SKIPPED_TAGS = new Set(['a', 'button', 'code', 'pre', 'kbd', 'samp', 'textarea', 'select', 'option', 'input']);

type ElementProps = { children?: ReactNode; href?: unknown; 'data-glossary'?: unknown };

function annotate(node: ReactNode, claim: (termId: string) => boolean, key: string): ReactNode {
  if (typeof node === 'string') {
    const segments = segmentGlossary(node, claim);
    if (segments.length === 1 && typeof segments[0] === 'string') return node;
    return (
      <Fragment key={key}>
        {segments.map((segment, index) =>
          typeof segment === 'string' ? (
            segment
          ) : (
            <GlossaryTerm key={index} termId={segment.termId}>
              {segment.text}
            </GlossaryTerm>
          ),
        )}
      </Fragment>
    );
  }
  if (Array.isArray(node)) return Children.toArray(node).map((child, index) => annotate(child, claim, `${key}.${index}`));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<ElementProps>;
  const { props, type } = element;
  // Custom components are left alone: their children may not be rendered as text. Only host elements and fragments are walked.
  const walkable = type === Fragment || typeof type === 'string';
  if (!walkable || props.href !== undefined || props['data-glossary'] === 'off') return node;
  if (typeof type === 'string' && SKIPPED_TAGS.has(type)) return node;
  if (props.children === undefined) return node;
  return cloneElement(element, undefined, annotate(props.children, claim, `${key}.c`));
}

/**
 * Text with glossary terms detected from the fixed term list (no AI): the first occurrence of each term opens its
 * definition. Strings and plain HTML children are scanned; links, buttons and code are not.
 */
export function GlossaryText({ children }: { children: ReactNode }) {
  const scope = useContext(GlossaryScopeContext);
  const owner = useId();
  const marked: string[] = [];
  const local = new Set<string>();
  const claim = (termId: string) => {
    if (local.has(termId)) return false;
    local.add(termId);
    if (scope && !scope.claim(termId, owner)) return false;
    marked.push(termId);
    return true;
  };
  const content = annotate(children, claim, 'g');
  const signature = marked.join(' ');

  useEffect(() => {
    if (!scope) return;
    scope.sync(owner, signature ? signature.split(' ') : []);
    return () => scope.release(owner);
  }, [scope, owner, signature]);

  return <>{content}</>;
}
