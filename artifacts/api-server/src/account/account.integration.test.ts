import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

// Opt-in: uses real Postgres in an isolated schema. The public schema must have
// the application migrations applied before PNCP_TEST_DATABASE_URL is set.
test(
  "Account API with PostgreSQL",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `account_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
    process.env.AUTH_DEV_LOGIN = "true";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";

    const {
      db,
      pool,
      notificationsTable,
      savedSearchesTable,
      sessionsTable,
      usersTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { default: app } = await import("../app");
    const { upsertPublications } = await import("../ingest/upsert-tenders");
    const {
      createDocumentAddedNotifications,
      evaluateSavedSearchNotifications,
    } = await import("./notification-service");

    await pool.query(`CREATE SCHEMA "${schema}"`);
    for (const table of [
      "tenders",
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

    const server: Server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const csrf = {
      Origin: "http://localhost:24252",
      "X-Requested-With": "licita-insight",
    };
    const request = (
      path: string,
      init: RequestInit = {},
      cookie?: string,
    ): Promise<Response> =>
      fetch(`${baseUrl}/api${path}`, {
        ...init,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          ...init.headers,
        },
      });
    const login = async (email: string): Promise<string> => {
      const response = await request("/v1/auth/dev-login", {
        method: "POST",
        headers: csrf,
        body: JSON.stringify({ email, name: "TEST USER" }),
      });
      assert.equal(response.status, 204);
      const setCookie = response.headers.get("set-cookie");
      assert.ok(setCookie);
      return setCookie.split(";", 1)[0]!;
    };
    const publication = (
      sequence: number,
      overrides: Record<string, unknown> = {},
    ) => ({
      numeroControlePNCP: `00394460000141-1-${String(sequence).padStart(6, "0")}/2026`,
      objetoCompra: "Aquisição de computadores para TEST DATA",
      numeroCompra: String(sequence),
      anoCompra: 2026,
      modalidadeId: 6,
      modalidadeNome: "Pregão - Eletrônico",
      situacaoCompraNome: "Divulgada no PNCP",
      dataPublicacaoPncp: "2026-09-20T09:00:00",
      dataEncerramentoProposta: "2026-10-30T17:00:00",
      dataAtualizacao: "2026-09-23T10:00:00",
      valorTotalEstimado: 100,
      orcamentoSigilosoCodigo: 1,
      orgaoEntidade: {
        cnpj: "00394460000141",
        razaoSocial: "Órgão de teste",
      },
      unidadeOrgao: {
        ufSigla: "DF",
        municipioNome: "Brasília",
      },
      ...overrides,
    });

    t.after(async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      await pool.end();
    });

    assert.equal(
      (
        await request("/v1/auth/dev-login", {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:24252",
            "X-Requested-With": "licita-insight",
          },
          body: JSON.stringify({ email: "csrf@example.test" }),
        })
      ).status,
      403,
    );

    const userACookie = await login("user-a@example.test");
    const userBCookie = await login("user-b@example.test");

    await t.test("expires and revokes sessions", async () => {
      const active = await request("/v1/auth/session", {}, userACookie);
      assert.equal(active.status, 200);

      const sessionId = userACookie.split("=", 2)[1]!;
      const { sha256 } = await import("../auth/tokens");
      await db
        .update(sessionsTable)
        .set({ expiresAt: new Date("2000-01-01T00:00:00Z") })
        .where(eq(sessionsTable.id, sha256(sessionId)));
      assert.equal(
        (await request("/v1/auth/session", {}, userACookie)).status,
        401,
      );

      const renewedCookie = await login("user-a@example.test");
      assert.equal(
        (
          await request(
            "/v1/auth/logout",
            { method: "POST", headers: csrf },
            renewedCookie,
          )
        ).status,
        204,
      );
      assert.equal(
        (await request("/v1/auth/session", {}, renewedCookie)).status,
        401,
      );
    });

    const authenticatedCookie = await login("user-a@example.test");
    const first = publication(123);
    await upsertPublications([first], new Date("2026-09-23T13:00:00Z"));
    const tenderId = "00394460000141-1-000123-2026";

    await t.test("preserves monitor state and isolates users", async () => {
      assert.equal(
        Number(
          (
            await pool.query("SELECT count(*) AS count FROM notifications")
          ).rows[0].count,
        ),
        0,
      );
      assert.equal(
        (
          await request(
            `/v1/me/saved-tenders/${tenderId}`,
            {
              method: "PUT",
              headers: csrf,
              body: JSON.stringify({ monitored: true }),
            },
            authenticatedCookie,
          )
        ).status,
        200,
      );
      const preserved = await request(
        `/v1/me/saved-tenders/${tenderId}`,
        { method: "PUT", headers: csrf, body: "{}" },
        authenticatedCookie,
      );
      assert.equal(preserved.status, 200);
      assert.equal(((await preserved.json()) as { monitored: boolean }).monitored, true);

      const idsForB = await request("/v1/me/saved-tenders/ids", {}, userBCookie);
      assert.deepEqual(await idsForB.json(), { saved: [], monitored: [] });
      assert.equal(
        (
          await request(
            "/v1/me/saved-tenders/does-not-exist",
            { method: "PUT", headers: csrf, body: "{}" },
            authenticatedCookie,
          )
        ).status,
        404,
      );
      const imported = await request(
        "/v1/me/saved-tenders/import",
        {
          method: "POST",
          headers: csrf,
          body: JSON.stringify({ ids: [tenderId, "does-not-exist"] }),
        },
        authenticatedCookie,
      );
      assert.deepEqual(await imported.json(), {
        imported: 0,
        alreadySaved: 1,
        notFound: ["does-not-exist"],
        skippedByLimit: 0,
      });
    });

    await t.test("creates idempotent tender-change notifications", async () => {
      const changed = publication(123, {
        situacaoCompraNome: "Suspensa",
        dataEncerramentoProposta: "2026-11-02T17:00:00",
        dataAtualizacao: "2026-09-23T11:00:00",
        valorTotalEstimado: 150,
      });
      await upsertPublications([changed], new Date("2026-09-23T14:00:00Z"));
      await upsertPublications([changed], new Date("2026-09-23T14:01:00Z"));

      const notifications = await request(
        "/v1/me/notifications?pageSize=50",
        {},
        authenticatedCookie,
      );
      const body = (await notifications.json()) as {
        data: { type: string; change: { field: string } }[];
      };
      assert.deepEqual(
        body.data.map(({ type, change }) => [type, change.field]).sort(),
        [
          ["tender_deadline_changed", "proposalDeadline"],
          ["tender_status_changed", "status"],
          ["tender_value_changed", "estimatedValue"],
        ].sort(),
      );

      await db.transaction((tx) =>
        createDocumentAddedNotifications(tx, {
          tender: {
            id: tenderId,
            title: "Aquisição de computadores para TEST DATA",
            tenderNumberShort: "123/2026",
          },
          previousCount: 1,
          nextCount: 2,
          addedDocumentIds: ["document-2"],
          detectedAt: new Date("2026-09-23T14:02:00Z"),
        }),
      );
      await db.transaction((tx) =>
        createDocumentAddedNotifications(tx, {
          tender: {
            id: tenderId,
            title: "Aquisição de computadores para TEST DATA",
            tenderNumberShort: "123/2026",
          },
          previousCount: 1,
          nextCount: 2,
          addedDocumentIds: ["document-2"],
          detectedAt: new Date("2026-09-23T14:03:00Z"),
        }),
      );
      const documentAlerts = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.type, "tender_document_added"));
      assert.equal(documentAlerts.length, 1);
    });

    await t.test("alerts only the owner about new saved-search matches", async () => {
      const savedResponse = await request(
        "/v1/me/saved-searches",
        {
          method: "POST",
          headers: csrf,
          body: JSON.stringify({
            name: "Computadores",
            query: "?q=computadores&page=2",
            alertsEnabled: true,
          }),
        },
        authenticatedCookie,
      );
      assert.equal(savedResponse.status, 201);
      const saved = (await savedResponse.json()) as { id: string; query: string };
      assert.equal(saved.query, "q=computadores");
      const duplicate = await request(
        "/v1/me/saved-searches",
        {
          method: "POST",
          headers: csrf,
          body: JSON.stringify({
            name: "Duplicada",
            query: "q=computadores&page=99",
            alertsEnabled: false,
          }),
        },
        authenticatedCookie,
      );
      assert.equal(duplicate.status, 409);
      assert.deepEqual(
        ((await duplicate.json()) as { error: { details: unknown } }).error.details,
        [{ field: "query", issue: "duplicate", existingId: saved.id }],
      );
      assert.equal(
        (
          await request(
            `/v1/me/saved-searches/${saved.id}`,
            {
              method: "PATCH",
              headers: csrf,
              body: JSON.stringify({ name: "Intrusão" }),
            },
            userBCookie,
          )
        ).status,
        403,
      );

      const [checkpoint] = await db
        .select({ lastCheckedAt: savedSearchesTable.lastCheckedAt })
        .from(savedSearchesTable)
        .where(eq(savedSearchesTable.id, saved.id));
      const createdAt = new Date(checkpoint!.lastCheckedAt!.getTime() + 1_000);
      await upsertPublications([publication(124)], createdAt);
      await pool.query(
        "UPDATE tenders SET created_at = $1 WHERE id = $2",
        [createdAt, "00394460000141-1-000124-2026"],
      );
      await evaluateSavedSearchNotifications(new Date(createdAt.getTime() + 1_000));

      const [updated] = await db
        .select()
        .from(savedSearchesTable)
        .where(eq(savedSearchesTable.id, saved.id));
      assert.equal(updated!.newMatchesCount, 1);
      const rows = await db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.type, "saved_search_new_matches"));
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.userId, updated!.userId);
      assert.deepEqual(rows[0]!.tenderIds, ["00394460000141-1-000124-2026"]);

      assert.equal(
        (
          await request(
            `/v1/me/saved-searches/${saved.id}`,
            { method: "DELETE", headers: csrf },
            authenticatedCookie,
          )
        ).status,
        204,
      );
      const restored = await request(
        `/v1/me/saved-searches/${saved.id}/restore`,
        { method: "POST", headers: csrf },
        authenticatedCookie,
      );
      assert.equal(restored.status, 200);
      const restoredBody = (await restored.json()) as {
        id: string;
        newMatchesCount: number;
      };
      assert.equal(restoredBody.id, saved.id);
      assert.equal(restoredBody.newMatchesCount, 0);

      assert.equal(
        (
          await request(
            `/v1/me/saved-searches/${saved.id}`,
            { method: "DELETE", headers: csrf },
            authenticatedCookie,
          )
        ).status,
        204,
      );
      await db
        .update(savedSearchesTable)
        .set({ deletedAt: new Date(Date.now() - 31_000) })
        .where(eq(savedSearchesTable.id, saved.id));
      assert.equal(
        (
          await request(
            `/v1/me/saved-searches/${saved.id}/restore`,
            { method: "POST", headers: csrf },
            authenticatedCookie,
          )
        ).status,
        409,
      );
    });

    await t.test("enforces limits and reports partial imports", async () => {
      await pool.query(`
        INSERT INTO tenders (
          id, pncp_control_number, title, organization_id, organization_name,
          modality, modality_label, status, estimated_value_status, source_id,
          source_name, search_text, title_norm, object_norm, items_norm,
          organization_norm, other_norm, raw_payload, fetched_at
        )
        SELECT
          'limit-' || value,
          'TEST-LIMIT-' || value,
          'TEST DATA ' || value,
          'test-org',
          'TEST DATA',
          'other',
          'Outra',
          'open',
          'not_published',
          'test',
          'TEST DATA',
          'test data',
          'test data',
          '',
          '',
          'test data',
          '',
          '{}'::jsonb,
          now()
        FROM generate_series(1, 500) AS value
      `);
      assert.equal(
        (
          await request(
            `/v1/me/saved-tenders/${tenderId}`,
            { method: "PUT", headers: csrf, body: "{}" },
            userBCookie,
          )
        ).status,
        200,
      );
      const ids = Array.from({ length: 500 }, (_, index) => `limit-${index + 1}`);
      const imported = await request(
        "/v1/me/saved-tenders/import",
        {
          method: "POST",
          headers: csrf,
          body: JSON.stringify({ ids }),
        },
        userBCookie,
      );
      assert.deepEqual(await imported.json(), {
        imported: 499,
        alreadySaved: 0,
        notFound: [],
        skippedByLimit: 1,
      });
      assert.equal(
        (
          await request(
            "/v1/me/saved-tenders/limit-500",
            { method: "PUT", headers: csrf, body: "{}" },
            userBCookie,
          )
        ).status,
        409,
      );

      const [userB] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, "user-b@example.test"));
      await db.insert(savedSearchesTable).values(
        Array.from({ length: 50 }, (_, index) => ({
          id: `limit-search-${index}`,
          userId: userB!.id,
          name: `TEST SEARCH ${index}`,
          query: `q=test-${index}`,
        })),
      );
      assert.equal(
        (
          await request(
            "/v1/me/saved-searches",
            {
              method: "POST",
              headers: csrf,
              body: JSON.stringify({
                name: "Excedente",
                query: "q=test",
                alertsEnabled: false,
              }),
            },
            userBCookie,
          )
        ).status,
        409,
      );
    });
  },
);
