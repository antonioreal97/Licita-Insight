import assert from "node:assert/strict";
import test from "node:test";
import {
  decideInternationalCollect,
  type InternationalCollectDecisionConfig,
  type InternationalIngestRun,
} from "./international-collect-decision";

const config = (
  overrides: Partial<InternationalCollectDecisionConfig> = {},
): InternationalCollectDecisionConfig => ({
  pncpDailyEnabled: true,
  pncpHour: 6,
  safetyHour: 10,
  retryIntervalMs: 5 * 60_000,
  staleAfterMsBySource: {
    pncp: 10 * 60_000,
    "pncp-transparency": 2 * 60 * 60_000,
    "mapas-culturais": 30 * 60_000,
    "funding-opportunities": 30 * 60_000,
    "culture-federal": 30 * 60_000,
  },
  ...overrides,
});

const run = (
  overrides: Partial<InternationalIngestRun> &
    Pick<InternationalIngestRun, "source" | "startedAt">,
): InternationalIngestRun => ({
  status: "complete",
  heartbeatAt: overrides.startedAt,
  finishedAt: overrides.startedAt,
  ...overrides,
});

test("roda depois que o PNCP termina após a hora diária", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T10:00:00Z"),
    [
      run({
        source: "pncp",
        startedAt: new Date("2026-10-12T09:00:00Z"),
        finishedAt: new Date("2026-10-12T09:35:00Z"),
        status: "failed",
      }),
    ],
    config(),
  );
  assert.deepEqual(decision, { action: "run", reason: "pncp_finished" });
});

test("PNCP de startup encerrado à 01:00 não dispara antes da rede de segurança", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T11:00:00Z"),
    [
      run({
        source: "pncp",
        startedAt: new Date("2026-10-12T03:30:00Z"),
        finishedAt: new Date("2026-10-12T04:00:00Z"),
      }),
    ],
    config(),
  );
  assert.equal(decision.action, "wait");
  assert.equal(decision.reason, "waiting_for_pncp");
});

test("outra coleta com heartbeat recente faz esperar", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T10:00:00Z"),
    [
      run({
        source: "pncp",
        startedAt: new Date("2026-10-12T09:00:00Z"),
        finishedAt: new Date("2026-10-12T09:20:00Z"),
      }),
      run({
        source: "mapas-culturais",
        startedAt: new Date("2026-10-12T09:30:00Z"),
        heartbeatAt: new Date("2026-10-12T09:59:00Z"),
        finishedAt: null,
        status: "running",
      }),
    ],
    config(),
  );
  assert.equal(decision.action, "wait");
  assert.equal(decision.reason, "other_collect_running");
});

test("execução internacional registrada hoje impede uma segunda coleta", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T14:00:00Z"),
    [
      run({
        source: "international",
        startedAt: new Date("2026-10-12T10:00:00Z"),
        finishedAt: new Date("2026-10-12T10:30:00Z"),
      }),
    ],
    config(),
  );
  assert.deepEqual(decision, {
    action: "already_ran",
    reason: "international_started_today",
  });
});

test("execução internacional interrompida hoje permite nova tentativa", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T14:00:00Z"),
    [
      run({
        source: "international",
        startedAt: new Date("2026-10-12T10:00:00Z"),
        finishedAt: new Date("2026-10-12T10:10:00Z"),
        status: "failed",
        interrupted: true,
      }),
    ],
    config(),
  );
  assert.deepEqual(decision, { action: "run", reason: "safety_hour" });
});

test("falha da fonte hoje não gera nova tentativa no mesmo dia", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T14:00:00Z"),
    [
      run({
        source: "international",
        startedAt: new Date("2026-10-12T10:00:00Z"),
        finishedAt: new Date("2026-10-12T10:10:00Z"),
        status: "failed",
      }),
    ],
    config(),
  );
  assert.deepEqual(decision, {
    action: "already_ran",
    reason: "international_started_today",
  });
});

test("PNCP desligado roda na hora da rede de segurança", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T13:00:00Z"),
    [],
    config({ pncpDailyEnabled: false }),
  );
  assert.deepEqual(decision, { action: "run", reason: "safety_hour" });
});

test("PNCP ainda rodando na hora de segurança faz esperar", () => {
  const decision = decideInternationalCollect(
    new Date("2026-10-12T13:00:00Z"),
    [
      run({
        source: "pncp",
        startedAt: new Date("2026-10-12T09:00:00Z"),
        heartbeatAt: new Date("2026-10-12T12:59:00Z"),
        finishedAt: null,
        status: "running",
      }),
    ],
    config(),
  );
  assert.equal(decision.action, "wait");
  assert.equal(decision.reason, "other_collect_running");
});
