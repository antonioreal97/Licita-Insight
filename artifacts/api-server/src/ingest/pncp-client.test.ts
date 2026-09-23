import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  fetchCompra,
  fetchCompraArquivos,
  fetchCompraItens,
} from "./pncp-client";

describe("PNCP consultation endpoints", () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  beforeEach(() => {
    process.env.PNCP_REQUEST_DELAY_MS = "0";
    requestedUrls.length = 0;
    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      requestedUrls.push(url);
      return Response.json(
        url.endsWith("/87") ? { numeroControlePNCP: "TEST DATA" } : [],
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.PNCP_REQUEST_DELAY_MS;
  });

  it("reads purchase, items and files from the public consultation API", async () => {
    await fetchCompra("34028316000103", 2026, 87);
    await fetchCompraItens("34028316000103", 2026, 87);
    await fetchCompraArquivos("34028316000103", 2026, 87);

    assert.deepEqual(requestedUrls, [
      "https://pncp.gov.br/api/consulta/v1/orgaos/34028316000103/compras/2026/87",
      "https://pncp.gov.br/api/consulta/v1/orgaos/34028316000103/compras/2026/87/itens?pagina=1&tamanhoPagina=50",
      "https://pncp.gov.br/api/consulta/v1/orgaos/34028316000103/compras/2026/87/arquivos",
    ]);
  });
});
