import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "new tender filter and count with PostgreSQL",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `new_tender_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();

    const { pool } = await import("@workspace/db");
    const { PostgresTenderRepository } =
      await import("./postgres-tender-repository");
    await pool.query(`create schema "${schema}"`);
    await pool.query(
      `create table "${schema}"."tenders" (like public.tenders including all)`,
    );
    t.after(async () => {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    });

    const now = new Date();
    const insert = async (id: string, createdAt: Date) => {
      await pool.query(
        `insert into tenders (
        id, pncp_control_number, title, organization_id, organization_name,
        modality, modality_label, status, estimated_value_status,
        source_id, source_name, search_text, title_norm, object_norm, items_norm,
        organization_norm, other_norm, raw_payload, fetched_at, created_at, updated_at
      ) values ($1, $1, $2, 'org', 'Órgão sintético', 'other', 'Outra', 'open',
        'not_published', 'pncp', 'PNCP', $2, $2, '', '', 'orgao sintetico', '', '{}', $3, $4, $3)`,
        [id, `Edital sintético ${id}`, now, createdAt],
      );
    };
    await insert("new", new Date(now.getTime() - 60 * 60 * 1_000));
    await insert("old", new Date(now.getTime() - 25 * 60 * 60 * 1_000));

    const result = await new PostgresTenderRepository().search({
      query: null,
      mode: "keyword",
      status: [],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: [],
      platform: [],
      newOnly: true,
      sort: "first_seen_desc",
      page: 1,
      pageSize: 20,
      facets: true,
    });

    assert.deepEqual(
      result.data.map(({ id }) => id),
      ["new"],
    );
    assert.equal(result.data[0]?.isNew, true);
    assert.equal(
      result.data[0]?.firstSeenAt.getTime(),
      now.getTime() - 60 * 60 * 1_000,
    );
    assert.equal(result.facets?.newCount, 1);
    assert.equal(result.pagination.total, 1);
  },
);
