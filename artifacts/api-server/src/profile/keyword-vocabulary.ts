import { desc, inArray, like, sql } from "drizzle-orm";
import {
  db,
  pool,
  profileKeywordVocabularyTable,
  tendersTable,
  type ProfileKeywordRelatedTerm,
  type TenderCategory,
  type TenderItemRecord,
} from "@workspace/db";
import { TENDER_CATEGORIES } from "../catalog/tender-categories";
import { categorySlugsFromOfficialTitle } from "../titles/category-rules";
import { tryRunSingletonJob } from "../jobs/job-lock";
import { logger } from "../lib/logger";
import { millisecondsUntilSaoPauloHour } from "../lib/sao-paulo-schedule";

const MIN_OPEN_TENDERS = 3;
const MAX_VOCABULARY_TERMS = 15_000;
const MAX_CANDIDATE_TERMS = 60_000;
const MAX_SEEN_ONCE_TERMS = 250_000;
const MAX_TERMS_PER_TENDER = 120;
const MAX_COOCCURRENCE_TERMS = 24;
const RELATED_LIMIT = 6;
const BATCH_SIZE = 1_000;

const STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "ou",
  "para",
  "por",
  "que",
  "sem",
  "sob",
  "um",
  "uma",
  "uns",
  "umas",
]);
const GENERIC_WORDS = new Set([
  "aquisicao",
  "contratacao",
  "edital",
  "fornecimento",
  "preco",
  "precos",
  "registro",
  "servico",
  "servicos",
]);

export const normalizeProfileKeyword = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

type Token = { normalized: string; display: string };
const tokens = (value: string): Token[] =>
  value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((display) => ({
      normalized: normalizeProfileKeyword(display),
      display: display.toLocaleLowerCase("pt-BR"),
    }))
    .filter(({ normalized }) => normalized.length >= 2);

export type ExtractedProfileTerm = {
  normalizedTerm: string;
  displayTerm: string;
  ngramSize: number;
};

/** Produces unique unigrams, bigrams and trigrams. Stopwords never become standalone suggestions. */
export function extractProfileTerms(
  value: string,
  limit = MAX_TERMS_PER_TENDER,
): ExtractedProfileTerm[] {
  const words = tokens(value).slice(0, 600);
  const found = new Map<string, ExtractedProfileTerm>();
  for (let size = 1; size <= 3; size += 1) {
    for (let index = 0; index + size <= words.length; index += 1) {
      const window = words.slice(index, index + size);
      const content = window.filter(
        ({ normalized }) =>
          !STOP_WORDS.has(normalized) && !GENERIC_WORDS.has(normalized),
      );
      if (
        content.length === 0 ||
        (size === 1 && content[0]!.normalized.length < 3)
      )
        continue;
      if (
        size > 1 &&
        (STOP_WORDS.has(window[0]!.normalized) ||
          STOP_WORDS.has(window[window.length - 1]!.normalized))
      )
        continue;
      const normalizedTerm = window
        .map(({ normalized }) => normalized)
        .join(" ");
      if (normalizedTerm.length > 80 || found.has(normalizedTerm)) continue;
      found.set(normalizedTerm, {
        normalizedTerm,
        displayTerm: window.map(({ display }) => display).join(" "),
        ngramSize: size,
      });
      if (found.size >= limit) return [...found.values()];
    }
  }
  return [...found.values()];
}

type SourceTender = {
  id: string;
  title: string;
  objectSummary: string | null;
  description: string | null;
  items: TenderItemRecord[];
  categories: TenderCategory[];
};

const sourceText = (tender: SourceTender): string =>
  [
    tender.title,
    tender.objectSummary ?? "",
    tender.description ?? "",
    ...tender.items.map(({ description }) => description),
  ].join("\n");

type TermStats = {
  term: ExtractedProfileTerm;
  openTenderCount: number;
  forms: Map<string, number>;
  categories: Map<string, { label: string; count: number }>;
};

export function addTermCooccurrences(
  target: Map<string, Map<string, number>>,
  terms: string[],
): void {
  const unique = [...new Set(terms)];
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      for (const [from, to] of [
        [unique[left]!, unique[right]!],
        [unique[right]!, unique[left]!],
      ]) {
        const related = target.get(from) ?? new Map<string, number>();
        related.set(to, (related.get(to) ?? 0) + 1);
        target.set(from, related);
      }
    }
  }
}

export const topRelatedTerms = (
  target: Map<string, Map<string, number>>,
  term: string,
  minimum = 1,
  limit = RELATED_LIMIT,
): string[] => {
  const ranked = [...(target.get(term) ?? new Map<string, number>()).entries()]
    .filter(([, count]) => count >= minimum)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const exactPhrases = ranked
    .filter(
      ([candidate]) =>
        candidate.includes(" ") && candidate.split(" ").includes(term),
    )
    .slice(0, 2);
  const morphological = ranked.filter(
    ([candidate]) =>
      !candidate.includes(" ") && candidate.slice(0, 2) === term.slice(0, 2),
  );
  const unigrams = ranked.filter(([candidate]) => !candidate.includes(" "));
  const ordered = [...exactPhrases, ...morphological, ...unigrams, ...ranked];
  return [...new Set(ordered.map(([candidate]) => candidate))].slice(0, limit);
};

async function forEachOpenTender(
  use: (tender: SourceTender) => void | Promise<void>,
): Promise<number> {
  let cursor = "";
  let count = 0;
  for (;;) {
    const result = await pool.query<SourceTender>(
      `select id, title, object_summary as "objectSummary", description, items, categories
         from tenders
        where status = 'open' and (proposal_deadline is null or proposal_deadline > now()) and id > $1
        order by id asc limit $2`,
      [cursor, BATCH_SIZE],
    );
    if (result.rows.length === 0) return count;
    for (const tender of result.rows) await use(tender);
    count += result.rows.length;
    cursor = result.rows[result.rows.length - 1]!.id;
  }
}

export type VocabularyBuildMetrics = {
  tenders: number;
  terms: number;
  durationMs: number;
};

export async function rebuildProfileKeywordVocabulary(
  now = new Date(),
): Promise<VocabularyBuildMetrics> {
  const started = performance.now();
  const stats = new Map<string, TermStats>();
  const seenOnce = new Set<number>();
  const hashTerm = (value: string): number => {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1)
      hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
    return hash >>> 0;
  };
  const tenders = await forEachOpenTender((tender) => {
    for (const term of extractProfileTerms(sourceText(tender))) {
      let current = stats.get(term.normalizedTerm);
      if (!current) {
        const hash = hashTerm(term.normalizedTerm);
        if (!seenOnce.has(hash)) {
          if (seenOnce.size >= MAX_SEEN_ONCE_TERMS) seenOnce.clear();
          seenOnce.add(hash);
          continue;
        }
        seenOnce.delete(hash);
        if (stats.size >= MAX_CANDIDATE_TERMS) continue;
        current = {
          term,
          openTenderCount: 1,
          forms: new Map<string, number>([[term.displayTerm, 1]]),
          categories: new Map<string, { label: string; count: number }>(),
        };
      }
      current.openTenderCount += 1;
      current.forms.set(
        term.displayTerm,
        (current.forms.get(term.displayTerm) ?? 0) + 1,
      );
      for (const category of tender.categories) {
        const categoryCount = current.categories.get(category.slug) ?? {
          label: category.label,
          count: 0,
        };
        categoryCount.count += 1;
        current.categories.set(category.slug, categoryCount);
      }
      stats.set(term.normalizedTerm, current);
    }
  });
  const retained = [...stats.values()]
    .filter(({ openTenderCount }) => openTenderCount >= MIN_OPEN_TENDERS)
    .sort(
      (a, b) =>
        b.openTenderCount - a.openTenderCount ||
        b.term.ngramSize - a.term.ngramSize ||
        a.term.normalizedTerm.localeCompare(b.term.normalizedTerm),
    )
    .slice(0, MAX_VOCABULARY_TERMS);
  const retainedByTerm = new Map(
    retained.map((entry) => [entry.term.normalizedTerm, entry]),
  );
  const cooccurrence = new Map<string, Map<string, number>>();
  await forEachOpenTender((tender) => {
    const allPresent = extractProfileTerms(sourceText(tender)).filter(
      ({ normalizedTerm }) => retainedByTerm.has(normalizedTerm),
    );
    const present = [1, 2, 3].flatMap((size) =>
      allPresent
        .filter(({ ngramSize }) => ngramSize === size)
        .sort(
          (a, b) =>
            retainedByTerm.get(b.normalizedTerm)!.openTenderCount -
            retainedByTerm.get(a.normalizedTerm)!.openTenderCount,
        )
        .slice(0, MAX_COOCCURRENCE_TERMS / 3),
    );
    addTermCooccurrences(
      cooccurrence,
      present.map(({ normalizedTerm }) => normalizedTerm),
    );
  });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from profile_keyword_vocabulary");
    for (let offset = 0; offset < retained.length; offset += 250) {
      const chunk = retained.slice(offset, offset + 250);
      const params: unknown[] = [];
      const tuples = chunk.map((entry, index) => {
        const displayTerm =
          [...entry.forms.entries()].sort(
            (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
          )[0]?.[0] ?? entry.term.displayTerm;
        const category = [...entry.categories.entries()].sort(
          (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
        )[0];
        const relatedTerms: ProfileKeywordRelatedTerm[] = topRelatedTerms(
          cooccurrence,
          entry.term.normalizedTerm,
          MIN_OPEN_TENDERS,
        ).map((normalizedTerm) => {
          const related = retainedByTerm.get(normalizedTerm)!;
          const relatedDisplay =
            [...related.forms.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
            related.term.displayTerm;
          return {
            normalizedTerm,
            displayTerm: relatedDisplay,
            openTenderCount: related.openTenderCount,
          };
        });
        const base = index * 8;
        params.push(
          entry.term.normalizedTerm,
          displayTerm,
          entry.term.ngramSize,
          entry.openTenderCount,
          category?.[0] ?? null,
          category?.[1].label ?? null,
          JSON.stringify(relatedTerms),
          now,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7}::jsonb,$${base + 8})`;
      });
      if (tuples.length)
        await client.query(
          `insert into profile_keyword_vocabulary
          (normalized_term, display_term, ngram_size, open_tender_count, predominant_category_slug, predominant_category_label, related_terms, refreshed_at)
         values ${tuples.join(",")}`,
          params,
        );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return {
    tenders,
    terms: retained.length,
    durationMs: Math.round(performance.now() - started),
  };
}

export type KeywordSuggestion = {
  normalizedTerm: string;
  displayTerm: string;
  openTenderCount: number;
  predominantCategory: { slug: string; label: string } | null;
  related: boolean;
};

const publicSuggestion = (
  row: typeof profileKeywordVocabularyTable.$inferSelect,
  related: boolean,
): KeywordSuggestion => ({
  normalizedTerm: row.normalizedTerm,
  displayTerm: row.displayTerm,
  openTenderCount: row.openTenderCount,
  predominantCategory:
    row.predominantCategorySlug && row.predominantCategoryLabel
      ? {
          slug: row.predominantCategorySlug,
          label: row.predominantCategoryLabel,
        }
      : null,
  related,
});

export async function suggestProfileKeywords(
  query: string,
  limit = 10,
): Promise<KeywordSuggestion[]> {
  const normalized = normalizeProfileKeyword(query);
  if (normalized.length < 2) return [];
  const direct = await db
    .select()
    .from(profileKeywordVocabularyTable)
    .where(like(profileKeywordVocabularyTable.normalizedTerm, `${normalized}%`))
    .orderBy(
      sql`(${profileKeywordVocabularyTable.normalizedTerm} = ${normalized}) desc`,
      desc(profileKeywordVocabularyTable.openTenderCount),
      desc(profileKeywordVocabularyTable.ngramSize),
    )
    .limit(Math.min(limit, 7));
  const result = direct.map((row) => publicSuggestion(row, false));
  const relatedNames = [
    ...new Set(
      direct.flatMap((row) =>
        row.relatedTerms.map(({ normalizedTerm }) => normalizedTerm),
      ),
    ),
  ];
  if (result.length < limit && relatedNames.length > 0) {
    const related = await db
      .select()
      .from(profileKeywordVocabularyTable)
      .where(
        inArray(profileKeywordVocabularyTable.normalizedTerm, relatedNames),
      )
      .orderBy(desc(profileKeywordVocabularyTable.openTenderCount))
      .limit(limit - result.length);
    const seen = new Set(result.map(({ normalizedTerm }) => normalizedTerm));
    for (const row of related)
      if (!seen.has(row.normalizedTerm))
        result.push(publicSuggestion(row, true));
  }
  return result.slice(0, limit);
}

export async function listProfileCategories(): Promise<
  Array<{ slug: string; label: string; openTenderCount: number }>
> {
  const result = await pool.query<{ slug: string; count: number }>(
    `select category->>'slug' as slug, count(distinct t.id)::int as count
       from tenders t cross join lateral jsonb_array_elements(t.categories) category
      where t.status = 'open' and (t.proposal_deadline is null or t.proposal_deadline > now())
      group by category->>'slug'`,
  );
  const counts = new Map(
    result.rows.map(({ slug, count }) => [slug, Number(count)]),
  );
  return TENDER_CATEGORIES.map((category) => ({
    ...category,
    openTenderCount: counts.get(category.slug) ?? 0,
  }));
}

export type DescriptionSuggestions = {
  keywords: KeywordSuggestion[];
  categories: Array<{ slug: string; label: string; openTenderCount: number }>;
  estimatedOpenTenderCount: number;
};

export function rankDescriptionVocabulary<
  T extends {
    normalizedTerm: string;
    ngramSize: number;
    openTenderCount: number;
  },
>(description: string, rows: T[]): T[] {
  const extracted = new Set(
    extractProfileTerms(description, 80).map(
      ({ normalizedTerm }) => normalizedTerm,
    ),
  );
  return rows
    .filter(({ normalizedTerm }) => extracted.has(normalizedTerm))
    .sort(
      (a, b) =>
        b.ngramSize - a.ngramSize ||
        b.openTenderCount - a.openTenderCount ||
        a.normalizedTerm.localeCompare(b.normalizedTerm),
    );
}

export async function suggestionsFromDescription(
  description: string,
): Promise<DescriptionSuggestions> {
  const extracted = extractProfileTerms(description, 80);
  const names = extracted.map(({ normalizedTerm }) => normalizedTerm);
  const matched =
    names.length === 0
      ? []
      : await db
          .select()
          .from(profileKeywordVocabularyTable)
          .where(inArray(profileKeywordVocabularyTable.normalizedTerm, names))
          .orderBy(
            desc(profileKeywordVocabularyTable.ngramSize),
            desc(profileKeywordVocabularyTable.openTenderCount),
          )
          .limit(12);
  const ranked = rankDescriptionVocabulary(description, matched);
  const keywords = ranked
    .slice(0, 6)
    .map((row) => publicSuggestion(row, false));
  const categoryScores = new Map<string, number>();
  for (const row of ranked)
    if (row.predominantCategorySlug)
      categoryScores.set(
        row.predominantCategorySlug,
        (categoryScores.get(row.predominantCategorySlug) ?? 0) +
          row.openTenderCount * row.ngramSize,
      );
  for (const slug of categorySlugsFromOfficialTitle(description))
    categoryScores.set(slug, (categoryScores.get(slug) ?? 0) + 1_000_000);
  const allCategories = await listProfileCategories();
  const categories = allCategories
    .filter(({ slug }) => categoryScores.has(slug))
    .sort(
      (a, b) =>
        (categoryScores.get(b.slug) ?? 0) - (categoryScores.get(a.slug) ?? 0),
    )
    .slice(0, 4);
  const categorySlugs = categories.map(({ slug }) => slug);
  const keywordQuery = keywords
    .map(({ displayTerm }) => `"${displayTerm.replace(/"/g, "")}"`)
    .join(" OR ");
  const countResult =
    categories.length === 0 && keywords.length === 0
      ? { rows: [{ count: 0 }] }
      : await pool.query<{ count: number }>(
          `select count(distinct id)::int as count from tenders
      where status = 'open' and (proposal_deadline is null or proposal_deadline > now())
        and (${categorySlugs.length ? `exists (select 1 from jsonb_array_elements(categories) category where category->>'slug' = any($1::text[]))` : "false"}
          or ${keywordQuery ? `recommendation_search_vector @@ websearch_to_tsquery('portuguese', $${categorySlugs.length ? 2 : 1})` : "false"})`,
          [
            ...(categorySlugs.length ? [categorySlugs] : []),
            ...(keywordQuery ? [keywordQuery] : []),
          ],
        );
  return {
    keywords,
    categories,
    estimatedOpenTenderCount: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function runDailyProfileKeywordRefresh(): Promise<VocabularyBuildMetrics | null> {
  const result = await tryRunSingletonJob("profile_keyword_vocabulary", () =>
    rebuildProfileKeywordVocabulary(),
  );
  if (!result.acquired) return null;
  logger.info(result.value, "Profile keyword vocabulary refreshed");
  return result.value;
}

export function startProfileKeywordScheduler(): () => void {
  if (
    process.env.PROFILE_KEYWORD_DAILY_REFRESH === "false" ||
    !process.env.DATABASE_URL
  )
    return () => undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      void runDailyProfileKeywordRefresh()
        .catch((error) =>
          logger.error({ err: error }, "Profile keyword refresh failed"),
        )
        .finally(arm);
    }, millisecondsUntilSaoPauloHour(4));
    timer.unref?.();
  };
  arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
