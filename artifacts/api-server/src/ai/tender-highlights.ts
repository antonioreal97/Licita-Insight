import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  companyProfilesTable,
  companyTenderFitsTable,
  tenderAiSheetsTable,
  tendersTable,
} from "@workspace/db";
import { fitLevel } from "./company-fit-policy";
import {
  requirementHighlights,
  tenderHighlightLines,
  type EmailTenderHighlight,
  type RequirementHighlight,
  type StoredFit,
  type StoredSheet,
} from "./tender-highlights-policy";

/**
 * Readers for the "destaques" (see tender-highlights-policy.ts). Every query here is a plain SELECT on stored rows:
 * no sheet generation, no job, no model call — a tender without a ready sheet or fit just has fewer highlights.
 */

type Executor = Pick<typeof db, "select" | "selectDistinctOn">;

const MAX_TENDERS = 100;

/** Latest ready sheet per tender, whatever index or prompt version produced it. Read only. */
async function readySheets(
  tenderIds: readonly string[],
  executor: Executor,
): Promise<Map<string, StoredSheet>> {
  const rows = await executor
    .selectDistinctOn([tenderAiSheetsTable.tenderId], {
      tenderId: tenderAiSheetsTable.tenderId,
      fields: tenderAiSheetsTable.fields,
      qualificationChecklist: tenderAiSheetsTable.qualificationChecklist,
    })
    .from(tenderAiSheetsTable)
    .where(
      and(
        inArray(tenderAiSheetsTable.tenderId, [...tenderIds]),
        eq(tenderAiSheetsTable.status, "ready"),
      ),
    )
    .orderBy(tenderAiSheetsTable.tenderId, desc(tenderAiSheetsTable.updatedAt));
  return new Map(rows.map(({ tenderId, ...sheet }) => [tenderId, sheet]));
}

const uniqueIds = (tenderIds: readonly string[]) =>
  [...new Set(tenderIds.filter(Boolean))].slice(0, MAX_TENDERS);

/** Requirement highlights for result cards. Tenders without a ready sheet are absent from the map. */
export async function loadRequirementHighlights(
  tenderIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, RequirementHighlight[]>> {
  const ids = uniqueIds(tenderIds);
  if (ids.length === 0) return new Map();
  const sheets = await readySheets(ids, executor);
  const result = new Map<string, RequirementHighlight[]>();
  for (const [tenderId, sheet] of sheets) {
    const highlights = requirementHighlights(sheet);
    if (highlights.length > 0) result.set(tenderId, highlights);
  }
  return result;
}

/**
 * Highlights of the tenders an e-mail cites, for one recipient: stored sheet, the user's stored fit for the current
 * profile version and the platform against the profile's declared registrations. Tenders without any line are
 * absent from the map, so the e-mail stays as it was for them.
 */
export async function loadEmailTenderHighlights(
  userId: string,
  tenderIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, EmailTenderHighlight>> {
  const ids = uniqueIds(tenderIds);
  if (ids.length === 0) return new Map();
  const [tenders, sheets, [profile]] = await Promise.all([
    executor
      .select({
        id: tendersTable.id,
        title: tendersTable.title,
        displayTitle: tendersTable.displayTitle,
        organizationName: tendersTable.organizationName,
        platform: tendersTable.platform,
        platformLabel: tendersTable.platformLabel,
      })
      .from(tendersTable)
      .where(inArray(tendersTable.id, ids)),
    readySheets(ids, executor),
    executor
      .select({
        version: companyProfilesTable.version,
        registeredPlatforms: companyProfilesTable.registeredPlatforms,
      })
      .from(companyProfilesTable)
      .where(eq(companyProfilesTable.userId, userId))
      .limit(1),
  ]);
  const fits = new Map<string, StoredFit>();
  if (profile) {
    const rows = await executor
      .selectDistinctOn([companyTenderFitsTable.tenderId], {
        tenderId: companyTenderFitsTable.tenderId,
        level: companyTenderFitsTable.level,
        score: companyTenderFitsTable.score,
        reasons: companyTenderFitsTable.reasons,
      })
      .from(companyTenderFitsTable)
      .where(
        and(
          eq(companyTenderFitsTable.userId, userId),
          eq(companyTenderFitsTable.profileVersion, profile.version),
          eq(companyTenderFitsTable.status, "ready"),
          inArray(companyTenderFitsTable.tenderId, ids),
        ),
      )
      .orderBy(companyTenderFitsTable.tenderId, desc(companyTenderFitsTable.updatedAt));
    for (const row of rows) {
      // Same derivation as the API's fit response: a stored "low" stays low (exclusion or ME/EPP exclusivity).
      const level =
        row.score !== null && row.level !== "low"
          ? fitLevel(Number(row.score))
          : (row.level as StoredFit["level"]);
      fits.set(row.tenderId, { level, reasons: row.reasons });
    }
  }
  const result = new Map<string, EmailTenderHighlight>();
  for (const tender of tenders) {
    const lines = tenderHighlightLines({
      sheet: sheets.get(tender.id),
      fit: fits.get(tender.id),
      platform: { slug: tender.platform, label: tender.platformLabel },
      registeredPlatforms: profile?.registeredPlatforms ?? [],
    });
    if (lines.length === 0) continue;
    result.set(tender.id, {
      tenderId: tender.id,
      title: tender.displayTitle ?? tender.title,
      organizationName: tender.organizationName,
      lines,
    });
  }
  return result;
}
