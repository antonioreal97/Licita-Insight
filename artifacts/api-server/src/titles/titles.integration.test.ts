import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createOllamaClient, OllamaError } from "../ai/ollama-client";

const baseDatabaseUrl = process.env.PNCP_TEST_DATABASE_URL;
const schema = `titles_test_${crypto.randomUUID().replaceAll("-", "")}`;
const databaseUrl = baseDatabaseUrl ? new URL(baseDatabaseUrl) : null;
if (databaseUrl) {
  databaseUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = databaseUrl.toString();
}
process.env.PUBLIC_APP_ORIGIN ??= "http://localhost:24252";
process.env.LOG_LEVEL ??= "silent";

// Isolated from other suites sharing the database: sample and classification only read this status.
const TEST_STATUS = "titles_test_l";
const ORG = "55443322000111";

const KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /extintor/iu, label: "Segurança, vigilância e prevenção de incêndio" },
  { pattern: /ve[ií]culo|pneu/iu, label: "Veículos, peças e manutenção" },
  { pattern: /medicamento/iu, label: "Medicamentos e insumos de saúde" },
];

const vectorFor = (text: string): number[] => {
  const vector = [0.01, 0.01, 0.01, 0.01];
  const index = KEYWORDS.findIndex(({ pattern }) => pattern.test(text));
  vector[index >= 0 ? index : 3] = 1;
  vector[(text.length % 3) + 1] += 0.001;
  return vector;
};

const createFakeOllama = () => {
  const calls = { generate: 0, embed: 0 };
  const client = createOllamaClient({
    config: { baseUrl: "http://ollama.fake", teacherModel: "fake-teacher", embedModel: "fake-embed" },
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { prompt?: string; input?: string[] };
      if (String(input).endsWith("/api/embed")) {
        calls.embed += 1;
        return Response.json({ embeddings: (body.input ?? []).map(vectorFor) });
      }
      calls.generate += 1;
      const { itens } = JSON.parse(body.prompt?.split("\n").at(-1) ?? "{}") as { itens: { id: number; texto: string }[] };
      return Response.json({
        model: "fake-teacher",
        response: JSON.stringify({
          itens: itens.map(({ id, texto }) => ({
            id,
            titulo: /INVENTAR/u.test(texto) ? "Aquisição de unicórnios" : texto.split(" ").slice(0, 6).join(" "),
            categorias: KEYWORDS.filter(({ pattern }) => pattern.test(texto)).map(({ label }) => label).slice(0, 1),
          })),
        }),
      });
    },
  });
  return { client, calls };
};

const publication = (sequence: number, title: string) => ({
  numeroControlePNCP: `${ORG}-1-${String(sequence).padStart(6, "0")}/2026`,
  objetoCompra: title,
  processo: `L-${sequence}/2026`,
  numeroCompra: String(sequence),
  anoCompra: 2026,
  modalidadeId: sequence % 2 === 0 ? 6 : 8,
  modalidadeNome: sequence % 2 === 0 ? "Pregão eletrônico" : "Dispensa",
  situacaoCompraNome: "Divulgada no PNCP",
  dataPublicacaoPncp: "2026-10-01T09:00:00",
  dataEncerramentoProposta: "2030-10-20T17:00:00",
  valorTotalEstimado: 100,
  orcamentoSigilosoCodigo: 1,
  orgaoEntidade: { cnpj: ORG, razaoSocial: "Prefeitura de Teste L" },
  unidadeOrgao: {
    nomeUnidade: "Compras",
    ufSigla: sequence % 3 === 0 ? "BA" : "SP",
    municipioNome: "Cidade L",
    codigoIbge: "3550308",
  },
});

const tenderId = (sequence: number) => `${ORG}-1-${String(sequence).padStart(6, "0")}-2026`;

const insertTenders = async (rows: [number, string][], status = TEST_STATUS): Promise<string[]> => {
  const [{ pool }, { upsertPublications }] = await Promise.all([import("@workspace/db"), import("../ingest/upsert-tenders")]);
  await upsertPublications(rows.map(([sequence, title]) => publication(sequence, title)), new Date("2026-10-02T12:00:00Z"));
  const ids = rows.map(([sequence]) => tenderId(sequence));
  if (status !== "open") await pool.query("update tenders set status = $2 where id = any($1::text[])", [ids, status]);
  return ids;
};

describe("professor e aluno no PostgreSQL", { skip: !databaseUrl }, () => {
  const savedEnv = { ...process.env };

  const cleanup = async () => {
    const { pool } = await import("@workspace/db");
    await pool.query("delete from tender_title_examples");
    await pool.query("delete from ai_jobs where kind = 'title_rewrite'");
    await pool.query("delete from tenders where organization_id = $1", [`pncp-${ORG}`]);
  };

  before(async () => {
    const { pool } = await import("@workspace/db");
    await pool.query(`create schema "${schema}"`);
    for (const table of [
      "tenders",
      "tender_title_examples",
      "ai_jobs",
      "ai_title_usage",
      "ai_daily_usage",
      "ai_fit_daily_usage",
      "ai_sheet_daily_usage",
      "tender_ai_sheets",
      "ai_ask_requests",
      "company_tender_fits",
      "job_run_audit",
      "saved_tenders",
      "notifications",
    ]) {
      await pool.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
    }
    await pool.query(`
      create view ai_usage_ledger as
        select created_at as occurred_at, user_id, 'ask'::text as feature,
               tender_id, response_model as model, input_tokens, 0::integer as output_tokens,
               estimated_cost_usd as cost_usd
        from ai_ask_requests where status in ('answered', 'not_found') and cache_hit = false
        union all
        select created_at, user_id, 'ask_summary'::text, tender_id, summary_response_model,
               summary_input_tokens, summary_output_tokens, summary_estimated_cost_usd
        from ai_ask_requests
        where summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0
        union all
        select checked_at, user_id, 'fit'::text, tender_id, response_model,
               input_tokens, 0::integer, estimated_cost_usd
        from company_tender_fits where status = 'ready' and checked_at is not null
        union all
        select generated_at, null::text, 'sheet'::text, tender_id, response_model,
               input_tokens, 0::integer, estimated_cost_usd
        from tender_ai_sheets where status = 'ready' and generated_at is not null
        union all
        select summary_generated_at, null::text, 'sheet_summary'::text, tender_id, summary_response_model,
               summary_input_tokens, summary_output_tokens, summary_estimated_cost_usd
        from tender_ai_sheets
        where summary_generated_at is not null
          and (summary_input_tokens > 0 or summary_output_tokens > 0 or summary_estimated_cost_usd > 0)
        union all
        select created_at, null::text, 'title'::text, tender_id, model,
               input_tokens, output_tokens, estimated_cost_usd
        from ai_title_usage
    `);
    await cleanup();
  });
  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.TITLE_TEACHER_ENABLED;
    delete process.env.CATEGORY_STUDENT_ENABLED;
    delete process.env.TITLE_REWRITE_DAILY_LIMIT;
    delete process.env.TITLE_TEACHER_OPENAI_ENABLED;
    delete process.env.TITLE_OPENAI_DAILY_LIMIT;
    delete process.env.TITLE_OPENAI_BUDGET_USD;
    delete process.env.TITLE_OPENAI_BUDGET_DAYS;
    delete process.env.TITLE_BACKFILL_ENABLED;
    delete process.env.NIGHTLY_CATEGORY_ENABLED;
    delete process.env.CATEGORY_STUDENT_MIN_CONFIDENCE;
  });
  after(async () => {
    await cleanup();
    const { pool } = await import("@workspace/db");
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
  });

  it("amostra estratificada é retomável e não duplica", async () => {
    const [{ pool }, { runTeacherSample }] = await Promise.all([import("@workspace/db"), import("./sample")]);
    await insertTenders([
      [930001, "AQUISIÇÃO DE EXTINTORES DE INCÊNDIO PARA ESCOLAS"],
      [930002, "Recarga de extintores da prefeitura"],
      [930003, "Aquisição de pneus para veículos da saúde"],
      [930004, "Manutenção de veículos leves da frota"],
      [930005, "Aquisição de medicamentos da farmácia básica"],
      [930006, "Aquisição de medicamentos  da farmácia BÁSICA"],
      [930007, "Contratação de serviço de buffet"],
      [930008, "Aquisição de medicamentos controlados"],
    ]);
    const { client, calls } = createFakeOllama();
    const first = await runTeacherSample({ size: 5, statuses: [TEST_STATUS], client });
    assert.equal(first.planned, 5);
    assert.equal(first.alreadyLabeled, 0);
    assert.equal(first.labeled, 5);
    assert.equal(calls.generate, 1);

    const second = await runTeacherSample({ size: 5, statuses: [TEST_STATUS], client });
    assert.deepEqual([second.planned, second.alreadyLabeled, second.labeled], [5, 5, 0]);
    assert.equal(calls.generate, 1);

    const larger = await runTeacherSample({ size: 50, statuses: [TEST_STATUS], client });
    // 8 tenders, 2 with the same normalized text: 7 unique texts.
    assert.deepEqual([larger.planned, larger.alreadyLabeled, larger.labeled], [7, 5, 2]);
    const stored = await pool.query<{ count: number; teacher_model: string; prompt_version: number }>(
      "select count(*)::int as count, min(teacher_model) as teacher_model, min(prompt_version) as prompt_version from tender_title_examples",
    );
    assert.deepEqual(stored.rows[0], { count: 7, teacher_model: "fake-teacher", prompt_version: 1 });
    const splits = await pool.query<{ split: string }>("select distinct split from tender_title_examples");
    assert.ok(splits.rows.every(({ split }) => split === "train" || split === "holdout"));
  });

  it("embute exemplos, classifica com o aluno e não sobrescreve teacher", async () => {
    const [{ pool }, { embedPendingExamples }, { classifyPendingTenders }] = await Promise.all([
      import("@workspace/db"),
      import("./embed-examples"),
      import("./classify"),
    ]);
    const { client, calls } = createFakeOllama();
    await pool.query("update tender_title_examples set split = 'train'");
    const embedded = await embedPendingExamples({ client, batch: 3 });
    assert.equal(embedded.embedded, 7);
    assert.equal((await embedPendingExamples({ client })).embedded, 0);
    const vectors = await pool.query<{ embedding: number[]; embedding_model: string }>(
      "select embedding, embedding_model from tender_title_examples limit 1",
    );
    assert.equal(vectors.rows[0]?.embedding_model, "fake-embed");
    assert.equal(vectors.rows[0]?.embedding.length, 4);

    const [extinguisher, vehicle, teacherOwned, unknown] = await insertTenders([
      [931001, "Recarga de extintores do hospital"],
      [931002, "Revisão de veículo utilitário"],
      [931003, "Aquisição de extintores para a câmara"],
      [931004, "Serviço de buffet para formatura"],
    ]);
    await pool.query("update tenders set categorized_at = null where status = $1", [TEST_STATUS]);
    await pool.query(
      `update tenders set categories = '[{"slug":"outros","label":"Outros"}]'::jsonb, category_source = 'teacher',
         categorized_at = now() - interval '1 day'
       where id = $1`,
      [teacherOwned],
    );
    const embedCallsBefore = calls.embed;
    const result = await classifyPendingTenders({ statuses: [TEST_STATUS], client, batch: 2 });
    // 8 tenders from the sample + 4 new ones, minus the teacher one: 11 rows in batches of 2.
    assert.equal(result.skipped, null);
    assert.equal(result.processed, 11);
    assert.equal(calls.embed - embedCallsBefore, 6);

    const rows = await pool.query<{
      id: string; categories: { slug: string; label: string }[]; category_source: string;
      category_confidence: number; categorized_at: Date; search_text: string;
    }>("select id, categories, category_source, category_confidence, categorized_at, search_text from tenders where id = any($1::text[])",
      [[extinguisher, vehicle, teacherOwned, unknown]]);
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    assert.deepEqual(byId.get(extinguisher)?.categories, [
      { slug: "seguranca-incendio", label: "Segurança, vigilância e prevenção de incêndio" },
    ]);
    assert.equal(byId.get(extinguisher)?.category_source, "student");
    assert.ok((byId.get(extinguisher)?.category_confidence ?? 0) >= 0.45);
    assert.ok(byId.get(extinguisher)?.categorized_at instanceof Date);
    assert.match(byId.get(extinguisher)?.search_text ?? "", /seguranca, vigilancia e prevencao de incendio/u);
    assert.equal(byId.get(vehicle)?.categories[0]?.slug, "veiculos-pecas");
    assert.equal(byId.get(teacherOwned)?.category_source, "teacher");
    assert.deepEqual(byId.get(teacherOwned)?.categories, [{ slug: "outros", label: "Outros" }]);
    assert.equal(byId.get(unknown)?.category_source, "student");

    const again = await classifyPendingTenders({ statuses: [TEST_STATUS], client });
    assert.equal(again.processed, 0);

    // A newer example makes student rows stale again; teacher rows stay out.
    const { insertTitleExample } = await import("./examples");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await insertTitleExample({
      sourceText: "Aquisição de extintores ABC",
      tenderId: null,
      result: { title: "Aquisição de extintores ABC", categories: ["seguranca-incendio"], rejection: null },
      teacherModel: "fake-teacher",
      promptVersion: 1,
    });
    await pool.query("update tender_title_examples set split = 'train'");
    await embedPendingExamples({ client });
    const refreshed = await classifyPendingTenders({ statuses: [TEST_STATUS], client });
    assert.ok(refreshed.processed >= 3);
    const teacherAfter = await pool.query<{ category_source: string }>("select category_source from tenders where id = $1", [teacherOwned]);
    assert.equal(teacherAfter.rows[0]?.category_source, "teacher");
  });

  it("job title_rewrite grava título model, categorias teacher e respeita dedupe e teto diário", async () => {
    const [{ pool }, rewrite] = await Promise.all([import("@workspace/db"), import("./title-rewrite")]);
    const [first, second, third, invented] = await insertTenders([
      [932001, "AQUISIÇÃO DE PNEUS PARA OS VEÍCULOS DA SECRETARIA DE SAÚDE CONFORME PROCESSO"],
      [932002, "Recarga de extintores de incêndio do almoxarifado central"],
      [932003, "Aquisição de medicamentos da atenção básica municipal"],
      [932004, "Aquisição de medicamentos INVENTAR para a farmácia"],
    ], "open");
    await pool.query(
      "update tenders set display_title_source = 'rules', display_title_needs_model = true where id = any($1::text[])",
      [[first, second, third, invented]],
    );
    process.env.TITLE_REWRITE_DAILY_LIMIT = "2";
    const enqueued = await rewrite.enqueueTitleRewrites([first, first, second, third]);
    assert.deepEqual(enqueued, { created: 2, deduplicated: 0, dailyLimited: 1, ineligible: 0 });
    const repeated = await rewrite.enqueueTitleRewrites([first]);
    assert.equal(repeated.deduplicated, 1);
    const jobs = await pool.query<{ dedupe_key: string; lane: string; payload: { promptVersion: number; provider: string } }>(
      "select dedupe_key, lane, payload from ai_jobs where kind = 'title_rewrite' order by dedupe_key",
    );
    assert.deepEqual(jobs.rows.map(({ dedupe_key }) => dedupe_key).sort(), [
      rewrite.titleRewriteDedupeKey(first, "AQUISIÇÃO DE PNEUS PARA OS VEÍCULOS DA SECRETARIA DE SAÚDE CONFORME PROCESSO"),
      rewrite.titleRewriteDedupeKey(second, "Recarga de extintores de incêndio do almoxarifado central"),
    ].sort());
    assert.match(jobs.rows[0]?.dedupe_key ?? "", /^title_rewrite:.+:p1:[0-9a-f]{16}$/u);
    assert.ok(jobs.rows.every(({ lane, payload }) => lane === "batch" && payload.promptVersion === 1 && payload.provider === "ollama"));

    const { client } = createFakeOllama();
    assert.equal(await rewrite.executeTitleRewriteJob(first, client), "rewritten");
    const row = (await pool.query<{
      display_title: string; display_title_source: string; display_title_version: number; display_title_norm: string;
      display_title_needs_model: boolean; categories: { slug: string }[]; category_source: string; search_text: string; title: string;
    }>("select * from tenders where id = $1", [first])).rows[0];
    assert.equal(row?.display_title, "AQUISIÇÃO DE PNEUS PARA OS VEÍCULOS");
    assert.equal(row?.display_title_source, "model");
    assert.equal(row?.display_title_version, 1);
    assert.equal(row?.display_title_norm, "aquisicao de pneus para os veiculos");
    assert.equal(row?.display_title_needs_model, false);
    assert.deepEqual(row?.categories.map(({ slug }) => slug), ["veiculos-pecas"]);
    assert.equal(row?.category_source, "teacher");
    assert.match(row?.search_text ?? "", /^aquisicao de pneus para os veiculos .*veiculos, pecas e manutencao$/u);
    assert.equal(row?.title, "AQUISIÇÃO DE PNEUS PARA OS VEÍCULOS DA SECRETARIA DE SAÚDE CONFORME PROCESSO");
    const example = await pool.query<{ tender_id: string; categories: string[]; split: string }>(
      "select tender_id, categories, split from tender_title_examples where tender_id = $1",
      [first],
    );
    assert.deepEqual(example.rows[0]?.categories, ["veiculos-pecas"]);
    assert.ok(["train", "holdout"].includes(example.rows[0]?.split ?? ""));
    assert.equal(await rewrite.executeTitleRewriteJob(first, client), "skipped");

    // Invented word: keeps the rules title but stores the teacher categories.
    assert.equal(await rewrite.executeTitleRewriteJob(invented, client), "categories_only");
    const kept = (await pool.query<{ display_title_source: string; category_source: string; categories: { slug: string }[] }>(
      "select display_title_source, category_source, categories from tenders where id = $1",
      [invented],
    )).rows[0];
    assert.equal(kept?.display_title_source, "rules");
    assert.equal(kept?.category_source, "teacher");
    assert.deepEqual(kept?.categories.map(({ slug }) => slug), ["medicamentos-insumos-saude"]);

    // The PNCP refresh preserves model title and teacher categories.
    const { upsertPublications } = await import("../ingest/upsert-tenders");
    await upsertPublications([publication(932001, "AQUISIÇÃO DE PNEUS NOVOS")], new Date("2026-10-02T13:00:00Z"));
    const refreshed = (await pool.query<{ display_title_source: string; category_source: string }>(
      "select display_title_source, category_source from tenders where id = $1",
      [first],
    )).rows[0];
    assert.deepEqual(refreshed, { display_title_source: "model", category_source: "teacher" });
  });

  it("a coleta manda editais novos e com título alterado para a OpenAI, só com a flag e a chave", async () => {
    const [{ pool }, { upsertPublications }] = await Promise.all([import("@workspace/db"), import("../ingest/upsert-tenders")]);
    const openAiJobs = async (id: string) => (await pool.query<{ dedupe_key: string }>(
      "select dedupe_key from ai_jobs where tender_id = $1 and kind = 'title_rewrite' and payload->>'provider' = 'openai'",
      [id],
    )).rows.map(({ dedupe_key }) => dedupe_key);
    const now = new Date("2026-10-02T14:00:00Z");

    await upsertPublications([publication(935001, "Aquisição de pneus para ambulâncias")], now);
    assert.deepEqual(await openAiJobs(tenderId(935001)), [], "flag desligada");

    process.env.TITLE_TEACHER_OPENAI_ENABLED = "true";
    delete process.env.OPENAI_API_KEY;
    await upsertPublications([publication(935002, "Aquisição de pneus para tratores")], now);
    assert.deepEqual(await openAiJobs(tenderId(935002)), [], "sem chave da OpenAI");

    process.env.OPENAI_API_KEY = "test-openai-key";
    await upsertPublications([publication(935003, "Aquisição de pneus para caminhões")], now);
    assert.equal((await openAiJobs(tenderId(935003))).length, 1, "novo");
    await upsertPublications([publication(935003, "Aquisição de pneus para caminhões")], now);
    assert.equal((await openAiJobs(tenderId(935003))).length, 1, "mesmo título não reenfileira");
    // Unchanged rows are picked up by the continuous backfill rather than the collector.
    await upsertPublications([publication(935001, "Aquisição de pneus para ambulâncias")], now);
    assert.deepEqual(await openAiJobs(tenderId(935001)), []);
    await upsertPublications([publication(935001, "Aquisição de pneus e câmaras para ambulâncias")], now);
    assert.equal((await openAiJobs(tenderId(935001))).length, 1, "título oficial alterado");

    process.env.TITLE_OPENAI_DAILY_LIMIT = "2";
    await upsertPublications([publication(935004, "Aquisição de pneus para motos")], now);
    assert.equal((await openAiJobs(tenderId(935004))).length, 1, "excedente permanece durável na fila");
    const queued = await pool.query<{ count: number }>(
      "select count(*)::int as count from ai_jobs where kind = 'title_rewrite' and payload->>'provider' = 'openai'",
    );
    assert.equal(queued.rows[0]?.count, 3);

    const { claimTitleRewriteJobs } = await import("../ai/ai-job-queue");
    const quotaStart = new Date("2026-10-08T12:00:00-03:00");
    await pool.query(
      `update tenders set proposal_deadline = case id
         when $1 then '2026-10-09T12:00:00Z'::timestamptz
         when $2 then '2026-10-10T12:00:00Z'::timestamptz
         else '2026-10-11T12:00:00Z'::timestamptz end
       where id = any($3::text[])`,
      [tenderId(935004), tenderId(935003), [tenderId(935001), tenderId(935003), tenderId(935004)]],
    );
    const firstDay = await claimTitleRewriteJobs("openai", 10, "title-carry-over-1", 60_000, 2, quotaStart);
    assert.equal(firstDay.length, 2, "o teto é aplicado no consumo, não na criação");
    assert.deepEqual(new Set(firstDay.map(({ tenderId }) => tenderId)), new Set([tenderId(935004), tenderId(935003)]));
    const sameDay = await claimTitleRewriteJobs("openai", 10, "title-carry-over-2", 60_000, 2, quotaStart);
    assert.equal(sameDay.length, 0);
    await pool.query(
      "update ai_jobs set status = 'succeeded', locked_by = null, locked_until = null where id = any($1::text[])",
      [firstDay.map(({ id }) => id)],
    );
    const nextDay = await claimTitleRewriteJobs(
      "openai", 10, "title-carry-over-3", 60_000, 2,
      new Date(quotaStart.getTime() + 24 * 60 * 60 * 1_000),
    );
    assert.equal(nextDay.length, 1, "o excedente é retomado no dia seguinte");
    assert.equal(nextDay[0]?.tenderId, tenderId(935001));
    await pool.query(
      "update ai_jobs set status = 'succeeded', locked_by = null, locked_until = null where id = any($1::text[])",
      [nextDay.map(({ id }) => id)],
    );
  });

  it("backfill OpenAI prioriza edital aberto sem categoria e não duplica jobs", async () => {
    const [{ pool }, { enqueueTitleBackfillBatch }] = await Promise.all([
      import("@workspace/db"),
      import("./title-backfill"),
    ]);
    await pool.query("delete from ai_jobs where kind = 'title_rewrite' and payload->>'provider' = 'openai'");
    const [withoutCategory, withCategory] = await insertTenders([
      [935101, "Objeto administrativo sem palavras específicas"],
      [935102, "Aquisição de pneus para ambulâncias"],
    ], "open");
    await pool.query(
      `update tenders set display_title_source = case when id = any($1::text[]) then 'rules' else 'model' end
       where organization_id = $2 and status = 'open'`,
      [[withoutCategory, withCategory], `pncp-${ORG}`],
    );
    await pool.query(
      "update tenders set categories = '[]'::jsonb, category_source = null where id = $1",
      [withoutCategory],
    );
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.TITLE_TEACHER_OPENAI_ENABLED = "true";

    const first = await enqueueTitleBackfillBatch({ dailyCapacity: 10, batchSize: 1 });
    assert.equal(first.created, 1, JSON.stringify(first));
    const firstJob = (await pool.query<{ tender_id: string }>(
      "select tender_id from ai_jobs where kind = 'title_rewrite' and payload->>'provider' = 'openai'",
    )).rows[0];
    assert.equal(firstJob?.tender_id, withoutCategory);

    const second = await enqueueTitleBackfillBatch({ dailyCapacity: 10, batchSize: 2 });
    assert.ok(second.created >= 1);
    const counts = await pool.query<{ tender_id: string; count: number }>(
      `select tender_id, count(*)::int as count from ai_jobs
       where tender_id = any($1::text[]) and kind = 'title_rewrite'
         and payload->>'provider' = 'openai' group by tender_id order by tender_id`,
      [[withoutCategory, withCategory]],
    );
    assert.deepEqual(counts.rows.map(({ count }) => count), [1, 1]);
  });

  it("backfill único de regras categoriza vazios e preserva a propriedade teacher", async () => {
    const [{ pool }, { categorizeTenderRulesBatch }] = await Promise.all([
      import("@workspace/db"),
      import("./rule-categorization"),
    ]);
    const [pending, teacherOwned] = await insertTenders([
      [935201, "Aquisição de medicamentos e seringas"],
      [935202, "Aquisição de medicamentos hospitalares"],
    ], "open");
    await pool.query(
      `update tenders set categories = '[]'::jsonb, category_source = null where id = $1`,
      [pending],
    );
    await pool.query(
      `update tenders set categories = '[{"slug":"outros","label":"Outros"}]'::jsonb,
         category_source = 'teacher' where id = $1`,
      [teacherOwned],
    );

    const result = await categorizeTenderRulesBatch({ batch: 500 });
    assert.ok(result.categorized >= 1);
    const rows = await pool.query<{ id: string; category_source: string; categories: { slug: string }[] }>(
      "select id, category_source, categories from tenders where id = any($1::text[]) order by id",
      [[pending, teacherOwned]],
    );
    assert.deepEqual(rows.rows.map(({ category_source, categories }) => [category_source, categories[0]?.slug]), [
      ["rules", "medicamentos-insumos-saude"],
      ["teacher", "outros"],
    ]);
  });

  it("o lote OpenAI faz uma chamada, grava o uso no ledger e no orçamento e substitui título model antigo", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const [{ pool }, rewrite, { openAiTeacher }, { loadAiDailySpend }, { dateInSaoPaulo }] = await Promise.all([
      import("@workspace/db"),
      import("./title-rewrite"),
      import("./teacher"),
      import("../ai/ai-budget"),
      import("../lib/sao-paulo-date"),
    ]);
    const [fresh, retitled] = await insertTenders([
      [936001, "Aquisição de medicamentos para o hospital municipal"],
      [936002, "Recarga de extintores para as escolas"],
    ], "open");
    await pool.query(
      `update tenders set display_title = 'Título antigo do modelo', display_title_source = 'model', display_title_version = 1
       where id = $1`,
      [retitled],
    );
    let calls = 0;
    const teacher = openAiTeacher({
      requestFetch: async (_input, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
        const { itens } = JSON.parse(body.messages[1]?.content ?? "{}") as { itens: { id: number; texto: string }[] };
        return new Response(JSON.stringify({
          model: "gpt-4o-mini-2024-07-18",
          choices: [{ message: { content: JSON.stringify({ itens: itens.map(({ id, texto }) => ({
            id,
            titulo: texto.split(" ").slice(0, 4).join(" "),
            categorias: KEYWORDS.filter(({ pattern }) => pattern.test(texto)).map(({ label }) => label),
          })) }) } }],
          usage: { prompt_tokens: 1_200, completion_tokens: 80 },
        }), { status: 200 });
      },
    });
    const before = await loadAiDailySpend(dateInSaoPaulo(new Date()));
    const outcomes = await rewrite.executeTitleRewriteBatch([fresh, retitled], teacher);
    assert.deepEqual(outcomes, ["rewritten", "rewritten"]);
    assert.equal(calls, 1);

    const rows = await pool.query<{ id: string; display_title: string; display_title_source: string; category_source: string }>(
      "select id, display_title, display_title_source, category_source from tenders where id = any($1::text[]) order by id",
      [[fresh, retitled]],
    );
    assert.deepEqual(rows.rows.map(({ display_title, display_title_source, category_source }) =>
      [display_title, display_title_source, category_source]), [
      ["Aquisição de medicamentos para", "model", "teacher"],
      ["Recarga de extintores para", "model", "teacher"],
    ]);
    const usage = await pool.query<{ tender_id: string; input_tokens: number; output_tokens: number; model: string }>(
      "select tender_id, input_tokens, output_tokens, model from ai_title_usage where tender_id = any($1::text[]) order by tender_id",
      [[fresh, retitled]],
    );
    assert.deepEqual(usage.rows.map(({ input_tokens, output_tokens }) => [input_tokens, output_tokens]), [[600, 40], [600, 40]]);
    assert.equal(usage.rows[0]?.model, "gpt-4o-mini-2024-07-18");
    const ledger = await pool.query<{ feature: string; tender_id: string }>(
      "select feature, tender_id from ai_usage_ledger where feature = 'title' and tender_id = any($1::text[])",
      [[fresh, retitled]],
    );
    assert.equal(ledger.rowCount, 2);
    const after = await loadAiDailySpend(dateInSaoPaulo(new Date()));
    const expected = (1_200 * 0.15 + 80 * 0.6) / 1_000_000;
    assert.ok(Math.abs(after.title - before.title - expected) < 1e-7);
    assert.equal(after.total, before.total, "o professor não consome o orçamento geral de resumo/fit");

    // The local on-demand teacher never replaces a model title.
    const { client } = createFakeOllama();
    assert.equal(await rewrite.executeTitleRewriteJob(retitled, client), "skipped");
    await pool.query("delete from ai_title_usage where tender_id = any($1::text[])", [[fresh, retitled]]);
  });

  it("o worker reivindica title_rewrite por provedor", async () => {
    const [{ pool }, { claimAiJobs, enqueueAiJob }] = await Promise.all([import("@workspace/db"), import("../ai/ai-job-queue")]);
    const [left, right] = await insertTenders([
      [937001, "Aquisição de café"],
      [937002, "Aquisição de açúcar"],
    ], "open");
    await enqueueAiJob({ kind: "title_rewrite", dedupeKey: "claim-test:ollama", tenderId: left, payload: { promptVersion: 1 }, lane: "batch" });
    await enqueueAiJob({ kind: "title_rewrite", dedupeKey: "claim-test:openai", tenderId: right, payload: { promptVersion: 1, provider: "openai" }, lane: "batch" });
    const openai = await claimAiJobs(["title_rewrite"], 10, "worker-claim-test", 60_000, { titleProvider: "openai" });
    // Jobs left by the collect test are also openai; none of them may be ollama.
    assert.ok(openai.every(({ payload }) => payload.provider === "openai"));
    assert.deepEqual(openai.filter(({ dedupeKey }) => dedupeKey.startsWith("claim-test")).map(({ dedupeKey }) => dedupeKey), ["claim-test:openai"]);
    const ollama = await claimAiJobs(["title_rewrite"], 10, "worker-claim-test", 60_000, { titleProvider: "ollama" });
    assert.deepEqual(ollama.filter(({ dedupeKey }) => dedupeKey.startsWith("claim-test")).map(({ dedupeKey }) => dedupeKey), ["claim-test:ollama"]);
    assert.ok(ollama.every(({ payload }) => payload.provider !== "openai"));
    await pool.query("delete from ai_jobs where dedupe_key like 'claim-test:%'");
  });

  it("com as flags desligadas nada é enfileirado e só as regras locais categorizam", async () => {
    const [{ pool }, { scheduleTitleRewrites }, { classifyPendingInBackground }] = await Promise.all([
      import("@workspace/db"),
      import("./title-rewrite"),
      import("./classify"),
    ]);
    const [pending] = await insertTenders([[933001, "Aquisição de extintores para o teatro"]], "open");
    await pool.query(
      "update tenders set display_title_source = 'rules', display_title_needs_model = true where id = $1",
      [pending],
    );
    scheduleTitleRewrites([pending]);
    await classifyPendingInBackground("test");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const jobs = await pool.query("select 1 from ai_jobs where tender_id = $1", [pending]);
    assert.equal(jobs.rowCount, 0);
    const row = await pool.query<{ categorized_at: Date | null; category_source: string }>(
      "select categorized_at, category_source from tenders where id = $1", [pending],
    );
    assert.ok(row.rows[0]?.categorized_at instanceof Date);
    assert.equal(row.rows[0]?.category_source, "rules");
  });

  it("com o Ollama fora do ar, busca e detalhe respondem 200 e nada quebra", async () => {
    process.env.TITLE_TEACHER_ENABLED = "true";
    process.env.CATEGORY_STUDENT_ENABLED = "true";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:9";
    process.env.OLLAMA_EMBED_MODEL = "fake-embed";
    const [{ pool }, { default: app }, { executeTitleRewriteJob }, { classifyPendingInBackground }] = await Promise.all([
      import("@workspace/db"),
      import("../app"),
      import("./title-rewrite"),
      import("./classify"),
    ]);
    const [visible] = await insertTenders([[934001, "Aquisição de extintores zirconianos para o ginásio"]], "open");
    await pool.query(
      "update tenders set display_title_source = 'rules', display_title_needs_model = true where id = $1",
      [visible],
    );
    const server: Server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const search = await fetch(`${baseUrl}/api/v1/tenders/search?q=zirconianos`);
      assert.equal(search.status, 200);
      const body = await search.json() as { data: { id: string; displayTitleSource: string }[] };
      assert.equal(body.data[0]?.id, visible);
      assert.equal(body.data[0]?.displayTitleSource, "rules");
      const detail = await fetch(`${baseUrl}/api/v1/tenders/${visible}`);
      assert.equal(detail.status, 200);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const jobs = await pool.query("select 1 from ai_jobs where tender_id = $1 and kind = 'title_rewrite'", [visible]);
      assert.equal(jobs.rowCount, 1, "busca e detalhe enfileiram um único job sem chamar o Ollama");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }

    await assert.rejects(executeTitleRewriteJob(visible), (error) => error instanceof OllamaError && error.kind === "unavailable");
    const row = (await pool.query<{ display_title_source: string; categorized_at: Date | null; category_source: string }>(
      "select display_title_source, categorized_at, category_source from tenders where id = $1",
      [visible],
    )).rows[0];
    assert.equal(row?.display_title_source, "rules");
    await classifyPendingInBackground("test");
    const after = await pool.query<{ categorized_at: Date | null; category_source: string }>(
      "select categorized_at, category_source from tenders where id = $1", [visible],
    );
    assert.ok(after.rows[0]?.categorized_at instanceof Date);
    assert.equal(after.rows[0]?.category_source, "rules");
  });

  it("amostra focada rotula os incertos das classes pedidas e ignora as demais", async () => {
    const [{ pool }, { runTeacherSample }, { CategoryStudent }] = await Promise.all([
      import("@workspace/db"),
      import("./sample"),
      import("./student"),
    ]);
    const [vehicle, medicine, ignored] = await insertTenders([
      [938001, "Aquisição de pneus para veículos leves"],
      [938002, "Aquisição de medicamentos para a farmácia básica"],
      [938003, "Recarga de extintores de incêndio"],
    ], "titles_focus_test_l");
    await pool.query(
      `update tenders set category_source = 'student', categories = case id
         when $1 then '[]'::jsonb
         when $2 then '[{"slug":"medicamentos-insumos-saude","label":"Medicamentos e insumos de saúde"}]'::jsonb
         else '[{"slug":"seguranca-incendio","label":"Segurança, vigilância e prevenção de incêndio"}]'::jsonb
       end where id = any($3::text[])`,
      [vehicle, medicine, [vehicle, medicine, ignored]],
    );
    const loaded = {
      student: new CategoryStudent([
        { textHash: "vehicle", embedding: vectorFor("pneu"), categories: ["veiculos-pecas"] },
        { textHash: "medicine", embedding: vectorFor("medicamento"), categories: ["medicamentos-insumos-saude"] },
        { textHash: "security", embedding: vectorFor("extintor"), categories: ["seguranca-incendio"] },
      ], { k: 1, minConfidence: 0.45 }),
      latestExampleAt: null,
    };
    const { client, calls } = createFakeOllama();
    const result = await runTeacherSample({
      size: 10,
      statuses: ["titles_focus_test_l"],
      focus: ["veiculos-pecas", "medicamentos-insumos-saude"],
      loaded,
      client,
    });
    assert.deepEqual([result.planned, result.labeled, result.withCategories], [2, 2, 2]);
    assert.equal(calls.embed, 1);
    assert.equal(calls.generate, 1);
    const resumed = await runTeacherSample({
      size: 10,
      statuses: ["titles_focus_test_l"],
      focus: ["veiculos-pecas", "medicamentos-insumos-saude"],
      loaded,
      client,
    });
    assert.deepEqual([resumed.planned, resumed.alreadyLabeled, resumed.labeled], [2, 2, 0]);
    assert.equal(calls.generate, 1);
    const stored = await pool.query<{ tender_id: string }>(
      "select tender_id from tender_title_examples where tender_id = any($1::text[]) order by tender_id",
      [[vehicle, medicine, ignored]],
    );
    assert.deepEqual(stored.rows.map(({ tender_id }) => tender_id), [vehicle, medicine].sort());
  });

  it("com a OpenAI desligada por env, a chave não basta: nada é enfileirado nem consumido e o título fica com as regras", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.TITLE_TEACHER_OPENAI_ENABLED = "false";
    const [{ pool }, rewrite] = await Promise.all([import("@workspace/db"), import("./title-rewrite")]);
    assert.equal(rewrite.titleTeacherOpenAiEnabled(), false);
    assert.equal(rewrite.titleRewriteProviderEnabled("openai"), false, "o worker não consome nem faz backfill");
    const [fresh] = await insertTenders([[937001, "AQUISIÇÃO DE PNEUS PARA A FROTA MUNICIPAL"]], "open");
    const jobs = await pool.query("select 1 from ai_jobs where tender_id = $1 and kind = 'title_rewrite'", [fresh]);
    assert.equal(jobs.rowCount, 0);
    const row = await pool.query<{ display_title: string; display_title_source: string }>(
      "select display_title, display_title_source from tenders where id = $1", [fresh],
    );
    assert.equal(row.rows[0]?.display_title_source, "rules");
    assert.ok((row.rows[0]?.display_title ?? "").length > 0);

    // Reversible: the same environment with the flag back on enqueues again.
    process.env.TITLE_TEACHER_OPENAI_ENABLED = "true";
    assert.equal(rewrite.titleRewriteProviderEnabled("openai"), true);
  });

  describe("job noturno de categorias", () => {
    // Its own status keeps the tenders of the tests above out of the night.
    const NIGHT_STATUS = "titles_test_n";
    const EXAMPLES: [string, string][] = [
      ["Aquisição de extintores ABC", "seguranca-incendio"],
      ["Recarga de extintores de pó químico", "seguranca-incendio"],
      ["Manutenção de extintores prediais", "seguranca-incendio"],
      ["Aquisição de pneus para veículos leves", "veiculos-pecas"],
      ["Manutenção de veículos da frota", "veiculos-pecas"],
      ["Revisão de veículo utilitário", "veiculos-pecas"],
      ["Aquisição de medicamentos básicos", "medicamentos-insumos-saude"],
      ["Aquisição de medicamentos injetáveis", "medicamentos-insumos-saude"],
      ["Registro de preços de medicamentos", "medicamentos-insumos-saude"],
    ];
    const farDeadline = () => new Date(Date.now() + 6 * 60 * 60 * 1_000);

    type JevAnswer = { category: string; confidence: number; probabilities?: Record<string, number> };
    const createFakeJev = (answer: (title: string) => JevAnswer | Error) => {
      const asked: string[] = [];
      const jev = async (title: string) => {
        asked.push(title);
        const result = answer(title);
        if (result instanceof Error) throw result;
        return {
          category: result.category as never,
          confidence: result.confidence,
          probabilities: (result.probabilities ?? { [result.category]: result.confidence }) as never,
          model: "jev-test",
          inputTokens: 120,
        };
      };
      return { jev, asked };
    };

    const night = async (overrides: {
      batch?: number; embedChunk?: number; jev?: Partial<{
        enabled: boolean; threshold: number; dailyLimit: number; minConfidence: number; concurrency: number;
      }>;
    } = {}) => {
      const { nightlyCategoryConfig } = await import("./nightly-window");
      const base = nightlyCategoryConfig();
      return {
        ...base,
        batch: overrides.batch ?? 2,
        embedChunk: overrides.embedChunk ?? 2,
        minExamples: 1,
        jev: { enabled: true, threshold: 0.6, dailyLimit: 1_500, minConfidence: 0.5, concurrency: 2, ...overrides.jev },
      };
    };

    const tenderRow = async (id: string) => {
      const { pool } = await import("@workspace/db");
      return (await pool.query<{
        categories: { slug: string }[]; category_source: string | null; category_confidence: number | null;
        categorized_at: Date | null; search_text: string;
      }>(
        "select categories, category_source, category_confidence, categorized_at, search_text from tenders where id = $1",
        [id],
      )).rows[0]!;
    };

    const jevUsage = async () => {
      const { pool } = await import("@workspace/db");
      return (await pool.query<{ tender_id: string; model: string; input_tokens: number; cost: string }>(
        `select tender_id, model, input_tokens, estimated_cost_usd::text as cost from ai_title_usage
         where model like 'jev-teacher/%' order by id`,
      )).rows;
    };

    beforeEach(async () => {
      process.env.CATEGORY_STUDENT_MIN_CONFIDENCE = "0.5";
      const [{ pool }, { insertTitleExample }] = await Promise.all([import("@workspace/db"), import("./examples")]);
      await pool.query("delete from ai_title_usage where model like 'jev-teacher/%'");
      await pool.query("delete from tender_title_examples");
      await pool.query("delete from tenders where organization_id = $1 and status = $2", [`pncp-${ORG}`, NIGHT_STATUS]);
      for (const [sourceText, category] of EXAMPLES) {
        await insertTitleExample({
          sourceText,
          tenderId: null,
          result: { title: null, categories: [category as never], rejection: null },
          teacherModel: "gpt-test",
          promptVersion: 1,
        });
      }
      await pool.query("update tender_title_examples set split = 'train'");
    });

    it("o aluno grava os confiantes, mantém a categoria das regras nos duvidosos e só estes vão ao Jev, que vira exemplo", async () => {
      const [{ pool }, { runNightlyCategoryClassification }, { upsertPublications }] = await Promise.all([
        import("@workspace/db"),
        import("./nightly-classification"),
        import("../ingest/upsert-tenders"),
      ]);
      const [confident, doubtful, unknown, teacherOwned] = await insertTenders([
        [940001, "Recarga de extintores do hospital"],
        [940002, "Serviço de buffet para formatura"],
        [940003, "Contratação de artista circense"],
        [940004, "Aquisição de extintores para a câmara"],
      ], NIGHT_STATUS);
      await pool.query(
        `update tenders set categories = '[{"slug":"outros","label":"Outros"}]'::jsonb, category_source = 'teacher',
           categorized_at = now() - interval '1 day' where id = $1`,
        [teacherOwned],
      );
      assert.equal((await tenderRow(doubtful)).category_source, "rules");
      const { client, calls } = createFakeOllama();
      const { jev, asked } = createFakeJev((title) =>
        /buffet/u.test(title) ? { category: "alimentacao", confidence: 0.9 } : { category: "eventos-cultura", confidence: 0.3 });

      const first = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night(), statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.equal(first.examplesEmbedded, 9, "exemplos rotulados sem vetor são embutidos antes");
      assert.deepEqual(
        [first.processed, first.categorized, first.kept, first.lowConfidence],
        [3, 1, 2, 2],
      );
      assert.deepEqual([first.jevSent, first.jevTaught, first.jevRejected, first.jevFailed], [2, 1, 1, 0]);
      assert.deepEqual(asked.sort(), ["Contratação de artista circense", "Serviço de buffet para formatura"]);
      assert.equal(first.examplesAdded, 1);
      assert.ok(Math.abs(first.jevCostUsd - 240 * 0.000000042) < 1e-12);
      assert.deepEqual(
        [first.complete, first.stopped, first.skipped, first.jevSkipped, first.pendingTenders, first.jevBacklog, first.jevCallsToday],
        [true, false, null, null, 0, 0, 2],
      );
      assert.equal(first.embedModel, "fake-embed");
      assert.equal(first.trainExamples, 9);

      const confidentRow = await tenderRow(confident);
      assert.equal(confidentRow.category_source, "student");
      assert.deepEqual(confidentRow.categories.map(({ slug }) => slug), ["seguranca-incendio"]);
      assert.ok((confidentRow.category_confidence ?? 0) >= 0.9);

      const taught = await tenderRow(doubtful);
      assert.equal(taught.category_source, "teacher");
      assert.deepEqual(taught.categories.map(({ slug }) => slug), ["alimentacao"]);
      assert.ok(Math.abs((taught.category_confidence ?? 0) - 0.9) < 1e-6);
      assert.match(taught.search_text, /alimentacao/u);

      // Jev was not sure: nothing is written, but the paid call is recorded and not repeated.
      const rejected = await tenderRow(unknown);
      assert.equal(rejected.category_source, null);
      assert.deepEqual(rejected.categories, []);
      assert.ok((rejected.category_confidence ?? 1) < 0.5);
      assert.ok(rejected.categorized_at instanceof Date);

      const untouched = await tenderRow(teacherOwned);
      assert.deepEqual([untouched.category_source, untouched.categories[0]?.slug, untouched.category_confidence], ["teacher", "outros", null]);

      const usage = await jevUsage();
      assert.deepEqual(usage.map(({ tender_id }) => tender_id).sort(), [doubtful, unknown].sort());
      assert.ok(usage.every(({ model, input_tokens, cost }) =>
        model === "jev-teacher/jev-test" && input_tokens === 120 && Number(cost) > 0));

      const example = await pool.query<{
        categories: string[]; teacher_model: string; prompt_version: number; split: string;
        embedding: number[]; embedding_model: string; teacher_title: string | null;
      }>("select * from tender_title_examples where tender_id = $1", [doubtful]);
      assert.equal(example.rowCount, 1, "o caso ensinado vira exemplo");
      assert.deepEqual(example.rows[0]?.categories, ["alimentacao"]);
      assert.deepEqual(
        [example.rows[0]?.teacher_model, example.rows[0]?.prompt_version, example.rows[0]?.teacher_title, example.rows[0]?.embedding_model],
        ["jev-test", 1, null, "fake-embed"],
      );
      assert.equal(example.rows[0]?.embedding.length, 4, "reaproveita o vetor calculado pelo aluno");
      assert.equal((await pool.query("select 1 from tender_title_examples where tender_id = $1", [unknown])).rowCount, 0);

      // Nothing is pending the second time: no embedding, no Jev call.
      const embedCalls = calls.embed;
      const second = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night(), statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([second.processed, second.jevSent, second.examplesEmbedded, second.complete], [0, 0, 0, true]);
      assert.equal(calls.embed, embedCalls);
      assert.equal(asked.length, 2);

      // A new official title makes the student look again, and Jev too.
      await upsertPublications([publication(940003, "Contratação de artista circense e de palhaços")], new Date("2026-10-03T12:00:00Z"));
      await pool.query("update tenders set status = $2 where id = $1", [unknown, NIGHT_STATUS]);
      assert.equal((await tenderRow(unknown)).category_confidence, null);
      // The example Jev just taught is now this title's nearest neighbour, hence the stricter threshold.
      const third = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night({ jev: { threshold: 0.99 } }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.equal(third.processed, 1);
      assert.ok(asked.includes("Contratação de artista circense e de palhaços"), "o título novo volta ao Jev");
      assert.equal(asked.filter((title) => title === "Contratação de artista circense").length, 1);
    });

    it("o limiar de confiança decide o roteamento: acima fica com o aluno, abaixo vai ao Jev depois de gravado", async () => {
      const [{ runNightlyCategoryClassification }] = await Promise.all([import("./nightly-classification")]);
      const [extinguisher] = await insertTenders([[941001, "Recarga de extintores da escola"]], NIGHT_STATUS);
      const { client } = createFakeOllama();
      const seen: (string | null)[] = [];
      const { jev, asked } = createFakeJev(() => ({
        category: "seguranca-incendio",
        confidence: 0.95,
        probabilities: { "seguranca-incendio": 0.5, "manutencao-predial": 0.4, outros: 0.1 },
      }));
      const observing = async (title: string) => {
        seen.push((await tenderRow(extinguisher)).category_source);
        return jev(title);
      };

      const above = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev: observing, config: await night({ jev: { threshold: 0.6 } }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([above.processed, above.lowConfidence, above.jevSent], [1, 0, 0]);
      assert.equal((await tenderRow(extinguisher)).category_source, "student");

      // The same tender, now under a stricter threshold, is in the Jev backlog of the next night.
      const below = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev: observing, config: await night({ jev: { threshold: 0.99 } }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([below.processed, below.jevSent, below.jevTaught], [0, 1, 1]);
      assert.deepEqual(asked, ["Recarga de extintores da escola"]);
      assert.deepEqual(seen, ["student"], "o aluno já tinha gravado quando o Jev foi consultado");
      const row = await tenderRow(extinguisher);
      assert.equal(row.category_source, "teacher");
      assert.deepEqual(row.categories.map(({ slug }) => slug), ["seguranca-incendio", "manutencao-predial"]);
    });

    it("respeita o teto diário do Jev e retoma o excedente no dia seguinte", async () => {
      const [{ runNightlyCategoryClassification }] = await Promise.all([import("./nightly-classification")]);
      await insertTenders([
        [942001, "Contratação de artista circense"],
        [942002, "Contratação de trupe de malabaristas"],
        [942003, "Contratação de orquestra sinfônica"],
        [942004, "Contratação de coral infantil"],
      ], NIGHT_STATUS);
      const { client } = createFakeOllama();
      const { jev, asked } = createFakeJev(() => ({ category: "eventos-cultura", confidence: 0.88 }));
      const config = await night({ batch: 10, jev: { dailyLimit: 2 } });
      const run = (now?: () => Date) => runNightlyCategoryClassification({
        deadline: new Date((now?.() ?? new Date()).getTime() + 6 * 60 * 60 * 1_000),
        client, jev, config, statuses: [NIGHT_STATUS], budgetPaused: async () => false, now,
      });

      const first = await run();
      assert.deepEqual([first.processed, first.lowConfidence, first.jevSent, first.jevTaught], [4, 4, 2, 2]);
      assert.deepEqual([first.jevSkipped, first.jevBacklog, first.jevCallsToday], ["daily_limit", 2, 2]);

      const sameDay = await run();
      assert.deepEqual([sameDay.processed, sameDay.jevSent, sameDay.jevBacklog], [0, 0, 2]);
      assert.equal(asked.length, 2, "o teto do dia não é furado por outra execução");

      const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1_000);
      const nextDay = await run(tomorrow);
      assert.deepEqual([nextDay.processed, nextDay.jevSent, nextDay.jevTaught, nextDay.jevBacklog], [0, 2, 2, 0]);
      assert.equal(new Set(asked).size, 4, "cada edital duvidoso foi ao Jev uma vez só");
      assert.equal((await jevUsage()).length, 4);
    });

    it("para no fim da janela e a execução seguinte retoma só o que faltou", async () => {
      const [{ pool }, { runNightlyCategoryClassification }] = await Promise.all([
        import("@workspace/db"),
        import("./nightly-classification"),
      ]);
      const ids = await insertTenders([
        [943001, "Recarga de extintores do fórum"],
        [943002, "Aquisição de pneus para a patrulha"],
        [943003, "Aquisição de medicamentos oncológicos"],
        [943004, "Manutenção de extintores do ginásio"],
        [943005, "Aquisição de pneus para tratores"],
      ], NIGHT_STATUS);
      const { client, calls } = createFakeOllama();
      const { jev } = createFakeJev(() => ({ category: "outros", confidence: 0.9 }));
      const config = await night({ batch: 2, embedChunk: 2 });
      const evaluated = async () => (await pool.query<{ count: number }>(
        "select count(*)::int as count from tenders where id = any($1::text[]) and category_confidence is not null",
        [ids],
      )).rows[0]?.count;

      // The window is already closed: not even the examples are embedded.
      const closed = await runNightlyCategoryClassification({
        deadline: new Date(Date.now() - 1_000), client, jev, config, statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([closed.processed, closed.examplesEmbedded, closed.stopped, closed.complete], [0, 0, true, false]);
      assert.equal(calls.embed, 0);

      // The clock reaches the end of the window during the first batch of tenders.
      let closing = false;
      const deadline = farDeadline();
      const partial = await runNightlyCategoryClassification({
        deadline, client, jev, config, statuses: [NIGHT_STATUS], budgetPaused: async () => false,
        now: () => (closing ? new Date(deadline.getTime() + 1) : new Date()),
        signal: {
          get stopped() {
            // 9 examples in chunks of 2 are 5 requests; the sixth is the first chunk of tenders.
            if (calls.embed >= 6) closing = true;
            return false;
          },
        },
      });
      assert.deepEqual([partial.processed, partial.stopped, partial.complete, partial.pendingTenders], [2, true, false, 3]);
      assert.equal(await evaluated(), 2);

      const resumed = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config, statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([resumed.processed, resumed.complete, resumed.pendingTenders, resumed.examplesEmbedded], [3, true, 0, 0]);
      assert.equal(await evaluated(), 5);
    });

    it("título repetido é embutido uma vez e título já rotulado por um professor não é embutido", async () => {
      const [{ runNightlyCategoryClassification }] = await Promise.all([import("./nightly-classification")]);
      const [labelled, firstCopy, secondCopy] = await insertTenders([
        [947001, "AQUISIÇÃO DE EXTINTORES  ABC"],
        [947002, "Recarga de extintores da creche"],
        [947003, "Recarga de extintores da creche"],
      ], NIGHT_STATUS);
      const { client, calls } = createFakeOllama();
      const { jev, asked } = createFakeJev(() => ({ category: "outros", confidence: 0.9 }));
      const result = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night({ batch: 10, embedChunk: 10 }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([result.processed, result.reused, result.categorized, result.lowConfidence], [3, 2, 3, 0]);
      // One request for the nine examples and one for the single new text.
      assert.equal(calls.embed, 2);
      assert.equal(asked.length, 0);
      const exact = await tenderRow(labelled);
      assert.deepEqual([exact.category_source, exact.categories[0]?.slug, exact.category_confidence], ["student", "seguranca-incendio", 1]);
      assert.deepEqual((await tenderRow(firstCopy)).categories, (await tenderRow(secondCopy)).categories);
      assert.equal((await tenderRow(secondCopy)).category_source, "student");
    });

    it("a primeira chamada ao Ollama pode estourar o tempo (modelo carregando): o job insiste e segue", async () => {
      const [{ runNightlyCategoryClassification }] = await Promise.all([import("./nightly-classification")]);
      await insertTenders([[948001, "Recarga de extintores da biblioteca"]], NIGHT_STATUS);
      const { client } = createFakeOllama();
      let failures = 2;
      const coldStart = {
        ...client,
        embed: async (texts: string[]) => {
          if (failures > 0) {
            failures -= 1;
            throw new OllamaError("timeout", "Ollama /api/embed timed out after 60000 ms");
          }
          return client.embed(texts);
        },
      };
      const { jev } = createFakeJev(() => ({ category: "outros", confidence: 0.9 }));
      const result = await runNightlyCategoryClassification({
        deadline: farDeadline(), client: coldStart, jev, config: await night(), statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([result.examplesEmbedded, result.processed, result.complete], [9, 1, true]);

      // A wrong model name is a 4xx: no point insisting, the scheduler waits and tries later.
      await insertTenders([[948002, "Recarga de extintores do arquivo"]], NIGHT_STATUS);
      let attempts = 0;
      const missingModel = {
        ...client,
        embed: async () => {
          attempts += 1;
          throw new OllamaError("http", "Ollama /api/embed returned HTTP 404", 404);
        },
      };
      await assert.rejects(runNightlyCategoryClassification({
        deadline: farDeadline(), client: missingModel, jev, config: await night(), statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      }), OllamaError);
      assert.equal(attempts, 1);
    });

    it("o resumo da noite traz a concordância do aluno com o professor no holdout", async () => {
      const [{ pool }, { runNightlyCategoryClassification }] = await Promise.all([
        import("@workspace/db"),
        import("./nightly-classification"),
      ]);
      // One example of each class is held out; a wrong teacher label makes the third one a miss.
      await pool.query(
        `update tender_title_examples set split = 'holdout'
         where source_text = any($1::text[])`,
        [["Aquisição de extintores ABC", "Aquisição de pneus para veículos leves", "Aquisição de medicamentos básicos"]],
      );
      await pool.query(
        "update tender_title_examples set categories = '{outros}' where source_text = 'Aquisição de medicamentos básicos'",
      );
      const { client } = createFakeOllama();
      const { jev } = createFakeJev(() => ({ category: "outros", confidence: 0.9 }));
      const result = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night(), statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.equal(result.trainExamples, 6);
      const { thresholdForShare, ...holdout } = result.holdout!;
      assert.deepEqual(holdout, {
        total: 3, agreement: 0.6667, coverage: 1, agreementCovered: 0.6667, belowJevThreshold: 0,
      });
      // Every held-out title is confident here, so any share would need a threshold above 0.9.
      assert.ok(thresholdForShare.p10 > 0.9 && thresholdForShare.p10 <= thresholdForShare.p20);
    });

    it("o lock deixa uma execução só por vez", async () => {
      const { tryRunSingletonJob } = await import("../jobs/job-lock");
      const { NIGHTLY_CATEGORY_JOB_KEY } = await import("./nightly-scheduler");
      let release: () => void = () => undefined;
      const holding = tryRunSingletonJob(NIGHTLY_CATEGORY_JOB_KEY, () => new Promise<string>((resolve) => {
        release = () => resolve("first");
      }));
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = await tryRunSingletonJob(NIGHTLY_CATEGORY_JOB_KEY, async () => "second");
      assert.deepEqual(second, { acquired: false });
      release();
      assert.deepEqual(await holding, { acquired: true, value: "first" });
      assert.deepEqual(await tryRunSingletonJob(NIGHTLY_CATEGORY_JOB_KEY, async () => "third"), { acquired: true, value: "third" });
    });

    it("troca do modelo de embedding re-embute os exemplos antes de classificar", async () => {
      const [{ pool }, { runNightlyCategoryClassification }] = await Promise.all([
        import("@workspace/db"),
        import("./nightly-classification"),
      ]);
      const { client } = createFakeOllama();
      const { jev } = createFakeJev(() => ({ category: "outros", confidence: 0.9 }));
      const config = await night();
      const run = (model: string) => runNightlyCategoryClassification({
        deadline: farDeadline(),
        client: { ...client, config: { ...client.config, embedModel: model } },
        jev, config, statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.equal((await run("fake-embed")).examplesEmbedded, 9);
      const [tender] = await insertTenders([[944001, "Recarga de extintores do museu"]], NIGHT_STATUS);
      const switched = await run("outro-modelo");
      assert.deepEqual([switched.examplesEmbedded, switched.embedModel, switched.trainExamples, switched.processed], [9, "outro-modelo", 9, 1]);
      const models = await pool.query<{ embedding_model: string }>("select distinct embedding_model from tender_title_examples");
      assert.deepEqual(models.rows.map(({ embedding_model }) => embedding_model), ["outro-modelo"]);
      assert.equal((await tenderRow(tender)).category_source, "student");
    });

    it("sem Jev (desligado, orçamento pausado ou fora do ar) o aluno segue e os duvidosos ficam para depois", async () => {
      const [{ runNightlyCategoryClassification }] = await Promise.all([import("./nightly-classification")]);
      await insertTenders([
        [945001, "Contratação de artista circense"],
        [945002, "Contratação de trupe de malabaristas"],
        [945003, "Contratação de orquestra sinfônica"],
        [945004, "Contratação de coral infantil"],
        [945005, "Contratação de companhia de dança"],
        [945006, "Contratação de grupo de teatro"],
      ], NIGHT_STATUS);
      const { client } = createFakeOllama();
      const { jev, asked } = createFakeJev(() => new Error("jev fora do ar"));

      const disabled = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night({ batch: 10, jev: { enabled: false } }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([disabled.processed, disabled.lowConfidence, disabled.jevSent, disabled.jevSkipped], [6, 6, 0, "disabled"]);

      const paused = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night({ batch: 10 }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => true,
      });
      assert.deepEqual([paused.jevSent, paused.jevSkipped, paused.jevBacklog], [0, "budget_paused", 6]);
      assert.equal(asked.length, 0);

      const down = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night({ batch: 10, jev: { concurrency: 1 } }),
        statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([down.jevSent, down.jevFailed, down.jevTaught, down.jevSkipped], [5, 5, 0, "unavailable"]);
      assert.equal(down.jevBacklog, 6, "falha não consome o teto nem tira o edital da fila");
      assert.equal((await jevUsage()).length, 0);
    });

    it("sem exemplos embutíveis a noite é pulada, e a classificação pós-coleta fica desligada no modo noturno", async () => {
      const [{ pool }, { runNightlyCategoryClassification }, { classifyAfterCollect }] = await Promise.all([
        import("@workspace/db"),
        import("./nightly-classification"),
        import("./classify"),
      ]);
      await pool.query("delete from tender_title_examples");
      const [tender] = await insertTenders([[946001, "Contratação de artista circense"]], NIGHT_STATUS);
      const { client, calls } = createFakeOllama();
      const { jev } = createFakeJev(() => ({ category: "outros", confidence: 0.9 }));
      const skipped = await runNightlyCategoryClassification({
        deadline: farDeadline(), client, jev, config: await night(), statuses: [NIGHT_STATUS], budgetPaused: async () => false,
      });
      assert.deepEqual([skipped.skipped, skipped.processed, skipped.complete, skipped.pendingTenders], ["no_examples", 0, false, 1]);
      assert.equal(calls.embed, 0);

      const attempts = async () => (await pool.query<{ count: number }>(
        "select count(*)::int as count from job_run_audit where job_key = 'category_classify'",
      )).rows[0]?.count ?? 0;
      const before = await attempts();
      process.env.CATEGORY_STUDENT_ENABLED = "true";
      process.env.OLLAMA_BASE_URL = "http://127.0.0.1:9";
      await classifyAfterCollect("test");
      assert.equal(await attempts(), before, "a coleta deixa os editais para a noite");
      assert.equal((await tenderRow(tender)).categorized_at, null);
      process.env.NIGHTLY_CATEGORY_ENABLED = "false";
      await classifyAfterCollect("test");
      assert.equal(await attempts(), before + 1, "com o job noturno desligado, volta a classificar após a coleta");
    });
  });
});
