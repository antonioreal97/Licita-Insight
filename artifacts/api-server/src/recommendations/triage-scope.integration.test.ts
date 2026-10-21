import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "triage scope serves only profile-aligned tenders and never serves stale rows",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `triage_scope_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    process.env.NODE_ENV = "test";

    const {
      companyProfilesTable,
      db,
      pool,
      recommendationInterestProfilesTable,
      tendersTable,
      userRecommendationsTable,
      usersTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const {
      listRecommendations,
      rebuildRecommendationsForUser,
      RECOMMENDATION_ALGORITHM_VERSION,
    } = await import("./recommendation-service");

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
    const insertTender = async (
      id: string,
      title: string,
      state: string | null,
      categories: Array<{ slug: string; label: string }> = [],
    ) => {
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
        sourceId: "triage-test",
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
        categories,
      });
    };
    await Promise.all([
      insertTender("drone-mg", "Aquisição de drone para mapeamento", "MG"),
      insertTender("drone-sp", "Aquisição de drone para inspeção", "SP"),
      insertTender("video-mg", "Produção de vídeo institucional", "MG", [
        { slug: "audiovisual", label: "Audiovisual" },
      ]),
      insertTender("cleaning-mg", "Serviços de limpeza predial", "MG"),
    ]);

    const userId = "triage-scope-user";
    await db
      .insert(usersTable)
      .values({ id: userId, email: "triage-scope@example.test" });
    await db.insert(companyProfilesTable).values({
      userId,
      description: "",
      offerings: ["drone"],
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "prioritize",
      size: "me_epp",
    });
    const ids = (result: { data: Array<{ tender: { id: string } }> }) =>
      result.data.map(({ tender }) => tender.id).sort();

    await rebuildRecommendationsForUser(userId);
    // "Prioritize" still recommends the out-of-region drone on the dashboard...
    assert.deepEqual(ids(await listRecommendations(userId, 1, 50)), [
      "drone-mg",
      "drone-sp",
    ]);
    // ...but triage keeps only what matches the registered profile and region.
    const triage = await listRecommendations(userId, 1, 50, "profile");
    assert.deepEqual(ids(triage), ["drone-mg"]);
    assert.equal(triage.pagination.total, 1);
    assert.equal("opportunities" in triage, false);

    // Rows from older rules are rebuilt on read instead of being served.
    await db
      .delete(userRecommendationsTable)
      .where(eq(userRecommendationsTable.userId, userId));
    await db.insert(userRecommendationsTable).values({
      userId,
      tenderId: "cleaning-mg",
      rank: 1,
      score: "99.00000",
      reasons: [{ kind: "profile", text: "Regra antiga" }],
      generatedAt: now,
    });
    const [stored] = await db
      .select()
      .from(recommendationInterestProfilesTable)
      .where(eq(recommendationInterestProfilesTable.userId, userId));
    const { algorithmVersion: _version, ...legacy } = stored.profile;
    await db
      .update(recommendationInterestProfilesTable)
      .set({ profile: legacy, updatedAt: new Date(now.getTime() + 60_000) })
      .where(eq(recommendationInterestProfilesTable.userId, userId));
    assert.deepEqual(ids(await listRecommendations(userId, 1, 50)), [
      "drone-mg",
      "drone-sp",
    ]);
    const [rebuilt] = await db
      .select()
      .from(recommendationInterestProfilesTable)
      .where(eq(recommendationInterestProfilesTable.userId, userId));
    assert.equal(
      rebuilt.profile.algorithmVersion,
      RECOMMENDATION_ALGORITHM_VERSION,
    );

    // A profile edit newer than the materialized rows is honored before the debounced rebuild runs.
    await db
      .update(companyProfilesTable)
      .set({
        offerings: [],
        selectedCategories: ["audiovisual"],
        coverageMode: "strict",
        updatedAt: new Date(rebuilt.updatedAt.getTime() + 60_000),
      })
      .where(eq(companyProfilesTable.userId, userId));
    assert.deepEqual(
      ids(await listRecommendations(userId, 1, 50, "profile")),
      ["video-mg"],
    );
  },
);
