import assert from "node:assert/strict";
import { test } from "node:test";

// Opt-in: real Postgres in an isolated schema. The public schema must have the application migrations applied
// before PNCP_TEST_DATABASE_URL is set. No external call is made.
test(
  "vocabulário sem termos genéricos, teto de frequência, contagem e casamento por expressão",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `profile_vocabulary_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    const { db, pool, profileKeywordVocabularyTable, tendersTable } =
      await import("@workspace/db");
    const { normalizeText } = await import("../domain/normalize");
    const {
      countOpenTendersMatchingProfile,
      rebuildProfileKeywordVocabulary,
      suggestProfileKeywords,
      suggestionsFromDescription,
    } = await import("./keyword-vocabulary");
    const { lexicalGatePasses } = await import("../ai/company-fit-service");

    await pool.query(`create schema "${schema}"`);
    for (const table of ["tenders", "profile_keyword_vocabulary"])
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );

    const events = { slug: "eventos-cultura", label: "Eventos, shows e cultura" };
    let sequence = 0;
    const addTender = async (
      title: string,
      object: string,
      options: { categories?: (typeof events)[]; status?: "open" | "closed" } = {},
    ) => {
      sequence += 1;
      const id = `T-${sequence}`;
      await db.insert(tendersTable).values({
        id,
        pncpControlNumber: `C-${sequence}`,
        title,
        objectSummary: object,
        description: null,
        organizationId: "O1",
        organizationName: "Órgão",
        modality: "other",
        modalityLabel: "Outra",
        status: options.status ?? "open",
        estimatedValueStatus: "not_published",
        state: "SP",
        sourceId: `S-${sequence}`,
        sourceName: "TEST",
        categories: options.categories ?? [],
        items: [],
        documents: [],
        timeline: [],
        searchText: normalizeText(`${title} ${object}`),
        titleNorm: normalizeText(title),
        objectNorm: normalizeText(object),
        itemsNorm: "",
        organizationNorm: "orgao",
        otherNorm: "",
        rawPayload: {},
        fetchedAt: new Date(),
      });
      return id;
    };

    try {
      // 60 open notices, all with the usual boilerplate. "mobiliário" is in 15 of them (25%, above the 20% ceiling);
      // "iluminação cênica" in 6 (10%); "transmissão ao vivo" in 4; "registro de preços" in 5.
      const boilerplate =
        "Contratação de empresa especializada para prestação de serviços";
      for (let index = 0; index < 15; index += 1)
        await addTender(`${boilerplate} de montagem`, `Mobiliário escolar lote ${index}`);
      for (let index = 0; index < 6; index += 1)
        await addTender(`${boilerplate} de iluminação cênica`, "Iluminação cênica para eventos", {
          categories: [events],
        });
      const live: string[] = [];
      for (let index = 0; index < 4; index += 1)
        live.push(
          await addTender(`${boilerplate} de transmissão ao vivo`, "Transmissão ao vivo das sessões da câmara"),
        );
      for (let index = 0; index < 5; index += 1)
        await addTender(`Registro de preços para ${boilerplate}`, "Registro de preços de serviços gerais de copa");
      // "ao vivo" and "transmissão" in the same notice, but not as the expression.
      const loose = await addTender(
        `${boilerplate} de show ao vivo`,
        "Show ao vivo na praça; transmissão de dados por fibra",
      );
      while (sequence < 60)
        await addTender(`${boilerplate} de manutenção predial`, `Manutenção predial ${sequence}`);
      await addTender("Transmissão ao vivo encerrada", "Transmissão ao vivo", { status: "closed" });

      await t.test("reconstrução descarta termos genéricos e os acima de 20% dos editais abertos", async () => {
        const metrics = await rebuildProfileKeywordVocabulary();
        assert.equal(metrics.tenders, 60);
        const terms = new Set(
          (await db.select().from(profileKeywordVocabularyTable)).map(
            ({ normalizedTerm }) => normalizedTerm,
          ),
        );
        for (const generic of [
          "empresa",
          "especializada",
          "empresa especializada",
          "contratacao de empresa",
          "prestacao de servicos",
          "registro de precos",
        ])
          assert.equal(terms.has(generic), false, generic);
        assert.equal(terms.has("mobiliario"), false, "25% dos editais abertos: acima do teto");
        assert.equal(terms.has("manutencao predial"), false, "29 de 60 editais: acima do teto");
        assert.ok(terms.has("iluminacao cenica"));
        assert.ok(terms.has("transmissao ao vivo"));
        assert.ok(terms.has("copa"));
      });

      await t.test("leituras não devolvem termo genérico gravado por uma reconstrução antiga", async () => {
        await db.insert(profileKeywordVocabularyTable).values([
          { normalizedTerm: "empresa", displayTerm: "empresa", ngramSize: 1, openTenderCount: 59 },
          {
            normalizedTerm: "empresa especializada",
            displayTerm: "empresa especializada",
            ngramSize: 2,
            openTenderCount: 59,
          },
        ]);
        assert.deepEqual(await suggestProfileKeywords("empresa"), []);
        const fromDescription = await suggestionsFromDescription(
          "Somos uma empresa especializada em iluminação cênica para eventos.",
        );
        const names = fromDescription.keywords.map(({ normalizedTerm }) => normalizedTerm);
        assert.ok(names.includes("iluminacao cenica"));
        assert.equal(names.some((name) => name.includes("empresa")), false);
      });

      await t.test("contador usa os termos escolhidos como expressão inteira, ou as categorias", async () => {
        assert.equal(
          await countOpenTendersMatchingProfile({ terms: ["transmissão ao vivo"], categories: [] }),
          4,
          "o edital com 'show ao vivo' e 'transmissão de dados' não conta; o encerrado também não",
        );
        assert.equal(
          await countOpenTendersMatchingProfile({ terms: ["Transmissao ao vivo", "iluminação cênica"], categories: [] }),
          10,
        );
        assert.equal(
          await countOpenTendersMatchingProfile({ terms: ["transmissão ao vivo"], categories: ["eventos-cultura"] }),
          10,
        );
        assert.equal(await countOpenTendersMatchingProfile({ terms: ["ao vivo"], categories: [] }), 5);
        assert.equal(await countOpenTendersMatchingProfile({ terms: [], categories: [] }), 0);
      });

      await t.test("filtro lexical da aderência casa a expressão inteira, com stemming", async () => {
        assert.equal(await lexicalGatePasses(live[0]!, ["transmissão ao vivo"]), true);
        assert.equal(await lexicalGatePasses(live[0]!, ["Transmissão ao Vivo"]), true, "sem diferença de maiúsculas");
        assert.equal(await lexicalGatePasses(live[0]!, ["transmissão da câmara"]), false, "palavras fora de ordem/juntas não bastam");
        assert.equal(await lexicalGatePasses(loose, ["transmissão ao vivo"]), false);
        assert.equal(await lexicalGatePasses(loose, ["show"]), true, "termo de uma palavra continua valendo");
        assert.equal(await lexicalGatePasses(loose, ["de", "ao"]), false, "termo só de stopwords não passa");
      });
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
