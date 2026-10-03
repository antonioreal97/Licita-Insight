import assert from "node:assert/strict";
import test from "node:test";
import { createOllamaClient } from "../ai/ollama-client";
import { TENDER_CATEGORIES } from "../catalog/tender-categories";
import {
  buildTeacherPrompt,
  categoriesFromLabels,
  inventedWords,
  parseTeacherResponse,
  runTeacher,
  TEACHER_INSTRUCTIONS,
  validateTeacherItem,
} from "./teacher";

const source = "CONTRATAÇÃO DE EMPRESA PARA FORNECIMENTO DE CARGA E RECARGA DE EXTINTORES DE INCÊNDIO.";

test("o prompt traz os 29 rótulos na ordem canônica, separados por '; '", () => {
  const labels = TENDER_CATEGORIES.map(({ label }) => label).join("; ");
  assert.ok(TEACHER_INSTRUCTIONS.includes(`copiando o nome exato desta lista: ${labels}.`));
  assert.ok(TEACHER_INSTRUCTIONS.includes("nunca troque o objeto (medicamento não vira médico)"));
  const prompt = buildTeacherPrompt(["a", "b"]);
  assert.match(prompt, /\{"itens":\[\{"id":1,"texto":"a"\},\{"id":2,"texto":"b"\}\]\}/u);
});

test("mapeia rótulo exato para slug, descarta inválidos e limita a duas", () => {
  assert.deepEqual(
    categoriesFromLabels([
      "Segurança, vigilância e prevenção de incêndio",
      "segurança, vigilância e prevenção de incêndio",
      "Categoria inventada",
      "Segurança, vigilância e prevenção de incêndio",
      "Outros",
      "Alimentação",
    ]),
    ["seguranca-incendio", "outros"],
  );
  assert.deepEqual(categoriesFromLabels("Outros"), []);
});

test("aceita título fiel com palavras-ponte e sem ponto final", () => {
  const result = validateTeacherItem(source, {
    titulo: "Contratação de serviço de recarga de extintores.",
    categorias: ["Segurança, vigilância e prevenção de incêndio", "Rótulo errado"],
  });
  assert.deepEqual(result, {
    title: "Contratação de serviço de recarga de extintores",
    categories: ["seguranca-incendio"],
    rejection: null,
  });
  assert.equal(validateTeacherItem("PAGAMENTO DE FRANQUIA", {
    titulo: "Objeto não especificado", categorias: ["Outros"],
  }).rejection, null);
});

test("recusa palavra inventada, mas aproveita as categorias válidas", () => {
  const result = validateTeacherItem("Aquisição de medicamentos para a farmácia básica", {
    titulo: "Contratação de serviço de médico",
    categorias: ["Medicamentos e insumos de saúde"],
  });
  assert.equal(result.title, null);
  assert.equal(result.rejection, "invented_word");
  assert.deepEqual(result.categories, ["medicamentos-insumos-saude"]);
  assert.deepEqual(inventedWords("Aquisição de medicamentos", "Aquisição de médicos"), ["medicos"]);
});

test("recusa título vazio, com mais de 12 palavras ou mais de 100 caracteres", () => {
  assert.equal(validateTeacherItem(source, { titulo: "  ", categorias: [] }).rejection, "empty");
  const longWords = "carga ".repeat(13).trim();
  assert.equal(validateTeacherItem(source, { titulo: longWords, categorias: [] }).rejection, "too_long");
  const longChars = "extintores ".repeat(10).trim();
  assert.ok(longChars.length > 100);
  assert.equal(validateTeacherItem(source, { titulo: longChars, categorias: [] }).rejection, "too_long");
  assert.equal(validateTeacherItem(source, undefined).rejection, "missing");
});

test("associa a resposta pelo id e marca itens ausentes", () => {
  const results = parseTeacherResponse(["Aquisição de café", "Locação de tendas"], {
    itens: [{ id: 2, titulo: "Locação de tendas", categorias: ["Locação de bens e imóveis"] }],
  });
  assert.equal(results[0]?.rejection, "missing");
  assert.equal(results[1]?.title, "Locação de tendas");
  assert.deepEqual(parseTeacherResponse(["x"], "lixo"), [{ title: null, categories: [], rejection: "missing" }]);
});

test("chama o Ollama em lotes de 10", async () => {
  const sizes: number[] = [];
  const client = createOllamaClient({
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { prompt: string; format: unknown };
      assert.ok(body.format);
      const items = JSON.parse(body.prompt.split("\n").at(-1) ?? "{}") as { itens: { id: number; texto: string }[] };
      sizes.push(items.itens.length);
      return new Response(JSON.stringify({
        model: "gemma4:12b",
        response: JSON.stringify({ itens: items.itens.map(({ id, texto }) => ({ id, titulo: texto, categorias: ["Outros"] })) }),
      }));
    },
  });
  const texts = Array.from({ length: 23 }, (_, index) => `Aquisição de item ${index}`);
  const run = await runTeacher(texts, client);
  assert.deepEqual(sizes, [10, 10, 3]);
  assert.equal(run.results.length, 23);
  assert.equal(run.results[22]?.title, "Aquisição de item 22");
  assert.deepEqual(run.results[0]?.categories, ["outros"]);
});

test("o professor OpenAI manda o mesmo prompt com schema estrito e rateia o uso", async () => {
  const saved = { ...process.env };
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_MODEL = "gpt-4o-mini";
  try {
    const { openAiTeacher, OPENAI_TEACHER_SCHEMA } = await import("./teacher");
    let calls = 0;
    const teacher = openAiTeacher({
      requestFetch: async (input, init) => {
        calls += 1;
        assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
        const body = JSON.parse(String(init?.body)) as {
          messages: { role: string; content: string }[];
          response_format: { json_schema: { strict: boolean; schema: unknown; name: string } };
          temperature: number;
          store: boolean;
        };
        assert.equal(body.messages[0]?.role, "system");
        assert.ok(body.messages[0]?.content.startsWith(TEACHER_INSTRUCTIONS));
        assert.deepEqual(JSON.parse(body.messages[1]?.content ?? "{}"), {
          itens: [{ id: 1, texto: "Recarga de extintores" }, { id: 2, texto: "Aquisição de pneus" }, { id: 3, texto: "Compra de café" }],
        });
        assert.equal(body.response_format.json_schema.strict, true);
        assert.equal(body.response_format.json_schema.name, "title_teacher_v1");
        assert.deepEqual(body.response_format.json_schema.schema, OPENAI_TEACHER_SCHEMA);
        assert.equal(body.temperature, 0.1);
        assert.equal(body.store, false);
        return new Response(JSON.stringify({
          model: "gpt-4o-mini-2024-07-18",
          choices: [{ message: { content: JSON.stringify({ itens: [
            { id: 1, titulo: "Recarga de extintores", categorias: ["Segurança, vigilância e prevenção de incêndio"] },
            { id: 2, titulo: "Aquisição de pneus", categorias: ["Veículos, peças e manutenção"] },
            { id: 3, titulo: "Aquisição de café", categorias: ["Alimentação"] },
          ] }) } }],
          usage: { prompt_tokens: 1_001, completion_tokens: 98 },
        }), { status: 200 });
      },
    });
    assert.equal(teacher.provider, "openai");
    const run = await runTeacher(["Recarga de extintores", "Aquisição de pneus", "Compra de café"], teacher);
    assert.equal(calls, 1);
    assert.equal(run.model, "gpt-4o-mini-2024-07-18");
    assert.deepEqual(run.results.map(({ categories }) => categories[0]), ["seguranca-incendio", "veiculos-pecas", "alimentacao"]);
    assert.deepEqual(run.usage.map((usage) => [usage?.inputTokens, usage?.outputTokens]), [[334, 33], [334, 33], [333, 32]]);
    const cost = run.usage.reduce((sum, usage) => sum + (usage?.costUsd ?? 0), 0);
    assert.ok(Math.abs(cost - (1_001 * 0.15 + 98 * 0.6) / 1_000_000) < 1e-12);
  } finally {
    process.env = saved;
  }
});

test("o schema estrito da OpenAI fecha todos os objetos", async () => {
  const { OPENAI_TEACHER_SCHEMA } = await import("./teacher");
  assert.equal(OPENAI_TEACHER_SCHEMA.additionalProperties, false);
  assert.equal(OPENAI_TEACHER_SCHEMA.properties.itens.items.additionalProperties, false);
  assert.deepEqual([...OPENAI_TEACHER_SCHEMA.properties.itens.items.required], ["id", "titulo", "categorias"]);
  assert.equal(OPENAI_TEACHER_SCHEMA.properties.itens.items.properties.categorias.items.enum.length, 29);
});

test("o modelo local não gera custo", async () => {
  const client = createOllamaClient({
    fetch: async () => new Response(JSON.stringify({ response: '{"itens":[{"id":1,"titulo":"Aquisição de café","categorias":[]}]}' })),
  });
  const run = await runTeacher(["Aquisição de café"], client);
  assert.deepEqual(run.usage, [null]);
});
