import type { ingestDaysTable } from "@workspace/db/schema";
import { PNCP_UFS } from "./pncp-client";

export type IngestDay = typeof ingestDaysTable.$inferSelect;

export const saoPauloToday = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

export const addDays = (isoDate: string, days: number): string => {
  const date = new Date(`${isoDate}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return saoPauloToday(date);
};

export const eachDay = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
};

export const isSealed = (row: IngestDay, today: string): boolean =>
  row.status === "complete" &&
  row.completedAt !== null &&
  row.day < today &&
  row.day < saoPauloToday(row.startedAt);

/** "all" requests the national listing; an empty list means no request. */
export function planDay(
  rows: IngestDay[],
  day: string,
  modality: number,
  today: string,
  options: { uf?: string; force?: boolean } = {},
): string[] {
  if (options.force) return [options.uf ?? "all"];
  const partitions = rows.filter(
    (row) => row.day === day && row.modality === modality,
  );
  const pendingScopes = partitions
    .filter((row) => row.status === "pending")
    .map((row) => row.uf);
  if (pendingScopes.length > 0) {
    if (options.uf) {
      return pendingScopes.includes("all") || pendingScopes.includes(options.uf)
        ? [options.uf]
        : [];
    }
    if (pendingScopes.includes("all")) return ["all"];
    if (partitions.some((row) => row.uf === "all" && isSealed(row, today))) {
      return [...new Set(pendingScopes)].filter((uf) => uf !== "all");
    }
  }
  if (partitions.some((row) => row.uf === "all" && isSealed(row, today)))
    return [];
  const sealedUfs = new Set(
    partitions.filter((row) => isSealed(row, today)).map((row) => row.uf),
  );
  if (options.uf) return sealedUfs.has(options.uf) ? [] : [options.uf];
  // Even a pending UF records that national pagination fell back to states.
  if (partitions.some((row) => row.uf !== "all")) {
    return PNCP_UFS.filter((uf) => !sealedUfs.has(uf));
  }
  return ["all"];
}

export function summarizeCoverage(
  rows: IngestDay[],
  options: {
    from: string;
    to: string;
    modalities: number[];
    uf?: string;
    force?: boolean;
  },
  now = new Date(),
) {
  const today = saoPauloToday(now);
  const from = options.from;
  const days = eachDay(from, options.to).map((day) => {
    const modalities = options.modalities.map((modality) => {
      const pendingScopes = planDay(rows, day, modality, today, {
        uf: options.uf,
      });
      return { modality, sealed: pendingScopes.length === 0, pendingScopes };
    });
    return {
      day,
      sealed: modalities.length > 0 && modalities.every((item) => item.sealed),
      modalities,
    };
  });
  return {
    timeZone: "America/Sao_Paulo",
    from,
    to: options.to,
    uf: options.uf ?? "all",
    modalities: options.modalities,
    sealedDays: days.filter((item) => item.sealed).map((item) => item.day),
    nextOpenDay: days.find((item) => !item.sealed)?.day ?? null,
    days,
    partitions: rows
      .filter(
        (row) =>
          row.day >= from &&
          row.day <= options.to &&
          options.modalities.includes(row.modality) &&
          (!options.uf || row.uf === "all" || row.uf === options.uf),
      )
      .map((row) => ({ ...row, sealed: isSealed(row, today) })),
  };
}
