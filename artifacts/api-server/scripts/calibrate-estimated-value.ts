import {
  ABSOLUTE_CEILING,
  assessEstimatedValue,
  DISPENSA_LEGAL_LIMIT,
  DISPENSA_LEGAL_LIMIT_FACTOR,
  MODALITY_OUTLIER_FACTOR,
  MODALITY_P99,
} from "../src/domain/estimated-value-plausibility";
import { quantile, syntheticOpenTenders, type SampleTender } from "../src/domain/estimated-value-sample";

// Prints how the plausibility limits behave on the synthetic sample. No database: nothing here is real data.
const brl = (value: number | null): string =>
  value === null
    ? "—"
    : value >= 1e9
      ? `R$ ${(value / 1e9).toFixed(2)} bi`
      : value >= 1e6
        ? `R$ ${(value / 1e6).toFixed(2)} mi`
        : `R$ ${(value / 1e3).toFixed(1)} mil`;

const sample = syntheticOpenTenders();
const values = sample.map(({ value }) => value);
console.log(`Amostra sintética: ${sample.length} editais abertos com valor`);
console.log(
  `  mediana ${brl(quantile(values, 0.5))} · p99 ${brl(quantile(values, 0.99))} · p99,9 ${brl(quantile(values, 0.999))} · p99,99 ${brl(quantile(values, 0.9999))}`,
);

console.log("\nLimites");
console.log(`  teto absoluto: ${brl(ABSOLUTE_CEILING)}`);
console.log(
  `  dispensa por valor (art. 75, I/II): ${DISPENSA_LEGAL_LIMIT_FACTOR} × ${brl(DISPENSA_LEGAL_LIMIT)} = ${brl(DISPENSA_LEGAL_LIMIT * DISPENSA_LEGAL_LIMIT_FACTOR)}`,
);
for (const modality of [...new Set(sample.map((tender) => tender.modality))]) {
  const ofModality = sample.filter((tender) => tender.modality === modality).map(({ value }) => value);
  const reference = MODALITY_P99[modality];
  console.log(
    `  ${modality.padEnd(24)} n=${String(ofModality.length).padStart(6)} p99 amostra ${brl(quantile(ofModality, 0.99)).padStart(12)} · máx ${brl(quantile(ofModality, 1)).padStart(12)} · ` +
      (reference === undefined
        ? "sem limite por modalidade (só o teto absoluto)"
        : `p99 ref ${brl(reference)} × ${MODALITY_OUTLIER_FACTOR} = ${brl(reference * MODALITY_OUTLIER_FACTOR)}`),
  );
}

const flagged = (tenders: readonly SampleTender[]) => tenders.filter((tender) => assessEstimatedValue(tender) !== null);
console.log(`\nFalsos positivos na amostra legítima: ${flagged(sample).length} de ${sample.length}`);
for (const factor of [100, 1_000, 1_000_000]) {
  const wrong = sample.map((tender) => ({ ...tender, value: tender.value * factor }));
  const caught = flagged(wrong);
  const share = (part: number, whole: number) => `${((100 * part) / whole).toFixed(2)}%`;
  const sum = (tenders: readonly SampleTender[]) => tenders.reduce((total, { value }) => total + value, 0);
  console.log(
    `  erro de ×${factor.toLocaleString("pt-BR")}: ${share(caught.length, wrong.length)} dos editais marcados, ${share(sum(caught), sum(wrong))} do valor errado retirado das somas`,
  );
}

console.log("\nCasos citados");
const cases: Array<[string, SampleTender]> = [
  ["dispensa de colete balístico, R$ 938,761 bi", { modality: "dispensa", value: 938_761_000_000, legalBasis: "Lei 14.133/2021, Art. 75, II" }],
  ["concessão por concorrência, R$ 24 bi", { modality: "concorrencia", value: 24_000_000_000, legalBasis: null }],
  ["dispensa emergencial, R$ 12 mi", { modality: "dispensa", value: 12_000_000, legalBasis: "Lei 14.133/2021, Art. 75, VIII" }],
  ["inexigibilidade de vale-transporte, R$ 10,7 bi", { modality: "inexigibilidade", value: 10_700_000_000, legalBasis: null }],
  ["pregão de capina, R$ 5,25 bi", { modality: "pregao_eletronico", value: 5_250_000_000, legalBasis: null }],
  ["pregão de cimento, R$ 4,2 bi", { modality: "pregao_eletronico", value: 4_200_000_000, legalBasis: null }],
];
for (const [label, tender] of cases) console.log(`  ${label}: ${assessEstimatedValue(tender) ?? "não suspeito"}`);

// Alagoas: about 1.1% of the open tenders of the country, plus the one vest purchase.
const alagoas = [...syntheticOpenTenders(1_150, 27), cases[0]![1]];
const total = (tenders: readonly SampleTender[]) => tenders.reduce((sum, { value }) => sum + value, 0);
const kept = alagoas.filter((tender) => assessEstimatedValue(tender) === null);
console.log(`\nSimulação de Alagoas (${alagoas.length} editais abertos sintéticos)`);
console.log(`  antes:  ${brl(total(alagoas))} em ${alagoas.length} editais`);
console.log(`  depois: ${brl(total(kept))} somados; ${alagoas.length} editais contados, ${alagoas.length - kept.length} fora da soma`);
