import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import {
  aiFitDailyUsageTable,
  companyProfilesTable,
  companyTenderFitsTable,
  db,
  notificationsTable,
  pool,
  tenderAiDocumentsTable,
  tenderAiIndexesTable,
  tenderAiPassagesTable,
  tendersTable,
  usersTable,
  workspaceMembersTable,
  workspaceProfileSignalsTable,
  workspaceProfilesTable,
  workspacesTable,
  type FitReasonRecord,
  type WorkspaceCutoverMode,
} from "@workspace/db";
import {
  WORKSPACE_PROFILE_SCHEMA_VERSION,
  WorkspaceProfileSchema,
} from "@workspace/api-zod/hub";
import { SubscriptionRequiredError } from "../lib/api-error";
import {
  withCutoverGate,
  type CutoverCaller,
  type GateDatabase,
  type GateTransaction,
} from "../workspaces/cutover-gate";
import { readCutoverState } from "../workspaces/cutover-state";
import {
  cycleCaller,
  discardedByCutover,
  isCutoverInterruption,
  requireCutoverCycle,
  startCutoverCycle,
  type CutoverCycle,
} from "../workspaces/cutover-cycle";
import {
  companyProfileToWorkspaceProfile,
  workspaceProfileToCompanyProfile,
  writeWorkspaceProfile,
} from "../workspaces/workspace-profile-service";
import {
  defaultWorkspaceId,
  requireDefaultWorkspace,
} from "../workspaces/workspace-service";
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
import {
  enqueueAiJob,
  runEnqueuedAiJobNow,
  TerminalAiJobError,
} from "./ai-job-queue";
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

type CompanyProfileRow = typeof companyProfilesTable.$inferSelect;

const toProfile = (row: CompanyProfileRow): CompanyProfile => ({
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

/**
 * The v1 profile row from the model the cutover flag points to. In `workspaces` it is the default workspace profile
 * (never the active one) turned back into a `company_profiles` row by the C1 inverse, so both modes answer the same.
 */
export async function readCompanyProfileRow(
  userId: string,
  mode?: WorkspaceCutoverMode,
): Promise<CompanyProfileRow | null> {
  if ((mode ?? (await readCutoverState(pool)).mode) === "legacy") {
    const [row] = await db
      .select()
      .from(companyProfilesTable)
      .where(eq(companyProfilesTable.userId, userId))
      .limit(1);
    return row ?? null;
  }
  const workspace = await requireDefaultWorkspace(db, userId);
  const [profile] = await db
    .select()
    .from(workspaceProfilesTable)
    .where(eq(workspaceProfilesTable.workspaceId, workspace.id))
    .limit(1);
  return profile ? workspaceProfileToCompanyProfile(userId, profile) : null;
}

export async function getCompanyProfile(
  userId: string,
): Promise<CompanyProfile | null> {
  const row = await readCompanyProfileRow(userId);
  return row ? toProfile(row) : null;
}

const companyProfileValues = (
  userId: string,
  input: CompanyProfileInput,
  version: number,
  now: Date,
) => ({
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
});

async function putLegacyCompanyProfile(
  tx: GateTransaction,
  userId: string,
  input: CompanyProfileInput,
  now: Date,
): Promise<CompanyProfileRow> {
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
  await tx
    .delete(companyTenderFitsTable)
    .where(eq(companyTenderFitsTable.userId, userId));
  const values = companyProfileValues(
    userId,
    input,
    (existing?.version ?? 0) + 1,
    now,
  );
  const [saved] = await tx
    .insert(companyProfilesTable)
    .values({ ...values, createdAt: now })
    .onConflictDoUpdate({
      target: companyProfilesTable.userId,
      set: values,
    })
    .returning();
  return saved!;
}

/**
 * Same rules as the legacy save, decided on the legacy view of the stored profile: a change that only touches the
 * registered platforms keeps the version, the alert cursor and the fits. Last write wins (no `baseRevision`), but
 * `revision` still counts the save.
 */
async function putWorkspaceCompanyProfile(
  tx: GateTransaction,
  userId: string,
  input: CompanyProfileInput,
  now: Date,
): Promise<CompanyProfileRow> {
  const workspace = await requireDefaultWorkspace(tx, userId);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`licitai:workspace-profile:${workspace.id}`}, 0))`,
  );
  const [current] = await tx
    .select()
    .from(workspaceProfilesTable)
    .where(eq(workspaceProfilesTable.workspaceId, workspace.id))
    .limit(1);
  const existing = current
    ? workspaceProfileToCompanyProfile(userId, current)
    : undefined;
  const fitChanged = !existing || !sameFitInput(toProfile(existing), input);
  const { answers } = companyProfileToWorkspaceProfile({
    ...companyProfileValues(userId, input, 1, now),
    createdAt: now,
  });
  const { row } = await writeWorkspaceProfile(
    tx,
    workspace.id,
    current,
    WorkspaceProfileSchema.parse({
      schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
      type: "procurement",
      answers,
    }),
    fitChanged,
    now,
  );
  return workspaceProfileToCompanyProfile(userId, row);
}

export async function putCompanyProfile(
  userId: string,
  input: CompanyProfileInput,
  now = new Date(),
  database?: GateDatabase,
): Promise<CompanyProfile> {
  const row = await withCutoverGate(
    { kind: "http" },
    (tx, state) =>
      state.mode === "legacy"
        ? putLegacyCompanyProfile(tx, userId, input, now)
        : putWorkspaceCompanyProfile(tx, userId, input, now),
    database,
  );
  return toProfile(row);
}

export async function deleteCompanyProfile(
  userId: string,
  now = new Date(),
  database?: GateDatabase,
): Promise<void> {
  await withCutoverGate(
    { kind: "http" },
    async (tx, state) => {
      if (state.mode === "legacy") {
        await tx
          .delete(companyTenderFitsTable)
          .where(eq(companyTenderFitsTable.userId, userId));
        await tx
          .delete(companyProfilesTable)
          .where(eq(companyProfilesTable.userId, userId));
        return;
      }
      const workspace = await requireDefaultWorkspace(tx, userId);
      await tx
        .delete(companyTenderFitsTable)
        .where(eq(companyTenderFitsTable.workspaceId, workspace.id));
      await tx
        .delete(workspaceProfileSignalsTable)
        .where(eq(workspaceProfileSignalsTable.workspaceId, workspace.id));
      await tx
        .delete(workspaceProfilesTable)
        .where(eq(workspaceProfilesTable.workspaceId, workspace.id));
      await tx
        .update(workspacesTable)
        .set({ onboardingStatus: "not_started", updatedAt: now })
        .where(eq(workspacesTable.id, workspace.id));
    },
    database,
  );
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
      @@ phraseto_tsquery('portuguese', term)
    limit 20
  `);
  return result.rows.map(({ term }) => term);
}

/**
 * Each profile term must appear as a whole expression (words together, in order, Portuguese stemming):
 * "transmissão ao vivo" does not pass a notice that only says "ao vivo". Same rule as `lexicalMatches` and as the
 * profile preview count (`profilePhraseQuery` in profile/keyword-vocabulary.ts).
 */
export async function lexicalGatePasses(
  tenderId: string,
  offerings: string[],
): Promise<boolean> {
  if (offerings.length === 0) return false;
  const result = await db.execute<{ passed: boolean }>(sql`
    select exists (
      select 1
      from tenders t,
        jsonb_array_elements_text(${JSON.stringify(offerings)}::jsonb) terms(term)
      where t.id = ${tenderId}
        and numnode(phraseto_tsquery('portuguese', terms.term)) > 0
        and to_tsvector('portuguese', concat_ws(' ', t.title, t.object_summary, t.items::text))
          @@ phraseto_tsquery('portuguese', terms.term)
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
  cycle: CutoverCycle,
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
    // The model call above ran outside any transaction; only this short write holds the gate.
    await withCutoverGate(cycleCaller(cycle), (tx) =>
      tx
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
        .where(eq(companyTenderFitsTable.id, rowId)),
    );
    await recordUsage(userId, now, inputTokens);
  } catch (error) {
    // Interrupted by the cutover: the row stays `processing` and the job runs again in the current model.
    if (isCutoverInterruption(error)) throw error;
    await withCutoverGate(cycleCaller(cycle), (tx) =>
      tx
        .update(companyTenderFitsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(companyTenderFitsTable.id, rowId)),
    );
    logger.warn(
      { err: error, userId, tenderId: tender.id },
      "Company fit evaluation failed",
    );
    throw error;
  }
}

/**
 * The profile a `fit` job evaluates. In `workspaces` it comes from the workspace of the job, after checking that the
 * user is still a member; a removed membership cancels the job without reading the workspace
 * (docs/contracts/workspaces-v1.md). A job without a workspace in that mode is a broken cutover and dies loudly.
 */
async function fitJobProfile(
  fit: typeof companyTenderFitsTable.$inferSelect,
  jobWorkspaceId: string | null,
  cycle: CutoverCycle,
): Promise<CompanyProfile | null> {
  if (cycle.mode === "legacy") {
    const row = await readCompanyProfileRow(fit.userId, "legacy");
    return row ? toProfile(row) : null;
  }
  if (!jobWorkspaceId) {
    throw new TerminalAiJobError("fit job without workspace_id after cutover");
  }
  const [member] = await db
    .select({ role: workspaceMembersTable.role })
    .from(workspaceMembersTable)
    .where(
      and(
        eq(workspaceMembersTable.workspaceId, jobWorkspaceId),
        eq(workspaceMembersTable.userId, fit.userId),
      ),
    )
    .limit(1);
  if (!member || fit.workspaceId !== jobWorkspaceId) {
    logger.warn(
      { fitId: fit.id, member: Boolean(member) },
      "Fit job cancelled: the membership or the fit no longer belongs to its workspace",
    );
    return null;
  }
  const [profile] = await db
    .select()
    .from(workspaceProfilesTable)
    .where(eq(workspaceProfilesTable.workspaceId, jobWorkspaceId))
    .limit(1);
  return profile
    ? toProfile(workspaceProfileToCompanyProfile(fit.userId, profile))
    : null;
}

/** One job is one cycle: it does not start while writes are paused and writes in the mode it read the profile in. */
export async function executeCompanyFitJob(
  fitId: string,
  jobWorkspaceId: string | null = null,
): Promise<void> {
  const cycle = await requireCutoverCycle("fit_job");
  const [fit] = await db
    .select()
    .from(companyTenderFitsTable)
    .where(eq(companyTenderFitsTable.id, fitId))
    .limit(1);
  if (!fit || fit.status === "ready" || fit.status === "filtered") return;
  const [profile, tender] = await Promise.all([
    fitJobProfile(fit, jobWorkspaceId, cycle),
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
  await processFit(fit.id, fit.userId, profile, tender[0], cycle);
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
  mode: WorkspaceCutoverMode,
  profile: CompanyProfile,
  tender: TenderRow,
  wait: boolean,
  /** A request refuses during the pause; the profile-alert cycle that already started may go on. */
  caller: CutoverCaller,
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
        mode === "legacy"
          ? eq(companyTenderFitsTable.userId, userId)
          : eq(companyTenderFitsTable.workspaceId, defaultWorkspaceId(userId)),
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
  const lexicalGatePass =
    filters.length > 0 || gateMode === "off"
      ? null
      : await lexicalGatePasses(tender.id, [
          ...profile.selectedKeywords,
          ...profile.offerings,
        ]);
  // Only `tx` inside the gate: up to 100 fits run in parallel, and a second pool connection per fit could starve the pool.
  const row = await withCutoverGate(caller, async (tx, state) => {
    // Until W4 the conflict target and the dedupe key stay the legacy ones; the default workspace is the user's only one.
    const scope =
      state.mode === "workspaces" ? { workspaceId: defaultWorkspaceId(userId) } : {};
    if (filters.length > 0) {
      const [filtered] = await tx
        .insert(companyTenderFitsTable)
        .values({
          id,
          userId,
          ...scope,
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
            ...scope,
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
      return filtered!;
    }
    if (gateMode === "on" && !lexicalGatePass) {
      const checkedAt = new Date();
      const [gated] = await tx
        .insert(companyTenderFitsTable)
        .values({
          id,
          userId,
          ...scope,
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
            ...scope,
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
      return gated!;
    }
    const [processing] = await tx
      .insert(companyTenderFitsTable)
      .values({
        id,
        userId,
        ...scope,
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
          ...scope,
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
    const queued = await enqueueAiJob(
      {
        kind: "fit",
        dedupeKey: `fit:${key}`,
        tenderId: tender.id,
        userId,
        payload: { fitId: processing!.id },
        lane: "batch",
        ...scope,
      },
      tx,
    );
    if (queued.reason === "queue_full") {
      await tx
        .update(companyTenderFitsTable)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(companyTenderFitsTable.id, processing!.id));
    }
    return processing!;
  });
  if (row.status !== "processing" || !wait) return publicFit(row);
  if (appRoleFromEnv() === "all") {
    await runEnqueuedAiJobNow(`fit:${key}`);
  } else {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const [current] = await db
        .select({ status: companyTenderFitsTable.status })
        .from(companyTenderFitsTable)
        .where(eq(companyTenderFitsTable.id, row.id))
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
    .where(eq(companyTenderFitsTable.id, row.id))
    .limit(1);
  return completed ? publicFit(completed) : publicFit(row);
}

export async function getTenderFits(
  userId: string,
  tenderIds: string[],
  options: { wait?: boolean; cycle?: CutoverCycle } = {},
): Promise<{
  profileVersion: number | null;
  results: Record<string, TenderFit>;
}> {
  const mode = options.cycle?.mode ?? (await readCutoverState(pool)).mode;
  const caller: CutoverCaller = options.cycle
    ? cycleCaller(options.cycle)
    : { kind: "http" };
  const row = await readCompanyProfileRow(userId, mode);
  if (!row) return { profileVersion: null, results: {} };
  const profile = toProfile(row);
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
          await ensureFit(
            userId,
            mode,
            profile,
            tender,
            options.wait ?? false,
            caller,
          ),
        ] as const,
    ),
  );
  return {
    profileVersion: profile.version,
    results: Object.fromEntries(entries),
  };
}

type AlertProfile = {
  userId: string;
  workspaceId: string | null;
  lastAlertAt: Date;
};

/**
 * The profiles the daily alert evaluates, with their cursor: the account's profile in `legacy`, the profile of each
 * default workspace in `workspaces`. The alert preference stays with the account in both.
 */
async function alertProfiles(cycle: CutoverCycle): Promise<AlertProfile[]> {
  if (cycle.mode === "legacy") {
    const rows = await db
      .select({
        userId: companyProfilesTable.userId,
        lastAlertAt: companyProfilesTable.lastAlertAt,
      })
      .from(companyProfilesTable)
      .innerJoin(usersTable, eq(usersTable.id, companyProfilesTable.userId))
      .where(eq(usersTable.profileAlerts, true));
    return rows.map((row) => ({ ...row, workspaceId: null }));
  }
  const rows = await db
    .select({
      userId: workspacesTable.ownerUserId,
      workspaceId: workspacesTable.id,
      lastAlertAt: workspaceProfilesTable.lastAlertAt,
      updatedAt: workspaceProfilesTable.updatedAt,
    })
    .from(workspaceProfilesTable)
    .innerJoin(
      workspacesTable,
      eq(workspacesTable.id, workspaceProfilesTable.workspaceId),
    )
    .innerJoin(usersTable, eq(usersTable.id, workspacesTable.ownerUserId))
    .where(
      and(eq(workspacesTable.isDefault, true), eq(usersTable.profileAlerts, true)),
    );
  return rows.map(({ updatedAt, ...row }) => ({
    ...row,
    lastAlertAt: row.lastAlertAt ?? updatedAt,
  }));
}

/** The cursor lives with the profile: `company_profiles` in `legacy`, `workspace_profiles` in `workspaces`. */
const advanceAlertCursor = (
  tx: GateTransaction,
  profile: AlertProfile,
  lastAlertAt: Date,
) =>
  profile.workspaceId === null
    ? tx
        .update(companyProfilesTable)
        .set({ lastAlertAt })
        .where(eq(companyProfilesTable.userId, profile.userId))
    : tx
        .update(workspaceProfilesTable)
        .set({ lastAlertAt })
        .where(eq(workspaceProfilesTable.workspaceId, profile.workspaceId));

/**
 * One evaluation is one job cycle: it does not start while the cutover pauses writes, writes through the gate in the
 * mode it read the profiles in, and stops with what it already did if that mode changes.
 */
export async function evaluateProfileAlertNotifications(
  completedAt = new Date(),
): Promise<number> {
  if (await isAiBatchBudgetPaused()) {
    await recordSkippedJobRun("profile_alerts", "skipped_budget");
    return 0;
  }
  const cycle = await startCutoverCycle("profile_alerts");
  if (!cycle) return 0;
  let created = 0;
  try {
    for (const profile of await alertProfiles(cycle)) {
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
        await withCutoverGate(cycleCaller(cycle), (tx) =>
          advanceAlertCursor(tx, profile, completedAt),
        );
        continue;
      }
      const high: typeof tenders = [];
      let pending = false;
      for (let index = 0; index < tenders.length; index += 100) {
        const batch = tenders.slice(index, index + 100);
        const fits = await getTenderFits(
          profile.userId,
          batch.map(({ id }) => id),
          { wait: true, cycle },
        );
        for (const tender of batch) {
          const fit = fits.results[tender.id];
          if (fit?.status === "pending") pending = true;
          if (fit?.status === "ready" && fit.level === "high") high.push(tender);
        }
      }
      if (high.length === 0 && pending) continue;
      const checkpoint =
        tenders.length < 1_000
          ? completedAt
          : tenders[tenders.length - 1]!.createdAt;
      created += await withCutoverGate(cycleCaller(cycle), async (tx) => {
        let inserted = 0;
        if (high.length > 0) {
          const rows = await tx
            .insert(notificationsTable)
            .values({
              id: randomUUID(),
              userId: profile.userId,
              // The alert belongs to the workspace of its profile; the dedupe key keeps its legacy text until W4.
              ...(profile.workspaceId === null
                ? {}
                : { workspaceId: profile.workspaceId }),
              type: "profile_new_matches",
              dedupeKey: `profile:${profile.userId}:${dateInSaoPaulo(completedAt)}`,
              createdAt: completedAt,
              matchCount: high.length,
              tenderIds: high.slice(0, 20).map(({ id }) => id),
              profileMatches: high.slice(0, 5).map((tender) => ({
                id: tender.id,
                title: tender.title,
                organizationName: tender.organizationName,
                proposalDeadline: tender.proposalDeadline,
                level: "high" as const,
              })),
            })
            .onConflictDoNothing()
            .returning({ id: notificationsTable.id });
          inserted = rows.length;
        }
        if (!pending) await advanceAlertCursor(tx, profile, checkpoint);
        return inserted;
      });
    }
  } catch (error) {
    if (!discardedByCutover(error, "profile_alerts")) throw error;
  }
  return created;
}
