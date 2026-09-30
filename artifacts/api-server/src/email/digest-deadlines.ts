import { dateInSaoPaulo, parseDateParameter } from "../lib/sao-paulo-date";

/** Personal stages whose deadlines appear in the daily digest ("Seus prazos"). */
export const DIGEST_DEADLINE_STAGES = ["analyzing", "participating"] as const;
export type DigestDeadlineStage = (typeof DIGEST_DEADLINE_STAGES)[number];

/** Official statuses whose proposal deadline no longer means anything to the user. */
export const INACTIVE_TENDER_STATUSES = ["suspended", "cancelled", "closed"] as const;

export const DIGEST_DEADLINE_LIMIT = 10;
const DIGEST_DEADLINE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1_000;

/** One saved tender in "Seus prazos"; at least one of its deadlines falls in the window. */
export type EmailDeadlineSnapshot = {
  tenderId: string;
  tenderTitle: string;
  tenderOrganizationName: string;
  stage: DigestDeadlineStage;
  nextAction: string | null;
  /** `nextActionDeadline` informed by the user, when in the window. */
  personalDeadline: Date | null;
  /** Official `proposal_deadline`, when in the window and the tender is still active. */
  proposalDeadline: Date | null;
};

const saoPauloDay = (value: Date): number =>
  parseDateParameter(dateInSaoPaulo(value))!.getTime();

/**
 * Exclusive end of the window: midnight (Brasília, UTC-3 without DST, like the
 * digest schedule) after the 3rd day following `now`.
 */
export const digestDeadlineWindowEnd = (now: Date): Date =>
  new Date(saoPauloDay(now) + (DIGEST_DEADLINE_DAYS + 1) * DAY_MS + 3 * 60 * 60 * 1_000);

export const isInDigestDeadlineWindow = (deadline: Date, now: Date): boolean =>
  deadline > now && deadline < digestDeadlineWindowEnd(now);

/** Calendar-day distance in Brasília: "hoje", "amanhã" or "em N dias". */
export const relativeDeadlineDay = (deadline: Date, now: Date): string => {
  const days = Math.round((saoPauloDay(deadline) - saoPauloDay(now)) / DAY_MS);
  if (days <= 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
};

/** Closest of the tender's deadlines in the window; the personal one wins a tie. */
export const nearestDeadline = (deadline: EmailDeadlineSnapshot): Date =>
  deadline.personalDeadline &&
  (!deadline.proposalDeadline || deadline.personalDeadline <= deadline.proposalDeadline)
    ? deadline.personalDeadline
    : deadline.proposalDeadline!;

export const sortDeadlines = (
  deadlines: readonly EmailDeadlineSnapshot[],
): EmailDeadlineSnapshot[] =>
  [...deadlines].sort(
    (left, right) =>
      nearestDeadline(left).getTime() - nearestDeadline(right).getTime() ||
      left.tenderId.localeCompare(right.tenderId),
  );

/** The tender's entry in "Seus prazos", or `null` when none of its deadlines counts. */
export const deadlineForSavedTender = (
  row: {
    tenderId: string;
    tenderTitle: string;
    tenderOrganizationName: string;
    tenderStatus: string;
    proposalDeadline: Date | null;
    stage: string;
    nextAction: string | null;
    nextActionDeadline: Date | null;
  },
  now: Date,
): EmailDeadlineSnapshot | null => {
  if (!DIGEST_DEADLINE_STAGES.includes(row.stage as DigestDeadlineStage)) return null;
  const personalDeadline =
    row.nextActionDeadline && isInDigestDeadlineWindow(row.nextActionDeadline, now)
      ? row.nextActionDeadline
      : null;
  const proposalDeadline =
    row.proposalDeadline &&
    !(INACTIVE_TENDER_STATUSES as readonly string[]).includes(row.tenderStatus) &&
    isInDigestDeadlineWindow(row.proposalDeadline, now)
      ? row.proposalDeadline
      : null;
  if (!personalDeadline && !proposalDeadline) return null;
  return {
    tenderId: row.tenderId,
    tenderTitle: row.tenderTitle,
    tenderOrganizationName: row.tenderOrganizationName,
    stage: row.stage as DigestDeadlineStage,
    nextAction: row.nextAction,
    personalDeadline,
    proposalDeadline,
  };
};
