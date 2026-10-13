import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
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
const CLIENT_ID = "test-client.apps.googleusercontent.com";

// Opt-in: creates and drops its own database next to PNCP_TEST_DATABASE_URL, so the cutover flag is its own.
test("account creation in legacy and workspaces modes", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const databaseName = `licita_ws_d5_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const databaseUrl = (name: string): string => {
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.pathname = `/${name}`;
    url.searchParams.delete("options");
    return url.toString();
  };
  const admin = new pg.Client({ connectionString: databaseUrl("postgres") });
  await admin.connect();
  await admin.query(`create database "${databaseName}"`);
  const owner = new pg.Pool({ connectionString: databaseUrl(databaseName), max: 4 });
  await migrate(drizzle(owner), { migrationsFolder });

  process.env.DATABASE_URL = databaseUrl(databaseName);
  process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
  process.env.AUTH_DEV_LOGIN = "true";
  process.env.SESSION_SECRET = "workspace-d5-integration-secret-at-least-32-characters";
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  for (const name of ["RATE_LIMIT_AUTH_PER_MINUTE", "RATE_LIMIT_USER_PER_MINUTE", "RATE_LIMIT_WRITE_PER_MINUTE"]) {
    process.env[name] = "10000";
  }
  for (const name of ["BILLING_MONTHLY_BRL", "BILLING_DEV_ENTITLED", "RESEND_API_KEY", "JEV_API_KEY", "OPENAI_API_KEY"]) {
    delete process.env[name];
  }

  const { pool } = await import("@workspace/db");
  const { default: app } = await import("../app");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { DEFAULT_WORKSPACE_NAME, defaultWorkspaceId } = await import("./workspace-service");

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  /**
   * Google, played locally: the token endpoint answers an id_token for the identity carried in the `code`, signed by
   * a key the certificates endpoint publishes. Nothing but the API under test is reached over the network.
   */
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    if (url === "https://www.googleapis.com/oauth2/v3/certs") {
      return Response.json({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key" }] });
    }
    if (url === "https://oauth2.googleapis.com/token") {
      const claims = JSON.parse(Buffer.from(new URLSearchParams(String(init?.body)).get("code")!, "base64url").toString());
      const signed = `${encode({ alg: "RS256", kid: "test-key" })}.${encode({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 600,
        email_verified: true,
        ...claims,
      })}`;
      return Response.json({ id_token: `${signed}.${sign("RSA-SHA256", Buffer.from(signed), privateKey).toString("base64url")}` });
    }
    throw new Error(`Unexpected outbound request to ${url}`);
  };

  t.after(async () => {
    globalThis.fetch = realFetch;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
    await owner.end();
    await dropTestDatabase(admin, databaseName);
    await admin.end();
  });

  const csrf = { Origin: "http://localhost:24252", "X-Requested-With": "licita-insight" };
  const request = (path: string, init: RequestInit = {}, cookie?: string): Promise<Response> =>
    fetch(`${baseUrl}/api${path}`, {
      redirect: "manual",
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
    });
  const cookieOf = (response: Response, name: string): string | null =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0]!)
      .find((value) => value.startsWith(`${name}=`) && value.length > name.length + 1) ?? null;
  /** The whole OAuth round trip: start, then the callback Google would redirect to. */
  const googleLogin = async (identity: { sub: string; email: string }) => {
    const start = await request("/v1/auth/google/start");
    assert.equal(start.status, 302);
    const authorization = new URL(start.headers.get("location")!);
    const code = encode({ ...identity, name: "TEST USER", nonce: authorization.searchParams.get("nonce") });
    const callback = await request(
      `/v1/auth/google/callback?state=${authorization.searchParams.get("state")}&code=${code}`,
      {},
      cookieOf(start, "licita_oauth")!,
    );
    assert.equal(callback.status, 302);
    return { location: callback.headers.get("location")!, session: cookieOf(callback, "licita_session") };
  };
  const devLogin = async (email: string) => {
    const response = await request("/v1/auth/dev-login", {
      method: "POST",
      headers: csrf,
      body: JSON.stringify({ email, name: "TEST USER" }),
    });
    return { response, session: cookieOf(response, "licita_session") };
  };
  const setState = (mode: "legacy" | "workspaces", writesPaused: boolean) =>
    owner.query(
      "insert into workspace_cutover_events (mode, writes_paused, actor, reason) values ($1, $2, 'teste', 'TEST')",
      [mode, writesPaused],
    );
  /** The account and everything a default workspace is made of, as stored. */
  const account = async (email: string) => {
    const users = await owner.query("select id, google_sub, trial_ends_at from users where email = $1", [email]);
    const ids = users.rows.map((row) => row.id);
    const rows = async (text: string) => (await owner.query(text, [ids])).rows;
    return {
      users: users.rows,
      workspaces: await rows('select id, type, name, owner_user_id, limit_slot, is_default, onboarding_status, archived_at from workspaces where owner_user_id = any($1::text[])'),
      members: await rows("select workspace_id, user_id, role, last_selected_at is not null as selected from workspace_members where user_id = any($1::text[])"),
      preferences: await rows("select user_id, active_workspace_id from user_workspace_preferences where user_id = any($1::text[])"),
    };
  };
  const assertBornWithDefaultWorkspace = async (email: string) => {
    const stored = await account(email);
    assert.equal(stored.users.length, 1);
    const userId = stored.users[0].id as string;
    const workspaceId = defaultWorkspaceId(userId);
    assert.deepEqual(stored.workspaces, [
      {
        id: workspaceId,
        type: "procurement",
        name: DEFAULT_WORKSPACE_NAME,
        owner_user_id: userId,
        limit_slot: 1,
        is_default: true,
        onboarding_status: "not_started",
        archived_at: null,
      },
    ]);
    assert.deepEqual(stored.members, [{ workspace_id: workspaceId, user_id: userId, role: "owner", selected: true }]);
    assert.deepEqual(stored.preferences, [{ user_id: userId, active_workspace_id: workspaceId }]);
    return { userId, workspaceId };
  };
  const totals = async () =>
    (
      await owner.query(
        `select (select count(*)::int from users) as users, (select count(*)::int from workspaces) as workspaces,
           (select count(*)::int from workspace_members) as members,
           (select count(*)::int from user_workspace_preferences) as preferences,
           (select count(*)::int from google_trial_tombstones) as tombstones`,
      )
    ).rows[0];

  await upsertPublications(
    [
      {
        numeroControlePNCP: "00394460000141-1-000001/2026",
        objetoCompra: "Aquisição de computadores para TEST DATA",
        numeroCompra: "1",
        anoCompra: 2026,
        modalidadeId: 6,
        modalidadeNome: "Pregão - Eletrônico",
        situacaoCompraNome: "Divulgada no PNCP",
        dataPublicacaoPncp: "2026-09-20T09:00:00",
        dataEncerramentoProposta: "2099-10-30T17:00:00",
        dataAtualizacao: "2026-09-23T10:00:00",
        valorTotalEstimado: 100,
        orcamentoSigilosoCodigo: 1,
        orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
        unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
      },
    ],
    new Date(),
  );
  const tenderId = "00394460000141-1-000001-2026";
  const appHome = "http://localhost:24252/dashboard";

  await t.test("legacy: a new account is only the user, as today", async () => {
    const google = await googleLogin({ sub: "sub-legacy", email: "d5-legacy-google@example.test" });
    assert.ok(google.session, "signed in");
    assert.ok(google.location.startsWith("http://localhost:24252/"));
    assert.equal((await devLogin("d5-legacy-dev@example.test")).response.status, 204);
    for (const email of ["d5-legacy-google@example.test", "d5-legacy-dev@example.test"]) {
      const stored = await account(email);
      assert.equal(stored.users.length, 1);
      assert.deepEqual([stored.workspaces, stored.members, stored.preferences], [[], [], []]);
    }
    assert.equal((await request("/v1/me/saved-tenders/ids", {}, google.session!)).status, 200);
  });

  await t.test("workspaces: a new account is born with its default workspace and the v1 routes work at once", async () => {
    await setState("workspaces", false);
    const google = await googleLogin({ sub: "sub-workspaces", email: "d5-workspaces-google@example.test" });
    assert.ok(google.session);
    assert.equal(google.location, appHome);
    const { userId, workspaceId } = await assertBornWithDefaultWorkspace("d5-workspaces-google@example.test");

    const reads = ["/v1/me/saved-tenders/ids", "/v1/me/saved-searches", "/v1/me/notifications", "/v1/recommendations", "/v1/me/company-profile"];
    for (const path of reads) assert.equal((await request(path, {}, google.session!)).status, 200, path);
    const saved = await request(`/v1/me/saved-tenders/${tenderId}`, { method: "PUT", headers: csrf, body: "{}" }, google.session!);
    assert.equal(saved.status, 200);
    assert.deepEqual(
      (await owner.query("select workspace_id from saved_tenders where user_id = $1", [userId])).rows,
      [{ workspace_id: workspaceId }],
    );

    const dev = await devLogin("d5-workspaces-dev@example.test");
    assert.equal(dev.response.status, 204);
    await assertBornWithDefaultWorkspace("d5-workspaces-dev@example.test");
    assert.equal((await request("/v1/me/saved-tenders/ids", {}, dev.session!)).status, 200);

    // Signing in again creates nothing.
    const before = await totals();
    assert.ok((await googleLogin({ sub: "sub-workspaces", email: "d5-workspaces-google@example.test" })).session);
    assert.equal((await devLogin("d5-workspaces-dev@example.test")).response.status, 204);
    assert.deepEqual(await totals(), before);
  });

  await t.test("workspaces: an account created in legacy keeps signing in and gets no workspace from the login", async () => {
    assert.ok((await googleLogin({ sub: "sub-legacy", email: "d5-legacy-google@example.test" })).session);
    assert.equal((await devLogin("d5-legacy-dev@example.test")).response.status, 204);
    assert.deepEqual((await account("d5-legacy-google@example.test")).workspaces, [], "the cutover delta assigns it, not the login");
  });

  await t.test("two first logins of the same new account at once leave one account and one default workspace", async () => {
    const email = "d5-race-google@example.test";
    const logins = await Promise.all([googleLogin({ sub: "sub-race", email }), googleLogin({ sub: "sub-race", email })]);
    const signedIn = logins.filter(({ session }) => session);
    assert.ok(signedIn.length >= 1, "at least one login gets in");
    for (const login of logins) {
      assert.ok(login.session ? login.location === appHome : login.location === "/login?error=oauth_failed", login.location);
    }
    await assertBornWithDefaultWorkspace(email);
    assert.ok((await googleLogin({ sub: "sub-race", email })).session, "whoever lost the race signs in on the next try");

    const devEmail = "d5-race-dev@example.test";
    const devLogins = await Promise.all([devLogin(devEmail), devLogin(devEmail), devLogin(devEmail)]);
    assert.deepEqual(devLogins.map(({ response }) => response.status), [204, 204, 204]);
    await assertBornWithDefaultWorkspace(devEmail);
  });

  await t.test("paused writes: a new account is refused with nothing created; existing accounts still sign in", async () => {
    for (const mode of ["workspaces", "legacy"] as const) {
      await setState(mode, true);
      const before = await totals();

      const google = await googleLogin({ sub: `sub-paused-${mode}`, email: `d5-paused-${mode}-google@example.test` });
      assert.equal(google.location, "/login?error=maintenance");
      assert.equal(google.session, null);
      const dev = await devLogin(`d5-paused-${mode}-dev@example.test`);
      assert.equal(dev.response.status, 503);
      assert.equal(dev.response.headers.get("retry-after"), "60");
      assert.equal(((await dev.response.json()) as any).error.code, "MAINTENANCE_IN_PROGRESS");
      assert.equal(dev.session, null);
      assert.deepEqual(await totals(), before, "no user, workspace, membership, preference or trial tombstone left behind");

      const returning = await googleLogin({ sub: "sub-workspaces", email: "d5-workspaces-google@example.test" });
      assert.equal(returning.location, appHome);
      assert.ok(returning.session);
      assert.equal((await request("/v1/auth/session", {}, returning.session!)).status, 200);
      assert.equal((await devLogin("d5-workspaces-dev@example.test")).response.status, 204);
      assert.deepEqual(await totals(), before);

      // After the pause the same person tries again and gets the account.
      await setState(mode, false);
      const retried = await googleLogin({ sub: `sub-paused-${mode}`, email: `d5-paused-${mode}-google@example.test` });
      assert.ok(retried.session);
      const stored = await account(`d5-paused-${mode}-google@example.test`);
      assert.equal(stored.users.length, 1);
      assert.equal(stored.workspaces.length, mode === "workspaces" ? 1 : 0);
    }
    await setState("workspaces", false);
  });

  await t.test("an account recreated after its deletion follows the same rules and keeps its trial end", async () => {
    const identity = { sub: "sub-recreated", email: "d5-recreated@example.test" };
    const first = await googleLogin(identity);
    const original = await assertBornWithDefaultWorkspace(identity.email);
    const trialEndsAt = (await account(identity.email)).users[0].trial_ends_at as Date;

    const deleted = await request("/v1/me", { method: "DELETE", headers: csrf, body: JSON.stringify({ confirm: "EXCLUIR" }) }, first.session!);
    assert.equal(deleted.status, 204);
    assert.deepEqual(await account(identity.email), { users: [], workspaces: [], members: [], preferences: [] });
    assert.equal((await owner.query("select count(*)::int as count from workspaces where id = $1", [original.workspaceId])).rows[0].count, 0);

    assert.ok((await googleLogin(identity)).session);
    const recreated = await assertBornWithDefaultWorkspace(identity.email);
    assert.notEqual(recreated.userId, original.userId);
    assert.notEqual(recreated.workspaceId, original.workspaceId, "the id follows the new user id");
    assert.deepEqual((await account(identity.email)).users[0].trial_ends_at, trialEndsAt, "the trial is not renewed");
  });
});
