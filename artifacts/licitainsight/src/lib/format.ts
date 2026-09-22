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
