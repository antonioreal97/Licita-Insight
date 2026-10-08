import { pool } from "@workspace/db";
import { platformFromPublication } from "../catalog/tender-platforms";

export type PlatformBackfillBatchResult = {
  scanned: number;
  updated: number;
  nextCursor: string | null;
};

/** One cursor-bounded batch of the resumable platform backfill. Only rows still without platform are touched. */
export async function backfillTenderPlatformBatch(options: {
  afterId?: string | null;
  batch?: number;
} = {}): Promise<PlatformBackfillBatchResult> {
  const batch = Math.max(1, Math.min(5_000, options.batch ?? 1_000));
  const rows = (await pool.query<{ id: string; publication: Record<string, unknown> | null }>(
    `select id, raw_payload->'publication' as publication
     from tenders
     where id > $1 and platform is null
     order by id
     limit $2`,
    [options.afterId ?? "", batch],
  )).rows;
  if (rows.length === 0) return { scanned: 0, updated: 0, nextCursor: null };

  const resolved = rows.map((row) => ({
    id: row.id,
    ...platformFromPublication(row.publication ?? {}),
  }));
  const result = await pool.query(
    `update tenders t set platform = v.platform, platform_label = v.label
     from unnest($1::text[], $2::text[], $3::text[]) as v(id, platform, label)
     where t.id = v.id and t.platform is null`,
    [resolved.map(({ id }) => id), resolved.map(({ slug }) => slug),
      resolved.map(({ label }) => label)],
  );
  return {
    scanned: rows.length,
    updated: result.rowCount ?? 0,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}
