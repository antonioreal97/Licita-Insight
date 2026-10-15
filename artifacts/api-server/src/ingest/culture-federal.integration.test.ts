import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpportunityCriteria } from "../lib/opportunity-query";

test(
  "fontes federais: grava as quatro fontes, não duplica na releitura e encerra o que saiu da lista",
  {
    skip: !process.env.PNCP_TEST_DATABASE_URL,
  },
  async () => {
    const schema = `culture_federal_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    const { culturalOpportunitiesTable, db, ingestRunsTable, pool } =
      await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await pool.query(`create schema "${schema}"`);
    for (const table of [
      "cultural_opportunities",
      "ingest_runs",
      "company_profiles",
    ]) {
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    }
    try {
      const [
        { collectCultureFederal, CultureFederalIngestInProgressError },
        { collectFederalOnce, FUNARTE_OPEN_URL, MINC_OPEN_URL },
        {
          federalFixture,
          federalFixtureSources,
          federalResponse,
          MINC_ROUANET_URL,
          recordingFetcher,
        },
        { parseOpportunityQuery },
        { searchOpportunities, findOpportunity },
        { readApplicationsSafely },
      ] = await Promise.all([
        import("./collect-culture-federal"),
        import("./federal-client"),
        import("./federal-fixtures"),
        import("../lib/opportunity-query"),
        import("../repositories/postgres-opportunity-repository"),
        import("./application-enrichment"),
      ]);

      // Where to apply is read from the same recorded pages, never from the network.
      const applicationRequests: string[] = [];
      const run = (
        at: Date,
        sources: ReturnType<typeof federalFixtureSources>,
      ) =>
        collectCultureFederal(
          at,
          (options) =>
            collectFederalOnce({
              ...options,
              delayMs: 0,
              fetcher: recordingFetcher(sources).fetcher,
            }),
          (readSources, now) => {
            const recording = recordingFetcher(sources);
            return readApplicationsSafely(readSources, now, {
              delayMs: 0,
              fetcher: async (url) => {
                applicationRequests.push(url);
                return recording.fetcher(url);
              },
            });
          },
        );
      const rows = () =>
        db
          .select({
            id: culturalOpportunitiesTable.id,
            source: culturalOpportunitiesTable.source,
            status: culturalOpportunitiesTable.status,
          })
          .from(culturalOpportunitiesTable);
      const bySource = async () => {
        const count: Record<string, number> = {};
        for (const row of await rows())
          count[row.source] = (count[row.source] ?? 0) + 1;
        return count;
      };
      const status = async (id: string) =>
        (await rows()).find((row) => row.id === id)?.status;

      const firstDay = new Date("2026-10-11T12:00:00-03:00");
      const first = await run(firstDay, federalFixtureSources());
      assert.equal(first.status, "complete");
      assert.equal(first.upserted, 12);
      assert.equal(first.closed, 0);
      assert.deepEqual(await bySource(), {
        transferegov: 6,
        minc: 2,
        salic: 1,
        funarte: 3,
      });
      assert.ok((await rows()).every((row) => row.status === "open"));

      const [finished] = await db
        .select()
        .from(ingestRunsTable)
        .where(eq(ingestRunsTable.id, first.runId));
      assert.equal(finished?.source, "culture-federal");
      assert.equal(finished?.status, "complete");
      assert.equal(finished?.error, null);
      assert.ok(finished!.pagesRead > 0);
      assert.ok(!JSON.stringify(finished?.details).includes('"drafts"'));

      // Onde se inscrever: o Salic do Rouanet nas Favelas e a Prosas da Funarte, lidos nas páginas gravadas.
      const salic = await findOpportunity(
        (await rows()).find((row) => row.source === "salic")!.id,
      );
      assert.equal(salic?.application?.platform, "salic");
      assert.equal(salic?.application?.origin, "source_page");
      const funartePlatforms = (
        await searchOpportunities(parseOpportunityQuery({ source: "funarte" }))
      ).data.map((row) => row.application?.platform ?? null);
      assert.ok(funartePlatforms.includes("prosas"));
      const transferegov = (
        await searchOpportunities(
          parseOpportunityQuery({ source: "transferegov" }),
        )
      ).data;
      assert.ok(
        transferegov.every((row) => row.application?.label === "Transferegov"),
      );
      const readOnce = applicationRequests.length;
      assert.ok(readOnce > 0);

      // A releitura do mesmo dia atualiza as mesmas linhas.
      const again = await run(firstDay, federalFixtureSources());
      assert.equal(again.upserted, 12);
      assert.equal(again.closed, 0);
      assert.equal((await rows()).length, 12);
      // Nada mudou nas páginas nem nos documentos: nenhuma chamada é lida de novo.
      assert.equal(applicationRequests.length, readOnce);

      const search = (query: Record<string, unknown>) =>
        searchOpportunities(
          parseOpportunityQuery(query) satisfies OpportunityCriteria,
        );
      const funarte = await search({ source: "funarte" });
      assert.equal(funarte.pagination.total, 3);
      assert.ok(funarte.data.every((row) => row.sourceName === "Funarte"));
      assert.ok(
        funarte.data.every((row) => row.sourceUrl?.startsWith("https://")),
      );
      const everything = await search({});
      assert.deepEqual(
        Object.fromEntries(
          everything.facets!.source.map((bucket) => [
            bucket.label,
            bucket.count,
          ]),
        ),
        {
          "Transferegov.br": 6,
          Funarte: 3,
          "Ministério da Cultura": 2,
          "Lei Rouanet (Salic)": 1,
        },
      );
      const audiovisual = await search({ area: "audiovisual" });
      assert.deepEqual(
        audiovisual.data.map((row) => row.id),
        ["transferegov-programa-2041120260009"],
      );
      assert.equal(audiovisual.data[0]!.kind, "partnership");
      assert.equal(
        (await search({ source: "transferegov", state: "PR" })).pagination
          .total,
        1,
      );
      assert.equal((await search({ kind: "partnership" })).pagination.total, 3);

      const rouanet = (await search({ source: "salic" })).data[0]!;
      const detail = await findOpportunity(rouanet.id);
      assert.equal(detail?.sourceUrl, MINC_ROUANET_URL);
      assert.equal(detail?.sourceName, "Lei Rouanet (Salic)");
      assert.equal(detail?.registrationTo, "2026-10-14T02:59:59.000Z");
      assert.ok(
        detail!.documents.every((document) =>
          document.url.startsWith("https://"),
        ),
      );

      // Dia seguinte: o MinC tirou o Rouanet nas Favelas da lista e a Funarte respondeu uma lista vazia.
      const nextDay = new Date("2026-10-12T12:00:00-03:00");
      const sources = federalFixtureSources();
      sources.set(
        MINC_OPEN_URL,
        federalResponse(
          200,
          federalFixture("minc-inscricoes-abertas.html").replace(
            /<div class="card great-cards">\s*<a[^>]*programa-rouanet-nas-favelas-2[\s\S]*?<\/div>/,
            "",
          ),
        ),
      );
      sources.set(
        FUNARTE_OPEN_URL,
        federalResponse(200, "<main><h1>Editais abertos</h1></main>"),
      );
      const second = await run(nextDay, sources);
      assert.equal(second.status, "complete");
      // Saiu da lista do MinC (Salic) e saiu do CSV por ter encerrado em 11/10.
      assert.equal(second.closed, 2);
      assert.equal(await status(rouanet.id), "closed");
      assert.equal(
        await status("transferegov-programa-3091320260004"),
        "closed",
      );
      assert.equal(await status("transferegov-programa-2041120260009"), "open");
      // Lista vazia não é listagem completa: as chamadas da Funarte continuam como estavam.
      assert.equal(
        (await rows()).filter(
          (row) => row.source === "funarte" && row.status === "open",
        ).length,
        3,
      );
      assert.equal((await rows()).length, 12);

      // Sem voltar à lista, o prazo sozinho encerra: o programa de cultura fecha em 03/11.
      const afterDeadline = new Date("2026-11-04T09:00:00-03:00");
      const failing = federalFixtureSources();
      for (const key of [...failing.keys()])
        if (!key.endsWith("robots.txt")) failing.set(key, federalResponse(503));
      const third = await run(afterDeadline, failing);
      assert.equal(third.status, "failed");
      assert.equal(third.upserted, 0);
      assert.equal(third.closed, 0);
      assert.equal(
        await status("transferegov-programa-2041120260009"),
        "closed",
      );
      assert.equal(await status("transferegov-programa-2200020260004"), "open");

      // Uma coleta em andamento impede a segunda.
      await db.insert(ingestRunsTable).values({
        id: crypto.randomUUID(),
        source: "culture-federal",
        status: "running",
        windowFrom: afterDeadline,
        windowTo: afterDeadline,
        startedAt: afterDeadline,
        heartbeatAt: afterDeadline,
      });
      await assert.rejects(
        run(afterDeadline, federalFixtureSources()),
        CultureFederalIngestInProgressError,
      );

      // A lista de fontes continua fechada no banco.
      await assert.rejects(
        pool.query(
          `insert into "${schema}".cultural_opportunities
             (id, installation_id, external_id, source, title, organization_name, status, search_text, raw_payload, fetched_at)
           values ('x-1', 'x', '1', 'portal-privado', 't', 'o', 'open', 't', '{}', now())`,
        ),
        /cultural_opportunities_source_check/,
      );
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
