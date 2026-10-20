import type { GlossarySource } from './glossary';

export type HelpPath = {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
};

export const HELP_PATHS: HelpPath[] = [
  {
    title: 'Quero vender ao governo',
    description: 'Entenda o caminho de uma licitação, do cadastro ao contrato, e a diferença entre pregão e dispensa.',
    href: '#como-vender',
    linkLabel: 'Ver o passo a passo',
  },
  {
    title: 'Quero inscrever um projeto',
    description: 'Veja como funcionam editais de cultura, pesquisa, inovação, bolsas, auxílios e parcerias.',
    href: '#fontes-nacionais',
    linkLabel: 'Entender as fontes nacionais',
  },
  {
    title: 'Quero buscar fora do Brasil',
    description: 'Aprenda as siglas e as etapas usadas pelo Banco Mundial, BID e portal Funding & Tenders da União Europeia.',
    href: '#fontes-internacionais',
    linkLabel: 'Entender as fontes internacionais',
  },
];

export type ProcessTrack = {
  id: 'pregao' | 'dispensa' | 'fomento';
  title: string;
  summary: string;
  stages: { title: string; description: string }[];
  attention: string;
};

export const PROCESS_TRACKS: ProcessTrack[] = [
  {
    id: 'pregao',
    title: 'Pregão eletrônico',
    summary: 'Para bens e serviços comuns. A disputa costuma ser por menor preço ou maior desconto.',
    stages: [
      { title: 'Edital publicado', description: 'Leia o edital, o termo de referência, os anexos e as respostas a esclarecimentos.' },
      { title: 'Proposta enviada', description: 'Cadastre a oferta na plataforma indicada, antes do horário limite.' },
      { title: 'Sessão e lances', description: 'Acompanhe a sala de disputa, as mensagens e o limite mínimo que você calculou.' },
      { title: 'Julgamento e negociação', description: 'O órgão verifica a proposta mais bem colocada e pode negociar o valor.' },
      { title: 'Habilitação e recurso', description: 'O vencedor provisório envia documentos. Participantes podem recorrer nos prazos do edital.' },
      { title: 'Homologação e contrato', description: 'Depois da confirmação do resultado, o vencedor é convocado para contratar ou assinar a ata.' },
    ],
    attention: 'Ficar em primeiro nos lances ainda não garante a contratação. A proposta precisa ser aceita e a empresa, habilitada.',
  },
  {
    id: 'dispensa',
    title: 'Dispensa eletrônica',
    summary: 'É contratação direta prevista em lei, mas pode haver uma janela pública de propostas e disputa eletrônica.',
    stages: [
      { title: 'Aviso publicado', description: 'Confira o fundamento da dispensa, o objeto, os anexos e o prazo, que costuma ser curto.' },
      { title: 'Proposta cadastrada', description: 'Envie preço e descrição do item no sistema indicado no aviso.' },
      { title: 'Disputa, quando houver', description: 'Alguns avisos abrem uma sessão para lances. Outros apenas recebem propostas.' },
      { title: 'Aceitação e habilitação', description: 'O órgão confere o preço, o objeto e os documentos da empresa escolhida.' },
      { title: 'Resultado e contratação', description: 'A autoridade confirma o processo e convoca o fornecedor selecionado.' },
    ],
    attention: 'No Pardal, “Contratação direta” sem prazo costuma ser uma publicação do processo, não uma disputa aberta. Procure prazo de proposta antes de agir.',
  },
  {
    id: 'fomento',
    title: 'Chamada de fomento',
    summary: 'Para apoiar projetos, pesquisa, cultura, inovação ou parcerias. A seleção avalia elegibilidade e mérito, não lances.',
    stages: [
      { title: 'Chamada publicada', description: 'Confirme público elegível, área, território, despesas permitidas e valor de apoio.' },
      { title: 'Projeto preparado', description: 'Monte proposta, plano de trabalho, orçamento, cronograma e documentos do proponente.' },
      { title: 'Inscrição ou submissão', description: 'Envie tudo no sistema indicado pela fonte e guarde o comprovante.' },
      { title: 'Habilitação e avaliação', description: 'A instituição verifica documentos e aplica os critérios publicados na chamada.' },
      { title: 'Resultado e recurso', description: 'Acompanhe resultados preliminares, pedidos de complementação e prazo para recurso.' },
      { title: 'Instrumento e execução', description: 'Se selecionado, assine o instrumento, execute o projeto e preste contas conforme as regras.' },
    ],
    attention: 'Aprovação em mecanismo de incentivo fiscal, como a Lei Rouanet, pode autorizar a captação. Isso não significa repasse automático de dinheiro.',
  },
];

export type SourceGuide = {
  id: string;
  scope: 'national' | 'international';
  sources: string;
  purpose: string;
  howToApply: string;
  termIds: string[];
  vocabulary: string[];
  officialLinks: GlossarySource[];
};

export const SOURCE_GUIDES: SourceGuide[] = [
  {
    id: 'pncp-compras',
    scope: 'national',
    sources: 'PNCP e Compras.gov.br',
    purpose: 'Compras públicas brasileiras: pregões, concorrências, dispensas, credenciamentos, atas e contratos.',
    howToApply: 'O PNCP divulga. A proposta e os lances são enviados na plataforma indicada no edital, que pode ser o Compras.gov.br ou outro sistema.',
    termIds: ['pncp', 'uasg', 'pregao', 'dispensa', 'plataforma-disputa', 'habilitacao', 'retificacao'],
    vocabulary: ['edital', 'aviso de contratação direta', 'órgão comprador', 'UASG', 'proposta', 'lance', 'habilitação', 'homologação'],
    officialLinks: [
      { label: 'Portal Nacional de Contratações Públicas', url: 'https://pncp.gov.br/app/' },
      { label: 'Área do fornecedor no Compras.gov.br', url: 'https://www.gov.br/compras/pt-br/fornecedor-1' },
    ],
  },
  {
    id: 'mapas-culturais',
    scope: 'national',
    sources: 'Mapas Culturais',
    purpose: 'Editais, prêmios, oficinas e outras oportunidades publicadas em instalações estaduais, municipais e federais da plataforma.',
    howToApply: 'Em geral, você cria uma conta, escolhe um agente cultural e preenche a inscrição na página da própria oportunidade.',
    termIds: ['agente-cultural', 'inscricao-mapas', 'chamada-publica', 'proponente'],
    vocabulary: ['agente individual', 'agente coletivo', 'oportunidade', 'categoria', 'inscrição', 'projeto', 'espaço', 'evento'],
    officialLinks: [{ label: 'Perguntas frequentes do Mapa da Cultura', url: 'https://www.gov.br/cultura/pt-br/acesso-a-informacao/perguntas-frequentes/mapas-culturais/' }],
  },
  {
    id: 'ciencia-inovacao',
    scope: 'national',
    sources: 'FINEP, CNPq e CAPES',
    purpose: 'Chamadas de ciência, tecnologia, inovação, formação, bolsas e apoio a projetos de pesquisa.',
    howToApply: 'Cada chamada define quem pode coordenar e qual sistema recebe a proposta, como a Plataforma Carlos Chagas ou o SICAPES.',
    termIds: ['chamada-publica', 'proponente', 'bolsa-auxilio', 'subvencao-economica', 'recursos-reembolsaveis', 'contrapartida'],
    vocabulary: ['chamada pública', 'submissão', 'coordenador', 'bolsa', 'auxílio', 'subvenção econômica', 'contrapartida', 'mérito científico'],
    officialLinks: [
      { label: 'Chamadas públicas da FINEP', url: 'https://www.finep.gov.br/chamadas-publicas' },
      { label: 'Chamadas abertas do CNPq', url: 'https://www.gov.br/cnpq/pt-br/chamadas/abertas-para-submissao' },
      { label: 'Editais e resultados da CAPES', url: 'https://www.gov.br/capes/pt-br/assuntos/editais-e-resultados-capes/' },
    ],
  },
  {
    id: 'cultura-federal',
    scope: 'national',
    sources: 'Ministério da Cultura, Funarte e Lei Rouanet (Salic)',
    purpose: 'Editais culturais federais, premiações, bolsas, ocupação de espaços e propostas de incentivo fiscal.',
    howToApply: 'A página oficial informa se a inscrição acontece no Mapa da Cultura, no Salic ou em outro formulário ou sistema.',
    termIds: ['chamada-publica', 'proponente', 'captacao-rouanet', 'plano-trabalho'],
    vocabulary: ['proponente', 'proposta cultural', 'habilitação', 'seleção', 'premiação', 'ocupação', 'Salic', 'Pronac', 'captação'],
    officialLinks: [
      { label: 'Editais abertos do Ministério da Cultura', url: 'https://www.gov.br/cultura/pt-br/assuntos/editais/inscricoes-abertas/editais-abertos' },
      { label: 'Editais da Funarte', url: 'https://www.gov.br/funarte/pt-br/editais' },
      { label: 'Como funciona a Lei Rouanet', url: 'https://www.gov.br/cultura/pt-br/assuntos/acoes-programas-e-politicas/lei-rouanet-1' },
    ],
  },
  {
    id: 'transferegov',
    scope: 'national',
    sources: 'Transferegov.br',
    purpose: 'Programas e parcerias da União com entes públicos, consórcios e organizações da sociedade civil.',
    howToApply: 'Confira quem pode propor. Muitas oportunidades são destinadas a órgãos públicos ou OSCs, e não a empresas fornecedoras.',
    termIds: ['chamada-publica', 'plano-trabalho', 'contrapartida', 'termo-fomento-colaboracao', 'concedente-convenente'],
    vocabulary: ['programa', 'proponente', 'concedente', 'convenente', 'convênio', 'contrato de repasse', 'termo de fomento', 'plano de trabalho'],
    officialLinks: [{ label: 'Glossário do Transferegov.br', url: 'https://www.gov.br/transferegov/pt-br/capacitacao/transferegov/glossario/transferencias-e-parcerias-da-uniao' }],
  },
  {
    id: 'bancos-multilaterais',
    scope: 'international',
    sources: 'Banco Mundial e BID',
    purpose: 'Aquisições de bens, obras, serviços e consultorias financiadas por organismos multilaterais.',
    howToApply: 'Leia o aviso no idioma original. A entidade executora do projeto, e não necessariamente o banco, conduz a seleção e recebe os documentos.',
    termIds: ['expressao-interesse', 'ifb-rfb-rfp-rfq', 'lista-curta', 'mutuario-agencia-executora', 'contract-award'],
    vocabulary: ['procurement notice', 'EOI ou REOI', 'IFB ou RFB', 'RFP', 'RFQ', 'shortlist', 'borrower', 'executing agency', 'contract award'],
    officialLinks: [
      { label: 'Avisos de aquisições do Banco Mundial', url: 'https://projects.worldbank.org/en/projects-operations/procurement' },
      { label: 'Marco de aquisições do BID', url: 'https://www.iadb.org/en/how-we-can-work-together/procurement/procurement-projects/procurement-framework' },
    ],
  },
  {
    id: 'uniao-europeia',
    scope: 'international',
    sources: 'União Europeia (Funding & Tenders)',
    purpose: 'Chamadas de financiamento, subvenções, prêmios e licitações das instituições e programas da União Europeia.',
    howToApply: 'Abra o tópico, confira elegibilidade territorial e regras do consórcio, registre a organização e envie a proposta pelo serviço indicado.',
    termIds: ['call-topic', 'applicant-beneficiary', 'consorcio-pic', 'grant-agreement'],
    vocabulary: ['call', 'topic', 'applicant', 'beneficiary', 'coordinator', 'partner', 'consortium', 'PIC', 'grant agreement', 'call for tenders'],
    officialLinks: [
      { label: 'Glossário do Funding & Tenders', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/glossary' },
      { label: 'Manual de submissão da União Europeia', url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/om_en.pdf' },
    ],
  },
];

export const HELP_FAQ = [
  {
    question: 'O PNCP é o lugar onde envio a proposta?',
    answer: 'Nem sempre. O PNCP centraliza a divulgação. O edital informa a plataforma de disputa ou o canal que recebe a proposta.',
  },
  {
    question: 'Toda dispensa está aberta para receber proposta?',
    answer: 'Não. Uma dispensa eletrônica com prazo pode receber propostas e lances. Uma contratação direta sem prazo pode ser apenas a publicação oficial de um processo já encaminhado.',
  },
  {
    question: 'Ficar em primeiro nos lances significa que ganhei?',
    answer: 'Ainda não. O órgão precisa aceitar a proposta, conferir a habilitação, tratar eventuais recursos e homologar o resultado.',
  },
  {
    question: 'Uma chamada de fomento funciona como licitação?',
    answer: 'Não. Em geral, você apresenta um projeto ou plano de trabalho, que é avaliado pelos critérios da chamada. Não há disputa de lances.',
  },
  {
    question: 'Como acompanho vários editais e prazos ao mesmo tempo?',
    answer:
      'Na Visão geral, abra a aba Mural de processos: ela tem uma coluna para cada etapa que você marcou; use “Mover para…” no cartão (ou arraste, no computador) e a etapa muda como no menu da lista. Cada cartão mostra os documentos que você marcou e o atalho “Organizar documentos”, que leva à lista do que preparar daquele edital. No menu lateral, o Calendário junta o envio da proposta e o início das propostas, publicados no edital, e o prazo pessoal da sua próxima ação, em horário de Brasília. Prazos atrasados ficam destacados, e editais em “Não vou participar” ficam de fora.',
  },
  {
    question: 'O resultado do Pardal substitui a página oficial?',
    answer: 'Não. O Pardal ajuda a encontrar e organizar oportunidades. Prazos, documentos, retificações e regras válidas são os publicados pela fonte oficial.',
  },
];
