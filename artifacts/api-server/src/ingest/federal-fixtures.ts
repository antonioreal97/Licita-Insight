import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { FUNARTE_OPEN_URL, MINC_OPEN_URL } from "./federal-client";
import type { FederalFetch, FederalResponse } from "./federal-http";
import { TRANSFEREGOV_PROGRAMS_ZIP_URL } from "./transferegov-parsers";

/** Recorded responses of the federal sources. See `fixtures/federal/README.md` for where each one came from. */
export const federalFixture = (name: string): string =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/federal/${name}`, import.meta.url)),
    "utf8",
  );

const FUNARTE_BASE = "https://www.gov.br/funarte/pt-br/editais";
export const FUNARTE_CALL_URL = `${FUNARTE_BASE}/2026/programa-funarte-aberta/programa-funarte-aberta-2026-2013-ocupacao-dos-espacos-culturais-da-funarte-centro-de-teatro`;
export const MINC_PONTOES_URL = `${MINC_OPEN_URL}/edital-cultura-viva-fomento-a-rede-de-pontoes-de-cultura-viva/edital-cultura-viva-fomento-a-rede-de-pontoes-de-cultura-viva`;
export const MINC_BIBLIOTECA_URL = `${MINC_OPEN_URL}/edital-biblioteca-comunitaria-e-cultura-viva1/edital-biblioteca-comunitaria-e-cultura-viva`;
export const MINC_ROUANET_URL = `${MINC_OPEN_URL}/programa-rouanet-nas-favelas-2/programa-rouanet-nas-favelas-2`;
export const PARCERIAS_PAGE_URL =
  "https://api-publica.transferegov.gestao.gov.br/parcerias/programa?situacao_programa=Disponibilizado&tamanho_da_pagina=200&pagina=1";

export const federalResponse = (
  status: number,
  body: string | Uint8Array = "",
  location: string | null = null,
): FederalResponse => ({
  status,
  location,
  contentType: null,
  body: typeof body === "string" ? strToU8(body) : body,
});

/** The sources as they answered on the recording day, redirects included. Anything else answers 404. */
export const federalFixtureSources = (): Map<string, FederalResponse> => {
  const page = (name: string) => federalResponse(200, federalFixture(name));
  const siteRobots = page("funarte-robots.txt");
  return new Map<string, FederalResponse>([
    [
      "https://api-publica.transferegov.gestao.gov.br/robots.txt",
      federalResponse(404),
    ],
    [PARCERIAS_PAGE_URL, page("transferegov-parcerias-programa.json")],
    [
      TRANSFEREGOV_PROGRAMS_ZIP_URL,
      federalResponse(
        200,
        zipSync({
          "siconv_programa.csv": strToU8(
            federalFixture("siconv_programa-amostra.csv"),
          ),
        }),
      ),
    ],
    ["https://www.gov.br/robots.txt", page("govbr-robots.txt")],
    ["https://www.gov.br/funarte/robots.txt", siteRobots],
    ["https://www.gov.br/cultura/robots.txt", siteRobots],
    [MINC_OPEN_URL, page("minc-inscricoes-abertas.html")],
    [MINC_PONTOES_URL, page("minc-cultura-viva-pontoes.html")],
    [MINC_BIBLIOTECA_URL, page("minc-biblioteca-comunitaria.html")],
    [MINC_ROUANET_URL, page("minc-rouanet-nas-favelas.html")],
    [FUNARTE_OPEN_URL, page("funarte-editais-abertos.html")],
    [
      `${FUNARTE_OPEN_URL}/programa-funarte-aberta`,
      federalResponse(
        302,
        "",
        "https://www.gov.br/funarte/pt-br/editais-1/2026/programa-funarte-aberta",
      ),
    ],
    [
      `${FUNARTE_OPEN_URL}/convocatoria-mostra-dos-estudantes-da-16a-quadrienal-de-praga-2013-pq-2027`,
      federalResponse(302, "", "https://cenografiasdoavesso.com/convocatoria/"),
    ],
    [
      `${FUNARTE_OPEN_URL}/lac-z-os-artisticos-2013-chamada-especial-cplp`,
      federalResponse(
        302,
        "",
        "https://oei.int/pt/escritorios/portugal/programa/laczos-artisticos-chamada-especial-cplp/",
      ),
    ],
    [
      `${FUNARTE_OPEN_URL}/2a-edicao-edital-de-selecao-cultura-viva-fomento-a-rede-de-pontoes-cultura-viva`,
      federalResponse(
        302,
        "",
        "https://mapa.cultura.gov.br/oportunidade/11685/#info",
      ),
    ],
    [`${FUNARTE_BASE}/2026`, page("funarte-editais-2026.html")],
    [
      `${FUNARTE_BASE}/2026/programa-funarte-aberta`,
      page("funarte-programa.html"),
    ],
    [FUNARTE_CALL_URL, page("funarte-chamada.html")],
  ]);
};

export const recordingFetcher = (sources: Map<string, FederalResponse>) => {
  const requested: string[] = [];
  const fetcher: FederalFetch = async (url) => {
    requested.push(url);
    return sources.get(url) ?? federalResponse(404);
  };
  return { requested, fetcher };
};
