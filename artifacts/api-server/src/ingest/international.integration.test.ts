import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "internacionais: grava as duas fontes, não duplica, encerra o que saiu e só entra no perfil de quem optou",
  {
    skip: !process.env.PNCP_TEST_DATABASE_URL,
  },
  async () => {
    const schema = `international_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    const {
      companyProfilesTable,
      culturalOpportunitiesTable,
      db,
      ingestRunsTable,
      pool,
      usersTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await pool.query(`create schema "${schema}"`);
    for (const table of [
      "cultural_opportunities",
      "ingest_runs",
      "company_profiles",
      "users",
      "workspace_cutover_events",
    ]) {
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    }
    try {
      const [
        { collectInternational, InternationalIngestInProgressError },
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
      type Translator = NonNullable<
        NonNullable<Parameters<typeof collectInternational>[1]>["translator"]
      >;

      const run = (
        at: Date,
        overrides: Overrides = [],
        translator: Translator | null = null,
      ) => {
        const { fetcher } = fixtureFetcher(overrides);
        return collectInternational(at, {
          collect: (options) =>
            collectInternationalOnce({ ...options, delayMs: 0, fetcher }),
          ptaxFetcher: fetcher,
          translator,
        });
      };
      const row = async (id: string) => {
        const [found] = await db
          .select()
          .from(culturalOpportunitiesTable)
          .where(eq(culturalOpportunitiesTable.id, id));
        return found!;
      };
      const search = (query: Record<string, unknown>, userId?: string) =>
        searchOpportunities(parseOpportunityQuery(query), userId);

      // Uma chamada nacional já existente não pode ser tocada nem aparecer na aba internacional.
      await db.insert(culturalOpportunitiesTable).values({
        id: "mapas-sp-1",
        installationId: "sp",
        externalId: "1",
        title: "Edital de circulação de espetáculos",
        organizationName: "Secretaria de Cultura",
        status: "open",
        searchText: "edital de circulacao de espetaculos secretaria de cultura",
        rawPayload: {},
        fetchedAt: FIXTURE_NOW,
      });

      const first = await run(FIXTURE_NOW);
      assert.equal(first.status, "complete");
      assert.equal(first.upserted, 22);
      assert.equal(first.closed, 0);
      assert.equal(first.translation, null);
      assert.deepEqual(first.counts.worldbank!.brazilEligibility, {
        yes: 2,
        no: 4,
        conditional: 5,
      });
      assert.equal(first.counts.worldbank!.projectsInBrazil, 2);
      assert.deepEqual(first.counts.eu_ft!.brazilFunding, {
        no: 5,
        conditional: 1,
        yes: 1,
        unknown: 4,
      });
      assert.deepEqual(first.ptax.quotes, [
        { currency: "EUR", rate: 5.5844, date: "2026-10-09" },
      ]);

      const national = await row("mapas-sp-1");
      assert.equal(national.scope, "national");
      assert.equal(national.brazilEligibility, null);

      const uganda = await row("worldbank-OP00474363");
      assert.equal(uganda.scope, "international");
      assert.equal(uganda.kind, "procurement");
      assert.equal(uganda.source, "worldbank");
      assert.equal(uganda.installationId, "worldbank");
      assert.equal(uganda.title, uganda.titleOriginal);
      assert.equal(uganda.titlePt, null);
      assert.equal(uganda.brazilEligibility, "conditional");
      assert.equal(uganda.brazilEligibilityRule, "wb-default");
      assert.equal(uganda.brazilFunding, null);
      assert.equal(uganda.deadlineTimeZone, "Africa/Kampala");
      assert.equal(uganda.registrationTo!.toISOString(), "2026-10-27T08:00:00.000Z");
      assert.equal(uganda.amount, null);
      assert.doesNotMatch(JSON.stringify(uganda.rawPayload), /notice_text|contact_/);

      // Valor em euros convertido pela PTAX do dia, com a data da cotação; `amount` (reais da fonte) fica vazio.
      const prospect = await row("eu_ft-prospect-187670");
      assert.equal(prospect.amountOriginal, "3430000.00");
      assert.equal(prospect.currency, "EUR");
      assert.equal(prospect.amountBrlApprox, "19154492.00");
      assert.equal(prospect.fxRate, "5.584400");
      assert.equal(prospect.fxDate, "2026-10-09");
      assert.equal(prospect.amount, null);
      assert.equal(prospect.documents.length, 3);

      const [stored] = await db
        .select()
        .from(ingestRunsTable)
        .where(eq(ingestRunsTable.id, first.runId));
      assert.equal(stored!.source, "international");
      assert.equal(stored!.status, "complete");
      assert.equal(stored!.pagesRead, 5);
      assert.equal(stored!.error, null);

      // Só uma coleta por vez.
      await db.insert(ingestRunsTable).values({
        id: crypto.randomUUID(),
        source: "international",
        status: "running",
        windowFrom: FIXTURE_NOW,
        windowTo: FIXTURE_NOW,
        startedAt: FIXTURE_NOW,
        heartbeatAt: FIXTURE_NOW,
      });
      await assert.rejects(
        run(new Date(FIXTURE_NOW.getTime() + 60_000)),
        InternationalIngestInProgressError,
      );
      await db
        .update(ingestRunsTable)
        .set({ status: "failed" })
        .where(eq(ingestRunsTable.status, "running"));

      // Tradução local: grava o título em português, guarda o original e não repete o que o modelo recusou.
      const asked: string[] = [];
      const translator: Translator = {
        name: "fake-local",
        translate: async (text, language) => {
          asked.push(`${language}:${text.slice(0, 24)}`);
          if (text.startsWith("Non-consultancy services"))
            return "Serviços de campanha nacional de conscientização";
          if (text.startsWith("Homestead Garden")) return null;
          if (text.startsWith("Works of rehabilitation"))
            throw new Error("modelo ocupado");
          return `Título traduzido: ${text.slice(0, 40)}`;
        },
      };
      const later = new Date(FIXTURE_NOW.getTime() + 3_600_000);
      const second = await run(later, [], translator);
      assert.equal(second.upserted, 22);
      assert.equal(second.closed, 0);
      assert.equal(second.translation!.translator, "fake-local");
      assert.equal(second.translation!.rejected, 1);
      // Falha de um título não interrompe os demais nem a coleta.
      assert.equal(second.translation!.failed, 1);
      assert.equal(second.translation!.stopped, null);
      assert.equal(
        second.translation!.translated,
        second.translation!.attempted - 2,
      );
      assert.equal((await row("worldbank-OP00464713")).titlePt, null);
      // Português e espanhol não são enviados ao tradutor.
      assert.ok(asked.every((item) => item.startsWith("en:") || item.startsWith("fr:")));
      const translated = await row("worldbank-OP00474363");
      assert.equal(translated.titlePt, "Serviços de campanha nacional de conscientização");
      assert.equal(translated.title, translated.titlePt);
      assert.equal(translated.translationSource, "model");
      assert.match(translated.titleOriginal!, /^Non-consultancy services/);
      assert.match(translated.searchText, /conscientizacao/);
      assert.equal(
        (
          (await row("worldbank-OP00474383")).rawPayload as {
            translationAttempts?: number;
          }
        ).translationAttempts,
        1,
      );
      const total = async () =>
        (await db.select().from(culturalOpportunitiesTable)).length;
      assert.equal(await total(), 23);

      // Releitura sem tradutor e sem PTAX: a tradução e a última conversão ficam; uma chamada some da lista.
      const notices = JSON.parse(
        internationalFixture("worldbank-procnotices.json"),
      ) as { procnotices: Array<{ id: string }> };
      const withoutNigeria = JSON.stringify({
        ...notices,
        procnotices: notices.procnotices.filter(
          (notice) => notice.id !== "OP00474383",
        ),
      });
      const third = await run(new Date(later.getTime() + 3_600_000), [
        [
          "https://search.worldbank.org/api/v2/procnotices",
          () => internationalResponse(200, withoutNigeria),
        ],
        [
          "https://olinda.bcb.gov.br/",
          () => internationalResponse(502, "<html>Bad Gateway</html>"),
        ],
      ]);
      assert.equal(third.status, "complete");
      assert.equal(third.closed, 1);
      assert.equal(third.ptax.quotes.length, 0);
      assert.match(third.ptax.errors[0]!, /^PTAX EUR:/);
      assert.equal((await row("worldbank-OP00474383")).status, "closed");
      const kept = await row("worldbank-OP00474363");
      assert.equal(kept.titlePt, "Serviços de campanha nacional de conscientização");
      assert.equal(kept.title, kept.titlePt);
      assert.match(kept.searchText, /conscientizacao/);
      assert.equal((await row("eu_ft-prospect-187670")).amountBrlApprox, "19154492.00");
      assert.equal(await total(), 23);

      // Fonte que falha não encerra nada: sem listagem completa não dá para dizer que a chamada saiu.
      const fourth = await run(new Date(later.getTime() + 7_200_000), [
        [
          "https://api.tech.ec.europa.eu/search-api/prod/rest/search",
          () => internationalResponse(500, "boom"),
        ],
      ]);
      assert.equal(fourth.status, "complete");
      assert.equal(fourth.closed, 0);
      assert.equal(
        fourth.sources.find((source) => source.source === "eu_ft")!.outcome,
        "failed",
      );
      assert.equal((await row("eu_ft-ERC-2027-COG")).status, "open");
      // A chamada que voltou à lista do Banco Mundial reabre.
      assert.equal((await row("worldbank-OP00474383")).status, "open");

      // Busca: o padrão continua só nacional; a aba internacional traz filtros e facetas próprios.
      const defaults = await search({});
      assert.equal(defaults.meta.scope, "national");
      assert.deepEqual(
        defaults.data.map((item) => item.id),
        ["mapas-sp-1"],
      );
      assert.equal(defaults.data[0]!.international, null);
      assert.deepEqual(defaults.facets!.eligibility, []);

      const international = await search({ scope: "international", pageSize: "100" });
      assert.equal(international.pagination.total, 22);
      assert.ok(international.data.every((item) => item.scope === "international"));
      assert.deepEqual(international.meta.gaps, []);
      assert.deepEqual(
        Object.fromEntries(
          international.facets!.eligibility.map((bucket) => [bucket.value, bucket.count]),
        ),
        { conditional: 8, no: 6, yes: 3, unknown: 5 },
      );
      assert.deepEqual(
        international.facets!.agency.map((bucket) => [bucket.value, bucket.count]),
        [
          ["Banco Mundial", 11],
          ["União Europeia", 11],
        ],
      );
      assert.ok(
        international.facets!.region.some(
          (bucket) => bucket.value === "africa" && bucket.label === "África",
        ),
      );
      assert.ok(
        international.facets!.language.some(
          (bucket) => bucket.value === "fr" && bucket.label === "Francês",
        ),
      );
      assert.ok(
        international.facets!.opportunityType.some((bucket) => bucket.value === "Obras"),
      );
      assert.ok(
        international.facets!.kind.some(
          (bucket) => bucket.value === "procurement" && bucket.label === "Licitação internacional",
        ),
      );
      // A fonte que falhou na última coleta aparece como aviso.
      assert.deepEqual(
        international.meta.installationIssues.map((issue) => issue.installationId),
        ["eu_ft"],
      );

      const open = await search({ scope: "international", eligibility: "yes" });
      assert.deepEqual(
        open.data.map((item) => item.id).sort(),
        ["eu_ft-ERC-2027-COG", "worldbank-OP00459819", "worldbank-OP00464713"],
      );
      const fundedByEu = await search({ scope: "international", funding: "yes" });
      assert.deepEqual(
        fundedByEu.data.map((item) => item.id),
        ["eu_ft-ERC-2027-COG"],
      );
      const inBrazil = await search({ scope: "international", country: "br" });
      assert.equal(inBrazil.pagination.total, 2);
      assert.ok(inBrazil.data.every((item) => item.international!.brazilProject));
      const ids = async (query: Record<string, unknown>) =>
        (await search({ scope: "international", ...query })).data
          .map((item) => item.id)
          .sort();
      assert.deepEqual(await ids({ language: "fr", region: "africa" }), [
        "worldbank-OP00469128",
        "worldbank-OP00473732",
      ]);
      assert.deepEqual(
        await ids({ agency: "Banco Mundial", opportunityType: "Consultoria" }),
        [
          "worldbank-OP00471978",
          "worldbank-OP00473732",
          "worldbank-OP00474359",
        ],
      );
      // A busca por texto acha o título traduzido e o original.
      assert.deepEqual(
        (await search({ scope: "international", q: "conscientização" })).data.map(
          (item) => item.id,
        ),
        ["worldbank-OP00474363"],
      );
      assert.equal((await search({ scope: "all" })).pagination.total, 23);

      const detail = (await findOpportunity("worldbank-OP00474363"))!;
      assert.equal(detail.title, "Serviços de campanha nacional de conscientização");
      assert.equal(detail.sourceName, "Banco Mundial");
      assert.deepEqual(
        { ...detail.international, details: undefined, eligibilityCheckedAt: undefined },
        {
          agency: "Banco Mundial",
          country: "UG",
          countryName: "Uganda",
          region: "africa",
          regionName: "África",
          brazilProject: false,
          language: "en",
          languageName: "Inglês",
          titleOriginal:
            "Non-consultancy services for undertaking a Nationwide Awareness Campaign",
          titlePt: "Serviços de campanha nacional de conscientização",
          translationSource: "model",
          amountOriginal: null,
          currency: null,
          amountBrlApprox: null,
          fxRate: null,
          fxDate: null,
          deadline: {
            at: "2026-10-27T08:00:00.000Z",
            precision: "datetime",
            timeZone: "Africa/Kampala",
            original: "2026-10-27 11:00",
          },
          brazilEligibility: {
            status: "conditional",
            label: "Condicional",
            reason:
              "Financiado pelo Banco Mundial: a regra geral admite empresas elegíveis de qualquer país, mas este aviso não declara concorrência internacional. Confira o edital.",
            rule: "wb-default",
          },
          brazilFunding: null,
          details: undefined,
          eligibilityCheckedAt: undefined,
        },
      );
      assert.ok(
        detail.international!.details.some(
          (item) => item.label === "Método" && item.value === "Request for Bids",
        ),
      );
      const erc = (await findOpportunity("eu_ft-ERC-2027-COG"))!;
      assert.equal(erc.international!.brazilEligibility!.label, "Aberto a brasileiros");
      assert.equal(erc.international!.brazilFunding!.status, "yes");
      assert.equal(erc.international!.brazilFunding!.label, "Financia participante do Brasil");
      const prospectDetail = (await findOpportunity("eu_ft-prospect-187670"))!;
      assert.equal(prospectDetail.amount, null);
      assert.equal(prospectDetail.international!.amountOriginal, 3_430_000);
      assert.equal(prospectDetail.international!.amountBrlApprox, 19_154_492);
      assert.equal(prospectDetail.international!.fxDate, "2026-10-09");

      // Perfil: internacionais só combinam com o perfil de quem ligou a preferência.
      await db.insert(usersTable).values({ id: "user-1", email: "user-1@example.com" });
      await db.insert(companyProfilesTable).values({
        userId: "user-1",
        description: "Reabilitação de cais e obras portuárias",
        offerings: ["rehabilitation of the quay"],
        coverageScope: "national",
        size: "other",
      });
      const quay = "worldbank-OP00464713";
      const optedOut = await search({ scope: "international", pageSize: "100" }, "user-1");
      assert.equal(optedOut.meta.internationalInProfile, false);
      assert.ok(optedOut.data.every((item) => item.profileMatch === null));
      assert.equal((await findOpportunity(quay, "user-1"))!.profileMatch, null);

      await db
        .update(usersTable)
        .set({ showInternationalOpportunities: true })
        .where(eq(usersTable.id, "user-1"));
      const optedIn = await search({ scope: "international", pageSize: "100" }, "user-1");
      assert.equal(optedIn.meta.internationalInProfile, true);
      assert.ok(optedIn.data.find((item) => item.id === quay)!.profileMatch);
      assert.ok((await findOpportunity(quay, "user-1"))!.profileMatch);
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
