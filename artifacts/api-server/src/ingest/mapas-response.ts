import { MapasClientError } from "./mapas-errors";
import type { MapasOpportunity } from "./opportunity-map";

export type MapasListingBody = {
  status: number;
  body: string;
  contentType?: string | null;
};

export type ParsedListing = {
  records: MapasOpportunity[];
  /** True when the JSON was found behind a BOM or a PHP notice the server printed first. */
  recovered: boolean;
};

const SNIPPET_LENGTH = 160;
const MAX_RECOVERY_ATTEMPTS = 25;

/** First characters of the body on one line, enough to tell an HTML error page from a PHP notice. */
export const bodySnippet = (body: string): string => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH)}…`
    : flat;
};

const isRecord = (item: unknown): item is MapasOpportunity =>
  item !== null && typeof item === "object" && !Array.isArray(item);

const tryParse = (
  text: string,
): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
};

/**
 * PHP prints warnings and notices before the payload when `display_errors` is on, so the listing arrives as
 * `<br /><b>Warning</b>: … on line <b>12</b><br />[{…}]`. The listing is the array of objects that runs to the
 * end of the body; brackets inside the notice itself do not parse as one and are skipped.
 */
const recoverTrailingArray = (text: string): unknown[] | null => {
  if (!text.endsWith("]")) return null;
  let attempts = 0;
  for (
    let start = text.indexOf("[");
    start !== -1 && attempts < MAX_RECOVERY_ATTEMPTS;
    start = text.indexOf("[", start + 1), attempts += 1
  ) {
    const parsed = tryParse(text.slice(start));
    if (
      parsed.ok &&
      Array.isArray(parsed.value) &&
      parsed.value.every(isRecord)
    ) {
      return parsed.value;
    }
  }
  return null;
};

const describe = (response: MapasListingBody): string =>
  `status ${response.status}, content-type ${response.contentType ?? "ausente"}, ${Buffer.byteLength(response.body)} bytes`;

const invalid = (
  reason: string,
  response: MapasListingBody,
  url: string,
): MapasClientError =>
  new MapasClientError(
    `Mapas Culturais ${reason} for ${url} (${describe(response)}): ${JSON.stringify(bodySnippet(response.body))}`,
    response.status,
    "invalid_response",
  );

const asRecords = (items: unknown[]): MapasOpportunity[] =>
  items.filter(isRecord);

export const parseMapasListing = (
  response: MapasListingBody,
  url: string,
): ParsedListing => {
  // `trim()` also drops a UTF-8 byte order mark, which `JSON.parse` rejects.
  const text = response.body.trim();
  const hadBom = response.body.charCodeAt(0) === 0xfeff;
  if (text === "") throw invalid("returned an empty body", response, url);

  const parsed = tryParse(text);
  if (parsed.ok) {
    if (!Array.isArray(parsed.value)) {
      throw invalid("listing was not an array", response, url);
    }
    return { records: asRecords(parsed.value), recovered: hadBom };
  }

  const recovered = recoverTrailingArray(text);
  if (recovered) return { records: asRecords(recovered), recovered: true };
  throw invalid("returned a non-JSON body", response, url);
};
