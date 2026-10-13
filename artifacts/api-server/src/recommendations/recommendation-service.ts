import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  companyProfilesTable,
  db,
  pool,
  recommendationDismissalsTable,
  recommendationEventsTable,
  recommendationInterestProfilesTable,
  recommendationMetricsDailyTable,
  savedSearchesTable,
  savedTendersTable,
  tendersTable,
  userRecommendationsTable,
  usersTable,
  workspacesTable,
  type RecommendationInterestProfile,
  type RecommendationReason,
  type TenderCategory,
  type WeightedRecommendationValue,
} from "@workspace/db";
import { readCompanyProfileRow } from "../ai/company-fit-service";
import { normalizeText, queryTokens } from "../domain/normalize";
import { withCutoverGate, type GateDatabase } from "../workspaces/cutover-gate";
import { readCutoverState } from "../workspaces/cutover-state";
import { requireDefaultWorkspace } from "../workspaces/workspace-service";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { NotFoundError } from "../lib/api-error";
import { tenderRowToDetail } from "../repositories/postgres-tender-repository";
import { logger } from "../lib/logger";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";
import {
  matchServiceRegion,
  municipalityReference,
  type ServiceRegionCoverage,
} from "../service-region/service-region";

const RETENTION_DAYS = 180;
const EVENT_HALF_LIFE_DAYS = 30;
const CANDIDATE_LIMIT = 500;
const RESULT_LIMIT = 50;
const TOP_TERMS = 30;

const STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "um",
  "uma",
  "contratacao",
  "aquisicao",
  "servico",
  "servicos",
  "fornecimento",
  "edital",
  "registro",
  "precos",
]);

export const normalizeSignalTerms = (value: string, limit = 30): string[] =>
  [
    ...new Set(
      queryTokens(value)
        .map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ""))
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
    ),
  ].slice(0, limit);

export const temporalWeight = (occurredAt: Date, now = new Date()): number => {
  const ageDays = Math.max(
    0,
    (now.getTime() - occurredAt.getTime()) / 86_400_000,
  );
  return 2 ** (-ageDays / EVENT_HALF_LIFE_DAYS);
};

type OpportunityProfileInput = Pick<
  typeof companyProfilesTable.$inferSelect,
  | "description"
  | "offerings"
  | "exclusions"
  | "selectedKeywords"
  | "excludedKeywords"
  | "coverageScope"
  | "coverageStates"
  | "valueMin"
  | "valueMax"
>;

/** Lightweight, deterministic opportunity matching reusing the recommendation/profile signals. */
export const scoreOpportunityForProfile = (
  opportunity: {
    searchText: string;
    state: string | null;
    amount: number | null;
    audience: string | null;
  },
  profile: OpportunityProfileInput,
): { score: number; reasons: string[] } | null => {
  const haystack = normalizeText(
    `${opportunity.searchText} ${opportunity.audience ?? ""}`,
  );
  const exclusions = [...profile.exclusions, ...profile.excludedKeywords]
    .flatMap((value) => [
      normalizeText(value).trim(),
      ...normalizeSignalTerms(value),
    ])
    .filter(Boolean);
  if (exclusions.some((term) => haystack.includes(term))) return null;

  const terms = [
    ...profile.selectedKeywords,
    ...profile.offerings,
    profile.description,
  ].flatMap((value) => normalizeSignalTerms(value));
  const matched = [
    ...new Set(terms.filter((term) => haystack.includes(term))),
  ].slice(0, 4);
  let score = Math.min(60, matched.length * 15);
  const reasons: string[] = [];
  if (matched.length > 0)
    reasons.push(`Combina com seu perfil: ${matched.join(", ")}`);

  const state = opportunity.state?.toUpperCase() ?? null;
  if (profile.coverageScope === "states") {
    if (
      !state ||
      !profile.coverageStates
        .map((value) => value.toUpperCase())
        .includes(state)
    ) {
      score -= 30;
    } else {
      score += 25;
      reasons.push(`Na sua área de atuação: ${state}`);
    }
  }

  if (
    opportunity.amount !== null &&
    (profile.valueMin !== null || profile.valueMax !== null)
  ) {
    const minimum = profile.valueMin === null ? null : Number(profile.valueMin);
    const maximum = profile.valueMax === null ? null : Number(profile.valueMax);
    if (
      (minimum === null || opportunity.amount >= minimum) &&
      (maximum === null || opportunity.amount <= maximum)
    ) {
      score += 15;
      reasons.push("Valor dentro da faixa do seu perfil");
    }
  }

  return score > 0 && reasons.length > 0
    ? { score: Math.min(100, score), reasons: reasons.slice(0, 3) }
    : null;
};

type WeightMap = Map<string, { label?: string; weight: number }>;
const addWeight = (
  map: WeightMap,
  value: string | null | undefined,
  weight: number,
  label?: string,
) => {
  const normalized = normalizeText(value ?? "").trim();
  if (!normalized || !Number.isFinite(weight) || weight <= 0) return;
  const previous = map.get(normalized);
  map.set(normalized, {
    label: label && weight >= (previous?.weight ?? 0) ? label : previous?.label,
    weight: (previous?.weight ?? 0) + weight,
  });
};
const weighted = (
  map: WeightMap,
  limit: number,
): WeightedRecommendationValue[] =>
  [...map.entries()]
    .map(([value, entry]) => ({
      value,
      ...(entry.label ? { label: entry.label } : {}),
      weight: Number(entry.weight.toFixed(4)),
    }))
    .sort((a, b) => b.weight - a.weight || a.value.localeCompare(b.value))
    .slice(0, limit);

type SignalTender = Pick<
  typeof tendersTable.$inferSelect,
  | "title"
  | "objectSummary"
  | "categories"
  | "state"
  | "organizationId"
  | "organizationName"
  | "modality"
  | "estimatedValue"
>;
const addTenderSignals = (
  maps: {
    terms: WeightMap;
    categories: WeightMap;
    states: WeightMap;
    organizations: WeightMap;
    modalities: WeightMap;
  },
  tender: SignalTender,
  weight: number,
  termSource?: "monitored" | "saved" | "view",
) => {
  normalizeSignalTerms(
    `${tender.title} ${tender.objectSummary ?? ""}`,
    18,
  ).forEach((term) =>
    addWeight(
      maps.terms,
      term,
      weight,
      termSource ? `${termSource}:${term}` : undefined,
    ),
  );
  tender.categories.forEach((category) =>
    addWeight(maps.categories, category.slug, weight, category.label),
  );
  addWeight(maps.states, tender.state, weight);
  addWeight(
    maps.organizations,
    tender.organizationId,
    weight,
    tender.organizationName,
  );
  addWeight(maps.modalities, tender.modality, weight);
};

export async function rebuildInterestProfile(
  userId: string,
  now = new Date(),
): Promise<RecommendationInterestProfile> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const [profile, saved, searches, events] = await Promise.all([
    readCompanyProfileRow(userId),
    db
      .select({ saved: savedTendersTable, tender: tendersTable })
      .from(savedTendersTable)
      .innerJoin(tendersTable, eq(tendersTable.id, savedTendersTable.tenderId))
      .where(eq(savedTendersTable.userId, userId)),
    db
      .select({ query: savedSearchesTable.query })
      .from(savedSearchesTable)
      .where(
        and(
          eq(savedSearchesTable.userId, userId),
          isNull(savedSearchesTable.deletedAt),
        ),
      ),
    db
      .select()
      .from(recommendationEventsTable)
      .where(
        and(
          eq(recommendationEventsTable.userId, userId),
          gt(recommendationEventsTable.occurredAt, cutoff),
        ),
      )
      .orderBy(desc(recommendationEventsTable.occurredAt)),
  ]);
  const maps = {
    terms: new Map(),
    categories: new Map(),
    states: new Map(),
    organizations: new Map(),
    modalities: new Map(),
  } as {
    terms: WeightMap;
    categories: WeightMap;
    states: WeightMap;
    organizations: WeightMap;
    modalities: WeightMap;
  };
  let signalCount = 0;
  const values: number[] = [];

  if (profile) {
    profile.selectedKeywords.forEach((keyword) =>
      addWeight(
        maps.terms,
        keyword,
        12,
        `profile_selected:${normalizeText(keyword)}`,
      ),
    );
    profile.selectedCategories.forEach((category) =>
      addWeight(maps.categories, category, 12, `profile_category:${category}`),
    );
    profile.offerings.forEach((offering) =>
      normalizeSignalTerms(offering).forEach((term) =>
        addWeight(maps.terms, term, 6, `profile:${term}`),
      ),
    );
    normalizeSignalTerms(profile.description).forEach((term) =>
      addWeight(maps.terms, term, 2, `profile:${term}`),
    );
    profile.coverageStates.forEach((state) => addWeight(maps.states, state, 5));
    signalCount +=
      profile.offerings.length +
        profile.selectedKeywords.length +
        profile.selectedCategories.length || 1;
  }
  for (const row of saved) {
    const weight = row.saved.monitored ? 10 : 6;
    addTenderSignals(
      maps,
      row.tender,
      weight,
      row.saved.monitored ? "monitored" : "saved",
    );
    // A value flagged as implausible would stretch the inferred value range.
    if (row.tender.estimatedValue !== null && !row.tender.estimatedValueFlag)
      values.push(Number(row.tender.estimatedValue));
    signalCount += row.saved.monitored ? 2 : 1;
  }
  for (const search of searches) {
    const params = new URLSearchParams(search.query);
    const raw = params.get("q") ?? search.query;
    normalizeSignalTerms(raw).forEach((term) =>
      addWeight(maps.terms, term, 3, `saved_search:${term}`),
    );
    params
      .getAll("category")
      .forEach((category) => addWeight(maps.categories, category, 3));
    params.getAll("state").forEach((state) => addWeight(maps.states, state, 3));
    params
      .getAll("organizationId")
      .forEach((organization) =>
        addWeight(maps.organizations, organization, 3),
      );
    signalCount += 1;
  }
  const viewIds = [
    ...new Set(
      events.flatMap((event) => (event.tenderId ? [event.tenderId] : [])),
    ),
  ];
  const viewed =
    viewIds.length === 0
      ? []
      : await db
          .select()
          .from(tendersTable)
          .where(inArray(tendersTable.id, viewIds));
  const viewedById = new Map(viewed.map((tender) => [tender.id, tender]));
  for (const event of events) {
    const decay = temporalWeight(event.occurredAt, now);
    if (event.type === "search")
      event.normalizedTerms.forEach((term) =>
        addWeight(maps.terms, term, 1.5 * decay, `search:${term}`),
      );
    else if (event.tenderId && viewedById.has(event.tenderId))
      addTenderSignals(
        maps,
        viewedById.get(event.tenderId)!,
        2 * decay,
        "view",
      );
    signalCount += 1;
  }
  values.sort((a, b) => a - b);
  const interest: RecommendationInterestProfile = {
    terms: weighted(maps.terms, TOP_TERMS),
    categories: weighted(maps.categories, 20),
    states: weighted(maps.states, 27),
    organizations: weighted(maps.organizations, 20),
    modalities: weighted(maps.modalities, 12),
    valueMin:
      profile?.valueMin === null || profile?.valueMin === undefined
        ? (values.at(Math.floor(values.length * 0.1)) ?? null)
        : Number(profile.valueMin),
    valueMax:
      profile?.valueMax === null || profile?.valueMax === undefined
        ? (values.at(Math.floor(values.length * 0.9)) ?? null)
        : Number(profile.valueMax),
    coverageScope: profile
      ? (profile.coverageScope as "national" | "states" | "custom")
      : null,
    coverageStates:
      profile?.coverageStates.map((state) => state.toUpperCase()) ?? [],
    coverageRegions: profile?.coverageRegions ?? [],
    coverageMunicipalities: profile?.coverageMunicipalities ?? [],
    headquartersMunicipalityIbge: profile?.headquartersMunicipalityIbge ?? null,
    coverageRadiusKm: profile?.coverageRadiusKm ?? null,
    coverageMode: profile?.coverageMode ?? "strict",
    acceptsRemote: profile?.acceptsRemote ?? false,
    exclusions: profile
      ? [...profile.excludedKeywords, ...profile.exclusions].flatMap(
          (value) => {
            const phrase = normalizeText(value).trim();
            return phrase ? [phrase, ...normalizeSignalTerms(value)] : [];
          },
        )
      : [],
    companySize: profile
      ? (profile.size as "me_epp" | "cooperative" | "other")
      : null,
    registeredPlatforms: profile?.registeredPlatforms ?? [],
    signalCount,
  };
  await db
    .insert(recommendationInterestProfilesTable)
    .values({ userId, profile: interest, signalCount, updatedAt: now })
    .onConflictDoUpdate({
      target: recommendationInterestProfilesTable.userId,
      set: { profile: interest, signalCount, updatedAt: now },
    });
  return interest;
}

type ScoreCandidate = {
  id: string;
  searchText: string;
  categories: TenderCategory[];
  state: string | null;
  municipalityIbge?: string | null;
  organizationId: string;
  organizationName: string;
  modality: string;
  platform: string | null;
  platformLabel: string | null;
  estimatedValue: string | null;
  /** Set when the value is implausible: it then counts neither for nor against the value range. */
  estimatedValueFlag?: string | null;
  proposalDeadline: Date | null;
  publishedAt: Date | null;
  textRank: number;
};
type DismissedSignal = { terms: string[]; categories: TenderCategory[] };

const weightFor = (
  values: WeightedRecommendationValue[],
  value: string | null | undefined,
) =>
  values.find((entry) => entry.value === normalizeText(value ?? ""))?.weight ??
  0;
const cappedRatio = (value: number, max: number) =>
  max <= 0 ? 0 : Math.min(1, value / max);

export function scoreRecommendation(
  candidate: ScoreCandidate,
  profile: RecommendationInterestProfile,
  dismissed: DismissedSignal[],
  now = new Date(),
): { score: number; reasons: RecommendationReason[] } | null {
  const normalizedText = normalizeText(candidate.searchText);
  if (profile.exclusions.some((term) => normalizedText.includes(term)))
    return null;
  const reasons: RecommendationReason[] = [];
  let score = 0;
  const maxCategory = profile.categories[0]?.weight ?? 0;
  const categoryMatches = candidate.categories
    .map((category) => ({
      category,
      weight: weightFor(profile.categories, category.slug),
    }))
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  if (categoryMatches[0]) {
    score += 25 * cappedRatio(categoryMatches[0].weight, maxCategory);
    reasons.push({
      kind: "saved",
      text: `Categoria parecida com seus interesses: ${categoryMatches[0].category.label}`,
    });
  }
  const matchedTerms = profile.terms
    .filter((term) => normalizedText.includes(term.value))
    .slice(0, 3);
  const termStrength = matchedTerms.reduce((sum, term) => sum + term.weight, 0);
  const maxTerms = profile.terms
    .slice(0, 3)
    .reduce((sum, term) => sum + term.weight, 0);
  score += Math.min(
    30,
    candidate.textRank * 20 + 18 * cappedRatio(termStrength, maxTerms),
  );
  if (matchedTerms.length) {
    const source = matchedTerms[0]!.label?.split(":", 1)[0];
    const terms = matchedTerms.map((term) => term.value).join(", ");
    if (source === "search")
      reasons.push({ kind: "search", text: `Você buscou: ${terms}` });
    else if (source === "saved_search")
      reasons.push({
        kind: "saved_search",
        text: `Em uma busca salva: ${terms}`,
      });
    else if (source === "monitored")
      reasons.push({
        kind: "monitored",
        text: `Parecido com editais que você monitora: ${terms}`,
      });
    else if (source === "saved")
      reasons.push({
        kind: "saved",
        text: `Parecido com editais salvos: ${terms}`,
      });
    else if (source === "profile" || source === "profile_selected")
      reasons.push({
        kind: "profile",
        text: `No seu perfil de atividade: ${terms}`,
      });
    else
      reasons.push({
        kind: "saved",
        text: `Parecido com seus interesses: ${terms}`,
      });
  }

  const state = candidate.state?.toUpperCase() ?? null;
  if (profile.coverageScope) {
    const legacyCustom = profile.coverageScope === "states";
    const center = profile.headquartersMunicipalityIbge
      ? municipalityReference(profile.headquartersMunicipalityIbge)
      : null;
    const coverage: ServiceRegionCoverage =
      profile.coverageScope === "national"
        ? {
            scope: "national",
            mode: profile.coverageMode ?? "strict",
            acceptsRemote: profile.acceptsRemote ?? false,
          }
        : {
            scope: "custom",
            mode:
              profile.coverageMode ?? (legacyCustom ? "prioritize" : "strict"),
            acceptsRemote: profile.acceptsRemote ?? false,
            regions: legacyCustom ? [] : (profile.coverageRegions ?? []),
            states: profile.coverageStates,
            municipalities: (profile.coverageMunicipalities ?? []).flatMap(
              (code) => {
                const city = municipalityReference(code);
                return city ? [city] : [];
              },
            ),
            radius:
              center && profile.coverageRadiusKm
                ? {
                    center,
                    km: profile.coverageRadiusKm as 50 | 100 | 200 | 300 | 500,
                  }
                : null,
          };
    const region = matchServiceRegion(coverage, {
      state,
      municipalityIbge: candidate.municipalityIbge ?? null,
      categories: candidate.categories,
    });
    if (
      !region.matches &&
      coverage.scope === "custom" &&
      coverage.mode === "strict"
    )
      return null;
    if (region.matches && coverage.scope === "custom") {
      score += region.remote ? 18 : 32;
      reasons.push({ kind: "location", text: region.reason });
    } else if (!region.matches && coverage.scope === "custom") {
      score -= 18;
      reasons.push({ kind: "location", text: region.reason });
    }
  } else if (weightFor(profile.states, state) > 0) {
    score += 9;
    reasons.push({
      kind: "location",
      text: `UF frequente nos seus interesses: ${state}`,
    });
  }
  const organizationWeight = weightFor(
    profile.organizations,
    candidate.organizationId,
  );
  if (organizationWeight > 0) {
    score +=
      8 *
      cappedRatio(organizationWeight, profile.organizations[0]?.weight ?? 0);
    reasons.push({
      kind: "organization",
      text: `Órgão relacionado ao seu histórico: ${candidate.organizationName}`,
    });
  }
  const value =
    candidate.estimatedValue === null || candidate.estimatedValueFlag
      ? null
      : Number(candidate.estimatedValue);
  if (
    value !== null &&
    (profile.valueMin !== null || profile.valueMax !== null)
  ) {
    const inRange =
      (profile.valueMin === null || value >= profile.valueMin) &&
      (profile.valueMax === null || value <= profile.valueMax);
    score += inRange ? 8 : -5;
    if (inRange)
      reasons.push({
        kind: "value",
        text: "Valor dentro da faixa dos seus interesses",
      });
  }
  // Only a tiebreaker: a registered platform never recommends a tender on its own.
  if (
    reasons.length > 0 &&
    candidate.platform &&
    profile.registeredPlatforms?.includes(candidate.platform)
  ) {
    score += 6;
    reasons.push({
      kind: "platform",
      text: `Disputa em plataforma onde você é cadastrado: ${candidate.platformLabel ?? candidate.platform}`,
    });
  }
  const days = candidate.proposalDeadline
    ? Math.max(
        0,
        (candidate.proposalDeadline.getTime() - now.getTime()) / 86_400_000,
      )
    : 120;
  score += days <= 3 ? 1 : days <= 15 ? 6 : days <= 45 ? 4 : 2;
  const ageDays = candidate.publishedAt
    ? Math.max(
        0,
        (now.getTime() - candidate.publishedAt.getTime()) / 86_400_000,
      )
    : 90;
  score += Math.max(0, 6 - ageDays / 10);
  const candidateSlugs = new Set(
    candidate.categories.map((category) => category.slug),
  );
  for (const negative of dismissed) {
    const categoryOverlap = negative.categories.some((category) =>
      candidateSlugs.has(category.slug),
    );
    const termOverlap = negative.terms.filter((term) =>
      normalizedText.includes(term),
    ).length;
    if (categoryOverlap) score -= 3;
    score -= Math.min(4, termOverlap);
  }
  return score > 0 && reasons.length > 0
    ? { score: Number(score.toFixed(5)), reasons: reasons.slice(0, 3) }
    : null;
}

const queryCandidates = async (
  profile: RecommendationInterestProfile,
  userId: string,
  now: Date,
): Promise<ScoreCandidate[]> => {
  const terms = profile.terms.slice(0, 12).map((term) => term.value);
  const query = terms.join(" OR ");
  const textRank = query
    ? sql<number>`ts_rank_cd(${tendersTable.recommendationSearchVector}, websearch_to_tsquery('portuguese', ${query}))`
    : sql<number>`0`;
  const categories = profile.categories
    .slice(0, 10)
    .map((category) => category.value);
  const states = profile.states
    .slice(0, 10)
    .map((state) => state.value.toUpperCase());
  // Terms are the selective path and use the expression GIN index. Categories/UFs are the fallback
  // for profiles without usable text; OR-ing all three would make a broad UF scan dominate at scale.
  const signalFilter = query
    ? sql`${tendersTable.recommendationSearchVector} @@ websearch_to_tsquery('portuguese', ${query})`
    : or(
        ...(categories.length
          ? [
              sql`${tendersTable.categories} @> any(array[${sql.join(
                categories.map(
                  (category) =>
                    sql`${JSON.stringify([{ slug: category }])}::jsonb`,
                ),
                sql`, `,
              )}])`,
            ]
          : []),
        ...(states.length
          ? [
              sql`upper(${tendersTable.state}) in (${sql.join(
                states.map((state) => sql`${state}`),
                sql`, `,
              )})`,
            ]
          : []),
      );
  const rows = await db
    .select({
      id: tendersTable.id,
      searchText: tendersTable.searchText,
      categories: tendersTable.categories,
      state: tendersTable.state,
      municipalityIbge: tendersTable.cityIbgeCode,
      organizationId: tendersTable.organizationId,
      organizationName: tendersTable.organizationName,
      modality: tendersTable.modality,
      platform: tendersTable.platform,
      platformLabel: tendersTable.platformLabel,
      estimatedValue: tendersTable.estimatedValue,
      estimatedValueFlag: tendersTable.estimatedValueFlag,
      proposalDeadline: tendersTable.proposalDeadline,
      publishedAt: tendersTable.publishedAt,
      textRank,
    })
    .from(tendersTable)
    .leftJoin(
      savedTendersTable,
      and(
        eq(savedTendersTable.tenderId, tendersTable.id),
        eq(savedTendersTable.userId, userId),
      ),
    )
    .leftJoin(
      recommendationDismissalsTable,
      and(
        eq(recommendationDismissalsTable.tenderId, tendersTable.id),
        eq(recommendationDismissalsTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(tendersTable.status, "open"),
        gt(tendersTable.proposalDeadline, now),
        isNull(savedTendersTable.tenderId),
        isNull(recommendationDismissalsTable.tenderId),
        signalFilter,
      ),
    )
    // Candidate retrieval stays cheap: the index filters first and novelty caps the working set.
    // ts_rank_cd is projected only for these rows, then combined with all signals in TypeScript.
    .orderBy(desc(tendersTable.publishedAt), asc(tendersTable.id))
    .limit(CANDIDATE_LIMIT);
  return rows.map((row) => ({ ...row, textRank: Number(row.textRank) || 0 }));
};

const diversify = <T extends { candidate: ScoreCandidate }>(
  ranked: T[],
): T[] => {
  const selected: T[] = [];
  const deferred: T[] = [];
  const organizations = new Map<string, number>();
  const categories = new Map<string, number>();
  for (const item of ranked) {
    const slug = item.candidate.categories[0]?.slug ?? "sem-categoria";
    const organizationCount =
      organizations.get(item.candidate.organizationId) ?? 0;
    const categoryCount = categories.get(slug) ?? 0;
    if (selected.length < 20 && (organizationCount >= 2 || categoryCount >= 3))
      deferred.push(item);
    else {
      selected.push(item);
      organizations.set(item.candidate.organizationId, organizationCount + 1);
      categories.set(slug, categoryCount + 1);
    }
  }
  return [...selected, ...deferred].slice(0, RESULT_LIMIT);
};

export async function rebuildRecommendationsForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  const profile = await rebuildInterestProfile(userId, now);
  if (
    profile.signalCount === 0 ||
    (profile.terms.length === 0 &&
      profile.categories.length === 0 &&
      profile.states.length === 0)
  ) {
    await db
      .delete(userRecommendationsTable)
      .where(eq(userRecommendationsTable.userId, userId));
    return 0;
  }
  const [candidates, dismissed] = await Promise.all([
    queryCandidates(profile, userId, now),
    db
      .select({
        terms: recommendationDismissalsTable.terms,
        categories: recommendationDismissalsTable.categories,
      })
      .from(recommendationDismissalsTable)
      .where(eq(recommendationDismissalsTable.userId, userId)),
  ]);
  const ranked = diversify(
    candidates
      .flatMap((candidate) => {
        const result = scoreRecommendation(candidate, profile, dismissed, now);
        return result ? [{ candidate, ...result }] : [];
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.candidate.id.localeCompare(b.candidate.id),
      ),
  );
  await db.transaction(async (tx) => {
    await tx
      .delete(userRecommendationsTable)
      .where(eq(userRecommendationsTable.userId, userId));
    if (ranked.length)
      await tx.insert(userRecommendationsTable).values(
        ranked.map((item, index) => ({
          userId,
          tenderId: item.candidate.id,
          rank: index + 1,
          score: item.score.toFixed(5),
          reasons: item.reasons,
          generatedAt: now,
        })),
      );
  });
  return ranked.length;
}

const pendingRebuilds = new Map<string, ReturnType<typeof setTimeout>>();
export function scheduleRecommendationRebuild(
  userId: string,
  delayMs = 1_500,
): void {
  const existing = pendingRebuilds.get(userId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pendingRebuilds.delete(userId);
    void rebuildRecommendationsForUser(userId).catch((error) =>
      logger.error({ err: error, userId }, "Recommendation rebuild failed"),
    );
  }, delayMs);
  timer.unref?.();
  pendingRebuilds.set(userId, timer);
}

const incrementMetric = async (
  field: "impressions" | "clicks" | "interests" | "dismissals",
  amount = 1,
  now = new Date(),
) => {
  if (amount <= 0) return;
  const day = dateInSaoPaulo(now);
  await db
    .insert(recommendationMetricsDailyTable)
    .values({ day, [field]: amount, updatedAt: now })
    .onConflictDoUpdate({
      target: recommendationMetricsDailyTable.day,
      set: {
        [field]: sql`${recommendationMetricsDailyTable[field]} + ${amount}`,
        updatedAt: now,
      },
    });
};

export async function listRecommendations(
  userId: string,
  page: number,
  pageSize: number,
) {
  let [{ total: storedTotal }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(userRecommendationsTable)
    .where(eq(userRecommendationsTable.userId, userId));
  if (Number(storedTotal) === 0) {
    await rebuildRecommendationsForUser(userId);
  }
  const now = new Date();
  const valid = and(
    eq(userRecommendationsTable.userId, userId),
    eq(tendersTable.status, "open"),
    gt(tendersTable.proposalDeadline, now),
    isNull(savedTendersTable.tenderId),
  );
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        recommendation: userRecommendationsTable,
        tender: tendersTable,
      })
      .from(userRecommendationsTable)
      .innerJoin(
        tendersTable,
        eq(tendersTable.id, userRecommendationsTable.tenderId),
      )
      .leftJoin(
        savedTendersTable,
        and(
          eq(savedTendersTable.tenderId, tendersTable.id),
          eq(savedTendersTable.userId, userId),
        ),
      )
      .where(valid)
      .orderBy(asc(userRecommendationsTable.rank))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(userRecommendationsTable)
      .innerJoin(
        tendersTable,
        eq(tendersTable.id, userRecommendationsTable.tenderId),
      )
      .leftJoin(
        savedTendersTable,
        and(
          eq(savedTendersTable.tenderId, tendersTable.id),
          eq(savedTendersTable.userId, userId),
        ),
      )
      .where(valid),
  ]);
  await incrementMetric("impressions", rows.length);
  const data = rows.map(({ recommendation, tender }) => {
    const detail = tenderRowToDetail(tender);
    const {
      description: _description,
      processNumber: _processNumber,
      items: _items,
      documents: _documents,
      timeline: _timeline,
      createdAt: _createdAt,
      detailsFetchedAt: _detailsFetchedAt,
      ...summary
    } = detail;
    return {
      tender: summary,
      score: Number(recommendation.score),
      reasons: recommendation.reasons,
      generatedAt: recommendation.generatedAt,
    };
  });
  const count = Number(total);
  return {
    data,
    pagination: {
      page,
      pageSize,
      total: count,
      totalPages: count === 0 ? 0 : Math.ceil(count / pageSize),
      totalIsEstimate: false,
    },
  };
}

export async function dismissRecommendation(
  userId: string,
  tenderId: string,
  now = new Date(),
) {
  const [tender] = await db
    .select()
    .from(tendersTable)
    .where(eq(tendersTable.id, tenderId))
    .limit(1);
  if (!tender) throw new NotFoundError("Tender was not found");
  await db.transaction(async (tx) => {
    await tx
      .insert(recommendationDismissalsTable)
      .values({
        userId,
        tenderId,
        terms: normalizeSignalTerms(
          `${tender.title} ${tender.objectSummary ?? ""}`,
          15,
        ),
        categories: tender.categories,
        dismissedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          recommendationDismissalsTable.userId,
          recommendationDismissalsTable.tenderId,
        ],
        set: { dismissedAt: now },
      });
    await tx
      .delete(userRecommendationsTable)
      .where(
        and(
          eq(userRecommendationsTable.userId, userId),
          eq(userRecommendationsTable.tenderId, tenderId),
        ),
      );
  });
  await incrementMetric("dismissals", 1, now);
  scheduleRecommendationRebuild(userId);
}

export async function getRecommendationPreferences(userId: string) {
  const [user] = await db
    .select({
      enabled: usersTable.recommendationPersonalizationEnabled,
      showInternationalOpportunities: usersTable.showInternationalOpportunities,
      updatedAt: usersTable.recommendationPreferencesUpdatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError("Account was not found");
  const { mode } = await readCutoverState(pool);
  return {
    personalizationEnabled: user.enabled,
    showInternationalOpportunities:
      mode === "legacy"
        ? user.showInternationalOpportunities
        : (await requireDefaultWorkspace(db, userId))
            .showInternationalOpportunities,
    updatedAt: user.updatedAt,
  };
}

export async function updateRecommendationPreferences(
  userId: string,
  enabled: boolean,
  deleteHistory: boolean,
  now = new Date(),
  /** Left as it is when the request does not send it. */
  showInternationalOpportunities?: boolean,
  database?: GateDatabase,
) {
  const showInternational = await withCutoverGate(
    { kind: "http" },
    async (tx, state) => {
      const legacy = state.mode === "legacy";
      const [saved] = await tx
        .update(usersTable)
        .set({
          recommendationPersonalizationEnabled: enabled,
          ...(!legacy || showInternationalOpportunities === undefined
            ? {}
            : { showInternationalOpportunities }),
          recommendationPreferencesUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(usersTable.id, userId))
        .returning({
          showInternationalOpportunities:
            usersTable.showInternationalOpportunities,
        });
      if (!enabled && deleteHistory)
        await tx
          .delete(recommendationEventsTable)
          .where(eq(recommendationEventsTable.userId, userId));
      if (legacy) return saved?.showInternationalOpportunities ?? false;
      const workspace = await requireDefaultWorkspace(tx, userId);
      if (showInternationalOpportunities === undefined)
        return workspace.showInternationalOpportunities;
      await tx
        .update(workspacesTable)
        .set({ showInternationalOpportunities, updatedAt: now })
        .where(eq(workspacesTable.id, workspace.id));
      return showInternationalOpportunities;
    },
    database,
  );
  scheduleRecommendationRebuild(userId, 0);
  return {
    personalizationEnabled: enabled,
    showInternationalOpportunities: showInternational,
    updatedAt: now,
  };
}

export async function deleteRecommendationHistory(
  userId: string,
): Promise<void> {
  await db
    .delete(recommendationEventsTable)
    .where(eq(recommendationEventsTable.userId, userId));
  scheduleRecommendationRebuild(userId, 0);
}

export async function recordRecommendationEvent(
  userId: string,
  input:
    | { type: "search"; query: string }
    | { type: "tender_view"; tenderId: string }
    | { type: "click" }
    | { type: "interest"; tenderId: string },
  now = new Date(),
): Promise<boolean> {
  if (input.type === "click") {
    await incrementMetric("clicks", 1, now);
    return true;
  }
  if (input.type === "interest") {
    return db.transaction(async (tx) => {
      const removed = await tx
        .delete(userRecommendationsTable)
        .where(
          and(
            eq(userRecommendationsTable.userId, userId),
            eq(userRecommendationsTable.tenderId, input.tenderId),
          ),
        )
        .returning({ tenderId: userRecommendationsTable.tenderId });
      if (removed.length === 0) return false;
      const day = dateInSaoPaulo(now);
      await tx
        .insert(recommendationMetricsDailyTable)
        .values({ day, interests: 1, updatedAt: now })
        .onConflictDoUpdate({
          target: recommendationMetricsDailyTable.day,
          set: {
            interests: sql`${recommendationMetricsDailyTable.interests} + 1`,
            updatedAt: now,
          },
        });
      return true;
    });
  }
  const [user] = await db
    .select({ enabled: usersTable.recommendationPersonalizationEnabled })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user?.enabled) return false;
  if (input.type === "search") {
    const normalizedTerms = normalizeSignalTerms(input.query);
    if (!normalizedTerms.length) return false;
    await db
      .insert(recommendationEventsTable)
      .values({ userId, type: "search", normalizedTerms, occurredAt: now });
  } else {
    const [tender] = await db
      .select({ id: tendersTable.id })
      .from(tendersTable)
      .where(eq(tendersTable.id, input.tenderId))
      .limit(1);
    if (!tender) throw new NotFoundError("Tender was not found");
    await db.insert(recommendationEventsTable).values({
      userId,
      type: "tender_view",
      tenderId: input.tenderId,
      occurredAt: now,
    });
  }
  scheduleRecommendationRebuild(userId);
  return true;
}

export async function runDailyRecommendations(
  now = new Date(),
): Promise<{ users: number; recommendations: number; deletedEvents: number }> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  const deleted = await db
    .delete(recommendationEventsTable)
    .where(lt(recommendationEventsTable.occurredAt, cutoff))
    .returning({ id: recommendationEventsTable.id });
  const users = await db.select({ id: usersTable.id }).from(usersTable);
  let recommendations = 0;
  for (const user of users)
    recommendations += await rebuildRecommendationsForUser(user.id, now);
  return {
    users: users.length,
    recommendations,
    deletedEvents: deleted.length,
  };
}

export function startRecommendationScheduler(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        await tryRunSingletonJob("daily_recommendations", () =>
          runDailyRecommendations(),
        );
      } catch (error) {
        logger.error({ err: error }, "Daily recommendations failed");
      } finally {
        if (!stopped) schedule();
      }
    }, millisecondsUntilSaoPauloHour(3));
    timer.unref?.();
  };
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
