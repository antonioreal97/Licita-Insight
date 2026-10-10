import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

process.env.LOG_LEVEL ??= "silent";

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

/** 03:00 UTC is midnight in America/Sao_Paulo. */
const saoPaulo = (clock: string, day = "2026-10-10"): Date => new Date(`${day}T${clock}:00-03:00`);

describe("janela do job noturno", () => {
  it("abre 00:00–05:30 por padrão e fecha antes da coleta das 06:00", async () => {
    const { nightlyCategoryConfig, nightlyWindowAt } = await import("./nightly-window");
    const config = nightlyCategoryConfig();
    assert.deepEqual([config.windowStartMinutes, config.windowEndMinutes], [0, 330]);

    const open = nightlyWindowAt(saoPaulo("02:15"), config);
    assert.ok(open.open);
    assert.equal(open.opensAt.toISOString(), saoPaulo("00:00").toISOString());
    assert.equal(open.closesAt.toISOString(), saoPaulo("05:30").toISOString());
    assert.ok(nightlyWindowAt(saoPaulo("00:00"), config).open);
    assert.ok(nightlyWindowAt(saoPaulo("05:29"), config).open);
    assert.equal(nightlyWindowAt(saoPaulo("05:30"), config).open, false);
    assert.equal(nightlyWindowAt(saoPaulo("06:00"), config).open, false);
    assert.equal(nightlyWindowAt(saoPaulo("23:59"), config).open, false);
  });

  it("a mesma noite tem uma chave só e a noite seguinte tem outra", async () => {
    const { nightlyCategoryConfig, nightlyWindowAt } = await import("./nightly-window");
    const config = nightlyCategoryConfig();
    const early = nightlyWindowAt(saoPaulo("00:05"), config);
    const late = nightlyWindowAt(saoPaulo("05:00"), config);
    const next = nightlyWindowAt(saoPaulo("00:05", "2026-10-11"), config);
    assert.ok(early.open && late.open && next.open);
    assert.equal(early.key, late.key);
    assert.notEqual(early.key, next.key);
  });

  it("aceita janela configurada que cruza a meia-noite", async () => {
    process.env.NIGHTLY_CATEGORY_WINDOW_START = "22:30";
    process.env.NIGHTLY_CATEGORY_WINDOW_END = "04:00";
    const { nightlyCategoryConfig, nightlyWindowAt } = await import("./nightly-window");
    const config = nightlyCategoryConfig();
    const beforeMidnight = nightlyWindowAt(saoPaulo("23:00"), config);
    const afterMidnight = nightlyWindowAt(saoPaulo("01:00", "2026-10-11"), config);
    assert.ok(beforeMidnight.open && afterMidnight.open);
    assert.equal(beforeMidnight.closesAt.toISOString(), saoPaulo("04:00", "2026-10-11").toISOString());
    assert.equal(beforeMidnight.key, afterMidnight.key);
    assert.equal(nightlyWindowAt(saoPaulo("04:00", "2026-10-11"), config).open, false);
    assert.equal(nightlyWindowAt(saoPaulo("12:00"), config).open, false);
  });

  it("recusa horário inválido e lê os limites do Jev", async () => {
    const { nightlyCategoryConfig } = await import("./nightly-window");
    process.env.NIGHTLY_CATEGORY_WINDOW_END = "5h30";
    assert.throws(() => nightlyCategoryConfig(), /NIGHTLY_CATEGORY_WINDOW_END/u);
    delete process.env.NIGHTLY_CATEGORY_WINDOW_END;

    process.env.JEV_API_KEY = "test-key";
    assert.deepEqual(nightlyCategoryConfig().jev, {
      enabled: true, threshold: 0.6, dailyLimit: 1_500, minConfidence: 0.5, concurrency: 4,
    });
    process.env.JEV_TEACHER_DAILY_LIMIT = "200";
    process.env.JEV_TEACHER_CONFIDENCE_THRESHOLD = "0.55";
    assert.equal(nightlyCategoryConfig().jev.dailyLimit, 200);
    assert.equal(nightlyCategoryConfig().jev.threshold, 0.55);
    process.env.JEV_TEACHER_ENABLED = "false";
    assert.equal(nightlyCategoryConfig().jev.enabled, false);
    delete process.env.JEV_TEACHER_ENABLED;
    delete process.env.JEV_API_KEY;
    assert.equal(nightlyCategoryConfig().jev.enabled, false, "sem chave do Jev não há professor");
  });

  it("o job noturno é o modo do aluno; NIGHTLY_CATEGORY_ENABLED=false volta à classificação pós-coleta", async () => {
    const { nightlyCategoryEnabled } = await import("./nightly-window");
    delete process.env.CATEGORY_STUDENT_ENABLED;
    assert.equal(nightlyCategoryEnabled(), false);
    process.env.CATEGORY_STUDENT_ENABLED = "true";
    assert.equal(nightlyCategoryEnabled(), true);
    process.env.NIGHTLY_CATEGORY_ENABLED = "false";
    assert.equal(nightlyCategoryEnabled(), false);
  });
});

describe("agendamento do job noturno", () => {
  const setup = async (clock: { now: Date }) => {
    const { createNightlyCategoryRunner } = await import("./nightly-scheduler");
    const { nightlyCategoryConfig } = await import("./nightly-window");
    const runs: Date[] = [];
    const state = { complete: true, fail: false, locked: false };
    const runner = createNightlyCategoryRunner({
      config: nightlyCategoryConfig(),
      now: () => clock.now,
      run: async ({ deadline }) => {
        runs.push(deadline);
        if (state.fail) throw new Error("ollama fora do ar");
        return { complete: state.complete, skipped: null };
      },
      lock: async (jobKey, job) => {
        assert.equal(jobKey, "nightly_category_classification");
        return state.locked ? { acquired: false } : { acquired: true, value: await job() };
      },
    });
    return { runner, runs, state };
  };

  it("não roda fora da janela e roda uma vez por noite quando termina", async () => {
    const clock = { now: saoPaulo("23:00", "2026-10-09") };
    const { runner, runs } = await setup(clock);
    assert.equal(await runner.tick(), "idle");
    clock.now = saoPaulo("00:01");
    assert.equal(await runner.tick(), "ran");
    assert.equal(runs[0]?.toISOString(), saoPaulo("05:30").toISOString());
    clock.now = saoPaulo("00:02");
    assert.equal(await runner.tick(), "finished");
    clock.now = saoPaulo("07:00");
    assert.equal(await runner.tick(), "idle");
    assert.equal(runs.length, 1);
  });

  it("retoma na mesma noite o que parou sem terminar e de novo na noite seguinte", async () => {
    const clock = { now: saoPaulo("00:01") };
    const { runner, runs, state } = await setup(clock);
    state.complete = false;
    assert.equal(await runner.tick(), "ran");
    clock.now = saoPaulo("00:02");
    assert.equal(await runner.tick(), "ran", "noite incompleta continua no próximo ciclo");
    state.complete = true;
    clock.now = saoPaulo("00:03");
    assert.equal(await runner.tick(), "ran");
    clock.now = saoPaulo("00:04");
    assert.equal(await runner.tick(), "finished");
    clock.now = saoPaulo("00:01", "2026-10-11");
    assert.equal(await runner.tick(), "ran", "a noite seguinte começa de novo");
    assert.equal(runs.length, 4);
    assert.equal(runs[3]?.toISOString(), saoPaulo("05:30", "2026-10-11").toISOString());
  });

  it("espera antes de tentar de novo depois de falha ou de lock ocupado", async () => {
    const clock = { now: saoPaulo("00:01") };
    const { runner, runs, state } = await setup(clock);
    state.fail = true;
    assert.equal(await runner.tick(), "failed");
    clock.now = saoPaulo("00:05");
    assert.equal(await runner.tick(), "waiting");
    state.fail = false;
    state.locked = true;
    clock.now = saoPaulo("00:12");
    assert.equal(await runner.tick(), "locked", "outra instância segura o lock");
    assert.equal(runs.length, 1);
    state.locked = false;
    clock.now = saoPaulo("00:15");
    assert.equal(await runner.tick(), "waiting");
    clock.now = saoPaulo("00:23");
    assert.equal(await runner.tick(), "ran");
    assert.equal(runs.length, 2);
  });

  it("uma execução em andamento impede outra e stop() encerra o agendamento", async () => {
    const { createNightlyCategoryRunner } = await import("./nightly-scheduler");
    const { nightlyCategoryConfig } = await import("./nightly-window");
    let release: () => void = () => undefined;
    const seen: boolean[] = [];
    const runner = createNightlyCategoryRunner({
      config: nightlyCategoryConfig(),
      now: () => saoPaulo("01:00"),
      run: async ({ signal }) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        seen.push(signal.stopped);
        return { complete: false, skipped: null };
      },
      lock: async (_jobKey, job) => ({ acquired: true, value: await job() }),
    });
    const first = runner.tick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await runner.tick(), "busy");
    runner.stop();
    release();
    assert.equal(await first, "ran");
    assert.deepEqual(seen, [true], "o job enxerga o pedido de parada");
    assert.equal(await runner.tick(), "idle");
  });
});

describe("categorias do Jev", () => {
  it("usa a escolha e só acrescenta a segunda categoria quando ela chega perto", async () => {
    const { jevCategories } = await import("./jev-teacher");
    assert.deepEqual(jevCategories({
      category: "veiculos-pecas",
      probabilities: { "veiculos-pecas": 0.7, "transporte-locacao-veiculos": 0.2, outros: 0.1 },
    }), ["veiculos-pecas"]);
    assert.deepEqual(jevCategories({
      category: "veiculos-pecas",
      probabilities: { "veiculos-pecas": 0.5, "transporte-locacao-veiculos": 0.4, outros: 0.1 },
    }), ["veiculos-pecas", "transporte-locacao-veiculos"]);
    assert.deepEqual(jevCategories({
      category: "outros",
      probabilities: { outros: 0.4, "veiculos-pecas": 0.39 },
    }), ["outros"]);
    assert.deepEqual(jevCategories({
      category: "inexistente" as never,
      probabilities: {},
    }), []);
  });
});
