import React, { useLayoutEffect, useRef, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

type Props = {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  panelId: string;
  titleId: string;
  testIdPrefix?: string;
  /** Re-measure when content above the rail changes its position. */
  layoutKey?: string;
};

/** Grid used by every results page that pairs a 264 px filter rail with its list. */
export const filterWorkspaceClass = (collapsed: boolean) =>
  `grid gap-6 transition-[grid-template-columns] duration-slow ease-emphasized motion-reduce:transition-none ${
    collapsed ? '@min-[52rem]/page:grid-cols-[40px_minmax(0,1fr)]' : '@min-[52rem]/page:grid-cols-[264px_minmax(0,1fr)]'
  }`;

/** Shared desktop rail from “Explorar editais”: sticky, collapsible and sized to the visible viewport. */
export function FilterSidebar({ collapsed, onCollapsedChange, activeCount, onClear, children, panelId, titleId, testIdPrefix = '', layoutKey }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const testId = (name: string) => `${testIdPrefix}${name}`;

  useLayoutEffect(() => {
    let frame = 0;
    const fitToViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const panel = panelRef.current;
          if (!panel) return;
          const availableHeight = Math.max(240, window.innerHeight - panel.getBoundingClientRect().top - 16);
          if (collapsed) {
            panel.style.height = `${availableHeight}px`;
            panel.style.maxHeight = '';
          } else {
            panel.style.height = '';
            panel.style.maxHeight = `${availableHeight}px`;
          }
        });
      });
    };
    fitToViewport();
    window.addEventListener('scroll', fitToViewport, { passive: true });
    window.addEventListener('resize', fitToViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', fitToViewport);
      window.removeEventListener('resize', fitToViewport);
    };
  }, [collapsed, layoutKey]);

  return (
    <aside aria-label={collapsed ? 'Filtros' : undefined} aria-labelledby={collapsed ? undefined : titleId} className="hidden @min-[52rem]/page:block">
      <div
        ref={panelRef}
        className={`sticky top-[calc(var(--spacing-header-mobile)+1rem)] border-r border-border-subtle pb-2 lg:top-[calc(var(--spacing-header)+1rem)] ${
          collapsed ? 'pr-1' : 'overflow-y-auto overscroll-contain pr-4 [scrollbar-color:var(--border-strong)_transparent] [scrollbar-width:thin]'
        }`}
      >
        <div
          className={`sticky top-0 z-raised flex items-center border-b border-border-subtle bg-background pb-3 ${collapsed ? 'justify-center' : 'justify-between'}`}
        >
          {!collapsed && (
            <h2 id={titleId} className="type-section">
              Filtros
            </h2>
          )}
          <div className="flex items-center gap-1">
            {!collapsed && activeCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                data-testid={testId('button-sidebar-clear')}
                className="rounded-lg px-1.5 py-1 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring"
              >
                Limpar ({activeCount})
              </button>
            )}
            <button
              type="button"
              aria-controls={panelId}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expandir filtros' : 'Recolher filtros'}
              title={collapsed ? 'Expandir filtros' : 'Recolher filtros'}
              data-testid={testId('button-collapse-filters')}
              onClick={() => onCollapsedChange(!collapsed)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:focus-ring"
            >
              {collapsed ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
            </button>
          </div>
        </div>
        <div id={panelId} hidden={collapsed}>
          {children}
        </div>
      </div>
    </aside>
  );
}
