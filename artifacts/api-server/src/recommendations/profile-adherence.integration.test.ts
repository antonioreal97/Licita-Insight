import assert from "node:assert/strict";
import { test } from "node:test";

test(
  "recommendations preserve explicit profile adherence across history and region modes",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async (t) => {
    const schema = `recommendation_adherence_${crypto.randomUUID().replaceAll("-", "")}`;
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
      savedTendersTable,
      tendersTable,
      userRecommendationsTable,
      usersTable,
    } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const { rebuildInterestProfile, rebuildRecommendationsForUser } =
      await import("./recommendation-service");

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

    const now = new Date("2026-10-20T15:00:00Z");
    const deadline = new Date("2026-11-20T15:00:00Z");
    const category = (slug: string, label: string) => [{ slug, label }];
    const insertTender = async (
      id: string,
      title: string,
      options: {
        state?: string | null;
        cityIbgeCode?: string | null;
        categories?: Array<{ slug: string; label: string }>;
        status?: "open" | "under_review";
        value?: string;
      } = {},
    ) => {
      const normalized = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR");
      await db.insert(tendersTable).values({
        id,
        pncpControlNumber: id,
        title,
        organizationId: `org-${id}`,
        organizationName: `Órgão ${id}`,
        modality: "other",
        modalityLabel: "Outra",
        status: options.status ?? "open",
        estimatedValue: options.value ?? "100000",
        estimatedValueStatus: "disclosed",
        state: options.state === undefined ? "MG" : options.state,
        cityIbgeCode: options.cityIbgeCode ?? null,
        sourceId: "recommendation-test",
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
        categories: options.categories ?? [],
      });
    };

    await Promise.all([
      insertTender("drone-mg", "Aquisição de drone para mapeamento"),
      insertTender("drones-mg", "Serviço de inspeção com drones"),
      insertTender("drone-sp", "Aquisição de drone para inspeção", {
        state: "SP",
      }),
      insertTender("drone-sp-ti", "Drone com software de telemetria", {
        state: "SP",
        categories: category("ti-telecom", "TI e telecom"),
      }),
      insertTender("drone-sem-uf", "Drone para agricultura", { state: null }),
      insertTender("drone-bh", "Locação de drone com piloto", {
        cityIbgeCode: "3106200",
      }),
      insertTender("drone-uberlandia", "Drone para vistoria rural", {
        cityIbgeCode: "3170206",
      }),
      insertTender("audiovisual-mg", "Produção de vídeo institucional", {
        categories: category("audiovisual", "Audiovisual"),
      }),
      insertTender("maintenance-mg", "Manutenção predial preventiva"),
      insertTender("saved-drone", "Drone para levantamento cadastral", {
        status: "under_review",
      }),
    ]);

    const userId = "recommendation-adherence-user";
    await db.insert(usersTable).values({
      id: userId,
      email: "recommendation-adherence@example.test",
    });
    await db.insert(companyProfilesTable).values({
      userId,
      description: "Manutenção de estruturas",
      offerings: ["drone"],
      selectedCategories: ["audiovisual"],
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "strict",
      size: "me_epp",
    });

    const recommendationIds = async () =>
      (
        await db
          .select({ tenderId: userRecommendationsTable.tenderId })
          .from(userRecommendationsTable)
          .where(eq(userRecommendationsTable.userId, userId))
      ).map(({ tenderId }) => tenderId);

    await rebuildRecommendationsForUser(userId, now);
    const initial = await recommendationIds();
    assert.ok(initial.includes("drone-mg"));
    assert.ok(initial.includes("drones-mg"));
    assert.ok(initial.includes("audiovisual-mg"));
    assert.ok(!initial.includes("maintenance-mg"));
    assert.ok(!initial.includes("drone-sp"));

    await db.insert(savedTendersTable).values({
      userId,
      tenderId: "saved-drone",
    });
    await rebuildRecommendationsForUser(userId, now);
    assert.deepEqual(new Set(await recommendationIds()), new Set(initial));
    const [materializedAfterSave] = await db
      .select({ profile: recommendationInterestProfilesTable.profile })
      .from(recommendationInterestProfilesTable)
      .where(eq(recommendationInterestProfilesTable.userId, userId));
    const droneTerm = materializedAfterSave!.profile.terms.find(
      ({ value }) => value === "drone",
    );
    assert.ok(droneTerm?.sources?.includes("profile"));
    assert.ok(droneTerm?.sources?.includes("saved"));

    const historyTitles = [
      "Consultoria contábil tributária e financeira especializada",
      "Fornecimento de alimentos perecíveis para escolas municipais",
      "Serviços de limpeza hospitalar com materiais e equipes",
      "Aquisição de mobiliário escolar cadeiras mesas armários",
    ];
    for (const [index, title] of historyTitles.entries()) {
      const id = `monitored-${index + 1}`;
      await insertTender(id, title, { status: "under_review" });
      await db.insert(savedTendersTable).values({
        userId,
        tenderId: id,
        monitored: true,
      });
    }
    await rebuildRecommendationsForUser(userId, now);
    const afterMonitoring = await recommendationIds();
    assert.ok(afterMonitoring.includes("drone-mg"));
    assert.ok(afterMonitoring.includes("drones-mg"));
    assert.ok(afterMonitoring.includes("audiovisual-mg"));
    const [materializedAfterMonitoring] = await db
      .select({ profile: recommendationInterestProfilesTable.profile })
      .from(recommendationInterestProfilesTable)
      .where(eq(recommendationInterestProfilesTable.userId, userId));
    assert.ok(
      materializedAfterMonitoring!.profile.terms.some(
        ({ value, sources }) =>
          value === "drone" && sources?.includes("profile"),
      ),
    );

    const setCoverage = async (
      values: Partial<typeof companyProfilesTable.$inferInsert>,
    ) => {
      await db
        .update(companyProfilesTable)
        .set({
          selectedCategories: [],
          coverageStates: [],
          coverageRegions: [],
          coverageMunicipalities: [],
          headquartersMunicipalityIbge: null,
          coverageRadiusKm: null,
          acceptsRemote: false,
          ...values,
        })
        .where(eq(companyProfilesTable.userId, userId));
      await rebuildRecommendationsForUser(userId, now);
      return new Set(await recommendationIds());
    };

    const strictUf = await setCoverage({
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "strict",
    });
    assert.ok(strictUf.has("drone-mg"));
    assert.ok(!strictUf.has("drone-sp"));

    const municipality = await setCoverage({
      coverageScope: "custom",
      coverageMunicipalities: ["3106200"],
      coverageMode: "strict",
    });
    assert.deepEqual(municipality, new Set(["drone-bh"]));

    const radius = await setCoverage({
      coverageScope: "custom",
      headquartersMunicipalityIbge: "3106200",
      coverageRadiusKm: 100,
      coverageMode: "strict",
    });
    assert.deepEqual(radius, new Set(["drone-bh"]));

    const macroregion = await setCoverage({
      coverageScope: "custom",
      coverageRegions: ["southeast"],
      coverageMode: "strict",
    });
    assert.ok(macroregion.has("drone-mg"));
    assert.ok(macroregion.has("drone-sp"));
    assert.ok(!macroregion.has("drone-sem-uf"));

    const remote = await setCoverage({
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "strict",
      acceptsRemote: true,
    });
    assert.ok(remote.has("drone-sp-ti"));
    assert.ok(!remote.has("drone-sp"));

    const prioritize = await setCoverage({
      coverageScope: "custom",
      coverageStates: ["MG"],
      coverageMode: "prioritize",
    });
    assert.ok(prioritize.has("drone-mg"));
    assert.ok(prioritize.has("drone-sp"));
    assert.ok(prioritize.has("drone-sem-uf"));

    const valueUserId = "recommendation-value-user";
    await db.insert(usersTable).values({
      id: valueUserId,
      email: "recommendation-value@example.test",
    });
    await db.insert(companyProfilesTable).values({
      userId: valueUserId,
      description: "",
      offerings: ["drone"],
      coverageScope: "national",
      size: "me_epp",
    });
    const savedValueIds: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      const id = `saved-value-${index}`;
      savedValueIds.push(id);
      await insertTender(id, `Drone histórico ${index}`, {
        status: "under_review",
        value: String(index * 100_000),
      });
    }
    await db.insert(savedTendersTable).values({
      userId: valueUserId,
      tenderId: savedValueIds[0]!,
    });
    const oneValue = await rebuildInterestProfile(valueUserId, now);
    assert.equal(oneValue.valueMin, null);
    assert.equal(oneValue.valueMax, null);
    await db
      .insert(savedTendersTable)
      .values(
        savedValueIds
          .slice(1)
          .map((tenderId) => ({ userId: valueUserId, tenderId })),
      );
    const fiveValues = await rebuildInterestProfile(valueUserId, now);
    assert.notEqual(fiveValues.valueMin, null);
    assert.notEqual(fiveValues.valueMax, null);
  },
);
