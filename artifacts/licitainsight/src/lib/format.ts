const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const currencyPrecise = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** `null` means the source did not disclose the value (e.g. orçamento sigiloso). */
export const formatCurrency = (value: number | null, fallback = 'Não informado') => (value === null ? fallback : currency.format(value));

export const formatCurrencyPrecise = (value: number | null, fallback = '—') => (value === null ? fallback : currencyPrecise.format(value));

/** Accepts `YYYY-MM-DD` or full ISO; date-only strings are read as local noon to avoid TZ day shifts. */
export const formatDate = (value: string | null, fallback = '—') => {
  if (!value) return fallback;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00-03:00` : value);
  return Number.isNaN(date.getTime()) ? fallback : shortDate.format(date).replace('.', '');
};

export const formatBytes = (bytes: number | null) => {
  if (bytes === null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

export const formatNumber = (value: number) => new Intl.NumberFormat('pt-BR').format(value);

const TZ = 'America/Sao_Paulo';
const dateTime = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ });
const numericDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ });
const timeOnly = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const compactCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Parses `YYYY-MM-DD` (as local noon in São Paulo) or full ISO. Returns `null` when missing/invalid. */
export const parseApiDate = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(isDateOnly(value) ? `${value}T12:00:00-03:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "05 de out de 2026, 18:00". Date-only strings fall back to `formatDate` (no fake time). */
export const formatDateTime = (value: string | null, fallback = '—') => {
  if (value && isDateOnly(value)) return formatDate(value, fallback);
  const date = parseApiDate(value);
  return date ? dateTime.format(date).replace('.', '') : fallback;
};

/** "05/10/2026" — fixed width, meant for dense tables with `tabular-nums`. */
export const formatDateNumeric = (value: string | null, fallback = '—') => {
  const date = parseApiDate(value);
  return date ? numericDate.format(date) : fallback;
};

/** "18:00" in São Paulo time; `null` for date-only or missing values. */
export const formatTime = (value: string | null) => {
  if (!value || isDateOnly(value)) return null;
  const date = parseApiDate(value);
  return date ? timeOnly.format(date) : null;
};

/** "R$ 12,9 mi". */
export const formatCurrencyCompact = (value: number | null, fallback = 'Não informado') => (value === null ? fallback : compactCurrency.format(value));

const longDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });

/** "terça-feira, 22 de set. de 2026" in São Paulo time — dashboard eyebrow. Defaults to today. */
export const formatLongDate = (date: Date = new Date()) => longDate.format(date);
