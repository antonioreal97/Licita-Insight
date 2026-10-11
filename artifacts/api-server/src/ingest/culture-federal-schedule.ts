/** Hours kept free for the nightly jobs (00:00–05:30) and for the PNCP and Mapas collections at 06:00. */
const CULTURE_FEDERAL_FIRST_HOUR = 7;
const CULTURE_FEDERAL_DEFAULT_HOUR = 9;

/**
 * Federal culture sources (Transferegov, MinC, Funarte) are read once a day and only when
 * `CULTURE_FEDERAL_COLLECT=true`. The hour must stay out of the nightly window and off the PNCP hour.
 */
export const cultureFederalSchedule = (
  env: NodeJS.ProcessEnv = process.env,
): { enabled: false } | { enabled: true; hour: number } => {
  if (env.CULTURE_FEDERAL_COLLECT !== "true") return { enabled: false };
  const raw = env.CULTURE_FEDERAL_HOUR;
  if (raw === undefined || raw.trim() === "")
    return { enabled: true, hour: CULTURE_FEDERAL_DEFAULT_HOUR };
  const hour = Number(raw);
  if (
    !Number.isInteger(hour) ||
    hour < CULTURE_FEDERAL_FIRST_HOUR ||
    hour > 23
  ) {
    throw new Error(
      `CULTURE_FEDERAL_HOUR must be an integer from ${CULTURE_FEDERAL_FIRST_HOUR} to 23, received "${raw}"`,
    );
  }
  return { enabled: true, hour };
};
