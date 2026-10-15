import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const fixture = (name: string): string =>
  readFileSync(
    new URL(`./fixtures/application/${name}`, import.meta.url),
    "utf8",
  );

const CAPES_LIST =
  "https://www.gov.br/capes/pt-br/assuntos/editais-e-resultados-capes";
const APCN_PDF =
  "https://www.gov.br/capes/pt-br/centrais-de-conteudo/editais/edital_2844920.pdf/@@display-file/file";
const PDSE_PAGE =
  "https://www.gov.br/capes/pt-br/acesso-a-informacao/acoes-e-programas/bolsas/bolsas-e-auxilios-internacionais/encontre-aqui/paises/multinacional/programa-de-doutorado-sanduiche-no-exterior-pdse";
const PDSE_EDITAL =
  "https://www.gov.br/capes/pt-br/centrais-de-conteudo/editais/sei_2849220_edital_n__22_2026.pdf/@@display-file/file";
const CNPQ_PAGE =
  "https://www.gov.br/cnpq/pt-br/chamadas/todas-as-chamadas/chamadas-2026/chamada-no-30-2026/chamada-publica-cnpq-N-30-2026";
const CNPQ_PDF =
  "https://www.gov.br/cnpq/pt-br/chamadas/todas-as-chamadas/chamadas-2026/chamada-no-30-2026/chamadapublica30_2026_MAIDAI_2766773.pdf";
const BLOCKED_PAGE = "https://bloqueado.exemplo.org.br/chamada/1";

test(
  "onde se inscrever: lê página e edital uma vez, guarda a origem, não duplica e só relê o que mudou",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async () => {
    const schema = `application_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    const { culturalOpportunitiesTable, db, pool } =
      await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await pool.query(`create schema "${schema}"`);
    for (const table of [
      "cultural_opportunities",
      "company_profiles",
      "users",
      "ingest_runs",
    ])
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    try {
      const [
        { enrichOpportunityApplications },
        { federalResponse },
        { upsertFundingOpportunities },
        { findOpportunity, searchOpportunities },
        { parseOpportunityQuery },
      ] = await Promise.all([
        import("./application-enrichment"),
        import("./federal-fixtures"),
        import("./upsert-opportunities"),
        import("../repositories/postgres-opportunity-repository"),
        import("../lib/opportunity-query"),
      ]);

      const now = new Date("2026-10-14T09:00:00-03:00");
      const base = {
        kind: "funding" as const,
        organizationName: "CAPES",
        searchText: "chamada",
        rawPayload: {},
        fetchedAt: now,
        status: "open",
      };
      // The CNPq row comes the way the funding collector stores it, so a later collection can be replayed.
      const cnpqDraft = {
        id: "cnpq-30",
        installationId: "cnpq" as const,
        externalId: "30",
        kind: "funding" as const,
        source: "cnpq" as const,
        title: "Chamada CNPq/CAPES Nº 30/2026 – MAI/DAI",
        summary: null,
        organizationName: "CNPq",
        audience: null,
        amount: null,
        documents: [
          { title: "Chamada", url: CNPQ_PDF, mediaType: "application/pdf" },
        ],
        state: null,
        registrationFrom: null,
        registrationTo: null,
        status: "open" as const,
        sourceUrl: CNPQ_PAGE,
        searchText: "chamada",
        raw: { sourceUrl: CNPQ_PAGE },
      };
      await upsertFundingOpportunities([cnpqDraft], now);
      await db.insert(culturalOpportunitiesTable).values([
        {
          ...base,
          id: "capes-apcn",
          installationId: "capes",
          externalId: "apcn",
          source: "capes",
          title:
            "Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20/2026",
          sourceUrl: APCN_PDF,
          documents: [
            {
              title:
                "Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20/2026",
              url: APCN_PDF,
              mediaType: "application/pdf",
            },
          ],
        },
        {
          ...base,
          id: "capes-pdse",
          installationId: "capes",
          externalId: "pdse",
          source: "capes",
          title: "Programa de Doutorado-sanduíche no Exterior (PDSE)",
          sourceUrl: PDSE_PAGE,
        },
        {
          ...base,
          id: "capes-bloqueada",
          installationId: "capes",
          externalId: "bloqueada",
          source: "capes",
          title: "Chamada de um site que proíbe robôs",
          sourceUrl: BLOCKED_PAGE,
        },
        {
          ...base,
          id: "capes-encerrada",
          installationId: "capes",
          externalId: "encerrada",
          source: "capes",
          title: "Chamada encerrada",
          sourceUrl: "https://www.gov.br/capes/pt-br/encerrada",
          status: "closed",
        },
        {
          ...base,
          id: "mapas-ce-7688",
          installationId: "ce",
          externalId: "7688",
          source: "mapas",
          kind: "culture",
          title: "Edital de cultura",
          organizationName: "Secult CE",
          sourceUrl: "https://mapacultural.secult.ce.gov.br/oportunidade/7688/",
        },
        {
          ...base,
          id: "eu_ft-HORIZON-CL5-2027-07-D3",
          installationId: "eu_ft",
          externalId: "HORIZON-CL5-2027-07-D3",
          source: "eu_ft",
          scope: "international",
          title: "Horizon topic",
          organizationName: "Comissão Europeia",
          sourceUrl:
            "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-CL5-2027-07-D3",
        },
      ]);

      const robots = "User-agent: *\nDisallow: /ebserh/*\n";
      const responses = new Map([
        ["https://www.gov.br/robots.txt", federalResponse(200, robots)],
        [
          "https://bloqueado.exemplo.org.br/robots.txt",
          federalResponse(200, "User-agent: *\nDisallow: /\n"),
        ],
        [
          APCN_PDF,
          federalResponse(200, fixture("capes-apcn-edital-20-2026.txt")),
        ],
        [PDSE_PAGE, federalResponse(200, fixture("capes-pdse.html"))],
        [
          PDSE_EDITAL,
          federalResponse(200, fixture("capes-pdse-edital-22-2026.txt")),
        ],
        [
          CNPQ_PAGE,
          federalResponse(
            200,
            "<html><body><main><p>A chamada recebe propostas até o dia 11 de dezembro.</p></main></body></html>",
          ),
        ],
        [CNPQ_PDF, federalResponse(200, fixture("cnpq-chamada-30-2026.txt"))],
      ]);
      const requested: string[] = [];
      const fetcher = async (target: string) => {
        requested.push(target);
        return responses.get(target) ?? federalResponse(404);
      };
      const enrich = (at: Date, extra: { maxCalls?: number } = {}) =>
        enrichOpportunityApplications({
          sources: ["capes", "cnpq", "mapas", "eu_ft"],
          now: at,
          fetcher,
          delayMs: 0,
          ...extra,
        });
      const row = async (id: string) =>
        (
          await db
            .select()
            .from(culturalOpportunitiesTable)
            .where(eq(culturalOpportunitiesTable.id, id))
        )[0]!;

      // A ceiling of two calls per run leaves the third for the next run.
      const first = await enrich(now, { maxCalls: 2 });
      assert.equal(first.read + first.errors.length, 2);
      assert.equal(first.deferred, 2);
      assert.equal(first.byRule, 2);
      assert.ok(!requested.includes(CAPES_LIST), "a listagem não é relida");

      const second = await enrich(now);
      assert.equal(second.read + second.errors.length, 2);
      assert.equal(second.deferred, 0);
      const errors = [...first.errors, ...second.errors];
      assert.equal(errors.length, 1);
      assert.match(errors[0]!, /capes-bloqueada/);

      const apcn = await row("capes-apcn");
      assert.equal(
        apcn.applicationUrl,
        "https://sucupira.capes.gov.br/apcn/submissao-de-proposta",
      );
      assert.equal(apcn.applicationLabel, "Plataforma Sucupira");
      assert.equal(apcn.applicationSource, "document");
      assert.equal(
        apcn.applicationDocumentTitle,
        "Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20/2026",
      );
      assert.equal(apcn.noticeDatesSource, "document");
      assert.equal(
        apcn.noticeRegistrationFrom?.toISOString(),
        "2026-08-24T03:00:00.000Z",
      );
      assert.equal(
        apcn.noticeRegistrationTo?.toISOString(),
        "2026-12-18T21:00:00.000Z",
      );

      // PDSE: dates from the page (the amended schedule), the link from the notice the page lists.
      const pdse = await row("capes-pdse");
      assert.equal(pdse.applicationPlatform, "sicapes");
      assert.equal(pdse.applicationSource, "document");
      assert.match(pdse.applicationDocumentTitle ?? "", /Edital nº 22\/2026/);
      assert.equal(pdse.noticeDatesSource, "source_page");
      assert.equal(
        pdse.noticeRegistrationTo?.toISOString(),
        "2026-11-18T20:00:00.000Z",
      );

      const cnpq = await row("cnpq-30");
      assert.equal(cnpq.applicationPlatform, "carlos-chagas");
      assert.equal(cnpq.applicationUrl, "https://carloschagas.cnpq.br/");

      // Robots.txt forbids the page: nothing read, nothing filled, and not asked again before the recheck.
      const blocked = await row("capes-bloqueada");
      assert.equal(blocked.applicationUrl, null);
      assert.ok(blocked.applicationCheckedAt);
      assert.ok(!requested.includes(BLOCKED_PAGE));
      assert.equal((await row("capes-encerrada")).applicationCheckedAt, null);

      assert.equal(
        (await row("mapas-ce-7688")).applicationLabel,
        "Mapas Culturais",
      );
      assert.equal(
        (await row("eu_ft-HORIZON-CL5-2027-07-D3")).applicationPlatform,
        "eu-funding-tenders",
      );

      // The same day again: every call is fresh, so no request at all.
      const before = requested.length;
      const third = await enrich(new Date(now.getTime() + 60 * 60 * 1_000));
      assert.equal(third.read, 0);
      assert.equal(third.byRule, 0);
      assert.equal(requested.length, before);

      // The next collection stores the same call again: the reading survives and no row is added.
      await upsertFundingOpportunities(
        [cnpqDraft],
        new Date(now.getTime() + 2 * 60 * 60 * 1_000),
      );
      const again = await row("cnpq-30");
      assert.equal(again.applicationPlatform, "carlos-chagas");
      assert.equal(
        (await db.select().from(culturalOpportunitiesTable)).length,
        7,
      );

      // A new document at the source changes the inputs: that call is read again, and only that one.
      await upsertFundingOpportunities(
        [
          {
            ...cnpqDraft,
            documents: [
              ...cnpqDraft.documents,
              {
                title: "Retificação da Chamada",
                url: `${CNPQ_PDF}?v=2`,
                mediaType: "application/pdf",
              },
            ],
          },
        ],
        now,
      );
      const fourth = await enrich(
        new Date(now.getTime() + 3 * 60 * 60 * 1_000),
      );
      assert.equal(fourth.read, 1);
      // The amendment could not be read, so the notice dates are not trusted; the link still holds.
      const amended = await row("cnpq-30");
      assert.equal(amended.applicationPlatform, "carlos-chagas");
      assert.equal(amended.noticeRegistrationTo, null);

      // The API: link with its origin and the notice dates, only when the source has none.
      const detail = await findOpportunity("capes-apcn");
      assert.deepEqual(detail?.application, {
        url: "https://sucupira.capes.gov.br/apcn/submissao-de-proposta",
        platform: "sucupira",
        label: "Plataforma Sucupira",
        article: "a",
        origin: "document",
        documentTitle:
          "Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20/2026",
      });
      assert.deepEqual(detail?.noticeDates, {
        registrationFrom: "2026-08-24T03:00:00.000Z",
        registrationTo: "2026-12-18T21:00:00.000Z",
        origin: "document",
        documentTitle:
          "Chamada Pública para Envio de Proposta de Curso Novo - Edital nº 20/2026",
      });
      assert.equal(detail?.registrationFrom, null);
      const blockedDetail = await findOpportunity("capes-bloqueada");
      assert.equal(blockedDetail?.application, null);
      assert.ok(blockedDetail?.applicationCheckedAt);
      const listed = await searchOpportunities(
        parseOpportunityQuery({ source: "capes" }),
      );
      assert.equal(
        listed.data.find((item) => item.id === "capes-pdse")?.application
          ?.label,
        "SICAPES",
      );
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
