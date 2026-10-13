import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CultureProfileSchema,
  FundingProfileSchema,
  ProcurementProfileSchema,
  ResearchProfileSchema,
  StudyProfileSchema,
  WORKSPACE_EXPERIENCES,
  companyProfileToProcurementProfile,
  mapCulturalOpportunityToOpportunitySummary,
  mapTenderToOpportunitySummary,
  mergeWorkspaceProfileStep,
  parseWorkspaceProfileStep,
  workspaceProfileCompleteness,
  workspaceProfileSignals,
} from "@workspace/api-zod/hub";

const legacyCompanyProfile = {
  description: "Serviços fictícios de engenharia e manutenção predial.",
  offerings: ["manutenção predial"],
  exclusions: ["obras rodoviárias"],
  selectedCategories: ["engenharia-obras"],
  selectedKeywords: ["manutenção de edifícios"],
  excludedKeywords: ["asfalto"],
  registeredPlatforms: ["sicaf"],
  coverage: {
    scope: "custom" as const,
    mode: "strict" as const,
    acceptsRemote: false,
    regions: ["southeast" as const],
    states: ["SP"],
    municipalities: [{ ibgeCode: "3550308", name: "São Paulo", state: "SP" }],
    radius: {
      center: { ibgeCode: "3550308", name: "São Paulo", state: "SP" },
      km: 100 as const,
    },
  },
  valueRange: { min: 10_000, max: 2_000_000 },
  size: "me_epp" as const,
};

describe("workspace profile contracts", () => {
  it("parses one versioned document for each of the five profiles", () => {
    assert.equal(
      ProcurementProfileSchema.parse({
        schemaVersion: 1,
        type: "procurement",
        answers: legacyCompanyProfile,
      }).type,
      "procurement",
    );
    assert.equal(
      FundingProfileSchema.parse({
        schemaVersion: 1,
        type: "funding",
        answers: {
          keywords: ["transição energética"],
          regions: {
            scope: "national",
            countries: [],
            states: [],
            remote: false,
          },
        },
      }).type,
      "funding",
    );
    assert.equal(
      StudyProfileSchema.parse({
        schemaVersion: 1,
        type: "study",
        answers: {
          keywords: ["ciência de dados"],
          regions: {
            scope: "international",
            countries: ["PT"],
            states: [],
            remote: false,
          },
          studyLevels: ["masters"],
        },
      }).type,
      "study",
    );
    assert.equal(
      ResearchProfileSchema.parse({
        schemaVersion: 1,
        type: "research",
        answers: {
          keywords: ["bioeconomia"],
          regions: {
            scope: "international",
            countries: ["DE"],
            states: [],
            remote: false,
          },
          careerStages: ["early_career"],
        },
      }).type,
      "research",
    );
    assert.equal(
      CultureProfileSchema.parse({
        schemaVersion: 1,
        type: "culture",
        answers: {
          keywords: ["cinema independente"],
          regions: {
            scope: "custom",
            countries: [],
            states: ["PE"],
            remote: false,
          },
          culturalAreas: ["audiovisual"],
        },
      }).type,
      "culture",
    );
  });

  it("saves a partial step, rejects fields from another step and computes completeness", () => {
    const empty = FundingProfileSchema.parse({
      schemaVersion: 1,
      type: "funding",
      answers: {},
    });
    const objective = mergeWorkspaceProfileStep(empty, {
      schemaVersion: 1,
      type: "funding",
      step: "objective",
      answers: { keywords: ["saneamento"] },
    });
    assert.deepEqual(workspaceProfileCompleteness(objective), {
      percent: 50,
      complete: false,
      missing: ["region"],
      nextStep: "region",
    });
    const complete = mergeWorkspaceProfileStep(objective, {
      schemaVersion: 1,
      type: "funding",
      step: "region",
      answers: {
        regions: {
          scope: "national",
          countries: [],
          states: [],
          remote: false,
        },
      },
    });
    assert.equal(workspaceProfileCompleteness(complete).complete, true);
    assert.throws(() =>
      parseWorkspaceProfileStep({
        schemaVersion: 1,
        type: "funding",
        step: "region",
        answers: { keywords: ["fora da etapa"] },
      }),
    );
  });

  it("maps the current company profile losslessly and materializes normalized signals", () => {
    const profile = companyProfileToProcurementProfile(legacyCompanyProfile);
    assert.deepEqual(profile.answers, legacyCompanyProfile);
    const signals = workspaceProfileSignals(profile);
    assert.ok(
      signals.some(
        (signal) =>
          signal.kind === "keyword" && signal.value === "manutenção predial",
      ),
    );
    assert.ok(
      signals.some(
        (signal) => signal.kind === "state" && signal.value === "sp",
      ),
    );
    assert.ok(
      signals.some(
        (signal) => signal.kind === "excluded_keyword" && signal.weight === -1,
      ),
    );
  });

  it("has a complete experience definition for every profile", () => {
    assert.deepEqual(Object.keys(WORKSPACE_EXPERIENCES).sort(), [
      "culture",
      "funding",
      "procurement",
      "research",
      "study",
    ]);
    for (const definition of Object.values(WORKSPACE_EXPERIENCES)) {
      assert.ok(definition.navigation.length >= 4);
      assert.ok(definition.dashboard.length >= 4);
      assert.deepEqual(
        definition.onboarding.map(({ id }) => id),
        ["objective", "region", "qualification"],
      );
    }
  });
});

describe("opportunity catalog mapping", () => {
  it("maps a fictitious PNCP tender to the procurement extension", () => {
    const mapped = mapTenderToOpportunitySummary(
      {
        id: "tender-fixture-1",
        pncpControlNumber: "00000000000100-1-000001/2026",
        title: "Manutenção predial fictícia",
        displayTitle: "Manutenção de escola municipal",
        objectSummary: "Serviço preventivo e corretivo.",
        description: null,
        organizationName: "Prefeitura Exemplo",
        purchasingUnit: "Secretaria de Educação",
        modality: "pregao_eletronico",
        modalityLabel: "Pregão eletrônico",
        status: "open",
        tenderNumber: "1/2026",
        processNumber: "PROC-1",
        estimatedValue: "125000.00",
        estimatedValueStatus: "disclosed",
        estimatedValueFlag: null,
        publishedAt: "2026-10-01T12:00:00.000Z",
        proposalDeadline: "2026-11-01T15:00:00.000Z",
        state: "SP",
        city: "Cidade Exemplo",
        sourceId: "pncp",
        sourceName: "PNCP",
        sourceUrl: "https://pncp.example.test/editais/1",
        platform: "comprasgov",
        platformLabel: "Compras.gov.br",
        categories: [{ slug: "engenharia-obras", label: "Engenharia e obras" }],
        fetchedAt: "2026-10-02T10:00:00.000Z",
        updatedAt: "2026-10-02T10:00:00.000Z",
      },
      { catalogId: "op-fixture-pncp", fingerprint: "sha256-fixture-pncp" },
    );
    assert.equal(mapped.domain, "procurement");
    assert.equal(mapped.amountMin, 125000);
    assert.equal(mapped.currency, "BRL");
    assert.deepEqual(mapped.states, ["SP"]);
    assert.equal(mapped.provenance.sourceEntity, "tenders");
    assert.equal(mapped.extension.modality, "pregao_eletronico");
  });

  it("maps a fictitious World Bank notice with countries and auditable eligibility", () => {
    const mapped = mapCulturalOpportunityToOpportunitySummary(
      {
        id: "worldbank-fixture-1",
        installationId: "worldbank",
        externalId: "OP00000001",
        kind: "procurement",
        source: "worldbank",
        title: "Aquisição internacional fictícia",
        summary: "Aviso usado somente em teste.",
        organizationName: "Agência Exemplo",
        audience: "Empresas",
        amount: null,
        state: null,
        registrationFrom: null,
        registrationTo: "2026-12-10T23:59:59.000Z",
        status: "open",
        program: null,
        areas: ["infraestrutura"],
        areaTerms: [],
        opportunityType: "Invitation for Bids",
        originName: "Projeto Exemplo",
        continuousFlow: false,
        scope: "international",
        country: "UG",
        amountOriginal: null,
        currency: null,
        amountBrlApprox: null,
        brazilEligibility: "yes",
        brazilEligibilityReason: "Concorrência internacional aberta.",
        brazilEligibilityRule: "wb-international-open",
        brazilFunding: null,
        brazilFundingReason: null,
        eligibilityCheckedAt: "2026-10-02T10:00:00.000Z",
        sourceUrl: "https://worldbank.example.test/notices/OP00000001",
        fetchedAt: "2026-10-02T10:00:00.000Z",
        updatedAt: "2026-10-02T10:00:00.000Z",
      },
      {
        catalogId: "op-fixture-worldbank",
        fingerprint: "sha256-fixture-worldbank",
      },
    );
    assert.equal(mapped.domain, "procurement");
    assert.deepEqual(mapped.countries, ["UG"]);
    assert.equal(mapped.extension.eligibility?.brazilEligibility, "yes");
    assert.equal(
      mapped.extension.eligibility?.brazilEligibilityRule,
      "wb-international-open",
    );
  });

  it("classifies a fictitious EU research call without inventing a study record", () => {
    const mapped = mapCulturalOpportunityToOpportunitySummary(
      {
        id: "eu-fixture-1",
        installationId: "eu_ft",
        externalId: "HORIZON-EXAMPLE",
        kind: "innovation",
        source: "eu_ft",
        title: "Chamada Horizon fictícia",
        summary: null,
        organizationName: "Comissão Europeia",
        audience: "Consórcios de pesquisa",
        amount: null,
        state: null,
        registrationFrom: "2026-10-01T00:00:00.000Z",
        registrationTo: "2027-03-01T13:00:00.000Z",
        status: "open",
        program: "Horizon Europe",
        areas: ["clima"],
        areaTerms: ["Climate"],
        opportunityType: "Research and Innovation Action",
        originName: "HORIZON-EXAMPLE",
        continuousFlow: false,
        scope: "international",
        country: null,
        amountOriginal: "3000000.00",
        currency: "EUR",
        amountBrlApprox: "18000000.00",
        brazilEligibility: "conditional",
        brazilEligibilityReason: "Participação em consórcio.",
        brazilEligibilityRule: "eu-horizon-consortium",
        brazilFunding: "no",
        brazilFundingReason: "Terceiro país sem financiamento automático.",
        eligibilityCheckedAt: "2026-10-02T10:00:00.000Z",
        sourceUrl: "https://eu.example.test/topics/HORIZON-EXAMPLE",
        fetchedAt: "2026-10-02T10:00:00.000Z",
        updatedAt: "2026-10-02T10:00:00.000Z",
      },
      { catalogId: "op-fixture-eu", fingerprint: "sha256-fixture-eu" },
    );
    assert.equal(mapped.domain, "research");
    assert.equal(mapped.currency, "EUR");
    assert.equal(mapped.extension.amountBrlApprox, 18000000);
  });
});
