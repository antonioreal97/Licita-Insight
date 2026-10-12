/** Hours kept free for the nightly jobs (00:00–05:30) and for the PNCP and Mapas collections at 06:00. */
const INTERNATIONAL_FIRST_HOUR = 7;
const INTERNATIONAL_DEFAULT_HOUR = 10;

/**
 * International sources (World Bank, EU Funding & Tenders) are read once a day after the daily PNCP run
 * finishes and only when `INTERNATIONAL_COLLECT=true`. The configured hour is the safety fallback when PNCP
 * did not run; it stays out of the nightly window and leaves 08:00 and 09:00 to the other scheduled sources.
 */
export const internationalSchedule = (
  env: NodeJS.ProcessEnv = process.env,
): { enabled: false } | { enabled: true; hour: number } => {
  if (env.INTERNATIONAL_COLLECT !== "true") return { enabled: false };
  const raw = env.INTERNATIONAL_HOUR;
  if (raw === undefined || raw.trim() === "")
    return { enabled: true, hour: INTERNATIONAL_DEFAULT_HOUR };
  const hour = Number(raw);
  if (!Number.isInteger(hour) || hour < INTERNATIONAL_FIRST_HOUR || hour > 23) {
    throw new Error(
      `INTERNATIONAL_HOUR must be an integer from ${INTERNATIONAL_FIRST_HOUR} to 23, received "${raw}"`,
    );
  }
  return { enabled: true, hour };
};
