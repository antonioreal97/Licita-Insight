import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SUSPECT_VALUE_NOTE, SUSPECT_VALUE_TEXT, suspectValueHint, suspectValueReason } from '../lib/estimated-value-flag';
import { ValueDisplay } from './value-display';

const render = (props: Parameters<typeof ValueDisplay>[0]) => renderToStaticMarkup(createElement(ValueDisplay, props));
const text = (markup: string) => markup.replaceAll(/<[^>]+>/g, '').replaceAll('&nbsp;', ' ').replaceAll(/\s+/g, ' ');

const VEST = 938_761_000_000;

test('sem flag, mostra só o valor, como antes', () => {
  for (const flag of [undefined, null]) {
    const markup = render({ value: 48_500, status: 'disclosed', flag });
    assert.match(text(markup), /R\$ 48\.500/);
    assert.doesNotMatch(markup, /parece incorreto|value-suspect/);
    assert.match(markup, /font-semibold/);
  }
});

test('no card, o valor oficial continua visível com o aviso e o motivo no tooltip', () => {
  const markup = render({ value: VEST, status: 'disclosed', flag: 'absolute_ceiling' });
  assert.match(text(markup), /R\$ 938\.761\.000\.000/);
  assert.match(markup, /data-testid="value-suspect"/);
  assert.match(markup, /data-flag="absolute_ceiling"/);
  assert.ok(text(markup).includes(SUSPECT_VALUE_TEXT));
  assert.ok(markup.includes(`title="${suspectValueHint('absolute_ceiling')}"`), 'the reason is the tooltip');
  assert.match(markup, /class="sr-only">\. Passa de R\$ 100 bilhões/, 'and is read out by screen readers');
  assert.match(markup, /text-warning/);
  assert.doesNotMatch(markup, /font-semibold/, 'a doubtful value loses its emphasis');
});

test('na tabela, o aviso é só o ícone, com o texto para leitores de tela e no tooltip', () => {
  const markup = render({ value: VEST, flag: 'modality_outlier', flagVariant: 'icon' });
  assert.match(text(markup), /R\$ 938\.761\.000\.000/);
  assert.ok(markup.includes(`title="${SUSPECT_VALUE_TEXT}. ${suspectValueHint('modality_outlier')}"`));
  assert.match(markup, new RegExp(`class="sr-only">[^<]*${SUSPECT_VALUE_TEXT}`));
  assert.doesNotMatch(markup, /max-w-44/);
});

test('na ficha, o motivo e o efeito aparecem escritos', () => {
  const markup = render({ value: 126_000_000, flag: 'dispensa_legal_limit', flagVariant: 'explained' });
  const visible = text(markup.replaceAll(/<span class="sr-only">.*?<\/span>/g, ''));
  assert.ok(visible.includes(SUSPECT_VALUE_TEXT));
  assert.ok(visible.includes(suspectValueReason('dispensa_legal_limit')));
  assert.ok(visible.includes(SUSPECT_VALUE_NOTE));
  assert.doesNotMatch(markup, /title=/);
});

test('cada motivo tem um texto próprio, e um motivo desconhecido ainda explica o efeito', () => {
  const reasons = (['absolute_ceiling', 'dispensa_legal_limit', 'modality_outlier'] as const).map(suspectValueReason);
  assert.equal(new Set(reasons).size, 3);
  assert.ok(reasons.every((reason) => reason.length > 20));
  assert.equal(suspectValueHint('novo_motivo' as never), SUSPECT_VALUE_NOTE);
});

test('valor ausente ignora o flag e mantém o estado "Sigiloso" ou "Não informado"', () => {
  const markup = render({ value: null, status: 'confidential', flag: 'absolute_ceiling' });
  assert.match(markup, /Sigiloso/);
  assert.doesNotMatch(markup, /parece incorreto/);
});
