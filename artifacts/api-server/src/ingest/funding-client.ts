import type { FundingOpportunityDraft } from "./funding-parsers";
import {
  parseCapesOpportunities,
  parseCnpqOpportunities,
  enrichFinepOpportunity,
  parseFinepOpportunities,
} from "./funding-parsers";
import type { OpportunitySource } from "@workspace/db";

export const FUNDING_USER_AGENT = `PardalDigital/${process.env.npm_package_version ?? "0.0.0"} (+https://pardaldigital.com; contato@pardaldigital.com)`;

export type FundingSourceResult = {
  source: OpportunitySource;
  outcome: "ok" | "blocked_by_robots" | "failed";
  count: number;
  message: string | null;
  drafts: FundingOpportunityDraft[];
};

type FetchText = (url: string) => Promise<string>;

const sourceDefinitions = [
  {
    source: "finep" as const,
    robots: "https://www.finep.gov.br/robots.txt",
    url: "https://www.finep.gov.br/chamadas-publicas/chamadapublica/1",
    parse: parseFinepOpportunities,
  },
  {
    source: "cnpq" as const,
    robots: "https://www.gov.br/cnpq/robots.txt",
    url: "https://www.gov.br/cnpq/pt-br/chamadas/abertas-para-submissao",
    parse: parseCnpqOpportunities,
  },
  {
    source: "capes" as const,
    robots: "https://www.gov.br/capes/robots.txt",
    url: "https://www.gov.br/capes/pt-br/assuntos/editais-e-resultados-capes",
    parse: parseCapesOpportunities,
  },
];

const productToken = FUNDING_USER_AGENT.split("/", 1)[0]!.toLowerCase();

/** A rule path is a prefix; `*` stands for any run of characters and a final `$` anchors the end (RFC 9309). */
const robotsPathPattern = (rulePath: string): RegExp => {
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const source = body
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`);
};

export const robotsAllows = (
  robots: string,
  url: string,
  agent = productToken,
): boolean => {
  const groups: Array<{
    agents: string[];
    rules: Array<{ allow: boolean; path: string }>;
  }> = [];
  let group: (typeof groups)[number] | undefined;
  let rulesStarted = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) {
      group = undefined;
      rulesStarted = false;
      continue;
    }
    const field = /^([^:]+):\s*(.*)$/.exec(line);
    if (!field) continue;
    const name = field[1]!.trim().toLowerCase();
    const value = field[2]!.trim();
    if (name === "user-agent") {
      if (!group || rulesStarted) {
        group = { agents: [], rules: [] };
        groups.push(group);
        rulesStarted = false;
      }
      group.agents.push(value.toLowerCase());
    } else if ((name === "allow" || name === "disallow") && group) {
      rulesStarted = true;
      if (value) group.rules.push({ allow: name === "allow", path: value });
    }
  }
  const applicable = groups.filter(({ agents }) =>
    agents.some((value) => value === "*" || agent.includes(value)),
  );
  const target = new URL(url);
  const path = `${target.pathname}${target.search}`;
  const matching = applicable
    .flatMap(({ rules }) => rules)
    .filter((rule) => robotsPathPattern(rule.path).test(path))
    .sort(
      (a, b) =>
        b.path.length - a.path.length || Number(b.allow) - Number(a.allow),
    );
  return matching[0]?.allow ?? true;
};

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const defaultFundingFetch: FetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      "user-agent": FUNDING_USER_AGENT,
      accept: "text/html,text/plain;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`${new URL(url).host} respondeu HTTP ${response.status}`);
  return await response.text();
};

export const collectFundingOnce = async (options?: {
  fetchText?: FetchText;
  now?: Date;
  delayMs?: number;
}): Promise<FundingSourceResult[]> => {
  const fetchText = options?.fetchText ?? defaultFundingFetch;
  const now = options?.now ?? new Date();
  const delayMs =
    options?.delayMs ?? Number(process.env.FUNDING_PAGE_DELAY_MS ?? 1_000);
  const results: FundingSourceResult[] = [];
  for (const definition of sourceDefinitions) {
    try {
      const robots = await fetchText(definition.robots);
      if (!robotsAllows(robots, definition.url)) {
        results.push({
          source: definition.source,
          outcome: "blocked_by_robots",
          count: 0,
          message:
            "A fonte proíbe coleta automatizada desta página no robots.txt.",
          drafts: [],
        });
        continue;
      }
      await wait(delayMs);
      const html = await fetchText(definition.url);
      let drafts = definition.parse(html, now);
      if (definition.source === "finep") {
        const enriched = [];
        for (const opportunity of drafts) {
          await wait(delayMs);
          const detail = await fetchText(opportunity.sourceUrl);
          enriched.push(enrichFinepOpportunity(opportunity, detail, now));
        }
        drafts = enriched;
      }
      results.push({
        source: definition.source,
        outcome: "ok",
        count: drafts.length,
        message: null,
        drafts,
      });
    } catch (error) {
      results.push({
        source: definition.source,
        outcome: "failed",
        count: 0,
        message: error instanceof Error ? error.message : String(error),
        drafts: [],
      });
    }
    await wait(delayMs);
  }
  return results;
};
