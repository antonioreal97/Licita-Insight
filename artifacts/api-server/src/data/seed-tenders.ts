import type { Modality, TenderDetail, TenderStatus } from "@workspace/api-zod";

const statuses: TenderStatus[] = [
  "open",
  "under_review",
  "closed",
  "suspended",
  "cancelled",
];

const modalities: { value: Modality; label: string }[] = [
  { value: "pregao_eletronico", label: "Pregão Eletrônico" },
  { value: "pregao_presencial", label: "Pregão Presencial" },
  { value: "concorrencia", label: "Concorrência" },
  { value: "concorrencia_eletronica", label: "Concorrência Eletrônica" },
  { value: "dispensa", label: "Dispensa de Licitação" },
  { value: "inexigibilidade", label: "Inexigibilidade" },
  { value: "credenciamento", label: "Credenciamento" },
  { value: "leilao", label: "Leilão" },
  { value: "dialogo_competitivo", label: "Diálogo Competitivo" },
  { value: "other", label: "Outra modalidade" },
];

const locations = [
  { state: "SP", city: "São Paulo", cityIbgeCode: "3550308" },
  { state: "DF", city: "Brasília", cityIbgeCode: "5300108" },
  { state: "MG", city: "Belo Horizonte", cityIbgeCode: "3106200" },
  { state: "RJ", city: "Rio de Janeiro", cityIbgeCode: "3304557" },
  { state: "BA", city: "Salvador", cityIbgeCode: "2927408" },
  { state: "PR", city: "Curitiba", cityIbgeCode: "4106902" },
  { state: "RS", city: "Porto Alegre", cityIbgeCode: "4314902" },
  { state: "PE", city: "Recife", cityIbgeCode: "2611606" },
  { state: "CE", city: "Fortaleza", cityIbgeCode: "2304400" },
  { state: "GO", city: "Goiânia", cityIbgeCode: "5208707" },
  { state: "SC", city: "Florianópolis", cityIbgeCode: "4205407" },
  { state: "AM", city: "Manaus", cityIbgeCode: "1302603" },
];

const coreOrganizations = [
  { id: "org-fixture-education", name: "Secretaria de Educação (fixture)" },
  { id: "org-fixture-health", name: "Secretaria de Saúde (fixture)" },
  { id: "org-fixture-admin", name: "Secretaria de Administração (fixture)" },
  { id: "org-fixture-justice", name: "Tribunal Regional (fixture)" },
  { id: "org-fixture-university", name: "Universidade Pública (fixture)" },
  { id: "org-fixture-city", name: "Prefeitura Municipal (fixture)" },
];

const organizations = [
  ...coreOrganizations,
  ...Array.from({ length: 19 }, (_, index) => {
    const ordinal = String(index + 7).padStart(2, "0");
    return {
      id: `org-fixture-${ordinal}`,
      name: `Órgão público de demonstração ${ordinal} (fixture)`,
    };
  }),
];

const sources = [
  { id: "pncp-fixture", name: "PNCP (fixture)" },
  { id: "comprasgov-fixture", name: "Compras.gov.br (fixture)" },
  { id: "portal-estadual-fixture", name: "Portal estadual (fixture)" },
];

const subjects = [
  {
    title: "Contratação de plataforma de gestão administrativa em nuvem",
    summary:
      "Implantação, suporte e manutenção de sistema integrado de gestão.",
    category: { slug: "tecnologia", label: "Tecnologia" },
  },
  {
    title: "Aquisição de medicamentos e insumos hospitalares",
    summary:
      "Fornecimento parcelado de medicamentos para a rede pública de saúde.",
    category: { slug: "saude", label: "Saúde" },
  },
  {
    title: "Serviços continuados de limpeza e conservação predial",
    summary:
      "Prestação de limpeza, higienização e conservação com dedicação de mão de obra.",
    category: { slug: "servicos", label: "Serviços" },
  },
  {
    title: "Aquisição de computadores, monitores e periféricos",
    summary:
      "Equipamentos de informática para modernização de unidades administrativas.",
    category: { slug: "tecnologia", label: "Tecnologia" },
  },
  {
    title: "Contratação de transporte escolar rural",
    summary: "Rotas de transporte de estudantes da rede municipal de ensino.",
    category: { slug: "educacao", label: "Educação" },
  },
  {
    title: "Obras de recuperação e pavimentação viária",
    summary:
      "Execução de serviços de drenagem, pavimentação e sinalização urbana.",
    category: { slug: "obras", label: "Obras e engenharia" },
  },
  {
    title: "Fornecimento de gêneros alimentícios para merenda escolar",
    summary:
      "Aquisição parcelada de alimentos para atendimento do calendário letivo.",
    category: { slug: "alimentacao", label: "Alimentação" },
  },
  {
    title: "Serviço de conectividade e acesso à internet",
    summary:
      "Links dedicados com monitoramento para prédios e unidades remotas.",
    category: { slug: "telecomunicacoes", label: "Telecomunicações" },
  },
  {
    title: "Aquisição de veículos utilitários para a frota pública",
    summary:
      "Veículos novos destinados a atividades operacionais e fiscalização.",
    category: { slug: "veiculos", label: "Veículos" },
  },
  {
    title: "Manutenção preventiva de equipamentos de climatização",
    summary:
      "Plano de manutenção, operação e controle de sistemas de ar-condicionado.",
    category: { slug: "manutencao", label: "Manutenção" },
  },
  {
    title: "Licenciamento de solução de segurança da informação",
    summary:
      "Proteção de endpoints, gestão de vulnerabilidades e resposta a incidentes.",
    category: { slug: "tecnologia", label: "Tecnologia" },
  },
  {
    title:
      "Serviços técnicos de engenharia para elaboração de projetos executivos",
    summary:
      "Projetos, memoriais, planilhas e acompanhamento técnico especializado.",
    category: { slug: "engenharia", label: "Engenharia" },
  },
];

const addDays = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * 86_400_000);

export const SEARCH_FIXTURE_INDEX_UPDATED_AT = new Date(
  "2026-09-20T12:00:00.000Z",
);

export const createSearchFixtureTenders = (): TenderDetail[] =>
  Array.from({ length: 60 }, (_, index) => {
    const ordinal = index + 1;
    const subject = subjects[index % subjects.length]!;
    const organization = organizations[index % organizations.length]!;
    const source = sources[index % sources.length]!;
    const location = locations[index % locations.length]!;
    const modality = modalities[index % modalities.length]!;
    const publishedAt = new Date(
      Date.UTC(2026, 6 + Math.floor(index / 28), (index % 28) + 1, 12),
    );
    const proposalDeadline = addDays(publishedAt, 12 + (index % 25));
    const createdAt = addDays(publishedAt, -1);
    const title =
      index === 0
        ? `${subject.title} com implantação, migração assistida, capacitação de usuários e suporte técnico especializado para múltiplas unidades administrativas`
        : subject.title;
    const estimatedValue = index % 7 === 0 ? null : 48_500 + index * 73_250.75;
    const estimatedValueStatus =
      estimatedValue !== null
        ? ("disclosed" as const)
        : index % 14 === 0
          ? ("confidential" as const)
          : ("not_published" as const);
    const id = `fixture-tender-${String(ordinal).padStart(3, "0")}`;

    return {
      id,
      title,
      objectSummary: subject.summary,
      organization,
      purchasingUnit: `Unidade compradora ${String((index % 9) + 1).padStart(2, "0")}`,
      modality: modality.value,
      modalityLabel: modality.label,
      status: statuses[index % statuses.length]!,
      tenderNumber: `${modality.label} ${String(ordinal).padStart(3, "0")}/2026`,
      estimatedValue,
      estimatedValueStatus,
      publishedAt,
      openingAt: addDays(proposalDeadline, 1),
      proposalDeadline,
      location,
      source: {
        ...source,
        url: `https://example.test/${source.id}/tenders/${id}`,
      },
      categories: [subject.category],
      relevance: { score: null, highlights: [] },
      updatedAt: addDays(publishedAt, index % 4),
      description: `${subject.summary} Registro sintético destinado exclusivamente ao desenvolvimento e aos testes locais da Search API v1.`,
      processNumber: `FIXTURE-${String(20260000 + ordinal)}`,
      items: [
        {
          id: `${id}-item-1`,
          description: subject.title,
          quantity: 1 + (index % 25),
          unit: "unidade",
          estimatedUnitValue:
            estimatedValue === null
              ? null
              : Number((estimatedValue / (1 + (index % 25))).toFixed(2)),
          estimatedTotalValue: estimatedValue,
        },
      ],
      documents: [
        {
          id: `${id}-document-1`,
          name: "Edital de demonstração.pdf",
          type: "notice",
          sizeBytes: 180_000 + index * 1_250,
          url: `https://example.test/${source.id}/documents/${id}.pdf`,
          publishedAt,
        },
      ],
      timeline: [
        {
          at: publishedAt,
          type: "published",
          description: "Publicação registrada na fonte de demonstração.",
        },
      ],
      createdAt,
    };
  });
