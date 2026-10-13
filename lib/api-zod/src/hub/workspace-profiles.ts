import { z } from "zod";

export const WORKSPACE_PROFILE_SCHEMA_VERSION = 1 as const;

export const WorkspaceTypeSchema = z.enum([
  "procurement",
  "funding",
  "study",
  "research",
  "culture",
]);
export type WorkspaceType = z.infer<typeof WorkspaceTypeSchema>;

const normalizedText = (minimum = 2, maximum = 120) =>
  z.string().trim().min(minimum).max(maximum);
const termList = (maximum = 20) => z.array(normalizedText()).max(maximum);
const codeList = (pattern: RegExp, maximum: number) =>
  z.array(z.string().trim().regex(pattern)).max(maximum);
const moneyRangeSchema = z
  .object({
    min: z.number().finite().nonnegative().nullable(),
    max: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .refine(
    ({ min, max }) => min === null || max === null || min <= max,
    "min must be less than or equal to max",
  );

const MunicipalityReferenceSchema = z
  .object({
    ibgeCode: z.string().regex(/^\d{7}$/),
    name: normalizedText(1, 100),
    state: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();

const CompanyCoverageSchema = z.discriminatedUnion("scope", [
  z
    .object({
      scope: z.literal("national"),
      mode: z.enum(["strict", "prioritize"]),
      acceptsRemote: z.boolean(),
    })
    .strict(),
  z
    .object({
      scope: z.literal("custom"),
      mode: z.enum(["strict", "prioritize"]),
      acceptsRemote: z.boolean(),
      regions: z
        .array(
          z.enum(["north", "northeast", "central_west", "southeast", "south"]),
        )
        .max(5),
      states: codeList(/^[A-Z]{2}$/, 27),
      municipalities: z.array(MunicipalityReferenceSchema).max(100),
      radius: z
        .object({
          center: MunicipalityReferenceSchema,
          km: z.union([
            z.literal(50),
            z.literal(100),
            z.literal(200),
            z.literal(300),
            z.literal(500),
          ]),
        })
        .strict()
        .nullable(),
    })
    .strict(),
]);

const GeographySchema = z
  .object({
    scope: z.enum(["national", "international", "custom"]),
    countries: codeList(/^[A-Z]{2}$/, 50).default([]),
    states: codeList(/^[A-Z]{2}$/, 27).default([]),
    remote: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === "international" && value.countries.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["countries"],
        message: "international scope requires at least one country",
      });
    }
    if (
      value.scope === "custom" &&
      value.countries.length === 0 &&
      value.states.length === 0 &&
      !value.remote
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "custom scope requires a country, state or remote work",
      });
    }
  });

/**
 * Superset of the current CompanyProfileInput. Every legacy field keeps its
 * name and shape; the extra fields are optional Phase 0 vocabulary.
 */
export const ProcurementAnswersSchema = z
  .object({
    description: normalizedText(20, 600).optional(),
    offerings: termList().optional(),
    exclusions: termList().optional(),
    selectedCategories: termList().optional(),
    selectedKeywords: termList().optional(),
    excludedKeywords: termList().optional(),
    registeredPlatforms: termList().optional(),
    coverage: CompanyCoverageSchema.optional(),
    valueRange: moneyRangeSchema.optional(),
    size: z.enum(["me_epp", "cooperative", "other"]).optional(),
    buyerTypes: termList().optional(),
    modalities: termList().optional(),
  })
  .strict();

export const FundingAnswersSchema = z
  .object({
    keywords: termList().optional(),
    regions: GeographySchema.optional(),
    thematicAreas: termList().optional(),
    applicantTypes: termList().optional(),
    fundingTypes: termList().optional(),
    projectStages: termList().optional(),
    valueRange: moneyRangeSchema.optional(),
    counterpartAvailable: z.boolean().optional(),
    languages: codeList(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 12).optional(),
  })
  .strict();

export const StudyAnswersSchema = z
  .object({
    keywords: termList().optional(),
    regions: GeographySchema.optional(),
    studyLevels: z
      .array(
        z.enum([
          "technical",
          "undergraduate",
          "specialization",
          "masters",
          "doctorate",
          "postdoctorate",
          "exchange",
          "short_course",
        ]),
      )
      .max(8)
      .optional(),
    fields: termList().optional(),
    fundingNeeds: z
      .array(
        z.enum(["tuition", "living", "travel", "research", "full_scholarship"]),
      )
      .max(5)
      .optional(),
    languages: codeList(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 12).optional(),
    startFrom: z.string().date().optional(),
  })
  .strict();

export const ResearchAnswersSchema = z
  .object({
    keywords: termList().optional(),
    regions: GeographySchema.optional(),
    researchAreas: termList().optional(),
    careerStages: z
      .array(
        z.enum([
          "undergraduate",
          "masters",
          "doctorate",
          "postdoctorate",
          "early_career",
          "established",
        ]),
      )
      .max(6)
      .optional(),
    fundingTypes: termList().optional(),
    institutionTypes: termList().optional(),
    collaborationModes: termList().optional(),
    languages: codeList(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 12).optional(),
  })
  .strict();

export const CultureAnswersSchema = z
  .object({
    keywords: termList().optional(),
    regions: GeographySchema.optional(),
    culturalAreas: termList().optional(),
    applicantTypes: termList().optional(),
    opportunityTypes: termList().optional(),
    programs: termList().optional(),
    valueRange: moneyRangeSchema.optional(),
    languages: codeList(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, 12).optional(),
  })
  .strict();

const profileEnvelope = <T extends WorkspaceType, S extends z.ZodTypeAny>(
  type: T,
  answers: S,
) =>
  z
    .object({
      schemaVersion: z.literal(WORKSPACE_PROFILE_SCHEMA_VERSION),
      type: z.literal(type),
      answers,
    })
    .strict();

export const ProcurementProfileSchema = profileEnvelope(
  "procurement",
  ProcurementAnswersSchema,
);
export const FundingProfileSchema = profileEnvelope(
  "funding",
  FundingAnswersSchema,
);
export const StudyProfileSchema = profileEnvelope("study", StudyAnswersSchema);
export const ResearchProfileSchema = profileEnvelope(
  "research",
  ResearchAnswersSchema,
);
export const CultureProfileSchema = profileEnvelope(
  "culture",
  CultureAnswersSchema,
);

export const WorkspaceProfileSchema = z.discriminatedUnion("type", [
  ProcurementProfileSchema,
  FundingProfileSchema,
  StudyProfileSchema,
  ResearchProfileSchema,
  CultureProfileSchema,
]);
export type WorkspaceProfile = z.infer<typeof WorkspaceProfileSchema>;

const profileAnswerSchemas = {
  procurement: ProcurementAnswersSchema,
  funding: FundingAnswersSchema,
  study: StudyAnswersSchema,
  research: ResearchAnswersSchema,
  culture: CultureAnswersSchema,
} as const;

export const WORKSPACE_PROFILE_STEPS = {
  procurement: {
    objective: ["offerings", "selectedKeywords", "selectedCategories"],
    region: ["coverage"],
    qualification: [
      "description",
      "exclusions",
      "excludedKeywords",
      "registeredPlatforms",
      "valueRange",
      "size",
      "buyerTypes",
      "modalities",
    ],
  },
  funding: {
    objective: ["keywords", "thematicAreas"],
    region: ["regions"],
    qualification: [
      "applicantTypes",
      "fundingTypes",
      "projectStages",
      "valueRange",
      "counterpartAvailable",
      "languages",
    ],
  },
  study: {
    objective: ["keywords", "fields", "studyLevels"],
    region: ["regions"],
    qualification: ["fundingNeeds", "languages", "startFrom"],
  },
  research: {
    objective: ["keywords", "researchAreas", "careerStages"],
    region: ["regions"],
    qualification: [
      "fundingTypes",
      "institutionTypes",
      "collaborationModes",
      "languages",
    ],
  },
  culture: {
    objective: ["keywords", "culturalAreas"],
    region: ["regions"],
    qualification: [
      "applicantTypes",
      "opportunityTypes",
      "programs",
      "valueRange",
      "languages",
    ],
  },
} as const satisfies Record<WorkspaceType, Record<string, readonly string[]>>;

export type WorkspaceProfileStep =
  keyof (typeof WORKSPACE_PROFILE_STEPS)[WorkspaceType];

export type WorkspaceProfileStepSave = {
  schemaVersion: typeof WORKSPACE_PROFILE_SCHEMA_VERSION;
  type: WorkspaceType;
  step: WorkspaceProfileStep;
  answers: Record<string, unknown>;
};

/** Validates only fields owned by the submitted step, so a stage can be saved incrementally. */
export function parseWorkspaceProfileStep(
  value: unknown,
): WorkspaceProfileStepSave {
  const envelope = z
    .object({
      schemaVersion: z.literal(WORKSPACE_PROFILE_SCHEMA_VERSION),
      type: WorkspaceTypeSchema,
      step: z.enum(["objective", "region", "qualification"]),
      answers: z.record(z.unknown()),
    })
    .strict()
    .parse(value);
  const allowed = new Set<string>(
    WORKSPACE_PROFILE_STEPS[envelope.type][envelope.step],
  );
  const unexpected = Object.keys(envelope.answers).filter(
    (field) => !allowed.has(field),
  );
  if (unexpected.length > 0) {
    throw new z.ZodError(
      unexpected.map((field) => ({
        code: z.ZodIssueCode.unrecognized_keys,
        keys: [field],
        path: ["answers"],
        message: `Field ${field} does not belong to step ${envelope.step}`,
      })),
    );
  }
  const mergedShape = profileAnswerSchemas[envelope.type].parse(
    envelope.answers,
  );
  return { ...envelope, answers: mergedShape };
}

export function mergeWorkspaceProfileStep(
  current: WorkspaceProfile,
  value: unknown,
): WorkspaceProfile {
  const update = parseWorkspaceProfileStep(value);
  if (current.type !== update.type)
    throw new Error("workspace profile type cannot change");
  return WorkspaceProfileSchema.parse({
    ...current,
    answers: { ...current.answers, ...update.answers },
  });
}

export type WorkspaceProfileCompleteness = {
  percent: number;
  complete: boolean;
  missing: Array<"keywords" | "region">;
  nextStep: WorkspaceProfileStep | null;
};

const hasTerms = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.some((item) => typeof item === "string" && item.trim());

/** Approved minimum: the first useful profile requires only keywords and region. */
export function workspaceProfileCompleteness(
  profile: WorkspaceProfile,
): WorkspaceProfileCompleteness {
  const answers = profile.answers as Record<string, unknown>;
  const keywords =
    profile.type === "procurement"
      ? hasTerms(answers.selectedKeywords) || hasTerms(answers.offerings)
      : hasTerms(answers.keywords);
  const region =
    profile.type === "procurement"
      ? Boolean(answers.coverage)
      : Boolean(answers.regions);
  const missing: WorkspaceProfileCompleteness["missing"] = [];
  if (!keywords) missing.push("keywords");
  if (!region) missing.push("region");
  return {
    percent: (Number(keywords) + Number(region)) * 50,
    complete: missing.length === 0,
    missing,
    nextStep: !keywords ? "objective" : !region ? "region" : null,
  };
}

export const WorkspaceProfileSignalSchema = z
  .object({
    kind: z.enum([
      "keyword",
      "excluded_keyword",
      "category",
      "area",
      "country",
      "state",
      "municipality",
      "language",
      "applicant_type",
      "opportunity_type",
      "funding_type",
      "study_level",
      "career_stage",
      "company_size",
      "platform",
      "remote",
      "value_min",
      "value_max",
    ]),
    value: normalizedText(1, 160),
    weight: z.number().min(-1).max(1),
    sourceField: normalizedText(1, 80),
  })
  .strict();
export type WorkspaceProfileSignal = z.infer<
  typeof WorkspaceProfileSignalSchema
>;

export type WorkspaceProfileSignalField = {
  field: string;
  kind: WorkspaceProfileSignal["kind"];
  weight: number;
};

/** Explicit materialization allow-list for workspace_profile_signals. */
export const WORKSPACE_PROFILE_SIGNAL_FIELDS: Record<
  WorkspaceType,
  readonly WorkspaceProfileSignalField[]
> = {
  procurement: [
    { field: "offerings", kind: "keyword", weight: 1 },
    { field: "selectedKeywords", kind: "keyword", weight: 1 },
    { field: "exclusions", kind: "excluded_keyword", weight: -1 },
    { field: "excludedKeywords", kind: "excluded_keyword", weight: -1 },
    { field: "selectedCategories", kind: "category", weight: 0.9 },
    { field: "coverage.states", kind: "state", weight: 0.8 },
    { field: "coverage.municipalities", kind: "municipality", weight: 0.9 },
    { field: "registeredPlatforms", kind: "platform", weight: 0.4 },
    { field: "size", kind: "company_size", weight: 0.6 },
    { field: "valueRange.min", kind: "value_min", weight: 0.5 },
    { field: "valueRange.max", kind: "value_max", weight: 0.5 },
  ],
  funding: [
    { field: "keywords", kind: "keyword", weight: 1 },
    { field: "thematicAreas", kind: "area", weight: 0.9 },
    { field: "regions.countries", kind: "country", weight: 0.8 },
    { field: "regions.states", kind: "state", weight: 0.8 },
    { field: "applicantTypes", kind: "applicant_type", weight: 0.8 },
    { field: "fundingTypes", kind: "funding_type", weight: 0.8 },
    { field: "languages", kind: "language", weight: 0.5 },
    { field: "valueRange.min", kind: "value_min", weight: 0.5 },
    { field: "valueRange.max", kind: "value_max", weight: 0.5 },
  ],
  study: [
    { field: "keywords", kind: "keyword", weight: 1 },
    { field: "fields", kind: "area", weight: 0.9 },
    { field: "regions.countries", kind: "country", weight: 0.9 },
    { field: "studyLevels", kind: "study_level", weight: 0.9 },
    { field: "languages", kind: "language", weight: 0.7 },
  ],
  research: [
    { field: "keywords", kind: "keyword", weight: 1 },
    { field: "researchAreas", kind: "area", weight: 0.9 },
    { field: "regions.countries", kind: "country", weight: 0.8 },
    { field: "regions.states", kind: "state", weight: 0.8 },
    { field: "careerStages", kind: "career_stage", weight: 0.8 },
    { field: "fundingTypes", kind: "funding_type", weight: 0.8 },
    { field: "languages", kind: "language", weight: 0.5 },
  ],
  culture: [
    { field: "keywords", kind: "keyword", weight: 1 },
    { field: "culturalAreas", kind: "area", weight: 1 },
    { field: "regions.countries", kind: "country", weight: 0.8 },
    { field: "regions.states", kind: "state", weight: 0.8 },
    { field: "applicantTypes", kind: "applicant_type", weight: 0.8 },
    { field: "opportunityTypes", kind: "opportunity_type", weight: 0.8 },
    { field: "languages", kind: "language", weight: 0.5 },
    { field: "valueRange.min", kind: "value_min", weight: 0.5 },
    { field: "valueRange.max", kind: "value_max", weight: 0.5 },
  ],
};

const valuesAtPath = (root: unknown, path: string): string[] => {
  let value: unknown = root;
  for (const segment of path.split(".")) {
    if (!value || typeof value !== "object") return [];
    value = (value as Record<string, unknown>)[segment];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === "string" || typeof item === "number")
        return [String(item)];
      if (item && typeof item === "object" && "ibgeCode" in item) {
        return [String((item as { ibgeCode: unknown }).ibgeCode)];
      }
      return [];
    });
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [String(value)];
  }
  return [];
};

const normalizeSignalValue = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");

export function workspaceProfileSignals(
  profile: WorkspaceProfile,
): WorkspaceProfileSignal[] {
  const result = new Map<string, WorkspaceProfileSignal>();
  for (const definition of WORKSPACE_PROFILE_SIGNAL_FIELDS[profile.type]) {
    for (const raw of valuesAtPath(profile.answers, definition.field)) {
      const value = normalizeSignalValue(raw);
      if (!value) continue;
      const signal = WorkspaceProfileSignalSchema.parse({
        kind: definition.kind,
        value,
        weight: definition.weight,
        sourceField: definition.field,
      });
      const key = `${signal.kind}\0${signal.value}`;
      const previous = result.get(key);
      if (!previous || Math.abs(signal.weight) > Math.abs(previous.weight))
        result.set(key, signal);
    }
  }
  return [...result.values()];
}

export const LegacyCompanyProfileInputSchema = z
  .object({
    description: normalizedText(20, 600),
    offerings: termList().min(1),
    exclusions: termList(),
    selectedCategories: termList(),
    selectedKeywords: termList(),
    excludedKeywords: termList(),
    registeredPlatforms: termList().default([]),
    coverage: CompanyCoverageSchema,
    valueRange: moneyRangeSchema,
    size: z.enum(["me_epp", "cooperative", "other"]),
  })
  .strict();
export type LegacyCompanyProfileInput = z.infer<
  typeof LegacyCompanyProfileInputSchema
>;

/** Lossless Phase 1 backfill adapter; no database write exists in Phase 0. */
export function companyProfileToProcurementProfile(
  input: unknown,
): z.infer<typeof ProcurementProfileSchema> {
  const legacy = LegacyCompanyProfileInputSchema.parse(input);
  return ProcurementProfileSchema.parse({
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    type: "procurement",
    answers: legacy,
  });
}
