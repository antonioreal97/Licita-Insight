import assert from "node:assert/strict";
import test from "node:test";
import { CategoryStudent, normalizeVector, studentConfig } from "./student";

const example = (textHash: string, embedding: number[], categories: string[]) => ({ textHash, embedding, categories });

test("configuração padrão usa sete vizinhos e limiar calibrado em 0,42", () => {
  const previousK = process.env.CATEGORY_STUDENT_K;
  const previousConfidence = process.env.CATEGORY_STUDENT_MIN_CONFIDENCE;
  try {
    delete process.env.CATEGORY_STUDENT_K;
    delete process.env.CATEGORY_STUDENT_MIN_CONFIDENCE;
    assert.deepEqual(studentConfig(), { k: 7, minConfidence: 0.42 });
  } finally {
    if (previousK === undefined) delete process.env.CATEGORY_STUDENT_K;
    else process.env.CATEGORY_STUDENT_K = previousK;
    if (previousConfidence === undefined) delete process.env.CATEGORY_STUDENT_MIN_CONFIDENCE;
    else process.env.CATEGORY_STUDENT_MIN_CONFIDENCE = previousConfidence;
  }
});

test("normaliza vetores para norma 1 e recusa vetor nulo", () => {
  const vector = normalizeVector([3, 4]);
  assert.ok(vector instanceof Float32Array);
  assert.ok(Math.abs(vector[0] - 0.6) < 1e-6 && Math.abs(vector[1] - 0.8) < 1e-6);
  assert.throws(() => normalizeVector([0, 0]));
});

test("a escala do vetor não muda o voto (cosseno)", () => {
  const student = new CategoryStudent([
    example("a", [100, 0], ["alimentacao"]),
    example("b", [0, 0.001], ["ti-telecom"]),
  ], { k: 1, minConfidence: 0 });
  assert.deepEqual(student.classify([0.9, 0.1]).categories, ["alimentacao"]);
  assert.deepEqual(student.classify([1, 50]).categories, ["ti-telecom"]);
});

test("voto ponderado pela similaridade entre os k vizinhos", () => {
  const student = new CategoryStudent([
    example("a", [1, 0], ["alimentacao"]),
    example("b", [0.2, 1], ["ti-telecom"]),
    example("c", [0.3, 1], ["ti-telecom"]),
    example("d", [-1, 0], ["outros"]),
  ], { k: 3, minConfidence: 0 });
  const prediction = student.classify([1, 0.05]);
  // a ≈ 0.999; b e c ≈ 0.24 e 0.33: alimentação vence apesar de ter um vizinho só.
  assert.equal(prediction.primary, "alimentacao");
  assert.equal(prediction.neighbours, 3);
  assert.ok(prediction.confidence > 0.6 && prediction.confidence < 0.7);
  assert.deepEqual(prediction.categories, ["alimentacao"]);
});

test("a segunda categoria entra só com 60% do peso da primeira", () => {
  // 3 contra 2 vizinhos quase idênticos: 2/3 ≥ 0,6.
  const near = new CategoryStudent([
    example("a", [1, 0], ["veiculos-pecas"]),
    example("b", [1, 0.01], ["veiculos-pecas"]),
    example("c", [1, 0.02], ["veiculos-pecas"]),
    example("d", [1, 0.03], ["seguros-financeiros"]),
    example("e", [1, 0.04], ["seguros-financeiros"]),
  ], { k: 5, minConfidence: 0 });
  assert.deepEqual(near.classify([1, 0]).categories, ["veiculos-pecas", "seguros-financeiros"]);

  // 2 contra 1: 1/2 < 0,6.
  const far = new CategoryStudent([
    example("a", [1, 0], ["veiculos-pecas"]),
    example("b", [1, 0.01], ["veiculos-pecas"]),
    example("c", [1, 0.02], ["seguros-financeiros"]),
  ], { k: 3, minConfidence: 0 });
  assert.deepEqual(far.classify([1, 0]).categories, ["veiculos-pecas"]);

  // A categoria secundária de um vizinho vale metade da similaridade dele.
  const secondary = new CategoryStudent([
    example("a", [1, 0], ["limpeza-higiene", "saneamento-agua"]),
    example("b", [1, 0.01], ["limpeza-higiene", "saneamento-agua"]),
  ], { k: 2, minConfidence: 0 });
  const prediction = secondary.classify([1, 0]);
  assert.deepEqual(prediction.categories, ["limpeza-higiene"]);
  assert.ok(Math.abs(prediction.confidence - 1) < 1e-6);
});

test("abaixo do limiar não devolve categoria, mas grava a confiança", () => {
  const student = new CategoryStudent([
    example("a", [1, 0], ["alimentacao"]),
    example("b", [1, 0.01], ["ti-telecom"]),
    example("c", [1, 0.02], ["outros"]),
  ], { k: 3, minConfidence: 0.45 });
  const prediction = student.classify([1, 0]);
  assert.deepEqual(prediction.categories, []);
  assert.ok(prediction.confidence > 0.3 && prediction.confidence < 0.45);
  assert.equal(prediction.primary, "alimentacao");
});

test("ignora exemplos sem categoria, de outra dimensão e os hashes excluídos", () => {
  const student = new CategoryStudent([
    example("a", [1, 0], ["alimentacao"]),
    example("b", [1, 0], []),
    example("c", [1, 0, 0], ["outros"]),
    example("d", [0.9, 0.1], ["ti-telecom"]),
  ], { k: 1, minConfidence: 0 });
  assert.equal(student.size, 2);
  assert.deepEqual(student.classify([1, 0]).categories, ["alimentacao"]);
  assert.deepEqual(student.classify([1, 0], { excludeHashes: new Set(["a"]) }).categories, ["ti-telecom"]);
  assert.deepEqual(student.classify([1, 0, 0]).categories, []);
  assert.equal(new CategoryStudent([], { k: 7, minConfidence: 0.45 }).classify([1]).primary, null);
});
