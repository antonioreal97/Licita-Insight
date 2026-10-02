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
