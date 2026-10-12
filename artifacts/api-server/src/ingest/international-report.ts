import type { InternationalSourceResult } from "./international-client";
import type { InternationalOpportunityDraft } from "./international-draft";
import {
  isPtaxCurrency,
  type PtaxCurrency,
} from "./ptax-client";

/** The run row keeps what was read and why, not the calls themselves. */
export const internationalSourceSummary = (sources: InternationalSourceResult[]) =>
  sources.map(({ drafts: _drafts, ...summary }) => summary);

const countBy = <T>(
  items: T[],
  key: (item: T) => string,
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
};

/** Open and upcoming calls per source and per eligibility answer: the collection report shown to operators. */
export const internationalCounts = (drafts: InternationalOpportunityDraft[]) =>
  Object.fromEntries(
    [...new Set(drafts.map((draft) => draft.source))].map((source) => {
      const ofSource = drafts.filter((draft) => draft.source === source);
      return [
        source,
        {
          total: ofSource.length,
          status: countBy(ofSource, (draft) => draft.status),
          brazilEligibility: countBy(
            ofSource,
            (draft) => draft.brazilEligibility.status,
          ),
          brazilFunding: countBy(
            ofSource.filter((draft) => draft.brazilFunding !== null),
            (draft) => draft.brazilFunding!.status,
          ),
          eligibilityRule: countBy(
            ofSource,
            (draft) => draft.brazilEligibility.rule,
          ),
          kind: countBy(ofSource, (draft) => draft.kind),
          language: countBy(ofSource, (draft) => draft.language ?? "?"),
          projectsInBrazil: ofSource.filter((draft) => draft.country === "BR")
            .length,
          exactDeadline: ofSource.filter(
            (draft) => draft.deadlinePrecision === "datetime",
          ).length,
          withAmount: ofSource.filter((draft) => draft.amountOriginal !== null)
            .length,
        },
      ];
    }),
  );

export const internationalCurrencies = (
  drafts: InternationalOpportunityDraft[],
): PtaxCurrency[] => [
  ...new Set(
    drafts.flatMap((draft) =>
      draft.amountOriginal !== null && isPtaxCurrency(draft.currency)
        ? [draft.currency]
        : [],
    ),
  ),
];
