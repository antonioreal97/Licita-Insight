import { db, culturalOpportunitiesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { OpportunityDraft } from "./opportunity-map";
import type { FundingOpportunityDraft } from "./funding-parsers";

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
      registrationFrom: draft.registrationFrom,
      registrationTo: draft.registrationTo,
      status: draft.status,
      program: draft.program,
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
          registrationFrom: values.registrationFrom,
          registrationTo: values.registrationTo,
          status: values.status,
          program: values.program,
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

export async function upsertFundingOpportunities(
  drafts: FundingOpportunityDraft[],
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
      program: null,
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
