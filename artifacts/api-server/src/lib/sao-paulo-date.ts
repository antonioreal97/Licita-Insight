export const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const saoPauloDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const parseDateParameter = (value: string): Date | null => {
  if (!dateOnlyPattern.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value ? date : null;
};

export const dateParameterValue = (value: Date): string =>
  value.toISOString().slice(0, 10);

export const dateInSaoPaulo = (value: Date): string => {
  const parts = Object.fromEntries(
    saoPauloDateFormatter
      .formatToParts(value)
      .filter((part) =>
        part.type === "year" || part.type === "month" || part.type === "day"
      )
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};
