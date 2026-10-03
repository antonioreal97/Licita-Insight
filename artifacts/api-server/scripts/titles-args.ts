export const optionValue = (args: readonly string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

export const positiveIntegerOption = (value: string | undefined, name: string, fallback: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

export const statusesOption = (value: string | undefined): string[] => {
  const statuses = (value ?? "open,under_review").split(",").map((status) => status.trim()).filter(Boolean);
  if (statuses.length === 0) throw new Error("--status needs at least one status");
  return statuses;
};
