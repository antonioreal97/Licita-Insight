import { isDeepStrictEqual } from "node:util";
import { eq, sql } from "drizzle-orm";
import {
  companyProfilesTable,
  companyTenderFitsTable,
  workspaceProfileSignalsTable,
  workspaceProfilesTable,
  workspacesTable,
  type WorkspaceType,
} from "@workspace/db";
import {
  mergeWorkspaceProfileStep,
  parseWorkspaceProfileStep,
  ProcurementProfileSchema,
  WORKSPACE_PROFILE_SCHEMA_VERSION,
  WorkspaceProfileSchema,
  workspaceProfileCompleteness,
  workspaceProfileSignals,
  type WorkspaceProfile,
  type WorkspaceProfileCompleteness,
} from "@workspace/api-zod/hub";
import { InvalidParameterError, ProfileVersionConflictError } from "../lib/api-error";
import { municipalityReference } from "../service-region/service-region";
import type { GateTransaction } from "./cutover-gate";
import { assertWorkspaceWritable, type WorkspaceMember } from "./workspace-service";

type CompanyProfileRow = typeof companyProfilesTable.$inferSelect;
type WorkspaceProfileRow = typeof workspaceProfilesTable.$inferSelect;
export type WorkspaceProfileValues = Omit<WorkspaceProfileRow, "workspaceId">;

/** `revision` counts every save; the first save sends 0. A stale base never writes. */
export function assertBaseRevision(
  baseRevision: number,
  current: Pick<WorkspaceProfileRow, "revision" | "answers"> | undefined,
): void {
  const revision = current?.revision ?? 0;
  if (baseRevision !== revision) {
    throw new ProfileVersionConflictError({ revision, answers: current?.answers ?? {} });
  }
}

/** Registered platforms do not feed the fit, as in `putCompanyProfile`, so they keep `profileVersion` and the fits. */
const sameFitAnswers = (type: WorkspaceType, before: object, after: object): boolean => {
  if (type !== "procurement") return isDeepStrictEqual(before, after);
  const { registeredPlatforms: _before, ...beforeFit } = before as Record<string, unknown>;
  const { registeredPlatforms: _after, ...afterFit } = after as Record<string, unknown>;
  return isDeepStrictEqual(beforeFit, afterFit);
};

const isZodError = (error: unknown): error is Error & { issues: Array<{ path: PropertyKey[]; code: string }> } =>
  error instanceof Error && error.name === "ZodError" && "issues" in error;

/** Only the path and the issue code go back: answers are never echoed into errors or logs. */
function parseStepSave(member: WorkspaceMember, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidParameterError("Workspace profile step is invalid", [{ field: "body", issue: "invalid_type" }]);
  }
  const { baseRevision, ...step } = body as Record<string, unknown>;
  if (typeof baseRevision !== "number" || !Number.isSafeInteger(baseRevision) || baseRevision < 0) {
    throw new InvalidParameterError("Workspace profile step is invalid", [
      { field: "baseRevision", issue: "invalid_value" },
    ]);
  }
  if ("type" in step) {
    throw new InvalidParameterError("The profile type comes from the workspace", [{ field: "type", issue: "not_allowed" }]);
  }
  const stepSave = { ...step, type: member.type };
  try {
    parseWorkspaceProfileStep(stepSave);
  } catch (error) {
    if (!isZodError(error)) throw error;
    throw new InvalidParameterError(
      "Workspace profile step is invalid",
      error.issues.map((issue) => ({ field: issue.path.map(String).join(".") || "body", issue: issue.code })),
    );
  }
  return { baseRevision, stepSave };
}

/**
 * Saves one onboarding step inside the gated transaction. Steps merge on the server; `baseRevision` only rejects a
 * second tab saving over a newer revision. Signals are replaced on every save; `profileVersion` (and with it the
 * cached fits and the alert cursor) moves only when an answer that feeds the fit changes.
 */
export async function saveWorkspaceProfileStep(
  tx: GateTransaction,
  member: WorkspaceMember,
  body: unknown,
  now = new Date(),
): Promise<{
  profile: WorkspaceProfile;
  completeness: WorkspaceProfileCompleteness;
  profileVersion: number;
  revision: number;
}> {
  assertWorkspaceWritable(member);
  const { baseRevision, stepSave } = parseStepSave(member, body);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`licitai:workspace-profile:${member.workspaceId}`}, 0))`,
  );
  const [current] = await tx
    .select()
    .from(workspaceProfilesTable)
    .where(eq(workspaceProfilesTable.workspaceId, member.workspaceId))
    .limit(1);
  assertBaseRevision(baseRevision, current);
  const before = WorkspaceProfileSchema.parse({
    schemaVersion: current?.schemaVersion ?? WORKSPACE_PROFILE_SCHEMA_VERSION,
    type: member.type,
    answers: current?.answers ?? {},
  });
  const profile = mergeWorkspaceProfileStep(before, stepSave);
  const completeness = workspaceProfileCompleteness(profile);
  const fitChanged = !current || !sameFitAnswers(member.type, before.answers, profile.answers);
  const profileVersion = current ? current.profileVersion + (fitChanged ? 1 : 0) : 1;
  const revision = (current?.revision ?? 0) + 1;
  const values = {
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    profileVersion,
    revision,
    answers: profile.answers as Record<string, unknown>,
    completenessPercent: completeness.percent,
    completenessComplete: completeness.complete,
    updatedAt: now,
    ...(fitChanged ? { lastAlertAt: now } : {}),
  };
  await tx
    .insert(workspaceProfilesTable)
    .values({ workspaceId: member.workspaceId, ...values, createdAt: now })
    .onConflictDoUpdate({ target: workspaceProfilesTable.workspaceId, set: values });
  if (fitChanged) {
    await tx.delete(companyTenderFitsTable).where(eq(companyTenderFitsTable.workspaceId, member.workspaceId));
  }
  await tx.delete(workspaceProfileSignalsTable).where(eq(workspaceProfileSignalsTable.workspaceId, member.workspaceId));
  const signals = workspaceProfileSignals(profile).map((signal) => {
    if (signal.kind === "remote") throw new Error("The remote signal has no column in workspace_profile_signals");
    return {
      workspaceId: member.workspaceId,
      kind: signal.kind,
      value: signal.value,
      weight: signal.weight.toFixed(3),
      sourceField: signal.sourceField,
      profileVersion,
      createdAt: now,
    };
  });
  if (signals.length > 0) await tx.insert(workspaceProfileSignalsTable).values(signals);
  await tx
    .update(workspacesTable)
    .set({
      onboardingStatus: completeness.complete
        ? "complete"
        : Object.keys(profile.answers).length > 0
          ? "in_progress"
          : "not_started",
      updatedAt: now,
    })
    .where(eq(workspacesTable.id, member.workspaceId));
  return { profile, completeness, profileVersion, revision };
}

/**
 * Forward conversion (W3): a `company_profiles` row as the default workspace profile, following
 * docs/contracts/workspace-profiles-v1.md. It fails instead of dropping anything the inverse could not restore.
 * The legacy scope `states` becomes `custom`, as the v1 API already reads and re-saves it.
 */
export function companyProfileToWorkspaceProfile(row: CompanyProfileRow): WorkspaceProfileValues {
  const fail = (reason: string): never => {
    throw new Error(`company_profiles ${row.userId} cannot become a workspace profile: ${reason}`);
  };
  const hasCustomFields =
    row.coverageStates.length > 0 ||
    row.coverageRegions.length > 0 ||
    row.coverageMunicipalities.length > 0 ||
    row.headquartersMunicipalityIbge !== null ||
    row.coverageRadiusKm !== null;
  if (row.coverageScope === "national" && hasCustomFields) fail("national coverage keeps custom coverage fields");
  if ((row.headquartersMunicipalityIbge === null) !== (row.coverageRadiusKm === null)) {
    fail("headquarters and radius must be set together");
  }
  const municipality = (code: string, field: string) =>
    municipalityReference(code) ?? fail(`${field} has an unknown IBGE code`);
  const money = (value: string | null, field: string): number | null => {
    if (value === null) return null;
    const parsed = Number(value);
    return parsed.toFixed(2) === value ? parsed : fail(`${field} does not fit a JavaScript number exactly`);
  };
  const { answers } = ProcurementProfileSchema.parse({
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    type: "procurement",
    answers: {
      description: row.description,
      offerings: row.offerings,
      exclusions: row.exclusions,
      selectedCategories: row.selectedCategories,
      selectedKeywords: row.selectedKeywords,
      excludedKeywords: row.excludedKeywords,
      registeredPlatforms: row.registeredPlatforms,
      coverage:
        row.coverageScope === "national"
          ? { scope: "national", mode: row.coverageMode, acceptsRemote: row.acceptsRemote }
          : {
              scope: "custom",
              mode: row.coverageMode,
              acceptsRemote: row.acceptsRemote,
              regions: row.coverageRegions,
              states: row.coverageStates,
              municipalities: row.coverageMunicipalities.map((code, index) =>
                municipality(code, `coverage_municipalities[${index}]`),
              ),
              radius:
                row.headquartersMunicipalityIbge === null
                  ? null
                  : {
                      center: municipality(row.headquartersMunicipalityIbge, "headquarters_municipality_ibge"),
                      km: row.coverageRadiusKm,
                    },
            },
      valueRange: { min: money(row.valueMin, "value_min"), max: money(row.valueMax, "value_max") },
      size: row.size,
    },
  });
  const completeness = workspaceProfileCompleteness({
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    type: "procurement",
    answers,
  });
  return {
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    profileVersion: row.version,
    revision: row.version,
    answers,
    completenessPercent: completeness.percent,
    completenessComplete: completeness.complete,
    lastAlertAt: row.lastAlertAt,
    sourceCreatedAt: row.createdAt,
    sourceUpdatedAt: row.updatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Inverse conversion, the basis of the rollback reverse copy (docs/contracts/workspace-cutover-v1.md, "Cópia
 * reversa"): `version` takes `profile_version`, and `updated_at`/`last_alert_at` come from the workspace. It fails on
 * any answer without a legacy column and on a profile missing a field the legacy row requires.
 */
export function workspaceProfileToCompanyProfile(
  userId: string,
  profile: Pick<
    WorkspaceProfileRow,
    "answers" | "profileVersion" | "lastAlertAt" | "sourceCreatedAt" | "createdAt" | "updatedAt"
  >,
): CompanyProfileRow {
  const fail = (reason: string): never => {
    throw new Error(`Workspace profile of ${userId} cannot become company_profiles: ${reason}`);
  };
  const { answers } = ProcurementProfileSchema.parse({
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    type: "procurement",
    answers: profile.answers,
  });
  const withoutColumn = (["buyerTypes", "modalities"] as const).filter((field) => answers[field] !== undefined);
  if (withoutColumn.length > 0) fail(`answers without a legacy column: ${withoutColumn.join(", ")}`);
  const required = <T>(value: T | undefined | null, field: string): T =>
    value ?? fail(`${field} is required by the legacy row`);
  const coverage = required(answers.coverage, "coverage");
  const valueRange = required(answers.valueRange, "valueRange");
  const custom = coverage.scope === "custom" ? coverage : null;
  return {
    userId,
    description: required(answers.description, "description"),
    offerings: required(answers.offerings, "offerings"),
    exclusions: answers.exclusions ?? [],
    selectedCategories: answers.selectedCategories ?? [],
    selectedKeywords: answers.selectedKeywords ?? [],
    excludedKeywords: answers.excludedKeywords ?? [],
    registeredPlatforms: answers.registeredPlatforms ?? [],
    coverageScope: coverage.scope,
    coverageStates: custom?.states ?? [],
    coverageRegions: custom?.regions ?? [],
    coverageMunicipalities: custom?.municipalities.map(({ ibgeCode }) => ibgeCode) ?? [],
    headquartersMunicipalityIbge: custom?.radius?.center.ibgeCode ?? null,
    coverageRadiusKm: custom?.radius?.km ?? null,
    coverageMode: coverage.mode,
    acceptsRemote: coverage.acceptsRemote,
    valueMin: valueRange.min === null ? null : valueRange.min.toFixed(2),
    valueMax: valueRange.max === null ? null : valueRange.max.toFixed(2),
    size: required(answers.size, "size"),
    version: profile.profileVersion,
    lastAlertAt: required(profile.lastAlertAt, "last_alert_at"),
    createdAt: profile.sourceCreatedAt ?? profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
