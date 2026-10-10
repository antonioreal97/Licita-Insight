import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ESTIMATED_VALUE_REVIEW_FLOOR } from "@workspace/db/schema";
import {
  ABSOLUTE_CEILING,
  assessEstimatedValue,
  estimatedValueLimits,
  isDispensaByValue,
  lowestEstimatedValueLimit,
  MODALITY_P99,
} from "./estimated-value-plausibility";
import { quantile, syntheticOpenTenders } from "./estimated-value-sample";

const BY_VALUE = "Lei 14.133/2021, Art. 75, II";
const EMERGENCY = "Lei 14.133/2021, Art. 75, VIII";

describe("assessEstimatedValue", () => {
  it("flags the R$ 938 billion dispensa for ballistic vests, whatever its legal basis", () => {
    for (const legalBasis of [BY_VALUE, EMERGENCY, null, undefined]) {
      assert.equal(
        assessEstimatedValue({ value: 938_761_000_000, modality: "dispensa", legalBasis }),
        "absolute_ceiling",
      );
    }
    assert.equal(
      assessEstimatedValue({ value: "938761000000.00", modality: "dispensa" }),
      "absolute_ceiling",
      "the numeric column arrives as text",
    );
  });

  it("does not flag a R$ 24 billion concession, in any modality a concession is published under", () => {
    for (const modality of ["concorrencia", "concorrencia_eletronica", "dialogo_competitivo", "leilao", "other"]) {
      assert.equal(assessEstimatedValue({ value: 24_000_000_000, modality }), null, modality);
      assert.equal(assessEstimatedValue({ value: ABSOLUTE_CEILING, modality }), null, "the ceiling itself is allowed");
      assert.equal(assessEstimatedValue({ value: ABSOLUTE_CEILING + 0.01, modality }), "absolute_ceiling");
    }
  });

  it("does not flag an emergency dispensa of moderate value, nor a large one", () => {
    for (const value of [800_000, 12_000_000, 90_000_000, 300_000_000, 1_000_000_000]) {
      assert.equal(assessEstimatedValue({ value, modality: "dispensa", legalBasis: EMERGENCY }), null, String(value));
      assert.equal(assessEstimatedValue({ value, modality: "dispensa", legalBasis: null }), null, String(value));
    }
    assert.equal(
      assessEstimatedValue({ value: 1_500_000_000, modality: "dispensa", legalBasis: EMERGENCY }),
      "modality_outlier",
    );
  });

  it("flags a dispensa by value only a thousand times above its legal limit", () => {
    // Above the legal limit, but bodies do that: consortia, multi-year contracts, the wrong ground in the form.
    for (const value of [130_000, 2_000_000, 125_000_000]) {
      assert.equal(assessEstimatedValue({ value, modality: "dispensa", legalBasis: BY_VALUE }), null, String(value));
    }
    assert.equal(
      assessEstimatedValue({ value: 126_000_000, modality: "dispensa", legalBasis: BY_VALUE }),
      "dispensa_legal_limit",
    );
    assert.equal(
      assessEstimatedValue({ value: 126_000_000, modality: "pregao_eletronico", legalBasis: BY_VALUE }),
      null,
      "the legal limit belongs to the dispensa",
    );
  });

  it("reads the ground by value from the legal basis text", () => {
    for (const text of [
      "Lei 14.133/2021, Art. 75, I",
      "Lei 14.133/2021, Art. 75, II",
      "lei 14133/2021 art 75 inciso II",
      "Lei nº 14.133/2021, art. 75, I - obras e serviços de engenharia",
    ]) {
      assert.equal(isDispensaByValue(text), true, text);
    }
    for (const text of [
      "Lei 14.133/2021, Art. 75, III, a",
      "Lei 14.133/2021, Art. 75, IV, c",
      "Lei 14.133/2021, Art. 75, VIII",
      "Lei 14.133/2021, Art. 75, IX",
      "Lei 14.133/2021, Art. 74, II",
      "Lei 13.303/2016, Art. 29, II",
      "",
      null,
      undefined,
    ]) {
      assert.equal(isDispensaByValue(text), false, String(text));
    }
  });

  it("flags a modality outlier and leaves the suspects it cannot tell apart", () => {
    // Bus passes by "inexigibilidade" for R$ 10.7 billion: more than a thousand times the p99 of the modality.
    assert.equal(assessEstimatedValue({ value: 10_700_000_000, modality: "inexigibilidade" }), "modality_outlier");
    assert.equal(assessEstimatedValue({ value: 900_000_000, modality: "inexigibilidade" }), null);
    // Accepted misses: by modality alone they look like a national price registration of the same size.
    assert.equal(assessEstimatedValue({ value: 5_250_000_000, modality: "pregao_eletronico" }), null);
    assert.equal(assessEstimatedValue({ value: 4_200_000_000, modality: "pregao_eletronico" }), null);
    assert.equal(assessEstimatedValue({ value: 81_000_000_000, modality: "pregao_eletronico" }), "modality_outlier");
  });

  it("never flags an absent, zero, negative or unreadable value, nor an unknown modality below the ceiling", () => {
    for (const value of [null, "", 0, -5, Number.NaN, Number.POSITIVE_INFINITY, "abc"]) {
      assert.equal(assessEstimatedValue({ value, modality: "dispensa" }), null, String(value));
    }
    assert.equal(assessEstimatedValue({ value: 50_000_000_000, modality: "modalidade_nova" }), null);
    assert.equal(assessEstimatedValue({ value: 150_000_000_000, modality: "modalidade_nova" }), "absolute_ceiling");
  });

  it("lists the limits strongest claim first, so the reason shown is the strongest one that applies", () => {
    assert.deepEqual(
      estimatedValueLimits("dispensa", BY_VALUE).map(({ flag }) => flag),
      ["absolute_ceiling", "dispensa_legal_limit", "modality_outlier"],
    );
    assert.deepEqual(estimatedValueLimits("concorrencia").map(({ flag }) => flag), ["absolute_ceiling"]);
  });

  it("keeps every limit at or above the floor the review job and its index read from", () => {
    assert.ok(lowestEstimatedValueLimit() >= ESTIMATED_VALUE_REVIEW_FLOOR);
  });
});

describe("limits against the synthetic sample", () => {
  const sample = syntheticOpenTenders();
  const values = sample.map(({ value }) => value);

  it("reproduces the quantiles measured on the open tenders", () => {
    const within = (q: number, low: number, high: number) => {
      const value = quantile(values, q)!;
      assert.ok(value >= low && value <= high, `q${q} = ${value}`);
    };
    within(0.5, 8_000, 16_000);
    within(0.99, 28_000_000, 56_000_000);
    within(0.999, 270_000_000, 540_000_000);
    within(0.9999, 1_500_000_000, 3_300_000_000);
  });

  it("uses reference percentiles that match the sample, modality by modality", () => {
    for (const [modality, reference] of Object.entries(MODALITY_P99)) {
      const p99 = quantile(sample.filter((tender) => tender.modality === modality).map(({ value }) => value), 0.99)!;
      assert.ok(p99 > reference * 0.8 && p99 < reference * 1.25, `${modality}: p99 ${p99} vs ${reference}`);
    }
  });

  it("flags none of the 200,000 legitimate tenders", () => {
    assert.equal(sample.length, 200_000);
    assert.deepEqual(sample.filter((tender) => assessEstimatedValue(tender) !== null), []);
  });

  it("catches most typing errors of six orders of magnitude; smaller ones only where they weigh on a sum", () => {
    const flaggedWhenMultipliedBy = (factor: number) =>
      sample.filter(({ value, modality, legalBasis }) =>
        assessEstimatedValue({ value: value * factor, modality, legalBasis }) !== null).length / sample.length;
    const millionfold = flaggedWhenMultipliedBy(1_000_000);
    const thousandfold = flaggedWhenMultipliedBy(1_000);
    assert.ok(millionfold > 0.5, `millionfold = ${millionfold}`);
    // A thousandfold error on a R$ 5 thousand purchase still looks like an ordinary tender, and adds little to a sum.
    assert.ok(thousandfold > 0 && thousandfold < 0.05, `thousandfold = ${thousandfold}`);
  });

  it("brings the Alagoas sum back from R$ 939 billion to its real size", () => {
    // 1,150 synthetic open tenders in the state plus the one vest purchase.
    const alagoas = [
      ...syntheticOpenTenders(1_150, 27),
      { modality: "dispensa" as const, value: 938_761_000_000, legalBasis: BY_VALUE },
    ];
    const sum = (tenders: typeof alagoas) => tenders.reduce((total, { value }) => total + value, 0);
    const before = sum(alagoas);
    const after = sum(alagoas.filter((tender) => assessEstimatedValue(tender) === null));
    assert.ok(before > 938_761_000_000);
    assert.ok(after < 5_000_000_000, `after = ${after}`);
    assert.equal(Math.round(before - after), 938_761_000_000);
  });
});
