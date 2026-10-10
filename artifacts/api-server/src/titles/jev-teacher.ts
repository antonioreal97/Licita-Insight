import type { JevTenderCategory } from "../ai/jev-client";
import { isTenderCategorySlug } from "../catalog/tender-categories";
import { SECOND_CATEGORY_RATIO } from "./student";

/** Marks Jev rows in `ai_title_usage`, apart from the OpenAI title teacher's. */
export const JEV_TEACHER_USAGE_PREFIX = "jev-teacher/";
/** Bump whenever the Jev question or criteria change the teacher's answers. */
export const JEV_TEACHER_PROMPT_VERSION = 1;

export type JevCategoryTeacher = (officialTitle: string) => Promise<JevTenderCategory>;

/** Jev's choice plus a runner-up that reaches the same share the student asks of a second category. */
export const jevCategories = (answer: Pick<JevTenderCategory, "category" | "probabilities">): string[] => {
  if (!isTenderCategorySlug(answer.category)) return [];
  const primary = answer.probabilities[answer.category] ?? 0;
  const runnerUp = Object.entries(answer.probabilities)
    .filter(([slug]) => slug !== answer.category && slug !== "outros" && isTenderCategorySlug(slug))
    .sort(([, left], [, right]) => (right ?? 0) - (left ?? 0))[0];
  return answer.category !== "outros" && runnerUp && primary > 0 && (runnerUp[1] ?? 0) >= primary * SECOND_CATEGORY_RATIO
    ? [answer.category, runnerUp[0]]
    : [answer.category];
};
