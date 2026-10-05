import { normalizeText } from "../domain/normalize";
import {
  parseControlNumber,
  parsePncpDate,
  pncpPublicationUrl,
  tenderIdFromControlNumber,
  type PncpIdentity,
} from "./pncp-map";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const asInteger = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(number) ? number : null;
};

const asNumber = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const asMoney = (value: unknown): string | null => {
  const number = asNumber(value);
  return number === null ? null : number.toFixed(4);
};

const dateOnly = (value: unknown): string | null => {
  const string = asString(value);
  if (!string) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(string);
  return match?.[1] ?? null;
};

const firstString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return null;
};

const firstInteger = (record: Record<string, unknown>, keys: string[]): number | null => {
  for (const key of keys) {
    const value = asInteger(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const firstMoney = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = asMoney(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const firstDateOnly = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = dateOnly(record[key]);
    if (value) return value;
  }
  return null;
};

const firstDateTime = (record: Record<string, unknown>, keys: string[]): Date | null => {
  for (const key of keys) {
    const value = parsePncpDate(record[key]);
    if (value) return value;
  }
  return null;
};

const supplierType = (value: unknown): "PJ" | "PF" | "PE" | null => {
  const string = asString(value)?.toUpperCase();
  return string === "PJ" || string === "PF" || string === "PE" ? string : null;
};

export const publicSupplierIdentifier = (
  type: string | null | undefined,
  identifier: string | null | undefined,
): string | null => {
  const digits = identifier?.replace(/\D/g, "") ?? "";
  return type === "PJ" && digits.length === 14 ? digits : null;
};

export const pncpContractUrl = (identity: PncpIdentity): string =>
  `https://pncp.gov.br/app/contratos/${identity.cnpj}/${identity.ano}/${identity.sequencial}`;

export const contractIdFromControlNumber = (controlNumber: string): string =>
  tenderIdFromControlNumber(controlNumber);

export const itemResultId = (
  purchaseControlNumber: string,
  itemNumber: number,
  resultSequence: number,
): string => `${tenderIdFromControlNumber(purchaseControlNumber)}-item-${itemNumber}-result-${resultSequence}`;

export type PncpContractDraft = {
  id: string;
  pncpControlNumber: string;
  purchasePncpControlNumber: string;
  purchaseTenderKey: string;
  tenderId: string | null;
  cnpj: string;
  year: number;
  sequence: number;
  contractNumber: string | null;
  contractTypeId: number | null;
  contractTypeName: string | null;
  processNumber: string | null;
  organizationName: string;
  purchasingUnit: string | null;
  state: string | null;
  city: string | null;
  cityIbgeCode: string | null;
  supplierType: "PJ" | "PF" | "PE" | null;
  supplierIdentifier: string | null;
  supplierName: string | null;
  object: string | null;
  initialValue: string | null;
  globalValue: string | null;
  accumulatedValue: string | null;
  installmentValue: string | null;
  installmentCount: number | null;
  signatureDate: string | null;
  validFrom: string | null;
  validTo: string | null;
  publishedAt: Date | null;
  sourceUpdatedAt: Date | null;
  sourceGlobalUpdatedAt: Date | null;
  officialUrl: string;
  searchText: string;
  rawPayload: Record<string, unknown>;
  fetchedAt: Date;
};

export type PncpItemResultDraft = {
  id: string;
  purchasePncpControlNumber: string;
  purchaseTenderKey: string;
  tenderId: string | null;
  cnpj: string;
  purchaseYear: number;
  purchaseSequence: number;
  itemNumber: number;
  resultSequence: number;
  statusId: number;
  statusName: string;
  isActive: boolean;
  supplierType: "PJ" | "PF" | "PE" | null;
  supplierIdentifier: string | null;
  supplierName: string | null;
  quantityHomologated: string | null;
  unitValueHomologated: string | null;
  totalValueHomologated: string | null;
  discountPercent: string | null;
  rankOrderSrp: number | null;
  resultDate: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  sourceIncludedAt: Date | null;
  sourceUpdatedAt: Date | null;
  officialUrl: string;
  rawPayload: Record<string, unknown>;
  fetchedAt: Date;
};

export class PncpTransparencyRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PncpTransparencyRecordError";
  }
}

const organization = (record: Record<string, unknown>) =>
  asRecord(record.orgaoEntidade) ?? asRecord(record.orgao) ?? {};

const unit = (record: Record<string, unknown>) =>
  asRecord(record.unidadeOrgao) ?? asRecord(record.unidadeOrgaoCompra) ?? {};

export const mapPncpContract = (
  record: Record<string, unknown>,
  fetchedAt: Date,
): PncpContractDraft => {
  const pncpControlNumber = firstString(record, ["numeroControlePNCP", "numeroControlePncp"]);
  if (!pncpControlNumber) {
    throw new PncpTransparencyRecordError("Contrato PNCP sem numeroControlePNCP");
  }
  const identity = parseControlNumber(pncpControlNumber);
  if (!identity) {
    throw new PncpTransparencyRecordError(`Contrato PNCP com controle inválido: ${pncpControlNumber}`);
  }

  const purchasePncpControlNumber = firstString(record, [
    "numeroControlePncpCompra",
    "numeroControlePNCPCompra",
    "numeroControleCompra",
  ]);
  if (!purchasePncpControlNumber) {
    throw new PncpTransparencyRecordError(`Contrato ${pncpControlNumber} sem compra vinculada`);
  }
  if (!parseControlNumber(purchasePncpControlNumber)) {
    throw new PncpTransparencyRecordError(`Contrato ${pncpControlNumber} com compra vinculada invalida`);
  }
  const org = organization(record);
  const unidade = unit(record);
  const type = supplierType(record.tipoPessoa ?? record.tipoPessoaFornecedor);
  const supplierIdentifier = firstString(record, ["niFornecedor", "identificadorFornecedor"]);
  const organizationName =
    firstString(org, ["razaoSocial", "nome", "nomeOrgao"]) ??
    firstString(record, ["orgaoEntidadeRazaoSocial", "orgaoNome", "nomeOrgao"]) ??
    "Orgao nao informado";
  const state = firstString(unidade, ["ufSigla", "uf"]);
  const city = firstString(unidade, ["municipioNome", "municipio"]);
  const object = firstString(record, ["objetoContrato", "objetoCompra", "objeto"]);
  const contractNumber = firstString(record, ["numeroContratoEmpenho", "numeroContrato", "numero"]);
  const officialUrl = pncpContractUrl(identity);
  const searchText = normalizeText([
    pncpControlNumber,
    purchasePncpControlNumber,
    contractNumber,
    organizationName,
    firstString(unidade, ["nomeUnidade", "nome"]),
    firstString(record, ["nomeRazaoSocialFornecedor", "nomeFornecedor", "razaoSocialFornecedor"]),
    object,
    city,
    state,
  ].filter(Boolean).join(" "));

  return {
    id: contractIdFromControlNumber(pncpControlNumber),
    pncpControlNumber,
    purchasePncpControlNumber,
    purchaseTenderKey: tenderIdFromControlNumber(purchasePncpControlNumber),
    tenderId: null,
    cnpj: identity.cnpj,
    year: identity.ano,
    sequence: identity.sequencial,
    contractNumber,
    contractTypeId: firstInteger(record, ["tipoContratoId", "tipoContratoCodigo"]),
    contractTypeName: firstString(record, ["tipoContratoNome", "tipoContrato"]),
    processNumber: firstString(record, ["numeroProcesso", "processo"]),
    organizationName,
    purchasingUnit: firstString(unidade, ["nomeUnidade", "nome"]),
    state,
    city,
    cityIbgeCode: firstString(unidade, ["codigoIbge", "municipioCodigoIbge", "codigoMunicipioIbge"]),
    supplierType: type,
    supplierIdentifier,
    supplierName: firstString(record, ["nomeRazaoSocialFornecedor", "nomeFornecedor", "razaoSocialFornecedor"]),
    object,
    initialValue: firstMoney(record, ["valorInicial", "valorInicialContrato"]),
    globalValue: firstMoney(record, ["valorGlobal", "valorGlobalContrato"]),
    accumulatedValue: firstMoney(record, ["valorAcumulado", "valorAcumuladoContrato"]),
    installmentValue: firstMoney(record, ["valorParcela"]),
    installmentCount: firstInteger(record, ["numeroParcelas"]),
    signatureDate: firstDateOnly(record, ["dataAssinatura"]),
    validFrom: firstDateOnly(record, ["dataVigenciaInicio"]),
    validTo: firstDateOnly(record, ["dataVigenciaFim"]),
    publishedAt: firstDateTime(record, ["dataPublicacaoPncp", "dataPublicacao"]),
    sourceUpdatedAt: firstDateTime(record, ["dataAtualizacao", "dataAtualizacaoPncp"]),
    sourceGlobalUpdatedAt: firstDateTime(record, ["dataAtualizacaoGlobal"]),
    officialUrl,
    searchText,
    rawPayload: record,
    fetchedAt,
  };
};

export const mapPncpItemResult = (
  input: {
    record: Record<string, unknown>;
    purchasePncpControlNumber: string;
    identity: PncpIdentity;
    itemNumber: number;
  },
  fetchedAt: Date,
): PncpItemResultDraft => {
  const purchaseTenderKey = tenderIdFromControlNumber(input.purchasePncpControlNumber);
  const resultSequence = firstInteger(input.record, ["sequencialResultado", "sequencial", "numeroResultado"]) ?? 1;
  const itemNumber = firstInteger(input.record, ["numeroItem"]) ?? input.itemNumber;
  const statusId = firstInteger(input.record, ["situacaoCompraItemResultadoId", "situacaoResultadoId"]) ?? 0;
  const statusName =
    firstString(input.record, ["situacaoCompraItemResultadoNome", "situacaoResultadoNome"]) ??
    (statusId === 1 ? "Informado" : "Nao informado");
  const type = supplierType(input.record.tipoPessoa ?? input.record.tipoPessoaFornecedor);
  const cancelReason = firstString(input.record, [
    "motivoCancelamento",
    "justificativaCancelamento",
    "motivo",
  ]);
  const cancelledAt = firstDateTime(input.record, ["dataCancelamento", "dataExclusao"]);
  const isActive = statusId === 1 && !cancelReason;

  return {
    id: itemResultId(input.purchasePncpControlNumber, itemNumber, resultSequence),
    purchasePncpControlNumber: input.purchasePncpControlNumber,
    purchaseTenderKey,
    tenderId: null,
    cnpj: input.identity.cnpj,
    purchaseYear: input.identity.ano,
    purchaseSequence: input.identity.sequencial,
    itemNumber,
    resultSequence,
    statusId,
    statusName,
    isActive,
    supplierType: type,
    supplierIdentifier: firstString(input.record, ["niFornecedor", "identificadorFornecedor"]),
    supplierName: firstString(input.record, ["nomeRazaoSocialFornecedor", "nomeFornecedor", "razaoSocialFornecedor"]),
    quantityHomologated: firstMoney(input.record, ["quantidadeHomologada", "quantidade"]),
    unitValueHomologated: firstMoney(input.record, ["valorUnitarioHomologado", "valorUnitario"]),
    totalValueHomologated: firstMoney(input.record, ["valorTotalHomologado", "valorTotal"]),
    discountPercent: firstMoney(input.record, ["percentualDesconto"]),
    rankOrderSrp: firstInteger(input.record, ["ordemClassificacaoSrp", "ordemClassificacao"]),
    resultDate: firstDateOnly(input.record, ["dataResultado"]),
    cancelledAt: isActive ? null : cancelledAt,
    cancelReason: isActive ? null : cancelReason,
    sourceIncludedAt: firstDateTime(input.record, ["dataInclusao"]),
    sourceUpdatedAt: firstDateTime(input.record, ["dataAtualizacao"]),
    officialUrl: pncpPublicationUrl(input.identity),
    rawPayload: input.record,
    fetchedAt,
  };
};
