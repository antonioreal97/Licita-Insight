import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { FacetBucket, SearchFacets, TenderSearchParams } from '@/api';
import { Checkbox } from '@/components/ui/checkbox';
import { formatNumber } from '@/lib/format';
import { FACET_GROUPS, labelFor, selectedValues, type FacetGroupConfig } from '../lib/facet-config';
import { formatCompactCurrency } from '../lib/filter-chips';
import { formatBRLInput, parseBRL } from '../lib/money-input';

export type FacetDensity = 'compact' | 'comfortable';

type PanelProps = {
  params: TenderSearchParams;
  facets: SearchFacets | null | undefined;
  onChange: (patch: Partial<TenderSearchParams>) => void;
  /** `comfortable` = 40px touch targets (sheet); `compact` = desktop sidebar. */
  density?: FacetDensity;
  loading?: boolean;
};

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Section({ title, badge, children, defaultOpen = true }: { title: string; badge?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-border py-3 last:border-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-9 w-full items-center gap-2 rounded-md text-left text-[13px] font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex-1">{title}</span>
          {badge ? (
            <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-primary-foreground">{badge}</span>
          ) : null}
          <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>
      <div id={id} hidden={!open} className="pt-1.5">
        {children}
      </div>
    </section>
  );
}

function FacetGroup({
  config,
  buckets,
  selected,
  onChange,
  density,
  countsKnown,
}: {
  config: FacetGroupConfig;
  buckets: FacetBucket[];
  selected: string[];
  onChange: (values: string[]) => void;
  density: FacetDensity;
  /** False when facets could not be loaded (error state): counts are unknown, not zero. */
  countsKnown: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const groupId = useId();

  // Keep selected values visible even when the current result set has no hits for them.
  const options = useMemo(() => {
    const missing = selected
      .filter((value) => !buckets.some((b) => b.value === value))
      .map((value) => ({ value, label: labelFor(config.param, value), count: 0 }));
    return [...buckets, ...missing];
  }, [buckets, selected, config.param]);

  const searchable = Boolean(config.searchPlaceholder) && options.length > config.visible;
  const filtered = filter ? options.filter((option) => fold(option.label).includes(fold(filter)) || fold(option.value).includes(fold(filter))) : options;
  const shown =
    expanded || filter ? filtered : [...filtered.slice(0, config.visible), ...filtered.slice(config.visible).filter((o) => selected.includes(o.value))];
  const hiddenCount = filtered.length - shown.length;

  const toggle = (value: string, checked: boolean) => onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));
  const row = density === 'comfortable' ? 'min-h-10' : 'min-h-8';

  return (
    <Section title={config.title} badge={selected.length}>
      {searchable && (
        <div className="relative mb-1.5">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={config.searchPlaceholder}
            aria-label={config.searchPlaceholder}
            data-testid={`input-facet-filter-${config.param}`}
            className={`w-full rounded-md border border-input bg-background pl-8 pr-2 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/25 sm:text-xs ${density === 'comfortable' ? 'h-10' : 'h-8'}`}
          />
        </div>
      )}
      {options.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">{countsKnown ? 'Sem opções para os resultados atuais.' : 'Opções indisponíveis no momento.'}</p>
      ) : filtered.length === 0 ? (
        <p className="py-1 text-xs text-muted-foreground">Nenhuma opção corresponde a “{filter}”.</p>
      ) : (
        <ul role="group" aria-label={config.title} id={groupId} className="space-y-0.5">
          {shown.map((option) => {
            const checked = selected.includes(option.value);
            const id = `${groupId}-${option.value}`;
            return (
              <li key={option.value}>
                <label
                  htmlFor={id}
                  className={`flex ${row} cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-[13px] hover:bg-muted ${countsKnown && option.count === 0 && !checked ? 'text-muted-foreground' : 'text-foreground'}`}
                >
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(value) => toggle(option.value, value === true)}
                    data-testid={`checkbox-facet-${config.param}-${option.value}`}
                    className="border-input data-[state=checked]:border-primary"
                  />
                  <span className="min-w-0 flex-1 truncate" title={option.label}>
                    {option.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{countsKnown ? formatNumber(option.count) : '—'}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {(hiddenCount > 0 || (expanded && filtered.length > config.visible)) && !filter && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={groupId}
          onClick={() => setExpanded(!expanded)}
          className={`mt-1 rounded-md px-1.5 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${density === 'comfortable' ? 'min-h-10' : 'min-h-7'}`}
        >
          {expanded ? 'Ver menos' : `Ver mais (${hiddenCount})`}
        </button>
      )}
    </Section>
  );
}

function ValueRange({ params, facets, onChange, density }: Pick<PanelProps, 'params' | 'facets' | 'onChange'> & { density: FacetDensity }) {
  const [min, setMin] = useState(formatBRLInput(params.valueMin));
  const [max, setMax] = useState(formatBRLInput(params.valueMax));
  const errorId = useId();
  useEffect(() => setMin(formatBRLInput(params.valueMin)), [params.valueMin]);
  useEffect(() => setMax(formatBRLInput(params.valueMax)), [params.valueMax]);

  const minValue = parseBRL(min);
  const maxValue = parseBRL(max);
  const invalid = minValue !== undefined && maxValue !== undefined && minValue > maxValue;

  const commit = () => {
    setMin(formatBRLInput(minValue));
    setMax(formatBRLInput(maxValue));
    if (invalid || (minValue === params.valueMin && maxValue === params.valueMax)) return;
    onChange({ valueMin: minValue, valueMax: maxValue });
  };

  const bounds = facets?.valueRange;
  const field = (label: string, value: string, set: (v: string) => void, placeholder: number | null | undefined, testId: string) => (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <span className="relative block">
        <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <input
          inputMode="numeric"
          value={value}
          onChange={(event) => set(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder != null ? formatBRLInput(Math.round(placeholder)) : '0'}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          data-testid={testId}
          className={`w-full rounded-md border border-input bg-background pl-8 pr-2 font-mono text-base tabular-nums outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-destructive sm:text-xs ${density === 'comfortable' ? 'h-10' : 'h-8'}`}
        />
      </span>
    </label>
  );

  return (
    <Section title="Valor estimado" badge={params.valueMin !== undefined || params.valueMax !== undefined ? 1 : 0}>
      <div className="flex gap-2">
        {field('Mínimo', min, setMin, bounds?.min, 'input-value-min')}
        {field('Máximo', max, setMax, bounds?.max, 'input-value-max')}
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[11px] text-destructive">
          O valor mínimo deve ser menor que o máximo.
        </p>
      ) : bounds?.min != null && bounds.max != null ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Nos resultados: {formatCompactCurrency(bounds.min)} – {formatCompactCurrency(bounds.max)}. Editais sem valor informado são excluídos ao filtrar.
        </p>
      ) : null}
    </Section>
  );
}

const toISODate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const DEADLINE_PRESETS = [
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
  { days: 30, label: '30 dias' },
];

function DeadlineRange({ params, onChange, density }: Pick<PanelProps, 'params' | 'onChange'> & { density: FacetDensity }) {
  const today = toISODate(new Date());
  const presetEnd = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toISODate(date);
  };
  const invalid = Boolean(params.deadlineFrom && params.deadlineTo && params.deadlineFrom > params.deadlineTo);
  const input = `w-full rounded-md border border-input bg-background px-2 text-base outline-none focus:ring-2 focus:ring-primary/25 aria-[invalid=true]:border-destructive sm:text-xs ${density === 'comfortable' ? 'h-10' : 'h-8'}`;

  return (
    <Section title="Prazo de proposta" badge={params.deadlineFrom || params.deadlineTo ? 1 : 0}>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Atalhos de prazo">
        {DEADLINE_PRESETS.map(({ days, label }) => {
          const end = presetEnd(days);
          const active = params.deadlineFrom === today && params.deadlineTo === end;
          return (
            <button
              key={days}
              type="button"
              aria-pressed={active}
              data-testid={`button-deadline-${days}`}
              onClick={() => onChange(active ? { deadlineFrom: undefined, deadlineTo: undefined } : { deadlineFrom: today, deadlineTo: end })}
              className={`rounded-full border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${density === 'comfortable' ? 'min-h-10' : 'min-h-7'} ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              Próx. {label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">De</span>
          <input
            type="date"
            value={params.deadlineFrom ?? ''}
            max={params.deadlineTo}
            onChange={(event) => onChange({ deadlineFrom: event.target.value || undefined })}
            aria-invalid={invalid}
            data-testid="input-deadline-from"
            className={input}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">Até</span>
          <input
            type="date"
            value={params.deadlineTo ?? ''}
            min={params.deadlineFrom}
            onChange={(event) => onChange({ deadlineTo: event.target.value || undefined })}
            aria-invalid={invalid}
            data-testid="input-deadline-to"
            className={input}
          />
        </label>
      </div>
      {invalid && (
        <p role="alert" className="mt-1.5 text-[11px] text-destructive">
          A data inicial deve ser anterior à final.
        </p>
      )}
    </Section>
  );
}

function PanelSkeleton() {
  return (
    <div aria-hidden className="space-y-5 py-3">
      {Array.from({ length: 4 }, (_, group) => (
        <div key={group} className="space-y-2">
          <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
          {Array.from({ length: 4 }, (_, row) => (
            <div key={row} className="flex items-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded-sm bg-muted" />
              <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Multi-select facet panel. Counts are disjunctive (each group ignores its own selection), so OR-ing within a group stays predictable. */
export function FacetPanel({ params, facets, onChange, density = 'compact', loading = false }: PanelProps) {
  if (loading && !facets) return <PanelSkeleton />;
  const empty: FacetBucket[] = [];
  return (
    <div data-testid="facet-panel">
      {FACET_GROUPS.map((config) => (
        <FacetGroup
          key={config.param}
          config={config}
          density={density}
          countsKnown={Boolean(facets)}
          buckets={facets?.[config.facet] ?? empty}
          selected={selectedValues(params, config.param)}
          onChange={(values) => onChange({ [config.param]: values } as unknown as Partial<TenderSearchParams>)}
        />
      ))}
      <ValueRange params={params} facets={facets} onChange={onChange} density={density} />
      <DeadlineRange params={params} onChange={onChange} density={density} />
    </div>
  );
}
