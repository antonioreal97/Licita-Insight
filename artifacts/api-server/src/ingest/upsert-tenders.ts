import { inArray, sql } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import type { TenderTimelineRecord } from "@workspace/db/schema";
import {
  buildSearchColumns,
  mapPublication,
  mergeTimeline,
  parsePncpDate,
  pncpTenderNumberShort,
  type PublicationDraft,
} from "./pncp-map";
import { createTenderChangeNotifications } from "../account/notification-service";
import { enqueueCollectedTitleRewrites } from "../titles/title-rewrite";
import { invalidateTenderFacetCache } from "../lib/tender-facet-cache";

export type ExistingTender = {
  pncpControlNumber: string;
  status: string;
  proposalDeadline: Date | null;
  title: string;
  organizationName: string;
  estimatedValue: string | null;
  estimatedValueStatus: string;
  timeline: TenderTimelineRecord[];
  itemsNorm: string;
  displayTitle: string | null;
  displayTitleSource: "rules" | "model" | null;
  displayTitleNorm: string;
  categories: { slug: string; label: string }[];
  categorySource: "rules" | "student" | "teacher" | null;
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
      title: tendersTable.title,
      organizationName: tendersTable.organizationName,
      estimatedValue: tendersTable.estimatedValue,
      estimatedValueStatus: tendersTable.estimatedValueStatus,
      timeline: tendersTable.timeline,
      itemsNorm: tendersTable.itemsNorm,
      displayTitle: tendersTable.displayTitle,
      displayTitleSource: tendersTable.displayTitleSource,
      displayTitleNorm: tendersTable.displayTitleNorm,
      categories: tendersTable.categories,
      categorySource: tendersTable.categorySource,
    })
    .from(tendersTable)
    .where(inArray(tendersTable.pncpControlNumber, controlNumbers));
  const existingByControl = new Map(
    existingRows.map((row) => [row.pncpControlNumber, row]),
  );

  const newOrRetitled: string[] = [];
  for (const { record, draft } of drafts) {
    const existing = existingByControl.get(draft.pncpControlNumber);
    if (!existing || existing.title !== draft.title)
      newOrRetitled.push(draft.id);
    const displayTitle =
      existing?.displayTitleSource === "model"
        ? existing.displayTitle
        : draft.displayTitle;
    const categories =
      existing &&
      (existing.categorySource === "teacher" || existing.categories.length > 0)
        ? existing.categories
        : draft.categories;
    const search = buildSearchColumns({
      title: draft.title,
      displayTitle,
      objectSummary: draft.objectSummary,
      itemDescriptions: [],
      organizationName: draft.organizationName,
      purchasingUnit: draft.purchasingUnit,
      city: draft.city,
      state: draft.state,
      modalityLabel: draft.modalityLabel,
      itemsNorm: existing?.itemsNorm ?? "",
      categories,
    });
    const timeline = mergeTimeline(existing ?? null, draft, now);
    const changed = publicationChanged(existing, draft);
    const values = {
      id: draft.id,
      pncpControlNumber: draft.pncpControlNumber,
      title: draft.title,
      displayTitle: draft.displayTitle,
      displayTitleSource: draft.displayTitleSource,
      displayTitleVersion: draft.displayTitleVersion,
      displayTitleNorm: draft.displayTitleNorm,
      displayTitleNeedsModel: draft.displayTitleNeedsModel,
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
      estimatedValueFlag: draft.estimatedValueFlag,
      publishedAt: draft.publishedAt,
      openingAt: draft.openingAt,
      proposalDeadline: draft.proposalDeadline,
      state: draft.state,
      city: draft.city,
      cityIbgeCode: draft.cityIbgeCode,
      sourceId: draft.sourceId,
      sourceName: draft.sourceName,
      sourceUrl: draft.sourceUrl,
      platform: draft.platform,
      platformLabel: draft.platformLabel,
      categories: draft.categories,
      categorySource: draft.categories.length > 0 ? ("rules" as const) : null,
      categorizedAt: draft.categories.length > 0 ? now : null,
      searchText: search.searchText,
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

    await db.transaction(async (tx) => {
      await tx
        .insert(tendersTable)
        .values(values)
        .onConflictDoUpdate({
          target: tendersTable.pncpControlNumber,
          set: {
            title: values.title,
            categories: sql`case
              when ${tendersTable.categorySource} = 'teacher' or jsonb_array_length(${tendersTable.categories}) > 0
                then ${tendersTable.categories}
              else ${JSON.stringify(values.categories)}::jsonb
            end`,
            categorySource: sql`case
              when ${tendersTable.categorySource} = 'teacher' or jsonb_array_length(${tendersTable.categories}) > 0
                then ${tendersTable.categorySource}
              when jsonb_array_length(${JSON.stringify(values.categories)}::jsonb) > 0 then 'rules'
              else ${tendersTable.categorySource}
            end`,
            categorizedAt: sql`case
              when ${tendersTable.categorySource} = 'teacher'
                then ${tendersTable.categorizedAt}
              when ${tendersTable.categorySource} = 'student' and ${tendersTable.title} is distinct from ${values.title}
                then null
              when jsonb_array_length(${tendersTable.categories}) > 0 then ${tendersTable.categorizedAt}
              when jsonb_array_length(${JSON.stringify(values.categories)}::jsonb) > 0 then ${now}
              else ${tendersTable.categorizedAt}
            end`,
            // A new official title invalidates the student's confidence, so the night evaluates it again.
            categoryConfidence: sql`case
              when ${tendersTable.categorySource} is distinct from 'teacher' and ${tendersTable.title} is distinct from ${values.title}
                then null
              else ${tendersTable.categoryConfidence}
            end`,
            displayTitle: sql`case when ${tendersTable.displayTitleSource} is null or ${tendersTable.displayTitleSource} = 'rules' then ${values.displayTitle} else ${tendersTable.displayTitle} end`,
            displayTitleSource: sql`case when ${tendersTable.displayTitleSource} is null or ${tendersTable.displayTitleSource} = 'rules' then 'rules' else ${tendersTable.displayTitleSource} end`,
            displayTitleVersion: sql`case when ${tendersTable.displayTitleSource} is null or ${tendersTable.displayTitleSource} = 'rules' then ${values.displayTitleVersion} else ${tendersTable.displayTitleVersion} end`,
            displayTitleNorm: sql`case when ${tendersTable.displayTitleSource} is null or ${tendersTable.displayTitleSource} = 'rules' then ${values.displayTitleNorm} else ${tendersTable.displayTitleNorm} end`,
            displayTitleNeedsModel: sql`case when ${tendersTable.displayTitleSource} is null or ${tendersTable.displayTitleSource} = 'rules' then ${values.displayTitleNeedsModel} else ${tendersTable.displayTitleNeedsModel} end`,
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
            estimatedValueFlag: values.estimatedValueFlag,
            publishedAt: values.publishedAt,
            openingAt: values.openingAt,
            proposalDeadline: values.proposalDeadline,
            state: values.state,
            city: values.city,
            cityIbgeCode: values.cityIbgeCode,
            sourceId: values.sourceId,
            sourceName: values.sourceName,
            sourceUrl: values.sourceUrl,
            platform: values.platform,
            platformLabel: values.platformLabel,
            searchText: sql`trim(concat_ws(' ',
              case when ${tendersTable.displayTitleSource} = 'model'
                then ${tendersTable.displayTitleNorm}
                else ${values.displayTitleNorm}
              end,
              cast(${values.titleNorm} as text),
              cast(${values.objectNorm} as text),
              ${tendersTable.itemsNorm},
              cast(${values.organizationNorm} as text),
              cast(${values.otherNorm} as text),
              coalesce((
                select string_agg(
                  translate(
                    lower(category->>'label'),
                    'áàâãäéèêëíìîïóòôõöúùûüç',
                    'aaaaaeeeeiiiiooooouuuuc'
                  ),
                  ' '
                )
                from jsonb_array_elements(case
                  when ${tendersTable.categorySource} = 'teacher' or jsonb_array_length(${tendersTable.categories}) > 0
                    then ${tendersTable.categories}
                  else ${JSON.stringify(values.categories)}::jsonb
                end) as category
              ), '')
            ))`,
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
      if (existing) {
        await createTenderChangeNotifications(tx, {
          previous: {
            id: draft.id,
            title: existing.title,
            tenderNumberShort: pncpTenderNumberShort(record),
            organizationName: existing.organizationName,
            status: existing.status,
            proposalDeadline: existing.proposalDeadline,
            estimatedValue: existing.estimatedValue,
            estimatedValueStatus: existing.estimatedValueStatus,
          },
          next: {
            id: draft.id,
            title: draft.title,
            tenderNumberShort: pncpTenderNumberShort(record),
            organizationName: draft.organizationName,
            status: draft.status,
            proposalDeadline: draft.proposalDeadline,
            estimatedValue: draft.estimatedValue,
            estimatedValueStatus: draft.estimatedValueStatus,
          },
          sourceVersion:
            parsePncpDate(record.dataAtualizacao)?.toISOString() ??
            parsePncpDate(record.dataAtualizacaoGlobal)?.toISOString() ??
            now.toISOString(),
          detectedAt: now,
        });
      }
    });
  }

  invalidateTenderFacetCache();
  await enqueueCollectedTitleRewrites(newOrRetitled);
  return drafts.length;
}
