import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createOllamaClient, OllamaError } from "../ai/ollama-client";

const databaseUrl = process.env.PNCP_TEST_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;
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

  before(cleanup);
  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.TITLE_TEACHER_ENABLED;
    delete process.env.CATEGORY_STUDENT_ENABLED;
    delete process.env.TITLE_REWRITE_DAILY_LIMIT;
    delete process.env.TITLE_TEACHER_OPENAI_ENABLED;
    delete process.env.TITLE_OPENAI_DAILY_LIMIT;
  });
  after(async () => {
    await cleanup();
    const { pool } = await import("@workspace/db");
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
    // The backlog (already stored, unchanged) never goes to the paid teacher.
    await upsertPublications([publication(935001, "Aquisição de pneus para ambulâncias")], now);
    assert.deepEqual(await openAiJobs(tenderId(935001)), []);
    await upsertPublications([publication(935001, "Aquisição de pneus e câmaras para ambulâncias")], now);
    assert.equal((await openAiJobs(tenderId(935001))).length, 1, "título oficial alterado");

    process.env.TITLE_OPENAI_DAILY_LIMIT = "2";
    await upsertPublications([publication(935004, "Aquisição de pneus para motos")], now);
    assert.deepEqual(await openAiJobs(tenderId(935004)), [], "teto diário da OpenAI");
    const onDemandUnaffected = await pool.query<{ count: number }>(
      "select count(*)::int as count from ai_jobs where kind = 'title_rewrite' and payload->>'provider' = 'openai'",
    );
    assert.equal(onDemandUnaffected.rows[0]?.count, 2);
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
    assert.ok(Math.abs(after.total - before.total - expected) < 1e-7);

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

  it("com as flags desligadas nada é enfileirado nem classificado", async () => {
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
    const row = await pool.query<{ categorized_at: Date | null }>("select categorized_at from tenders where id = $1", [pending]);
    assert.equal(row.rows[0]?.categorized_at, null);
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
    const row = (await pool.query<{ display_title_source: string; categorized_at: Date | null }>(
      "select display_title_source, categorized_at from tenders where id = $1",
      [visible],
    )).rows[0];
    assert.equal(row?.display_title_source, "rules");
    await classifyPendingInBackground("test");
    const after = await pool.query<{ categorized_at: Date | null }>("select categorized_at from tenders where id = $1", [visible]);
    assert.equal(after.rows[0]?.categorized_at, null);
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
});
