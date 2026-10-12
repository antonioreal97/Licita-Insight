const PNCP_CONSULTA = "https://pncp.gov.br/api/consulta/v1";
// Items and files of a purchase are only served by the PNCP integration API;
// the consultation API answers 404 for them.
const PNCP_API = "https://pncp.gov.br/api/pncp/v1";
const ITEMS_PAGE_SIZE = 50;
const MAX_ITEM_PAGES = 200;
const DEFAULT_HTTP_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_DETAIL_HTTP_TIMEOUT_MS = 20_000;
const DEFAULT_DETAIL_MAX_ATTEMPTS = 2;

export const PNCP_UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
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

const positiveInteger = (
  name: string,
  value: string | undefined,
  fallback: number,
): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
};

export type PncpRequestPolicy = {
  timeoutMs: number;
  maxAttempts: number;
  detailApi: boolean;
};

export const pncpRequestPolicy = (
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): PncpRequestPolicy => {
  const detailApi = url.startsWith(`${PNCP_API}/`);
  return detailApi
    ? {
        detailApi,
        timeoutMs: positiveInteger(
          "PNCP_DETAIL_HTTP_TIMEOUT_MS",
          env.PNCP_DETAIL_HTTP_TIMEOUT_MS,
          DEFAULT_DETAIL_HTTP_TIMEOUT_MS,
        ),
        maxAttempts: positiveInteger(
          "PNCP_DETAIL_MAX_ATTEMPTS",
          env.PNCP_DETAIL_MAX_ATTEMPTS,
          DEFAULT_DETAIL_MAX_ATTEMPTS,
        ),
      }
    : {
        detailApi,
        timeoutMs: positiveInteger(
          "PNCP_HTTP_TIMEOUT_MS",
          env.PNCP_HTTP_TIMEOUT_MS,
          DEFAULT_HTTP_TIMEOUT_MS,
        ),
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      };
};

export const isPncpTimeout = (error: unknown): boolean => {
  if (error instanceof PncpError)
    return error.status === 504 || error.status === 408;
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError";
  }
  return false;
};

export const isPncpNetworkFailure = (error: unknown): boolean =>
  error instanceof TypeError &&
  /fetch failed|failed to fetch|network error/i.test(error.message);

/** Gateway and rate-limit failures should leave the partition open and move on. */
export const isRecoverablePncpFailure = (error: unknown): boolean => {
  if (isPncpTimeout(error) || isPncpNetworkFailure(error)) return true;
  return (
    error instanceof PncpError &&
    (error.status === 429 || (error.status >= 500 && error.status <= 599))
  );
};

const rateLimitDelayMs = (attempt: number): number => {
  const raw = Number(process.env.PNCP_RATE_LIMIT_DELAY_MS ?? 15_000);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 15_000;
  return base * attempt;
};

async function pncpGet(url: string): Promise<unknown> {
  let lastError: unknown;
  const policy = pncpRequestPolicy(url);

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    if (attempt === 1 && requestDelayMs() > 0) await sleep(requestDelayMs());

    let rateLimited = false;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "PardalDigital/0.1 (coleta de dados abertos do PNCP)",
        },
        signal: AbortSignal.timeout(policy.timeoutMs),
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
      if (
        error instanceof PncpError &&
        error.status < 500 &&
        error.status !== 429
      ) {
        throw error;
      }
      lastError = error;
      rateLimited = error instanceof PncpError && error.status === 429;
    }

    // A rate-limited PNCP still receives the established long retry treatment.
    const maxAttempts = rateLimited ? 8 : policy.maxAttempts;
    if (attempt >= maxAttempts) break;
    await sleep(
      rateLimited ? rateLimitDelayMs(attempt) : 1_000 * 2 ** (attempt - 1),
    );
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`PNCP request failed for ${url}`);
}

const asPage = (body: unknown, url: string): PncpPublicationPage => {
  const record =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
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
    data: data.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
    ),
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
    if (
      error instanceof PncpError &&
      (error.status === 204 || error.body === "")
    ) {
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

export async function fetchContractsByPublicationPage(input: {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  cnpjOrgao?: string;
  unidadeAdministrativa?: string;
  usuarioId?: string;
}): Promise<PncpPublicationPage> {
  const query = new URLSearchParams({
    dataInicial: input.from,
    dataFinal: input.to,
    pagina: String(input.page),
    tamanhoPagina: String(input.pageSize),
  });
  if (input.cnpjOrgao) query.set("cnpjOrgao", input.cnpjOrgao);
  if (input.unidadeAdministrativa) {
    query.set("codigoUnidadeAdministrativa", input.unidadeAdministrativa);
  }
  if (input.usuarioId) query.set("usuarioId", input.usuarioId);
  const url = `${PNCP_CONSULTA}/contratos?${query}`;
  try {
    return asPage(await pncpGet(url), url);
  } catch (error) {
    if (
      error instanceof PncpError &&
      (error.status === 204 || error.body === "")
    ) {
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

export async function fetchContractsByUpdatePage(input: {
  from: string;
  to: string;
  page: number;
  pageSize: number;
  cnpjOrgao?: string;
  unidadeAdministrativa?: string;
  usuarioId?: string;
}): Promise<PncpPublicationPage> {
  const query = new URLSearchParams({
    dataInicial: input.from,
    dataFinal: input.to,
    pagina: String(input.page),
    tamanhoPagina: String(input.pageSize),
  });
  if (input.cnpjOrgao) query.set("cnpjOrgao", input.cnpjOrgao);
  if (input.unidadeAdministrativa) {
    query.set("codigoUnidadeAdministrativa", input.unidadeAdministrativa);
  }
  if (input.usuarioId) query.set("usuarioId", input.usuarioId);
  const url = `${PNCP_CONSULTA}/contratos/atualizacao?${query}`;
  try {
    return asPage(await pncpGet(url), url);
  } catch (error) {
    if (
      error instanceof PncpError &&
      (error.status === 204 || error.body === "")
    ) {
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
      rows: body.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === "object",
      ),
      totalPages: 1,
    };
  }
  const record =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
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
    rows: data.filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object",
    ),
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1,
  };
};

async function fetchListBody(url: string): Promise<unknown> {
  try {
    return await pncpGet(url);
  } catch (error) {
    if (error instanceof PncpNotFoundError) return null;
    throw error;
  }
}

async function fetchList(url: string): Promise<PncpList> {
  const body = await fetchListBody(url);
  return body === null ? { rows: [], totalPages: 1 } : unwrapPncpList(body);
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
    return body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
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
  for (let page = 1; page <= MAX_ITEM_PAGES; page += 1) {
    const body = await fetchListBody(
      `${PNCP_API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=${page}&tamanhoPagina=${ITEMS_PAGE_SIZE}`,
    );
    if (body === null) break;
    const list = unwrapPncpList(body);
    rows.push(...list.rows);
    // A plain array carries no page count: a short page is the last one.
    const lastPage = Array.isArray(body)
      ? list.rows.length < ITEMS_PAGE_SIZE
      : page >= list.totalPages;
    if (lastPage) break;
  }
  return rows;
}

export async function fetchCompraArquivos(
  cnpj: string,
  ano: number,
  sequencial: number,
): Promise<Record<string, unknown>[]> {
  const list = await fetchList(
    `${PNCP_API}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`,
  );
  return list.rows;
}

export async function fetchContractsByPurchase(input: {
  cnpj: string;
  purchaseYear: number;
  purchaseSequence: number;
  page: number;
  pageSize: number;
}): Promise<PncpList> {
  return await fetchList(
    `${PNCP_API}/orgaos/${input.cnpj}/contratos/contratacao/${input.purchaseYear}/${input.purchaseSequence}?pagina=${input.page}&tamanhoPagina=${input.pageSize}`,
  );
}

export async function fetchContract(
  cnpj: string,
  year: number,
  sequencial: number,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await pncpGet(
      `${PNCP_API}/orgaos/${cnpj}/contratos/${year}/${sequencial}`,
    );
    return body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : null;
  } catch (error) {
    if (error instanceof PncpNotFoundError) return null;
    throw error;
  }
}

export async function fetchItemResults(input: {
  cnpj: string;
  purchaseYear: number;
  purchaseSequence: number;
  itemNumber: number;
}): Promise<Record<string, unknown>[]> {
  const list = await fetchList(
    `${PNCP_API}/orgaos/${input.cnpj}/compras/${input.purchaseYear}/${input.purchaseSequence}/itens/${input.itemNumber}/resultados`,
  );
  return list.rows;
}
