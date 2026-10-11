import assert from "node:assert/strict";
import { test } from "node:test";

/** Every name of a person in this file is made up. */
const PERSON = "Fulana Exemplo da Silva";
const OTHER_PERSON = "Beltrano Exemplo Souza";
const NEUTRAL = "Proponente individual (Mapa Cultural do Ceará)";

test(
  "revisão de donos: tira nomes de pessoa física das linhas já gravadas, é idempotente e confere o tipo na fonte",
  { skip: !process.env.PNCP_TEST_DATABASE_URL },
  async () => {
    const schema = `owner_review_test_${crypto.randomUUID().replaceAll("-", "")}`;
    const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.LOG_LEVEL = "silent";
    // The scheduled run must not reach any real install from a test.
    process.env.CULTURE_DAILY_COLLECT = "false";
    const { culturalOpportunitiesTable, db, pool } =
      await import("@workspace/db");
    await pool.query(`create schema "${schema}"`);
    for (const table of [
      "cultural_opportunities",
      "ingest_runs",
      "company_profiles",
      "job_run_audit",
    ]) {
      await pool.query(
        `create table "${schema}"."${table}" (like public."${table}" including all)`,
      );
    }
    try {
      const {
        reviewOwnersAtSource,
        reviewStoredOwners,
        runOpportunityOwnerReview,
      } = await import("./opportunity-owner-review");
      const { normalizeText } = await import("../domain/normalize");
      const { parseOpportunityQuery } =
        await import("../lib/opportunity-query");
      const { searchOpportunities, findOpportunity } =
        await import("../repositories/postgres-opportunity-repository");
      const stamp = new Date("2026-10-09T09:00:00-03:00");
      const now = new Date("2026-10-11T12:00:00-03:00");

      /** A row as the collector wrote it before it asked for the agent type. */
      const legacy = (
        externalId: number,
        title: string,
        owner: string,
        extra: {
          status?: string;
          ownerEntity?: Record<string, unknown>;
          summary?: string;
          installationId?: string;
        } = {},
      ) => {
        const installationId = extra.installationId ?? "ce";
        const originName =
          typeof extra.ownerEntity?.name === "string"
            ? extra.ownerEntity.name
            : null;
        return {
          id: `${installationId}-${externalId}`,
          installationId,
          externalId: String(externalId),
          title,
          summary: extra.summary ?? null,
          organizationName: owner,
          originName,
          state: "CE",
          status: extra.status ?? "open",
          searchText: normalizeText(`${title} ${owner} ${originName ?? ""}`),
          rawPayload: {
            id: externalId,
            name: title,
            shortDescription: extra.summary ?? null,
            registrationTo: "2026-12-01 18:00:00",
            owner: { id: externalId + 1000, name: owner },
            ownerEntity: extra.ownerEntity ?? null,
          },
          fetchedAt: stamp,
          updatedAt: stamp,
        };
      };

      await db.insert(culturalOpportunitiesTable).values([
        legacy(1, "Aulas de Capoeira", PERSON, {
          summary: "Turmas novas. Contato: (85) 99999-0000.",
        }),
        legacy(2, "Edital de chamamento público nº 1/2026 — PNAB", PERSON),
        legacy(
          3,
          "Edital de teatro",
          "Secretaria da Cultura do Estado do Ceará",
        ),
        // An organization whose name alone does not say so: only the source can tell.
        legacy(4, "Edital do cortejo 2025", "Baque Exemplo Fortaleza", {
          status: "closed",
        }),
        legacy(5, "Roda de samba", OTHER_PERSON, { status: "closed" }),
        legacy(6, "Edital de ocupação", PERSON, {
          ownerEntity: { id: 77, name: OTHER_PERSON, "@entityType": "agent" },
        }),
        {
          ...legacy(9, "Chamada CNPq 10/2026", "CNPq", {
            installationId: "cnpq",
          }),
          source: "cnpq" as const,
          kind: "funding" as const,
          rawPayload: {
            sourceUrl: "https://www.gov.br/cnpq/exemplo",
            text: `Coordenação: ${PERSON}`,
          },
        },
      ]);

      const dump = async (): Promise<string> =>
        (
          await pool.query<{ row: string }>(
            "select row_to_json(t)::text as row from cultural_opportunities t order by id",
          )
        ).rows
          .map(({ row }) => row)
          .join("\n");
      const row = async (id: string) => {
        const { rows } = await pool.query<{
          organization_name: string;
          origin_name: string | null;
          title: string;
          summary: string | null;
          status: string;
          search_text: string;
          updated_at: Date;
          raw_payload: Record<string, unknown> & {
            ownerReview?: Record<string, unknown>;
          };
        }>("select * from cultural_opportunities where id = $1", [id]);
        assert.ok(rows[0], id);
        return rows[0];
      };

      // The simulation counts and writes nothing.
      const before = await dump();
      const simulated = await reviewStoredOwners({ now, dryRun: true });
      assert.deepEqual(simulated, {
        scanned: 6,
        changed: 5,
        namesWithheld: 5,
        individualListings: 2,
        pageTextsRemoved: 1,
      });
      assert.equal(await dump(), before);

      // Step 1, no network.
      assert.deepEqual(await reviewStoredOwners({ now, batch: 2 }), simulated);
      const after = await dump();
      for (const piece of [
        "Fulana",
        "fulana",
        "Beltrano",
        "beltrano",
        "99999-0000",
      ]) {
        assert.equal(after.includes(piece), false, piece);
      }

      const classes = await row("ce-1");
      assert.equal(classes.organization_name, NEUTRAL);
      assert.equal(
        classes.summary,
        "Turmas novas. Contato: [contato removido].",
      );
      assert.deepEqual(classes.raw_payload.owner, {});
      assert.equal(classes.raw_payload.ownerReview?.individualListing, true);
      assert.equal(classes.raw_payload.ownerReview?.sourceChecked, false);
      assert.equal(classes.updated_at.getTime(), now.getTime());

      const publicCall = await row("ce-2");
      assert.equal(publicCall.organization_name, NEUTRAL);
      assert.equal(
        publicCall.raw_payload.ownerReview?.individualListing,
        false,
      );

      const secretariat = await row("ce-3");
      assert.equal(
        secretariat.organization_name,
        "Secretaria da Cultura do Estado do Ceará",
      );
      assert.equal(secretariat.raw_payload.ownerReview?.nameWithheld, false);
      // Nothing visible changed, so the row does not look freshly updated.
      assert.equal(secretariat.updated_at.getTime(), stamp.getTime());

      assert.equal((await row("ce-4")).organization_name, NEUTRAL);
      assert.equal((await row("ce-6")).origin_name, null);
      assert.deepEqual((await row("cnpq-9")).raw_payload, {
        sourceUrl: "https://www.gov.br/cnpq/exemplo",
      });

      // Idempotent: nothing left to review, nothing rewritten.
      const settled = await dump();
      assert.deepEqual(await reviewStoredOwners({ now: new Date() }), {
        scanned: 0,
        changed: 0,
        namesWithheld: 0,
        individualListings: 0,
        pageTextsRemoved: 0,
      });
      assert.equal(await dump(), settled);

      // Step 2: an install that does not answer keeps its rows for the next run.
      const down = await reviewOwnersAtSource({
        now,
        fetcher: async () => ({ status: 503, body: "", metadata: null }),
      });
      assert.deepEqual(down, {
        asked: 0,
        answered: 0,
        gone: 0,
        namesRestored: 0,
        failedInstallations: ["ce"],
      });
      assert.equal(await dump(), settled);

      // An install the collector found blocked is not asked at all.
      let requests = 0;
      await reviewOwnersAtSource({
        now,
        skip: (installationId) => installationId === "ce",
        fetcher: async () => {
          requests += 1;
          return { status: 200, body: "[]", metadata: null };
        },
      });
      assert.equal(requests, 0);

      // The source answers: people stay withheld, the organization gets its name back.
      const urls: string[] = [];
      const individual = { id: 1, name: "Individual" };
      const answered = await reviewOwnersAtSource({
        now,
        fetcher: async (address) => {
          urls.push(address);
          return {
            status: 200,
            contentType: "application/json",
            metadata: JSON.stringify({ numPages: 1 }),
            body: JSON.stringify([
              {
                id: 1,
                name: "Aulas de Capoeira",
                shortDescription: "Turmas novas. Contato: (85) 99999-0000.",
                registrationTo: "2026-12-01 18:00:00",
                owner: { id: 1001, name: PERSON, type: individual },
              },
              {
                id: 2,
                name: "Edital de chamamento público nº 1/2026 — PNAB",
                registrationTo: "2026-12-01 18:00:00",
                owner: { id: 1002, name: PERSON, type: individual },
              },
              {
                id: 3,
                name: "Edital de teatro",
                registrationTo: "2026-12-01 18:00:00",
                owner: {
                  id: 1003,
                  name: "Secretaria da Cultura do Estado do Ceará",
                  type: { id: 2, name: "Coletivo" },
                },
              },
              {
                id: 4,
                name: "Edital do cortejo 2025",
                registrationTo: "2026-12-01 18:00:00",
                owner: {
                  id: 1004,
                  name: "Baque Exemplo Fortaleza",
                  type: { id: 2, name: "Coletivo" },
                },
              },
              {
                id: 6,
                name: "Edital de ocupação",
                registrationTo: "2026-12-01 18:00:00",
                owner: { id: 1006, name: PERSON, type: individual },
                ownerEntity: {
                  id: 77,
                  name: OTHER_PERSON,
                  "@entityType": "agent",
                },
              },
            ]),
          };
        },
      });
      assert.equal(urls.length, 1);
      assert.equal(new URL(urls[0]!).searchParams.get("id"), "IN(1,2,3,4,5,6)");
      // A name kept only because it reads like an organization's is confirmed at the source too.
      assert.deepEqual(answered, {
        asked: 6,
        answered: 5,
        gone: 1,
        namesRestored: 1,
        failedInstallations: [],
      });

      const restored = await row("ce-4");
      assert.equal(restored.organization_name, "Baque Exemplo Fortaleza");
      assert.equal(restored.raw_payload.ownerReview?.ownerKind, "collective");
      // The review does not reopen a call the collector closed.
      assert.equal(restored.status, "closed");
      const gone = await row("ce-5");
      assert.equal(gone.organization_name, NEUTRAL);
      assert.equal(gone.raw_payload.ownerReview?.sourceChecked, true);
      assert.equal(
        (await row("ce-1")).raw_payload.ownerReview?.ownerKind,
        "individual",
      );
      const checked = await dump();
      for (const piece of [
        "Fulana",
        "fulana",
        "Beltrano",
        "beltrano",
        "99999-0000",
      ]) {
        assert.equal(checked.includes(piece), false, piece);
      }

      // Nothing pending: no request, and the scheduled run does not even take the lock.
      assert.equal(
        (
          await reviewOwnersAtSource({
            now,
            fetcher: async () => {
              throw new Error("no request expected");
            },
          })
        ).asked,
        0,
      );
      assert.equal(await runOpportunityOwnerReview("test"), null);

      // The hub leaves individual listings out unless asked, and says how many it left out.
      const search = (query: Record<string, unknown>) =>
        searchOpportunities(parseOpportunityQuery(query));
      const ids = (response: Awaited<ReturnType<typeof search>>) =>
        response.data.map((item) => item.id).sort();
      const listed = await search({ installation: "ce" });
      assert.deepEqual(ids(listed), ["ce-2", "ce-3", "ce-4", "ce-6"]);
      assert.equal(listed.pagination.total, 4);
      assert.equal(listed.meta.hiddenIndividualListings, 2);
      assert.equal(
        listed.facets!.organization.find((bucket) => bucket.value === NEUTRAL)
          ?.count,
        2,
      );
      const everything = await search({
        installation: "ce",
        includeIndividual: "true",
      });
      assert.deepEqual(ids(everything), [
        "ce-1",
        "ce-2",
        "ce-3",
        "ce-4",
        "ce-5",
        "ce-6",
      ]);
      assert.equal(everything.meta.hiddenIndividualListings, 0);
      assert.equal(
        everything.data.find((item) => item.id === "ce-1")?.individualListing,
        true,
      );
      assert.equal((await search({ q: "capoeira" })).pagination.total, 0);
      assert.equal(
        (await search({ q: "fulana", includeIndividual: "true" })).pagination
          .total,
        0,
      );
      // A direct link still opens, with no personal data in it.
      const direct = await findOpportunity("ce-1");
      assert.equal(direct?.individualListing, true);
      assert.equal(direct?.organizationName, NEUTRAL);
      assert.throws(
        () => parseOpportunityQuery({ includeIndividual: "sim" }),
        /includeIndividual must be true or false/,
      );

      // A row written before the review exists is picked up by the scheduled run.
      await db
        .insert(culturalOpportunitiesTable)
        .values(legacy(7, "Aulas de dança", PERSON));
      const scheduled = await runOpportunityOwnerReview("test");
      assert.equal(scheduled?.stored.scanned, 1);
      assert.equal(scheduled?.stored.namesWithheld, 1);
      // With the Mapas collection off, the job does not go to the network.
      assert.equal(scheduled?.source, null);
      assert.equal((await dump()).includes("Fulana"), false);
    } finally {
      await pool.query(`drop schema "${schema}" cascade`);
      await pool.end();
    }
  },
);
