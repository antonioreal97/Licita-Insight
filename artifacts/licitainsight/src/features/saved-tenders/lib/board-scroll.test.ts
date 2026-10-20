import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { focusInRegion, regionScrollLeft, revealInRegion, windowScrollTop, type ScrollRegion } from './board-scroll';

const box = (left: number, right: number, top = 100, bottom = 200) => ({ left, right, top, bottom });

/** A region 1112 px wide starting at x = 288, as on a 1440 px screen with the sidebar open. */
function fakeRegion(scrollLeft = 0) {
  const calls: { left: number; behavior?: ScrollBehavior }[] = [];
  const region: ScrollRegion = {
    scrollLeft,
    clientWidth: 1112,
    getBoundingClientRect: () => box(288, 1400),
    scrollTo: (options) => {
      calls.push(options);
      region.scrollLeft = options.left;
    },
  };
  return { region, calls };
}

test('“Ir para a etapa” alinha a coluna à esquerda da região, contando o respiro', () => {
  // Última coluna em x = 1488 na tela, com a região ainda em 0.
  assert.equal(regionScrollLeft({ scrollLeft: 0, clientWidth: 1112, left: 288 }, box(1488, 1712), 'start', 4), 1196);
  assert.equal(regionScrollLeft({ scrollLeft: 900, clientWidth: 1112, left: 288 }, box(-600, -376), 'start', 4), 8);
  assert.equal(regionScrollLeft({ scrollLeft: 50, clientWidth: 1112, left: 288 }, box(290, 500), 'start', 4), 48);
  assert.equal(regionScrollLeft({ scrollLeft: 0, clientWidth: 1112, left: 288 }, box(292, 500), 'start', 4), 0, 'nunca negativo');
});

test('foco no cartão move a região o mínimo, e nada quando ele já está visível', () => {
  const region = { scrollLeft: 0, clientWidth: 1112, left: 288 };
  assert.equal(regionScrollLeft(region, box(600, 870), 'nearest', 4), 0);
  assert.equal(regionScrollLeft(region, box(1200, 1470), 'nearest', 4), 74, 'aparece encostado na borda direita');
  assert.equal(regionScrollLeft({ ...region, scrollLeft: 400 }, box(200, 470), 'nearest', 4), 308, 'aparece encostado na borda esquerda');
});

test('rolagem vertical da janela respeita o cabeçalho fixo', () => {
  assert.equal(windowScrollTop(box(0, 0, 200, 500), 900, 76), 0);
  assert.equal(windowScrollTop(box(0, 0, 40, 300), 900, 76), -36);
  assert.equal(windowScrollTop(box(0, 0, 1000, 1300), 900, 76), 400);
  assert.equal(windowScrollTop(box(0, 0, 300, 1500), 900, 76), 224, 'cartão maior que a tela: mostra o topo');
});

test('revelar rola só a região na horizontal e a janela só na vertical', () => {
  const { region, calls } = fakeRegion();
  const vertical: { top: number }[] = [];
  revealInRegion(region, { getBoundingClientRect: () => box(1488, 1712, 1000, 1200) }, { innerHeight: 900, scrollBy: (options) => vertical.push(options) }, { align: 'start', behavior: 'smooth', inset: 4, topInset: 76 });
  assert.deepEqual(calls, [{ left: 1196, behavior: 'smooth' }]);
  assert.deepEqual(vertical, [{ top: 300, behavior: 'smooth' }]);
  // Already in view: no scroll call at all.
  const idle = fakeRegion();
  revealInRegion(idle.region, { getBoundingClientRect: () => box(600, 870) }, null, { align: 'nearest', inset: 4 });
  assert.deepEqual(idle.calls, []);
});

test('ao seguir um cartão, a coluna inteira entra na região; o cartão decide a rolagem vertical', () => {
  const { region, calls } = fakeRegion(1196);
  const vertical: { top: number }[] = [];
  // Card 12 px inside its column, which starts 8 px left of the region's visible area.
  const column = { getBoundingClientRect: () => box(280, 568, 354, 1300) };
  const card = { getBoundingClientRect: () => box(292, 556, 1100, 1290) };
  revealInRegion(region, card, { innerHeight: 900, scrollBy: (options) => vertical.push(options) }, { align: 'nearest', inset: 4, topInset: 76, column });
  assert.deepEqual(calls, [{ left: 1184, behavior: 'auto' }], 'a coluna aparece inteira, com o respiro');
  assert.deepEqual(vertical, [{ top: 390, behavior: 'auto' }], 'a janela rola até o cartão, não até o topo da coluna');
  // A column wider than the region falls back to the card.
  const narrow = fakeRegion(0);
  narrow.region.clientWidth = 200;
  revealInRegion(narrow.region, { getBoundingClientRect: () => box(300, 420) }, null, { align: 'nearest', inset: 4, column: { getBoundingClientRect: () => box(290, 700) } });
  assert.deepEqual(narrow.calls, []);
});

test('o foco é sempre dado com preventScroll, antes de mover a região', () => {
  const { region, calls } = fakeRegion();
  const order: string[] = [];
  const focus: unknown[] = [];
  region.scrollTo = (options) => {
    order.push('region');
    calls.push(options);
  };
  focusInRegion(region, { getBoundingClientRect: () => box(1488, 1712) }, { focus: (options) => (order.push('focus'), focus.push(options)) }, null, { align: 'nearest', inset: 4 });
  assert.deepEqual(focus, [{ preventScroll: true }]);
  assert.deepEqual(order, ['focus', 'region']);
});

test('o quadro não usa scrollIntoView nem focus() que role ancestrais', () => {
  const source = readFileSync(new URL('../components/pipeline-board.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /scrollIntoView/);
  for (const call of source.match(/\.focus\([^)]*\)/g) ?? []) assert.match(call, /preventScroll: true/, call);
});
