import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  companyTenderFitsTable,
  db,
  subscriptionsTable,
  tendersTable,
  usersTable,
} from "@workspace/db";
import {
  COMPANY_FIT_PROMPT_VERSION,
  getTenderFits,
  putCompanyProfile,
  type CompanyProfileInput,
} from "../src/ai/company-fit-service";
import { aiConfig } from "../src/ai/config";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.JEV_API_KEY) throw new Error("JEV_API_KEY is required");

type SampleGroup = "probable_positive" | "neighbor" | "random";
type CalibrationProfile = {
  id: string;
  label: string;
  neighborTerms: string[];
  input: CompanyProfileInput;
};

const profiles: CalibrationProfile[] = [
  {
    id: "technology",
    label: "Tecnologia da informação",
    neighborTerms: ["servidores públicos", "telefonia", "impressão"],
    input: {
      description:
        "Fornecemos computadores, servidores, redes, licenças de software e serviços de suporte técnico e infraestrutura de TI.",
      offerings: [
        "computadores",
        "servidores",
        "software",
        "rede",
        "suporte técnico",
      ],
      exclusions: ["obra civil", "medicamentos"],
      coverage: { scope: "national" },
      valueRange: { min: null, max: null },
      size: "other",
    },
  },
  {
    id: "construction",
    label: "Construção e manutenção predial",
    neighborTerms: ["material de construção", "locação de máquinas"],
    input: {
      description:
        "Executamos obras civis, reformas, manutenção predial, instalações elétricas e hidráulicas e serviços de engenharia.",
      offerings: [
        "obra civil",
        "reforma",
        "manutenção predial",
        "instalação elétrica",
        "engenharia",
      ],
      exclusions: ["software", "alimentação"],
      coverage: { scope: "national" },
      valueRange: { min: null, max: null },
      size: "me_epp",
    },
  },
  {
    id: "facilities",
    label: "Limpeza e facilities",
    neighborTerms: ["material de limpeza", "produtos de limpeza", "vigilância"],
    input: {
      description:
        "Prestamos limpeza profissional, conservação, recepção, jardinagem e apoio operacional para órgãos e empresas.",
      offerings: [
        "limpeza",
        "conservação",
        "recepção",
        "jardinagem",
        "apoio operacional",
      ],
      exclusions: ["material de limpeza", "produtos de limpeza"],
      coverage: { scope: "national" },
      valueRange: { min: null, max: null },
      size: "cooperative",
    },
  },
];

const SAMPLE_SIZE = 10;
const CANDIDATE_LIMIT = 250;

async function lexicalCandidateIds(
  terms: string[],
  seed: string,
): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    select t.id
    from tenders t
    cross join lateral jsonb_array_elements_text(${JSON.stringify(terms)}::jsonb) terms(term)
    where to_tsvector('portuguese', concat_ws(' ', t.title, t.object_summary, t.description, t.items::text))
      @@ websearch_to_tsquery('portuguese', terms.term)
    group by t.id
    order by max(ts_rank_cd(
      to_tsvector('portuguese', concat_ws(' ', t.title, t.object_summary, t.description, t.items::text)),
      websearch_to_tsquery('portuguese', terms.term)
    )) desc, md5(t.id || ${seed})
    limit ${CANDIDATE_LIMIT}
  `);
  return result.rows.map(({ id }) => id);
}

async function randomCandidateIds(seed: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    select id
    from tenders
    order by md5(id || ${seed})
    limit ${CANDIDATE_LIMIT}
  `);
  return result.rows.map(({ id }) => id);
}

const uniqueTake = (candidates: string[], excluded: Set<string>): string[] => {
  const picked: string[] = [];
  for (const id of candidates) {
    if (excluded.has(id)) continue;
    excluded.add(id);
    picked.push(id);
    if (picked.length === SAMPLE_SIZE) break;
  }
  return picked;
};

async function sampleForProfile(profile: CalibrationProfile) {
  const used = new Set<string>();
  const positives = uniqueTake(
    await lexicalCandidateIds(
      profile.input.offerings,
      `${profile.id}:positive`,
    ),
    used,
  );
  const neighbors = uniqueTake(
    await lexicalCandidateIds(profile.neighborTerms, `${profile.id}:neighbor`),
    used,
  );
  const random = uniqueTake(
    await randomCandidateIds(`${profile.id}:random`),
    used,
  );
  const groups: Array<[SampleGroup, string[]]> = [
    ["probable_positive", positives],
    ["neighbor", neighbors],
    ["random", random],
  ];
  for (const [group, ids] of groups) {
    if (ids.length !== SAMPLE_SIZE)
      throw new Error(
        `${profile.id}: ${group} requires ${SAMPLE_SIZE} unique tenders; found ${ids.length}`,
      );
  }
  return groups.flatMap(([sampleGroup, ids]) =>
    ids.map((id) => ({ id, sampleGroup })),
  );
}

const runId = crypto.randomUUID();
const outputProfiles: unknown[] = [];
try {
  for (const profile of profiles) {
    const sample = await sampleForProfile(profile);
    const tenderIds = sample.map(({ id }) => id);
    const rows = await db
      .select({
        id: tendersTable.id,
        title: tendersTable.title,
        objectSummary: tendersTable.objectSummary,
        description: tendersTable.description,
        organizationName: tendersTable.organizationName,
        state: tendersTable.state,
        estimatedValue: tendersTable.estimatedValue,
        publishedAt: tendersTable.publishedAt,
      })
      .from(tendersTable)
      .where(inArray(tendersTable.id, tenderIds));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const tenders = sample.map(({ id, sampleGroup }) => {
      const tender = byId.get(id);
      if (!tender) throw new Error(`${profile.id}: missing tender ${id}`);
      return { ...tender, sampleGroup };
    });

    const userId = `calibration-fit-${runId}-${profile.id}`;
    await db.insert(usersTable).values({
      id: userId,
      email: `${userId}@example.invalid`,
      name: `Calibration ${profile.label}`,
      trialEndsAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    await db.insert(subscriptionsTable).values({
      userId,
      status: "active",
      currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
    });
    await putCompanyProfile(userId, profile.input);
    const response = await getTenderFits(userId, tenderIds, { wait: true });
    const pending = Object.values(response.results).filter(
      ({ status }) => status === "pending",
    );
    if (pending.length > 0)
      throw new Error(
        `${profile.id}: ${pending.length} fit evaluations remained pending`,
      );
    const fitRows = await db
      .select({
        tenderId: companyTenderFitsTable.tenderId,
        inputTokens: companyTenderFitsTable.inputTokens,
        estimatedCostUsd: companyTenderFitsTable.estimatedCostUsd,
      })
      .from(companyTenderFitsTable)
      .where(andUserAndTenders(userId, tenderIds));
    const costs = new Map(fitRows.map((row) => [row.tenderId, row]));
    const results = tenders.map((tender) => ({
      tender: {
        id: tender.id,
        title: tender.title,
        objectSummary: (tender.objectSummary ?? tender.description ?? "").slice(
          0,
          300,
        ),
        organizationName: tender.organizationName,
        state: tender.state,
        estimatedValue:
          tender.estimatedValue === null ? null : Number(tender.estimatedValue),
        publishedAt: tender.publishedAt,
      },
      sampleGroup: tender.sampleGroup,
      fit: response.results[tender.id],
      inputTokens: costs.get(tender.id)?.inputTokens ?? 0,
      estimatedCostUsd: Number(costs.get(tender.id)?.estimatedCostUsd ?? 0),
    }));
    const levelCounts = { high: 0, medium: 0, low: 0, filtered: 0 };
    for (const { fit } of results) {
      if (fit?.status === "filtered") levelCounts.filtered += 1;
      else if (fit?.level) levelCounts[fit.level] += 1;
    }
    outputProfiles.push({
      id: profile.id,
      label: profile.label,
      neighborTerms: profile.neighborTerms,
      input: profile.input,
      levelCounts,
      inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
      estimatedCostUsd: results.reduce(
        (sum, result) => sum + result.estimatedCostUsd,
        0,
      ),
      results,
    });
  }
  const output = {
    generatedAt: new Date().toISOString(),
    source:
      "PostgreSQL tenders; 10 probable positives, 10 explicit neighbors and 10 random tenders per profile; no fabricated tender data",
    model: aiConfig().model,
    promptVersion: COMPANY_FIT_PROMPT_VERSION,
    profiles: outputProfiles,
  };
  const path = resolve(
    process.cwd(),
    "../../docs/handoffs/CODEX_HANDOFF-013-calibration.json",
  );
  await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path}`);
} finally {
  const ids = profiles.map(({ id }) => `calibration-fit-${runId}-${id}`);
  await db.delete(usersTable).where(inArray(usersTable.id, ids));
}

function andUserAndTenders(userId: string, tenderIds: string[]) {
  return and(
    eq(companyTenderFitsTable.userId, userId),
    inArray(companyTenderFitsTable.tenderId, tenderIds),
  );
}
