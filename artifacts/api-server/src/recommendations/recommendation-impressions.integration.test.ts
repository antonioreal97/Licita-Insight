import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "impressions record what was shown, once per run, and feed the offline evaluation",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `rec_impressions_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    process.env.NODE_ENV = "test";

    const {
      companyProfilesTable,
      db,
      pool,
      recommendationEventsTable,
      recommendationImpressionsTable,
      tendersTable,
      userRecommendationsTable,
      usersTable,
    } = await import("@workspace/db");
    const { and, eq } = await import("drizzle-orm");
    const {
      deleteRecommendationHistory,
      listRecommendations,
      rebuildRecommendationsForUser,
      recordRecommendationEvent,
      runDailyRecommendations,
      RECOMMENDATION_ALGORITHM_VERSION,
    } = await import("./recommendation-service");
    const { evaluateRanking, loadImpressionLists } = await import("./offline-evaluation");

    await pool.query(`create schema "${schema}"`);
    const tables = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    for (const { tablename } of tables.rows)
      await pool.query(
        `create table "${schema}"."${tablename}" (like public."${tablename}" including all)`,
      );
    t.after(async () => {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    });

    const now = new Date();
    const deadline = new Date(now.getTime() + 30 * 86_400_000);
    const insertTender = async (id: string, title: string, state: string) => {
      const normalized = title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLocaleLowerCase("pt-BR");
      await db.insert(tendersTable).values({
        id,
        pncpControlNumber: id,
        title,
        organizationId: `org-${id}`,
        organizationName: `Órgão ${id}`,
        modality: "other",
        modalityLabel: "Outra",
        status: "open",
        estimatedValue: "100000",
        estimatedValueStatus: "disclosed",
        state,
        sourceId: "impressions-test",
        sourceName: "Teste",
        searchText: normalized,
        titleNorm: normalized,
        objectNorm: "",
        itemsNorm: "",
        organizationNorm: "",
        otherNorm: "",
        rawPayload: {},
        fetchedAt: now,
        publishedAt: now,
        proposalDeadline: deadline,
        categories: [],
      });
    };
    await insertTender("drone-mg", "Aquisição de drone para mapeamento", "MG");
    await insertTender("drone-sp", "Aquisição de drone para inspeção", "SP");

    const userId = "impressions-user";
    await db.insert(usersTable).values({ id: userId, email: "impressions@example.test" });
    await db.insert(companyProfilesTable).values({
      userId,
      description: "",
      offerings: ["drone"],
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "prioritize",
      size: "me_epp",
    });
    await rebuildRecommendationsForUser(userId);

    // The materialized rows keep the score parts, and the parts add up to the score.
    const stored = await db
      .select()
      .from(userRecommendationsTable)
      .where(eq(userRecommendationsTable.userId, userId));
    assert.equal(stored.length, 2);
    for (const row of stored) {
      const sum = Object.values(row.features).reduce<number>((total, value) => total + (value ?? 0), 0);
      assert.ok(Math.abs(sum - Number(row.score)) < 0.001);
    }

    const impressions = () =>
      db
        .select()
        .from(recommendationImpressionsTable)
        .where(eq(recommendationImpressionsTable.userId, userId));

    await listRecommendations(userId, 1, 50);
    let shown = await impressions();
    assert.deepEqual(shown.map((row) => row.position).sort(), [1, 2]);
    assert.ok(shown.every((row) => row.scope === "all"));
    assert.ok(shown.every((row) => row.algorithmVersion === RECOMMENDATION_ALGORITHM_VERSION));
    assert.ok(shown.every((row) => Object.keys(row.features).length > 0));

    // Reading the same ranking again (polling, refetch) adds nothing; triage logs its own scope.
    await listRecommendations(userId, 1, 50);
    assert.equal((await impressions()).length, 2);
    await listRecommendations(userId, 1, 50, "profile");
    shown = await impressions();
    assert.equal(shown.length, 3);
    assert.deepEqual(
      shown.filter((row) => row.scope === "profile").map((row) => [row.tenderId, row.position]),
      [["drone-mg", 1]],
    );

    // A click marks the impression only with the browsing opt-in.
    await recordRecommendationEvent(userId, { type: "click", tenderId: "drone-mg" });
    assert.ok((await impressions()).every((row) => row.clickedAt === null));
    await db
      .update(usersTable)
      .set({ recommendationPersonalizationEnabled: true })
      .where(eq(usersTable.id, userId));
    await recordRecommendationEvent(userId, { type: "click", tenderId: "drone-mg" });
    const clicked = (await impressions()).filter((row) => row.clickedAt !== null);
    assert.deepEqual(clicked.map((row) => [row.tenderId, row.scope]), [["drone-mg", "profile"]]);

    // Outcomes come from the existing tables: "Interessa" after the impression is a positive.
    await db.insert(recommendationEventsTable).values({
      userId,
      type: "interest",
      tenderId: "drone-sp",
      normalizedTerms: ["drone"],
      occurredAt: new Date(Date.now() + 1_000),
    });
    const lists = await loadImpressionLists({ days: 30, windowDays: 14, includeOpenWindow: true });
    assert.equal(lists.length, 2);
    const all = lists.find((list) => list.scope === "all")!;
    assert.equal(all.items.find((item) => item.tenderId === "drone-sp")?.gain, 2);
    const triage = lists.find((list) => list.scope === "profile")!;
    assert.equal(triage.items[0]?.gain, 1);
    // Without --include-open, impressions whose window is still open are left out.
    assert.equal((await loadImpressionLists({ days: 30, windowDays: 14 })).length, 0);
    const report = evaluateRanking(lists, { k: 10 });
    assert.equal(report.impressions, 3);
    assert.equal(report.positives, 2);
    assert.equal(report.baseline.hitRateAtK, 1);

    // Retention: impressions older than 180 days go with the daily job.
    await db.insert(recommendationImpressionsTable).values({
      userId,
      tenderId: "drone-sp",
      scope: "all",
      position: 1,
      rank: 1,
      score: "10.00000",
      features: {},
      algorithmVersion: RECOMMENDATION_ALGORITHM_VERSION,
      generatedAt: new Date(now.getTime() - 200 * 86_400_000),
      shownAt: new Date(now.getTime() - 200 * 86_400_000),
    });
    const daily = await runDailyRecommendations(now);
    assert.equal(daily.deletedImpressions, 1);
    assert.equal(
      (
        await db
          .select()
          .from(recommendationImpressionsTable)
          .where(
            and(
              eq(recommendationImpressionsTable.userId, userId),
              eq(recommendationImpressionsTable.score, "10.00000"),
            ),
          )
      ).length,
      0,
    );

    // "Apagar histórico" erases the impressions with the events.
    await deleteRecommendationHistory(userId);
    assert.equal((await impressions()).length, 0);
    // Let the rebuild it schedules finish before the schema is dropped.
    await new Promise((resolve) => setTimeout(resolve, 500));
  },
);
