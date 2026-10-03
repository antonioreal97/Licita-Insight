import { TENDER_CATEGORIES } from "../catalog/tender-categories";

const probability = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be a number from 0 to 1`);
  return value;
};

const positiveInteger = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export const studentConfig = () => ({
  k: positiveInteger("CATEGORY_STUDENT_K", 7),
  minConfidence: probability("CATEGORY_STUDENT_MIN_CONFIDENCE", 0.42),
});

/** The second category must reach this share of the winner's weight. */
export const SECOND_CATEGORY_RATIO = 0.6;
/** A neighbour's secondary category receives half of its similarity. */
const SECONDARY_VOTE_SHARE = 0.5;
const CANONICAL_ORDER = new Map<string, number>(TENDER_CATEGORIES.map(({ slug }, index) => [slug, index]));

export const normalizeVector = (values: ArrayLike<number>): Float32Array => {
  let norm = 0;
  for (let index = 0; index < values.length; index += 1) norm += values[index] * values[index];
  norm = Math.sqrt(norm);
  if (!Number.isFinite(norm) || norm === 0) throw new Error("Cannot normalize a zero or non-finite vector");
  const vector = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) vector[index] = values[index] / norm;
  return vector;
};

export type StudentExample = { textHash: string; embedding: ArrayLike<number>; categories: readonly string[] };

export type StudentPrediction = {
  categories: string[];
  /** Weight of the winning category over the total neighbour weight, from 0 to 1. */
  confidence: number;
  /** The winning category even when it falls below the confidence threshold. */
  primary: string | null;
  neighbours: number;
};

export class CategoryStudent {
  readonly size: number;
  readonly dimensions: number;
  private readonly matrix: Float32Array;
  private readonly labels: (readonly string[])[];
  private readonly hashes: string[];

  constructor(
    examples: readonly StudentExample[],
    private readonly options: { k: number; minConfidence: number } = studentConfig(),
  ) {
    const usable = examples.filter(({ categories, embedding }) => categories.length > 0 && embedding.length > 0);
    this.dimensions = usable[0]?.embedding.length ?? 0;
    const consistent = usable.filter(({ embedding }) => embedding.length === this.dimensions);
    this.size = consistent.length;
    this.matrix = new Float32Array(this.size * this.dimensions);
    this.labels = [];
    this.hashes = [];
    consistent.forEach((example, row) => {
      this.matrix.set(normalizeVector(example.embedding), row * this.dimensions);
      this.labels.push(example.categories);
      this.hashes.push(example.textHash);
    });
  }

  classify(embedding: ArrayLike<number>, options: { excludeHashes?: ReadonlySet<string> } = {}): StudentPrediction {
    const empty = { categories: [], confidence: 0, primary: null, neighbours: 0 };
    if (this.size === 0 || embedding.length !== this.dimensions) return empty;
    const query = normalizeVector(embedding);
    const k = Math.min(this.options.k, this.size);
    const topRows: number[] = [];
    const topScores: number[] = [];
    for (let row = 0; row < this.size; row += 1) {
      if (options.excludeHashes?.has(this.hashes[row])) continue;
      const offset = row * this.dimensions;
      let score = 0;
      for (let index = 0; index < this.dimensions; index += 1) score += this.matrix[offset + index] * query[index];
      if (topScores.length === k && score <= topScores[k - 1]) continue;
      let position = topScores.length < k ? topScores.length : k - 1;
      while (position > 0 && topScores[position - 1] < score) position -= 1;
      topScores.splice(position, 0, score);
      topRows.splice(position, 0, row);
      if (topScores.length > k) {
        topScores.pop();
        topRows.pop();
      }
    }

    const votes = new Map<string, number>();
    let total = 0;
    topRows.forEach((row, index) => {
      const weight = Math.max(0, topScores[index]);
      const [primary, secondary] = this.labels[row];
      total += weight;
      votes.set(primary, (votes.get(primary) ?? 0) + weight);
      if (secondary) votes.set(secondary, (votes.get(secondary) ?? 0) + weight * SECONDARY_VOTE_SHARE);
    });
    if (total === 0) return { ...empty, neighbours: topRows.length };

    const ranked = [...votes.entries()].sort(([left, a], [right, b]) =>
      b - a || (CANONICAL_ORDER.get(left) ?? 99) - (CANONICAL_ORDER.get(right) ?? 99));
    const [winner, winnerWeight] = ranked[0];
    const confidence = Math.min(1, winnerWeight / total);
    if (confidence < this.options.minConfidence) {
      return { categories: [], confidence, primary: winner, neighbours: topRows.length };
    }
    const categories = [winner];
    const runnerUp = ranked[1];
    if (runnerUp && runnerUp[1] >= winnerWeight * SECOND_CATEGORY_RATIO) categories.push(runnerUp[0]);
    return { categories, confidence, primary: winner, neighbours: topRows.length };
  }
}
