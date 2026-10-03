import { pool } from "@workspace/db";
import { CategoryStudent, studentConfig } from "./student";
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
  },
  client: Queryable = pool,
): Promise<boolean> {
  const hash = textHash(input.sourceText);
  const inserted = await client.query(
    `insert into tender_title_examples
       (text_hash, source_text, tender_id, teacher_title, categories, teacher_model, prompt_version, split)
     values ($1, $2, $3, $4, $5::text[], $6, $7, $8)
     on conflict (text_hash) do nothing`,
    [hash, input.sourceText, input.tenderId, input.result.title, input.result.categories,
      input.teacherModel, input.promptVersion, splitForHash(hash)],
  );
  return (inserted.rowCount ?? 0) > 0;
}

export type LoadedStudent = { student: CategoryStudent; latestExampleAt: Date | null };

/** The train split embedded with the current model, in memory. */
export async function loadStudent(embedModel: string, options = studentConfig()): Promise<LoadedStudent> {
  const result = await pool.query<{ text_hash: string; categories: string[]; embedding: number[]; created_at: Date }>(
    `select text_hash, categories, embedding, created_at
     from tender_title_examples
     where split = 'train' and embedding is not null and embedding_model = $1 and cardinality(categories) > 0
     order by text_hash`,
    [embedModel],
  );
  const latest = result.rows.reduce<Date | null>(
    (current, row) => (current === null || row.created_at > current ? row.created_at : current),
    null,
  );
  return {
    student: new CategoryStudent(
      result.rows.map((row) => ({ textHash: row.text_hash, embedding: row.embedding, categories: row.categories })),
      options,
    ),
    latestExampleAt: latest,
  };
}
