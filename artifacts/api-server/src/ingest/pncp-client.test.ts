import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  fetchCompra,
  fetchCompraArquivos,
  fetchCompraItens,
  fetchPublicationPage,
  isRecoverablePncpFailure,
  pncpRequestPolicy,
  PncpError,
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

  it("reads the purchase from the consultation API and items and files from the PNCP API", async () => {
    await fetchCompra("34028316000103", 2026, 87);
    await fetchCompraItens("34028316000103", 2026, 87);
    await fetchCompraArquivos("34028316000103", 2026, 87);

    assert.deepEqual(requestedUrls, [
      "https://pncp.gov.br/api/consulta/v1/orgaos/34028316000103/compras/2026/87",
      "https://pncp.gov.br/api/pncp/v1/orgaos/34028316000103/compras/2026/87/itens?pagina=1&tamanhoPagina=50",
      "https://pncp.gov.br/api/pncp/v1/orgaos/34028316000103/compras/2026/87/arquivos",
    ]);
  });

  it("uses short configurable limits only for the PNCP maintenance API", () => {
    const env = {
      PNCP_HTTP_TIMEOUT_MS: "61000",
      PNCP_DETAIL_HTTP_TIMEOUT_MS: "7000",
      PNCP_DETAIL_MAX_ATTEMPTS: "2",
    };
    assert.deepEqual(
      pncpRequestPolicy(
        "https://pncp.gov.br/api/pncp/v1/orgaos/1/compras/2026/1/itens",
        env,
      ),
      { detailApi: true, timeoutMs: 7000, maxAttempts: 2 },
    );
    assert.deepEqual(
      pncpRequestPolicy(
        "https://pncp.gov.br/api/consulta/v1/orgaos/1/compras/2026/1",
        env,
      ),
      { detailApi: false, timeoutMs: 61000, maxAttempts: 5 },
    );
  });

  it("follows item pages until the PNCP API returns a short plain array", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      requestedUrls.push(url.toString());
      const page = Number(url.searchParams.get("pagina"));
      const size = page === 1 ? 50 : 11;
      return Response.json(
        Array.from({ length: size }, (_, index) => ({
          numeroItem: (page - 1) * 50 + index + 1,
        })),
      );
    };

    const rows = await fetchCompraItens("45226214000119", 2026, 432);

    assert.equal(rows.length, 61);
    assert.equal(rows.at(-1)?.numeroItem, 61);
    assert.equal(requestedUrls.length, 2);
  });

  it("reads a full last item page as a request for one more page", async () => {
    globalThis.fetch = async (input) => {
      const url = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      requestedUrls.push(url.toString());
      const page = Number(url.searchParams.get("pagina"));
      return Response.json(
        page === 1 ? Array.from({ length: 50 }, () => ({})) : [],
      );
    };

    assert.equal(
      (await fetchCompraItens("45226214000119", 2026, 432)).length,
      50,
    );
    assert.equal(requestedUrls.length, 2);
  });

  it("treats a missing purchase list as empty", async () => {
    globalThis.fetch = async () => new Response("", { status: 404 });

    assert.deepEqual(await fetchCompraItens("34028316000103", 2026, 87), []);
    assert.deepEqual(await fetchCompraArquivos("34028316000103", 2026, 87), []);
  });

  it("retries a rate-limited publication page", async () => {
    process.env.PNCP_RATE_LIMIT_DELAY_MS = "0";
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) return new Response("limited", { status: 429 });
      return Response.json({ data: [], totalPaginas: 0, totalRegistros: 0 });
    };

    const page = await fetchPublicationPage({
      day: "20260917",
      modality: 5,
      page: 1,
      pageSize: 50,
    });

    assert.equal(calls, 2);
    assert.equal(page.totalPaginas, 0);
    delete process.env.PNCP_RATE_LIMIT_DELAY_MS;
  });

  it("treats an empty 204 publication page as no results", async () => {
    globalThis.fetch = async () => new Response(null, { status: 204 });

    const page = await fetchPublicationPage({
      day: "20260917",
      modality: 2,
      page: 1,
      pageSize: 50,
    });

    assert.deepEqual(page, {
      data: [],
      totalPaginas: 0,
      numeroPagina: 1,
      totalRegistros: 0,
    });
  });

  it("treats gateway and rate-limit errors as recoverable", () => {
    assert.equal(
      isRecoverablePncpFailure(new PncpError("down", 502, "")),
      true,
    );
    assert.equal(
      isRecoverablePncpFailure(new PncpError("down", 503, "")),
      true,
    );
    assert.equal(
      isRecoverablePncpFailure(new PncpError("down", 507, "")),
      true,
    );
    assert.equal(
      isRecoverablePncpFailure(new PncpError("limited", 429, "")),
      true,
    );
    assert.equal(
      isRecoverablePncpFailure(new PncpError("bad", 400, "")),
      false,
    );
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    assert.equal(isRecoverablePncpFailure(timeout), true);
    assert.equal(isRecoverablePncpFailure(new TypeError("fetch failed")), true);
  });
});
