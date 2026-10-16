import { placeFromName } from "./international-countries";
import { dayOfTimestamp, localDeadline } from "./international-deadline";
import {
  internationalDraft,
  type InternationalOpportunityDraft,
} from "./international-draft";
import { idbEligibility } from "./international-eligibility";

/**
 * CKAN API of IDB Open Data. Reading the procurement notices once a day, with this identity, was authorized by
 * IDB Open Data on 13/10/2026 (`docs/ops/autorizacoes-fontes.md`).
 */
export const IDB_API_URL = "https://data.iadb.org/api/3/action";
export const IDB_ROBOTS_URL = "https://data.iadb.org/robots.txt";
export const IDB_DATASET =
  "project-procurement-bidding-notices-and-notification-of-contract-awards";
export const IDB_PAGE_SIZE = 100;
/** About 120 notices are open on any day: two pages. Ten leave room without reading the 25 thousand past ones. */
export const IDB_MAX_PAGES = 10;
/** The identity given to IDB when asking for permission, so it stays fixed instead of following the package version. */
export const IDB_USER_AGENT =
  "PardalDigital/1.0 (+https://pardaldigital.com; contato@pardaldigital.com)";

/** Notices a supplier can act on. Awards, general notices and requests for information are not calls. */
const NOTICE_TYPES: Record<string, string> = {
  SPECIFIC: "Aviso específico de aquisição",
  EOI: "Pedido de manifestação de interesse",
};

/** Columns asked from the DataStore. The dataset has no contact person, e-mail or phone. */
const FIELDS = [
  "noticeid",
  "type",
  "countryname",
  "projectnumber",
  "loannumber",
  "noticetitle",
  "documenturl",
  "projectname",
  "publicationdate",
  "deadline",
  "sectorenglnm",
  "category_nm",
  "prcrmnt_mthd_engl_nm",
];

export const idbPackageUrl = (): string =>
  `${IDB_API_URL}/package_show?id=${IDB_DATASET}`;

/** The DataStore table of the dataset. Its id changes when IDB replaces the file, so it is read on every run. */
export const idbResourceId = (payload: unknown): string => {
  const result = (payload as { result?: { resources?: unknown } } | null)
    ?.result;
  const resources = Array.isArray(result?.resources) ? result.resources : [];
  const table = resources.find(
    (resource): resource is { id: string } =>
      resource !== null &&
      typeof resource === "object" &&
      (resource as { datastore_active?: unknown }).datastore_active === true &&
      typeof (resource as { id?: unknown }).id === "string",
  );
  if (!table)
    throw new Error(
      "BID: o dataset de avisos não tem tabela consultável (datastore_active)",
    );
  return table.id;
};

/**
 * One page of notices, latest deadline first. `deadline` is an ISO day stored as text, so the order is the
 * date order and the reading stops at the first page that reaches deadlines already past.
 */
export const idbPageUrl = (resourceId: string, offset: number): string => {
  const params = new URLSearchParams({
    resource_id: resourceId,
    filters: JSON.stringify({ type: Object.keys(NOTICE_TYPES) }),
    sort: "deadline desc, _id asc",
    fields: FIELDS.join(","),
    limit: String(IDB_PAGE_SIZE),
    offset: String(offset),
  });
  return `${IDB_API_URL}/datastore_search?${params.toString()}`;
};

const GROUPS: Record<string, string> = {
  goods: "Bens",
  works: "Obras",
  "consulting firms": "Consultoria",
  "non-consulting services": "Serviços (não consultoria)",
};

/** The dataset has no language column; the notice is written in the language of the borrowing country. */
const ENGLISH_SPEAKING = new Set(["BS", "BB", "BZ", "GY", "JM", "SR", "TT"]);
const languageOf = (country: string | null): string | null =>
  country === null || country === "HT"
    ? null
    : country === "BR"
      ? "pt"
      : ENGLISH_SPEAKING.has(country)
        ? "en"
        : "es";

const GENERAL_NOTICE =
  /^(general procurement notice|aviso general de adquisiciones|aviso geral de aquisi)/i;
const AMENDMENT = /^(enmienda|amendment|altera[cç][aã]o|adenda|addendum)\b/i;

/** Text columns come from a spreadsheet: carriage returns survive as `_x000D_`. */
const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(/_x000D_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed === "" ? null : trimmed;
};

const officialUrl = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const brazilianDay = (day: string | null): string | null =>
  day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : null;

export type IdbPage = {
  /** Notices of the two types in the dataset, open or not, as the API reports it. */
  total: number;
  rows: number;
  drafts: InternationalOpportunityDraft[];
  /** Rows left out: general notice, no official link, no deadline, or deadline already past. */
  skipped: number;
  /** The page reached deadlines before yesterday (UTC): the next pages only hold closed notices. */
  done: boolean;
};

export const parseIdbPage = (payload: unknown, now: Date): IdbPage => {
  const result = (payload as { success?: unknown; result?: unknown } | null)
    ?.result as { total?: unknown; records?: unknown } | undefined;
  if (!result || !Array.isArray(result.records))
    throw new Error("BID: resposta sem a lista de avisos");
  const drafts: InternationalOpportunityDraft[] = [];
  let skipped = 0;
  // A deadline published as the local day can still be open in a zone behind UTC.
  const windowStart = isoDay(new Date(now.getTime() - 86_400_000));
  let lastDay: string | null = null;

  for (const item of result.records) {
    if (item === null || typeof item !== "object") {
      skipped += 1;
      continue;
    }
    const notice = item as Record<string, unknown>;
    const id = text(notice.noticeid);
    const type = text(notice.type)?.toUpperCase() ?? "";
    const noticeLabel = NOTICE_TYPES[type];
    const title = text(notice.noticetitle);
    const day = dayOfTimestamp(notice.deadline);
    if (day) lastDay = day;
    const countryPublished = text(notice.countryname);
    // Regional operations of the IDB are always in Latin America and the Caribbean.
    const place = placeFromName(
      countryPublished?.toUpperCase() === "REGIONAL"
        ? "Latin America and the Caribbean"
        : countryPublished,
    );
    const deadline = localDeadline({
      day,
      clock: null,
      timeZone: place.timeZone,
    });
    const sourceUrl = officialUrl(notice.documenturl);
    if (
      !id ||
      !noticeLabel ||
      !title ||
      GENERAL_NOTICE.test(title) ||
      !sourceUrl ||
      !deadline ||
      deadline.at.getTime() < now.getTime()
    ) {
      skipped += 1;
      continue;
    }

    const amendment = AMENDMENT.test(title);
    const projectNumber = text(notice.projectnumber);
    const projectName = text(notice.projectname);
    const loanNumber = text(notice.loannumber);
    const method = text(notice.prcrmnt_mthd_engl_nm);
    const category = text(notice.category_nm);
    const sector = text(notice.sectorenglnm);
    const opportunityType =
      (category ? GROUPS[category.toLowerCase()] : undefined) ??
      (type === "EOI" ? "Consultoria" : null);
    const published = dayOfTimestamp(notice.publicationdate);
    const where = place.countryName ?? "país não informado";
    const project = [projectNumber, projectName].filter(Boolean).join(" · ");
    const summary = [
      `${noticeLabel}${opportunityType ? ` de ${opportunityType.toLowerCase()}` : ""} em ${where}`,
      method ? `, método ${method}` : "",
      projectName ? `, no projeto ${projectName}` : "",
      ", com financiamento do BID.",
      amendment
        ? " Emenda a um aviso já publicado: confira também o aviso original."
        : "",
    ].join("");

    drafts.push(
      internationalDraft({
        source: "idb",
        externalId: id,
        kind: "procurement",
        titleOriginal: title,
        language: languageOf(place.country),
        summary,
        organizationName: "Banco Interamericano de Desenvolvimento (BID)",
        originName: project || null,
        opportunityType,
        place,
        // Midnight in Brasília: the hub prints dates in Brasília time, where UTC midnight is still the day before.
        registrationFrom: published
          ? new Date(`${published}T00:00:00-03:00`)
          : null,
        deadline,
        sourceStatus: "open",
        brazilEligibility: idbEligibility({
          methodName: method,
          country: place.country,
          countryName: place.countryName,
          texts: [title],
        }),
        sourceUrl,
        details: [
          {
            label: "Tipo de aviso",
            value: amendment ? `${noticeLabel} (emenda)` : noticeLabel,
          },
          { label: "Método", value: method ?? "" },
          { label: "Operação", value: loanNumber ?? "" },
          {
            label: "Setor",
            value: sector
              ? `${sector.charAt(0)}${sector.slice(1).toLowerCase()}`
              : "",
          },
          {
            label: "País do projeto",
            value: place.countryName ?? countryPublished ?? "",
          },
          { label: "Publicado em", value: brazilianDay(published) ?? "" },
        ],
        searchExtras: [
          projectNumber,
          loanNumber,
          method,
          noticeLabel,
          sector,
          "BID",
          "IDB",
          "Banco Interamericano de Desenvolvimento",
        ],
        raw: {
          noticeId: id,
          type,
          amendment,
          publishedOn: published,
          deadlineDay: day,
          country: countryPublished,
          projectNumber,
          projectName,
          loanNumber,
          method,
          category,
          sector,
        },
        now,
      }),
    );
  }

  const total = Number(result.total);
  return {
    total: Number.isFinite(total) ? total : result.records.length,
    rows: result.records.length,
    drafts,
    skipped,
    done: lastDay !== null && lastDay < windowStart,
  };
};
