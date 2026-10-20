import React, { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ParticipationStage, SavedTender } from '@/api';
import { useUpdateParticipation } from '@/features/participation/hooks/use-participation';
import { STAGE_LABELS } from '@/features/participation/lib/stages';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { COLLAPSED_COLUMN, groupByStage, type BoardColumn } from '../lib/board';
import { focusInRegion } from '../lib/board-scroll';
import { cardDeadline } from '../lib/deadline-events';
import { DeadlineBadge } from './deadline-badge';
import { MoveStageMenu } from './move-stage-menu';

const DRAG_TYPE = 'application/x-pardal-saved-tender';
/** How long focus keeps following a moved card (optimistic move, server answer, possible rollback). */
const FOLLOW_MS = 15_000;

/** The region's horizontal padding (`px-1`): keeps focus rings inside its clip. */
const REGION_INSET = 4;

const count = (n: number) => `${n} ${n === 1 ? 'edital' : 'editais'}`;

/** Drag and drop only where there is a fine pointer: on touch, a long press would fight the horizontal scroll. */
const canDrag = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches === true;

const scrollBehavior = (): ScrollBehavior => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** Height of the sticky app header, so a revealed card does not end up under it. */
const headerHeight = () => document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;

type CardProps = {
  item: SavedTender;
  now: Date;
  moving: boolean;
  busy: boolean;
  draggable: boolean;
  onMove: (item: SavedTender, stage: ParticipationStage) => void;
  onDragStart: (event: DragEvent, item: SavedTender) => void;
  onDragEnd: () => void;
};

function BoardCard({ item, now, moving, busy, draggable, onMove, onDragStart, onDragEnd }: CardProps) {
  const id = item.tender.id;
  const titleId = `board-title-${id}`;
  const deadline = cardDeadline(item, now);
  return (
    <li>
      <article
        id={`board-card-${id}`}
        tabIndex={-1}
        aria-labelledby={titleId}
        aria-busy={moving || undefined}
        data-stage={item.stage}
        draggable={draggable}
        onDragStart={(event) => onDragStart(event, item)}
        onDragEnd={onDragEnd}
        className={cn(
          'flex flex-col gap-2 rounded-xl border border-border bg-card p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          draggable && 'cursor-grab active:cursor-grabbing',
          moving && 'opacity-80',
        )}
        data-testid={`board-card-${id}`}
      >
        <h3 id={titleId} className="type-ui font-semibold text-foreground">
          <Link href={`/tenders/${id}`} className="line-clamp-3 break-words rounded-lg underline-offset-4 hover:underline focus-visible:focus-ring" draggable={false}>
            {item.tender.title}
          </Link>
        </h3>
        <p className="line-clamp-2 break-words type-meta text-muted-foreground">{item.tender.organization.name}</p>
        <div className="flex flex-col items-start gap-1">
          {deadline ? (
            <>
              <DeadlineBadge kind={deadline.kind} overdue={deadline.overdue} />
              <time dateTime={deadline.at} className="type-meta font-semibold tabular-nums text-foreground">
                {formatDateTime(deadline.at)}
              </time>
            </>
          ) : (
            <span className="type-meta text-muted-foreground">Sem prazo futuro</span>
          )}
        </div>
        <p className="line-clamp-3 break-words type-meta text-muted-foreground">
          Próxima ação (você marcou): {item.nextAction ? <span className="text-foreground/90">{item.nextAction}</span> : 'nenhuma'}
        </p>
        <div>
          <MoveStageMenu
            tenderId={id}
            stage={item.stage}
            pending={moving}
            disabled={busy && !moving}
            describedBy={titleId}
            onMove={(stage) => onMove(item, stage)}
          />
        </div>
      </article>
    </li>
  );
}

type ColumnProps = {
  column: BoardColumn;
  collapsed?: boolean;
  onToggle?: () => void;
  dropTarget: boolean;
  onDragOver: (event: DragEvent, stage: ParticipationStage) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent, stage: ParticipationStage) => void;
  children: ReactNode;
};

function Column({ column, collapsed = false, onToggle, dropTarget, onDragOver, onDragLeave, onDrop, children }: ColumnProps) {
  const headingId = `board-column-${column.stage}`;
  const listId = `board-list-${column.stage}`;
  return (
    <section
      aria-labelledby={headingId}
      onDragOver={(event) => onDragOver(event, column.stage)}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, column.stage)}
      className={cn(
        'flex shrink-0 snap-start flex-col rounded-xl border border-border bg-muted p-2 transition-colors duration-fast ease-standard',
        collapsed ? 'w-[min(14rem,calc(100vw-3rem))]' : 'w-[min(18rem,calc(100vw-3rem))]',
        dropTarget && 'border-dashed border-border-strong bg-primary-subtle',
      )}
      data-testid={`board-column-${column.stage}`}
    >
      <div className="flex min-h-11 items-center justify-between gap-2 px-1 sm:min-h-8">
        <h2 id={headingId} tabIndex={-1} className="flex min-w-0 items-baseline gap-2 rounded-lg type-ui font-semibold text-foreground focus-visible:focus-ring">
          <span className="truncate">{STAGE_LABELS[column.stage]}</span>
          <span className="shrink-0 type-meta font-medium tabular-nums text-muted-foreground">
            <span aria-hidden="true">{column.items.length}</span>
            <span className="sr-only">: {count(column.items.length)}</span>
          </span>
        </h2>
        {onToggle && (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggle}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-2 type-meta font-semibold text-primary hover:underline focus-visible:focus-ring sm:h-8"
            data-testid="button-toggle-dismissed"
          >
            {collapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
            {collapsed ? 'Mostrar' : 'Recolher'}
          </button>
        )}
      </div>
      <div id={listId} hidden={collapsed} className="mt-2">
        {column.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-4 text-center type-meta text-muted-foreground">Nenhum edital nesta etapa.</p>
        ) : (
          <ul className="flex flex-col gap-2">{children}</ul>
        )}
      </div>
    </section>
  );
}

/**
 * One column per stage, "Não vou participar" collapsed at the end. Moving uses the same PUT, optimistic update and
 * rollback as the list's stage menu (`useUpdateParticipation`), so the monitoring rule of the contract still applies.
 * Keyboard: "Mover para…" on each card; focus follows the card to its new column (and back on rollback).
 */
export function PipelineBoard({ items }: { items: SavedTender[] }) {
  const now = useMemo(() => new Date(), [items]);
  const columns = useMemo(() => groupByStage(items, now), [items, now]);
  const { update, isPending } = useUpdateParticipation();
  const [showDismissed, setShowDismissed] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dragging, setDragging] = useState<SavedTender | null>(null);
  const [dropStage, setDropStage] = useState<ParticipationStage | null>(null);
  const [draggable] = useState(canDrag);
  const follow = useRef<{ id: string; until: number } | null>(null);
  const sawPending = useRef(false);
  const region = useRef<HTMLDivElement>(null);

  // A moved card unmounts from one column and mounts in another: focus would fall back to <body>. Put it back on the card.
  useEffect(() => {
    const target = follow.current;
    if (!target) return;
    if (isPending) sawPending.current = true;
    const active = document.activeElement;
    const card = document.getElementById(`board-card-${target.id}`);
    // Never a plain focus(): it would scroll every ancestor. Only the region moves sideways, the window only vertically.
    if (card && region.current && (!active || active === document.body)) {
      focusInRegion(region.current, card, card, window, { align: 'nearest', inset: REGION_INSET, topInset: headerHeight(), column: card.closest('section') ?? undefined });
    }
    if ((sawPending.current && !isPending) || Date.now() > target.until) {
      follow.current = null;
      sawPending.current = false;
      setMovingId(null);
    }
  }, [columns, isPending]);

  const move = (item: SavedTender, stage: ParticipationStage) => {
    if (stage === item.stage || isPending) return;
    if (stage === COLLAPSED_COLUMN) setShowDismissed(true);
    follow.current = { id: item.tender.id, until: Date.now() + FOLLOW_MS };
    sawPending.current = false;
    setMovingId(item.tender.id);
    setAnnouncement(`“${item.tender.title}” movido para “${STAGE_LABELS[stage]}”.`);
    update({ tenderId: item.tender.id, previous: item, body: { stage } });
  };

  const onDragStart = (event: DragEvent, item: SavedTender) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(DRAG_TYPE, item.tender.id);
    setDragging(item);
  };
  const onDragEnd = () => {
    setDragging(null);
    setDropStage(null);
  };
  const onDragOver = (event: DragEvent, stage: ParticipationStage) => {
    if (!dragging || dragging.stage === stage || isPending) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropStage !== stage) setDropStage(stage);
  };
  const onDragLeave = (event: DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropStage(null);
  };
  const onDrop = (event: DragEvent, stage: ParticipationStage) => {
    event.preventDefault();
    if (dragging) move(dragging, stage);
    onDragEnd();
  };

  const goTo = (stage: ParticipationStage) => {
    if (stage === COLLAPSED_COLUMN) setShowDismissed(true);
    // After the dismissed column expands.
    requestAnimationFrame(() => {
      const heading = document.getElementById(`board-column-${stage}`);
      const column = heading?.closest('section');
      if (!heading || !column || !region.current) return;
      focusInRegion(region.current, column, heading, window, { align: 'start', behavior: scrollBehavior(), inset: REGION_INSET, topInset: headerHeight() });
    });
  };

  const renderCards = (column: BoardColumn) =>
    column.items.map((item) => (
      <BoardCard
        key={item.tender.id}
        item={item}
        now={now}
        moving={movingId === item.tender.id && isPending}
        busy={isPending}
        draggable={draggable}
        onMove={move}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
    ));

  const columnProps = (column: BoardColumn) => ({
    column,
    dropTarget: dropStage === column.stage,
    onDragOver,
    onDragLeave,
    onDrop,
  });

  return (
    <div data-testid="saved-board">
      <p aria-live="polite" className="sr-only" data-testid="text-board-announcement">
        {announcement}
      </p>
      {/* Below sm the control scrolls on its own; the page never scrolls sideways. */}
      <div className="relative -mx-1 mb-3 overflow-x-auto px-1 pb-1">
        <nav aria-label="Ir para a etapa no quadro" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {columns.map((column) => (
            <button
              key={column.stage}
              type="button"
              onClick={() => goTo(column.stage)}
              className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 type-ui font-medium text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring sm:h-7"
              data-testid={`board-jump-${column.stage}`}
            >
              {STAGE_LABELS[column.stage]}
              <span className="tabular-nums text-foreground" aria-hidden="true">
                {column.items.length}
              </span>
              <span className="sr-only">: {count(column.items.length)}</span>
            </button>
          ))}
        </nav>
      </div>
      {/* The board scrolls sideways inside its own region (keyboard-focusable), never the page. `relative` keeps the
          absolutely positioned `sr-only` texts of off-screen columns inside the clip, or they widen the page. */}
      <div
        ref={region}
        role="region"
        aria-label="Quadro por etapa"
        tabIndex={0}
        className="relative -mx-1 snap-x snap-mandatory overflow-x-auto px-1 pb-3 focus-visible:focus-ring md:snap-none"
        data-testid="board-scroll"
      >
        <div className="flex w-max items-start gap-3">
          {columns.map((column) =>
            column.stage === COLLAPSED_COLUMN ? (
              <Column key={column.stage} {...columnProps(column)} collapsed={!showDismissed} onToggle={() => setShowDismissed((value) => !value)}>
                {renderCards(column)}
              </Column>
            ) : (
              <Column key={column.stage} {...columnProps(column)}>
                {renderCards(column)}
              </Column>
            ),
          )}
        </div>
      </div>
      {draggable && <p className="mt-1 type-meta text-muted-foreground">Arraste um cartão para outra coluna ou use “Mover para…”.</p>}
    </div>
  );
}
