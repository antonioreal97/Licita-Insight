import { pool } from "@workspace/db";
import type { OllamaClient } from "../ai/ollama-client";
import { NEVER_STOP, type Progress, type StopSignal } from "./progress";
import { studentText } from "./text";

export type EmbedExamplesResult = { embedded: number; stopped: boolean };

/** Embeds examples without a vector, or with a vector from another embedding model. */
export async function embedPendingExamples(options: {
  client: OllamaClient;
  batch?: number;
  signal?: StopSignal;
  createProgress?: (total: number) => Progress;
}): Promise<EmbedExamplesResult> {
  const batch = options.batch ?? 32;
  const signal = options.signal ?? NEVER_STOP;
  const model = options.client.config.embedModel;
  const where = "embedding is null or embedding_model is distinct from $1";
  const total = (await pool.query<{ count: number }>(
    `select count(*)::int as count from tender_title_examples where ${where}`,
    [model],
  )).rows[0]?.count ?? 0;
  const progress = options.createProgress?.(total);
  const result: EmbedExamplesResult = { embedded: 0, stopped: false };
  let cursor = "";

  while (true) {
    if (signal.stopped) {
      result.stopped = true;
      break;
    }
    const rows = (await pool.query<{ text_hash: string; source_text: string }>(
      `select text_hash, source_text from tender_title_examples
       where (${where}) and text_hash > $2 order by text_hash limit $3`,
      [model, cursor, batch],
    )).rows;
    if (rows.length === 0) break;
    const { embeddings } = await options.client.embed(rows.map(({ source_text }) => studentText(source_text)));
    await pool.query(
      `update tender_title_examples e set embedding = v.embedding::real[], embedding_model = $3
       from unnest($1::text[], $2::text[]) as v(text_hash, embedding)
       where e.text_hash = v.text_hash`,
      [rows.map(({ text_hash }) => text_hash), embeddings.map((vector) => `{${vector.join(",")}}`), model],
    );
    result.embedded += rows.length;
    cursor = rows.at(-1)?.text_hash ?? cursor;
    progress?.advance(rows.length);
  }
  return result;
}
