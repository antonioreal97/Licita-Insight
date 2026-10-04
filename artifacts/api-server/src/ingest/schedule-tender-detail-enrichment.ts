import { eq } from "drizzle-orm";
import { db, tendersTable } from "@workspace/db";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { enrichTenderById } from "./enrich-tender";
import { TenderDetailEnrichmentQueue } from "./tender-detail-enrichment-queue";

const queue = new TenderDetailEnrichmentQueue(
  async (id) => {
    await tryRunSingletonJob(`pncp_detail:${id}`, async () => {
      const [row] = await db
        .select({ detailsFetchedAt: tendersTable.detailsFetchedAt })
        .from(tendersTable)
        .where(eq(tendersTable.id, id))
        .limit(1);
      if (row?.detailsFetchedAt === null) await enrichTenderById(id);
    });
  },
  { onError: (id, error) => logger.warn({ err: error, tenderId: id }, "PNCP detail enrichment failed; will retry later") },
);

export const scheduleTenderDetailEnrichment = (id: string): void => queue.schedule(id);
