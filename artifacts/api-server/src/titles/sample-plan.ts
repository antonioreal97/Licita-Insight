import { studentText, textHash } from "./text";

const REGION_BY_UF: Record<string, string> = {
  AC: "N", AM: "N", AP: "N", PA: "N", RO: "N", RR: "N", TO: "N",
  AL: "NE", BA: "NE", CE: "NE", MA: "NE", PB: "NE", PE: "NE", PI: "NE", RN: "NE", SE: "NE",
  DF: "CO", GO: "CO", MS: "CO", MT: "CO",
  ES: "SE", MG: "SE", RJ: "SE", SP: "SE",
  PR: "S", RS: "S", SC: "S",
};

const lengthBucket = (length: number): string => (length <= 60 ? "short" : length <= 150 ? "medium" : "long");

export type SampleCandidate = { id: string; title: string; modality: string; state: string | null; orderKey: string };

export type FocusedSampleCandidate = {
  candidate: SampleCandidate;
  primary: string;
  confidence: number;
};

/**
 * Deterministic stratified plan: dedupe by normalized text (first by md5 order wins), then
 * allocate the size proportionally to modality × text length × region, largest remainder first.
 */
export const planTeacherSample = (candidates: readonly SampleCandidate[], size: number): SampleCandidate[] => {
  const seen = new Set<string>();
  const strata = new Map<string, SampleCandidate[]>();
  for (const candidate of [...candidates].sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id))) {
    const hash = textHash(candidate.title);
    if (studentText(candidate.title) === "" || seen.has(hash)) continue;
    seen.add(hash);
    const key = [
      candidate.modality,
      lengthBucket(studentText(candidate.title).length),
      REGION_BY_UF[candidate.state?.toUpperCase() ?? ""] ?? "?",
    ].join("|");
    const stratum = strata.get(key) ?? [];
    stratum.push(candidate);
    strata.set(key, stratum);
  }
  const total = seen.size;
  const target = Math.min(size, total);
  if (target === 0) return [];
  const quotas = [...strata.entries()].map(([key, members]) => {
    const exact = (target * members.length) / total;
    return { key, members, quota: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let missing = target - quotas.reduce((sum, { quota }) => sum + quota, 0);
  for (const entry of [...quotas].sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key))) {
    if (missing === 0) break;
    if (entry.quota < entry.members.length) {
      entry.quota += 1;
      missing -= 1;
    }
  }
  return quotas
    .flatMap(({ members, quota }) => members.slice(0, quota))
    .sort((a, b) => a.orderKey.localeCompare(b.orderKey) || a.id.localeCompare(b.id));
};

/** Balances the least-confident predictions across the requested classes. */
export const selectFocusedCandidates = (
  candidates: readonly FocusedSampleCandidate[],
  focus: readonly string[],
  size: number,
): SampleCandidate[] => {
  const queues = [...new Set(focus)]
    .map((slug) => candidates
      .filter(({ primary }) => primary === slug)
      .sort((a, b) => a.confidence - b.confidence ||
        a.candidate.orderKey.localeCompare(b.candidate.orderKey) ||
        a.candidate.id.localeCompare(b.candidate.id)))
    .filter((queue) => queue.length > 0);
  const plan: SampleCandidate[] = [];
  while (plan.length < size && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && plan.length < size) plan.push(next.candidate);
    }
  }
  return plan;
};
