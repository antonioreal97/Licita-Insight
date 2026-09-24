export const subscriptionStatuses = [
  "pending",
  "active",
  "past_due",
  "canceled",
] as const;

export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export type SubscriptionSnapshot = {
  status: string | null;
  currentPeriodEnd: Date | null;
  trialEndsAt?: Date | null;
};

export type EntitlementSource = "subscription" | "trial" | "dev" | null;

export function devEntitlementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env.BILLING_DEV_ENTITLED === "true";
}

/** Active, or canceled with the already-paid period still open. */
export function isEntitled(
  row: SubscriptionSnapshot | null,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return entitlementSource(row, now, env) !== null;
}

export function entitlementSource(
  row: SubscriptionSnapshot | null,
  now: Date,
  env: NodeJS.ProcessEnv = process.env,
): EntitlementSource {
  if (hasSubscriptionEntitlement(row, now)) return "subscription";
  if (row?.trialEndsAt && row.trialEndsAt > now) return "trial";
  return devEntitlementEnabled(env) ? "dev" : null;
}

export function hasSubscriptionEntitlement(
  row: SubscriptionSnapshot | null,
  now: Date,
): boolean {
  return Boolean(
    row?.status === "active" ||
      (row?.status === "canceled" &&
        row.currentPeriodEnd !== null &&
        row.currentPeriodEnd > now),
  );
}

/** Asaas dates are calendar days. The paid period ends at midnight in São Paulo on `nextDueDate`. */
export function periodEndFromAsaasDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid Asaas date: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000-03:00`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Asaas date: ${value}`);
  }
  return date;
}
