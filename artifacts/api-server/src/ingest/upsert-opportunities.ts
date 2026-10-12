import {
  db,
  culturalOpportunitiesTable,
  type OpportunitySource,
  type OpportunityTranslationSource,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeText } from "../domain/normalize";
import type { OpportunityDraft } from "./opportunity-map";
import type { FundingOpportunityDraft } from "./funding-parsers";
import type { FederalOpportunityDraft } from "./federal-draft";
import type { InternationalOpportunityDraft } from "./international-draft";
import { convertToBrl, type PtaxQuote } from "./ptax-client";

export async function upsertOpportunities(
  drafts: OpportunityDraft[],
  now: Date,
): Promise<number> {
  if (drafts.length === 0) return 0;

  for (const draft of drafts) {
    const values = {
      id: draft.id,
      installationId: draft.installationId,
      externalId: draft.externalId,
      title: draft.title,
      summary: draft.summary,
      organizationName: draft.organizationName,
      state: draft.state,
      city: draft.city,
      registrationFrom: draft.registrationFrom,
      registrationTo: draft.registrationTo,
      continuousFlow: draft.continuousFlow,
      status: draft.status,
      program: draft.program,
      areas: draft.areas,
      areaTerms: draft.areaTerms,
      opportunityType: draft.opportunityType,
      originName: draft.originName,
      sourceUrl: draft.sourceUrl,
      searchText: draft.searchText,
      rawPayload: draft.raw,
      fetchedAt: now,
      updatedAt: now,
    };
    await db
      .insert(culturalOpportunitiesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          culturalOpportunitiesTable.installationId,
          culturalOpportunitiesTable.externalId,
        ],
        set: {
          title: values.title,
          summary: values.summary,
          organizationName: values.organizationName,
          state: values.state,
          city: values.city,
          registrationFrom: values.registrationFrom,
          registrationTo: values.registrationTo,
          continuousFlow: values.continuousFlow,
          status: values.status,
          program: values.program,
          areas: values.areas,
          areaTerms: values.areaTerms,
          opportunityType: values.opportunityType,
          originName: values.originName,
          sourceUrl: values.sourceUrl,
          searchText: values.searchText,
          rawPayload: values.rawPayload,
          fetchedAt: values.fetchedAt,
          updatedAt: values.updatedAt,
        },
      });
  }

  return drafts.length;
}

/** Culture fields a federal draft carries and a funding draft leaves at the column defaults. */
type CultureFields = Pick<
  FederalOpportunityDraft,
  | "city"
  | "continuousFlow"
  | "program"
  | "areas"
  | "areaTerms"
  | "opportunityType"
  | "originName"
>;

export async function upsertFundingOpportunities(
  drafts: Array<FundingOpportunityDraft & Partial<CultureFields>>,
  now: Date,
): Promise<number> {
  for (const draft of drafts) {
    const values = {
      id: draft.id,
      installationId: draft.installationId,
      externalId: draft.externalId,
      kind: draft.kind,
      source: draft.source,
      title: draft.title,
      summary: draft.summary,
      organizationName: draft.organizationName,
      audience: draft.audience,
      amount: draft.amount === null ? null : String(draft.amount),
      documents: draft.documents,
      state: draft.state,
      registrationFrom: draft.registrationFrom,
      registrationTo: draft.registrationTo,
      status: draft.status,
      program: draft.program ?? null,
      city: draft.city ?? null,
      continuousFlow: draft.continuousFlow ?? false,
      areas: draft.areas ?? [],
      areaTerms: draft.areaTerms ?? [],
      opportunityType: draft.opportunityType ?? null,
      originName: draft.originName ?? null,
      sourceUrl: draft.sourceUrl,
      searchText: draft.searchText,
      rawPayload: draft.raw,
      fetchedAt: now,
      updatedAt: now,
    };
    await db
      .insert(culturalOpportunitiesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          culturalOpportunitiesTable.installationId,
          culturalOpportunitiesTable.externalId,
        ],
        set: {
          kind: values.kind,
          title: values.title,
          summary: values.summary,
          organizationName: values.organizationName,
          audience: values.audience,
          amount: values.amount,
          documents: values.documents,
          state: values.state,
          registrationFrom: values.registrationFrom,
          registrationTo: values.registrationTo,
          status: values.status,
          program: values.program,
          city: values.city,
          continuousFlow: values.continuousFlow,
          areas: values.areas,
          areaTerms: values.areaTerms,
          opportunityType: values.opportunityType,
          originName: values.originName,
          sourceUrl: values.sourceUrl,
          searchText: values.searchText,
          rawPayload: values.rawPayload,
          fetchedAt: values.fetchedAt,
          updatedAt: values.updatedAt,
        },
      });
  }
  return drafts.length;
}

/**
 * Closes the calls of one install that a complete listing no longer returns: the source unpublished them or
 * moved the closing date into the past. Without this a continuous-flow call, which has no closing date,
 * would stay open here forever.
 */
export async function closeMissingOpportunities(
  installationId: string,
  listedExternalIds: string[],
  now: Date,
): Promise<number> {
  const stillListed =
    listedExternalIds.length > 0
      ? sql`and ${culturalOpportunitiesTable.externalId} not in (${sql.join(
          listedExternalIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  const closed = await db
    .update(culturalOpportunitiesTable)
    .set({ status: "closed", updatedAt: now })
    .where(
      sql`${culturalOpportunitiesTable.installationId} = ${installationId}
        and ${culturalOpportunitiesTable.source} = 'mapas'
        and ${culturalOpportunitiesTable.status} in ('open', 'upcoming')
        ${stillListed}`,
    )
    .returning({ id: culturalOpportunitiesTable.id });
  return closed.length;
}

/**
 * Closes the calls of one federal source that its complete official listing no longer shows. A call with
 * no closing date of its own leaves the hub the day it leaves the "open" page of the source.
 */
export async function closeMissingSourceOpportunities(
  source: OpportunitySource,
  listedExternalIds: string[],
  now: Date,
): Promise<number> {
  const stillListed =
    listedExternalIds.length > 0
      ? sql`and ${culturalOpportunitiesTable.externalId} not in (${sql.join(
          listedExternalIds.map((id) => sql`${id}`),
          sql`, `,
        )})`
      : sql``;
  const closed = await db
    .update(culturalOpportunitiesTable)
    .set({ status: "closed", updatedAt: now })
    .where(
      sql`${culturalOpportunitiesTable.installationId} = ${source}
        and ${culturalOpportunitiesTable.source} = ${source}
        and ${culturalOpportunitiesTable.status} in ('open', 'upcoming')
        ${stillListed}`,
    )
    .returning({ id: culturalOpportunitiesTable.id });
  return closed.length;
}

/** Closes calls whose registration ended and opens ones whose window has started. */
export async function refreshOpportunityStatuses(now: Date): Promise<number> {
  const closed = await db
    .update(culturalOpportunitiesTable)
    .set({ status: "closed", updatedAt: now })
    .where(
      sql`${culturalOpportunitiesTable.status} in ('open', 'upcoming')
        and ${culturalOpportunitiesTable.registrationTo} is not null
        and ${culturalOpportunitiesTable.registrationTo} < ${now}`,
    )
    .returning({ id: culturalOpportunitiesTable.id });

  const opened = await db
    .update(culturalOpportunitiesTable)
    .set({ status: "open", updatedAt: now })
    .where(
      sql`${culturalOpportunitiesTable.status} = 'upcoming'
        and ${culturalOpportunitiesTable.registrationFrom} is not null
        and ${culturalOpportunitiesTable.registrationFrom} <= ${now}
        and (
          ${culturalOpportunitiesTable.registrationTo} is null
          or ${culturalOpportunitiesTable.registrationTo} >= ${now}
        )`,
    )
    .returning({ id: culturalOpportunitiesTable.id });

  return closed.length + opened.length;
}

/** What a new reading must not erase: a translation already made and the last conversion to reais. */
type KeptInternationalFields = {
  titleOriginal: string | null;
  titlePt: string | null;
  translationSource: OpportunityTranslationSource | null;
  translationAttempts: number;
  amountOriginal: string | null;
  currency: string | null;
  amountBrlApprox: string | null;
  fxRate: string | null;
  fxDate: string | null;
};

const translationAttemptsOf = (rawPayload: unknown): number => {
  const value =
    rawPayload !== null && typeof rawPayload === "object"
      ? (rawPayload as { translationAttempts?: unknown }).translationAttempts
      : null;
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
};

/**
 * Upserts the calls of the international sources. The Portuguese title is kept while the original title is
 * the same, and the value in reais is redone with the PTAX quote of the run; without a quote (the Banco
 * Central did not answer) the previous conversion stays, as long as the original value did not change.
 */
export async function upsertInternationalOpportunities(
  drafts: InternationalOpportunityDraft[],
  quotes: Map<string, PtaxQuote>,
  now: Date,
): Promise<number> {
  if (drafts.length === 0) return 0;
  const sources = [...new Set(drafts.map((draft) => draft.source))];
  const stored = await db
    .select({
      id: culturalOpportunitiesTable.id,
      titleOriginal: culturalOpportunitiesTable.titleOriginal,
      titlePt: culturalOpportunitiesTable.titlePt,
      translationSource: culturalOpportunitiesTable.translationSource,
      rawPayload: culturalOpportunitiesTable.rawPayload,
      amountOriginal: culturalOpportunitiesTable.amountOriginal,
      currency: culturalOpportunitiesTable.currency,
      amountBrlApprox: culturalOpportunitiesTable.amountBrlApprox,
      fxRate: culturalOpportunitiesTable.fxRate,
      fxDate: culturalOpportunitiesTable.fxDate,
    })
    .from(culturalOpportunitiesTable)
    .where(
      sql`${culturalOpportunitiesTable.source} in (${sql.join(
        sources.map((source) => sql`${source}`),
        sql`, `,
      )})`,
    );
  const kept = new Map<string, KeptInternationalFields>(
    stored.map(({ id, rawPayload, ...fields }) => [
      id,
      { ...fields, translationAttempts: translationAttemptsOf(rawPayload) },
    ]),
  );

  for (const draft of drafts) {
    const previous = kept.get(draft.id);
    const sameTitle = previous?.titleOriginal === draft.titleOriginal;
    const keepsTranslation =
      draft.titlePt === null && sameTitle && Boolean(previous?.titlePt);
    const titlePt = keepsTranslation ? previous!.titlePt : draft.titlePt;
    const translationSource = keepsTranslation
      ? previous!.translationSource
      : draft.translationSource;

    const amountOriginal =
      draft.amountOriginal === null ? null : draft.amountOriginal.toFixed(2);
    const quote =
      draft.amountOriginal !== null && draft.currency
        ? quotes.get(draft.currency)
        : undefined;
    const sameAmount =
      previous !== undefined &&
      amountOriginal !== null &&
      previous.currency === draft.currency &&
      previous.amountOriginal !== null &&
      Number(previous.amountOriginal) === draft.amountOriginal;
    const conversion = quote
      ? {
          amountBrlApprox: convertToBrl(draft.amountOriginal!, quote).toFixed(2),
          fxRate: quote.rate.toFixed(6),
          fxDate: quote.date,
        }
      : sameAmount
        ? {
            amountBrlApprox: previous!.amountBrlApprox,
            fxRate: previous!.fxRate,
            fxDate: previous!.fxDate,
          }
        : { amountBrlApprox: null, fxRate: null, fxDate: null };

    const values = {
      kind: draft.kind,
      source: draft.source,
      scope: draft.scope,
      agency: draft.agency,
      title: titlePt ?? draft.titleOriginal,
      titleOriginal: draft.titleOriginal,
      titlePt,
      translationSource,
      language: draft.language,
      summary: draft.summary,
      organizationName: draft.organizationName,
      originName: draft.originName,
      opportunityType: draft.opportunityType,
      country: draft.country,
      countryName: draft.countryName,
      region: draft.region,
      amountOriginal,
      currency: draft.currency,
      ...conversion,
      documents: draft.documents,
      registrationFrom: draft.registrationFrom,
      registrationTo: draft.registrationTo,
      deadlineTimeZone: draft.deadlineTimeZone,
      deadlinePrecision: draft.deadlinePrecision,
      deadlineOriginal: draft.deadlineOriginal,
      status: draft.status,
      brazilEligibility: draft.brazilEligibility.status,
      brazilEligibilityReason: draft.brazilEligibility.reason,
      brazilEligibilityRule: draft.brazilEligibility.rule,
      brazilFunding: draft.brazilFunding?.status ?? null,
      brazilFundingReason: draft.brazilFunding?.reason ?? null,
      eligibilityCheckedAt: now,
      sourceUrl: draft.sourceUrl,
      searchText:
        keepsTranslation && titlePt
          ? `${draft.searchText} ${normalizeText(titlePt)}`
          : draft.searchText,
      rawPayload: {
        ...draft.raw,
        ...(sameTitle && previous!.translationAttempts > 0
          ? { translationAttempts: previous!.translationAttempts }
          : {}),
      },
      fetchedAt: now,
      updatedAt: now,
    };
    await db
      .insert(culturalOpportunitiesTable)
      .values({
        id: draft.id,
        installationId: draft.installationId,
        externalId: draft.externalId,
        ...values,
      })
      .onConflictDoUpdate({
        target: [
          culturalOpportunitiesTable.installationId,
          culturalOpportunitiesTable.externalId,
        ],
        set: values,
      });
  }
  return drafts.length;
}

/** Titles of open international calls that still have no Portuguese version, soonest deadline first. */
export async function pendingInternationalTitles(
  languages: string[],
  limit: number,
  maxAttempts = 2,
): Promise<Array<{ id: string; text: string; language: string }>> {
  if (languages.length === 0 || limit <= 0) return [];
  const rows = await db
    .select({
      id: culturalOpportunitiesTable.id,
      text: culturalOpportunitiesTable.titleOriginal,
      language: culturalOpportunitiesTable.language,
    })
    .from(culturalOpportunitiesTable)
    .where(
      sql`${culturalOpportunitiesTable.scope} = 'international'
        and ${culturalOpportunitiesTable.titlePt} is null
        and ${culturalOpportunitiesTable.titleOriginal} is not null
        and ${culturalOpportunitiesTable.status} in ('open', 'upcoming')
        and ${culturalOpportunitiesTable.language} in (${sql.join(
          languages.map((language) => sql`${language}`),
          sql`, `,
        )})
        and coalesce((${culturalOpportunitiesTable.rawPayload} ->> 'translationAttempts')::int, 0) < ${maxAttempts}`,
    )
    .orderBy(
      sql`${culturalOpportunitiesTable.registrationTo} asc nulls last`,
      culturalOpportunitiesTable.id,
    )
    .limit(limit);
  return rows.flatMap((row) =>
    row.text && row.language
      ? [{ id: row.id, text: row.text, language: row.language }]
      : [],
  );
}

/** Counts one translation attempt, so a title the model cannot translate is not asked again forever. */
export async function recordTranslationAttempt(id: string): Promise<void> {
  await db
    .update(culturalOpportunitiesTable)
    .set({
      rawPayload: sql`jsonb_set(
        ${culturalOpportunitiesTable.rawPayload},
        '{translationAttempts}',
        to_jsonb(coalesce((${culturalOpportunitiesTable.rawPayload} ->> 'translationAttempts')::int, 0) + 1)
      )`,
    })
    .where(sql`${culturalOpportunitiesTable.id} = ${id}`);
}

/** Stores a Portuguese title made by a local model and makes it searchable. The original is kept. */
export async function saveTranslatedTitle(
  id: string,
  titlePt: string,
  now: Date,
): Promise<void> {
  await db
    .update(culturalOpportunitiesTable)
    .set({
      title: titlePt,
      titlePt,
      translationSource: "model",
      searchText: sql`${culturalOpportunitiesTable.searchText} || ' ' || ${normalizeText(titlePt)}`,
      updatedAt: now,
    })
    .where(
      sql`${culturalOpportunitiesTable.id} = ${id}
        and ${culturalOpportunitiesTable.titlePt} is null`,
    );
}
