import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

type StateEntry = { state: string; openTenders: number; estimatedValueTotal: number | null; updatedAt: string | null };
type Body = {
  data: StateEntry[];
  meta: { totalOpenTenders: number; generatedAt: string; indexUpdatedAt: string | null; cacheTtlSeconds: number };
};

test(
  "aggregates open tenders by state from the partial index and serves them from memory",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `open_by_state_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
    process.env.LOG_LEVEL ??= "silent";

    const { pool } = await import("@workspace/db");
    await pool.query(`create schema "${schema}"`);
    await pool.query(`create table "${schema}"."tenders" (like public.tenders including all)`);
    const { default: app } = await import("../app");
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/public/tenders/by-state`;
    t.after(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    });

    const insert = (id: string, state: string | null, status: string, estimatedValue: number | null, fetchedAt: string) =>
      pool.query(
        `insert into tenders (
          id, pncp_control_number, title, organization_id, organization_name, modality, modality_label, status,
          estimated_value, estimated_value_status, state, source_id, source_name, search_text, title_norm,
          object_norm, items_norm, organization_norm, other_norm, raw_payload, fetched_at
        ) values (
          $1, $1, 'Edital', 'org', 'Órgão', 'pregao_eletronico', 'Pregão eletrônico', $2,
          $3, $4, $5, 'pncp', 'PNCP', 'edital', 'edital', '', '', 'orgao', '', '{}', $6
        )`,
        [id, status, estimatedValue, estimatedValue === null ? "not_published" : "known", state, fetchedAt],
      );

    await insert("sp-1", "SP", "open", 1000.5, "2026-10-08T10:00:00Z");
    await insert("sp-2", "SP", "open", 2000.25, "2026-10-09T08:00:00Z");
    await insert("sp-3", "SP", "open", null, "2026-10-07T10:00:00Z");
    await insert("sp-closed", "SP", "closed", 999_999, "2026-10-09T09:00:00Z");
    await insert("sp-review", "SP", "under_review", 5, "2026-10-09T09:30:00Z");
    await insert("ba-1", "BA", "open", null, "2026-10-06T10:00:00Z");
    await insert("ba-lower", "ba", "open", 300, "2026-10-06T12:00:00Z");
    await insert("no-state", null, "open", 700, "2026-10-09T11:00:00Z");
    await insert("not-a-state", "ZZ", "open", 800, "2026-10-09T11:30:00Z");
    // One typing error in the source would turn Alagoas into R$ 939 billion: it is counted, not added.
    await insert("al-1", "AL", "open", 5000, "2026-10-05T10:00:00Z");
    await insert("al-vest", "AL", "open", 938_761_000_000, "2026-10-05T11:00:00Z");
    await pool.query("update tenders set estimated_value_flag = 'absolute_ceiling' where id = 'al-vest'");

    const first = await fetch(endpoint);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "public, max-age=300, stale-while-revalidate=600");
    assert.ok(first.headers.get("etag"));
    assert.ok(first.headers.get("ratelimit-policy"));
    const body = (await first.json()) as Body;
    const state = (code: string) => body.data.find((entry) => entry.state === code);

    assert.equal(body.data.length, 27);
    assert.deepEqual(state("SP"), {
      state: "SP",
      openTenders: 3,
      estimatedValueTotal: 3000.75,
      updatedAt: "2026-10-09T08:00:00.000Z",
    });
    assert.deepEqual(state("BA"), {
      state: "BA",
      openTenders: 2,
      estimatedValueTotal: 300,
      updatedAt: "2026-10-06T12:00:00.000Z",
    });
    assert.deepEqual(state("AL"), {
      state: "AL",
      openTenders: 2,
      estimatedValueTotal: 5000,
      updatedAt: "2026-10-05T11:00:00.000Z",
    });
    assert.deepEqual(state("RJ"), { state: "RJ", openTenders: 0, estimatedValueTotal: null, updatedAt: null });
    assert.equal(body.meta.totalOpenTenders, 7);
    assert.equal(body.meta.indexUpdatedAt, "2026-10-09T08:00:00.000Z");
    assert.equal(body.meta.cacheTtlSeconds, 900);

    // A tender published after the first answer only shows up once the 15 minutes pass.
    await insert("rj-1", "RJ", "open", 10, "2026-10-09T12:00:00Z");
    const cached = (await (await fetch(endpoint)).json()) as Body;
    assert.deepEqual(cached, body);

    // `fetch` adds `Cache-Control: no-cache` to a conditional request, which forces a full answer; browsers do not.
    const notModified = await new Promise<number | undefined>((resolve, reject) => {
      get(endpoint, { headers: { "If-None-Match": first.headers.get("etag")! } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on("error", reject);
    });
    assert.equal(notModified, 304);

    // The partial index holds every column the aggregate reads, so the heap is not needed.
    const client = await pool.connect();
    try {
      await client.query("set enable_seqscan = off");
      await client.query("set enable_bitmapscan = off");
      const plan = await client.query<{ "QUERY PLAN": string }>(
        `explain select state, count(*), sum(estimated_value) filter (where estimated_value_flag is null), max(fetched_at)
         from tenders where status = 'open' and state is not null group by state`,
      );
      assert.match(plan.rows.map((row) => row["QUERY PLAN"]).join("\n"), /Index Only Scan/);
    } finally {
      client.release();
    }
  },
);
