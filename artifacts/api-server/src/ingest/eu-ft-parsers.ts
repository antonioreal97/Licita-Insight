import type { OpportunityDocument, OpportunityKind } from "@workspace/db";
import { textFromHtml } from "./funding-parsers";
import {
  placeFromName,
  type InternationalPlace,
} from "./international-countries";
import {
  clockOfTimestamp,
  dayOfTimestamp,
  localDeadline,
  zonedTimeToUtc,
  type InternationalDeadline,
} from "./international-deadline";
import {
  compactMoney,
  internationalDraft,
  type InternationalDetail,
  type InternationalOpportunityDraft,
} from "./international-draft";
import { euEligibility, type EuCallType } from "./international-eligibility";

/**
 * Search and Facet APIs of the EU Funding & Tenders Portal, as documented by the Commission
 * (https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/apis). `SEDIA` is the public
 * key the documentation gives. The search result already carries what Topic Details returns (conditions,
 * budget, description), so no request per topic is made.
 */
const API_BASE = "https://api.tech.ec.europa.eu/search-api/prod/rest";
export const EU_FT_ROBOTS_URL = "https://api.tech.ec.europa.eu/robots.txt";
export const EU_FT_PAGE_SIZE = 100;

export const EU_STATUS_FORTHCOMING = "31094501";
export const EU_STATUS_OPEN = "31094502";
/** `type` in the query DSL: 1 grant topic, 2 external action call for proposals, 8 cascade funding call. */
export const EU_TYPES = ["1", "2", "8"] as const;

/** The documented query DSL: open or forthcoming grant topics, external action calls and cascade calls. */
export const EU_FT_QUERY = {
  bool: {
    must: [
      { terms: { type: [...EU_TYPES] } },
      { terms: { status: [EU_STATUS_FORTHCOMING, EU_STATUS_OPEN] } },
    ],
  },
};

const requestParts = () => ({
  query: EU_FT_QUERY,
  languages: ["en"],
  // A stable order, so a page boundary does not skip or repeat a call while the listing is read.
  sort: { order: "ASC", field: "identifier" },
});

export const euSearchRequest = (pageNumber: number) => ({
  url: `${API_BASE}/search?apiKey=SEDIA&text=***&pageSize=${EU_FT_PAGE_SIZE}&pageNumber=${pageNumber}`,
  method: "POST" as const,
  jsonParts: requestParts(),
});

export const euFacetRequest = () => ({
  url: `${API_BASE}/facet?apiKey=SEDIA&text=***`,
  method: "POST" as const,
  jsonParts: { query: EU_FT_QUERY, languages: ["en"] },
});

/** Wall clock of every deadline of the portal (it labels the values `+0000`, but they are Brussels time). */
export const EU_TIME_ZONE = "Europe/Brussels";

const TOPIC_PAGE =
  "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details";

export type EuLabels = Map<string, Map<string, string>>;

/** Code-to-label tables of the Facet API (`frameworkProgramme`, `geographicalZones`, `contractType`…). */
export const parseEuFacets = (payload: unknown): EuLabels => {
  const labels: EuLabels = new Map();
  const facets =
    payload !== null && typeof payload === "object"
      ? (payload as { facets?: unknown }).facets
      : null;
  if (!Array.isArray(facets)) return labels;
  for (const facet of facets) {
    if (facet === null || typeof facet !== "object") continue;
    const { name, values } = facet as { name?: unknown; values?: unknown };
    if (typeof name !== "string" || !Array.isArray(values)) continue;
    const table = new Map<string, string>();
    for (const value of values) {
      if (value === null || typeof value !== "object") continue;
      const { rawValue, value: label } = value as {
        rawValue?: unknown;
        value?: unknown;
      };
      if (typeof rawValue === "string" && typeof label === "string")
        table.set(rawValue, label.replace(/\s+/g, " ").trim());
    }
    labels.set(name, table);
  }
  return labels;
};

type Metadata = Record<string, unknown>;

const values = (metadata: Metadata, field: string): string[] => {
  const value = metadata[field];
  return Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" && item.trim() !== "" ? [item.trim()] : [],
      )
    : [];
};

const first = (metadata: Metadata, field: string): string | null =>
  values(metadata, field)[0] ?? null;

/** Some fields hold a JSON document as a string (`budgetOverview`, `publicationDocuments`). */
const json = (metadata: Metadata, field: string): unknown => {
  const raw = first(metadata, field);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const brazilianDay = (day: string | null): string | null =>
  day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : null;

/** The portal writes a deadline with no hour as midnight. */
const hasClock = (clock: string | null): clock is string =>
  clock !== null && !/^00:00(:00)?$/.test(clock);

const deadlineOf = (stamp: string): InternationalDeadline | null => {
  const clock = clockOfTimestamp(stamp);
  return localDeadline({
    day: dayOfTimestamp(stamp),
    clock: hasClock(clock) ? clock.slice(0, 5) : null,
    timeZone: EU_TIME_ZONE,
  });
};

/** The next cut-off still ahead; with none ahead, the last one (the call is then closed). */
const nextDeadline = (
  stamps: string[],
  now: Date,
): InternationalDeadline | null => {
  const deadlines = stamps
    .flatMap((stamp) => {
      const deadline = deadlineOf(stamp);
      return deadline ? [deadline] : [];
    })
    .sort((left, right) => left.at.getTime() - right.at.getTime());
  return (
    deadlines.find((deadline) => deadline.at.getTime() >= now.getTime()) ??
    deadlines.at(-1) ??
    null
  );
};

type TopicBudget = {
  total: number | null;
  minContribution: number | null;
  maxContribution: number | null;
  expectedGrants: number | null;
};

const positive = (value: unknown): number | null => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number > 0
    ? number
    : null;
};

/** The budget lines of this topic inside the call-wide `budgetOverview`. */
const topicBudget = (overview: unknown, identifier: string): TopicBudget => {
  const empty: TopicBudget = {
    total: null,
    minContribution: null,
    maxContribution: null,
    expectedGrants: null,
  };
  const map =
    overview !== null && typeof overview === "object"
      ? (overview as { budgetTopicActionMap?: unknown }).budgetTopicActionMap
      : null;
  if (map === null || typeof map !== "object") return empty;
  const lines = Object.values(map as Record<string, unknown>)
    .flatMap((actions) => (Array.isArray(actions) ? actions : []))
    .filter(
      (line): line is Record<string, unknown> =>
        line !== null &&
        typeof line === "object" &&
        typeof (line as { action?: unknown }).action === "string" &&
        ((line as { action: string }).action === identifier ||
          (line as { action: string }).action.startsWith(`${identifier} `)),
    );
  if (lines.length === 0) return empty;
  let total = 0;
  let grants = 0;
  let min: number | null = null;
  let max: number | null = null;
  for (const line of lines) {
    const years = line.budgetYearMap;
    if (years !== null && typeof years === "object")
      for (const amount of Object.values(years as Record<string, unknown>))
        total += positive(amount) ?? 0;
    grants += positive(line.expectedGrants) ?? 0;
    const lineMin = positive(line.minContribution);
    const lineMax = positive(line.maxContribution);
    if (lineMin !== null) min = min === null ? lineMin : Math.min(min, lineMin);
    if (lineMax !== null) max = max === null ? lineMax : Math.max(max, lineMax);
  }
  return {
    total: total > 0 ? total : null,
    minContribution: min,
    maxContribution: max,
    expectedGrants: grants > 0 ? grants : null,
  };
};

const MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

/** Title, official link and media type only. The files are never downloaded. */
const documentsOf = (published: unknown): OpportunityDocument[] => {
  if (!Array.isArray(published)) return [];
  const seen = new Set<string>();
  return published.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const { nameDoc, docUrl, typeDoc } = item as Record<string, unknown>;
    if (typeof nameDoc !== "string" || typeof docUrl !== "string") return [];
    if (!/^https:\/\//i.test(docUrl) || seen.has(docUrl)) return [];
    seen.add(docUrl);
    return [
      {
        title: nameDoc.replace(/\s+/g, " ").trim().slice(0, 200),
        url: docUrl,
        mediaType:
          typeof typeDoc === "string"
            ? (MEDIA_TYPES[typeDoc.toLowerCase()] ?? null)
            : null,
      },
    ];
  });
};

const INNOVATION_PROGRAMMES =
  /horizon|euratom|digital europe|european defence fund|innovation|research/i;

const EUROPE: InternationalPlace = {
  country: null,
  countryName: "União Europeia e países associados",
  region: "europa",
  timeZone: null,
};

const TYPE_LABELS: Record<EuCallType, string> = {
  topic: "Subvenção",
  cascade: "Financiamento em cascata",
  external: "Chamada de ação externa",
};

const DEADLINE_MODELS: Record<string, string> = {
  "single-stage": "Etapa única",
  "two-stage": "Duas etapas",
  "multiple cut-off": "Vários prazos de corte",
};

export type EuPage = {
  total: number;
  rows: number;
  drafts: InternationalOpportunityDraft[];
  /** Results left out: another datasource (events, news), no identifier, or deadline already past. */
  skipped: number;
};

const callType = (type: string | null): EuCallType | null =>
  type === "1"
    ? "topic"
    : type === "8"
      ? "cascade"
      : type === "2"
        ? "external"
        : null;

export const parseEuPage = (
  payload: unknown,
  labels: EuLabels,
  now: Date,
): EuPage => {
  if (payload === null || typeof payload !== "object")
    throw new Error("Funding & Tenders: resposta sem a lista de resultados");
  const body = payload as { totalResults?: unknown; results?: unknown };
  if (!Array.isArray(body.results))
    throw new Error("Funding & Tenders: resposta sem a lista de resultados");
  const label = (facet: string, code: string | null): string | null =>
    code ? (labels.get(facet)?.get(code) ?? null) : null;
  const drafts: InternationalOpportunityDraft[] = [];
  let skipped = 0;

  for (const result of body.results) {
    const metadata =
      result !== null && typeof result === "object"
        ? ((result as { metadata?: unknown }).metadata as Metadata | undefined)
        : undefined;
    if (!metadata || typeof metadata !== "object") {
      skipped += 1;
      continue;
    }
    // A broad text search also indexes events and news: only the three call datasources are accepted.
    const type = callType(first(metadata, "type"));
    const identifier = first(metadata, "identifier");
    const statusCode = first(metadata, "status");
    const sourceStatus =
      statusCode === EU_STATUS_OPEN
        ? ("open" as const)
        : statusCode === EU_STATUS_FORTHCOMING
          ? ("upcoming" as const)
          : null;
    if (!type || !identifier || !sourceStatus) {
      skipped += 1;
      continue;
    }

    // Cascade calls of one topic share its `identifier` and `ccm2Id`; `callccm2Id` is the call itself.
    const cascadeId = first(metadata, "callccm2Id");
    const prospectId = first(metadata, "callIdentifier");
    const externalId =
      type === "topic"
        ? identifier
        : type === "cascade"
          ? cascadeId && `cascade-${cascadeId}`
          : prospectId && `prospect-${prospectId}`;
    const title =
      type === "cascade"
        ? (first(metadata, "callTitle") ??
          first(metadata, "caName") ??
          first(metadata, "title"))
        : first(metadata, "title");
    const deadlineStamps = values(metadata, "deadlineDate");
    const deadline = nextDeadline(deadlineStamps, now);
    // The index keeps "open" on calls that closed years ago, and on some with no deadline at all: a call
    // enters only with a deadline still ahead, or as forthcoming.
    if (
      !externalId ||
      !title ||
      (deadline && deadline.at.getTime() < now.getTime()) ||
      (!deadline && sourceStatus === "open")
    ) {
      skipped += 1;
      continue;
    }

    const programmeCode = first(metadata, "frameworkProgramme");
    const programme = label("frameworkProgramme", programmeCode);
    const typesOfAction = values(metadata, "typesOfAction");
    const contractType = label("contractType", first(metadata, "contractType"));
    const callIdentifier = type === "topic" ? prospectId : null;
    const callTitle = type === "topic" ? first(metadata, "callTitle") : null;
    const projectName = first(metadata, "projectName");

    const startDay = dayOfTimestamp(first(metadata, "startDate"));
    const opensAt = startDay
      ? zonedTimeToUtc(startDay, "00:00", EU_TIME_ZONE)
      : null;
    // A forthcoming call whose planned opening already passed has not opened yet: the source decides.
    const registrationFrom =
      sourceStatus === "upcoming" &&
      opensAt &&
      opensAt.getTime() <= now.getTime()
        ? null
        : opensAt;

    const budget =
      type === "topic"
        ? topicBudget(json(metadata, "budgetOverview"), identifier)
        : {
            total: positive(first(metadata, "budget")),
            minContribution: null,
            maxContribution: null,
            expectedGrants: null,
          };
    const currency = first(metadata, "currency") ?? "EUR";

    const zones = values(metadata, "geographicalZones").flatMap((code) => {
      const name = label("geographicalZones", code);
      return name ? [name] : [];
    });
    const zonePlaces = zones.map((zone) => placeFromName(zone));
    const place: InternationalPlace =
      type !== "external"
        ? EUROPE
        : zonePlaces.length === 1
          ? zonePlaces[0]!
          : {
              country: null,
              countryName: zones.length > 0 ? zones.join(", ") : null,
              region:
                zonePlaces.length > 0 &&
                zonePlaces.every(
                  (zone) => zone.region === zonePlaces[0]!.region,
                )
                  ? zonePlaces[0]!.region
                  : "global",
              timeZone: null,
            };

    const eligibility = euEligibility({
      type,
      identifier,
      programme,
      typesOfAction,
      contractType,
      texts: [
        "topicConditions",
        "descriptionByte",
        "beneficiaryAdministration",
        "description",
        "furtherInformation",
      ].flatMap((field) => values(metadata, field).map(textFromHtml)),
    });

    const kind: OpportunityKind =
      type === "external" && /twinning/i.test(contractType ?? "")
        ? "partnership"
        : type === "topic" && INNOVATION_PROGRAMMES.test(programme ?? identifier)
          ? "innovation"
          : "funding";

    const money = (amount: number | null): string | null =>
      amount === null ? null : compactMoney(amount, currency);
    const perProject =
      budget.maxContribution === null
        ? null
        : budget.minContribution !== null &&
            budget.minContribution !== budget.maxContribution
          ? `de ${money(budget.minContribution)} a ${money(budget.maxContribution)} por projeto`
          : `até ${money(budget.maxContribution)} por projeto`;
    const summary = [
      `${TYPE_LABELS[type]}${programme ? ` do programa ${programme}` : " da União Europeia"}`,
      typesOfAction.length > 0 ? ` (${typesOfAction.join("; ")})` : "",
      ".",
      budget.total !== null ? ` Orçamento: ${money(budget.total)}` : "",
      budget.total !== null && perProject ? `, ${perProject}` : "",
      budget.total !== null && budget.expectedGrants !== null
        ? `, ${budget.expectedGrants} ${budget.expectedGrants === 1 ? "projeto previsto" : "projetos previstos"}`
        : "",
      budget.total !== null ? "." : "",
      type === "cascade" && projectName
        ? ` Aberta pelo projeto ${projectName}.`
        : "",
      type === "external" && zones.length > 0
        ? ` Execução: ${zones.join(", ")}.`
        : "",
      sourceStatus === "upcoming" && startDay
        ? ` Abertura prevista para ${brazilianDay(startDay)}.`
        : "",
      " Chamada em inglês.",
    ].join("");

    const published = first(metadata, "url");
    const sourceUrl =
      published &&
      /^https:\/\//i.test(published) &&
      !/\/data\/topicDetails\//i.test(published)
        ? published
        : `${TOPIC_PAGE}/${encodeURIComponent(identifier)}`;

    const otherDeadlines = [
      ...new Set(
        deadlineStamps.flatMap((stamp) => {
          const day = dayOfTimestamp(stamp);
          return day && deadlineOf(stamp)!.at.getTime() >= now.getTime()
            ? [brazilianDay(day)!]
            : [];
        }),
      ),
    ];
    const deadlineModel = first(metadata, "deadlineModel");
    const details: InternationalDetail[] = [
      { label: "Programa", value: programme ?? "" },
      {
        label: "Chamada",
        value: [callIdentifier, callTitle].filter(Boolean).join(" — "),
      },
      { label: "Identificador", value: identifier },
      { label: "Tipo de ação", value: typesOfAction.join("; ") },
      { label: "Tipo de contrato", value: contractType ?? "" },
      { label: "Projeto que abriu a chamada", value: projectName ?? "" },
      { label: "Área geográfica", value: zones.join(", ") },
      {
        label: "Modelo de prazo",
        value: deadlineModel
          ? (DEADLINE_MODELS[deadlineModel] ?? deadlineModel)
          : "",
      },
      {
        label: "Prazos de corte",
        value: otherDeadlines.length > 1 ? otherDeadlines.join(", ") : "",
      },
      {
        label: "Abertura",
        value: brazilianDay(startDay) ?? "",
      },
      {
        label: "Valor por projeto",
        value: perProject ?? "",
      },
      {
        label: "Projetos previstos",
        value: budget.expectedGrants === null ? "" : String(budget.expectedGrants),
      },
    ];

    drafts.push(
      internationalDraft({
        source: "eu_ft",
        externalId,
        kind,
        titleOriginal: title,
        language: "en",
        summary,
        organizationName: "Comissão Europeia",
        originName:
          type === "cascade"
            ? projectName
            : ([programme, callIdentifier].filter(Boolean).join(" · ") || null),
        opportunityType: TYPE_LABELS[type],
        place,
        amountOriginal: budget.total,
        currency,
        documents:
          type === "external"
            ? documentsOf(json(metadata, "publicationDocuments"))
            : [],
        registrationFrom,
        deadline,
        sourceStatus,
        brazilEligibility: eligibility.participation,
        brazilFunding: eligibility.funding,
        sourceUrl,
        details,
        searchExtras: [identifier, callIdentifier, callTitle, ...typesOfAction],
        raw: {
          identifier,
          type,
          status: statusCode,
          programmeCode,
          programme,
          callIdentifier,
          typesOfAction,
          contractType,
          deadlineDates: deadlineStamps,
          startDate: first(metadata, "startDate"),
          deadlineModel,
          budget,
          zones,
        },
        now,
      }),
    );
  }

  const total = Number(body.totalResults);
  return {
    total: Number.isFinite(total) ? total : body.results.length,
    rows: body.results.length,
    drafts,
    skipped,
  };
};
