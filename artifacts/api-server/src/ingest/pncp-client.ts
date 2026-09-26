import { timeoutSignal } from "../lib/http-timeout";

const PNCP_CONSULTA = "https://pncp.gov.br/api/consulta/v1";

export const PNCP_UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export class PncpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "PncpError";
  }
}

export class PncpNotFoundError extends PncpError {
  constructor(url: string) {
    super(`PNCP resource was not found: ${url}`, 404, "");
    this.name = "PncpNotFoundError";
  }
}

export type PncpPublicationPage = {
  data: Record<string, unknown>[];
  totalPaginas: number;
  numeroPagina: number;
  totalRegistros: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestDelayMs = (): number => {
  const raw = Number(process.env.PNCP_REQUEST_DELAY_MS ?? 150);
  return Number.isFinite(raw) && raw >= 0 ? raw : 150;
};

export const isPncpTimeout = (error: unknown): boolean => {
  if (error instanceof PncpError) return error.status === 504 || error.status === 408;
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  return false;
};

/** Gateway and rate-limit failures should leave the partition open and move on. */
export const isRecoverablePncpFailure = (error: unknown): boolean => {
  if (isPncpTimeout(error)) return true;
  return (
    error instanceof PncpError &&
    (error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503)
  );
};

const rateLimitDelayMs = (attempt: number): number => {
  const raw = Number(process.env.PNCP_RATE_LIMIT_DELAY_MS ?? 15_000);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 15_000;
  return base * attempt;
};

async function pncpGet(url: string): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    if (attempt === 1 && requestDelayMs() > 0) await sleep(requestDelayMs());

    let rateLimited = false;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "LicitaInsight/0.1 (coleta de dados abertos do PNCP)",
        },
        signal: timeoutSignal("PNCP_HTTP_TIMEOUT_MS", 60_000),
      });
      const body = await response.text();

      if (response.status === 404) throw new PncpNotFoundError(url);

      if (response.ok) {
        try {
          return JSON.parse(body) as unknown;
        } catch (error) {
          throw new PncpError(
            `PNCP returned invalid JSON for ${url}: ${error instanceof Error ? error.message : String(error)}`,
            response.status,
            body.slice(0, 500),
          );
        }
      }

      const error = new PncpError(
        `PNCP responded ${response.status} for ${url}: ${body.slice(0, 300)}`,
        response.status,
        body.slice(0, 500),
      );
      if (response.status !== 429 && response.status < 500) throw error;
      rateLimited = response.status === 429;
      lastError = error;
    } catch (error) {
      if (error instanceof PncpError && error.status < 500 && error.status !== 429) {
        throw error;
      }
      lastError = error;
      rateLimited = error instanceof PncpError && error.status === 429;
    }

    const maxAttempts = rateLimited ? 8 : 5;
    if (attempt >= maxAttempts) break;
    await sleep(rateLimited ? rateLimitDelayMs(attempt) : 1_000 * 2 ** (attempt - 1));
  }

  throw lastError instanceof Error ? lastError : new Error(`PNCP request failed for ${url}`);
}

const asPage = (body: unknown, url: string): PncpPublicationPage => {
  const record = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const data = record?.data;
  const totalPaginas = Number(record?.totalPaginas);
  if (!record || !Array.isArray(data) || !Number.isFinite(totalPaginas)) {
    throw new PncpError(
      `PNCP publication page has an unexpected shape for ${url}`,
      200,
      JSON.stringify(body).slice(0, 500),
    );
  }

  return {
    data: data.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object"),
    totalPaginas,
    numeroPagina: Number(record.numeroPagina ?? 0),
    totalRegistros: Number(record.totalRegistros ?? data.length),
  };
};

export async function fetchPublicationPage(input: {
  day: string;
  modality: number;
  page: number;
  pageSize: number;
  uf?: string;
}): Promise<PncpPublicationPage> {
  const query = new URLSearchParams({
    dataInicial: input.day,
    dataFinal: input.day,
    codigoModalidadeContratacao: String(input.modality),
    pagina: String(input.page),
    tamanhoPagina: String(input.pageSize),
  });
  if (input.uf) query.set("uf", input.uf);
  const url = `${PNCP_CONSULTA}/contratacoes/publicacao?${query}`;
  try {
    return asPage(await pncpGet(url), url);
  } catch (error) {
    // PNCP answers 204 with an empty body when the day/modality has no publications.
    if (error instanceof PncpError && (error.status === 204 || error.body === "")) {
      return {
        data: [],
        totalPaginas: 0,
        numeroPagina: input.page,
        totalRegistros: 0,
      };
    }
    throw error;
  }
}

export type PncpList = {
  rows: Record<string, unknown>[];
  totalPages: number;
};

export const unwrapPncpList = (body: unknown): PncpList => {
  if (Array.isArray(body)) {
    return {
      rows: body.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object"),
      totalPages: 1,
    };
  }
  const record = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const data = record?.data ?? record?.content;
  if (!Array.isArray(data)) {
    throw new PncpError(
      "PNCP list response has an unexpected shape",
      200,
      JSON.stringify(body).slice(0, 500),
    );
  }
  const totalPages = Number(record?.totalPaginas ?? 1);
  return {
    rows: data.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object"),
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  };
};

async function fetchList(url: string): Promise<PncpList> {
  try {
    return unwrapPncpList(await pncpGet(url));
  } catch (error) {
    if (error instanceof PncpNotFoundError) return { rows: [], totalPages: 1 };
    throw error;
  }
}

export async function fetchCompra(
  cnpj: string,
  ano: number,
  sequencial: number,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await pncpGet(
      `${PNCP_CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}`,
    );
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch (error) {
    if (error instanceof PncpNotFoundError) return null;
    throw error;
  }
}

export async function fetchCompraItens(
  cnpj: string,
  ano: number,
  sequencial: number,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const list = await fetchList(
      `${PNCP_CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=${page}&tamanhoPagina=50`,
    );
    rows.push(...list.rows);
    totalPages = list.totalPages;
    page += 1;
  }
  return rows;
}

export async function fetchCompraArquivos(
  cnpj: string,
  ano: number,
  sequencial: number,
): Promise<Record<string, unknown>[]> {
  const list = await fetchList(
    `${PNCP_CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`,
  );
  return list.rows;
}
