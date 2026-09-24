const TIME_ZONE = "America/Sao_Paulo";

export const millisecondsUntilSaoPauloHour = (
  hour: number,
  now = new Date(),
): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const past =
    parts.hour > hour ||
    (parts.hour === hour && (parts.minute > 0 || parts.second > 0));
  const target = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + (past ? 1 : 0),
      hour + 3,
      0,
      0,
    ),
  );
  return Math.max(1_000, target.getTime() - now.getTime());
};
