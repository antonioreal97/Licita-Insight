import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import {
  aiFitDailyUsageTable,
  companyProfilesTable,
  companyTenderFitsTable,
  db,
  notificationsTable,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  tendersTable,
  usersTable,
  type FitReasonRecord,
} from "@workspace/db";
import { SubscriptionRequiredError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { hasAiAccess } from "./ask-tender-service";
import { aiConfig } from "./config";
import {
  companyFitTenderFingerprint,
  fitLevel,
  parseCompanyProfileInput,
  type CompanyProfileInput,
  type CompanySize,
} from "./company-fit-policy";
import {
  JevUnavailableError,
  scoreCompanyFit,
  scoreSizeRestriction,
} from "./jev-client";
import { fitLexicalGateMode } from "./fit-lexical-gate";
import { enqueueAiJob, runEnqueuedAiJobNow } from "./ai-job-queue";
import { appRoleFromEnv } from "../app-role";
import { isAiBatchBudgetPaused } from "./ai-budget";
import { recordSkippedJobRun } from "../jobs/job-lock";
import {
  matchServiceRegion,
  municipalityReference,
} from "../service-region/service-region";

export { fitLevel, parseCompanyProfileInput } from "./company-fit-policy";
export type { CompanyProfileInput, CompanySize } from "./company-fit-policy";
export type CompanyProfile = CompanyProfileInput & {
  version: number;
  updatedAt: Date;
};
export type TenderFit = {
  status: "ready" | "pending" | "filtered";
  level: "high" | "medium" | "low" | null;
  score: number | null;
  reasons: FitReasonRecord[];
  model: string | null;
  checkedAt: Date | null;
};

export const COMPANY_FIT_PROMPT_VERSION = 3;

const toProfile = (
  row: typeof companyProfilesTable.$inferSelect,
): CompanyProfile => ({
  description: row.description,
  offerings: row.offerings,
  exclusions: row.exclusions,
  selectedCategories: row.selectedCategories,
  selectedKeywords: row.selectedKeywords,
  excludedKeywords: row.excludedKeywords,
  registeredPlatforms: row.registeredPlatforms,
  coverage:
    row.coverageScope === "national"
      ? {
          scope: "national",
          mode: row.coverageMode,
          acceptsRemote: row.acceptsRemote,
        }
      : {
          scope: "custom",
          mode: row.coverageMode,
          acceptsRemote: row.acceptsRemote,
          regions: row.coverageRegions,
          states: row.coverageStates,
          municipalities: row.coverageMunicipalities.flatMap((code) => {
            const city = municipalityReference(code);
            return city ? [city] : [];
          }),
          radius:
            row.headquartersMunicipalityIbge && row.coverageRadiusKm
              ? (() => {
                  const center = municipalityReference(
                    row.headquartersMunicipalityIbge,
                  );
                  return center
                    ? {
                        center,
                        km: row.coverageRadiusKm as 50 | 100 | 200 | 300 | 500,
                      }
                    : null;
                })()
              : null,
        },
  valueRange: {
    min: row.valueMin === null ? null : Number(row.valueMin),
    max: row.valueMax === null ? null : Number(row.valueMax),
  },
  size: row.size as CompanySize,
  version: row.version,
  updatedAt: row.updatedAt,
});

/** Registered platforms do not feed the AI fit, so changing only them keeps the version and cached fits. */
const sameFitInput = (
  saved: CompanyProfile,
  input: CompanyProfileInput,
): boolean => {
  const {
    version: _version,
    updatedAt: _updatedAt,
    registeredPlatforms: _saved,
    ...savedFit
  } = saved;
  const { registeredPlatforms: _input, ...inputFit } = input;
  return isDeepStrictEqual(savedFit, inputFit);
};

export async function getCompanyProfile(
  userId: string,
): Promise<CompanyProfile | null> {
  const [row] = await db
    .select()
    .from(companyProfilesTable)
    .where(eq(companyProfilesTable.userId, userId))
    .limit(1);
  return row ? toProfile(row) : null;
}

export async function putCompanyProfile(
  userId: string,
  input: CompanyProfileInput,
  now = new Date(),
): Promise<CompanyProfile> {
  const row = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`company-profile:${userId}`}))`,
    );
    const [existing] = await tx
      .select()
      .from(companyProfilesTable)
      .where(eq(companyProfilesTable.userId, userId))
      .limit(1);
    if (existing && sameFitInput(toProfile(existing), input)) {
      const [saved] = await tx
        .update(companyProfilesTable)
        .set({ registeredPlatforms: input.registeredPlatforms, updatedAt: now })
        .where(eq(companyProfilesTable.userId, userId))
        .returning();
      return saved!;
    }
    const version = (existing?.version ?? 0) + 1;
    await tx
      .delete(companyTenderFitsTable)
      .where(eq(companyTenderFitsTable.userId, userId));
    const values = {
      userId,
      description: input.description,
      offerings: input.offerings,
      exclusions: input.exclusions,
      selectedCategories: input.selectedCategories,
      selectedKeywords: input.selectedKeywords,
      excludedKeywords: input.excludedKeywords,
      registeredPlatforms: input.registeredPlatforms,
      coverageScope: input.coverage.scope,
      coverageStates:
        input.coverage.scope === "custom" ? input.coverage.states : [],
      coverageRegions:
        input.coverage.scope === "custom" ? input.coverage.regions : [],
      coverageMunicipalities:
        input.coverage.scope === "custom"
          ? input.coverage.municipalities.map(({ ibgeCode }) => ibgeCode)
          : [],
      headquartersMunicipalityIbge:
        input.coverage.scope === "custom"
          ? (input.coverage.radius?.center.ibgeCode ?? null)
          : null,
      coverageRadiusKm:
        input.coverage.scope === "custom"
          ? (input.coverage.radius?.km ?? null)
          : null,
      coverageMode: input.coverage.mode,
      acceptsRemote: input.coverage.acceptsRemote,
      valueMin:
        input.valueRange.min === null ? null : input.valueRange.min.toFixed(2),
      valueMax:
        input.valueRange.max === null ? null : input.valueRange.max.toFixed(2),
      size: input.size,
      version,
      lastAlertAt: now,
      updatedAt: now,
    };
    const [saved] = await tx
      .insert(companyProfilesTable)
      .values({ ...values, createdAt: now })
      .onConflictDoUpdate({
        target: companyProfilesTable.userId,
        set: values,
      })
      .returning();
    return saved!;
  });
  return toProfile(row);
}

export async function deleteCompanyProfile(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(companyTenderFitsTable)
      .where(eq(companyTenderFitsTable.userId, userId));
    await tx
      .delete(companyProfilesTable)
      .where(eq(companyProfilesTable.userId, userId));
  });
}

type TenderRow = Pick<
  typeof tendersTable.$inferSelect,
  | "id"
  | "title"
  | "objectSummary"
  | "description"
  | "organizationName"
  | "estimatedValue"
  | "estimatedValueFlag"
  | "state"
  | "cityIbgeCode"
  | "items"
  | "categories"
  | "searchText"
>;

const tenderText = (tender: TenderRow): string =>
  [
    tender.title,
    tender.objectSummary,
    tender.description,
    ...tender.items.map((item) => item.description),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 12_000);

async function lexicalMatches(
  tenderId: string,
  values: string[],
): Promise<string[]> {
  if (values.length === 0) return [];
  const result = await db.execute<{ term: string }>(sql`
    select term
    from jsonb_array_elements_text(${JSON.stringify(values)}::jsonb) terms(term)
    join tenders t on t.id = ${tenderId}
    where to_tsvector('portuguese', concat_ws(' ', t.title, t.object_summary, t.description, t.items::text))
      @@ websearch_to_tsquery('portuguese', term)
    limit 20
  `);
  return result.rows.map(({ term }) => term);
}

export async function lexicalGatePasses(
  tenderId: string,
  offerings: string[],
): Promise<boolean> {
  if (offerings.length === 0) return false;
  const result = await db.execute<{ passed: boolean }>(sql`
    select exists (
      select 1
      from tenders t,
        jsonb_array_elements_text(${JSON.stringify(offerings)}::jsonb) terms(term),
        regexp_split_to_table(terms.term, '[^[:alnum:]]+') words(word)
      where t.id = ${tenderId}
        and length(words.word) >= 2
        and to_tsvector('portuguese', concat_ws(' ', t.title, t.object_summary, t.items::text))
          @@ plainto_tsquery('portuguese', words.word)
    ) as passed
  `);
  return result.rows[0]?.passed === true;
}

const normalizeProfileText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

export function explicitFilter(
  profile: CompanyProfile,
  tender: TenderRow,
): FitReasonRecord[] {
  const normalizedText = normalizeProfileText(tender.searchText);
  const excludedTerms = [
    ...profile.excludedKeywords,
    ...profile.exclusions,
  ].filter((term) => normalizedText.includes(normalizeProfileText(term)));
  if (excludedTerms.length > 0)
    return [{ kind: "exclusion", terms: excludedTerms.slice(0, 6) }];
  if (
    profile.coverage.scope === "custom" &&
    profile.coverage.mode === "strict"
  ) {
    const region = matchServiceRegion(profile.coverage, {
      state: tender.state,
      municipalityIbge: tender.cityIbgeCode,
      categories: tender.categories,
    });
    if (!region.matches)
      return [{ kind: "out_of_coverage", state: tender.state }];
  }
  // A value flagged as implausible says nothing about the real size of the contract: it filters nothing out.
  if (tender.estimatedValue !== null && !tender.estimatedValueFlag) {
    const value = Number(tender.estimatedValue);
    if (
      (profile.valueRange.min !== null && value < profile.valueRange.min) ||
      (profile.valueRange.max !== null && value > profile.valueRange.max)
    ) {
      return [{ kind: "out_of_value_range", estimatedValue: value }];
    }
  }
  return [];
}

async function sizeRestriction(tenderId: string): Promise<{
  reason: FitReasonRecord | null;
  model: string;
  inputTokens: number;
} | null> {
  const [index] = await db
    .select({
      version: tenderAiIndexesTable.version,
      status: tenderAiIndexesTable.status,
    })
    .from(tenderAiIndexesTable)
    .where(eq(tenderAiIndexesTable.tenderId, tenderId))
    .limit(1);
  if (!index || index.status !== "ready") return null;
  const result = await db.execute<{
    documentTitle: string;
    documentUrl: string;
    page: number;
    text: string;
  }>(sql`
    select d.title as "documentTitle", d.source_url as "documentUrl", p.page, p.text
    from ${tenderAiPassagesTable} p
    join ${tenderAiDocumentsTable} d on d.id = p.document_id,
      websearch_to_tsquery('portuguese', 'ME OR EPP OR microempresa OR "empresa de pequeno porte"') query
    where p.tender_id = ${tenderId} and p.index_version = ${index.version} and p.search_vector @@ query
    order by ts_rank_cd(p.search_vector, query) desc, p.page asc
    limit 4
  `);
  let quotaEvidence: (typeof result.rows)[number] | null = null;
  let model: string | null = null;
  let inputTokens = 0;
  for (const passage of result.rows) {
    const scored = await scoreSizeRestriction(passage.text);
    model = scored.model;
    inputTokens += scored.inputTokens;
    if (scored.restriction === "exclusive") {
      return {
        reason: {
          kind: "size_restricted",
          restriction: "me_epp_exclusive",
          evidence: passage,
        },
        model,
        inputTokens,
      };
    }
    if (scored.restriction === "quota" && !quotaEvidence)
      quotaEvidence = passage;
  }
  if (!model) return null;
  return {
    reason: quotaEvidence
      ? {
          kind: "size_restricted",
          restriction: "me_epp_quota",
          evidence: quotaEvidence,
        }
      : null,
    model,
    inputTokens,
  };
}

async function reserveFitQuota(userId: string, now: Date): Promise<boolean> {
  const day = dateInSaoPaulo(now);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`ai-fit:${userId}:${day}`}))`,
    );
    const [usage] = await tx
      .select({ used: aiFitDailyUsageTable.used })
      .from(aiFitDailyUsageTable)
      .where(
        and(
          eq(aiFitDailyUsageTable.userId, userId),
          eq(aiFitDailyUsageTable.quotaDay, day),
        ),
      )
      .limit(1);
    if ((usage?.used ?? 0) >= aiConfig().fitDailyLimit) return false;
    await tx
      .insert(aiFitDailyUsageTable)
      .values({ userId, quotaDay: day, used: 1 })
      .onConflictDoUpdate({
        target: [aiFitDailyUsageTable.userId, aiFitDailyUsageTable.quotaDay],
        set: { used: sql`${aiFitDailyUsageTable.used} + 1`, updatedAt: now },
      });
    return true;
  });
}

async function recordUsage(
  userId: string,
  now: Date,
  inputTokens: number,
): Promise<void> {
  const cost = inputTokens * 0.000000042;
  await db
    .update(aiFitDailyUsageTable)
    .set({
      inputTokens: sql`${aiFitDailyUsageTable.inputTokens} + ${inputTokens}`,
      estimatedCostUsd: sql`${aiFitDailyUsageTable.estimatedCostUsd} + ${cost.toFixed(8)}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(aiFitDailyUsageTable.userId, userId),
        eq(aiFitDailyUsageTable.quotaDay, dateInSaoPaulo(now)),
      ),
    );
}

async function processFit(
  rowId: string,
  userId: string,
  profile: CompanyProfile,
  tender: TenderRow,
  now = new Date(),
): Promise<void> {
  if (!(await reserveFitQuota(userId, now))) return;
  try {
    const explicitOfferings = [
      ...profile.selectedKeywords,
      ...profile.offerings,
    ];
    const allExclusions = [...profile.excludedKeywords, ...profile.exclusions];
    const offeringTerms = await lexicalMatches(tender.id, explicitOfferings);
    const semantic = await scoreCompanyFit({
      description: profile.description,
      offerings: explicitOfferings,
      exclusions: allExclusions,
      tenderText: tenderText(tender),
    });
    let inputTokens = semantic.inputTokens;
    let model = semantic.model;
    const reasons: FitReasonRecord[] = [];
    const region =
      profile.coverage.scope === "custom"
        ? matchServiceRegion(profile.coverage, {
            state: tender.state,
            municipalityIbge: tender.cityIbgeCode,
            categories: tender.categories,
          })
        : null;
    if (region?.matches)
      reasons.push({ kind: "service_region", text: region.reason });
    else if (region && profile.coverage.mode === "prioritize")
      reasons.push({ kind: "out_of_coverage", state: tender.state });
    if (offeringTerms.length > 0)
      reasons.push({
        kind: "offering_match",
        terms: offeringTerms.slice(0, 6),
      });
    if (tender.estimatedValue === null)
      reasons.push({ kind: "value_not_published" });
    const excludedTerms = semantic.exclusions
      .filter(
        ({ probability }) => probability >= aiConfig().fitExcludedThreshold,
      )
      .map(({ term }) => term);
    const excluded = excludedTerms.length > 0;
    if (excluded)
      reasons.push({
        kind: "exclusion",
        terms: excludedTerms.slice(0, 6),
      });
    const size =
      profile.size === "other" ? await sizeRestriction(tender.id) : null;
    if (size) {
      if (size.reason) reasons.push(size.reason);
      inputTokens += size.inputTokens;
      model = size.model;
    }
    const selectedKeywordMatch = offeringTerms.some((term) =>
      profile.selectedKeywords.includes(term),
    );
    const selectedCategoryMatch = tender.categories.some(({ slug }) =>
      profile.selectedCategories.includes(slug),
    );
    const regionAdjustment =
      profile.coverage.scope === "custom" &&
      profile.coverage.mode === "prioritize"
        ? region?.matches
          ? region.remote
            ? 0.15
            : 0.25
          : -0.25
        : 0;
    const score = Math.max(
      0,
      Math.min(
        1,
          semantic.fitScore / 3 +
          (selectedKeywordMatch ? 0.2 : 0) +
          (selectedCategoryMatch ? 0.25 : 0) +
          regionAdjustment,
      ),
    );
    const level = fitLevel(
      score,
      excluded,
      size?.reason?.kind === "size_restricted" ? size.reason.restriction : null,
    );
    const checkedAt = new Date();
    await db
      .update(companyTenderFitsTable)
      .set({
        status: "ready",
        level,
        score: score.toFixed(7),
        reasons: reasons.slice(0, 4),
        responseModel: model,
        inputTokens,
        estimatedCostUsd: (inputTokens * 0.000000042).toFixed(8),
        checkedAt,
        updatedAt: checkedAt,
      })
      .where(eq(companyTenderFitsTable.id, rowId));
    await recordUsage(userId, now, inputTokens);
  } catch (error) {
    await db
      .update(companyTenderFitsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(companyTenderFitsTable.id, rowId));
    logger.warn(
      { err: error, userId, tenderId: tender.id },
      "Company fit evaluation failed",
    );
    throw error;
  }
}

export async function executeCompanyFitJob(fitId: string): Promise<void> {
  const [fit] = await db
    .select()
    .from(companyTenderFitsTable)
    .where(eq(companyTenderFitsTable.id, fitId))
    .limit(1);
  if (!fit || fit.status === "ready" || fit.status === "filtered") return;
  const [profile, tender] = await Promise.all([
    getCompanyProfile(fit.userId),
    db
      .select({
        id: tendersTable.id,
        title: tendersTable.title,
        objectSummary: tendersTable.objectSummary,
        description: tendersTable.description,
        organizationName: tendersTable.organizationName,
        estimatedValue: tendersTable.estimatedValue,
        estimatedValueFlag: tendersTable.estimatedValueFlag,
        state: tendersTable.state,
        cityIbgeCode: tendersTable.cityIbgeCode,
        items: tendersTable.items,
        categories: tendersTable.categories,
        searchText: tendersTable.searchText,
      })
      .from(tendersTable)
      .where(eq(tendersTable.id, fit.tenderId))
      .limit(1),
  ]);
  if (!profile || !tender[0] || profile.version !== fit.profileVersion) return;
  await processFit(fit.id, fit.userId, profile, tender[0]);
}

const publicFit = (
  row: typeof companyTenderFitsTable.$inferSelect,
): TenderFit => ({
  status:
    row.status === "ready" || row.status === "filtered"
      ? row.status
      : "pending",
  // Level is derived from the stored score so a cut-off change applies to cached fits without a new Jev call.
  // A stored "low" stays low: it may have been forced by an exclusion or ME/EPP exclusivity.
  level:
    row.status === "ready" && row.score !== null && row.level !== "low"
      ? fitLevel(Number(row.score))
      : (row.level as TenderFit["level"]),
  score: row.score === null ? null : Number(row.score),
  reasons: row.reasons,
  model: row.responseModel,
  checkedAt: row.checkedAt,
});

async function ensureFit(
  userId: string,
  profile: CompanyProfile,
  tender: TenderRow,
  wait: boolean,
): Promise<TenderFit> {
  const config = aiConfig();
  const fingerprint = companyFitTenderFingerprint(tender);
  const key = `${userId}:${profile.version}:${tender.id}:${config.model}:${COMPANY_FIT_PROMPT_VERSION}`;
  const filters = explicitFilter(profile, tender);
  const gateMode = fitLexicalGateMode();
  const [existing] = await db
    .select()
    .from(companyTenderFitsTable)
    .where(
      and(
        eq(companyTenderFitsTable.userId, userId),
        eq(companyTenderFitsTable.profileVersion, profile.version),
        eq(companyTenderFitsTable.tenderId, tender.id),
        eq(companyTenderFitsTable.requestedModel, config.model),
        eq(companyTenderFitsTable.promptVersion, COMPANY_FIT_PROMPT_VERSION),
      ),
    )
    .limit(1);
  if (
    existing?.tenderFingerprint === fingerprint &&
    (existing.status === "ready" || existing.status === "filtered")
  )
    return publicFit(existing);
  if (
    existing?.tenderFingerprint === fingerprint &&
    (existing.status === "processing" || existing.status === "failed")
  ) {
    if (existing.updatedAt.getTime() > Date.now() - 5 * 60_000)
      return publicFit(existing);
  }
  const id = existing?.id ?? randomUUID();
  if (filters.length > 0) {
    const [row] = await db
      .insert(companyTenderFitsTable)
      .values({
        id,
        userId,
        tenderId: tender.id,
        profileVersion: profile.version,
        tenderFingerprint: fingerprint,
        requestedModel: config.model,
        promptVersion: COMPANY_FIT_PROMPT_VERSION,
        status: "filtered",
        level: "low",
        score: "0",
        reasons: filters,
        checkedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          companyTenderFitsTable.userId,
          companyTenderFitsTable.profileVersion,
          companyTenderFitsTable.tenderId,
          companyTenderFitsTable.requestedModel,
          companyTenderFitsTable.promptVersion,
        ],
        set: {
          tenderFingerprint: fingerprint,
          status: "filtered",
          level: "low",
          score: "0",
          reasons: filters,
          responseModel: null,
          lexicalGatePass: null,
          checkedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return publicFit(row!);
  }
  const lexicalGatePass =
    gateMode === "off"
      ? null
      : await lexicalGatePasses(tender.id, [
          ...profile.selectedKeywords,
          ...profile.offerings,
        ]);
  if (gateMode === "on" && !lexicalGatePass) {
    const checkedAt = new Date();
    const [gated] = await db
      .insert(companyTenderFitsTable)
      .values({
        id,
        userId,
        tenderId: tender.id,
        profileVersion: profile.version,
        tenderFingerprint: fingerprint,
        requestedModel: config.model,
        promptVersion: COMPANY_FIT_PROMPT_VERSION,
        status: "ready",
        level: "low",
        score: "0",
        reasons: [{ kind: "no_offering_term" }],
        lexicalGatePass: false,
        checkedAt,
        updatedAt: checkedAt,
      })
      .onConflictDoUpdate({
        target: [
          companyTenderFitsTable.userId,
          companyTenderFitsTable.profileVersion,
          companyTenderFitsTable.tenderId,
          companyTenderFitsTable.requestedModel,
          companyTenderFitsTable.promptVersion,
        ],
        set: {
          tenderFingerprint: fingerprint,
          status: "ready",
          level: "low",
          score: "0",
          reasons: [{ kind: "no_offering_term" }],
          responseModel: null,
          inputTokens: 0,
          estimatedCostUsd: "0",
          lexicalGatePass: false,
          checkedAt,
          updatedAt: checkedAt,
        },
      })
      .returning();
    return publicFit(gated!);
  }
  const [row] = await db
    .insert(companyTenderFitsTable)
    .values({
      id,
      userId,
      tenderId: tender.id,
      profileVersion: profile.version,
      tenderFingerprint: fingerprint,
      requestedModel: config.model,
      promptVersion: COMPANY_FIT_PROMPT_VERSION,
      status: "processing",
      lexicalGatePass,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        companyTenderFitsTable.userId,
        companyTenderFitsTable.profileVersion,
        companyTenderFitsTable.tenderId,
        companyTenderFitsTable.requestedModel,
        companyTenderFitsTable.promptVersion,
      ],
      set: {
        tenderFingerprint: fingerprint,
        status: "processing",
        level: null,
        score: null,
        reasons: [],
        responseModel: null,
        lexicalGatePass,
        checkedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  const queued = await enqueueAiJob({
    kind: "fit",
    dedupeKey: `fit:${key}`,
    tenderId: tender.id,
    userId,
    payload: { fitId: row!.id },
    lane: "batch",
  });
  if (queued.reason === "queue_full") {
    await db
      .update(companyTenderFitsTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(companyTenderFitsTable.id, row!.id));
  }
  if (wait) {
    if (appRoleFromEnv() === "all") {
      await runEnqueuedAiJobNow(`fit:${key}`);
    } else {
      for (let attempt = 0; attempt < 600; attempt += 1) {
        const [current] = await db
          .select({ status: companyTenderFitsTable.status })
          .from(companyTenderFitsTable)
          .where(eq(companyTenderFitsTable.id, row!.id))
          .limit(1);
        if (
          current?.status === "ready" ||
          current?.status === "filtered" ||
          current?.status === "failed"
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    const [completed] = await db
      .select()
      .from(companyTenderFitsTable)
      .where(eq(companyTenderFitsTable.id, row!.id))
      .limit(1);
    return completed ? publicFit(completed) : publicFit(row!);
  }
  return publicFit(row!);
}

export async function getTenderFits(
  userId: string,
  tenderIds: string[],
  options: { wait?: boolean } = {},
): Promise<{
  profileVersion: number | null;
  results: Record<string, TenderFit>;
}> {
  const profile = await getCompanyProfile(userId);
  if (!profile) return { profileVersion: null, results: {} };
  if (!(await hasAiAccess(userId))) throw new SubscriptionRequiredError();
  const rows = await db
    .select({
      id: tendersTable.id,
      title: tendersTable.title,
      objectSummary: tendersTable.objectSummary,
      description: tendersTable.description,
      organizationName: tendersTable.organizationName,
      estimatedValue: tendersTable.estimatedValue,
      estimatedValueFlag: tendersTable.estimatedValueFlag,
      state: tendersTable.state,
      cityIbgeCode: tendersTable.cityIbgeCode,
      items: tendersTable.items,
      categories: tendersTable.categories,
      searchText: tendersTable.searchText,
    })
    .from(tendersTable)
    .where(inArray(tendersTable.id, tenderIds));
  const entries = await Promise.all(
    rows.map(
      async (tender) =>
        [
          tender.id,
          await ensureFit(userId, profile, tender, options.wait ?? false),
        ] as const,
    ),
  );
  return {
    profileVersion: profile.version,
    results: Object.fromEntries(entries),
  };
}

export async function evaluateProfileAlertNotifications(
  completedAt = new Date(),
): Promise<number> {
  if (await isAiBatchBudgetPaused()) {
    await recordSkippedJobRun("profile_alerts", "skipped_budget");
    return 0;
  }
  const profiles = await db
    .select({
      userId: companyProfilesTable.userId,
      lastAlertAt: companyProfilesTable.lastAlertAt,
    })
    .from(companyProfilesTable)
    .innerJoin(usersTable, eq(usersTable.id, companyProfilesTable.userId))
    .where(eq(usersTable.profileAlerts, true));
  let created = 0;
  for (const profile of profiles) {
    if (!(await hasAiAccess(profile.userId, completedAt))) continue;
    const tenders = await db
      .select({
        id: tendersTable.id,
        title: tendersTable.title,
        organizationName: tendersTable.organizationName,
        proposalDeadline: tendersTable.proposalDeadline,
        createdAt: tendersTable.createdAt,
      })
      .from(tendersTable)
      .where(
        and(
          gt(tendersTable.createdAt, profile.lastAlertAt),
          lte(tendersTable.createdAt, completedAt),
        ),
      )
      .orderBy(asc(tendersTable.createdAt), asc(tendersTable.id))
      .limit(1_000);
    if (tenders.length === 0) {
      await db
        .update(companyProfilesTable)
        .set({ lastAlertAt: completedAt })
        .where(eq(companyProfilesTable.userId, profile.userId));
      continue;
    }
    const high: typeof tenders = [];
    let pending = false;
    for (let index = 0; index < tenders.length; index += 100) {
      const batch = tenders.slice(index, index + 100);
      const fits = await getTenderFits(
        profile.userId,
        batch.map(({ id }) => id),
        { wait: true },
      );
      for (const tender of batch) {
        const fit = fits.results[tender.id];
        if (fit?.status === "pending") pending = true;
        if (fit?.status === "ready" && fit.level === "high") high.push(tender);
      }
    }
    if (high.length > 0) {
      const snapshots = high.slice(0, 5).map((tender) => ({
        id: tender.id,
        title: tender.title,
        organizationName: tender.organizationName,
        proposalDeadline: tender.proposalDeadline,
        level: "high" as const,
      }));
      const inserted = await db
        .insert(notificationsTable)
        .values({
          id: randomUUID(),
          userId: profile.userId,
          type: "profile_new_matches",
          dedupeKey: `profile:${profile.userId}:${dateInSaoPaulo(completedAt)}`,
          createdAt: completedAt,
          matchCount: high.length,
          tenderIds: high.slice(0, 20).map(({ id }) => id),
          profileMatches: snapshots,
        })
        .onConflictDoNothing()
        .returning({ id: notificationsTable.id });
      created += inserted.length;
    }
    if (!pending) {
      const checkpoint =
        tenders.length < 1_000
          ? completedAt
          : tenders[tenders.length - 1]!.createdAt;
      await db
        .update(companyProfilesTable)
        .set({ lastAlertAt: checkpoint })
        .where(eq(companyProfilesTable.userId, profile.userId));
    }
  }
  return created;
}
