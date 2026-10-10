import { pool } from "@workspace/db";
import { CategoryStudent, normalizeVector, studentConfig, type StudentExample } from "./student";
import type { TeacherItemResult } from "./teacher";
import { splitForHash, textHash } from "./text";

type Queryable = { query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }> };

export async function insertTitleExample(
  input: {
    sourceText: string;
    tenderId: string | null;
    result: TeacherItemResult;
    teacherModel: string;
    promptVersion: number;
    /** Vector already computed for this text, so the example does not wait for the next embedding run. */
    embedding?: { vector: ArrayLike<number>; model: string };
  },
  client: Queryable = pool,
): Promise<boolean> {
  const hash = textHash(input.sourceText);
  const inserted = await client.query(
    `insert into tender_title_examples
       (text_hash, source_text, tender_id, teacher_title, categories, teacher_model, prompt_version, split,
        embedding, embedding_model)
     values ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9::real[], $10)
     on conflict (text_hash) do nothing`,
    [hash, input.sourceText, input.tenderId, input.result.title, input.result.categories,
      input.teacherModel, input.promptVersion, splitForHash(hash),
      input.embedding ? `{${Array.from(input.embedding.vector).join(",")}}` : null, input.embedding?.model ?? null],
  );
  return (inserted.rowCount ?? 0) > 0;
}

export type LoadedStudent = { student: CategoryStudent; latestExampleAt: Date | null };

const LOAD_PAGE = 500;

/**
 * The train split embedded with the current model, in memory. Read in pages and packed into
 * Float32Array at once, so tens of thousands of vectors never sit in memory as number arrays.
 */
export async function loadStudent(embedModel: string, options = studentConfig()): Promise<LoadedStudent> {
  const examples: StudentExample[] = [];
  let latest: Date | null = null;
  let cursor = "";
  while (true) {
    const { rows } = await pool.query<{ text_hash: string; categories: string[]; embedding: number[]; created_at: Date }>(
      `select text_hash, categories, embedding, created_at
       from tender_title_examples
       where split = 'train' and embedding is not null and embedding_model = $1 and cardinality(categories) > 0
         and text_hash > $2
       order by text_hash limit $3`,
      [embedModel, cursor, LOAD_PAGE],
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      if (latest === null || row.created_at > latest) latest = row.created_at;
      if (row.embedding.length === 0) continue;
      examples.push({ textHash: row.text_hash, embedding: normalizeVector(row.embedding), categories: row.categories });
    }
    cursor = rows.at(-1)?.text_hash ?? cursor;
  }
  return { student: new CategoryStudent(examples, options), latestExampleAt: latest };
}
