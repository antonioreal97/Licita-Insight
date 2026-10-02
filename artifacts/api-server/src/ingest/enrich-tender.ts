import { eq } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { fetchCompraArquivos, fetchCompraItens } from "./pncp-client";
import {
  buildSearchColumns,
  mapPncpDocuments,
  mapPncpItems,
  parseControlNumber,
  pncpTenderNumberShort,
} from "./pncp-map";
import { createDocumentAddedNotifications } from "../account/notification-service";

const rawList = (raw: unknown, key: "items" | "arquivos"): unknown => {
  if (raw === null || typeof raw !== "object" || !(key in raw)) return [];
  return (raw as Record<string, unknown>)[key];
};

export async function enrichTenderById(id: string): Promise<void> {
  const [row] = await db
    .select()
    .from(tendersTable)
    .where(eq(tendersTable.id, id))
    .limit(1);
  if (!row) {
    throw new Error(`Cannot enrich missing tender ${id}`);
  }

  const identity = parseControlNumber(row.pncpControlNumber);
  if (!identity) {
    throw new Error(`Tender ${id} has no parseable PNCP control number`);
  }

  const [itemRows, fileRows] = await Promise.all([
    fetchCompraItens(identity.cnpj, identity.ano, identity.sequencial),
    fetchCompraArquivos(identity.cnpj, identity.ano, identity.sequencial),
  ]);
  const fetchedItems = mapPncpItems(itemRows);
  const fetchedDocuments = mapPncpDocuments(fileRows, identity);
  // An empty answer is more often an API failure than a purchase losing every
  // item or file, so it never erases what was already stored.
  const keepItems = fetchedItems.length === 0 && row.items.length > 0;
  const keepDocuments = fetchedDocuments.length === 0 && row.documents.length > 0;
  if (keepItems || keepDocuments) {
    logger.warn(
      { tenderId: id, keepItems, keepDocuments },
      "PNCP returned no items or files; keeping the stored ones",
    );
  }
  const items = keepItems ? row.items : fetchedItems;
  const documents = keepDocuments ? row.documents : fetchedDocuments;
  const search = buildSearchColumns({
    title: row.title,
    displayTitle: row.displayTitle,
    objectSummary: row.objectSummary,
    itemDescriptions: items.map((item) => item.description),
    organizationName: row.organizationName,
    purchasingUnit: row.purchasingUnit,
    city: row.city,
    state: row.state,
    modalityLabel: row.modalityLabel,
    categories: row.categories,
  });
  const previousDocuments = row.documents;
  const previousDocumentIds = new Set(previousDocuments.map(({ id }) => id));
  const addedDocumentIds = documents
    .filter(({ id }) => !previousDocumentIds.has(id))
    .map(({ id }) => id);
  const timeline = [...row.timeline];
  if (documents.length > previousDocuments.length) {
    timeline.push({
      at: new Date().toISOString(),
      type: "document_added",
      description: "Documentos atualizados na publicação do PNCP",
    });
  }

  const raw = row.rawPayload;
  const publication =
    raw !== null && typeof raw === "object" && "publication" in raw
      ? (raw as { publication: unknown }).publication
      : raw;
  const publicationRecord =
    publication !== null && typeof publication === "object"
      ? (publication as Record<string, unknown>)
      : {};

  const detectedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(tendersTable)
      .set({
        items,
        documents,
        timeline,
        ...search,
        rawPayload: {
          publication,
          items: keepItems ? rawList(raw, "items") : itemRows,
          arquivos: keepDocuments ? rawList(raw, "arquivos") : fileRows,
        },
        detailsFetchedAt: detectedAt,
        updatedAt: detectedAt,
      })
      .where(eq(tendersTable.id, id));
    const isFirstEnrichment =
      row.detailsFetchedAt === null && previousDocuments.length === 0;
    if (!isFirstEnrichment && addedDocumentIds.length > 0) {
      await createDocumentAddedNotifications(tx, {
        tender: {
          id: row.id,
          title: row.title,
          tenderNumberShort: pncpTenderNumberShort(publicationRecord),
          organizationName: row.organizationName,
          proposalDeadline: row.proposalDeadline,
        },
        previousCount: previousDocuments.length,
        nextCount: documents.length,
        addedDocumentIds,
        detectedAt,
      });
    }
  });

  logger.info(
    { tenderId: id, items: items.length, documents: documents.length },
    "PNCP tender details stored",
  );
}
