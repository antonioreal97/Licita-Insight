import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "declared recommendations require adherence and order region before topical score",
  {
    skip: !process.env.PNCP_TEST_DATABASE_URL,
  },
  async (t) => {
    const schema = `declared_opportunities_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    process.env.NODE_ENV = "test";
    const {
      companyProfilesTable,
      culturalOpportunitiesTable,
      db,
      pool,
      usersTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { listRecommendations } = await import("./recommendation-service");
    await pool.query(`create schema "${schema}"`);
    t.after(async () => {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    });
    const tables = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    for (const { tablename } of tables.rows)
      await pool.query(
        `create table "${schema}"."${tablename}" (like public."${tablename}" including all)`,
      );

    const userId = "declared-opportunities-user";
    await db.insert(usersTable).values({
      id: userId,
      email: "declared-opportunities@example.test",
      usagePurposes: ["culture", "research", "funding"],
      applicantTypes: ["company"],
    });
    await db.insert(companyProfilesTable).values({
      userId,
      description: "Pesquisa e consultoria para empresas",
      offerings: ["software", "empresa", "serviços", "projetos"],
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "strict",
      size: "me_epp",
    });
    const now = new Date();
    const future = new Date(now.getTime() + 86_400_000);
    const insertCall = (
      id: string,
      title: string,
      extra: Partial<typeof culturalOpportunitiesTable.$inferInsert> = {},
    ) =>
      db.insert(culturalOpportunitiesTable).values({
        id,
        title,
        externalId: id,
        installationId: "br",
        source: "mapas",
        kind: "culture",
        organizationName: "Fonte de teste",
        status: "open",
        registrationTo: future,
        searchText: title,
        rawPayload: {},
        fetchedAt: now,
        ...extra,
      });
    await insertCall("inside", "Apoio a software", { state: "MG" });
    await insertCall("outside", "Apoio a software", {
      installationId: "rn-natal",
      areas: ["software"],
      audience: "Empresas",
    });
    await insertCall("capes-match", "Programa de bolsas", {
      installationId: "capes",
      source: "capes",
      kind: "funding",
      areaTerms: ["Engenharia de software"],
    });
    await insertCall("capes-unrelated", "Programa de bolsas", {
      installationId: "capes",
      source: "capes",
      kind: "funding",
      areaTerms: ["Biologia"],
    });
    for (const [id, title] of [
      ["consultoria", "CONSULTORIA PARA PROJETOS CULTURAIS"],
      ["workshop", "WORKSHOP ELABORAÇÃO DE PROJETOS CULTURAIS CICLO 02"],
      ["cultura", "Cultura em Ação"],
    ])
      await insertCall(id!, title!, {
        summary: "Pesquisa para projetos culturais e apoio às empresas",
        areas: ["gestao-producao", "formacao"],
        audience: "Empresas",
      });
    await insertCall("closed", "Software", { status: "closed" });
    await insertCall("expired", "Software", {
      registrationTo: new Date(now.getTime() - 86_400_000),
    });
    await insertCall("international", "Software", { scope: "international" });

    const strict = await listRecommendations(userId, 1, 10);
    assert.deepEqual(
      strict.opportunities?.map(({ opportunity }) => opportunity.id),
      ["inside", "capes-match"],
    );
    assert.ok(
      strict.opportunities?.every((item) => !("regionPriority" in item)),
    );
    assert.ok(
      strict.opportunities
        ?.find(({ opportunity }) => opportunity.id === "capes-match")
        ?.reasons.includes("Área ligada ao seu perfil: Engenharia de software"),
    );

    await db
      .update(companyProfilesTable)
      .set({ coverageMode: "prioritize", updatedAt: new Date() })
      .where(eq(companyProfilesTable.userId, userId));
    const prioritized = await listRecommendations(userId, 1, 10);
    assert.deepEqual(
      prioritized.opportunities?.map(({ opportunity }) => opportunity.id),
      ["inside", "capes-match", "outside"],
    );
    const outside = prioritized.opportunities!.find(
      ({ opportunity }) => opportunity.id === "outside",
    )!;
    const inside = prioritized.opportunities!.find(
      ({ opportunity }) => opportunity.id === "inside",
    )!;
    assert.ok(outside.score > inside.score);
    assert.ok(outside.reasons.includes("Fora da sua região"));
  },
);
