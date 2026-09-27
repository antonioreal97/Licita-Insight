import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { incrementMetric } from "../metrics";

export type RetentionResult = {
  tenders: number;
  passages: number;
  documents: number;
  bytes: number;
  savedTenders: number;
};

const cutoff = (now: Date, days: number): Date => new Date(now.getTime() - days * 86_400_000);

export async function reportAiDocumentRetention(
  now = new Date(),
  days = 90,
): Promise<RetentionResult> {
  const result = await pool.query<{
    tenders: string; passages: string; documents: string; bytes: string; saved_tenders: string;
  }>(
    `with expired as (
       select t.id, exists(select 1 from saved_tenders s where s.tender_id=t.id) as saved
       from tenders t join tender_ai_indexes i on i.tender_id=t.id
       where t.proposal_deadline < $1 and i.purged_at is null
     ), purgeable as (select id from expired where not saved)
     select
       (select count(*) from purgeable)::text as tenders,
       (select count(*) from tender_ai_passages p where p.tender_id in (select id from purgeable))::text as passages,
       (select count(*) from tender_ai_documents d where d.tender_id in (select id from purgeable))::text as documents,
       (coalesce((select sum(pg_column_size(p)) from tender_ai_passages p where p.tender_id in (select id from purgeable)),0)
         + coalesce((select sum(pg_column_size(d)) from tender_ai_documents d where d.tender_id in (select id from purgeable)),0))::text as bytes,
       (select count(*) from expired where saved)::text as saved_tenders`,
    [cutoff(now, days)],
  );
  const row = result.rows[0]!;
  return {
    tenders: Number(row.tenders), passages: Number(row.passages), documents: Number(row.documents),
    bytes: Number(row.bytes), savedTenders: Number(row.saved_tenders),
  };
}

export async function purgeExpiredAiDocuments(
  now = new Date(),
  days = 90,
  batchSize = 5_000,
): Promise<RetentionResult> {
  const total: RetentionResult = { tenders: 0, passages: 0, documents: 0, bytes: 0, savedTenders: 0 };
  const before = await reportAiDocumentRetention(now, days);
  total.bytes = before.bytes;
  total.savedTenders = before.savedTenders;
  for (;;) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const candidates = await client.query<{ id: string }>(
        `select t.id from tenders t join tender_ai_indexes i on i.tender_id=t.id
         where t.proposal_deadline < $1 and i.purged_at is null
           and not exists(select 1 from saved_tenders s where s.tender_id=t.id)
         order by t.proposal_deadline, t.id for update of i skip locked limit $2`,
        [cutoff(now, days), batchSize],
      );
      const ids = candidates.rows.map(({ id }) => id);
      if (ids.length === 0) { await client.query("commit"); break; }
      const passages = await client.query("delete from tender_ai_passages where tender_id=any($1::text[]) returning id", [ids]);
      const documents = await client.query("delete from tender_ai_documents where tender_id=any($1::text[]) returning id", [ids]);
      await client.query("update tender_ai_indexes set purged_at=$2, updated_at=$2 where tender_id=any($1::text[])", [ids, now]);
      await client.query("commit");
      total.tenders += ids.length;
      total.passages += passages.rowCount ?? 0;
      total.documents += documents.rowCount ?? 0;
      incrementMetric("licitai_ai_retention_deleted_total", { object: "passage" }, passages.rowCount ?? 0);
      incrementMetric("licitai_ai_retention_deleted_total", { object: "document" }, documents.rowCount ?? 0);
      if (ids.length < batchSize) break;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  return total;
}

export function startAiDocumentRetentionScheduler(): () => void {
  const run = () => void tryRunSingletonJob("ai_document_retention", () => purgeExpiredAiDocuments())
    .then((result) => {
      if (result.acquired) logger.info(result.value, "AI document retention completed");
    })
    .catch((error) => logger.error({ err: error }, "AI document retention failed"));
  const timer = setInterval(run, 24 * 60 * 60 * 1_000);
  timer.unref();
  return () => clearInterval(timer);
}
