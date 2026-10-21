import { eq } from "drizzle-orm";
import {
  companyDocumentsTable,
  db,
  type CompanyDocumentKind,
  type CompanyDocumentStatus,
} from "@workspace/db";
import { InvalidParameterError } from "../lib/api-error";
import { dateInSaoPaulo, parseDateParameter } from "../lib/sao-paulo-date";

export type CompanyDocumentCatalogItem = {
  kind: CompanyDocumentKind;
  label: string;
  description: string;
  glossaryId: string;
  officialUrl: string;
  suggestedValidityDays: number | null;
};

export const COMPANY_DOCUMENT_CATALOG: readonly CompanyDocumentCatalogItem[] = [
  { kind: "sicaf", label: "SICAF (níveis)", description: "Cadastro e níveis de habilitação no SICAF.", glossaryId: "sicaf", officialUrl: "https://www.gov.br/compras/pt-br/sicaf-digital", suggestedValidityDays: 365 },
  { kind: "cnd_federal", label: "CND federal (Receita/PGFN)", description: "Regularidade fiscal federal e Dívida Ativa da União.", glossaryId: "cnd", officialUrl: "https://www.gov.br/pt-br/servicos/emitir-certidao-de-regularidade-fiscal", suggestedValidityDays: 180 },
  { kind: "crf_fgts", label: "CRF do FGTS", description: "Certificado de Regularidade do FGTS.", glossaryId: "crf-fgts", officialUrl: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf", suggestedValidityDays: 30 },
  { kind: "cndt", label: "CNDT trabalhista", description: "Certidão Negativa de Débitos Trabalhistas.", glossaryId: "cndt", officialUrl: "https://www.tst.jus.br/certidao1", suggestedValidityDays: 180 },
  { kind: "state_tax_clearance", label: "Certidão estadual", description: "Regularidade fiscal perante o estado da empresa.", glossaryId: "regularidade-fiscal", officialUrl: "https://www.gov.br/empresas-e-negocios/pt-br/redesim", suggestedValidityDays: 90 },
  { kind: "municipal_tax_clearance", label: "Certidão municipal", description: "Regularidade fiscal perante o município da empresa.", glossaryId: "regularidade-fiscal", officialUrl: "https://www.gov.br/empresas-e-negocios/pt-br/redesim", suggestedValidityDays: 90 },
  { kind: "bankruptcy_clearance", label: "Certidão de falência e recuperação judicial", description: "Certidão do distribuidor da sede da empresa.", glossaryId: "qualificacao-economica", officialUrl: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm", suggestedValidityDays: 90 },
  { kind: "balance_sheet", label: "Balanço patrimonial e índices", description: "Balanços e índices contábeis exigíveis para a empresa.", glossaryId: "qualificacao-economica", officialUrl: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm", suggestedValidityDays: 365 },
  { kind: "articles_of_association", label: "Contrato social e alterações", description: "Ato constitutivo atualizado e alterações registradas.", glossaryId: "habilitacao-juridica", officialUrl: "https://www.gov.br/empresas-e-negocios/pt-br/redesim", suggestedValidityDays: null },
  { kind: "technical_capacity_certificate", label: "Atestado(s) de capacidade técnica", description: "Provas de serviços ou fornecimentos semelhantes já realizados.", glossaryId: "atestado-capacidade-tecnica", officialUrl: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm", suggestedValidityDays: null },
  { kind: "professional_council_registration", label: "Registro em conselho profissional", description: "Registro da empresa ou responsável técnico, quando aplicável.", glossaryId: "qualificacao-tecnica", officialUrl: "https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm", suggestedValidityDays: 365 },
  { kind: "platform_registration", label: "Cadastro nas plataformas", description: "Cadastros nas plataformas de disputa usadas pela empresa.", glossaryId: "credenciamento", officialUrl: "https://www.gov.br/compras/pt-br/fornecedor-1", suggestedValidityDays: null },
] as const;

const kinds = new Set<string>(COMPANY_DOCUMENT_CATALOG.map(({ kind }) => kind));
const statuses = new Set<string>(["have", "missing", "not_applicable"]);

export const parseCompanyDocumentKind = (value: string): CompanyDocumentKind => {
  if (!kinds.has(value)) throw new InvalidParameterError("kind is invalid", [{ field: "kind", issue: "invalid_enum" }]);
  return value as CompanyDocumentKind;
};

const optionalDate = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !parseDateParameter(value)) {
    throw new InvalidParameterError(`${field} is invalid`, [{ field, issue: "invalid_date" }]);
  }
  return value;
};

export type CompanyDocumentPut = {
  status: CompanyDocumentStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  reference: string | null;
};

export const parseCompanyDocumentPut = (value: unknown): CompanyDocumentPut => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidParameterError("Request body must be an object", [{ field: "body", issue: "invalid_type" }]);
  }
  const body = value as Record<string, unknown>;
  if (typeof body.status !== "string" || !statuses.has(body.status)) {
    throw new InvalidParameterError("status is invalid", [{ field: "status", issue: "invalid_enum" }]);
  }
  const status = body.status as CompanyDocumentStatus;
  const issuedAt = optionalDate(body.issuedAt, "issuedAt");
  const expiresAt = optionalDate(body.expiresAt, "expiresAt");
  const rawReference = body.reference;
  if (rawReference !== undefined && rawReference !== null && typeof rawReference !== "string") {
    throw new InvalidParameterError("reference is invalid", [{ field: "reference", issue: "invalid_type" }]);
  }
  const reference = typeof rawReference === "string" ? rawReference.trim() || null : null;
  if (reference && reference.length > 160) {
    throw new InvalidParameterError("reference is too long", [{ field: "reference", issue: "invalid_length" }]);
  }
  if (issuedAt && expiresAt && issuedAt > expiresAt) {
    throw new InvalidParameterError("expiresAt must not precede issuedAt", [{ field: "expiresAt", issue: "invalid_range" }]);
  }
  return status === "have" ? { status, issuedAt, expiresAt, reference } : { status, issuedAt: null, expiresAt: null, reference: null };
};

const serialize = (row: typeof companyDocumentsTable.$inferSelect) => ({
  id: row.id,
  kind: row.kind,
  status: row.status,
  issuedAt: row.issuedAt,
  expiresAt: row.expiresAt,
  reference: row.reference,
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * "Tenho" is in good standing only with an expiry date from today on, or for kinds that do not expire (no suggested
 * validity). A kind that expires but has no date is "unknown": it never counts as in good standing.
 */
export const documentValidity = (
  catalog: Pick<CompanyDocumentCatalogItem, "suggestedValidityDays">,
  document: { status: string; expiresAt: string | null } | null,
  today: string,
): "valid" | "unknown" | "invalid" => {
  if (document?.status !== "have") return "invalid";
  if (document.expiresAt) return document.expiresAt >= today ? "valid" : "invalid";
  return catalog.suggestedValidityDays === null ? "valid" : "unknown";
};

export const listCompanyDocuments = async (userId: string, now = new Date()) => {
  const rows = await db.select().from(companyDocumentsTable).where(eq(companyDocumentsTable.userId, userId));
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  const today = dateInSaoPaulo(now);
  const items = COMPANY_DOCUMENT_CATALOG.map((catalog) => {
    const row = byKind.get(catalog.kind);
    return { catalog, document: row ? serialize(row) : null };
  });
  const applicable = items.filter(({ document }) => document?.status !== "not_applicable");
  const states = applicable.map(({ catalog, document }) => documentValidity(catalog, document, today));
  return {
    items,
    progress: {
      ready: states.filter((state) => state === "valid").length,
      total: applicable.length,
      unknownValidity: states.filter((state) => state === "unknown").length,
    },
    asOf: today,
  };
};

export const putCompanyDocument = async (userId: string, kind: CompanyDocumentKind, input: CompanyDocumentPut) => {
  const now = new Date();
  const [row] = await db
    .insert(companyDocumentsTable)
    .values({ userId, kind, ...input, updatedAt: now })
    .onConflictDoUpdate({
      target: [companyDocumentsTable.userId, companyDocumentsTable.kind],
      set: { ...input, updatedAt: now },
    })
    .returning();
  return serialize(row!);
};
