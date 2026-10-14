import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { dropTestDatabase } from "./drop-test-database";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations",
);

// W4's final SQL belongs to G. This fixture supplies only the catalog guarantees
// the C2 gate needs in a disposable database; it is never a production migration.
async function applyTestW4(owner: pg.Pool): Promise<void> {
  for (const table of [
    "company_tender_fits",
    "saved_tenders",
    "saved_searches",
    "notifications",
    "email_delivery_notifications",
    "recommendation_events",
    "recommendation_dismissals",
    "recommendation_interest_profiles",
    "user_recommendations",
  ]) {
    await owner.query(
      `alter table ${table} alter column workspace_id set not null`,
    );
  }
  for (const [table, oldName, newName, columns] of [
    [
      "saved_tenders",
      "saved_tenders_user_id_tender_id_pk",
      "saved_tenders_workspace_tender_pk",
      "workspace_id, tender_id",
    ],
    [
      "recommendation_dismissals",
      "recommendation_dismissals_user_id_tender_id_pk",
      "recommendation_dismissals_workspace_tender_pk",
      "workspace_id, tender_id",
    ],
    [
      "recommendation_interest_profiles",
      "recommendation_interest_profiles_pkey",
      "recommendation_interest_profiles_workspace_pk",
      "workspace_id",
    ],
    [
      "user_recommendations",
      "user_recommendations_user_id_tender_id_pk",
      "user_recommendations_workspace_tender_pk",
      "workspace_id, tender_id",
    ],
  ]) {
    await owner.query(
      `alter table ${table} drop constraint if exists ${oldName}`,
    );
    await owner.query(
      `alter table ${table} add constraint ${newName} primary key (${columns})`,
    );
  }
}

test(
  "C2 routes stay closed until all gates and isolate workspace data",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const name = `licita_ws_c2_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const url = (database: string) => {
      const parsed = new URL(process.env.PNCP_TEST_DATABASE_URL!);
      parsed.pathname = `/${database}`;
      parsed.searchParams.delete("options");
      return parsed.toString();
    };
    const admin = new pg.Client({ connectionString: url("postgres") });
    await admin.connect();
    await admin.query(`create database "${name}"`);
    const owner = new pg.Pool({ connectionString: url(name), max: 4 });
    await migrate(drizzle(owner), { migrationsFolder });

    process.env.DATABASE_URL = url(name);
    process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
    process.env.AUTH_DEV_LOGIN = "true";
    process.env.FEATURE_JOURNEYS = "procurement";
    process.env.SESSION_SECRET =
      "workspace-c2-integration-secret-at-least-32-characters";
    process.env.NODE_ENV = "test";
    process.env.LOG_LEVEL = "silent";
    delete process.env.BILLING_DEV_ENTITLED;
    for (const variable of [
      "RATE_LIMIT_AUTH_PER_MINUTE",
      "RATE_LIMIT_USER_PER_MINUTE",
      "RATE_LIMIT_WRITE_PER_MINUTE",
    ])
      process.env[variable] = "10000";

    const { pool } = await import("@workspace/db");
    const { default: app } = await import("../app");
    const { defaultWorkspaceId } = await import("./workspace-service");
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
      await owner.end();
      await dropTestDatabase(admin, name);
      await admin.end();
    });
    const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    const csrf = {
      Origin: "http://localhost:24252",
      "X-Requested-With": "licita-insight",
    };
    const request = (
      path: string,
      method = "GET",
      cookie?: string,
      payload?: unknown,
    ) =>
      fetch(`${endpoint}${path}`, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(payload === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(method === "GET" ? {} : csrf),
        },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    const login = async (label: string) => {
      const response = await request("/v1/auth/dev-login", "POST", undefined, {
        email: `${label}@example.test`,
        name: `TEST ${label}`,
      });
      assert.equal(response.status, 204);
      const cookie = response.headers.get("set-cookie")!.split(";", 1)[0]!;
      const session = await request("/v1/auth/session", "GET", cookie);
      const userId = ((await session.json()) as { user: { id: string } }).user
        .id;
      await owner.query(
        "insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')",
        [userId],
      );
      return { cookie, userId };
    };
    const a = await login("c2-a");
    const b = await login("c2-b");
    const state = (mode: string) =>
      owner.query(
        "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, false, 'teste', 'TEST')",
        [mode],
      );
    const code = async (response: Response) =>
      ((await response.json()) as { error: { code: string } }).error.code;
    const countRows = async () =>
      Number(
        (await owner.query("select count(*)::int as total from workspaces"))
          .rows[0].total,
      );
    const closedRoutes = [
      ["/v1/me/workspaces", "GET", undefined],
      ["/v1/me/workspaces", "POST", { type: "procurement", name: "Bloqueado" }],
      [`/v1/me/workspaces/${defaultWorkspaceId(a.userId)}`, "GET", undefined],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}`,
        "PATCH",
        { name: "Bloqueado" },
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/profile`,
        "PUT",
        {
          schemaVersion: 1,
          step: "objective",
          baseRevision: 0,
          answers: { selectedKeywords: ["obras"] },
        },
      ],
      [
        "/v1/me/active-workspace",
        "PUT",
        { workspaceId: defaultWorkspaceId(a.userId) },
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-opportunities`,
        "GET",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-opportunities/op-1`,
        "PUT",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-opportunities/op-1`,
        "DELETE",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-searches`,
        "GET",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-searches`,
        "POST",
        { name: "Bloqueado", query: "obras", alertsEnabled: false },
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-searches/search-1`,
        "PATCH",
        { name: "Bloqueado" },
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/saved-searches/search-1`,
        "DELETE",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/notifications`,
        "GET",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/notifications/read`,
        "PATCH",
        { all: true },
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/recommendations`,
        "GET",
        undefined,
      ],
      [
        `/v1/me/workspaces/${defaultWorkspaceId(a.userId)}/dashboard`,
        "GET",
        undefined,
      ],
    ] as const;
    const assertAllClosed = async () => {
      const before = await countRows();
      for (const [route, method, payload] of closedRoutes) {
        const response = await request(route, method, a.cookie, payload);
        assert.equal(response.status, 422, `${method} ${route}`);
        assert.equal(await code(response), "FEATURE_DISABLED");
      }
      assert.equal(await countRows(), before);
    };

    await t.test(
      "legacy blocks every new write and keeps the v1 response",
      async () => {
        await assertAllClosed();
        const v1 = await request("/v1/me/saved-searches", "GET", a.cookie);
        assert.equal(v1.status, 200);
        assert.deepEqual(await v1.json(), { data: [] });
        const universal = await request(
          `/v1/tenders/search?workspaceId=${defaultWorkspaceId(a.userId)}&facets=false`,
          "GET",
          a.cookie,
        );
        assert.equal(universal.status, 200);
        assert.equal(universal.headers.get("cache-control"), "no-store");
        assert.equal(
          ((await universal.json()) as { meta: { workspace: null } }).meta
            .workspace,
          null,
        );
      },
    );

    await state("workspaces");
    await t.test("mode alone without W4 blocks all new writes", async () => {
      await assertAllClosed();
      const universal = await request(
        `/v1/tenders/search?workspaceId=${defaultWorkspaceId(a.userId)}&facets=false`,
        "GET",
        a.cookie,
      );
      assert.equal(universal.status, 200);
      assert.equal(
        ((await universal.json()) as { meta: { workspace: null } }).meta
          .workspace,
        null,
      );
    });

    await applyTestW4(owner);
    const createdA = await request("/v1/me/workspaces", "POST", a.cookie, {
      type: "procurement",
      name: "Espaço A",
    });
    const createdB = await request("/v1/me/workspaces", "POST", b.cookie, {
      type: "procurement",
      name: "Espaço B",
    });
    assert.equal(createdA.status, 201);
    assert.equal(createdB.status, 201);
    const wsA = ((await createdA.json()) as { id: string }).id;
    const wsB = ((await createdB.json()) as { id: string }).id;
    const missing = `ws_${"f".repeat(32)}`;

    await t.test("a disabled journey remains closed after W4", async () => {
      const before = await countRows();
      const response = await request("/v1/me/workspaces", "POST", a.cookie, {
        type: "funding",
        name: "Fomento",
      });
      assert.equal(response.status, 422);
      assert.equal(await code(response), "FEATURE_DISABLED");
      assert.equal(await countRows(), before);
    });

    await t.test(
      "missing and foreign ids have the same 404 and cannot change B",
      async () => {
        const before = await owner.query(
          "select name, archived_at from workspaces where id = $1",
          [wsB],
        );
        for (const candidate of [missing, wsB]) {
          for (const [route, method, payload] of [
            [`/v1/me/workspaces/${candidate}`, "GET", undefined],
            [`/v1/me/workspaces/${candidate}`, "PATCH", { name: "Intrusão" }],
            [
              `/v1/me/workspaces/${candidate}/profile`,
              "PUT",
              {
                schemaVersion: 1,
                step: "objective",
                baseRevision: 0,
                answers: { selectedKeywords: ["intrusão"] },
              },
            ],
            [`/v1/me/workspaces/${candidate}/saved-searches`, "GET", undefined],
            [
              `/v1/me/workspaces/${candidate}/saved-opportunities`,
              "GET",
              undefined,
            ],
            [`/v1/me/workspaces/${candidate}/notifications`, "GET", undefined],
            [
              `/v1/me/workspaces/${candidate}/recommendations`,
              "GET",
              undefined,
            ],
            [`/v1/me/workspaces/${candidate}/dashboard`, "GET", undefined],
          ] as const) {
            const response = await request(route, method, a.cookie, payload);
            assert.equal(response.status, 404, `${method} ${route}`);
            assert.equal(await code(response), "WORKSPACE_NOT_FOUND");
          }
        }
        assert.deepEqual(
          (
            await owner.query(
              "select name, archived_at from workspaces where id = $1",
              [wsB],
            )
          ).rows,
          before.rows,
        );
        const active = await request(
          "/v1/me/active-workspace",
          "PUT",
          a.cookie,
          { workspaceId: wsB },
        );
        assert.equal(active.status, 404);
        assert.equal(await code(active), "WORKSPACE_NOT_FOUND");
        const unavailable = await request(
          `/v1/me/workspaces/${wsA}/saved-opportunities`,
          "GET",
          a.cookie,
        );
        assert.equal(unavailable.status, 422);
        assert.equal(await code(unavailable), "FEATURE_DISABLED");
      },
    );

    await t.test(
      "owned profile, saved searches and notifications stay in their workspace",
      async () => {
        const savedProfile = await request(
          `/v1/me/workspaces/${wsA}/profile`,
          "PUT",
          a.cookie,
          {
            schemaVersion: 1,
            step: "objective",
            baseRevision: 0,
            answers: { selectedKeywords: ["obras"] },
          },
        );
        assert.equal(savedProfile.status, 200);
        assert.equal(
          ((await savedProfile.json()) as { revision: number }).revision,
          1,
        );
        const stale = await request(
          `/v1/me/workspaces/${wsA}/profile`,
          "PUT",
          a.cookie,
          {
            schemaVersion: 1,
            step: "objective",
            baseRevision: 0,
            answers: { selectedKeywords: ["obras públicas"] },
          },
        );
        assert.equal(stale.status, 409);
        assert.equal(await code(stale), "PROFILE_VERSION_CONFLICT");
        const bSearch = await request(
          `/v1/me/workspaces/${wsB}/saved-searches`,
          "POST",
          b.cookie,
          { name: "Busca B", query: "q=cinema", alertsEnabled: false },
        );
        assert.equal(bSearch.status, 201);
        const bSearchId = ((await bSearch.json()) as { id: string }).id;
        const crossSearch = await request(
          `/v1/me/workspaces/${wsA}/saved-searches/${bSearchId}`,
          "PATCH",
          a.cookie,
          { name: "Intrusão" },
        );
        assert.equal(crossSearch.status, 404);
        assert.equal(await code(crossSearch), "WORKSPACE_NOT_FOUND");
        const aSearches = await request(
          `/v1/me/workspaces/${wsA}/saved-searches`,
          "GET",
          a.cookie,
        );
        assert.deepEqual(await aSearches.json(), { data: [] });
        const notificationId = randomUUID();
        await owner.query(
          "insert into notifications (id, user_id, workspace_id, type, dedupe_key) values ($1, $2, $3, 'test', $4)",
          [notificationId, b.userId, wsB, `test:${notificationId}`],
        );
        const crossRead = await request(
          `/v1/me/workspaces/${wsA}/notifications/read`,
          "PATCH",
          a.cookie,
          { ids: [notificationId] },
        );
        assert.equal(crossRead.status, 200);
        assert.equal(
          (
            await owner.query(
              "select read_at from notifications where id = $1",
              [notificationId],
            )
          ).rows[0].read_at,
          null,
        );
        const dashboard = await request(
          `/v1/me/workspaces/${wsA}/dashboard`,
          "GET",
          a.cookie,
        );
        assert.equal(dashboard.status, 200);
        assert.equal(
          JSON.stringify(await dashboard.json()).includes(notificationId),
          false,
        );
      },
    );

    await t.test(
      "read-only workspaces remain readable and selectable; archived workspaces remain readable",
      async () => {
        const second = await request("/v1/me/workspaces", "POST", a.cookie, {
          type: "procurement",
          name: "Segundo",
        });
        assert.equal(second.status, 201);
        const secondId = ((await second.json()) as { id: string }).id;
        await owner.query("delete from subscriptions where user_id = $1", [
          a.userId,
        ]);
        await owner.query(
          "update users set trial_ends_at = now() - interval '1 day' where id = $1",
          [a.userId],
        );
        const selected = await request(
          "/v1/me/active-workspace",
          "PUT",
          a.cookie,
          { workspaceId: secondId },
        );
        assert.equal(selected.status, 200);
        const detail = await request(
          `/v1/me/workspaces/${secondId}`,
          "GET",
          a.cookie,
        );
        assert.equal(detail.status, 200);
        assert.equal(
          ((await detail.json()) as { workspace: { accessMode: string } })
            .workspace.accessMode,
          "read_only",
        );
        const refused = await request(
          `/v1/me/workspaces/${secondId}`,
          "PATCH",
          a.cookie,
          { name: "Mudança" },
        );
        assert.equal(refused.status, 402);
        assert.equal(await code(refused), "WORKSPACE_READ_ONLY");
        await owner.query(
          "insert into subscriptions (user_id, status, current_period_end) values ($1, 'active', '2099-01-01T00:00:00Z')",
          [a.userId],
        );
        const archived = await request(
          `/v1/me/workspaces/${wsA}`,
          "PATCH",
          a.cookie,
          { archived: true },
        );
        assert.equal(archived.status, 200);
        const archiveDetail = await request(
          `/v1/me/workspaces/${wsA}`,
          "GET",
          a.cookie,
        );
        assert.equal(archiveDetail.status, 200);
        const archiveWrite = await request(
          `/v1/me/workspaces/${wsA}`,
          "PATCH",
          a.cookie,
          { name: "Intrusão" },
        );
        assert.equal(archiveWrite.status, 409);
        assert.equal(await code(archiveWrite), "WORKSPACE_ARCHIVED");
        const restored = await request(
          `/v1/me/workspaces/${wsA}`,
          "PATCH",
          a.cookie,
          { archived: false },
        );
        assert.equal(restored.status, 200);
      },
    );

    await t.test(
      "search workspaceId has 401, 400, identical universal 200 and owned context",
      async () => {
        const anonymous = await request(
          `/v1/tenders/search?workspaceId=${wsA}`,
        );
        assert.equal(anonymous.status, 401);
        const malformed = await request(
          "/v1/tenders/search?workspaceId=bad",
          "GET",
          a.cookie,
        );
        assert.equal(malformed.status, 400);
        const unavailable = await request(
          `/v1/tenders/search?workspaceId=${missing}&facets=false`,
          "GET",
          a.cookie,
        );
        const foreign = await request(
          `/v1/tenders/search?workspaceId=${wsB}&facets=false`,
          "GET",
          a.cookie,
        );
        assert.equal(unavailable.status, 200);
        assert.equal(foreign.status, 200);
        assert.equal(unavailable.headers.get("cache-control"), "no-store");
        assert.deepEqual(await unavailable.json(), await foreign.json());
        const owned = await request(
          `/v1/tenders/search?workspaceId=${wsA}&facets=false`,
          "GET",
          a.cookie,
        );
        assert.equal(owned.status, 200);
        assert.equal(owned.headers.get("cache-control"), "no-store");
        assert.equal(
          ((await owned.json()) as { meta: { workspace: { id: string } } }).meta
            .workspace.id,
          wsA,
        );
      },
    );
  },
);
