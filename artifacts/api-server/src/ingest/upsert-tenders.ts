import { inArray } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import type { TenderTimelineRecord } from "@workspace/db/schema";
import { mapPublication, mergeTimeline, type PublicationDraft } from "./pncp-map";

export type ExistingTender = {
  pncpControlNumber: string;
  status: string;
  proposalDeadline: Date | null;
  timeline: TenderTimelineRecord[];
  itemsNorm: string;
};

const publicationChanged = (
  existing: ExistingTender | undefined,
  draft: PublicationDraft,
): boolean =>
  existing !== undefined &&
  (existing.status !== draft.status ||
    (existing.proposalDeadline?.getTime() ?? null) !==
      (draft.proposalDeadline?.getTime() ?? null));

export async function upsertPublications(
  records: Record<string, unknown>[],
  now: Date,
): Promise<number> {
  if (records.length === 0) return 0;

  const drafts = records.map((record) => ({
    record,
    draft: mapPublication(record, now),
  }));
  const controlNumbers = drafts.map(({ draft }) => draft.pncpControlNumber);
  const existingRows = await db
    .select({
      pncpControlNumber: tendersTable.pncpControlNumber,
      status: tendersTable.status,
      proposalDeadline: tendersTable.proposalDeadline,
      timeline: tendersTable.timeline,
      itemsNorm: tendersTable.itemsNorm,
    })
    .from(tendersTable)
    .where(inArray(tendersTable.pncpControlNumber, controlNumbers));
  const existingByControl = new Map(
    existingRows.map((row) => [row.pncpControlNumber, row]),
  );

  for (const { record, draft } of drafts) {
    const existing = existingByControl.get(draft.pncpControlNumber);
    const searchText = [
      draft.titleNorm,
      draft.objectNorm,
      existing?.itemsNorm ?? "",
      draft.organizationNorm,
      draft.otherNorm,
    ]
      .filter(Boolean)
      .join(" ");
    const timeline = mergeTimeline(existing ?? null, draft, now);
    const changed = publicationChanged(existing, draft);
    const values = {
      id: draft.id,
      pncpControlNumber: draft.pncpControlNumber,
      title: draft.title,
      objectSummary: draft.objectSummary,
      description: draft.description,
      organizationId: draft.organizationId,
      organizationName: draft.organizationName,
      purchasingUnit: draft.purchasingUnit,
      modality: draft.modality,
      modalityLabel: draft.modalityLabel,
      status: draft.status,
      tenderNumber: draft.tenderNumber,
      processNumber: draft.processNumber,
      estimatedValue: draft.estimatedValue,
      estimatedValueStatus: draft.estimatedValueStatus,
      publishedAt: draft.publishedAt,
      openingAt: draft.openingAt,
      proposalDeadline: draft.proposalDeadline,
      state: draft.state,
      city: draft.city,
      cityIbgeCode: draft.cityIbgeCode,
      sourceId: draft.sourceId,
      sourceName: draft.sourceName,
      sourceUrl: draft.sourceUrl,
      categories: draft.categories,
      searchText,
      titleNorm: draft.titleNorm,
      objectNorm: draft.objectNorm,
      itemsNorm: existing?.itemsNorm ?? "",
      organizationNorm: draft.organizationNorm,
      otherNorm: draft.otherNorm,
      cityNorm: draft.cityNorm,
      rawPayload: { publication: record },
      timeline,
      fetchedAt: now,
      updatedAt: now,
    };

    await db
      .insert(tendersTable)
      .values(values)
      .onConflictDoUpdate({
        target: tendersTable.pncpControlNumber,
        set: {
          title: values.title,
          objectSummary: values.objectSummary,
          description: values.description,
          organizationId: values.organizationId,
          organizationName: values.organizationName,
          purchasingUnit: values.purchasingUnit,
          modality: values.modality,
          modalityLabel: values.modalityLabel,
          status: values.status,
          tenderNumber: values.tenderNumber,
          processNumber: values.processNumber,
          estimatedValue: values.estimatedValue,
          estimatedValueStatus: values.estimatedValueStatus,
          publishedAt: values.publishedAt,
          openingAt: values.openingAt,
          proposalDeadline: values.proposalDeadline,
          state: values.state,
          city: values.city,
          cityIbgeCode: values.cityIbgeCode,
          sourceId: values.sourceId,
          sourceName: values.sourceName,
          sourceUrl: values.sourceUrl,
          searchText: values.searchText,
          titleNorm: values.titleNorm,
          objectNorm: values.objectNorm,
          organizationNorm: values.organizationNorm,
          otherNorm: values.otherNorm,
          cityNorm: values.cityNorm,
          rawPayload: values.rawPayload,
          timeline: values.timeline,
          fetchedAt: values.fetchedAt,
          updatedAt: values.updatedAt,
          ...(changed ? { detailsFetchedAt: null } : {}),
        },
      });
  }

  return drafts.length;
}
