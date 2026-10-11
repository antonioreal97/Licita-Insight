import assert from "node:assert/strict";
import { test } from "node:test";
import type { OpportunityCriteria } from "../lib/opportunity-query";

test(
  "oportunidades: grava áreas e município, filtra, conta por área e fecha o que saiu da listagem",
  {
    skip: !process.env.PNCP_TEST_DATABASE_URL,
  },
  async () => {
    const schema = `opportunities_test_${crypto.randomUUID().replaceAll("-", "")}`;
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
    ]) {
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    }
    try {
      const [
        { CULTURAL_INSTALLATIONS },
        { fetchOpenOpportunities },
        { mapasFixture },
        { closeMissingOpportunities, upsertOpportunities },
        { parseOpportunityQuery },
        { searchOpportunities, findOpportunity },
      ] = await Promise.all([
        import("./cultural-installations"),
        import("./mapas-client"),
        import("./mapas-fixtures"),
        import("./upsert-opportunities"),
        import("../lib/opportunity-query"),
        import("../repositories/postgres-opportunity-repository"),
      ]);
      const now = new Date("2026-10-10T15:00:00-03:00");
      const installation = (id: string) => {
        const found = CULTURAL_INSTALLATIONS.find((row) => row.id === id);
        assert.ok(found?.kind === "mapas", id);
        return found;
      };
      const collect = async (id: string, body: string) => {
        const result = await fetchOpenOpportunities(installation(id), now, {
          fetcher: async () => ({
            status: 200,
            body,
            contentType: "application/json",
            metadata: JSON.stringify({ numPages: 1 }),
          }),
        });
        await upsertOpportunities(result.drafts, now);
        return result;
      };

      await collect("pe", mapasFixture("pe-open.json"));
      await collect("es", mapasFixture("es-open.json"));
      await collect("ce", mapasFixture("ce-open.json"));
      await collect(
        "rn-natal",
        JSON.stringify([
          {
            id: 1,
            name: "Edital de música de Natal",
            registrationFrom: "2026-10-01 08:00:00",
            registrationTo: "2026-11-01 18:00:00",
            type: { id: 9, name: "Edital" },
            terms: { tag: [], area: ["Música", "Cinema"] },
            owner: { id: 3, name: "Secretaria de Cultura de Natal" },
            ownerEntity: { id: 8, name: "Editais PNAB 2026" },
          },
        ]),
      );

      const [festival] = await db
        .select()
        .from(culturalOpportunitiesTable)
        .where(eq(culturalOpportunitiesTable.id, "pe-3402"));
      assert.deepEqual(festival?.areas, ["audiovisual"]);
      assert.deepEqual(festival?.areaTerms, ["Cinema"]);
      assert.equal(festival?.opportunityType, "Edital");
      assert.equal(festival?.originName, "SECULT-PE 2026");
      assert.equal(festival?.city, null);
      assert.equal(festival?.kind, "culture");
      assert.equal(festival?.source, "mapas");

      const search = (query: Record<string, unknown>) =>
        searchOpportunities(
          parseOpportunityQuery(query) satisfies OpportunityCriteria,
        );
      const ids = (response: Awaited<ReturnType<typeof search>>) =>
        response.data.map((row) => row.id).sort();

      const everything = await search({});
      assert.equal(everything.pagination.total, 10);
      const areaCount = Object.fromEntries(
        everything.facets!.area.map((bucket) => [bucket.value, bucket.count]),
      );
      assert.equal(areaCount.audiovisual, 3);
      assert.equal(areaCount.musica >= 1, true);
      assert.equal(areaCount.circo, 2);
      assert.equal(
        everything.facets!.area.find((bucket) => bucket.value === "audiovisual")
          ?.label,
        "Audiovisual",
      );
      assert.deepEqual(everything.facets!.city, [
        { value: "Natal", label: "Natal (RN)", count: 1, state: "RN" },
      ]);
      assert.ok(
        everything.facets!.organization.some(
          (bucket) =>
            bucket.value === "Secretaria de Cultura do Estado de Pernambuco" &&
            bucket.count === 3,
        ),
      );

      // Audiovisual is one area among others, and the three ways of asking for it keep answering.
      assert.deepEqual(ids(await search({ area: "audiovisual" })), [
        "pe-2571",
        "pe-3402",
        "rn-natal-1",
      ]);
      assert.deepEqual(ids(await search({ program: "audiovisual" })), [
        "pe-2571",
        "pe-3402",
        "rn-natal-1",
      ]);
      assert.ok(ids(await search({ q: "audiovisual" })).includes("pe-3402"));
      assert.deepEqual(
        ids(await search({ area: ["circo", "musica"], state: "RN" })),
        ["rn-natal-1"],
      );

      // The area facet ignores the area filter itself and follows the others.
      const inNatal = await search({ area: "circo", city: "Natal" });
      assert.equal(inNatal.pagination.total, 0);
      assert.deepEqual(
        inNatal.facets!.area.map((bucket) => bucket.value).sort(),
        ["audiovisual", "musica"],
      );

      assert.deepEqual(ids(await search({ city: "Natal", state: "RN" })), [
        "rn-natal-1",
      ]);
      assert.deepEqual(ids(await search({ city: "Natal", state: "CE" })), []);
      assert.deepEqual(
        ids(await search({ organization: "Secretaria de Cultura de Natal" })),
        ["rn-natal-1"],
      );
      assert.deepEqual(ids(await search({ installation: "rn-natal" })), [
        "rn-natal-1",
      ]);

      const natal = await findOpportunity("rn-natal-1");
      assert.deepEqual(natal?.areas, ["audiovisual", "musica"]);
      assert.deepEqual(natal?.areaTerms, ["Música", "Cinema"]);
      assert.equal(natal?.city, "Natal");
      assert.equal(natal?.opportunityType, "Edital");
      assert.equal(natal?.originName, "Editais PNAB 2026");
      assert.deepEqual(natal?.installation, {
        id: "rn-natal",
        name: "Mapa Cultural de Natal",
        uf: "RN",
        city: "Natal",
      });

      const continuous = await findOpportunity("pe-3207");
      assert.equal(continuous?.continuousFlow, true);

      assert.throws(
        () => parseOpportunityQuery({ area: "cinema" }),
        /area received an unknown value/,
      );
      assert.throws(
        () => parseOpportunityQuery({ city: "" }),
        /city must be a non-empty name/,
      );

      // A complete listing that no longer returns a call closes it, for that install only.
      assert.equal(
        await closeMissingOpportunities("pe", ["3402", "3207"], now),
        1,
      );
      const status = async (id: string) =>
        (
          await db
            .select()
            .from(culturalOpportunitiesTable)
            .where(eq(culturalOpportunitiesTable.id, id))
        )[0]?.status;
      assert.equal(await status("pe-2571"), "closed");
      assert.equal(await status("pe-3402"), "open");
      assert.equal(await status("es-2314"), "open");
      assert.equal(
        await closeMissingOpportunities("pe", ["3402", "3207"], now),
        0,
      );
      assert.equal(await closeMissingOpportunities("es", [], now), 3);
      assert.equal(await status("es-2314"), "closed");

      // The next collection that lists the call again reopens it.
      await collect("pe", mapasFixture("pe-open.json"));
      assert.equal(await status("pe-2571"), "open");
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
