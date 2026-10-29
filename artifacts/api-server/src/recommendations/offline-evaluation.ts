import { pool, type RecommendationFeatures } from "@workspace/db";

/**
 * Offline evaluation of the recommendation ranking from what users were actually shown
 * (`recommendation_impressions`) and what they did next. It only re-orders lists that were shown, so it measures
 * ordering, not recall of tenders that never reached the screen, and it inherits position bias: an item shown first
 * gets more attention. Compare variants against the baseline on the same lists, never across periods.
 */

/** What the user did with a shown tender inside the outcome window. */
export type ImpressionOutcome = {
  clicked: boolean;
  interest: boolean;
  saved: boolean;
  monitored: boolean;
  /** Saved after the impression and moved past "Analisando" (participating, submitted, awaiting result, completed). */
  advanced: boolean;
  /** "Não interessa" in the triage or "Descartado" on the saved board. */
  dismissed: boolean;
};

/** Graded relevance: the strongest action wins. A dismissal without any positive action is a negative. */
export const OUTCOME_GAINS = {
  clicked: 1,
  interest: 2,
  saved: 2,
  monitored: 3,
  advanced: 4,
} as const;

export const outcomeGain = (outcome: ImpressionOutcome): number =>
  Math.max(
    0,
    ...(Object.keys(OUTCOME_GAINS) as (keyof typeof OUTCOME_GAINS)[])
      .filter((key) => outcome[key])
      .map((key) => OUTCOME_GAINS[key]),
  );

export type EvaluatedImpression = {
  tenderId: string;
  position: number;
  features: RecommendationFeatures;
  gain: number;
  negative: boolean;
};

/** One ranking run as one user saw it in one scope. */
export type ImpressionList = {
  userId: string;
  scope: string;
  generatedAt: string;
  algorithmVersion: number;
  items: EvaluatedImpression[];
};

/** Multiplier per score part; a missing part keeps weight 1, so `{}` reproduces the production order. */
export type FeatureWeights = Partial<Record<keyof RecommendationFeatures, number>>;

export const weightedScore = (
  features: RecommendationFeatures,
  weights: FeatureWeights,
): number =>
  Object.entries(features).reduce(
    (sum, [key, value]) =>
      sum + (value ?? 0) * (weights[key as keyof RecommendationFeatures] ?? 1),
    0,
  );

/** Baseline: the order on screen. */
export const shownOrder = (items: EvaluatedImpression[]): EvaluatedImpression[] =>
  [...items].sort((a, b) => a.position - b.position);

/** Variant: the same items re-scored with other weights; ties keep the order on screen. */
export const rerank = (
  items: EvaluatedImpression[],
  weights: FeatureWeights,
): EvaluatedImpression[] =>
  [...items].sort(
    (a, b) =>
      weightedScore(b.features, weights) - weightedScore(a.features, weights) ||
      a.position - b.position,
  );

const dcg = (gains: number[]): number =>
  gains.reduce((sum, gain, index) => sum + (2 ** gain - 1) / Math.log2(index + 2), 0);

export type ListMetrics = {
  precision: number;
  hit: boolean;
  /** Null when the list has no positive item: nDCG is undefined there. */
  ndcg: number | null;
  negatives: number;
};

export const listMetrics = (ordered: EvaluatedImpression[], k: number): ListMetrics => {
  const top = ordered.slice(0, k);
  const positives = top.filter((item) => item.gain > 0).length;
  const ideal = dcg(
    ordered
      .map((item) => item.gain)
      .sort((a, b) => b - a)
      .slice(0, k),
  );
  return {
    precision: top.length === 0 ? 0 : positives / top.length,
    hit: positives > 0,
    ndcg: ideal === 0 ? null : dcg(top.map((item) => item.gain)) / ideal,
    negatives: top.filter((item) => item.negative).length,
  };
};

export type RankingSummary = {
  /** Lists with at least one positive item, the only ones that count for nDCG. */
  listsWithPositives: number;
  precisionAtK: number;
  hitRateAtK: number;
  ndcgAtK: number | null;
  negativesInTopK: number;
};

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const round = (value: number): number => Number(value.toFixed(4));

export const summarize = (
  lists: ImpressionList[],
  order: (items: EvaluatedImpression[]) => EvaluatedImpression[],
  k: number,
): RankingSummary => {
  const metrics = lists.map((list) => listMetrics(order(list.items), k));
  const ndcgs = metrics.flatMap((metric) => (metric.ndcg === null ? [] : [metric.ndcg]));
  return {
    listsWithPositives: ndcgs.length,
    precisionAtK: round(mean(metrics.map((metric) => metric.precision))),
    hitRateAtK: round(mean(metrics.map((metric) => (metric.hit ? 1 : 0)))),
    ndcgAtK: ndcgs.length === 0 ? null : round(mean(ndcgs)),
    negativesInTopK: metrics.reduce((sum, metric) => sum + metric.negatives, 0),
  };
};

export type EvaluationReport = {
  k: number;
  lists: number;
  impressions: number;
  positives: number;
  negatives: number;
  byAlgorithmVersion: Record<string, number>;
  baseline: RankingSummary;
  variant: RankingSummary | null;
};

export const evaluateRanking = (
  lists: ImpressionList[],
  options: { k: number; weights?: FeatureWeights },
): EvaluationReport => {
  const items = lists.flatMap((list) => list.items);
  const byAlgorithmVersion: Record<string, number> = {};
  for (const list of lists)
    byAlgorithmVersion[list.algorithmVersion] =
      (byAlgorithmVersion[list.algorithmVersion] ?? 0) + 1;
  const weights = options.weights;
  return {
    k: options.k,
    lists: lists.length,
    impressions: items.length,
    positives: items.filter((item) => item.gain > 0).length,
    negatives: items.filter((item) => item.negative).length,
    byAlgorithmVersion,
    baseline: summarize(lists, shownOrder, options.k),
    variant: weights ? summarize(lists, (list) => rerank(list, weights), options.k) : null,
  };
};

type ImpressionRow = {
  user_id: string;
  scope: string;
  generated_at: Date;
  algorithm_version: number;
  tender_id: string;
  position: number;
  features: RecommendationFeatures;
  clicked: boolean;
  interest: boolean;
  saved: boolean;
  monitored: boolean;
  advanced: boolean;
  dismissed: boolean;
};

/**
 * Impressions shown in the last `days`, with the outcome of each inside `windowDays` after it was shown.
 * By default only impressions whose window has already closed, so recent lists do not count as misses.
 */
export async function loadImpressionLists(options: {
  days: number;
  windowDays: number;
  includeOpenWindow?: boolean;
  now?: Date;
}): Promise<ImpressionList[]> {
  const now = options.now ?? new Date();
  const { rows } = await pool.query<ImpressionRow>(
    `select i.user_id, i.scope, i.generated_at, i.algorithm_version, i.tender_id, i.position, i.features,
            i.clicked_at is not null as clicked,
            exists (
              select 1 from recommendation_events e
              where e.user_id = i.user_id and e.tender_id = i.tender_id and e.type = 'interest'
                and e.occurred_at >= i.shown_at and e.occurred_at < i.shown_at + make_interval(days => $3)
            ) as interest,
            coalesce(s.saved_at >= i.shown_at and s.saved_at < i.shown_at + make_interval(days => $3), false) as saved,
            coalesce(s.monitored_at >= i.shown_at and s.monitored_at < i.shown_at + make_interval(days => $3), false)
              as monitored,
            coalesce(s.saved_at >= i.shown_at
              and s.stage in ('participating', 'submitted', 'awaiting_result', 'completed'), false) as advanced,
            exists (
              select 1 from recommendation_dismissals d
              where d.user_id = i.user_id and d.tender_id = i.tender_id
                and d.dismissed_at >= i.shown_at and d.dismissed_at < i.shown_at + make_interval(days => $3)
            ) or coalesce(s.saved_at >= i.shown_at and s.stage = 'dismissed', false) as dismissed
       from recommendation_impressions i
       left join saved_tenders s on s.user_id = i.user_id and s.tender_id = i.tender_id
      where i.shown_at >= $1::timestamptz - make_interval(days => $2)
        and ($4::boolean or i.shown_at < $1::timestamptz - make_interval(days => $3))
      order by i.user_id, i.scope, i.generated_at, i.position, i.shown_at`,
    [now, options.days, options.windowDays, options.includeOpenWindow ?? false],
  );
  const lists = new Map<string, ImpressionList>();
  for (const row of rows) {
    const key = `${row.user_id}|${row.scope}|${row.generated_at.toISOString()}`;
    let list = lists.get(key);
    if (!list) {
      list = {
        userId: row.user_id,
        scope: row.scope,
        generatedAt: row.generated_at.toISOString(),
        algorithmVersion: row.algorithm_version,
        items: [],
      };
      lists.set(key, list);
    }
    // A tender appears once per run and scope (unique index); keep the defensive check for hand-made data.
    if (list.items.some((item) => item.tenderId === row.tender_id)) continue;
    const outcome: ImpressionOutcome = {
      clicked: row.clicked,
      interest: row.interest,
      saved: row.saved,
      monitored: row.monitored,
      advanced: row.advanced,
      dismissed: row.dismissed,
    };
    const gain = outcomeGain(outcome);
    list.items.push({
      tenderId: row.tender_id,
      position: row.position,
      features: row.features,
      gain,
      negative: outcome.dismissed && gain === 0,
    });
  }
  return [...lists.values()];
}
