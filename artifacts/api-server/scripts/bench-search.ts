// Search latency on the synthetic scale database (scale-seed.ts). Never point it at production.
//
//   DATABASE_URL=postgres://…/licita_scale pnpm exec tsx scripts/bench-search.ts [--iterations 7]
//     [--repository <module>] [--compare <module>]
//
// --repository benchmarks another PostgresTenderRepository module (e.g. the one from `main`, copied next to the
// current one with `git show main:<path> > src/repositories/baseline-tender-repository.ts`). --compare checks that
// both modules return the same page, total and facets for every case, and exits non-zero on any difference.
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { parseSearchQuery } from "../src/lib/query-parser";
import type { PostgresTenderRepository } from "../src/repositories/postgres-tender-repository";
import { invalidateTenderFacetCache } from "../src/lib/tender-facet-cache";

if (!process.env.DATABASE_URL?.includes("licita_scale")) {
  throw new Error(
    "DATABASE_URL must point at the synthetic licita_scale database",
  );
}

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const iterations = Number(arg("--iterations") ?? "7");
if (!Number.isSafeInteger(iterations) || iterations < 2) {
  throw new Error("--iterations must be an integer >= 2");
}

type Repository = Pick<PostgresTenderRepository, "search">;

const loadRepository = async (path: string): Promise<Repository> => {
  const module = (await import(pathToFileURL(resolve(path)).href)) as {
    PostgresTenderRepository: new () => Repository;
  };
  return new module.PostgresTenderRepository();
};

const CASES: { id: string; query: Record<string, string> }[] = [
  { id: "q=limpeza", query: { q: "limpeza" } },
  { id: "state=BA", query: { state: "BA" } },
  {
    id: "q=merenda escolar&state=SP",
    query: { q: "merenda escolar", state: "SP" },
  },
  { id: "(sem filtros)", query: {} },
  { id: "q=asfalto", query: { q: "asfalto" } },
  { id: "q=pavimentacao&state=MG", query: { q: "pavimentacao", state: "MG" } },
  { id: "status=open", query: { status: "open" } },
  { id: "status=open&q=limpeza", query: { status: "open", q: "limpeza" } },
  { id: "status=open&state=SP", query: { status: "open", state: "SP" } },
  {
    id: "status=open&modality=pregao_eletronico",
    query: { status: "open", modality: "pregao_eletronico" },
  },
  {
    id: "status=open&category=limpeza-higiene",
    query: { status: "open", category: "limpeza-higiene" },
  },
  {
    id: "status=open&q=merenda&state=SP",
    query: { status: "open", q: "merenda", state: "SP" },
  },
  {
    id: "status=open&sort=deadline_asc",
    query: { status: "open", sort: "deadline_asc" },
  },
  {
    id: "status=open&sort=value_desc",
    query: { status: "open", sort: "value_desc" },
  },
  {
    id: "status=open&platform=comprasgov",
    query: { status: "open", platform: "comprasgov" },
  },
];

const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

const ms = (value: number): string => value.toFixed(0);

const repository = await loadRepository(
  arg("--repository") ?? "src/repositories/postgres-tender-repository.ts",
);
const comparePath = arg("--compare");
const reference = comparePath ? await loadRepository(comparePath) : undefined;
const verifyCache = process.argv.includes("--verify-cache");

console.log(
  "| Consulta | Resultados | 1ª vez | p50 | p95 | p50 sem facetas |\n|---|---:|---:|---:|---:|---:|",
);
const differences: string[] = [];
for (const { id, query } of CASES) {
  const criteria = parseSearchQuery({
    pageSize: "20",
    facets: "true",
    ...query,
  });
  const withFacets: number[] = [];
  let total = 0;
  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    const result = await repository.search(criteria);
    withFacets.push(performance.now() - startedAt);
    total = result.pagination.total;
  }
  const withoutFacets: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const startedAt = performance.now();
    await repository.search({ ...criteria, facets: false });
    withoutFacets.push(performance.now() - startedAt);
  }
  const warm = withFacets.slice(1);
  console.log(
    `| \`${id}\` | ${total} | ${ms(withFacets[0]!)} | ${ms(percentile(warm, 50))} | ${ms(percentile(warm, 95))} | ${ms(percentile(withoutFacets, 50))} |`,
  );

  if (reference) {
    const [actual, expected] = await Promise.all([
      repository.search(criteria),
      reference.search(criteria),
    ]);
    const comparable = (result: typeof actual) => ({
      data: result.data,
      pagination: result.pagination,
      facets: result.facets,
    });
    if (!isDeepStrictEqual(comparable(actual), comparable(expected))) {
      differences.push(id);
    }
  }
  if (verifyCache && !reference) {
    const cached = await repository.search(criteria);
    invalidateTenderFacetCache();
    const fresh = await repository.search(criteria);
    const comparable = (result: typeof cached) => ({
      data: result.data,
      pagination: result.pagination,
      facets: result.facets,
    });
    if (!isDeepStrictEqual(comparable(cached), comparable(fresh))) {
      differences.push(id);
    }
  }
}

if (reference || verifyCache) {
  if (differences.length > 0) {
    console.error(`\nDifferent results: ${differences.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(
      `\nSame page, total and facets in all ${CASES.length} cases${verifyCache ? " with and without a warm facet cache" : ""}.`,
    );
  }
}
process.exit();
