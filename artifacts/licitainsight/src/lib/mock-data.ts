export type TenderStatus = 'Aberto' | 'Em análise' | 'Encerrado' | 'Suspenso';
export type Tender = {
  id: string;
  title: string;
  description: string;
  organization: string;
  purchasingUnit: string;
  tenderNumber: string;
  processNumber: string;
  modality: string;
  status: TenderStatus;
  estimatedValue: number;
  publicationDate: string;
  openingDate: string;
  deadline: string;
  state: string;
  city: string;
  source: string;
  sourceUrl: string;
  relevanceScore: number;
  categories: string[];
  items: { description: string; quantity: string; unit: string; estimated: number }[];
  documents: { name: string; type: string; size: string }[];
  createdAt: string;
  updatedAt: string;
};

export const tenders: Tender[] = [
  {
    id: 'pe-042-2024',
    title: 'Aquisição de equipamentos de tecnologia educacional',
    description: 'Registro de preços para notebooks, monitores e periféricos destinados à rede municipal de ensino.',
    organization: 'Prefeitura Municipal de Curitiba',
    purchasingUnit: 'Secretaria Municipal da Educação',
    tenderNumber: 'Pregão Eletrônico 042/2024',
    processNumber: '01-118.432/2024',
    modality: 'Pregão eletrônico',
    status: 'Aberto',
    estimatedValue: 1847000,
    publicationDate: '2024-10-09',
    openingDate: '2024-11-04',
    deadline: '2024-11-01',
    state: 'PR',
    city: 'Curitiba',
    source: 'Compras.gov.br',
    sourceUrl: 'https://www.gov.br/compras',
    relevanceScore: 96,
    categories: ['Tecnologia', 'Educação', 'Equipamentos'],
    items: [
      { description: 'Notebook corporativo 14"', quantity: '240', unit: 'unidade', estimated: 4120 },
      { description: 'Monitor LED 24"', quantity: '180', unit: 'unidade', estimated: 940 },
      { description: 'Estação de recarga móvel', quantity: '12', unit: 'unidade', estimated: 8450 },
    ],
    documents: [{ name: 'Edital_PE_042_2024.pdf', type: 'Edital', size: '2,4 MB' }, { name: 'Termo_de_Referencia.pdf', type: 'Anexo', size: '860 KB' }],
    createdAt: '2024-10-09',
    updatedAt: '2024-10-18',
  },
  {
    id: 'conc-018-2024',
    title: 'Serviços de manutenção preventiva em unidades hospitalares',
    description: 'Contratação de empresa especializada para manutenção de sistemas elétricos e climatização.',
    organization: 'Governo do Estado de Pernambuco',
    purchasingUnit: 'Hospital Agamenon Magalhães',
    tenderNumber: 'Concorrência 018/2024',
    processNumber: 'SEI 23000.017821/2024',
    modality: 'Concorrência',
    status: 'Em análise',
    estimatedValue: 3260000,
    publicationDate: '2024-09-26',
    openingDate: '2024-10-31',
    deadline: '2024-10-29',
    state: 'PE',
    city: 'Recife',
    source: 'Portal de Compras PE',
    sourceUrl: 'https://www.pe.gov.br',
    relevanceScore: 89,
    categories: ['Engenharia', 'Manutenção', 'Saúde'],
    items: [{ description: 'Manutenção preventiva e corretiva', quantity: '12', unit: 'mês', estimated: 271666 }],
    documents: [{ name: 'Concorrencia_018_2024.pdf', type: 'Edital', size: '4,1 MB' }],
    createdAt: '2024-09-26',
    updatedAt: '2024-10-17',
  },
  {
    id: 'pe-119-2024',
    title: 'Fornecimento de insumos para alimentação escolar',
    description: 'Aquisição parcelada de gêneros alimentícios para escolas municipais durante o ano letivo.',
    organization: 'Prefeitura de Belo Horizonte',
    purchasingUnit: 'Subsecretaria de Segurança Alimentar',
    tenderNumber: 'Pregão Eletrônico 119/2024',
    processNumber: '04.002.119/2024',
    modality: 'Pregão eletrônico',
    status: 'Aberto',
    estimatedValue: 975400,
    publicationDate: '2024-10-15',
    openingDate: '2024-11-08',
    deadline: '2024-11-07',
    state: 'MG',
    city: 'Belo Horizonte',
    source: 'Portal PBH',
    sourceUrl: 'https://prefeitura.pbh.gov.br',
    relevanceScore: 84,
    categories: ['Alimentação', 'Logística', 'Educação'],
    items: [{ description: 'Arroz agulhinha tipo 1, 5 kg', quantity: '18.000', unit: 'pacote', estimated: 27.5 }, { description: 'Feijão carioca, 1 kg', quantity: '12.000', unit: 'pacote', estimated: 8.9 }],
    documents: [{ name: 'Edital_119_2024.pdf', type: 'Edital', size: '1,8 MB' }, { name: 'Planilha_de_itens.xlsx', type: 'Planilha', size: '112 KB' }],
    createdAt: '2024-10-15',
    updatedAt: '2024-10-19',
  },
  {
    id: 'pe-301-2024',
    title: 'Solução integrada de gestão documental e protocolo',
    description: 'Licenciamento de software, implantação, migração e suporte técnico para gestão de documentos.',
    organization: 'Tribunal de Justiça do Estado da Bahia',
    purchasingUnit: 'Diretoria de Tecnologia da Informação',
    tenderNumber: 'Pregão Eletrônico 301/2024',
    processNumber: 'TJ-ADM-2024/08391',
    modality: 'Pregão eletrônico',
    status: 'Aberto',
    estimatedValue: 2189000,
    publicationDate: '2024-10-17',
    openingDate: '2024-11-12',
    deadline: '2024-11-11',
    state: 'BA',
    city: 'Salvador',
    source: 'Licitações-e',
    sourceUrl: 'https://www.licitacoes-e.com.br',
    relevanceScore: 78,
    categories: ['Tecnologia', 'Software', 'Serviços'],
    items: [{ description: 'Licença de uso e suporte anual', quantity: '1', unit: 'serviço', estimated: 2189000 }],
    documents: [{ name: 'Termo_Referencia_301.pdf', type: 'Termo de referência', size: '3,2 MB' }],
    createdAt: '2024-10-17',
    updatedAt: '2024-10-19',
  },
  {
    id: 'rdo-077-2024',
    title: 'Pavimentação e drenagem de vias urbanas — Lote 2',
    description: 'Execução de obra de infraestrutura viária em bairros da zona norte, incluindo drenagem.',
    organization: 'Prefeitura Municipal de Joinville',
    purchasingUnit: 'Secretaria de Infraestrutura Urbana',
    tenderNumber: 'RDC 077/2024',
    processNumber: 'SEI 24.0.143221-8',
    modality: 'RDC eletrônico',
    status: 'Encerrado',
    estimatedValue: 7420000,
    publicationDate: '2024-08-02',
    openingDate: '2024-09-05',
    deadline: '2024-09-04',
    state: 'SC',
    city: 'Joinville',
    source: 'Portal de Compras Joinville',
    sourceUrl: 'https://www.joinville.sc.gov.br',
    relevanceScore: 63,
    categories: ['Obras', 'Infraestrutura'],
    items: [{ description: 'Pavimentação asfáltica e drenagem', quantity: '4,8', unit: 'km', estimated: 7420000 }],
    documents: [{ name: 'RDC_077_Edital.pdf', type: 'Edital', size: '5,7 MB' }],
    createdAt: '2024-08-02',
    updatedAt: '2024-09-20',
  },
  {
    id: 'ch-011-2024',
    title: 'Consultoria para transformação digital de serviços públicos',
    description: 'Serviços de diagnóstico, desenho de jornada e implantação de canais digitais.',
    organization: 'Governo do Estado do Ceará',
    purchasingUnit: 'Secretaria do Planejamento e Gestão',
    tenderNumber: 'Chamamento 011/2024',
    processNumber: 'SPU 24001.008112/2024-39',
    modality: 'Chamamento público',
    status: 'Suspenso',
    estimatedValue: 560000,
    publicationDate: '2024-09-11',
    openingDate: '2024-10-24',
    deadline: '2024-10-23',
    state: 'CE',
    city: 'Fortaleza',
    source: 'Compras Ceará',
    sourceUrl: 'https://www.ceara.gov.br',
    relevanceScore: 58,
    categories: ['Consultoria', 'Tecnologia', 'Gestão'],
    items: [{ description: 'Diagnóstico e plano de transformação', quantity: '1', unit: 'projeto', estimated: 560000 }],
    documents: [{ name: 'Chamamento_011.pdf', type: 'Edital', size: '1,2 MB' }],
    createdAt: '2024-09-11',
    updatedAt: '2024-10-20',
  },
];

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

export const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));