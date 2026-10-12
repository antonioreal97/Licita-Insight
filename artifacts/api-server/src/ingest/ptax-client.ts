import {
  requestJson,
  type InternationalFetch,
  type Wait,
} from "./international-http";

/**
 * PTAX: the official daily rate of the Banco Central do Brasil, read from its open data service (Olinda).
 * The closing bulletin ("Fechamento") of the last business day is used, at the selling rate.
 */
export const PTAX_BASE_URL =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

/** Currencies the PTAX service quotes. A value in any other currency is shown without conversion. */
export const PTAX_CURRENCIES = [
  "AUD",
  "CAD",
  "CHF",
  "DKK",
  "EUR",
  "GBP",
  "JPY",
  "NOK",
  "SEK",
  "USD",
] as const;
export type PtaxCurrency = (typeof PTAX_CURRENCIES)[number];

export type PtaxQuote = {
  currency: PtaxCurrency;
  /** Reais per unit of the currency, selling rate of the closing bulletin. */
  rate: number;
  /** Day of the quote, `YYYY-MM-DD`. */
  date: string;
};

export const isPtaxCurrency = (value: string | null): value is PtaxCurrency =>
  (PTAX_CURRENCIES as readonly string[]).includes(value ?? "");

/** The service takes `MM-DD-YYYY`. */
const ptaxDay = (date: Date): string => {
  const iso = date.toISOString().slice(0, 10);
  return `${iso.slice(5, 7)}-${iso.slice(8, 10)}-${iso.slice(0, 4)}`;
};

/** Weekends and holidays have no bulletin, so the last ten days are asked and the newest closing is kept. */
const LOOKBACK_DAYS = 10;

export const ptaxUrl = (currency: PtaxCurrency, now: Date): string => {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  return (
    `${PTAX_BASE_URL}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='${currency}'&@dataInicial='${ptaxDay(from)}'&@dataFinalCotacao='${ptaxDay(now)}'` +
    "&$format=json&$select=cotacaoVenda,dataHoraCotacao,tipoBoletim"
  );
};

/** The newest closing bulletin of an answer of `CotacaoMoedaPeriodo`; `null` when there is none. */
export const parsePtaxQuote = (
  currency: PtaxCurrency,
  payload: unknown,
): PtaxQuote | null => {
  const rows =
    payload !== null &&
    typeof payload === "object" &&
    Array.isArray((payload as { value?: unknown }).value)
      ? ((payload as { value: unknown[] }).value as Array<
          Record<string, unknown>
        >)
      : [];
  let best: PtaxQuote | null = null;
  let bestStamp = "";
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    if (row.tipoBoletim !== "Fechamento") continue;
    const rate = Number(row.cotacaoVenda);
    const stamp =
      typeof row.dataHoraCotacao === "string" ? row.dataHoraCotacao : "";
    const date = /^(\d{4}-\d{2}-\d{2})/.exec(stamp)?.[1];
    if (!date || !Number.isFinite(rate) || rate <= 0) continue;
    if (stamp > bestStamp) {
      best = { currency, rate, date };
      bestStamp = stamp;
    }
  }
  return best;
};

/** `amount` in reais at the quote, rounded to cents. */
export const convertToBrl = (amount: number, quote: PtaxQuote): number =>
  Math.round(amount * quote.rate * 100) / 100;

/**
 * One request per currency. A currency that fails or has no bulletin is left out: the value is then shown
 * in the original currency only, and the collection goes on.
 */
export const fetchPtaxQuotes = async (
  currencies: PtaxCurrency[],
  options: { fetcher: InternationalFetch; now: Date; wait?: Wait },
): Promise<{ quotes: Map<PtaxCurrency, PtaxQuote>; errors: string[] }> => {
  const quotes = new Map<PtaxCurrency, PtaxQuote>();
  const errors: string[] = [];
  for (const currency of [...new Set(currencies)]) {
    try {
      const payload = await requestJson(
        options.fetcher,
        { url: ptaxUrl(currency, options.now) },
        { wait: options.wait, now: () => options.now },
      );
      const quote = parsePtaxQuote(currency, payload);
      if (quote) quotes.set(currency, quote);
      else errors.push(`PTAX ${currency}: sem boletim de fechamento no período`);
    } catch (error) {
      errors.push(
        `PTAX ${currency}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { quotes, errors };
};
