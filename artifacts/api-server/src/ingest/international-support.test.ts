import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clockOfTimestamp,
  dayOfTimestamp,
  localDeadline,
  zonedTimeToUtc,
} from "./international-deadline";
import {
  FIXTURE_NOW,
  internationalFixtureJson,
  internationalResponse,
} from "./international-fixtures";
import {
  acceptTranslation,
  libreTranslateTranslator,
  ollamaTranslator,
  translateTitles,
  translationConfig,
  translationPrompt,
  translatorFromConfig,
} from "./international-translation";
import {
  convertToBrl,
  fetchPtaxQuotes,
  isPtaxCurrency,
  parsePtaxQuote,
  ptaxUrl,
} from "./ptax-client";

const inSaoPaulo = (instant: Date): string =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(instant);

test("fuso: hora local do comprador vira o instante certo e o horário de Brasília", () => {
  // Kampala não tem horário de verão: 11:00 = 08:00 UTC = 05:00 em Brasília.
  const kampala = zonedTimeToUtc("2026-10-27", "11:00", "Africa/Kampala")!;
  assert.equal(kampala.toISOString(), "2026-10-27T08:00:00.000Z");
  assert.equal(inSaoPaulo(kampala), "27/10/2026, 05:00");
  // Bruxelas: UTC+1 no inverno, UTC+2 no verão.
  assert.equal(
    zonedTimeToUtc("2027-03-04", "14:00", "Europe/Brussels")!.toISOString(),
    "2027-03-04T13:00:00.000Z",
  );
  assert.equal(
    zonedTimeToUtc("2027-07-01", "17:00", "Europe/Brussels")!.toISOString(),
    "2027-07-01T15:00:00.000Z",
  );
  // Manhã no Pacífico ainda é a tarde do dia anterior em Brasília.
  assert.equal(
    inSaoPaulo(zonedTimeToUtc("2026-11-05", "09:00", "Pacific/Fiji")!),
    "04/11/2026, 18:00",
  );
  assert.equal(zonedTimeToUtc("2026-02-30", "10:00", "Africa/Kampala"), null);
  assert.equal(zonedTimeToUtc("2026-10-27", "25:00", "Africa/Kampala"), null);
  assert.equal(zonedTimeToUtc("2026-10-27", "10:00", "Mars/Olympus"), null);
});

test("fuso: sem zona conhecida fica só o dia, e a hora publicada não é convertida", () => {
  const exact = localDeadline({
    day: "2026-10-27",
    clock: "11:00",
    timeZone: "Africa/Kampala",
  })!;
  assert.deepEqual(
    { ...exact, at: exact.at.toISOString() },
    {
      at: "2026-10-27T08:00:00.000Z",
      precision: "datetime",
      timeZone: "Africa/Kampala",
      original: "2026-10-27 11:00",
    },
  );
  const noZone = localDeadline({ day: "2026-10-26", clock: "12:00", timeZone: null })!;
  assert.equal(noZone.precision, "date");
  assert.equal(noZone.timeZone, null);
  assert.equal(noZone.original, "2026-10-26 12:00");
  // Fim do dia em qualquer lugar do mundo: a chamada nunca é encerrada antes da hora.
  assert.equal(noZone.at.toISOString(), "2026-10-27T11:59:59.000Z");
  const dayOnly = localDeadline({
    day: "2027-12-01",
    clock: null,
    timeZone: "Europe/Brussels",
  })!;
  assert.equal(dayOnly.precision, "date");
  assert.equal(dayOnly.at.toISOString(), "2027-12-01T22:59:59.000Z");
  assert.equal(localDeadline({ day: null, clock: "11:00", timeZone: null }), null);
  assert.equal(dayOfTimestamp("2026-10-27T00:00:00Z"), "2026-10-27");
  assert.equal(clockOfTimestamp("2027-03-04T14:00:00.000+0000"), "14:00:00");
  assert.equal(dayOfTimestamp("27-Oct-2026"), null);
});

test("PTAX: usa o boletim de fechamento mais recente, na taxa de venda, com a data da cotação", () => {
  const quote = parsePtaxQuote("EUR", internationalFixtureJson("ptax-eur.json"))!;
  assert.deepEqual(quote, { currency: "EUR", rate: 5.5844, date: "2026-10-09" });
  // € 17 milhões na PTAX de 09/10.
  assert.equal(convertToBrl(17_000_000, quote), 94_934_800);
  assert.equal(convertToBrl(1234.56, quote), 6894.28);
  // Sem boletim de fechamento (feriado, resposta vazia) não há conversão.
  assert.equal(parsePtaxQuote("EUR", { value: [] }), null);
  assert.equal(
    parsePtaxQuote("EUR", {
      value: [
        {
          cotacaoVenda: 5.6,
          dataHoraCotacao: "2026-10-09 10:09:10.6",
          tipoBoletim: "Abertura",
        },
      ],
    }),
    null,
  );
  assert.equal(parsePtaxQuote("EUR", "<html>502</html>"), null);
  assert.ok(isPtaxCurrency("USD"));
  assert.ok(!isPtaxCurrency("XOF"));
  assert.ok(!isPtaxCurrency(null));
  // O serviço pede MM-DD-AAAA; a janela de dez dias cobre fim de semana e feriado.
  const url = ptaxUrl("EUR", FIXTURE_NOW);
  assert.match(url, /^https:\/\/olinda\.bcb\.gov\.br\/olinda\/servico\/PTAX\/versao\/v1\/odata\/CotacaoMoedaPeriodo/);
  assert.match(url, /@moeda='EUR'&@dataInicial='10-01-2026'&@dataFinalCotacao='10-11-2026'/);
});

test("PTAX: moeda que falha fica sem conversão e não derruba as outras", async () => {
  const requested: string[] = [];
  const { quotes, errors } = await fetchPtaxQuotes(["EUR", "USD", "EUR"], {
    now: FIXTURE_NOW,
    fetcher: async (request) => {
      requested.push(request.url);
      return request.url.includes("'USD'")
        ? internationalResponse(502, "<html>Bad Gateway</html>")
        : internationalResponse(
            200,
            JSON.stringify(internationalFixtureJson("ptax-eur.json")),
          );
    },
  });
  assert.equal(requested.length, 2);
  assert.equal(quotes.get("EUR")!.rate, 5.5844);
  assert.ok(!quotes.has("USD"));
  assert.equal(errors.length, 1);
  assert.match(errors[0]!, /^PTAX USD: olinda\.bcb\.gov\.br respondeu HTTP 502/);
});

test("tradução: desligada por padrão, plugável por env e nunca OpenAI", () => {
  const off = translationConfig({});
  assert.equal(off.provider, "off");
  assert.equal(translatorFromConfig(off), null);
  assert.deepEqual(off.languages, ["en", "fr"]);
  assert.equal(off.batchSize, 100);

  const ollama = translationConfig({
    INTERNATIONAL_TITLE_TRANSLATION: "ollama",
    INTERNATIONAL_TITLE_TRANSLATION_MODEL: "other-model",
    INTERNATIONAL_TITLE_TRANSLATION_LANGUAGES: "en, fr, es, pt",
    INTERNATIONAL_TITLE_TRANSLATION_BATCH: "25",
    OLLAMA_BASE_URL: "http://ollama:11434/",
  });
  assert.equal(translatorFromConfig(ollama)!.name, "ollama:other-model");
  assert.equal(ollama.ollamaBaseUrl, "http://ollama:11434");
  // Português nunca é "traduzido".
  assert.deepEqual(ollama.languages, ["en", "fr", "es"]);
  assert.equal(ollama.batchSize, 25);

  assert.equal(
    translatorFromConfig(
      translationConfig({
        INTERNATIONAL_TITLE_TRANSLATION: "libretranslate",
        INTERNATIONAL_TITLE_TRANSLATION_URL: "http://marian:5000/",
      }),
    )!.name,
    "libretranslate",
  );
  assert.throws(
    () => translationConfig({ INTERNATIONAL_TITLE_TRANSLATION: "libretranslate" }),
    /requires INTERNATIONAL_TITLE_TRANSLATION_URL/,
  );
  // Nenhum modelo foi escolhido ainda: quem liga o Ollama precisa dizer qual.
  assert.throws(
    () => translationConfig({ INTERNATIONAL_TITLE_TRANSLATION: "ollama" }),
    /requires INTERNATIONAL_TITLE_TRANSLATION_MODEL/,
  );
  assert.throws(
    () => translationConfig({ INTERNATIONAL_TITLE_TRANSLATION: "openai" }),
    /must be off, ollama or libretranslate/,
  );
  assert.throws(
    () =>
      translationConfig({
        INTERNATIONAL_TITLE_TRANSLATION: "ollama",
        INTERNATIONAL_TITLE_TRANSLATION_BATCH: "-1",
      }),
    /INTERNATIONAL_TITLE_TRANSLATION_BATCH/,
  );
});

test("tradução: só aceita resposta que parece um título", () => {
  const original = "Supply of ICT and electronic equipment for PIU Office";
  assert.equal(
    acceptTranslation(original, '"Fornecimento de equipamentos de TIC para o escritório da UIP"\n'),
    "Fornecimento de equipamentos de TIC para o escritório da UIP",
  );
  assert.equal(
    acceptTranslation(original, "Tradução: Fornecimento de equipamentos de TIC\n\nNota: PIU é a unidade…"),
    "Fornecimento de equipamentos de TIC",
  );
  assert.equal(acceptTranslation(original, ""), null);
  assert.equal(acceptTranslation(original, undefined), null);
  // Cópia do original não é tradução.
  assert.equal(acceptTranslation(original, original.toUpperCase()), null);
  // Modelo pequeno que explica em vez de traduzir.
  assert.equal(acceptTranslation("Road works", "x".repeat(200)), null);
  assert.match(translationPrompt(original, "en"), /Título em inglês: Supply of ICT/);
  assert.match(translationPrompt("Travaux", "fr"), /Título em francês: Travaux/);
});

test("tradução: provedores falam com o serviço local e devolvem só o título", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    return new Response(
      JSON.stringify(
        String(url).endsWith("/api/generate")
          ? { response: "Obras de reabilitação do cais\n" }
          : { translatedText: "Obras de reabilitação do cais" },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const ollama = ollamaTranslator(
    { ollamaBaseUrl: "http://localhost:11434", ollamaModel: "some-model", timeoutMs: 1_000 },
    fakeFetch,
  );
  assert.equal(
    await ollama.translate("Works of rehabilitation of the quay", "en"),
    "Obras de reabilitação do cais",
  );
  assert.equal(calls[0]!.url, "http://localhost:11434/api/generate");
  assert.equal(calls[0]!.body.model, "some-model");
  assert.equal(calls[0]!.body.stream, false);

  const libre = libreTranslateTranslator(
    { libreTranslateUrl: "http://marian:5000", timeoutMs: 1_000 },
    fakeFetch,
  );
  assert.equal(
    await libre.translate("Works of rehabilitation of the quay", "en"),
    "Obras de reabilitação do cais",
  );
  assert.deepEqual(calls[1], {
    url: "http://marian:5000/translate",
    body: {
      q: "Works of rehabilitation of the quay",
      source: "en",
      target: "pt",
      format: "text",
    },
  });
});

test("tradução: serviço fora do ar interrompe o lote sem lançar erro", async () => {
  const pending = Array.from({ length: 10 }, (_unused, index) => ({
    id: `call-${index}`,
    text: `Title ${index}`,
    language: "en",
  }));
  const saved: string[] = [];
  const down = await translateTitles(
    pending,
    {
      name: "ollama:some-model",
      translate: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:11434");
      },
    },
    async (id) => void saved.push(id),
  );
  assert.deepEqual(down, {
    translator: "ollama:some-model",
    attempted: 3,
    translated: 0,
    rejected: 0,
    failed: 3,
    stopped: "connect ECONNREFUSED 127.0.0.1:11434",
  });
  assert.equal(saved.length, 0);

  const attempts: string[] = [];
  const mixed = await translateTitles(
    pending.slice(0, 4),
    {
      name: "fake",
      translate: async (text) =>
        text === "Title 1" ? null : text === "Title 2" ? Promise.reject(new Error("timeout")) : `Título ${text.slice(6)}`,
    },
    async (id) => void saved.push(id),
    async (id) => void attempts.push(id),
  );
  assert.deepEqual(saved, ["call-0", "call-3"]);
  // Só a resposta recusada conta como tentativa; falha de rede é tentada de novo na próxima coleta.
  assert.deepEqual(attempts, ["call-1"]);
  assert.deepEqual(
    [mixed.translated, mixed.rejected, mixed.failed, mixed.stopped],
    [2, 1, 1, null],
  );
});
