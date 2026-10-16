import React, { useEffect, useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import type { FacetBucket, SearchFacets, TenderSearchParams } from '@/api';
import { Checkbox } from '@/components/ui/checkbox';
import { GlossaryTerm } from '@/features/help/components/glossary-term';
import { entryForLabel } from '@/features/help/lib/term-detection';
import { formatNumber } from '@/lib/format';
import { isCalendarDate, MAX_MONEY } from '@/services/search-service';
import { facetGroup, labelFor, optionLabelFor, selectedValues, type ArrayFilterKey, type FacetGroupConfig } from '../lib/facet-config';
import { formatCompactCurrency, valueRangeLabel } from '../lib/filter-chips';
import { activeDeadlinePreset, activeValuePreset, DEADLINE_PRESET_DAYS, deadlinePresetPatch, VALUE_PRESETS, valuePresetPatch } from '../lib/filter-presets';
import { formatBRLInput, parseBRL } from '../lib/money-input';
import { isDefaultStatus } from '../lib/search-defaults';

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

const linkButton = (density: FacetDensity) =>
  `rounded-lg px-1.5 text-left text-xs font-semibold text-primary hover:underline focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-7'}`;

/** One of the four questions (Onde? O quê? Até quando? Quanto?): a plain title, one line of help, then the controls. */
function FilterQuestion({ title, help, termId, children }: { title: string; help: ReactNode; termId?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="py-4" data-testid="filter-question">
      <div className="flex items-center gap-1">
        <h3 id={titleId} className="type-ui font-semibold text-foreground">
          {title}
        </h3>
        {termId && <GlossaryTerm termId={termId} variant="icon" className="-my-1" />}
      </div>
      <p className="mt-0.5 mb-2.5 type-meta text-muted-foreground">{help}</p>
      {children}
    </section>
  );
}

/** A filter inside "Mais filtros": smaller title, same help line. */
function SubGroup({ title, help, termId, children }: { title: string; help?: string; termId?: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="pt-4">
      <div className="flex items-center gap-1">
        <h4 id={titleId} className="type-meta font-semibold text-foreground">
          {title}
        </h4>
        {termId && <GlossaryTerm termId={termId} variant="icon" className="-my-1" />}
      </div>
      {help && <p className="mt-0.5 mb-1.5 type-meta text-muted-foreground">{help}</p>}
      {children}
    </section>
  );
}

/** A one-tap shortcut ("Até 7 dias", "Até R$ 50 mil"). Pressing the active one clears it. */
function PresetButton({
  active,
  onClick,
  children,
  density,
  testId,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  density: FacetDensity;
  testId: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className={`rounded-pill border px-3 type-meta font-semibold transition-colors duration-fast ease-standard focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-8'} ${active ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground' : 'border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-sunken'}`}
    >
      {children}
    </button>
  );
}

function OptionList({
  config,
  buckets,
  selected,
  onChange,
  density,
  countsKnown,
  forceSearch = false,
}: {
  config: FacetGroupConfig;
  buckets: FacetBucket[];
  selected: string[];
  onChange: (values: string[]) => void;
  density: FacetDensity;
  /** False when facets could not be loaded (error state): counts are unknown, not zero. */
  countsKnown: boolean;
  /** Show the search box even for a short list (the person asked to look up a municipality). */
  forceSearch?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const groupId = useId();

  // Keep selected values visible even when the current result set has no hits for them.
  // Enum groups render the app's PT-BR labels, not the API's bucket labels (see labelFor).
  const options = useMemo(() => {
    const enumLabels = config.param === 'status' || config.param === 'modality';
    const known = buckets.map((b) => ({ ...b, label: optionLabelFor(config.param, b.value, enumLabels ? labelFor(config.param, b.value) : b.label) }));
    const missing = selected
      .filter((value) => !buckets.some((b) => b.value === value))
      .map((value) => ({ value, label: optionLabelFor(config.param, value, labelFor(config.param, value)), count: 0 }));
    return [...known, ...missing];
  }, [buckets, selected, config.param]);

  const searchable = Boolean(config.searchPlaceholder) && (forceSearch || options.length > config.visible);
  const filtered = filter ? options.filter((option) => fold(option.label).includes(fold(filter)) || fold(option.value).includes(fold(filter))) : options;
  const shown =
    expanded || filter ? filtered : [...filtered.slice(0, config.visible), ...filtered.slice(config.visible).filter((o) => selected.includes(o.value))];
  const hiddenCount = filtered.length - shown.length;

  const toggle = (value: string, checked: boolean) => onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));
  const row = density === 'comfortable' ? 'min-h-10' : 'min-h-8';

  return (
    <div>
      {searchable && (
        <div className="relative mb-1.5">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-foreground-subtle" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={config.searchPlaceholder}
            aria-label={config.searchPlaceholder}
            // Opened on request ("busque um município"): the person is about to type.
            autoFocus={forceSearch}
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
        <ul role="group" aria-label={config.title} id={groupId} data-testid={`facet-options-${config.param}`} className="-mx-1.5 space-y-0.5">
          {shown.map((option) => {
            const checked = selected.includes(option.value);
            const id = `${groupId}-${option.value}`;
            // Modality (and status "Contratação direta" via the dispensa alias) get a glossário icon.
            const termId =
              config.param === 'modality' || config.param === 'status'
                ? entryForLabel(option.label)
                : undefined;
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
                  {countsKnown && (
                    <span className="shrink-0 type-data text-xs text-muted-foreground">
                      {formatNumber(option.count)}
                      <span className="sr-only"> {option.count === 1 ? 'edital' : 'editais'}</span>
                    </span>
                  )}
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
          data-testid={`button-facet-more-${config.param}`}
          onClick={() => setExpanded(!expanded)}
          className={`mt-1 ${linkButton(density)}`}
        >
          {expanded ? 'Ver menos' : `Ver todas (${formatNumber(filtered.length)})`}
        </button>
      )}
    </div>
  );
}

type GroupProps = { params: TenderSearchParams; facets: SearchFacets | null | undefined; density: FacetDensity; onChange: PanelProps['onChange'] };

const listProps = (param: ArrayFilterKey, { params, facets, density, onChange }: GroupProps) => {
  const config = facetGroup(param);
  return {
    config,
    density,
    countsKnown: Boolean(facets),
    buckets: facets?.[config.facet] ?? [],
    selected: selectedValues(params, param),
    onChange: (values: string[]) => onChange({ [param]: values } as unknown as Partial<TenderSearchParams>),
  };
};

/** Onde? The municipality list waits for a state (the top 30 cities of the whole country are noise), or for an explicit search. */
function PlaceQuestion(props: GroupProps) {
  const [lookUpCity, setLookUpCity] = useState(false);
  const hasState = selectedValues(props.params, 'state').length > 0;
  const hasCity = selectedValues(props.params, 'city').length > 0;
  const showCity = hasState || hasCity || lookUpCity;
  return (
    <FilterQuestion title="Onde?" help="Estado e município do órgão que está comprando.">
      <OptionList {...listProps('state', props)} />
      {showCity ? (
        <div className="mt-3" data-testid="facet-city">
          <p className="mb-1 type-meta font-semibold text-foreground">Município</p>
          <OptionList {...listProps('city', props)} forceSearch={lookUpCity && !hasState} />
        </div>
      ) : (
        <p className="mt-1.5 type-meta text-muted-foreground">
          Escolha um estado para ver os municípios, ou{' '}
          <button
            type="button"
            data-testid="button-look-up-city"
            onClick={() => setLookUpCity(true)}
            className="rounded-sm font-semibold text-primary hover:underline focus-visible:focus-ring"
          >
            busque um município
          </button>
          .
        </p>
      )}
    </FilterQuestion>
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

/** "Escolher datas" / "Outro valor": the free fields stay folded until asked for, and always open while they hold a custom range. */
function Disclosure({
  label,
  open,
  onToggle,
  density,
  testId,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  density: FacetDensity;
  testId: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="mt-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        data-testid={testId}
        onClick={onToggle}
        className={`-mx-1.5 inline-flex items-center gap-1 ${linkButton(density)}`}
      >
        {label}
        <ChevronDown size={13} aria-hidden className={`transition-transform duration-fast ease-standard ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={id} hidden={!open} className="pt-1.5">
        {children}
      </div>
    </div>
  );
}

function DeadlineQuestion({ params, onChange, density }: Pick<GroupProps, 'params' | 'onChange' | 'density'>) {
  const preset = activeDeadlinePreset(params);
  const custom = Boolean((params.deadlineFrom || params.deadlineTo) && !preset);
  const [datesOpen, setDatesOpen] = useState(false);
  const open = datesOpen || custom;
  const invalid = Boolean(params.deadlineFrom && params.deadlineTo && params.deadlineFrom > params.deadlineTo);
  const input = `${inputBase} px-2 ${density === 'comfortable' ? 'h-10' : 'h-8'}`;

  return (
    <FilterQuestion title="Até quando?" help="Último dia para enviar a proposta." termId="proposta">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Encerra em até">
        {DEADLINE_PRESET_DAYS.map((days) => (
          <PresetButton
            key={days}
            active={preset === days}
            density={density}
            testId={`button-deadline-${days}`}
            label={`Encerra em até ${days} dias`}
            onClick={() => onChange(preset === days ? { deadlineFrom: undefined, deadlineTo: undefined } : deadlinePresetPatch(days))}
          >
            Até {days} dias
          </PresetButton>
        ))}
      </div>
      <Disclosure label="Escolher datas" open={open} onToggle={() => setDatesOpen(!open)} density={density} testId="button-deadline-dates">
        <div className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block type-meta text-muted-foreground">De</span>
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
            <span className="mb-1 block type-meta text-muted-foreground">Até</span>
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
      </Disclosure>
    </FilterQuestion>
  );
}

function ValueQuestion({ params, facets, onChange, density }: GroupProps) {
  const [min, setMin] = useState(formatBRLInput(params.valueMin));
  const [max, setMax] = useState(formatBRLInput(params.valueMax));
  const errorId = useId();
  useEffect(() => setMin(formatBRLInput(params.valueMin)), [params.valueMin]);
  useEffect(() => setMax(formatBRLInput(params.valueMax)), [params.valueMax]);

  const preset = activeValuePreset(params);
  const custom = (params.valueMin !== undefined || params.valueMax !== undefined) && !preset;
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const open = fieldsOpen || custom;

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
      <span className="mb-1 block type-meta text-muted-foreground">{label}</span>
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
    <FilterQuestion
      title="Quanto?"
      termId="valor-estimado"
      help="Quanto o órgão estima pagar. Muitos editais não informam o valor e ficam de fora quando você usa este filtro."
    >
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Faixas de valor">
        {VALUE_PRESETS.map((option) => {
          const active = preset?.id === option.id;
          return (
            <PresetButton
              key={option.id}
              active={active}
              density={density}
              testId={`button-value-${option.id}`}
              onClick={() => onChange(active ? { valueMin: undefined, valueMax: undefined } : valuePresetPatch(option))}
            >
              {valueRangeLabel(option.valueMin, option.valueMax)}
            </PresetButton>
          );
        })}
      </div>
      <Disclosure label="Outro valor" open={open} onToggle={() => setFieldsOpen(!open)} density={density} testId="button-value-custom">
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
            Nos resultados: de {formatCompactCurrency(bounds.min)} a {formatCompactCurrency(bounds.max)}.
          </p>
        ) : null}
      </Disclosure>
    </FilterQuestion>
  );
}

const MORE_GROUPS: ArrayFilterKey[] = ['status', 'modality', 'platform', 'organizationId', 'sourceId'];

/** How many choices sit inside "Mais filtros". The default status (open) is not a choice; "all statuses" is. */
export function countMoreFilters(params: TenderSearchParams) {
  const status = isDefaultStatus(params.status) ? 0 : params.status?.length || 1;
  const lists = MORE_GROUPS.filter((key) => key !== 'status').reduce((sum, key) => sum + selectedValues(params, key).length, 0);
  return status + lists + (params.newOnly ? 1 : 0);
}

function MoreFilters(props: GroupProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const newOnlyId = useId();
  const { params, facets, density, onChange } = props;
  const count = countMoreFilters(params);
  // Groups with nothing to pick are hidden; a group with a selection always stays so it can be cleared.
  const groups = MORE_GROUPS.filter((param) => facets?.[facetGroup(param).facet]?.length || selectedValues(params, param).length);
  return (
    <section className="mt-1 border-t border-border-subtle py-3" data-testid="section-more-filters">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          data-testid="button-more-filters"
          onClick={() => setOpen(!open)}
          className={`flex w-full items-center gap-2 rounded-lg text-left type-ui font-semibold text-foreground transition-colors duration-fast ease-standard hover:text-primary focus-visible:focus-ring ${density === 'comfortable' ? 'min-h-10' : 'min-h-8'}`}
        >
          <span className="flex-1">
            Mais filtros
            {count > 0 && (
              <span data-testid="badge-more-filters" className="ml-1.5 rounded-pill bg-primary px-1.5 py-0.5 type-data text-xs leading-none font-bold text-primary-foreground">
                {count}
                <span className="sr-only"> {count === 1 ? 'ativo' : 'ativos'}</span>
              </span>
            )}
          </span>
          <ChevronDown size={15} className={`transition-transform duration-fast ease-standard ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>
      {!open && <p className="type-meta text-muted-foreground">Situação, modalidade, plataforma, órgão e novidades.</p>}
      <div id={id} hidden={!open} data-testid="more-filters">
        {groups.map((param) => {
          const config = facetGroup(param);
          return (
            <SubGroup key={param} title={config.title} help={config.help} termId={config.termId}>
              <OptionList {...listProps(param, props)} />
            </SubGroup>
          );
        })}
        <SubGroup title="Novidades" help="Editais que o Pardal encontrou desde ontem.">
          <label
            htmlFor={newOnlyId}
            className={`-mx-1.5 flex ${density === 'comfortable' ? 'min-h-10' : 'min-h-8'} cursor-pointer items-center gap-2.5 rounded-lg px-1.5 type-ui text-foreground transition-colors duration-fast ease-standard hover:bg-surface-sunken`}
          >
            <Checkbox
              id={newOnlyId}
              checked={params.newOnly ?? false}
              onCheckedChange={(checked) => onChange({ newOnly: checked === true || undefined })}
              data-testid="checkbox-filter-new-only"
              className="border-input data-[state=checked]:border-primary"
            />
            <span className="min-w-0 flex-1">Só os que entraram nas últimas 24 h</span>
            {facets && <span className="shrink-0 type-data text-xs text-muted-foreground">{formatNumber(facets.newCount)}</span>}
          </label>
        </SubGroup>
      </div>
    </section>
  );
}

function PanelSkeleton() {
  return (
    <div aria-hidden className="space-y-6 py-4">
      {Array.from({ length: 4 }, (_, group) => (
        <div key={group} className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded-lg bg-muted" />
          {Array.from({ length: 3 }, (_, row) => (
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

/**
 * Filters as four plain questions (Onde? O quê? Até quando? Quanto?) plus "Mais filtros", folded by default.
 * Every control writes the same URL parameters as before. Counts are disjunctive (each group ignores its own
 * selection), so OR-ing within a group stays predictable.
 */
export function FacetPanel({ params, facets, onChange, density = 'compact', loading = false }: PanelProps) {
  if (loading && !facets) return <PanelSkeleton />;
  const props: GroupProps = { params, facets, density, onChange };
  return (
    <div data-testid="facet-panel">
      {!facets && <p className="pt-4 type-meta text-muted-foreground">Algumas opções estão indisponíveis: não foi possível carregar os resultados.</p>}
      <PlaceQuestion {...props} />
      <FilterQuestion title="O quê?" help="O tipo de produto ou serviço que o órgão quer comprar.">
        <OptionList {...listProps('category', props)} />
      </FilterQuestion>
      <DeadlineQuestion params={params} onChange={onChange} density={density} />
      <ValueQuestion {...props} />
      <MoreFilters {...props} />
    </div>
  );
}
