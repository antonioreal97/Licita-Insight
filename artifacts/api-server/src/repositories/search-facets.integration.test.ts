import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "computes exact disjunctive facets with and without a keyword or selected groups",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `search_facets_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();

    const { pool } = await import("@workspace/db");
    const [{ PostgresTenderRepository }, { invalidateTenderFacetCache }] =
      await Promise.all([
        import("./postgres-tender-repository"),
        import("../lib/tender-facet-cache"),
      ]);
    invalidateTenderFacetCache();
    await pool.query(`create schema "${schema}"`);
    await pool.query(
      `create table "${schema}"."tenders" (like public.tenders including all)`,
    );
    t.after(async () => {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    });

    const now = new Date();
    const insert = async ({
      id,
      title,
      status,
      modality,
      state,
      city,
      cityCode,
      organizationId,
      organizationName,
      categories,
      estimatedValue,
      platform,
      platformLabel,
      createdAt,
    }: {
      id: string;
      title: string;
      status: string;
      modality: string;
      state: string;
      city: string;
      cityCode: string;
      organizationId: string;
      organizationName: string;
      categories: { slug: string; label: string }[];
      estimatedValue: number | null;
      platform: string | null;
      platformLabel: string | null;
      createdAt: Date;
    }) => {
      await pool.query(
        `insert into tenders (
          id, pncp_control_number, title, display_title, display_title_source,
          display_title_norm, object_summary, organization_id, organization_name,
          modality, modality_label, status, estimated_value, estimated_value_status,
          state, city, city_ibge_code, source_id, source_name, platform, platform_label,
          categories, search_text, title_norm, object_norm, items_norm,
          organization_norm, other_norm, raw_payload, fetched_at, created_at, updated_at
        ) values (
          $1, $1, $2, $2, 'rules', $3, $2, $4, $5,
          $6, $6, $7, $8, $9,
          $10, $11, $12, 'pncp', 'PNCP', $13, $14,
          $15::jsonb, $3, $3, $3, '',
          lower($5), '', '{}', $16, $17, $16
        )`,
        [
          id,
          title,
          title.toLocaleLowerCase("pt-BR"),
          organizationId,
          organizationName,
          modality,
          status,
          estimatedValue,
          estimatedValue === null ? "not_published" : "known",
          state,
          city,
          cityCode,
          platform,
          platformLabel,
          JSON.stringify(categories),
          now,
          createdAt,
        ],
      );
    };

    await insert({
      id: "match-a",
      title: "Aquisição de medicamentos alfa",
      status: "open",
      modality: "dispensa",
      state: "SP",
      city: "São Paulo",
      cityCode: "3550308",
      organizationId: "org-a",
      organizationName: "Órgão A",
      categories: [{ slug: "cat-a", label: "Categoria A" }],
      estimatedValue: 100,
      platform: "comprasgov",
      platformLabel: "Compras.gov.br",
      createdAt: new Date(now.getTime() - 60 * 60 * 1_000),
    });
    await insert({
      id: "match-b",
      title: "Registro de preços de medicamentos beta",
      status: "open",
      modality: "pregao_eletronico",
      state: "RJ",
      city: "Rio de Janeiro",
      cityCode: "3304557",
      organizationId: "org-b",
      organizationName: "Órgão B",
      categories: [
        { slug: "cat-a", label: "Categoria A" },
        { slug: "cat-b", label: "Categoria B" },
      ],
      estimatedValue: 200,
      platform: null,
      platformLabel: null,
      createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1_000),
    });
    await insert({
      id: "match-c",
      title: "Fornecimento de medicamentos gama",
      status: "closed",
      modality: "dispensa",
      state: "SP",
      city: "São Paulo",
      cityCode: "3550308",
      organizationId: "org-a",
      organizationName: "Órgão A",
      categories: [{ slug: "cat-b", label: "Categoria B" }],
      estimatedValue: null,
      platform: "comprasgov",
      platformLabel: "Compras.gov.br",
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000),
    });
    await insert({
      id: "other",
      title: "Aquisição de computadores",
      status: "open",
      modality: "dispensa",
      state: "SP",
      city: "São Paulo",
      cityCode: "3550308",
      organizationId: "org-a",
      organizationName: "Órgão A",
      categories: [{ slug: "cat-a", label: "Categoria A" }],
      estimatedValue: 300,
      platform: "comprasgov",
      platformLabel: "Compras.gov.br",
      createdAt: new Date(now.getTime() - 60 * 60 * 1_000),
    });

    const result = await new PostgresTenderRepository().search({
      query: "medicamentos",
      mode: "keyword",
      status: [],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: [],
      platform: [],
      newOnly: false,
      sort: "relevance",
      page: 1,
      pageSize: 20,
      facets: true,
    });

    assert.equal(result.pagination.total, 3);
    assert.deepEqual(result.data.map(({ id }) => id).sort(), [
      "match-a",
      "match-b",
      "match-c",
    ]);
    assert.deepEqual(
      result.facets?.status.map(({ value, count }) => [value, count]),
      [
        ["open", 2],
        ["closed", 1],
      ],
    );
    assert.deepEqual(
      result.facets?.category.map(({ value, count }) => [value, count]),
      [
        ["cat-a", 2],
        ["cat-b", 2],
      ],
    );
    assert.deepEqual(
      result.facets?.organization.map(({ value, count }) => [value, count]),
      [
        ["org-a", 2],
        ["org-b", 1],
      ],
    );
    assert.deepEqual(result.facets?.groupTotals, {
      status: 3,
      modality: 3,
      state: 3,
      source: 3,
      category: 3,
      organization: 3,
      platform: 3,
    });
    assert.equal(result.facets?.valueRange.min, 100);
    assert.equal(result.facets?.valueRange.max, 200);
    assert.equal(
      result.facets?.valueRange.histogram?.reduce(
        (total, bucket) => total + bucket.count,
        0,
      ),
      2,
    );
    assert.equal(result.facets?.newCount, 2);

    const buckets = (facet: { value: string; count: number }[] | undefined) =>
      facet?.map(({ value, count }) => [value, count]);

    const keywordWithSelection = await new PostgresTenderRepository().search({
      query: "medicamentos",
      mode: "keyword",
      status: ["open"],
      modality: [],
      state: ["SP"],
      city: [],
      organizationId: [],
      sourceId: [],
      category: [],
      platform: [],
      newOnly: false,
      sort: "relevance",
      page: 1,
      pageSize: 20,
      facets: true,
    });
    assert.equal(keywordWithSelection.pagination.total, 1);
    assert.deepEqual(buckets(keywordWithSelection.facets?.status), [
      ["closed", 1],
      ["open", 1],
    ]);
    assert.deepEqual(buckets(keywordWithSelection.facets?.state), [
      ["RJ", 1],
      ["SP", 1],
    ]);
    assert.deepEqual(buckets(keywordWithSelection.facets?.modality), [
      ["dispensa", 1],
    ]);
    assert.deepEqual(keywordWithSelection.facets?.groupTotals, {
      status: 2,
      modality: 1,
      state: 2,
      source: 1,
      category: 1,
      organization: 1,
      platform: 1,
    });

    const categoryWithoutKeyword = await new PostgresTenderRepository().search({
      query: null,
      mode: "keyword",
      status: ["open"],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: ["cat-b"],
      platform: [],
      newOnly: false,
      sort: "relevance",
      page: 1,
      pageSize: 20,
      facets: true,
    });
    assert.deepEqual(
      categoryWithoutKeyword.data.map(({ id }) => id),
      ["match-b"],
    );
    assert.deepEqual(buckets(categoryWithoutKeyword.facets?.status), [
      ["closed", 1],
      ["open", 1],
    ]);
    assert.deepEqual(buckets(categoryWithoutKeyword.facets?.category), [
      ["cat-a", 3],
      ["cat-b", 1],
    ]);
    assert.deepEqual(buckets(categoryWithoutKeyword.facets?.state), [
      ["RJ", 1],
    ]);
    assert.deepEqual(categoryWithoutKeyword.facets?.groupTotals, {
      status: 2,
      modality: 1,
      state: 1,
      source: 1,
      category: 3,
      organization: 1,
      platform: 1,
    });

    await insert({
      id: "late-match",
      title: "Fornecimento tardio de medicamentos",
      status: "open",
      modality: "dispensa",
      state: "RJ",
      city: "Rio de Janeiro",
      cityCode: "3304557",
      organizationId: "org-b",
      organizationName: "Órgão B",
      categories: [{ slug: "cat-b", label: "Categoria B" }],
      estimatedValue: 400,
      platform: null,
      platformLabel: null,
      createdAt: now,
    });
    const stillCached = await new PostgresTenderRepository().search({
      query: null,
      mode: "keyword",
      status: ["open"],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: ["cat-b"],
      platform: [],
      newOnly: false,
      sort: "relevance",
      page: 1,
      pageSize: 20,
      facets: true,
    });
    assert.equal(stillCached.pagination.total, 1);
    invalidateTenderFacetCache();
    const afterInvalidation = await new PostgresTenderRepository().search({
      query: null,
      mode: "keyword",
      status: ["open"],
      modality: [],
      state: [],
      city: [],
      organizationId: [],
      sourceId: [],
      category: ["cat-b"],
      platform: [],
      newOnly: false,
      sort: "relevance",
      page: 1,
      pageSize: 20,
      facets: true,
    });
    assert.equal(afterInvalidation.pagination.total, 2);
  },
);
