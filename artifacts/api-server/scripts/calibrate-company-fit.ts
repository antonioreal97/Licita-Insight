import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  companyTenderFitsTable,
  db,
  subscriptionsTable,
  tendersTable,
  usersTable,
} from "@workspace/db";
import {
  getTenderFits,
  putCompanyProfile,
  type CompanyProfileInput,
} from "../src/ai/company-fit-service";
import { aiConfig } from "../src/ai/config";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.env.JEV_API_KEY) throw new Error("JEV_API_KEY is required");

const profiles: Array<{
  id: string;
  label: string;
  input: CompanyProfileInput;
}> = [
  {
    id: "technology",
    label: "Tecnologia da informação",
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
      valueRange: { min: 5_000, max: 5_000_000 },
      size: "other",
    },
  },
  {
    id: "construction",
    label: "Construção e manutenção predial",
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
      valueRange: { min: 20_000, max: 20_000_000 },
      size: "me_epp",
    },
  },
  {
    id: "facilities",
    label: "Limpeza e facilities",
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
      exclusions: ["vigilância armada", "obra civil"],
      coverage: { scope: "national" },
      valueRange: { min: 10_000, max: 10_000_000 },
      size: "cooperative",
    },
  },
];

const tenders = await db
  .select({
    id: tendersTable.id,
    title: tendersTable.title,
    organizationName: tendersTable.organizationName,
    state: tendersTable.state,
    estimatedValue: tendersTable.estimatedValue,
    publishedAt: tendersTable.publishedAt,
  })
  .from(tendersTable)
  .orderBy(asc(tendersTable.id))
  .limit(30);
if (tenders.length !== 30)
  throw new Error(
    `Calibration requires 30 real tenders; found ${tenders.length}`,
  );

const runId = crypto.randomUUID();
const outputProfiles: unknown[] = [];
try {
  for (const profile of profiles) {
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
    const response = await getTenderFits(
      userId,
      tenders.map(({ id }) => id),
      { wait: true },
    );
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
      .where(
        andUserAndTenders(
          userId,
          tenders.map(({ id }) => id),
        ),
      );
    const costs = new Map(fitRows.map((row) => [row.tenderId, row]));
    const results = tenders.map((tender) => ({
      tender: {
        ...tender,
        estimatedValue:
          tender.estimatedValue === null ? null : Number(tender.estimatedValue),
      },
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
    source: "PostgreSQL tenders; no fabricated tender data",
    model: aiConfig().model,
    promptVersion: 1,
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
