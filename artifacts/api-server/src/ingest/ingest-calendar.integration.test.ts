import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { addDays, saoPauloToday } from "./ingest-calendar";
import { PNCP_UFS } from "./pncp-client";
import type { CollectOptions } from "./collect-pncp";

// Opt-in: uses real Postgres in an isolated schema and controlled PNCP responses.
// The public schema must already contain the application's tables.
test(
  "PNCP calendar with PostgreSQL and HTTP status endpoint",
  {
    skip: !process.env.PNCP_TEST_DATABASE_URL,
  },
  async (t) => {
    const schema = `pncp_calendar_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "silent";
    process.env.PNCP_REQUEST_DELAY_MS = "0";
    process.env.PNCP_LOOKBACK_DAYS = "2";
    process.env.PNCP_MODALITIES = "6";
    process.env.PNCP_UF = "DF";
    delete process.env.PNCP_FROM;
    delete process.env.PNCP_TO;

    const { pool } = await import("@workspace/db");
    const {
      startPncpIngest,
      getLatestIngest,
      abandonStalePncpRuns,
      collectOptionsFromEnv,
      collectOptionsFromBody,
    } = await import("./collect-pncp");
    const { upsertPublications } = await import("./upsert-tenders");
    const originalFetch = globalThis.fetch;
    const calls: URL[] = [];
    let response: (url: URL) => Response = () =>
      Response.json({ data: [], totalPaginas: 0 });
    globalThis.fetch = async (input, init) => {
      const requested = new URL(
        input instanceof Request ? input.url : input.toString(),
      );
      if (requested.hostname !== "pncp.gov.br")
        return originalFetch(input, init);
      calls.push(requested);
      return response(requested);
    };
    await pool.query(`CREATE SCHEMA "${schema}"`);
    t.after(async () => {
      globalThis.fetch = originalFetch;
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    });
    for (const table of [
      "tenders",
      "ingest_runs",
      "ingest_days",
      "users",
      "sessions",
      "saved_tenders",
      "saved_searches",
      "notifications",
    ]) {
      await pool.query(
        `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
      );
    }

    const today = saoPauloToday();
    const yesterday = addDays(today, -1);
    const options: CollectOptions = {
      from: yesterday,
      to: yesterday,
      modalities: [6],
      uf: "DF",
      pageSize: 50,
      refreshLimit: 0,
      force: false,
    };
    const publication = (sequence = 123) => ({
      numeroControlePNCP: `00394460000141-1-${String(sequence).padStart(6, "0")}/2026`,
      objetoCompra: "Aquisição de equipamentos de informática",
      modalidadeId: 6,
      modalidadeNome: "Pregão - Eletrônico",
      situacaoCompraNome: "Divulgada no PNCP",
      dataPublicacaoPncp: `${yesterday}T09:00:00`,
      dataEncerramentoProposta: `${addDays(today, 10)}T17:00:00`,
      orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
      unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    });
    const count = async () =>
      Number(
        (await pool.query("SELECT count(*) AS count FROM tenders")).rows[0]
          .count,
      );
    const run = async (overrides: Partial<CollectOptions> = {}) => {
      const { runId } = await startPncpIngest({ ...options, ...overrides });
      for (let attempt = 0; attempt < 500; attempt++) {
        const latest = await getLatestIngest();
        if (latest.run?.id === runId && latest.run.status !== "running")
          return latest;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Test ingest did not finish");
    };
    const reset = async () => {
      await pool.query("TRUNCATE ingest_days, ingest_runs, tenders");
      calls.length = 0;
    };

    await t.test(
      "abandons a running ingest after its heartbeat expires",
      async () => {
        await reset();
        const now = new Date("2026-09-22T20:30:00Z");
        await pool.query(
          `INSERT INTO ingest_runs
            (id, source, status, window_from, window_to, started_at, heartbeat_at)
           VALUES ($1, 'pncp', 'running', $2, $2, $3, $3)`,
          ["stale-test-run", "2026-09-22T03:00:00Z", "2026-09-22T20:00:00Z"],
        );

        assert.equal(await abandonStalePncpRuns(now), 1);
        const stale = (
          await pool.query(
            "SELECT status, error, finished_at FROM ingest_runs WHERE id = $1",
            ["stale-test-run"],
          )
        ).rows[0];
        assert.equal(stale.status, "failed");
        assert.match(stale.error, /heartbeat/);
        assert.equal(
          new Date(stale.finished_at).toISOString(),
          now.toISOString(),
        );
      },
    );

    await t.test(
      "explicit dates force backfills while days/lookback remain incremental",
      () => {
        assert.equal(collectOptionsFromEnv({}).force, false);
        assert.equal(
          collectOptionsFromEnv({ PNCP_FROM: yesterday }).force,
          true,
        );
        assert.equal(collectOptionsFromEnv({ PNCP_TO: yesterday }).force, true);
        assert.equal(collectOptionsFromBody({ days: 2 }).force, false);
        assert.equal(
          collectOptionsFromBody({ from: yesterday, to: yesterday }).force,
          true,
        );
        assert.throws(
          () => collectOptionsFromBody({ from: "2026-02-30" }),
          /valid calendar dates/,
        );
      },
    );

    await t.test(
      "second run makes zero publication calls and does not duplicate tenders; backfill re-reads",
      async () => {
        response = () =>
          Response.json({ data: [publication()], totalPaginas: 2 });
        const first = await run();
        assert.equal(first.run?.status, "succeeded");
        assert.equal(first.run.pagesRead, 2);
        assert.equal(calls.length, 2);
        assert.equal(await count(), 1);
        calls.length = 0;
        const second = await run();
        assert.equal(second.run?.status, "succeeded");
        assert.equal(second.run.pagesRead, 0);
        assert.equal(calls.length, 0);
        assert.equal(await count(), 1);
        assert.deepEqual(second.coverage.sealedDays, [yesterday]);
        assert.equal(second.coverage.nextOpenDay, today);
        assert.equal((await run({ force: true })).run?.pagesRead, 2);
        assert.equal(await count(), 1);
      },
    );

    await t.test(
      "GET /api/v1/ingest/pncp includes coverage and the latest run",
      async () => {
        const { default: app } = await import("../app");
        const server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        try {
          const address = server.address();
          assert.ok(address && typeof address !== "string");
          const result = await originalFetch(
            `http://127.0.0.1:${address.port}/api/v1/ingest/pncp`,
          );
          assert.equal(result.status, 200);
          const body = (await result.json()) as {
            coverage: { sealedDays: string[]; nextOpenDay: string | null };
            run: { status: string };
          };
          assert.deepEqual(body.coverage.sealedDays, [yesterday]);
          assert.equal(body.coverage.nextOpenDay, today);
          assert.equal(body.run.status, "succeeded");
        } finally {
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
        }
      },
    );

    await t.test(
      "today is re-read; yesterday collected before midnight needs a final pass",
      async () => {
        await reset();
        response = () => Response.json({ data: [], totalPaginas: 0 });
        await run({ from: today, to: today });
        calls.length = 0;
        assert.equal((await run({ from: today, to: today })).run?.pagesRead, 1);
        assert.equal(calls.length, 1);
        await pool.query("UPDATE ingest_days SET day = $1, started_at = $2", [
          yesterday,
          `${yesterday}T23:59:00-03:00`,
        ]);
        assert.equal((await run()).run?.pagesRead, 1);
        assert.equal((await run()).run?.pagesRead, 0);
      },
    );

    await t.test(
      "a failed page leaves pending coverage and retries from page one",
      async () => {
        await reset();
        response = (url) =>
          url.searchParams.get("pagina") === "2"
            ? new Response("test failure", { status: 400 })
            : Response.json({ data: [publication()], totalPaginas: 2 });
        assert.equal((await run()).run?.status, "failed");
        const pending = (await pool.query("SELECT * FROM ingest_days")).rows[0];
        assert.equal(pending.status, "pending");
        assert.equal(pending.completed_at, null);
        assert.equal(pending.pages_read, 1);
        calls.length = 0;
        response = () =>
          Response.json({ data: [publication()], totalPaginas: 2 });
        assert.equal((await run()).run?.status, "succeeded");
        assert.deepEqual(
          calls.map((url) => url.searchParams.get("pagina")),
          ["1", "2"],
        );
        assert.equal(await count(), 1);
      },
    );

    await t.test(
      "national timeout resumes only missing UFs and seals after all 27",
      async () => {
        await reset();
        response = (url) => {
          const uf = url.searchParams.get("uf");
          if (!uf) return new Response("timeout", { status: 408 });
          if (uf === "AL") return new Response("test failure", { status: 400 });
          return Response.json({ data: [], totalPaginas: 0 });
        };
        assert.equal((await run({ uf: undefined })).run?.status, "failed");
        assert.deepEqual(
          calls.map((url) => url.searchParams.get("uf")),
          [null, "AC", "AL"],
        );
        calls.length = 0;
        response = () => Response.json({ data: [], totalPaginas: 0 });
        assert.equal((await run({ uf: undefined })).run?.status, "succeeded");
        assert.deepEqual(
          calls.map((url) => url.searchParams.get("uf")),
          PNCP_UFS.filter((uf) => uf !== "AC"),
        );
        calls.length = 0;
        assert.equal((await run({ uf: undefined })).run?.pagesRead, 0);
        assert.equal(calls.length, 0);
        // A failed forced national backfill must invalidate old UF coverage.
        response = () => new Response("test failure", { status: 400 });
        assert.equal(
          (await run({ uf: undefined, force: true })).run?.status,
          "failed",
        );
        calls.length = 0;
        response = () => Response.json({ data: [], totalPaginas: 0 });
        assert.equal((await run({ uf: undefined })).run?.pagesRead, 27);
        assert.equal(calls.length, 27);
      },
    );

    await t.test(
      "refreshes oldest open/review/suspended tenders individually with a rotating limit",
      async () => {
        await reset();
        response = () => Response.json({ data: [], totalPaginas: 0 });
        await run(); // Seal the publication day before inserting old tracked tenders.
        for (let i = 0; i < 4; i++) {
          await upsertPublications(
            [publication(123 + i)],
            new Date(`2026-01-0${i + 1}T12:00:00Z`),
          );
          await pool.query(
            "UPDATE tenders SET status = $1 WHERE pncp_control_number = $2",
            [
              ["open", "under_review", "suspended", "closed"][i],
              publication(123 + i).numeroControlePNCP,
            ],
          );
        }
        calls.length = 0;
        response = (url) =>
          /\/(itens|arquivos)$/.test(url.pathname)
            ? Response.json([])
            : Response.json(
                publication(Number(url.pathname.split("/").at(-1))),
              );
        const first = await run({ refreshLimit: 2 });
        assert.equal(first.run?.refreshed, 2);
        assert.equal(first.run.refreshErrors, 0);
        assert.equal(first.run.pagesRead, 0);
        assert.equal(calls.length, 6); // Compra, items and files for each tender.
        assert.ok(calls.every((url) => !url.pathname.includes("publicacao")));
        calls.length = 0;
        assert.equal((await run({ refreshLimit: 1 })).run?.refreshed, 1);
        assert.ok(calls[0].pathname.endsWith("/125"));
        assert.equal(await count(), 4); // Closed tender is retained and never refreshed.
        assert.equal(
          (
            await pool.query(
              "SELECT status FROM tenders WHERE pncp_control_number = $1",
              [publication(126).numeroControlePNCP],
            )
          ).rows[0].status,
          "closed",
        );
        calls.length = 0;
        assert.equal((await run({ refreshLimit: 0 })).run?.refreshed, 0);
        assert.equal(calls.length, 0);
      },
    );

    await t.test(
      "an empty items/files answer never erases stored PNCP details",
      async () => {
        await reset();
        const { enrichTenderById } = await import("./enrich-tender");
        await upsertPublications(
          [publication(130)],
          new Date("2026-01-05T12:00:00Z"),
        );
        const { rows } = await pool.query<{ id: string }>(
          "SELECT id FROM tenders WHERE pncp_control_number = $1",
          [publication(130).numeroControlePNCP],
        );
        const tenderId = rows[0].id;
        const documentsOf = async () =>
          (
            await pool.query<{ documents: { id: string }[] }>(
              "SELECT documents FROM tenders WHERE id = $1",
              [tenderId],
            )
          ).rows[0].documents;
        const stored = [
          {
            id: "1",
            name: "Edital",
            type: "Edital",
            sizeBytes: null,
            url: "https://pncp.gov.br/pncp-api/v1/stored/1",
            publishedAt: null,
          },
        ];
        await pool.query("UPDATE tenders SET documents = $1::jsonb WHERE id = $2", [
          JSON.stringify(stored),
          tenderId,
        ]);

        response = () => Response.json([]);
        await enrichTenderById(tenderId);
        assert.deepEqual(await documentsOf(), stored);

        response = (url) =>
          url.pathname.endsWith("/arquivos")
            ? Response.json([
                {
                  sequencialDocumento: 2,
                  titulo: "Edital retificado",
                  tipoDocumentoNome: "Edital",
                  url: "https://pncp.gov.br/pncp-api/v1/fresh/2",
                },
              ])
            : Response.json([]);
        await enrichTenderById(tenderId);
        assert.deepEqual(
          (await documentsOf()).map(({ id }) => id),
          ["2"],
        );
      },
    );
  },
);
