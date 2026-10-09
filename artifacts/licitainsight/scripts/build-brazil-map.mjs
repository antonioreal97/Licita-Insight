// Gera `src/features/landing/lib/brazil-uf-paths.ts` a partir da malha oficial do IBGE (domínio público).
//
//   node scripts/build-brazil-map.mjs                 # baixa do IBGE
//   node scripts/build-brazil-map.mjs malha.geojson   # usa um arquivo já baixado
//
// Fonte: API de malhas do IBGE v3, Brasil dividido por UF, já simplificada pelo IBGE (`qualidade=minima`).
// O script só projeta e arredonda: coordenadas inteiras em um quadro de 1000 unidades de largura e traçados
// relativos. Vértices de divisa são os mesmos nas duas UFs, então o arredondamento não abre frestas entre elas.
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE =
  'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF';
const OUTPUT = new URL('../src/features/landing/lib/brazil-uf-paths.ts', import.meta.url);

// Código da UF no IBGE → sigla.
const UF_BY_IBGE_CODE = {
  11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
  21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
  41: 'PR', 42: 'SC', 43: 'RS',
  50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF',
};

const WIDTH = 1000;
// UFs menores que isto em qualquer direção ganham um alvo de clique maior no mapa (na prática, o DF).
const SMALL_SIDE = 30;
// Paralelo padrão no meio do país: a projeção equirretangular quase não distorce nessa faixa de latitude.
const STANDARD_PARALLEL = -15;

const file = process.argv[2];
const geojson = JSON.parse(
  file ? await readFile(file, 'utf8') : await (await fetch(SOURCE, { signal: AbortSignal.timeout(60_000) })).text(),
);

const polygonsOf = ({ type, coordinates }) => {
  if (type === 'Polygon') return [coordinates];
  if (type === 'MultiPolygon') return coordinates;
  throw new Error(`Geometria inesperada: ${type}`);
};

const features = geojson.features.map((feature) => {
  const uf = UF_BY_IBGE_CODE[feature.properties.codarea];
  if (!uf) throw new Error(`UF desconhecida: ${JSON.stringify(feature.properties)}`);
  return { uf, rings: polygonsOf(feature.geometry).flat() };
});
if (features.length !== 27 || new Set(features.map(({ uf }) => uf)).size !== 27) {
  throw new Error(`Esperava 27 UFs distintas, vieram ${features.length}`);
}

const points = features.flatMap(({ rings }) => rings.flat());
const west = Math.min(...points.map(([lon]) => lon));
const east = Math.max(...points.map(([lon]) => lon));
const south = Math.min(...points.map(([, lat]) => lat));
const north = Math.max(...points.map(([, lat]) => lat));
const lonScale = Math.cos((STANDARD_PARALLEL * Math.PI) / 180);
const scale = WIDTH / ((east - west) * lonScale);
const height = Math.ceil((north - south) * scale);
const project = ([lon, lat]) => [Math.round((lon - west) * lonScale * scale), Math.round((north - lat) * scale)];

const ringPath = (ring) => {
  const projected = ring.map(project);
  let [x, y] = projected[0];
  let path = `M${x} ${y}`;
  let steps = '';
  for (const [nextX, nextY] of projected.slice(1)) {
    const dx = nextX - x;
    const dy = nextY - y;
    if (dx === 0 && dy === 0) continue;
    // O sinal de menos já separa os números; só valores positivos precisam do espaço.
    steps += `${steps && dx >= 0 ? ' ' : ''}${dx}${dy >= 0 ? ' ' : ''}${dy}`;
    [x, y] = [nextX, nextY];
  }
  if (steps) path += `l${steps}`;
  return `${path}z`;
};

const entries = features
  .map(({ uf, rings }) => [uf, rings.map(ringPath).join('')])
  .sort(([a], [b]) => a.localeCompare(b));

const smallCenters = features
  .map(({ uf, rings }) => {
    const xs = rings.flat().map((point) => project(point)[0]);
    const ys = rings.flat().map((point) => project(point)[1]);
    const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return { uf, small: Math.min(right - left, bottom - top) < SMALL_SIDE, x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
  })
  .filter(({ small }) => small)
  .sort((a, b) => a.uf.localeCompare(b.uf));

const source = `// Gerado por scripts/build-brazil-map.mjs. Não edite à mão.
// Malha das 27 UFs: IBGE, API de malhas v3 (qualidade mínima), domínio público.
import type { Uf } from '@/lib/ufs';

export const BRAZIL_MAP_WIDTH = ${WIDTH};
export const BRAZIL_MAP_HEIGHT = ${height};

/** Centro das UFs pequenas demais para clicar com conforto: o mapa desenha um alvo maior em volta. */
export const BRAZIL_SMALL_UF_CENTERS: Partial<Record<Uf, readonly [number, number]>> = {
${smallCenters.map(({ uf, x, y }) => `  ${uf}: [${x}, ${y}],`).join('\n')}
};

export const BRAZIL_UF_PATHS: Record<Uf, string> = {
${entries.map(([uf, path]) => `  ${uf}: '${path}',`).join('\n')}
};
`;

await writeFile(OUTPUT, source);
console.log(`${OUTPUT.pathname}: ${Buffer.byteLength(source)} bytes, ${WIDTH}x${height}`);
