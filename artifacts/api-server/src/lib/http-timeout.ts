export const timeoutMsFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

export const timeoutSignal = (name: string, fallback: number): AbortSignal =>
  AbortSignal.timeout(timeoutMsFromEnv(name, fallback));
