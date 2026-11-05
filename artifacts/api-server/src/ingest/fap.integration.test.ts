import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const fixture = (name: string): string =>
  readFileSync(
    new URL(`./fixtures/funding/fap/${name}`, import.meta.url),
    "utf8",
  );

test(
  "FAPDF: grava as chamadas na fonte fap, instalação fap-df e UF DF, sem duplicar na releitura",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async () => {
    const schema = `fap_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    const { pool } = await import("@workspace/db");
    await pool.query(`create schema "${schema}"`);
    for (const table of ["cultural_opportunities", "ingest_runs"])
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    try {
      const [
        { parseFapdfOpportunities },
        { FAP_CATALOG, fapIdentity },
        { upsertFundingOpportunities },
        { searchOpportunities },
        { parseOpportunityQuery },
      ] = await Promise.all([
        import("./fap-parsers"),
        import("./fap-sources"),
        import("./upsert-opportunities"),
        import("../repositories/postgres-opportunity-repository"),
        import("../lib/opportunity-query"),
      ]);
      const now = new Date("2026-03-10T15:00:00Z");
      const drafts = parseFapdfOpportunities(
        fixture("fapdf-editais-2026.html"),
        "https://www.fap.df.gov.br/editais-fapdf-20261",
        fapIdentity(FAP_CATALOG.find((entry) => entry.uf === "DF")!),
        now,
      );
      assert.ok(drafts.length >= 10);
      // The source check (migration 0054) accepts `fap`; reading twice keeps one row per call.
      await upsertFundingOpportunities(drafts, now);
      await upsertFundingOpportunities(drafts, now);
      const { rows } = await pool.query<{
        total: number;
        installs: string[];
        states: string[];
      }>(
        `select count(*)::int as total, array_agg(distinct installation_id) as installs,
                array_agg(distinct state) as states
           from "${schema}"."cultural_opportunities" where source = 'fap'`,
      );
      assert.equal(rows[0]!.total, drafts.length);
      assert.deepEqual(rows[0]!.installs, ["fap-df"]);
      assert.deepEqual(rows[0]!.states, ["DF"]);

      const listed = await searchOpportunities(
        parseOpportunityQuery({ source: "fap", state: "DF", status: "open" }),
      );
      assert.ok(
        listed.data.some((item) => item.title.includes("DEMANDA ESPONTÂNEA")),
      );
      assert.ok(
        listed.data.every(
          (item) => item.source === "fap" && item.state === "DF",
        ),
      );
      const elsewhere = await searchOpportunities(
        parseOpportunityQuery({ source: "fap", state: "SP" }),
      );
      assert.equal(elsewhere.data.length, 0);
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
