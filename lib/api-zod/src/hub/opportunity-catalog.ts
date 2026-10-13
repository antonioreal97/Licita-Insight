import { z } from "zod";
import { WorkspaceTypeSchema, type WorkspaceType } from "./workspace-profiles";

export const OPPORTUNITY_CATALOG_SCHEMA_VERSION = 2 as const;

const isoDateTime = z.string().datetime({ offset: true });
const nullableIsoDateTime = isoDateTime.nullable();
const nullableMoney = z.number().finite().nonnegative().nullable();
const stringList = z.array(z.string().trim().min(1).max(160));

export const OpportunityCatalogStatusSchema = z.enum([
  "open",
  "upcoming",
  "closed",
  "undated",
]);

export const OpportunityProvenanceSchema = z
  .object({
    sourceEntity: z.enum(["tenders", "cultural_opportunities"]),
    sourceEntityId: z.string().min(1),
    source: z.string().min(1),
    externalId: z.string().min(1),
    canonicalUrl: z.string().url().nullable(),
    readAt: isoDateTime,
  })
  .strict();

const eligibilityStatus = z.enum(["yes", "conditional", "no", "unknown"]);
const InternationalEligibilitySchema = z
  .object({
    brazilEligibility: eligibilityStatus.nullable(),
    brazilEligibilityReason: z.string().nullable(),
    brazilEligibilityRule: z.string().nullable(),
    brazilFunding: eligibilityStatus.nullable(),
    brazilFundingReason: z.string().nullable(),
    checkedAt: nullableIsoDateTime,
  })
  .strict();

const OpportunitySummaryBaseSchema = z
  .object({
    schemaVersion: z.literal(OPPORTUNITY_CATALOG_SCHEMA_VERSION),
    id: z.string().min(1),
    domain: WorkspaceTypeSchema,
    title: z.string().min(1),
    summary: z.string().nullable(),
    issuerName: z.string().min(1),
    status: OpportunityCatalogStatusSchema,
    publishedAt: nullableIsoDateTime,
    applicationDeadline: nullableIsoDateTime,
    amountMin: nullableMoney,
    amountMax: nullableMoney,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)),
    states: z.array(z.string().regex(/^[A-Z]{2}$/)),
    areas: stringList,
    audience: stringList,
    sourceUrl: z.string().url().nullable(),
    scope: z.enum(["national", "international"]),
    fingerprint: z.string().min(8).max(128),
    updatedAt: isoDateTime,
    provenance: OpportunityProvenanceSchema,
  })
  .strict();

export const ProcurementOpportunityExtensionSchema = z
  .object({
    procurementStatus: z.string().nullable(),
    modality: z.string().nullable(),
    modalityLabel: z.string().nullable(),
    tenderNumber: z.string().nullable(),
    processNumber: z.string().nullable(),
    purchasingUnit: z.string().nullable(),
    platform: z.string().nullable(),
    platformLabel: z.string().nullable(),
    estimatedValueStatus: z.string().nullable(),
    estimatedValueFlag: z.string().nullable(),
    opportunityType: z.string().nullable(),
    originName: z.string().nullable(),
    eligibility: InternationalEligibilitySchema.nullable(),
  })
  .strict();

export const FundingOpportunityExtensionSchema = z
  .object({
    kind: z.string().nullable(),
    program: z.string().nullable(),
    opportunityType: z.string().nullable(),
    originName: z.string().nullable(),
    registrationFrom: nullableIsoDateTime,
    continuousFlow: z.boolean(),
    amountBrlApprox: nullableMoney,
    eligibility: InternationalEligibilitySchema.nullable(),
  })
  .strict();

export const StudyOpportunityExtensionSchema = z
  .object({
    academicLevels: stringList,
    fields: stringList,
    fundingCoverage: stringList,
    languages: stringList,
    hostInstitutions: stringList,
    eligibility: InternationalEligibilitySchema.nullable(),
  })
  .strict();

export const ResearchOpportunityExtensionSchema = z
  .object({
    kind: z.string().nullable(),
    program: z.string().nullable(),
    opportunityType: z.string().nullable(),
    originName: z.string().nullable(),
    researchAreas: stringList,
    careerStages: stringList,
    registrationFrom: nullableIsoDateTime,
    continuousFlow: z.boolean(),
    amountBrlApprox: nullableMoney,
    eligibility: InternationalEligibilitySchema.nullable(),
  })
  .strict();

export const CultureOpportunityExtensionSchema = z
  .object({
    kind: z.string().nullable(),
    program: z.string().nullable(),
    opportunityType: z.string().nullable(),
    originName: z.string().nullable(),
    culturalAreaTerms: stringList,
    registrationFrom: nullableIsoDateTime,
    continuousFlow: z.boolean(),
  })
  .strict();

const summaryFor = <T extends WorkspaceType, S extends z.ZodTypeAny>(
  domain: T,
  extension: S,
) =>
  OpportunitySummaryBaseSchema.extend({
    domain: z.literal(domain),
    extension,
  }).strict();

export const ProcurementOpportunitySummarySchema = summaryFor(
  "procurement",
  ProcurementOpportunityExtensionSchema,
);
export const FundingOpportunitySummarySchema = summaryFor(
  "funding",
  FundingOpportunityExtensionSchema,
);
export const StudyOpportunitySummarySchema = summaryFor(
  "study",
  StudyOpportunityExtensionSchema,
);
export const ResearchOpportunitySummarySchema = summaryFor(
  "research",
  ResearchOpportunityExtensionSchema,
);
export const CultureOpportunitySummarySchema = summaryFor(
  "culture",
  CultureOpportunityExtensionSchema,
);

export const OpportunitySummarySchema = z.discriminatedUnion("domain", [
  ProcurementOpportunitySummarySchema,
  FundingOpportunitySummarySchema,
  StudyOpportunitySummarySchema,
  ResearchOpportunitySummarySchema,
  CultureOpportunitySummarySchema,
]);
export type OpportunitySummary = z.infer<typeof OpportunitySummarySchema>;

const dateInput = z.union([z.date(), isoDateTime]);
const nullableDateInput = dateInput.nullable();
const moneyInput = z
  .union([
    z.number().finite().nonnegative(),
    z.string().regex(/^\d+(?:\.\d+)?$/),
  ])
  .nullable();

export const TenderCatalogSourceSchema = z
  .object({
    id: z.string().min(1),
    pncpControlNumber: z.string().min(1),
    title: z.string().min(1),
    displayTitle: z.string().nullable().optional(),
    objectSummary: z.string().nullable(),
    description: z.string().nullable().optional(),
    organizationName: z.string().min(1),
    purchasingUnit: z.string().nullable(),
    modality: z.string().min(1),
    modalityLabel: z.string().min(1),
    status: z.string().min(1),
    tenderNumber: z.string().nullable(),
    processNumber: z.string().nullable(),
    estimatedValue: moneyInput,
    estimatedValueStatus: z.string().nullable(),
    estimatedValueFlag: z.string().nullable().optional(),
    publishedAt: nullableDateInput,
    proposalDeadline: nullableDateInput,
    state: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    city: z.string().nullable().optional(),
    sourceId: z.string().min(1),
    sourceName: z.string().min(1),
    sourceUrl: z.string().url().nullable(),
    platform: z.string().nullable().optional(),
    platformLabel: z.string().nullable().optional(),
    categories: z.array(z.object({ slug: z.string(), label: z.string() })),
    fetchedAt: dateInput,
    updatedAt: dateInput,
  })
  .passthrough();
export type TenderCatalogSource = z.infer<typeof TenderCatalogSourceSchema>;

export const CulturalOpportunityCatalogSourceSchema = z
  .object({
    id: z.string().min(1),
    installationId: z.string().min(1),
    externalId: z.string().min(1),
    kind: z.enum([
      "culture",
      "funding",
      "innovation",
      "partnership",
      "procurement",
    ]),
    source: z.enum([
      "mapas",
      "finep",
      "cnpq",
      "capes",
      "transferegov",
      "funarte",
      "minc",
      "salic",
      "worldbank",
      "eu_ft",
    ]),
    title: z.string().min(1),
    summary: z.string().nullable(),
    organizationName: z.string().min(1),
    audience: z.string().nullable(),
    amount: moneyInput,
    state: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    registrationFrom: nullableDateInput,
    registrationTo: nullableDateInput,
    status: z.string().min(1),
    program: z.string().nullable(),
    areas: stringList,
    areaTerms: stringList,
    opportunityType: z.string().nullable(),
    originName: z.string().nullable(),
    continuousFlow: z.boolean(),
    scope: z.enum(["national", "international"]),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    amountOriginal: moneyInput.optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    amountBrlApprox: moneyInput.optional(),
    brazilEligibility: eligibilityStatus.nullable().optional(),
    brazilEligibilityReason: z.string().nullable().optional(),
    brazilEligibilityRule: z.string().nullable().optional(),
    brazilFunding: eligibilityStatus.nullable().optional(),
    brazilFundingReason: z.string().nullable().optional(),
    eligibilityCheckedAt: nullableDateInput.optional(),
    sourceUrl: z.string().url().nullable(),
    fetchedAt: dateInput,
    updatedAt: dateInput,
  })
  .passthrough();
export type CulturalOpportunityCatalogSource = z.infer<
  typeof CulturalOpportunityCatalogSourceSchema
>;

export const CatalogMappingMetadataSchema = z
  .object({
    catalogId: z.string().min(1),
    fingerprint: z.string().min(8).max(128),
  })
  .strict();
export type CatalogMappingMetadata = z.infer<
  typeof CatalogMappingMetadataSchema
>;

const toIso = (value: Date | string | null | undefined): string | null =>
  value == null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
const toNumber = (value: number | string | null | undefined): number | null =>
  value == null ? null : Number(value);

const tenderStatus = (
  status: string,
  deadline: Date | string | null,
): z.infer<typeof OpportunityCatalogStatusSchema> => {
  if (status === "open") return "open";
  if (deadline === null && status === "published") return "undated";
  return "closed";
};

const opportunityStatus = (
  status: string,
  deadline: Date | string | null,
): z.infer<typeof OpportunityCatalogStatusSchema> => {
  if (status === "upcoming") return "upcoming";
  if (status === "closed") return "closed";
  if (status === "open") return deadline === null ? "undated" : "open";
  return deadline === null ? "undated" : "closed";
};

const eligibilityFrom = (row: CulturalOpportunityCatalogSource) => {
  const hasEligibility =
    row.brazilEligibility !== undefined ||
    row.brazilFunding !== undefined ||
    row.brazilEligibilityRule !== undefined;
  if (!hasEligibility) return null;
  return {
    brazilEligibility: row.brazilEligibility ?? null,
    brazilEligibilityReason: row.brazilEligibilityReason ?? null,
    brazilEligibilityRule: row.brazilEligibilityRule ?? null,
    brazilFunding: row.brazilFunding ?? null,
    brazilFundingReason: row.brazilFundingReason ?? null,
    checkedAt: toIso(row.eligibilityCheckedAt),
  };
};

/** Approved Phase 0 classification; this pure mapper does not rewrite stored rows. */
export function culturalOpportunityDomain(
  row: Pick<CulturalOpportunityCatalogSource, "kind" | "source">,
): Exclude<WorkspaceType, "study"> {
  if (row.kind === "procurement" || row.source === "worldbank")
    return "procurement";
  if (row.kind === "culture") return "culture";
  if (row.kind === "funding") return "funding";
  return "research";
}

export function mapTenderToOpportunitySummary(
  input: unknown,
  metadataInput: unknown,
): OpportunitySummary {
  const row = TenderCatalogSourceSchema.parse(input);
  const metadata = CatalogMappingMetadataSchema.parse(metadataInput);
  const amount = toNumber(row.estimatedValue);
  const sourceUrl = row.sourceUrl;
  return OpportunitySummarySchema.parse({
    schemaVersion: OPPORTUNITY_CATALOG_SCHEMA_VERSION,
    id: metadata.catalogId,
    domain: "procurement",
    title: row.displayTitle ?? row.title,
    summary: row.objectSummary ?? row.description ?? null,
    issuerName: row.organizationName,
    status: tenderStatus(row.status, row.proposalDeadline),
    publishedAt: toIso(row.publishedAt),
    applicationDeadline: toIso(row.proposalDeadline),
    amountMin: amount,
    amountMax: amount,
    currency: amount === null ? null : "BRL",
    countries: ["BR"],
    states: row.state ? [row.state] : [],
    areas: row.categories.map(({ slug }) => slug),
    audience: [],
    sourceUrl,
    scope: "national",
    fingerprint: metadata.fingerprint,
    updatedAt: toIso(row.updatedAt),
    provenance: {
      sourceEntity: "tenders",
      sourceEntityId: row.id,
      source: row.sourceId,
      externalId: row.pncpControlNumber,
      canonicalUrl: sourceUrl,
      readAt: toIso(row.fetchedAt),
    },
    extension: {
      procurementStatus: row.status,
      modality: row.modality,
      modalityLabel: row.modalityLabel,
      tenderNumber: row.tenderNumber,
      processNumber: row.processNumber,
      purchasingUnit: row.purchasingUnit,
      platform: row.platform ?? null,
      platformLabel: row.platformLabel ?? null,
      estimatedValueStatus: row.estimatedValueStatus,
      estimatedValueFlag: row.estimatedValueFlag ?? null,
      opportunityType: null,
      originName: null,
      eligibility: null,
    },
  });
}

export function mapCulturalOpportunityToOpportunitySummary(
  input: unknown,
  metadataInput: unknown,
): OpportunitySummary {
  const row = CulturalOpportunityCatalogSourceSchema.parse(input);
  const metadata = CatalogMappingMetadataSchema.parse(metadataInput);
  const domain = culturalOpportunityDomain(row);
  const amount =
    row.scope === "international"
      ? toNumber(row.amountOriginal)
      : toNumber(row.amount);
  const currency =
    amount === null
      ? null
      : row.scope === "international"
        ? (row.currency ?? null)
        : "BRL";
  const common = {
    schemaVersion: OPPORTUNITY_CATALOG_SCHEMA_VERSION,
    id: metadata.catalogId,
    domain,
    title: row.title,
    summary: row.summary,
    issuerName: row.organizationName,
    status: opportunityStatus(row.status, row.registrationTo),
    publishedAt: null,
    applicationDeadline: toIso(row.registrationTo),
    amountMin: amount,
    amountMax: amount,
    currency,
    countries: row.country
      ? [row.country]
      : row.scope === "national"
        ? ["BR"]
        : [],
    states: row.state ? [row.state] : [],
    areas: row.areas,
    audience: row.audience ? [row.audience] : [],
    sourceUrl: row.sourceUrl,
    scope: row.scope,
    fingerprint: metadata.fingerprint,
    updatedAt: toIso(row.updatedAt),
    provenance: {
      sourceEntity: "cultural_opportunities" as const,
      sourceEntityId: row.id,
      source: row.source,
      externalId: row.externalId,
      canonicalUrl: row.sourceUrl,
      readAt: toIso(row.fetchedAt),
    },
  };
  const eligibility = eligibilityFrom(row);
  const sharedExtension = {
    kind: row.kind,
    program: row.program,
    opportunityType: row.opportunityType,
    originName: row.originName,
    registrationFrom: toIso(row.registrationFrom),
    continuousFlow: row.continuousFlow,
  };

  if (domain === "procurement") {
    return OpportunitySummarySchema.parse({
      ...common,
      domain,
      extension: {
        procurementStatus: row.status,
        modality: null,
        modalityLabel: null,
        tenderNumber: null,
        processNumber: null,
        purchasingUnit: null,
        platform: null,
        platformLabel: null,
        estimatedValueStatus: null,
        estimatedValueFlag: null,
        opportunityType: row.opportunityType,
        originName: row.originName,
        eligibility,
      },
    });
  }
  if (domain === "culture") {
    return OpportunitySummarySchema.parse({
      ...common,
      domain,
      extension: {
        ...sharedExtension,
        culturalAreaTerms: row.areaTerms,
      },
    });
  }
  if (domain === "research") {
    return OpportunitySummarySchema.parse({
      ...common,
      domain,
      extension: {
        ...sharedExtension,
        researchAreas: row.areas,
        careerStages: [],
        amountBrlApprox: toNumber(row.amountBrlApprox),
        eligibility,
      },
    });
  }
  return OpportunitySummarySchema.parse({
    ...common,
    domain,
    extension: {
      ...sharedExtension,
      amountBrlApprox: toNumber(row.amountBrlApprox),
      eligibility,
    },
  });
}
