import { createHash } from "node:crypto";
import { normalizeText } from "../domain/normalize";
import { categoryLabel } from "../catalog/tender-categories";

/**
 * The exact text the student embeds, for examples and tenders alike: the official title with
 * case and whitespace normalized and nothing else appended (no organization).
 */
export const studentText = (officialTitle: string): string =>
  officialTitle.normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("pt-BR");

export const textHash = (officialTitle: string): string =>
  createHash("sha256").update(studentText(officialTitle)).digest("hex");

/** Deterministic 80/20 split by hash, so the same text always lands on the same side. */
export const splitForHash = (hash: string): "train" | "holdout" =>
  Number.parseInt(hash.slice(0, 8), 16) % 5 === 0 ? "holdout" : "train";

export const comparableWords = (value: string): string[] =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").match(/[\p{L}\d]+/gu) ?? [];

export const buildTenderSearchText = (row: {
  titleNorm: string;
  objectNorm: string;
  itemsNorm: string;
  organizationNorm: string;
  otherNorm: string;
}, displayTitleNorm: string, categorySlugs: readonly string[]): string =>
  [
    displayTitleNorm,
    row.titleNorm,
    row.objectNorm,
    row.itemsNorm,
    row.organizationNorm,
    row.otherNorm,
    normalizeText(categorySlugs.map((slug) => categoryLabel(slug) ?? "").join(" ")),
  ].filter(Boolean).join(" ");
