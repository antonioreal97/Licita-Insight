import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Reads the real src/index.css (Gelo on :root, Petróleo on .dark), resolves var() and color-mix(in srgb …),
// and checks the WCAG contrast of every text/graphic pair the app uses. The test names are the report.

type Theme = 'gelo' | 'petroleo';
type Rgba = { r: number; g: number; b: number; a: number };

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Map<string, string> {
  const body = css.match(new RegExp(`^${selector} \\{([\\s\\S]*?)^\\}`, 'm'))?.[1];
  assert.ok(body, `bloco ${selector} não encontrado em index.css`);
  return new Map([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const root = block(':root');
const dark = block('\\.dark');

function declared(name: string, theme: Theme): string {
  const value = (theme === 'petroleo' && dark.get(name)) || root.get(name);
  assert.ok(value, `--${name} não está declarado`);
  return value;
}

function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '(') depth++;
    else if (args[i] === ')') depth--;
    else if (args[i] === ',' && depth === 0) {
      parts.push(args.slice(start, i).trim());
      start = i + 1;
    }
  }
  return [...parts, args.slice(start).trim()];
}

function color(expr: string, theme: Theme): Rgba {
  const hex = expr.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (hex) return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
  const ref = expr.match(/^var\(--([\w-]+)\)$/)?.[1];
  if (ref) return color(declared(ref, theme), theme);
  const mix = expr.match(/^color-mix\((.*)\)$/)?.[1];
  if (mix) {
    const [space, first, second] = splitArgs(mix);
    assert.equal(space, 'in srgb', `espaço de cor inesperado em ${expr}`);
    const [, a, pct] = first.match(/^(.*\S)\s+([\d.]+)%$/) ?? [];
    assert.ok(a && pct, `color-mix sem porcentagem: ${expr}`);
    const p = Number(pct) / 100;
    const top = color(a, theme);
    if (second === 'transparent') return { ...top, a: p };
    return over({ ...top, a: p }, color(second, theme));
  }
  throw new Error(`Valor de cor não suportado: ${expr}`);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mixChannel = (t: number, b: number) => t * top.a + b * (1 - top.a);
  return { r: mixChannel(top.r, bottom.r), g: mixChannel(top.g, bottom.g), b: mixChannel(top.b, bottom.b), a: 1 };
}

/** `layers` from bottom to top, e.g. ['card', 'muted'] = muted painted over a card. */
function paint(layers: string[], theme: Theme): Rgba {
  return layers.map((name) => color(`var(--${name})`, theme)).reduce((bottom, top) => over(top, bottom));
}

function luminance({ r, g, b }: Rgba): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(fg: string, bg: string[], theme: Theme): number {
  const back = paint(bg, theme);
  const front = over(color(`var(--${fg})`, theme), back);
  const [hi, lo] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = 4.5;
const GRAPHIC = 3;

// [foreground, background layers, minimum]. Text pairs need 4.5:1, focus rings, field edges and icons 3:1.
const pairs: [string, string[], number][] = [
  ['texto', ['fundo'], TEXT],
  ['texto', ['fundo-alt'], TEXT],
  ['texto-sobre-destaque', ['destaque'], TEXT],
  ['texto-inverso', ['superficie-inversa'], TEXT],
  ['foreground', ['background'], TEXT],
  ['foreground', ['card'], TEXT],
  ['muted-foreground', ['background'], TEXT],
  ['muted-foreground', ['card'], TEXT],
  ['muted-foreground', ['card', 'muted'], TEXT],
  ['primary', ['background'], TEXT],
  ['primary', ['card'], TEXT],
  ['primary-foreground', ['primary'], TEXT],
  ['primary-subtle-foreground', ['primary-subtle'], TEXT],
  ['action-foreground', ['action'], TEXT],
  ['action-foreground', ['action-hover'], TEXT],
  ['inverse-foreground', ['inverse'], TEXT],
  ['accent-foreground', ['accent'], TEXT],
  ['secondary-foreground', ['secondary'], TEXT],
  ['muted-foreground', ['surface'], TEXT],
  ['primary-foreground', ['primary-hover'], TEXT],
  ['destructive', ['background'], TEXT],
  ['destructive', ['card'], TEXT],
  ['destructive-foreground', ['destructive'], TEXT],
  ['destructive-subtle-foreground', ['destructive-subtle'], TEXT],
  ['warning-subtle-foreground', ['warning-subtle'], TEXT],
  ['status-open-foreground', ['status-open'], TEXT],
  ['status-under-review-foreground', ['status-under-review'], TEXT],
  ['status-closed-foreground', ['status-closed'], TEXT],
  ['status-suspended-foreground', ['status-suspended'], TEXT],
  ['status-cancelled-foreground', ['card', 'status-cancelled'], TEXT],
  ['status-direct-foreground', ['status-direct'], TEXT],
  ['sidebar-foreground', ['sidebar'], TEXT],
  ['sidebar-muted-foreground', ['sidebar'], TEXT],
  ['sidebar-primary-foreground', ['sidebar-primary'], TEXT],
  ['hero-highlight', ['background'], TEXT],
  ['ring', ['background'], GRAPHIC],
  ['ring', ['card'], GRAPHIC],
  ['input', ['background'], GRAPHIC],
  ['input', ['card'], GRAPHIC],
  ['warning', ['background'], GRAPHIC],
  ['warning', ['card'], GRAPHIC],
  ['foreground-subtle', ['background'], GRAPHIC],
  ['foreground-subtle', ['card'], GRAPHIC],
  ['marca', ['fundo'], GRAPHIC],
  ['marca', ['sidebar'], GRAPHIC],
];

for (const theme of ['gelo', 'petroleo'] as const) {
  for (const [fg, bg, min] of pairs) {
    const value = ratio(fg, bg, theme);
    test(`${theme}: --${fg} sobre ${bg.map((b) => `--${b}`).join(' + ')} = ${value.toFixed(2)}:1 (mín. ${min}:1)`, () => {
      assert.ok(value >= min, `${value.toFixed(2)}:1 < ${min}:1`);
    });
  }
}

// The choropleth scale encodes volume by lightness alone, so it must keep one direction from the page to the
// strongest step. Without that, the top band could look like the empty one in grayscale or to colorblind readers.
for (const theme of ['gelo', 'petroleo'] as const) {
  test(`${theme}: escala do mapa (--mapa-1 a --mapa-5) se afasta do fundo a cada degrau`, () => {
    const page = luminance(paint(['fundo'], theme));
    const distance = [1, 2, 3, 4, 5].map((step) => {
      const fill = luminance(paint([`mapa-${step}`], theme));
      const [hi, lo] = [fill, page].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    });
    for (let i = 1; i < distance.length; i += 1) {
      assert.ok(distance[i] > distance[i - 1] * 1.3, `degrau ${i + 1} pouco distinto do ${i}: ${distance.map((d) => d.toFixed(2)).join(' < ')}`);
    }
    assert.ok(distance[0] >= 1.3, `primeiro degrau some no fundo: ${distance[0].toFixed(2)}:1`);
    assert.ok(distance[4] >= GRAPHIC, `degrau mais forte abaixo de ${GRAPHIC}:1 sobre o fundo`);
  });
}

test('paleta do index.css igual a styles/tokens.json', () => {
  const tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8')) as {
    color: { tokens: { name: string; value: string | Record<string, string> }[] };
  };
  for (const { name, value } of tokens.color.tokens) {
    const expected = typeof value === 'string' ? { gelo: value, petroleo: value } : { gelo: value.light, petroleo: value.dark };
    for (const theme of ['gelo', 'petroleo'] as const) {
      const css = declared(name, theme);
      const want = expected[theme].replace(/^\{(.*)\}$/, 'var(--$1)');
      assert.equal(css.toLowerCase(), want.toLowerCase(), `--${name} (${theme})`);
    }
  }
});
