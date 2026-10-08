import { pool } from "@workspace/db";
import { buildTenderSearchText } from "./text";
import { categorySlugsFromOfficialTitle } from "./category-rules";
import { toTenderCategories } from "../catalog/tender-categories";

type RuleCandidate = {
  id: string;
  title: string;
  title_norm: string;
  display_title_norm: string;
  object_norm: string;
  items_norm: string;
  organization_norm: string;
  other_norm: string;
};

export type CategorizeRulesBatchResult = {
  scanned: number;
  categorized: number;
  nextCursor: string | null;
};

/** One cursor-bounded batch for the one-off, resumable rules backfill. */
export async function categorizeTenderRulesBatch(options: {
  afterId?: string | null;
  batch?: number;
} = {}): Promise<CategorizeRulesBatchResult> {
  const batch = Math.max(1, Math.min(5_000, options.batch ?? 500));
  const rows = (await pool.query<RuleCandidate>(
    `select id, title, title_norm, display_title_norm, object_norm, items_norm, organization_norm, other_norm
     from tenders
     where id > $1 and jsonb_array_length(categories) = 0
       and category_source is distinct from 'teacher'
     order by id
     limit $2`,
    [options.afterId ?? "", batch],
  )).rows;
  if (rows.length === 0) return { scanned: 0, categorized: 0, nextCursor: null };

  const classified = rows.flatMap((row) => {
    const slugs = categorySlugsFromOfficialTitle(row.title);
    if (slugs.length === 0) return [];
    return [{
      id: row.id,
      categories: JSON.stringify(toTenderCategories(slugs)),
      searchText: buildTenderSearchText({
        titleNorm: row.title_norm,
        objectNorm: row.object_norm,
        itemsNorm: row.items_norm,
        organizationNorm: row.organization_norm,
        otherNorm: row.other_norm,
      }, row.display_title_norm, slugs),
    }];
  });

  if (classified.length > 0) {
    await pool.query(
      `update tenders t set categories = v.categories::jsonb, category_source = 'rules',
         category_confidence = null, categorized_at = now(), search_text = v.search_text
       from unnest($1::text[], $2::text[], $3::text[]) as v(id, categories, search_text)
       where t.id = v.id and jsonb_array_length(t.categories) = 0
         and t.category_source is distinct from 'teacher'`,
      [classified.map(({ id }) => id), classified.map(({ categories }) => categories),
        classified.map(({ searchText }) => searchText)],
    );
  }
  return {
    scanned: rows.length,
    categorized: classified.length,
    nextCursor: rows.at(-1)?.id ?? null,
  };
}
