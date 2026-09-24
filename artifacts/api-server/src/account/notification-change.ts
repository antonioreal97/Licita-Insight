import type { NotificationChangeRecord } from "@workspace/db/schema";

export type TenderNotificationState = {
  id: string;
  title: string;
  tenderNumberShort: string | null;
  organizationName: string;
  status: string;
  proposalDeadline: Date | null;
  estimatedValue: string | null;
  estimatedValueStatus: string;
};

export type TenderChange = {
  type:
    | "tender_deadline_changed"
    | "tender_status_changed"
    | "tender_value_changed";
  change: NotificationChangeRecord;
};

const scalarDate = (value: Date | null): string | null =>
  value?.toISOString() ?? null;

const scalarMoney = (value: string | null): number | null =>
  value === null ? null : Number(value);

export const tenderChanges = (
  previous: TenderNotificationState,
  next: TenderNotificationState,
): TenderChange[] => {
  const changes: TenderChange[] = [];
  const add = (
    type: TenderChange["type"],
    field: string,
    from: string | number | null,
    to: string | number | null,
  ) => {
    if (from !== to) changes.push({ type, change: { field, from, to } });
  };
  add(
    "tender_deadline_changed",
    "proposalDeadline",
    scalarDate(previous.proposalDeadline),
    scalarDate(next.proposalDeadline),
  );
  add("tender_status_changed", "status", previous.status, next.status);
  add(
    "tender_value_changed",
    "estimatedValue",
    scalarMoney(previous.estimatedValue),
    scalarMoney(next.estimatedValue),
  );
  add(
    "tender_value_changed",
    "estimatedValueStatus",
    previous.estimatedValueStatus,
    next.estimatedValueStatus,
  );
  return changes;
};
