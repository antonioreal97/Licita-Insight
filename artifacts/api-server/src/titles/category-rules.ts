import { TENDER_CATEGORIES, type TenderCategorySlug, toTenderCategories } from "../catalog/tender-categories";
import { normalizeText } from "../domain/normalize";

type CategoryRule = {
  slug: Exclude<TenderCategorySlug, "outros">;
  patterns: readonly RegExp[];
};

/**
 * Conservative rules over the normalized official title.  The professor and these
 * rules deliberately share TENDER_CATEGORIES as their only vocabulary.
 */
export const TENDER_CATEGORY_RULES: readonly CategoryRule[] = [
  { slug: "medicamentos-insumos-saude", patterns: [/\bmedicamentos?\b/u, /\bfarmacos?\b/u, /\binsumos? (?:farmaceuticos?|medicamentosos?|laboratoriais?)\b/u, /\bmateriais? (?:medico )?hospitalares?\b/u, /\bmateriais? odontologicos?\b/u, /\bseringas?\b/u, /\bcateteres?\b/u] },
  { slug: "equipamentos-medicos", patterns: [/\bequipamentos? (?:medicos?|hospitalares?|odontologicos?|antropometricos?)\b/u, /\baparelhos? (?:medicos?|hospitalares?)\b/u, /\binstrumentais? medico hospitalares?\b/u, /\bultrassom\b/u, /\braios? x\b/u, /\brespiradores?\b/u, /\bdesfibriladores?\b/u, /\bconcentradores? de oxigenio\b/u, /\bcadeiras? de rodas?\b/u] },
  { slug: "servicos-saude", patterns: [/\bservicos? (?:medicos?|hospitalares?|odontologicos?|de saude)\b/u, /\bexames?(?: laboratoriais?| clinicos?| medicos?)?\b/u, /\bconsultas?(?: medicas?)?\b/u, /\bplantoes? medicos?\b/u, /\bservico de enfermagem\b/u, /\binternacao (?:compulsoria|hospitalar)\b/u, /\bhome care\b/u, /\bbiopsia\b/u] },
  { slug: "obras-engenharia", patterns: [/\bobras?\b/u, /\bconstrucao\b/u, /\bpavimentacao\b/u, /\brecapeamento\b/u, /\bengenharia\b/u, /\breforma (?:e ampliacao|de|do|da)\b/u, /\bpontes? de concreto\b/u, /\bmuros? de (?:arrimo|gabiao)\b/u] },
  { slug: "manutencao-predial", patterns: [/\bmanutencao predial\b/u, /\bmanutencao (?:eletrica|hidraulica|de bens imoveis)\b/u, /\binstalacoes? (?:eletricas?|hidraulicas?|prediais?)\b/u, /\breparos? prediais?\b/u, /\bconsertos? de telhados?\b/u] },
  { slug: "ti-telecom", patterns: [/\bsoftware\b/u, /\bhardware\b/u, /\binformatica\b/u, /\bcomputadores?\b/u, /\bnotebooks?\b/u, /\bservidores? (?:de rede|corporativos?)\b/u, /\btecnologia da informacao\b/u, /\btelecomunicacoes?\b/u, /\binternet\b/u, /\bfibra optica\b/u, /\blinhas? telefonicas?\b/u, /\bseguranca cibernetica\b/u, /\bplataforma tecnologica\b/u, /\blicencas? (?:de )?(?:software|sistema)\b/u] },
  { slug: "alimentacao", patterns: [/\bgeneros? alimenticios?\b/u, /\balimentos?\b/u, /\bmerenda escolar\b/u, /\brefeicoes?\b/u, /\bbuffet\b/u, /\bcestas? basicas?\b/u, /\bcafe da manha\b/u, /\bagua mineral\b/u, /\bhortifrut\w*\b/u, /\blanches?\b/u, /\bfrutas?\b/u, /\bpao frances\b/u] },
  { slug: "limpeza-higiene", patterns: [/\bmateriais? de limpeza\b/u, /\bprodutos? de limpeza\b/u, /\bhigiene pessoal\b/u, /\bdedetizacao\b/u, /\bdesinsetizacao\b/u, /\blimpeza (?:predial|urbana|hospitalar)\b/u, /\bcoleta de residuos\b/u] },
  { slug: "veiculos-pecas", patterns: [/\bveiculos?\b/u, /\bautomoveis?\b/u, /\bpneus?\b/u, /\bpecas? automotivas?\b/u, /\bmanutencao (?:automotiva|de frota|de veiculos)\b/u, /\bmotocicletas?\b/u] },
  { slug: "combustiveis-gas", patterns: [/\bcombustiveis?\b/u, /\bgasolina\b/u, /\boleo diesel\b/u, /\betanol\b/u, /\bgas (?:liquefeito|glp|natural)\b/u, /\bbotijoes? de gas\b/u] },
  { slug: "mobiliario-eletro", patterns: [/\bmobiliarios?\b/u, /\bmoveis? (?:escolares?|de escritorio|planejados?)\b/u, /\beletrodomesticos?\b/u, /\bar condicionado\b/u, /\bclimatizacao\b/u, /\brefrigeradores?\b/u, /\bgeladeiras?\b/u, /\barmarios?\b/u, /\btelevisores?\b/u, /\bsmart tv\b/u, /\butensilios? domesticos?\b/u, /\bpersianas?\b/u] },
  { slug: "material-escritorio", patterns: [/\bmateriais? de escritorio\b/u, /\bmateriais? de expediente\b/u, /\bpapelaria\b/u, /\btoners?\b/u, /\bcartuchos? de tinta\b/u, /\bpapel a4\b/u] },
  { slug: "grafica-brindes", patterns: [/\bservicos? graficos?\b/u, /\bmateriais? graficos?\b/u, /\bimpressao grafica\b/u, /\bbrindes?\b/u, /\bcomunicacao visual\b/u, /\bbanners?\b/u] },
  { slug: "eventos-cultura", patterns: [/\beventos?\b/u, /\bshows?\b/u, /\bfestividades?\b/u, /\bapresentacoes? culturais?\b/u, /\bproducao cultural\b/u, /\bservicos? artisticos?\b/u, /\batividades? artisticas?\b/u, /\bbandas?\b/u, /\bprodutora musical\b/u, /\bsonorizacao (?:de|para) evento\b/u] },
  { slug: "esporte-lazer", patterns: [/\bmateriais? esportivos?\b/u, /\bequipamentos? esportivos?\b/u, /\batividades? esportivas?\b/u, /\bparques? infantis?\b/u, /\bacademia ao ar livre\b/u] },
  { slug: "educacao-capacitacao", patterns: [/\bcapacitacao\b/u, /\btreinamentos?\b/u, /\bcursos?\b/u, /\bcongressos?\b/u, /\bpalestras?\b/u, /\boficinas?\b/u, /\bsistema de ensino\b/u, /\bformacao (?:continuada|profissional)\b/u, /\bmateriais? (?:didaticos?|pedagogicos?|educativos?)\b/u, /\blivros? didaticos?\b/u] },
  { slug: "seguranca-incendio", patterns: [/\bextintores?\b/u, /\bcombate a incendio\b/u, /\bprevencao de incendio\b/u, /\bvigilancia patrimonial\b/u, /\bseguranca patrimonial\b/u, /\bcameras? de seguranca\b/u, /\bcircuito fechado de tv\b/u] },
  { slug: "transporte-locacao-veiculos", patterns: [/\btransporte (?:escolar|de passageiros|rodoviario)\b/u, /\blocacao de veiculos?\b/u, /\baluguel de veiculos?\b/u, /\bfretamento\b/u] },
  { slug: "consultoria-tecnica", patterns: [/\bconsultoria\b/u, /\bassessoria tecnica\b/u, /\bservicos? tecnicos? especializados?\b/u, /\bapoio tecnico especializado\b/u] },
  { slug: "mao-de-obra", patterns: [/\bmao de obra\b/u, /\bterceirizacao\b/u, /\bservicos? terceirizados?\b/u, /\bpostos? de trabalho\b/u, /\bapoio administrativo\b/u] },
  { slug: "assistencia-social", patterns: [/\bassistencia social\b/u, /\bacolhimento institucional\b/u, /\bbeneficios? eventuais?\b/u, /\bservico de convivencia\b/u] },
  { slug: "publicidade-comunicacao", patterns: [/\bpublicidade\b/u, /\bpropaganda\b/u, /\bagencia de comunicacao\b/u, /\bassessoria de imprensa\b/u, /\bmarketing\b/u] },
  { slug: "uniformes-textil", patterns: [/\buniformes?\b/u, /\bvestuarios?\b/u, /\btecidos?\b/u, /\bconfeccao\b/u, /\broupas? hospitalares?\b/u, /\bcamisetas?\b/u] },
  { slug: "agro-animais-ambiente", patterns: [/\binsumos? agricolas?\b/u, /\bsementes?\b/u, /\bmudas?\b/u, /\bracao animal\b/u, /\bservicos? veterinarios?\b/u, /\bmedicamentos? veterinarios?\b/u, /\bmeio ambiente\b/u, /\blicenciamento ambiental\b/u] },
  { slug: "saneamento-agua", patterns: [/\bsaneamento\b/u, /\babastecimento de agua\b/u, /\btratamento de agua\b/u, /\besgotamento sanitario\b/u, /\bpocos? artesianos?\b/u, /\bcaixas? d agua\b/u] },
  { slug: "energia-iluminacao", patterns: [/\biluminacao publica\b/u, /\bluminarias?\b/u, /\blampadas?\b/u, /\benergia eletrica\b/u, /\benergia solar\b/u, /\bpaineis? fotovoltaicos?\b/u] },
  { slug: "locacao-bens-imoveis", patterns: [/\blocacao de imoveis?\b/u, /\baluguel de imoveis?\b/u, /\blocacao de (?:maquinas|equipamentos|estruturas)\b/u, /\baluguel de (?:maquinas|equipamentos|estruturas)\b/u] },
  { slug: "seguros-financeiros", patterns: [/\bseguros?\b/u, /\bservicos? bancarios?\b/u, /\bservicos? financeiros?\b/u, /\bcorretagem de seguros?\b/u] },
] as const;

const allowedSlugs = new Set<TenderCategorySlug>(TENDER_CATEGORIES.map(({ slug }) => slug));

export const categorySlugsFromNormalizedTitle = (normalizedTitle: string): TenderCategorySlug[] => {
  const scored = TENDER_CATEGORY_RULES.flatMap((rule, order) => {
    const score = rule.patterns.reduce((total, pattern) => total + (pattern.test(normalizedTitle) ? 1 : 0), 0);
    return score > 0 && allowedSlugs.has(rule.slug) ? [{ slug: rule.slug, score, order }] : [];
  });
  return scored
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .slice(0, 2)
    .map(({ slug }) => slug);
};

export const categorySlugsFromOfficialTitle = (officialTitle: string): TenderCategorySlug[] =>
  categorySlugsFromNormalizedTitle(normalizeText(officialTitle));

export const categoriesFromOfficialTitle = (officialTitle: string) =>
  toTenderCategories(categorySlugsFromOfficialTitle(officialTitle));
