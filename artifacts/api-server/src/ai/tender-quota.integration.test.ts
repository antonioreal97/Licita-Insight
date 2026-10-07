import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("daily AI quota counts distinct processes per user and São Paulo day", {
  skip: !process.env.PNCP_TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const schema = `tender_quota_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  process.env.AI_DAILY_TENDER_LIMIT = "2";
  process.env.LOG_LEVEL = "silent";
  const { db, pool, tendersTable, usersTable } = await import("@workspace/db");
  await pool.query(`create schema "${schema}"`);
  for (const table of ["users", "tenders"]) {
    await pool.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  }
  await pool.query(
    readFileSync(new URL("../../../../lib/db/migrations/0026_ai_daily_tenders.sql", import.meta.url), "utf8"),
  );
  try {
    const userId = `U-${randomUUID()}`;
    const otherUserId = `U-${randomUUID()}`;
    const [a, b, c] = [1, 2, 3].map(() => `T-${randomUUID()}`);
    await db.insert(usersTable).values([
      { id: userId, email: `${userId}@example.test` },
      { id: otherUserId, email: `${otherUserId}@example.test` },
    ]);
    await db.insert(tendersTable).values([a, b, c].map((id) => ({
      id,
      pncpControlNumber: id,
      title: "TEST DATA processo",
      organizationId: "ORG",
      organizationName: "TEST DATA órgão",
      modality: "other" as const,
      modalityLabel: "Outra",
      status: "open" as const,
      estimatedValueStatus: "not_published" as const,
      sourceId: id,
      sourceName: "TEST",
      categories: [],
      items: [],
      documents: [],
      timeline: [],
      searchText: "processo",
      titleNorm: "processo",
      objectNorm: "",
      itemsNorm: "",
      organizationNorm: "test data orgao",
      otherNorm: "",
      rawPayload: {},
      fetchedAt: new Date(),
    })));
    const { reserveTenderConsultation, tenderQuotaFor } = await import("./tender-quota");
    const { AiQuotaExceededError } = await import("../lib/api-error");
    // 14:00 in São Paulo on 6 Oct; the next local day starts at 03:00 UTC on 7 Oct.
    const today = new Date("2026-10-06T17:00:00.000Z");
    const tomorrow = new Date("2026-10-07T03:00:00.000Z");

    assert.deepEqual(await tenderQuotaFor(userId, a!, today), {
      used: 0, limit: 2, resetsAt: "2026-10-07T03:00:00.000Z", counted: false,
    });
    assert.equal((await reserveTenderConsultation(userId, a!, today)).used, 1);
    // Asking again about the same process, or opening its sheet, spends nothing.
    assert.equal((await reserveTenderConsultation(userId, a!, today)).used, 1);
    assert.equal((await reserveTenderConsultation(userId, b!, today)).used, 2);
    assert.equal((await reserveTenderConsultation(userId, a!, today)).used, 2);
    await assert.rejects(reserveTenderConsultation(userId, c!, today), (error: unknown) => {
      assert.ok(error instanceof AiQuotaExceededError);
      assert.deepEqual(error.details, [{ field: "quota", issue: "daily_tenders" }]);
      return true;
    });
    assert.deepEqual(
      [(await tenderQuotaFor(userId, b!, today)).counted, (await tenderQuotaFor(userId, c!, today)).counted],
      [true, false],
    );
    // Per user and per day.
    assert.equal((await reserveTenderConsultation(otherUserId, c!, today)).used, 1);
    assert.equal((await reserveTenderConsultation(userId, c!, tomorrow)).used, 1);

    const concurrent = await Promise.allSettled(
      [a, b, c].map((tenderId) => reserveTenderConsultation(otherUserId, tenderId!, tomorrow)),
    );
    assert.equal(concurrent.filter(({ status }) => status === "fulfilled").length, 2);
    assert.equal((await tenderQuotaFor(otherUserId, a!, tomorrow)).used, 2);
  } finally {
    await pool.query(`drop schema "${schema}" cascade`);
    await pool.end();
    delete process.env.AI_DAILY_TENDER_LIMIT;
  }
});
