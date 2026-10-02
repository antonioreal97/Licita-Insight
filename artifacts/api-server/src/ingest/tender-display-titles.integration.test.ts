import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { normalizeText } from "../domain/normalize";

const databaseUrl = process.env.PNCP_TEST_DATABASE_URL;
if (databaseUrl && !process.env.DATABASE_URL) process.env.DATABASE_URL = databaseUrl;
const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));
after(async () => {
  if (databaseUrl) {
    const { pool } = await import("@workspace/db");
    await pool.end();
  }
});

const publication = (sequence: number, title: string) => ({
  numeroControlePNCP: `98765432000199-1-${String(sequence).padStart(6, "0")}/2026`,
  objetoCompra: title,
  processo: `K-${sequence}/2026`,
  numeroCompra: String(sequence),
  anoCompra: 2026,
  modalidadeId: 6,
  modalidadeNome: "Pregão eletrônico",
  situacaoCompraNome: "Divulgada no PNCP",
  dataPublicacaoPncp: "2026-10-01T09:00:00",
  dataEncerramentoProposta: "2026-10-20T17:00:00",
  valorTotalEstimado: 100,
  orcamentoSigilosoCodigo: 1,
  orgaoEntidade: { cnpj: "98765432000199", razaoSocial: "Prefeitura de Teste K" },
  unidadeOrgao: {
    nomeUnidade: "Compras",
    ufSigla: "SP",
    municipioNome: "São Paulo",
    codigoIbge: "3550308",
  },
});

const criteria = (query: string) => ({
  query,
  mode: "keyword" as const,
  status: [],
  modality: [],
  state: [],
  city: [],
  organizationId: [],
  sourceId: [],
  category: [],
  sort: "relevance" as const,
  page: 1,
  pageSize: 20,
  facets: false,
});

describe("títulos padronizados no PostgreSQL", { skip: !databaseUrl }, () => {
  it("insere, atualiza regras, preserva modelo/categorias e busca os campos derivados", async () => {
    const [{ db, tendersTable }, { upsertPublications }, { PostgresTenderRepository }] = await Promise.all([
      import("@workspace/db"),
      import("./upsert-tenders"),
      import("../repositories/postgres-tender-repository"),
    ]);
    const now = new Date("2026-10-02T12:00:00Z");
    const first = publication(910001, "[LICITANET] - AQUISIÇÃO DE MATERIAL DE LIMPEZA PARA UBS");
    const id = "98765432000199-1-910001-2026";
    await db.delete(tendersTable).where(eq(tendersTable.id, id));
    await upsertPublications([first], now);

    let [row] = await db.select().from(tendersTable).where(eq(tendersTable.id, id));
    assert.equal(row?.title, first.objetoCompra);
    assert.equal(row?.displayTitle, "Aquisição de material de limpeza para UBS");
    assert.equal(row?.displayTitleSource, "rules");
    assert.equal(row?.displayTitleVersion, 1);

    await upsertPublications([
      { ...first, objetoCompra: "CONTRATAÇÃO DE EMPRESA PARA FORNECIMENTO DE PRODUTOS DE HIGIENE" },
    ], new Date("2026-10-02T12:01:00Z"));
    [row] = await db.select().from(tendersTable).where(eq(tendersTable.id, id));
    assert.equal(row?.displayTitle, "Aquisição de produtos de higiene");

    const categories = [{ slug: "limpeza-higiene", label: "Limpeza, higiene e dedetização" }];
    await db.update(tendersTable).set({
      displayTitle: "Higienização padronizada de reservatórios",
      displayTitleSource: "model",
      displayTitleVersion: 77,
      displayTitleNorm: normalizeText("Higienização padronizada de reservatórios"),
      displayTitleNeedsModel: false,
      categories,
      categorySource: "teacher",
    }).where(eq(tendersTable.id, id));

    await upsertPublications([
      { ...first, objetoCompra: "AQUISIÇÃO DE OUTRO OBJETO OFICIAL" },
    ], new Date("2026-10-02T12:02:00Z"));
    [row] = await db.select().from(tendersTable).where(eq(tendersTable.id, id));
    assert.equal(row?.displayTitle, "Higienização padronizada de reservatórios");
    assert.equal(row?.displayTitleSource, "model");
    assert.equal(row?.displayTitleVersion, 77);
    assert.deepEqual(row?.categories, categories);
    assert.match(row?.searchText ?? "", /higienizacao padronizada/);
    assert.match(row?.searchText ?? "", /limpeza, higiene e dedetizacao/);

    const repository = new PostgresTenderRepository();
    const byDisplayTitle = await repository.search(criteria("higienização padronizada"));
    assert.equal(byDisplayTitle.data.some((tender) => tender.id === id), true);
    const byCategoryLabel = await repository.search(criteria("limpeza"));
    const dto = byCategoryLabel.data.find((tender) => tender.id === id);
    assert.equal(dto?.displayTitle, "Higienização padronizada de reservatórios");
    assert.equal(dto?.displayTitleSource, "model");
    assert.deepEqual(dto?.categories, categories);
    assert.equal(dto?.title, "AQUISIÇÃO DE OUTRO OBJETO OFICIAL");
    await db.delete(tendersTable).where(eq(tendersTable.id, id));
  });

  it("faz backfill retomável por cursor e ignora títulos de modelo", async () => {
    const [{ db, tendersTable }, { upsertPublications }] = await Promise.all([
      import("@workspace/db"),
      import("./upsert-tenders"),
    ]);
    const now = new Date("2026-10-02T13:00:00Z");
    const rows = [
      publication(920001, "[Portal de Compras Públicas] - AQUISIÇÃO DE EPI PARA UBS"),
      publication(920002, "SOLICITO A AQUISIÇÃO DE APARELHOS DE AR CONDICIONADO"),
      publication(920003, "CONTRATAÇÃO DE SERVIÇOS DE LIMPEZA"),
    ];
    await upsertPublications(rows, now);
    const ids = rows.map(({ numeroControlePNCP }) => numeroControlePNCP.replaceAll("/", "-"));
    await db.update(tendersTable).set({
      displayTitle: null,
      displayTitleSource: null,
      displayTitleVersion: null,
      displayTitleNorm: "",
    }).where(inArray(tendersTable.id, ids.slice(0, 2)));
    await db.update(tendersTable).set({
      displayTitle: "Título preservado pelo modelo",
      displayTitleSource: "model",
      displayTitleVersion: 1,
      displayTitleNorm: normalizeText("Título preservado pelo modelo"),
    }).where(eq(tendersTable.id, ids[2]));

    const run = (args: string[]) => spawnSync(
      "pnpm",
      ["--filter", "@workspace/api-server", "run", "backfill:display-titles", "--", ...args],
      { cwd: repoRoot, env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8" },
    );
    const dryRun = run(["--dry-run", "--batch", "1", "--limit", "1"]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /processed=1/);
    let [unchanged] = await db.select().from(tendersTable).where(eq(tendersTable.id, ids[0]));
    assert.equal(unchanged?.displayTitleSource, null);

    const first = run(["--batch", "1", "--limit", "1"]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /processed=1/);
    assert.match(first.stdout, new RegExp(`lastCursor=${ids[0]}`));

    let stored = await db.select().from(tendersTable).where(inArray(tendersTable.id, ids));
    assert.equal(stored.find(({ id }) => id === ids[0])?.displayTitleSource, "rules");
    assert.equal(stored.find(({ id }) => id === ids[1])?.displayTitleSource, null);

    const second = run(["--batch", "1", "--cursor", ids[0]]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /processed=1/);
    stored = await db.select().from(tendersTable).where(inArray(tendersTable.id, ids));
    assert.equal(stored.find(({ id }) => id === ids[1])?.displayTitleSource, "rules");
    assert.equal(stored.find(({ id }) => id === ids[2])?.displayTitle, "Título preservado pelo modelo");

    await db.delete(tendersTable).where(and(
      eq(tendersTable.organizationId, "pncp-98765432000199"),
      inArray(tendersTable.id, ids),
    ));
  });
});
