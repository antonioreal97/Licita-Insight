import { normalizeText } from "../domain/normalize";

/** Canonical cultural areas. Sources publish more than a hundred free-form terms; the filter needs a short list. */
export const OPPORTUNITY_AREAS = [
  "audiovisual",
  "musica",
  "teatro",
  "danca",
  "circo",
  "artes-visuais",
  "literatura",
  "patrimonio",
  "culturas-populares",
  "artesanato",
  "cultura-digital",
  "gastronomia",
  "gestao-producao",
  "formacao",
  "diversidade",
  "outras",
] as const;
export type OpportunityArea = (typeof OPPORTUNITY_AREAS)[number];

export const opportunityAreaLabels: Record<OpportunityArea, string> = {
  audiovisual: "Audiovisual",
  musica: "Música",
  teatro: "Teatro",
  danca: "Dança",
  circo: "Circo",
  "artes-visuais": "Artes visuais",
  literatura: "Livro e literatura",
  patrimonio: "Patrimônio e memória",
  "culturas-populares": "Culturas populares e tradicionais",
  artesanato: "Artesanato",
  "cultura-digital": "Cultura digital e games",
  gastronomia: "Gastronomia",
  "gestao-producao": "Gestão e produção cultural",
  formacao: "Formação e pesquisa",
  diversidade: "Diversidade e direitos",
  outras: "Outras áreas",
};

type AreaRule = { area: OpportunityArea; words: string[] };

/**
 * Words are matched whole against the accent-free, lower-case text. Order matters: the first rule that
 * matches a source term wins, so "Teatro de Rua" is theatre and "Forró (Dança)" is dance.
 */
const TERM_RULES: AreaRule[] = [
  {
    area: "audiovisual",
    words: [
      "audiovisual",
      "cinema",
      "cinemateca",
      "cineclube",
      "filme",
      "filmes",
      "documentario",
      "video",
      "videoclipe",
      "webserie",
      "animacao",
      "televisao",
      "tv",
    ],
  },
  { area: "teatro", words: ["teatro", "teatral", "dramaturgia"] },
  { area: "danca", words: ["danca", "dancas", "ballet", "bale"] },
  { area: "circo", words: ["circo", "circense", "circenses"] },
  {
    area: "musica",
    words: [
      "musica",
      "musical",
      "banda",
      "bandas",
      "canto",
      "coral",
      "orquestra",
      "opera",
      "forro",
      "samba",
      "choro",
      "hip-hop",
      "hip hop",
      "rap",
    ],
  },
  {
    area: "literatura",
    words: [
      "literatura",
      "literaria",
      "livro",
      "leitura",
      "cordel",
      "cronica",
      "poesia",
      "audiolivro",
      "biblioteca",
      "bibliotecas",
      "jornais",
    ],
  },
  {
    area: "artesanato",
    words: ["artesanato", "croche", "bordado", "santeira"],
  },
  { area: "gastronomia", words: ["gastronomia", "culinaria"] },
  {
    area: "cultura-digital",
    words: [
      "digital",
      "games",
      "jogos eletronicos",
      "novas midias",
      "midias sociais",
      "webdesign",
    ],
  },
  {
    area: "patrimonio",
    words: [
      "patrimonio",
      "museu",
      "museus",
      "museologia",
      "arquivo",
      "arquivos",
      "acervo",
      "acervos",
      "memoria",
      "memorias",
      "arqueologia",
      "historia",
    ],
  },
  {
    area: "culturas-populares",
    words: [
      "popular",
      "populares",
      "tradicionais",
      "capoeira",
      "boi bumba",
      "ciranda",
      "carnaval",
      "quadrilha",
      "folclore",
      "negra",
      "afrobrasileiras",
      "afro-brasileira",
      "matriz africana",
      "terreiro",
      "quilombolas",
      "indigena",
      "indigenas",
      "povos originarios",
      "cigana",
    ],
  },
  {
    area: "artes-visuais",
    words: [
      "artes visuais",
      "artes plasticas",
      "arte de plasticas",
      "fotografia",
      "arte de rua",
      "arte urbana",
      "grafite",
      "pintura",
      "escultura",
      "arte grafica",
      "design",
      "moda",
      "arquitetura",
    ],
  },
  {
    area: "gestao-producao",
    words: [
      "gestao cultural",
      "producao cultural",
      "producao de eventos",
      "economia criativa",
    ],
  },
  {
    area: "formacao",
    words: ["educacao", "pesquisa", "formacao", "humanidades"],
  },
  {
    area: "diversidade",
    words: [
      "lgbt",
      "lgbtqiapn+",
      "direitos humanos",
      "acessibilidade",
      "juventudes",
      "mulheres",
    ],
  },
];

/** Stricter list for free text: a title mentions "história" or "popular" far more loosely than a taxonomy does. */
const TEXT_RULES: AreaRule[] = [
  {
    area: "audiovisual",
    words: [
      "audiovisual",
      "audiovisuais",
      "cinema",
      "cineclube",
      "filme",
      "filmes",
      "documentario",
      "documentarios",
      "curta-metragem",
      "curtas-metragens",
      "curta metragem",
      "longa-metragem",
      "longas-metragens",
      "longa metragem",
    ],
  },
  { area: "musica", words: ["musica", "musical", "musicais", "musicos"] },
  { area: "teatro", words: ["teatro", "teatral", "teatrais"] },
  { area: "danca", words: ["danca", "dancas"] },
  { area: "circo", words: ["circo", "circense", "circenses"] },
  {
    area: "literatura",
    words: [
      "literatura",
      "literario",
      "literaria",
      "livro",
      "livros",
      "cordel",
    ],
  },
  { area: "artesanato", words: ["artesanato", "artesaos"] },
  { area: "gastronomia", words: ["gastronomia"] },
  {
    area: "patrimonio",
    words: ["patrimonio cultural", "museu", "museus"],
  },
  {
    area: "culturas-populares",
    words: [
      "cultura popular",
      "culturas populares",
      "capoeira",
      "quadrilha",
      "quadrilhas",
      "carnaval",
      "quilombola",
      "quilombolas",
      "indigena",
      "indigenas",
    ],
  },
  {
    area: "artes-visuais",
    words: ["artes visuais", "artes plasticas", "fotografia", "grafite"],
  },
  { area: "cultura-digital", words: ["games", "jogos eletronicos"] },
];

const escapePattern = (word: string): string =>
  word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pattern = (words: string[]): RegExp =>
  new RegExp(
    `(?:^|[^a-z0-9])(?:${words.map(escapePattern).join("|")})(?:[^a-z0-9]|$)`,
  );

const compile = (rules: AreaRule[]) =>
  rules.map((rule) => ({ area: rule.area, pattern: pattern(rule.words) }));

const TERM_PATTERNS = compile(TERM_RULES);
const TEXT_PATTERNS = compile(TEXT_RULES);
const AUDIOVISUAL_TEXT = TEXT_PATTERNS[0]!.pattern;

/** One source term maps to one canonical area; unknown vocabulary lands in "outras". */
export const areaFromTerm = (term: string): OpportunityArea => {
  const text = normalizeText(term);
  return (
    TERM_PATTERNS.find((rule) => rule.pattern.test(text))?.area ?? "outras"
  );
};

export const areasFromText = (
  title: string,
  summary: string | null,
): OpportunityArea[] => {
  const text = normalizeText(`${title} ${summary ?? ""}`);
  return TEXT_PATTERNS.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.area,
  );
};

export const matchesAudiovisualText = (
  title: string,
  summary: string | null,
): boolean => AUDIOVISUAL_TEXT.test(normalizeText(`${title} ${summary ?? ""}`));

const ordered = (areas: Set<OpportunityArea>): OpportunityArea[] =>
  OPPORTUNITY_AREAS.filter((area) => areas.has(area));

/**
 * Areas of a call. Source terms come first. Audiovisual is also read from the title and summary, because
 * that is what the collection filtered on before it covered every area. Installs that publish no area
 * taxonomy at all (Ceará, Aracaju) are classified from the text alone.
 */
export const resolveAreas = (
  terms: string[],
  title: string,
  summary: string | null,
): OpportunityArea[] => {
  const areas = new Set<OpportunityArea>(terms.map(areaFromTerm));
  if (terms.length === 0) {
    for (const area of areasFromText(title, summary)) areas.add(area);
  } else if (matchesAudiovisualText(title, summary)) {
    areas.add("audiovisual");
  }
  return ordered(areas);
};
