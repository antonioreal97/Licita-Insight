import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "BID: grava os avisos sem duplicar, encerra o que saiu, não encerra nada quando a fonte falha e aparece na busca",
  {
    skip: !process.env.PNCP_TEST_DATABASE_URL,
  },
  async () => {
    const schema = `idb_test_${crypto.randomUUID().replaceAll("-", "")}`;
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
      "ingest_runs",
      "company_profiles",
      "users",
    ]) {
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    }
    try {
      const [
        { collectInternational },
        { collectInternationalOnce },
        {
          fixtureFetcher,
          FIXTURE_NOW,
          internationalFixture,
          internationalResponse,
        },
        { parseOpportunityQuery },
        { searchOpportunities, findOpportunity },
      ] = await Promise.all([
        import("./collect-international"),
        import("./international-client"),
        import("./international-fixtures"),
        import("../lib/opportunity-query"),
        import("../repositories/postgres-opportunity-repository"),
      ]);
      type Overrides = Parameters<typeof fixtureFetcher>[0];

      const run = (at: Date, overrides: Overrides = []) => {
        const { fetcher } = fixtureFetcher(overrides);
        return collectInternational(at, {
          collect: (options) =>
            collectInternationalOnce({
              ...options,
              delayMs: 0,
              fetcher,
              wait: async () => undefined,
              sources: ["idb"],
            }),
          ptaxFetcher: fetcher,
          translator: null,
          readApplications: async () => ({ error: "não lida neste teste" }),
        });
      };
      const row = async (id: string) => {
        const [found] = await db
          .select()
          .from(culturalOpportunitiesTable)
          .where(eq(culturalOpportunitiesTable.id, id));
        return found!;
      };
      const total = async () =>
        (await db.select().from(culturalOpportunitiesTable)).length;

      const first = await run(FIXTURE_NOW);
      assert.equal(first.status, "complete");
      assert.equal(first.upserted, 11);
      assert.deepEqual(first.counts.idb!.brazilEligibility, {
        yes: 9,
        unknown: 2,
      });
      assert.equal(first.counts.idb!.projectsInBrazil, 3);
      // Sem valor no dataset: nenhuma cotação PTAX é pedida.
      assert.deepEqual(first.ptax, { quotes: [], errors: [] });

      const terminal = await row("idb-39272");
      assert.equal(terminal.scope, "international");
      assert.equal(terminal.kind, "procurement");
      assert.equal(terminal.source, "idb");
      assert.equal(terminal.agency, "BID");
      assert.equal(terminal.brazilEligibility, "yes");
      assert.equal(terminal.brazilEligibilityRule, "idb-member-country");
      assert.equal(terminal.deadlineTimeZone, "America/El_Salvador");
      assert.equal(
        terminal.registrationTo!.toISOString(),
        "2026-11-21T05:59:59.000Z",
      );
      assert.match(terminal.sourceUrl!, /^https:\/\/idbdocs\.iadb\.org\//);

      // Segunda leitura do mesmo dia: atualiza, não duplica.
      const later = new Date(FIXTURE_NOW.getTime() + 3_600_000);
      const second = await run(later);
      assert.equal(second.upserted, 11);
      assert.equal(second.closed, 0);
      assert.equal(await total(), 11);

      // Um aviso que sai da listagem completa é encerrado.
      const notices = JSON.parse(internationalFixture("idb-notices.json")) as {
        result: { records: Array<{ noticeid: string }> };
      };
      const withoutPeru = JSON.stringify({
        ...notices,
        result: {
          ...notices.result,
          records: notices.result.records.filter(
            (record) => record.noticeid !== "39196",
          ),
        },
      });
      const third = await run(new Date(later.getTime() + 3_600_000), [
        [
          "https://data.iadb.org/api/3/action/datastore_search",
          () => internationalResponse(200, withoutPeru),
        ],
      ]);
      assert.equal(third.closed, 1);
      assert.equal((await row("idb-39196")).status, "closed");

      // Fonte fora do ar: a execução registra a falha e nada é encerrado.
      const fourth = await run(new Date(later.getTime() + 7_200_000), [
        [
          "https://data.iadb.org/api/3/action/",
          () => internationalResponse(500, "Internal Server Error"),
        ],
      ]);
      assert.equal(fourth.status, "failed");
      assert.equal(fourth.closed, 0);
      assert.equal(fourth.sources[0]!.outcome, "failed");
      assert.equal((await row("idb-39272")).status, "open");

      const search = (query: Record<string, unknown>) =>
        searchOpportunities(parseOpportunityQuery(query));
      const fromIdb = await search({
        scope: "international",
        source: "idb",
        pageSize: "100",
      });
      assert.equal(fromIdb.pagination.total, 11);
      assert.ok(fromIdb.data.every((item) => item.sourceName === "BID"));
      assert.deepEqual(
        fromIdb.facets!.agency.map((bucket) => [bucket.value, bucket.count]),
        [["BID", 11]],
      );
      const detail = (await findOpportunity("idb-39272"))!;
      assert.equal(detail.source, "idb");
      assert.equal(detail.sourceName, "BID");
      assert.equal(detail.international!.agency, "BID");
      assert.equal(
        detail.international!.brazilEligibility!.label,
        "Aberto a brasileiros",
      );
      assert.ok(
        detail.international!.details.some(
          (item) =>
            item.label === "Método" &&
            item.value === "International Competitive Bidding",
        ),
      );
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
