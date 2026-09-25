import { randomUUID } from "node:crypto";
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

export const COMPANY_FIT_PROMPT_VERSION = 2;
const runningFits = new Map<string, Promise<void>>();

const toProfile = (
  row: typeof companyProfilesTable.$inferSelect,
): CompanyProfile => ({
  description: row.description,
  offerings: row.offerings,
  exclusions: row.exclusions,
  coverage:
    row.coverageScope === "national"
      ? { scope: "national" }
      : { scope: "states", states: row.coverageStates },
  valueRange: {
    min: row.valueMin === null ? null : Number(row.valueMin),
    max: row.valueMax === null ? null : Number(row.valueMax),
  },
  size: row.size as CompanySize,
  version: row.version,
  updatedAt: row.updatedAt,
});

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
      .select({ version: companyProfilesTable.version })
      .from(companyProfilesTable)
      .where(eq(companyProfilesTable.userId, userId))
      .limit(1);
    const version = (existing?.version ?? 0) + 1;
    await tx
      .delete(companyTenderFitsTable)
      .where(eq(companyTenderFitsTable.userId, userId));
    const values = {
      userId,
      description: input.description,
      offerings: input.offerings,
      exclusions: input.exclusions,
      coverageScope: input.coverage.scope,
      coverageStates:
        input.coverage.scope === "states" ? input.coverage.states : [],
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
  | "state"
  | "items"
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

function explicitFilter(
  profile: CompanyProfile,
  tender: TenderRow,
): FitReasonRecord[] {
  if (
    profile.coverage.scope === "states" &&
    (!tender.state ||
      !profile.coverage.states.includes(tender.state.toUpperCase()))
  ) {
    return [{ kind: "out_of_coverage", state: tender.state }];
  }
  if (tender.estimatedValue !== null) {
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
    const offeringTerms = await lexicalMatches(tender.id, profile.offerings);
    const semantic = await scoreCompanyFit({
      description: profile.description,
      offerings: profile.offerings,
      exclusions: profile.exclusions,
      tenderText: tenderText(tender),
    });
    let inputTokens = semantic.inputTokens;
    let model = semantic.model;
    const reasons: FitReasonRecord[] = [];
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
    const score = Math.max(0, Math.min(1, semantic.fitScore / 3));
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
    if (error instanceof JevUnavailableError) return;
  }
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
    const active = runningFits.get(key);
    if (active && wait) {
      await active;
      const [completed] = await db
        .select()
        .from(companyTenderFitsTable)
        .where(eq(companyTenderFitsTable.id, existing.id))
        .limit(1);
      return completed ? publicFit(completed) : publicFit(existing);
    }
    if (active || existing.updatedAt.getTime() > Date.now() - 5 * 60_000)
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
          checkedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return publicFit(row!);
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
        checkedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  let task = runningFits.get(key);
  if (!task) {
    task = processFit(row!.id, userId, profile, tender).finally(() =>
      runningFits.delete(key),
    );
    runningFits.set(key, task);
  }
  if (wait) {
    await task;
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
      state: tendersTable.state,
      items: tendersTable.items,
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
