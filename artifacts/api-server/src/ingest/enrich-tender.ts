import { eq } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { fetchCompraArquivos, fetchCompraItens } from "./pncp-client";
import {
  buildSearchColumns,
  mapPncpDocuments,
  mapPncpItems,
  parseControlNumber,
} from "./pncp-map";

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
  const items = mapPncpItems(itemRows);
  const documents = mapPncpDocuments(fileRows, identity);
  const search = buildSearchColumns({
    title: row.title,
    objectSummary: row.objectSummary,
    itemDescriptions: items.map((item) => item.description),
    organizationName: row.organizationName,
    purchasingUnit: row.purchasingUnit,
    city: row.city,
    state: row.state,
    modalityLabel: row.modalityLabel,
  });
  const previousDocuments = row.documents;
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

  await db
    .update(tendersTable)
    .set({
      items,
      documents,
      timeline,
      ...search,
      rawPayload: { publication, items: itemRows, arquivos: fileRows },
      detailsFetchedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tendersTable.id, id));

  logger.info(
    { tenderId: id, items: items.length, documents: documents.length },
    "PNCP tender details stored",
  );
}
