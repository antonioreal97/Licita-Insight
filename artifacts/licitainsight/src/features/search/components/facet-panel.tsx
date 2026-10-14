import { useEffect, useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { FacetBucket, SearchFacets, TenderSearchParams } from '@/api';
import { Checkbox } from '@/components/ui/checkbox';
import { GlossaryTerm } from '@/features/help/components/glossary-term';
import { entryForLabel } from '@/features/help/lib/term-detection';
import { formatNumber } from '@/lib/format';
import { isCalendarDate, MAX_MONEY } from '@/services/search-service';
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

/** DS input spec: border-strong on hover, ring + 3px halo on focus. `text-base` on phones avoids iOS zoom. */
const inputBase =
  'w-full rounded-lg border border-input bg-background text-base transition-[border-color,box-shadow] duration-fast ease-standard placeholder:text-muted-foreground focus:border-ring aria-[invalid=true]:border-destructive sm:type-ui';

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Section({ title, badge, children, defaultOpen = true }: { title: string; badge?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-b border-border-subtle py-4 last:border-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="flex min-h-8 w-full items-center gap-2 rounded-lg text-left type-label text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground focus-visible:focus-ring"
        >
          <span className="flex-1">{title}</span>
          {badge ? (
            <span className="rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground">{badge}</span>
          ) : null}
          <ChevronDown size={15} className={`transition-transform duration-fast ease-standard ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>
      <div id={id} hidden={!open} className="pt-2">
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
  // Enum groups render the app's PT-BR labels, not the API's bucket labels (see labelFor).
  const options = useMemo(() => {
    const enumLabels = config.param === 'status' || config.param === 'modality';
    const known = enumLabels ? buckets.map((b) => ({ ...b, label: labelFor(config.param, b.value) })) : buckets;
    const missing = selected
      .filter((value) => !buckets.some((b) => b.value === value))
      .map((value) => ({ value, label: labelFor(config.param, value), count: 0 }));
    return [...known, ...missing];
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
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-foreground-subtle" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={config.searchPlaceholder}
            aria-label={config.searchPlaceholder}
            data-testid={`input-facet-filter-${config.param}`}
            className={`${inputBase} pr-2 pl-8 ${density === 'comfortable' ? 'h-10' : 'h-8'}`}
          />
        </div>
      )}
      {options.length === 0 ? (
        <p className="py-1 type-meta text-muted-foreground">{countsKnown ? 'Sem opções para os resultados atuais.' : 'Opções indisponíveis no momento.'}</p>
      ) : filtered.length === 0 ? (
        <p className="py-1 type-meta text-muted-foreground">Nenhuma opção corresponde a “{filter}”.</p>
      ) : (
        <ul role="group" aria-label={config.title} id={groupId} className="space-y-0.5">
          {shown.map((option) => {
            const checked = selected.includes(option.value);
            const id = `${groupId}-${option.value}`;
            // Modality options get a help icon beside the label (a button can't sit inside the checkbox label).
            const termId = config.param === 'modality' ? entryForLabel(option.label) : undefined;
            return (
              <li key={option.value} className={termId ? 'flex items-center gap-0.5' : undefined}>
                <label
                  htmlFor={id}
                  className={`flex ${row} min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 type-ui transition-colors duration-fast ease-standard hover:bg-surface-sunken ${countsKnown && option.count === 0 && !checked ? 'text-muted-foreground' : 'text-foreground'}`}
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
                  <span className="shrink-0 type-data text-xs text-muted-foreground">{countsKnown ? formatNumber(option.count) : '—'}</span>
                </label>
                {termId && <GlossaryTerm termId={termId} variant="icon" className={density === 'comfortable' ? 'size-10' : undefined} />}
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
          className={`mt-1 rounded-lg px-1.5 text-xs font-semibold text-primary hover:underline focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-7'}`}
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
  const tooLarge = (minValue ?? 0) > MAX_MONEY || (maxValue ?? 0) > MAX_MONEY;
  const reversed = minValue !== undefined && maxValue !== undefined && minValue > maxValue;
  const invalid = tooLarge || reversed;

  const commit = () => {
    if (tooLarge) return; // keep the typed text next to its error; reformatting a 1e23 float would change the digits
    setMin(formatBRLInput(minValue));
    setMax(formatBRLInput(maxValue));
    if (invalid || (minValue === params.valueMin && maxValue === params.valueMax)) return;
    onChange({ valueMin: minValue, valueMax: maxValue });
  };

  const bounds = facets?.valueRange;
  const field = (label: string, value: string, set: (v: string) => void, placeholder: number | null | undefined, testId: string, fieldInvalid: boolean) => (
    <label className="min-w-0 flex-1">
      <span className="mb-1 block type-meta font-medium text-muted-foreground">{label}</span>
      <span className="relative block">
        <span aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 type-meta text-muted-foreground">
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
          aria-invalid={fieldInvalid}
          aria-describedby={fieldInvalid ? errorId : undefined}
          data-testid={testId}
          className={`${inputBase} pr-2 pl-8 type-data ${density === 'comfortable' ? 'h-10' : 'h-8'}`}
        />
      </span>
    </label>
  );

  return (
    <Section title="Valor estimado" badge={params.valueMin !== undefined || params.valueMax !== undefined ? 1 : 0}>
      <div className="flex gap-2">
        {field('Mínimo', min, setMin, bounds?.min, 'input-value-min', reversed || (minValue ?? 0) > MAX_MONEY)}
        {field('Máximo', max, setMax, bounds?.max, 'input-value-max', reversed || (maxValue ?? 0) > MAX_MONEY)}
      </div>
      {invalid ? (
        <p id={errorId} role="alert" className="mt-1.5 type-meta text-destructive">
          {tooLarge ? `O valor máximo aceito é R$ ${formatBRLInput(MAX_MONEY)}.` : 'O valor mínimo deve ser menor que o máximo.'}
        </p>
      ) : bounds?.min != null && bounds.max != null ? (
        <p className="mt-1.5 type-meta text-muted-foreground">
          Nos resultados: {formatCompactCurrency(bounds.min)} – {formatCompactCurrency(bounds.max)}. Editais sem valor informado são excluídos ao filtrar.
        </p>
      ) : null}
    </Section>
  );
}

/**
 * Date field that commits on blur/Enter, or right away once the value is a plausible full date (calendar picks).
 * Typing the year digit by digit produces "0002-…", "0020-…"; committing those would navigate and fetch on every key.
 */
function DateInput({
  value,
  onCommit,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & { value: string | undefined; onCommit: (value: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = (next: string) => {
    if ((next || undefined) !== value) onCommit(next || undefined);
  };
  return (
    <input
      {...props}
      type="date"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (isCalendarDate(event.target.value) && event.target.value >= '1900') commit(event.target.value);
      }}
      onBlur={() => commit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(draft);
        }
      }}
    />
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
  const input = `${inputBase} px-2 ${density === 'comfortable' ? 'h-10' : 'h-8'}`;

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
              className={`rounded-pill border px-2.5 type-meta font-semibold transition-colors duration-fast ease-standard focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-7'} ${active ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:bg-surface-sunken hover:text-foreground'}`}
            >
              Próx. {label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block type-meta font-medium text-muted-foreground">De</span>
          <DateInput
            value={params.deadlineFrom}
            max={params.deadlineTo}
            onCommit={(value) => onChange({ deadlineFrom: value })}
            aria-invalid={invalid}
            data-testid="input-deadline-from"
            className={input}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="mb-1 block type-meta font-medium text-muted-foreground">Até</span>
          <DateInput
            value={params.deadlineTo}
            min={params.deadlineFrom}
            onCommit={(value) => onChange({ deadlineTo: value })}
            aria-invalid={invalid}
            data-testid="input-deadline-to"
            className={input}
          />
        </label>
      </div>
      {invalid && (
        <p role="alert" className="mt-1.5 type-meta text-destructive">
          A data inicial deve ser anterior à final.
        </p>
      )}
    </Section>
  );
}

function PanelSkeleton() {
  return (
    <div aria-hidden className="space-y-6 py-4">
      {Array.from({ length: 4 }, (_, group) => (
        <div key={group} className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded-lg bg-muted" />
          {Array.from({ length: 4 }, (_, row) => (
            <div key={row} className="flex items-center gap-2">
              <div className="h-4 w-4 animate-pulse rounded-lg bg-muted" />
              <div className="h-3 flex-1 animate-pulse rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function NewOnlyFilter({ params, facets, onChange, density }: Pick<PanelProps, 'params' | 'facets' | 'onChange'> & { density: FacetDensity }) {
  const id = useId();
  return (
    <Section title="Entrada no Pardal" badge={params.newOnly ? 1 : 0}>
      <label
        htmlFor={id}
        className={`flex ${density === 'comfortable' ? 'min-h-10' : 'min-h-8'} cursor-pointer items-center gap-2.5 rounded-lg px-1.5 type-ui text-foreground transition-colors duration-fast ease-standard hover:bg-surface-sunken`}
      >
        <Checkbox
          id={id}
          checked={params.newOnly ?? false}
          onCheckedChange={(checked) => onChange({ newOnly: checked === true || undefined })}
          data-testid="checkbox-filter-new-only"
          className="border-input data-[state=checked]:border-primary"
        />
        <span className="min-w-0 flex-1">Novos (24 h)</span>
        <span className="shrink-0 type-data text-xs text-muted-foreground">{facets ? formatNumber(facets.newCount) : '—'}</span>
      </label>
    </Section>
  );
}

/** Multi-select facet panel. Counts are disjunctive (each group ignores its own selection), so OR-ing within a group stays predictable. */
export function FacetPanel({ params, facets, onChange, density = 'compact', loading = false }: PanelProps) {
  if (loading && !facets) return <PanelSkeleton />;
  const empty: FacetBucket[] = [];
  const countsKnown = Boolean(facets);
  // Groups with nothing to pick are hidden (no repeated "no options" lines); a group with a selection always stays so it can be cleared.
  const groups = FACET_GROUPS.filter((config) => facets?.[config.facet]?.length || selectedValues(params, config.param).length);
  const noOptions = FACET_GROUPS.every((config) => !facets?.[config.facet]?.length);
  return (
    <div data-testid="facet-panel">
      <NewOnlyFilter params={params} facets={facets} onChange={onChange} density={density} />
      {noOptions && (
        <p className="border-b border-border-subtle py-4 type-meta text-muted-foreground">
          {countsKnown ? 'Nenhum filtro disponível para estes resultados.' : 'Filtros indisponíveis: não foi possível carregar os resultados.'}
        </p>
      )}
      {groups.map((config) => (
        <FacetGroup
          key={config.param}
          config={config}
          density={density}
          countsKnown={countsKnown}
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
