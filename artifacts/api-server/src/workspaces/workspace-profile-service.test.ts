import assert from "node:assert/strict";
import { test } from "node:test";
import type { companyProfilesTable } from "@workspace/db";

process.env.DATABASE_URL ??= "postgresql://unused:unused@127.0.0.1:1/unused";
const { assertBaseRevision, companyProfileToWorkspaceProfile, workspaceProfileToCompanyProfile } = await import(
  "./workspace-profile-service"
);
const { ProfileVersionConflictError } = await import("../lib/api-error");

type CompanyProfileRow = typeof companyProfilesTable.$inferSelect;

const legacy = (overrides: Partial<CompanyProfileRow> = {}): CompanyProfileRow => ({
  userId: "user-1",
  description: "Manutenção predial e reformas de pequeno porte",
  offerings: ["manutenção predial"],
  exclusions: [],
  selectedCategories: [],
  selectedKeywords: [],
  excludedKeywords: [],
  registeredPlatforms: [],
  coverageScope: "national",
  coverageStates: [],
  coverageRegions: [],
  coverageMunicipalities: [],
  headquartersMunicipalityIbge: null,
  coverageRadiusKm: null,
  coverageMode: "strict",
  acceptsRemote: false,
  valueMin: null,
  valueMax: null,
  size: "me_epp",
  version: 4,
  lastAlertAt: new Date("2026-10-12T09:00:00Z"),
  createdAt: new Date("2026-03-01T12:00:00Z"),
  updatedAt: new Date("2026-10-11T18:30:00Z"),
  ...overrides,
});

const roundTrip = (row: CompanyProfileRow) =>
  workspaceProfileToCompanyProfile(row.userId, companyProfileToWorkspaceProfile(row));

test("national profile with nulls and empty lists survives legacy -> workspace -> legacy field by field", () => {
  const row = legacy();
  assert.deepEqual(roundTrip(row), row);
});

test("custom coverage with regions, states, municipalities, radius and a value range survives the round trip", () => {
  const row = legacy({
    offerings: ["manutenção predial", "pintura"],
    exclusions: ["obra de grande porte"],
    selectedCategories: ["obras-e-servicos-de-engenharia"],
    selectedKeywords: ["reforma"],
    excludedKeywords: ["demolição"],
    registeredPlatforms: ["comprasnet"],
    coverageScope: "custom",
    coverageStates: ["SP", "MG"],
    coverageRegions: ["south"],
    coverageMunicipalities: ["3509502"],
    headquartersMunicipalityIbge: "3509502",
    coverageRadiusKm: 200,
    coverageMode: "prioritize",
    acceptsRemote: true,
    valueMin: "1000.50",
    valueMax: "250000.00",
    size: "cooperative",
  });
  assert.deepEqual(roundTrip(row), row);
});

test("one-sided value range keeps the other side null", () => {
  const row = legacy({ valueMin: "0.00", valueMax: null });
  assert.deepEqual(roundTrip(row), row);
});

test("forward conversion keeps answers literal, carries versions and dates, and computes completeness", () => {
  const profile = companyProfileToWorkspaceProfile(
    legacy({
      coverageScope: "custom",
      coverageMunicipalities: ["3509502"],
      headquartersMunicipalityIbge: "3509502",
      coverageRadiusKm: 50,
    }),
  );
  assert.equal(profile.profileVersion, 4);
  assert.equal(profile.revision, 4);
  assert.equal(profile.completenessPercent, 100);
  assert.equal(profile.completenessComplete, true);
  assert.deepEqual(profile.sourceCreatedAt, new Date("2026-03-01T12:00:00Z"));
  assert.deepEqual(profile.sourceUpdatedAt, new Date("2026-10-11T18:30:00Z"));
  const coverage = (profile.answers as { coverage: { municipalities: unknown; radius: unknown } }).coverage;
  assert.deepEqual(coverage.municipalities, [{ ibgeCode: "3509502", name: "Campinas", state: "SP" }]);
  assert.deepEqual(coverage.radius, { center: { ibgeCode: "3509502", name: "Campinas", state: "SP" }, km: 50 });
  assert.equal("buyerTypes" in profile.answers, false);
  assert.equal("modalities" in profile.answers, false);
});

test("legacy scope states becomes custom, as the v1 API reads and re-saves it", () => {
  const back = roundTrip(legacy({ coverageScope: "states", coverageStates: ["BA"] }));
  assert.equal(back.coverageScope, "custom");
  assert.deepEqual(back.coverageStates, ["BA"]);
});

test("forward conversion fails instead of dropping data the inverse could not restore", () => {
  assert.throws(
    () => companyProfileToWorkspaceProfile(legacy({ coverageScope: "custom", coverageMunicipalities: ["9999999"] })),
    /coverage_municipalities\[0\] has an unknown IBGE code/,
  );
  assert.throws(
    () => companyProfileToWorkspaceProfile(legacy({ coverageScope: "national", coverageStates: ["SP"] })),
    /national coverage keeps custom coverage fields/,
  );
  assert.throws(
    () =>
      companyProfileToWorkspaceProfile(
        legacy({ coverageScope: "custom", headquartersMunicipalityIbge: "3509502", coverageRadiusKm: null }),
      ),
    /headquarters and radius must be set together/,
  );
  assert.throws(
    () => companyProfileToWorkspaceProfile(legacy({ valueMax: "12345678901234567.89" })),
    /value_max does not fit a JavaScript number exactly/,
  );
});

test("inverse conversion fails on answers without a legacy column and on missing required fields", () => {
  const profile = companyProfileToWorkspaceProfile(legacy());
  assert.throws(
    () =>
      workspaceProfileToCompanyProfile("user-1", {
        ...profile,
        answers: { ...profile.answers, buyerTypes: ["municipal"], modalities: ["pregão"] },
      }),
    /answers without a legacy column: buyerTypes, modalities/,
  );
  const { description: _description, ...withoutDescription } = profile.answers;
  assert.throws(
    () => workspaceProfileToCompanyProfile("user-1", { ...profile, answers: withoutDescription }),
    /description is required by the legacy row/,
  );
  assert.throws(
    () => workspaceProfileToCompanyProfile("user-1", { ...profile, lastAlertAt: null }),
    /last_alert_at is required by the legacy row/,
  );
});

test("inverse conversion takes version, last alert and updated_at from the workspace profile", () => {
  const profile = companyProfileToWorkspaceProfile(legacy());
  const later = new Date("2026-11-01T10:00:00Z");
  const back = workspaceProfileToCompanyProfile("user-1", {
    ...profile,
    profileVersion: 9,
    lastAlertAt: later,
    updatedAt: later,
  });
  assert.equal(back.version, 9);
  assert.deepEqual(back.lastAlertAt, later);
  assert.deepEqual(back.updatedAt, later);
  assert.deepEqual(back.createdAt, new Date("2026-03-01T12:00:00Z"));
});

test("baseRevision must match the current revision; the first save sends 0", () => {
  assert.doesNotThrow(() => assertBaseRevision(0, undefined));
  assert.doesNotThrow(() => assertBaseRevision(3, { revision: 3, answers: {} }));
  assert.throws(
    () => assertBaseRevision(2, { revision: 3, answers: { selectedKeywords: ["reforma"] } }),
    (error) =>
      error instanceof ProfileVersionConflictError &&
      error.status === 409 &&
      error.code === "PROFILE_VERSION_CONFLICT" &&
      JSON.stringify(error.details) === JSON.stringify({ revision: 3, answers: { selectedKeywords: ["reforma"] } }),
  );
  assert.throws(
    () => assertBaseRevision(1, undefined),
    (error) => error instanceof ProfileVersionConflictError && (error.details as { revision: number }).revision === 0,
  );
});
