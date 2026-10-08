import type {
  Modality,
  TenderStatus,
} from "@workspace/api-zod";
import type {
  TenderCategory,
  TenderDocumentRecord,
  TenderItemRecord,
  TenderTimelineRecord,
} from "@workspace/db/schema";
import { normalizeText } from "../domain/normalize";
import {
  DISPLAY_TITLE_RULES_VERSION,
  normalizeTenderTitle,
} from "./title-normalizer";
import { categoriesFromOfficialTitle } from "../titles/category-rules";

const MODALITIES: Record<number, Modality> = {
  1: "leilao",
  2: "dialogo_competitivo",
  3: "other",
  4: "concorrencia_eletronica",
  5: "concorrencia",
  6: "pregao_eletronico",
  7: "pregao_presencial",
  8: "dispensa",
  9: "inexigibilidade",
  10: "other",
  11: "other",
  12: "credenciamento",
  13: "leilao",
};

export const PNCP_SOURCE_ID = "pncp";
export const PNCP_SOURCE_NAME = "PNCP";

const CONTROL_NUMBER = /^(\d{14})-(\d+)-(\d+)\/(\d{4})$/;

export type PncpIdentity = {
  cnpj: string;
  sequencial: number;
  ano: number;
};

export type PublicationDraft = {
  id: string;
  pncpControlNumber: string;
  title: string;
  displayTitle: string;
  displayTitleSource: "rules";
  displayTitleVersion: number;
  displayTitleNorm: string;
  displayTitleNeedsModel: boolean;
  objectSummary: string | null;
  description: string | null;
  organizationId: string;
  organizationName: string;
  purchasingUnit: string | null;
  modality: Modality;
  modalityLabel: string;
  status: TenderStatus;
  tenderNumber: string | null;
  processNumber: string | null;
  estimatedValue: string | null;
  estimatedValueStatus: "disclosed" | "confidential" | "not_published";
  publishedAt: Date | null;
  openingAt: Date | null;
  proposalDeadline: Date | null;
  state: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  sourceId: string;
  sourceName: string;
  sourceUrl: string | null;
  categories: TenderCategory[];
  searchText: string;
  titleNorm: string;
  objectNorm: string;
  itemsNorm: string;
  organizationNorm: string;
  otherNorm: string;
  cityNorm: string | null;
  timeline: TenderTimelineRecord[];
  identity: PncpIdentity | null;
};

export class PncpRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PncpRecordError";
  }
}

export const tenderIdFromControlNumber = (controlNumber: string): string =>
  controlNumber.trim().replaceAll("/", "-");

export const parseControlNumber = (value: string): PncpIdentity | null => {
  const match = CONTROL_NUMBER.exec(value.trim());
  if (!match) return null;
  return {
    cnpj: match[1] ?? "",
    sequencial: Number(match[3]),
    ano: Number(match[4]),
  };
};

export const pncpPublicationUrl = (identity: PncpIdentity): string =>
  `https://pncp.gov.br/app/editais/${identity.cnpj}/${identity.ano}/${identity.sequencial}`;

export const parsePncpDate = (value: unknown): Date | null => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim();
  let iso = trimmed;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    iso = `${trimmed}T12:00:00-03:00`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)) {
    iso = `${trimmed}-03:00`;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export const summarizeOfficialObject = (value: string): string => {
  if (value.length <= 300) return value;

  const candidate = value.slice(0, 299).trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const summary = lastSpace >= 240 ? candidate.slice(0, lastSpace) : candidate;
  return `${summary.trimEnd()}…`;
};

export const pncpTenderNumberShort = (
  record: Record<string, unknown>,
): string | null => {
  const number = asString(record.numeroCompra);
  const identity = asString(record.numeroControlePNCP);
  const yearFromControl = identity
    ? parseControlNumber(identity)?.ano
    : undefined;
  const rawYear = record.anoCompra;
  const year =
    typeof rawYear === "number" && Number.isInteger(rawYear)
      ? rawYear
      : typeof rawYear === "string" && /^\d{4}$/.test(rawYear.trim())
        ? Number(rawYear)
        : yearFromControl;

  return number && year ? `${number}/${year}` : number;
};

const roundMoney = (value: number): string => value.toFixed(2);

const asMoney = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

export const mapEstimatedValue = (
  rawValue: unknown,
  sigiloCode: unknown,
  sigiloDescription: unknown,
): { estimatedValue: string | null; estimatedValueStatus: PublicationDraft["estimatedValueStatus"] } => {
  const description = normalizeText(asString(sigiloDescription) ?? "");
  const code = typeof sigiloCode === "number" ? sigiloCode : Number(sigiloCode);
  const confidential =
    code === 2 ||
    code === 3 ||
    description.includes("parcialmente sigilos") ||
    description.includes("totalmente sigilos");
  if (confidential) {
    return { estimatedValue: null, estimatedValueStatus: "confidential" };
  }
  const amount = asMoney(rawValue);
  if (amount === null || amount <= 0) {
    return { estimatedValue: null, estimatedValueStatus: "not_published" };
  }
  return { estimatedValue: roundMoney(amount), estimatedValueStatus: "disclosed" };
};

export const mapPncpStatus = (
  situationName: string | null,
  proposalDeadline: Date | null,
  now: Date,
): TenderStatus => {
  const situation = normalizeText(situationName ?? "");
  if (situation.includes("suspens")) return "suspended";
  if (
    situation.includes("revog") ||
    situation.includes("anul") ||
    situation.includes("cancel")
  ) {
    return "cancelled";
  }
  if (
    situation.includes("homolog") ||
    situation.includes("conclu") ||
    situation.includes("fracass") ||
    situation.includes("desert")
  ) {
    return "closed";
  }
  if (proposalDeadline && proposalDeadline.getTime() < now.getTime()) {
    return "under_review";
  }
  return "open";
};

export const buildSearchColumns = (input: {
  title: string;
  displayTitle?: string | null;
  objectSummary: string | null;
  itemDescriptions: string[];
  organizationName: string;
  purchasingUnit: string | null;
  city: string | null;
  state: string | null;
  modalityLabel: string;
  itemsNorm?: string;
  categories?: readonly TenderCategory[];
}) => {
  const titleNorm = normalizeText(input.title);
  const displayTitleNorm = normalizeText(input.displayTitle ?? "");
  const objectNorm = normalizeText(input.objectSummary ?? "");
  const itemsNorm =
    input.itemsNorm ?? normalizeText(input.itemDescriptions.join(" "));
  const organizationNorm = normalizeText(input.organizationName);
  const otherNorm = normalizeText(
    [input.purchasingUnit, input.city, input.state, input.modalityLabel]
      .filter(Boolean)
      .join(" "),
  );
  return {
    titleNorm,
    objectNorm,
    itemsNorm,
    organizationNorm,
    otherNorm,
    cityNorm: input.city ? normalizeText(input.city) : null,
    searchText: [
      displayTitleNorm,
      titleNorm,
      objectNorm,
      itemsNorm,
      organizationNorm,
      otherNorm,
      normalizeText((input.categories ?? []).map(({ label }) => label).join(" ")),
    ]
      .filter(Boolean)
      .join(" "),
    displayTitleNorm,
  };
};

export const mapPublication = (
  record: Record<string, unknown>,
  now: Date,
  itemsNorm = "",
): PublicationDraft => {
  const controlNumber = asString(record.numeroControlePNCP);
  if (!controlNumber) {
    throw new PncpRecordError(
      `PNCP record is missing numeroControlePNCP. Keys: ${Object.keys(record).join(", ")}`,
    );
  }

  const identity = parseControlNumber(controlNumber);
  const orgao = asRecord(record.orgaoEntidade);
  const unidade = asRecord(record.unidadeOrgao);
  const organizationName = asString(orgao?.razaoSocial) ?? "Órgão não informado";
  const cnpj = asString(orgao?.cnpj) ?? identity?.cnpj ?? null;
  if (!cnpj) {
    throw new PncpRecordError(
      `PNCP record ${controlNumber} is missing the organization CNPJ`,
    );
  }

  const title = asString(record.objetoCompra) ?? "Objeto não informado pelo PNCP";
  const normalizedTitle = normalizeTenderTitle(title);
  const complementary = asString(record.informacaoComplementar);
  const modality = MODALITIES[Number(record.modalidadeId)] ?? "other";
  const modalityLabel = asString(record.modalidadeNome) ?? "Modalidade não informada";
  const publishedAt = parsePncpDate(record.dataPublicacaoPncp);
  const openingAt = parsePncpDate(record.dataAberturaProposta);
  const proposalDeadline = parsePncpDate(record.dataEncerramentoProposta);
  const value = mapEstimatedValue(
    record.valorTotalEstimado,
    record.orcamentoSigilosoCodigo,
    record.orcamentoSigilosoDescricao,
  );
  const uf = asString(unidade?.ufSigla)?.toUpperCase() ?? null;
  const state = uf && /^[A-Z]{2}$/.test(uf) ? uf : null;
  const city = asString(unidade?.municipioNome);
  const ibge = asString(unidade?.codigoIbge);
  const tenderNumberShort = pncpTenderNumberShort(record);
  const objectSummary = summarizeOfficialObject(title);
  const categories = categoriesFromOfficialTitle(title);
  const search = buildSearchColumns({
    title,
    displayTitle: normalizedTitle.title,
    objectSummary,
    itemDescriptions: [],
    organizationName,
    purchasingUnit: asString(unidade?.nomeUnidade),
    city,
    state,
    modalityLabel,
    itemsNorm,
    categories,
  });

  return {
    id: tenderIdFromControlNumber(controlNumber),
    pncpControlNumber: controlNumber,
    title,
    displayTitle: normalizedTitle.title,
    displayTitleSource: "rules",
    displayTitleVersion: DISPLAY_TITLE_RULES_VERSION,
    displayTitleNeedsModel: normalizedTitle.needsModel,
    objectSummary,
    description: complementary && complementary !== title ? complementary : title,
    organizationId: `pncp-${cnpj}`,
    organizationName,
    purchasingUnit: asString(unidade?.nomeUnidade),
    modality,
    modalityLabel,
    status: mapPncpStatus(asString(record.situacaoCompraNome), proposalDeadline, now),
    tenderNumber: tenderNumberShort
      ? `${modalityLabel} ${tenderNumberShort}`
      : null,
    processNumber: asString(record.processo),
    estimatedValue: value.estimatedValue,
    estimatedValueStatus: value.estimatedValueStatus,
    publishedAt,
    openingAt,
    proposalDeadline,
    state,
    city,
    cityIbgeCode: ibge,
    sourceId: PNCP_SOURCE_ID,
    sourceName: PNCP_SOURCE_NAME,
    sourceUrl: identity ? pncpPublicationUrl(identity) : null,
    categories,
    ...search,
    timeline: [
      {
        at: (publishedAt ?? now).toISOString(),
        type: "published",
        description: "Publicado no PNCP",
      },
    ],
    identity,
  };
};

const sameInstant = (left: Date | null, right: Date | null): boolean =>
  (left?.getTime() ?? null) === (right?.getTime() ?? null);

export const mergeTimeline = (
  previous: {
    status: string;
    proposalDeadline: Date | null;
    timeline: TenderTimelineRecord[];
  } | null,
  next: PublicationDraft,
  now: Date,
): TenderTimelineRecord[] => {
  if (!previous) return next.timeline;

  const timeline = [...previous.timeline];
  if (previous.status !== next.status) {
    timeline.push({
      at: now.toISOString(),
      type: "status_changed",
      description: `Situação alterada de ${previous.status} para ${next.status}`,
    });
  }
  if (!sameInstant(previous.proposalDeadline, next.proposalDeadline)) {
    timeline.push({
      at: now.toISOString(),
      type: "deadline_changed",
      description: "Prazo de proposta alterado na fonte",
    });
  }
  return timeline;
};

export const mapPncpItems = (rows: Record<string, unknown>[]): TenderItemRecord[] =>
  rows.map((row, index) => {
    const secret = row.orcamentoSigiloso === true;
    const numero = row.numeroItem;
    return {
      id: numero !== undefined && numero !== null ? String(numero) : String(index + 1),
      description: asString(row.descricao) ?? "Item sem descrição",
      quantity: asMoney(row.quantidade),
      unit: asString(row.unidadeMedida),
      estimatedUnitValue: secret ? null : asMoney(row.valorUnitarioEstimado),
      estimatedTotalValue: secret ? null : asMoney(row.valorTotal),
    };
  });

const absoluteUrl = (value: unknown): string | null => {
  const text = asString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const mapPncpDocuments = (
  rows: Record<string, unknown>[],
  identity: PncpIdentity,
): TenderDocumentRecord[] => {
  const documents: TenderDocumentRecord[] = [];
  for (const row of rows) {
    const sequencial = row.sequencialDocumento;
    const url =
      absoluteUrl(row.url) ??
      absoluteUrl(row.uri) ??
      (typeof sequencial === "number"
        ? `https://pncp.gov.br/pncp-api/v1/orgaos/${identity.cnpj}/compras/${identity.ano}/${identity.sequencial}/arquivos/${sequencial}`
        : null);
    if (!url) continue;
    const publishedAt = parsePncpDate(row.dataPublicacaoPncp);
    documents.push({
      id: sequencial !== undefined && sequencial !== null ? String(sequencial) : url,
      name: asString(row.titulo) ?? "Documento",
      type: asString(row.tipoDocumentoNome) ?? "Documento",
      sizeBytes: null,
      url,
      publishedAt: publishedAt ? publishedAt.toISOString() : null,
    });
  }
  return documents;
};
