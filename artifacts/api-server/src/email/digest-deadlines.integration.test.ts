import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { EmailMessage } from "./resend-client";

// Opt-in: uses real Postgres in an isolated schema. The public schema must have
// the application migrations applied before PNCP_TEST_DATABASE_URL is set.
test("Daily digest deadlines with PostgreSQL", { skip: !process.env.PNCP_TEST_DATABASE_URL }, async (t) => {
  const schema = `digest_deadlines_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.PUBLIC_APP_ORIGIN = "http://localhost:24252";
  process.env.SESSION_SECRET = "digest-deadlines-secret-at-least-32-characters";
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
  delete process.env.BILLING_MONTHLY_BRL;
  delete process.env.BILLING_DEV_ENTITLED;

  const {
    betaAccessGrantsTable,
    db,
    emailDeliveriesTable,
    emailDeliveryNotificationsTable,
    notificationsTable,
    pool,
    savedTendersTable,
    subscriptionsTable,
    tendersTable,
    usersTable,
  } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { upsertPublications } = await import("../ingest/upsert-tenders");
  const { runDailyEmailDigest } = await import("./email-service");

  await pool.query(`CREATE SCHEMA "${schema}"`);
  for (const table of [
    "tenders",
    "users",
    "saved_tenders",
    "notifications",
    "subscriptions",
    "email_deliveries",
    "email_delivery_notifications",
  ]) {
    await pool.query(`CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`);
  }
  await pool.query(
    readFileSync(new URL("../../../../lib/db/migrations/0018_beta_access.sql", import.meta.url), "utf8"),
  );
  const participationColumn = await pool.query(
    "select 1 from information_schema.columns where table_schema = $1 and table_name = 'saved_tenders' and column_name = 'stage'",
    [schema],
  );
  if (participationColumn.rowCount === 0) {
    await pool.query(
      readFileSync(new URL("../../../../lib/db/migrations/0019_participation.sql", import.meta.url), "utf8"),
    );
  }
  t.after(async () => {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  });

  // 07:00 in Brasília on 29/09/2026: the window ends at 02/10 23:59:59.
  const now = new Date("2026-09-29T10:00:00.000Z");
  const tomorrow = new Date("2026-09-30T15:00:00.000Z");
  const inTwoDays = new Date("2026-10-01T15:00:00.000Z");
  const inThreeDays = new Date("2026-10-02T17:00:00.000Z");
  const farAway = new Date("2026-10-30T20:00:00.000Z");

  const tenders = {
    personal: { sequence: 901, title: "TEST DATA prazo pessoal", deadline: farAway },
    proposal: { sequence: 902, title: "TEST DATA proposta amanhã", deadline: tomorrow },
    submitted: { sequence: 903, title: "TEST DATA participação enviada", deadline: farAway },
    dismissed: { sequence: 904, title: "TEST DATA não vou participar", deadline: tomorrow },
    expired: { sequence: 905, title: "TEST DATA prazo vencido", deadline: new Date("2026-09-28T20:00:00.000Z") },
    both: { sequence: 906, title: "TEST DATA dois prazos", deadline: inThreeDays },
  };
  const tenderId = (sequence: number) => `00394460000141-1-${String(sequence).padStart(6, "0")}-2026`;
  await upsertPublications(
    Object.values(tenders).map(({ sequence }) => ({
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
      orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Órgão de teste" },
      unidadeOrgao: { ufSigla: "DF", municipioNome: "Brasília" },
    })),
    new Date("2026-09-23T13:00:00Z"),
  );
  for (const { sequence, title, deadline } of Object.values(tenders)) {
    await db
      .update(tendersTable)
      .set({ title, proposalDeadline: deadline, status: "open" })
      .where(eq(tendersTable.id, tenderId(sequence)));
  }

  const createUser = async (
    id: string,
    options: { subscribed?: boolean; digest?: "daily" | "off" } = {},
  ) => {
    await db.insert(usersTable).values({
      id,
      email: `${id}@example.test`,
      name: "TEST USER",
      trialEndsAt: new Date("2026-09-01T00:00:00.000Z"),
      emailDigest: options.digest ?? "daily",
    });
    if (options.subscribed) {
      await db.insert(subscriptionsTable).values({
        userId: id,
        status: "active",
        currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
      });
    }
  };
  await createUser("deadline-owner", { subscribed: true });
  await createUser("deadline-beta");
  await createUser("deadline-no-access");
  await createUser("deadline-digest-off", { subscribed: true, digest: "off" });
  await db.insert(betaAccessGrantsTable).values({
    email: "deadline-beta@example.test",
    accessUntil: new Date("2099-01-01T00:00:00.000Z"),
  });

  await db.insert(savedTendersTable).values([
    {
      userId: "deadline-owner",
      tenderId: tenderId(tenders.personal.sequence),
      stage: "analyzing",
      nextAction: "Enviar <certidões>",
      nextActionDeadline: inTwoDays,
    },
    {
      userId: "deadline-owner",
      tenderId: tenderId(tenders.proposal.sequence),
      stage: "participating",
    },
    {
      userId: "deadline-owner",
      tenderId: tenderId(tenders.submitted.sequence),
      stage: "submitted",
      nextAction: "Acompanhar sessão",
      nextActionDeadline: tomorrow,
    },
    {
      userId: "deadline-owner",
      tenderId: tenderId(tenders.dismissed.sequence),
      stage: "dismissed",
    },
    {
      userId: "deadline-owner",
      tenderId: tenderId(tenders.expired.sequence),
      stage: "analyzing",
      nextAction: "Prazo que já passou",
      nextActionDeadline: new Date("2026-09-29T09:00:00.000Z"),
    },
    {
      userId: "deadline-owner",
      tenderId: tenderId(tenders.both.sequence),
      stage: "participating",
      nextAction: "Enviar proposta",
      nextActionDeadline: new Date("2026-09-30T14:00:00.000Z"),
    },
    ...["deadline-beta", "deadline-no-access", "deadline-digest-off"].map((userId) => ({
      userId,
      tenderId: tenderId(tenders.proposal.sequence),
      stage: "analyzing" as const,
    })),
  ]);
  await db.insert(notificationsTable).values({
    id: "deadline-owner-update",
    userId: "deadline-owner",
    type: "tender_document_added",
    dedupeKey: "digest-deadlines:owner:document",
    createdAt: new Date(now.getTime() - 60_000),
    tenderId: tenderId(tenders.personal.sequence),
    tenderTitle: "TEST DATA novidade do edital",
    tenderOrganizationName: "Órgão de teste",
    change: { field: "documents", from: 1, to: 2 },
  });

  const messages: EmailMessage[] = [];
  const send = async (message: EmailMessage) => {
    messages.push(message);
    return { status: "sent" as const, providerMessageId: `digest-deadline-${messages.length}` };
  };

  assert.deepEqual(await runDailyEmailDigest(now, send), {
    queued: 2,
    sent: 2,
    failed: 0,
    skipped: 0,
  });
  const byRecipient = new Map(messages.map((message) => [message.to, message]));
  assert.deepEqual([...byRecipient.keys()].sort(), [
    "deadline-beta@example.test",
    "deadline-owner@example.test",
  ]);

  const owner = byRecipient.get("deadline-owner@example.test")!;
  assert.equal(owner.subject, "LicitAI: 4 prazos e 1 atualização no seu resumo");
  // A tender with both deadlines in the window is one entry, the closest deadline first.
  assert.equal(owner.text.match(/Sua etapa:/g)?.length, 3);
  assert.match(
    owner.text,
    /^Seu prazo \(informado por você\): Enviar proposta — 30\/09\/2026, 11:00 \(amanhã\) · Prazo oficial de proposta: 02\/10\/2026, 14:00 \(em 3 dias\)$/m,
  );
  assert.ok(owner.text.indexOf("TEST DATA dois prazos") < owner.text.indexOf("TEST DATA proposta amanhã"));
  assert.match(owner.text, /TEST DATA proposta amanhã/);
  assert.match(owner.text, /Prazo oficial de proposta: 30\/09\/2026, 12:00 \(amanhã\)/);
  assert.match(owner.text, /TEST DATA prazo pessoal/);
  assert.match(
    owner.text,
    /Seu prazo \(informado por você\): Enviar <certidões> — 01\/10\/2026, 12:00 \(em 2 dias\)/,
  );
  assert.match(owner.html, /Enviar &lt;certidões&gt;/);
  assert.ok(owner.text.indexOf("TEST DATA proposta amanhã") < owner.text.indexOf("TEST DATA prazo pessoal"));
  assert.ok(owner.text.indexOf("Seus prazos") < owner.text.indexOf("TEST DATA novidade do edital"));
  assert.match(owner.text, /http:\/\/localhost:24252\/tenders\/00394460000141-1-000901-2026/);
  assert.doesNotMatch(owner.text, /participação enviada|Acompanhar sessão|não vou participar|Prazo que já passou/);
  assert.equal(owner.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(owner.headers["List-Unsubscribe"] ?? "", /\/api\/v1\/email\/unsubscribe\?token=/);

  const beta = byRecipient.get("deadline-beta@example.test")!;
  assert.equal(beta.subject, "LicitAI: 1 prazo nos próximos dias");
  assert.match(beta.text, /Sua etapa: Analisando/);
  assert.doesNotMatch(beta.text, /Novidades/);

  const linked = await db
    .select()
    .from(emailDeliveryNotificationsTable)
    .where(eq(emailDeliveryNotificationsTable.notificationId, "deadline-owner-update"));
  assert.equal(linked.length, 1);

  // Re-running the job on the same Brasília day does not send again.
  assert.deepEqual(await runDailyEmailDigest(now, send), { queued: 0, sent: 0, failed: 0, skipped: 0 });
  assert.deepEqual(
    await runDailyEmailDigest(new Date("2026-09-30T02:00:00.000Z"), send),
    { queued: 0, sent: 0, failed: 0, skipped: 0 },
  );
  assert.equal(messages.length, 2);
  assert.equal((await db.select().from(emailDeliveriesTable)).length, 2);
});
