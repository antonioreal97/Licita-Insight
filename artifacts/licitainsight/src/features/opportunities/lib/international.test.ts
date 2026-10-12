import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { InternationalOpportunity, OpportunitySearchResponse } from '@/api';
import {
  amountLine,
  amountTexts,
  brazilEligibilityLabels,
  brazilFundingLabels,
  brazilProjectsPatch,
  deadlineTexts,
  eligibilityOptions,
  eligibilityPatch,
  facetOptions,
  OFFICIAL_NOTICE_PREVAILS,
  originalTitle,
  placeLabel,
  scopePatch,
  selectedEligibility,
} from './international';

const deadline = (value: Partial<InternationalOpportunity['deadline']>): InternationalOpportunity['deadline'] => ({
  at: null,
  precision: null,
  timeZone: null,
  original: null,
  ...value,
});

test('prazo sempre em horário de Brasília, com o original ao lado', () => {
  // Uganda: 11:00 em Kampala (GMT+3) são 05:00 em Brasília.
  assert.deepEqual(deadlineTexts(deadline({ at: '2026-10-27T08:00:00.000Z', precision: 'datetime', timeZone: 'Africa/Kampala', original: '2026-10-27 11:00' })), {
    brasilia: '27/10/2026 às 05:00 (horário de Brasília)',
    original: '27/10/2026 às 11:00 (GMT+3, Kampala)',
    note: null,
  });
  // Bruxelas no inverno: 14:00 (GMT+1) são 10:00 em Brasília.
  assert.deepEqual(deadlineTexts(deadline({ at: '2027-03-04T13:00:00.000Z', precision: 'datetime', timeZone: 'Europe/Brussels', original: '2027-03-04 14:00' })), {
    brasilia: '04/03/2027 às 10:00 (horário de Brasília)',
    original: '04/03/2027 às 14:00 (GMT+1, Bruxelas)',
    note: null,
  });
  // Prazo de madrugada no Pacífico cai no dia anterior em Brasília.
  assert.equal(
    deadlineTexts(deadline({ at: '2026-11-04T21:00:00.000Z', precision: 'datetime', timeZone: 'Pacific/Fiji', original: '2026-11-05 09:00' })).brasilia,
    '04/11/2026 às 18:00 (horário de Brasília)',
  );
});

test('hora sem fuso não é convertida: fica o dia e a hora como a fonte escreveu', () => {
  // Indonésia tem três fusos. O instante guardado (fim do dia em qualquer lugar do mundo) não é exibido.
  assert.deepEqual(deadlineTexts(deadline({ at: '2026-10-27T11:59:59.000Z', precision: 'date', timeZone: null, original: '2026-10-26 12:00' })), {
    brasilia: '26/10/2026',
    original: '26/10/2026 às 12:00, hora local do comprador',
    note: 'A fonte não informa o fuso: a hora não foi convertida para Brasília.',
  });
  // Tópico da UE ainda sem hora: o dia é o de Bruxelas.
  assert.deepEqual(deadlineTexts(deadline({ at: '2027-12-01T22:59:59.000Z', precision: 'date', timeZone: 'Europe/Brussels', original: '2027-12-01' })), {
    brasilia: '01/12/2027',
    original: '01/12/2027 (dia em Bruxelas)',
    note: 'A fonte ainda não informa a hora do encerramento.',
  });
  assert.deepEqual(deadlineTexts(deadline({})), { brasilia: 'Prazo não informado', original: null, note: null });
});

test('valor na moeda original com o aproximado em reais e a data da PTAX', () => {
  const texts = amountTexts({ amountOriginal: 3_430_000, currency: 'EUR', amountBrlApprox: 19_154_492, fxDate: '2026-10-09' })!;
  assert.equal(texts.quote, 'PTAX de 09/10/2026');
  assert.match(texts.original, /^€\s3,4\smi$/);
  assert.match(texts.approx!, /^≈ R\$\s19,2\smi$/);
  assert.match(amountLine(texts), /^€\s3,4\smi ≈ R\$\s19,2\smi \(PTAX de 09\/10\/2026\)$/);
  // Por extenso no detalhe.
  assert.match(amountTexts({ amountOriginal: 3_430_000, currency: 'EUR', amountBrlApprox: 19_154_492, fxDate: '2026-10-09' }, false)!.original, /^€\s3\.430\.000$/);
  // Moeda sem cotação PTAX: só o original, sem inventar conversão.
  const cfa = amountTexts({ amountOriginal: 50_000_000, currency: 'XOF', amountBrlApprox: null, fxDate: null })!;
  assert.equal(cfa.approx, null);
  assert.equal(cfa.quote, null);
  assert.equal(amountLine(cfa), cfa.original);
  assert.equal(amountTexts({ amountOriginal: null, currency: null, amountBrlApprox: null, fxDate: null }), null);
});

test('selos: "Aberto a brasileiros" e "Condicional", com participação e financiamento separados', () => {
  assert.equal(brazilEligibilityLabels.yes, 'Aberto a brasileiros');
  assert.equal(brazilEligibilityLabels.conditional, 'Condicional');
  assert.equal(brazilEligibilityLabels.no, 'Fechado a brasileiros');
  assert.equal(brazilEligibilityLabels.unknown, 'Elegibilidade a confirmar');
  assert.equal(brazilFundingLabels.no, 'Sem financiamento direto');
  assert.equal(brazilFundingLabels.yes, 'Financia participante do Brasil');
  assert.match(OFFICIAL_NOTICE_PREVAILS, /O edital oficial prevalece\.$/);
});

test('filtro de elegibilidade: padrão, um selo e "qualquer"', () => {
  assert.equal(selectedEligibility({ scope: 'international' }), '');
  assert.equal(selectedEligibility({ eligibility: ['no'] }), 'no');
  assert.equal(selectedEligibility({ eligibility: 'all' }), 'all');
  assert.deepEqual(eligibilityPatch('all'), { eligibility: 'all' });
  assert.deepEqual(eligibilityPatch('conditional'), { eligibility: ['conditional'] });
  assert.deepEqual(eligibilityPatch(''), { eligibility: undefined });
  assert.deepEqual(eligibilityPatch('talvez'), { eligibility: undefined });

  const facets = {
    eligibility: [
      { value: 'conditional', label: 'Condicional', count: 683 },
      { value: 'yes', label: 'Aberto a brasileiros', count: 126 },
    ],
  } as OpportunitySearchResponse['facets'];
  assert.deepEqual(
    eligibilityOptions(facets).map((option) => option.label),
    ['Aberto a brasileiros (126)', 'Condicional (683)', 'Fechado a brasileiros (0)', 'Elegibilidade a confirmar (0)'],
  );
  assert.equal(eligibilityOptions(null).length, 4);
});

test('opções de organismo, região, idioma e tipo vêm das facetas, com o valor escolhido sempre presente', () => {
  const options = facetOptions(
    [
      { value: 'União Europeia', label: 'União Europeia', count: 481 },
      { value: 'Banco Mundial', label: 'Banco Mundial', count: 654 },
    ],
    'BID',
  );
  assert.deepEqual(
    options.map((option) => [option.value, option.label]),
    [
      ['Banco Mundial', 'Banco Mundial (654)'],
      ['União Europeia', 'União Europeia (481)'],
      ['BID', 'BID (0)'],
    ],
  );
  assert.deepEqual(facetOptions(undefined), []);
});

test('trocar de aba mantém a busca e o prazo e limpa os filtros do outro lado', () => {
  const patch = scopePatch('international');
  assert.equal(patch.scope, 'international');
  for (const key of ['state', 'city', 'area', 'installation', 'includeIndividual', 'source', 'kind'] as const) {
    assert.ok(key in patch && patch[key] === undefined, key);
  }
  assert.ok(!('q' in patch));
  assert.ok(!('status' in patch));
  const back = scopePatch('national');
  assert.equal(back.scope, undefined);
  for (const key of ['agency', 'region', 'country', 'language', 'opportunityType', 'eligibility', 'funding'] as const) {
    assert.ok(key in back && back[key] === undefined, key);
  }
});

test('atalho "só projetos no Brasil", título original e local', () => {
  assert.deepEqual(brazilProjectsPatch({ scope: 'international' }), { country: ['BR'] });
  assert.deepEqual(brazilProjectsPatch({ scope: 'international', country: ['BR'] }), { country: undefined });
  assert.equal(originalTitle('Obras de reabilitação do cais', { titleOriginal: 'Works of rehabilitation of the quay' }), 'Works of rehabilitation of the quay');
  // Sem tradução, o título exibido já é o original: não se repete.
  assert.equal(originalTitle('Works of rehabilitation of the quay', { titleOriginal: 'Works of rehabilitation of the quay ' }), null);
  assert.equal(originalTitle('Edital', { titleOriginal: null }), null);
  assert.equal(placeLabel({ countryName: 'Uganda', regionName: 'África' }), 'Uganda');
  assert.equal(placeLabel({ countryName: null, regionName: 'Europa' }), 'Europa');
  assert.equal(placeLabel({ countryName: null, regionName: null }), 'Vários países');
});
