import type { TenderCategory } from "@workspace/db/schema";

export const TENDER_CATEGORIES = [
  { slug: "medicamentos-insumos-saude", label: "Medicamentos e insumos de saúde" },
  { slug: "equipamentos-medicos", label: "Equipamentos médicos e hospitalares" },
  { slug: "servicos-saude", label: "Serviços de saúde" },
  { slug: "obras-engenharia", label: "Obras e engenharia" },
  { slug: "manutencao-predial", label: "Manutenção predial e instalações" },
  { slug: "ti-telecom", label: "Tecnologia da informação e telecomunicações" },
  { slug: "alimentacao", label: "Alimentação" },
  { slug: "limpeza-higiene", label: "Limpeza, higiene e dedetização" },
  { slug: "veiculos-pecas", label: "Veículos, peças e manutenção" },
  { slug: "combustiveis-gas", label: "Combustíveis e gás" },
  { slug: "mobiliario-eletro", label: "Mobiliário, eletrodomésticos e climatização" },
  { slug: "material-escritorio", label: "Material de escritório e expediente" },
  { slug: "grafica-brindes", label: "Gráfica, brindes e comunicação visual" },
  { slug: "eventos-cultura", label: "Eventos, shows e cultura" },
  { slug: "esporte-lazer", label: "Esporte e lazer" },
  { slug: "educacao-capacitacao", label: "Educação, cursos e capacitação" },
  { slug: "seguranca-incendio", label: "Segurança, vigilância e prevenção de incêndio" },
  { slug: "transporte-locacao-veiculos", label: "Transporte e locação de veículos" },
  { slug: "consultoria-tecnica", label: "Consultoria e serviços técnicos" },
  { slug: "mao-de-obra", label: "Mão de obra e serviços terceirizados" },
  { slug: "assistencia-social", label: "Assistência social" },
  { slug: "publicidade-comunicacao", label: "Publicidade e comunicação" },
  { slug: "uniformes-textil", label: "Uniformes, tecidos e confecção" },
  { slug: "agro-animais-ambiente", label: "Agropecuária, animais e meio ambiente" },
  { slug: "saneamento-agua", label: "Saneamento e água" },
  { slug: "energia-iluminacao", label: "Energia e iluminação" },
  { slug: "locacao-bens-imoveis", label: "Locação de bens e imóveis" },
  { slug: "seguros-financeiros", label: "Seguros e serviços financeiros" },
  { slug: "outros", label: "Outros" },
] as const satisfies readonly TenderCategory[];

export type TenderCategorySlug = (typeof TENDER_CATEGORIES)[number]["slug"];

const CATEGORY_BY_SLUG = new Map<string, TenderCategory>(
  TENDER_CATEGORIES.map((category) => [category.slug, category]),
);

export const categoryLabel = (slug: string): string | undefined =>
  CATEGORY_BY_SLUG.get(slug)?.label;

export const isTenderCategorySlug = (value: unknown): value is TenderCategorySlug =>
  typeof value === "string" && CATEGORY_BY_SLUG.has(value);

export const toTenderCategories = (slugs: readonly unknown[]): TenderCategory[] => {
  const seen = new Set<string>();
  const categories: TenderCategory[] = [];
  for (const slug of slugs) {
    if (!isTenderCategorySlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    categories.push({ slug, label: categoryLabel(slug) ?? slug });
    if (categories.length === 2) break;
  }
  return categories;
};
