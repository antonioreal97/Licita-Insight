/**
 * Glossary for companies that never sold to the government. Plain definitions, what to do next and the official source.
 * Informative only: no legal or tax advice. When a rule varies by edital, say so and point to the official text.
 * Definitions have two to three sentences; avoid abbreviations ending in a period ("art.") so the sentence count stays honest.
 */

export type GlossarySource = { label: string; url: string };

export type GlossaryCategory =
  | 'basics'
  | 'modalities'
  | 'registration'
  | 'documents'
  | 'dispute'
  | 'contest'
  | 'contract'
  | 'small-business'
  | 'national-opportunities'
  | 'international-opportunities';

export type GlossaryEntry = {
  id: string;
  term: string;
  /** Other spellings found in editais and in the app; matched case- and accent-insensitively. The term itself is always included. */
  aliases: string[];
  category: GlossaryCategory;
  definition: string;
  whatToDo: string;
  sources: GlossarySource[];
  /** False for words so common that marking them in running text would be noise. The entry still shows on /ajuda. */
  detect?: false;
};

export const GLOSSARY_DISCLAIMER =
  'Material informativo, escrito em linguagem simples. Não é orientação jurídica, contábil ou fiscal e não substitui o edital, a lei ou um profissional. As regras de cada compra estão no edital; confira sempre a fonte oficial.';

export const GLOSSARY_DISCLAIMER_SHORT = 'Material informativo; não é orientação jurídica ou fiscal. Confira o edital e a fonte oficial.';

export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  basics: 'Conceitos básicos',
  modalities: 'Modalidades e formas de contratação',
  registration: 'Cadastro e acesso',
  documents: 'Habilitação e documentos',
  dispute: 'Proposta e disputa',
  contest: 'Dúvidas, contestação e resultado',
  contract: 'Contrato e execução',
  'small-business': 'Pequenas empresas (ME/EPP)',
  'national-opportunities': 'Cultura, ciência, inovação e parcerias',
  'international-opportunities': 'Oportunidades internacionais',
};

export const CATEGORY_ORDER: GlossaryCategory[] = [
  'basics',
  'modalities',
  'registration',
  'documents',
  'dispute',
  'contest',
  'contract',
  'small-business',
  'national-opportunities',
  'international-opportunities',
];

const LEI_14133 = 'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm';
const LC_123 = 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm';
const lei = (articles: string): GlossarySource => ({ label: `Lei 14.133/2021 (${articles})`, url: LEI_14133 });
const lc123 = (articles: string): GlossarySource => ({ label: `Lei Complementar 123/2006 (${articles})`, url: LC_123 });

const COMPRAS: GlossarySource = { label: 'Portal de Compras do Governo Federal', url: 'https://www.gov.br/compras/pt-br' };
const FORNECEDOR: GlossarySource = { label: 'Portal de Compras: área do fornecedor', url: 'https://www.gov.br/compras/pt-br/fornecedor-1' };
const SICAF: GlossarySource = { label: 'SICAF Digital (Portal de Compras)', url: 'https://www.gov.br/compras/pt-br/sicaf-digital' };
const SICAF_FAQ: GlossarySource = {
  label: 'Perguntas frequentes sobre o SICAF',
  url: 'https://www.gov.br/compras/pt-br/acesso-a-informacao/perguntas-frequentes/sicaf-sistema',
};
const PNCP_INFO: GlossarySource = { label: 'PNCP (gov.br)', url: 'https://www.gov.br/pncp/pt-br' };
const PNCP_APP: GlossarySource = { label: 'Portal Nacional de Contratações Públicas', url: 'https://pncp.gov.br/app/' };
const CERTIDAO_FEDERAL: GlossarySource = {
  label: 'Emitir certidão de regularidade fiscal federal (gov.br)',
  url: 'https://www.gov.br/pt-br/servicos/emitir-certidao-de-regularidade-fiscal',
};
const CNDT: GlossarySource = { label: 'CNDT no Tribunal Superior do Trabalho', url: 'https://www.tst.jus.br/certidao1' };
const CRF: GlossarySource = { label: 'Consulta de regularidade do FGTS (Caixa)', url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf' };
const SIMPLES: GlossarySource = { label: 'Portal do Simples Nacional', url: 'https://www8.receita.fazenda.gov.br/simplesnacional/' };
const ITI: GlossarySource = { label: 'Certificado digital (ITI)', url: 'https://www.gov.br/iti/pt-br/assuntos/certificado-digital' };
const LEI_4320: GlossarySource = { label: 'Lei 4.320/1964 (empenho)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l4320.htm' };
const MAPAS_CULTURAIS: GlossarySource = {
  label: 'Perguntas frequentes do Mapa da Cultura',
  url: 'https://www.gov.br/cultura/pt-br/acesso-a-informacao/perguntas-frequentes/mapas-culturais/',
};
const TRANSFEREGOV: GlossarySource = {
  label: 'Glossário do Transferegov.br',
  url: 'https://www.gov.br/transferegov/pt-br/capacitacao/transferegov/glossario/transferencias-e-parcerias-da-uniao',
};
const CNPQ: GlossarySource = { label: 'Chamadas abertas do CNPq', url: 'https://www.gov.br/cnpq/pt-br/chamadas/abertas-para-submissao' };
const FINEP: GlossarySource = { label: 'Chamadas públicas da FINEP', url: 'https://www.finep.gov.br/chamadas-publicas' };
const ROUANET: GlossarySource = {
  label: 'Lei Rouanet no Ministério da Cultura',
  url: 'https://www.gov.br/cultura/pt-br/assuntos/acoes-programas-e-politicas/lei-rouanet-1',
};
const WORLD_BANK: GlossarySource = {
  label: 'Regulamento de aquisições do Banco Mundial',
  url: 'https://thedocs.worldbank.org/en/doc/415861533066041404-0290022016/render/ProcurementRegulations2016.pdf',
};
const WORLD_BANK_NOTICES: GlossarySource = {
  label: 'Avisos de aquisições do Banco Mundial',
  url: 'https://projects.worldbank.org/en/projects-operations/procurement',
};
const IDB: GlossarySource = {
  label: 'Marco de aquisições do BID',
  url: 'https://www.iadb.org/en/how-we-can-work-together/procurement/procurement-projects/procurement-framework',
};
const EU_GLOSSARY: GlossarySource = {
  label: 'Glossário do Funding & Tenders',
  url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/glossary',
};
const EU_MANUAL: GlossarySource = {
  label: 'Manual do Funding & Tenders',
  url: 'https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/om_en.pdf',
};

export const GLOSSARY: GlossaryEntry[] = [
  // Conceitos básicos
  {
    id: 'lei-14133',
    term: 'Lei 14.133/2021',
    aliases: ['Lei 14.133', 'Lei 14133', 'Lei nº 14.133', 'nova Lei de Licitações', 'Lei de Licitações'],
    category: 'basics',
    definition:
      'É a Lei de Licitações e Contratos Administrativos, que vale para a União, os estados, o Distrito Federal e os municípios. Ela define as modalidades de licitação, as fases do processo, os documentos que podem ser exigidos e as regras dos contratos. Substituiu a Lei 8.666/1993, a Lei do Pregão e outras normas antigas de compras públicas.',
    whatToDo: 'Use a lei como referência quando o edital citar um artigo. As regras de cada compra estão no edital, que é o documento a seguir.',
    sources: [lei('texto completo')],
  },
  {
    id: 'edital',
    term: 'Edital',
    aliases: [],
    category: 'basics',
    definition:
      'É o documento que anuncia a licitação e reúne todas as regras dela: o que será comprado, prazos, documentos exigidos, critério de julgamento e condições do contrato. Junto com ele costumam vir anexos, como o termo de referência e a minuta do contrato.',
    whatToDo: 'Leia o edital inteiro e os anexos antes de decidir participar. Se algo não estiver claro, faça um pedido de esclarecimento dentro do prazo indicado.',
    sources: [lei('arts. 25 e 54')],
    detect: false,
  },
  {
    id: 'termo-de-referencia',
    term: 'Termo de referência',
    aliases: ['projeto básico'],
    category: 'basics',
    definition:
      'É o anexo do edital que descreve em detalhe o que o órgão quer comprar: especificações, quantidades, prazos, local de entrega e forma de pagamento. Em obras e serviços de engenharia, esse papel costuma ser do projeto básico.',
    whatToDo: 'Compare as especificações com o que você vende antes de montar a proposta. Diferença de medida, modelo ou prazo pode levar à desclassificação.',
    sources: [lei('art. 6º, incisos XXIII e XXV')],
  },
  {
    id: 'pncp',
    term: 'PNCP',
    aliases: ['Portal Nacional de Contratações Públicas'],
    category: 'basics',
    definition:
      'É o Portal Nacional de Contratações Públicas, site oficial onde órgãos de todo o país divulgam editais, atas e contratos, como determina a Lei 14.133. O Pardal Digital lê os dados publicados ali. O PNCP divulga as compras, mas a disputa acontece na plataforma indicada no edital.',
    whatToDo: 'Use o PNCP para conferir a publicação oficial e baixar os documentos. Para enviar proposta, entre na plataforma de disputa que o edital indicar.',
    sources: [PNCP_APP, PNCP_INFO, lei('art. 174')],
  },
  {
    id: 'uasg',
    term: 'UASG',
    aliases: ['Unidade Administrativa de Serviços Gerais', 'unidade compradora', 'unidade de compra'],
    category: 'basics',
    definition:
      'É a sigla de Unidade Administrativa de Serviços Gerais, usada no sistema federal para identificar a unidade que realiza a compra. Um mesmo órgão pode ter várias UASGs, com locais e responsáveis diferentes.',
    whatToDo: 'Use o código e o nome da UASG para confirmar quem conduz o processo e para localizar a compra na plataforma indicada.',
    sources: [COMPRAS, SICAF],
  },
  {
    id: 'retificacao',
    term: 'Retificação do edital',
    aliases: ['retificação', 'edital retificado', 'alteração do edital', 'aviso de retificação', 'errata'],
    category: 'basics',
    definition:
      'É uma correção ou mudança publicada depois do edital original. Se a alteração afetar a preparação das propostas, a administração deve divulgar novamente e respeitar os prazos previstos na lei.',
    whatToDo: 'Antes de enviar qualquer documento, confira a página oficial, o histórico e os anexos mais recentes para não seguir uma versão antiga.',
    sources: [lei('arts. 54 e 55')],
  },

  // Modalidades e formas de contratação
  {
    id: 'pregao',
    term: 'Pregão eletrônico',
    aliases: ['pregão', 'pregão presencial'],
    category: 'modalities',
    definition:
      'É a modalidade usada para comprar bens e serviços comuns, aqueles que podem ser descritos com especificações usuais de mercado. O vencedor é definido por menor preço ou maior desconto, normalmente com disputa de lances pela internet. A forma presencial só é admitida em casos justificados.',
    whatToDo: 'Cadastre-se na plataforma indicada no edital antes do prazo, envie a proposta e acompanhe a sessão no dia e horário marcados. Fique atento às mensagens do pregoeiro durante a disputa.',
    sources: [lei('arts. 6º, 17 e 29')],
  },
  {
    id: 'concorrencia',
    term: 'Concorrência',
    aliases: ['concorrência eletrônica'],
    category: 'modalities',
    definition:
      'É a modalidade usada para bens e serviços especiais e para obras e serviços de engenharia. Pode ser julgada por menor preço, maior desconto, melhor técnica, técnica e preço ou maior retorno econômico, conforme o edital.',
    whatToDo: 'Leia com atenção o critério de julgamento e as exigências técnicas, que costumam ser maiores do que no pregão. Confira se o edital pede atestados ou visita técnica.',
    sources: [lei('arts. 6º e 29')],
  },
  {
    id: 'dispensa',
    term: 'Dispensa de licitação',
    aliases: ['dispensa', 'dispensa eletrônica', 'contratação direta'],
    category: 'modalities',
    definition:
      'É uma contratação direta, sem licitação completa, permitida nos casos previstos na lei, como compras de valor baixo ou situações de emergência. Os limites de valor são atualizados periodicamente por decreto. Mesmo sem licitação, o órgão pode divulgar um aviso para receber propostas de qualquer interessado.',
    whatToDo: 'Acompanhe os avisos de dispensa: os prazos para enviar proposta costumam ser de poucos dias úteis. Ter os documentos em dia ajuda a responder a tempo.',
    sources: [lei('arts. 72 a 75'), COMPRAS],
  },
  {
    id: 'inexigibilidade',
    term: 'Inexigibilidade',
    aliases: ['inexigibilidade de licitação'],
    category: 'modalities',
    definition:
      'É a contratação direta quando a competição é inviável, por exemplo quando só um fornecedor pode atender ou na contratação de artista consagrado. O órgão precisa justificar por que a disputa não é possível.',
    whatToDo: 'Normalmente não há disputa aberta para participar. Vale acompanhar o órgão para identificar compras futuras do mesmo tipo com disputa.',
    sources: [lei('art. 74')],
  },
  {
    id: 'credenciamento',
    term: 'Credenciamento',
    aliases: ['credenciamento prévio'],
    category: 'modalities',
    definition:
      'Na Lei 14.133, credenciamento é um chamamento público em que o órgão cadastra todos os interessados que cumprirem as condições, para contratá-los quando precisar. A palavra também é usada para o cadastro prévio que a plataforma de disputa exige antes do envio da proposta.',
    whatToDo: 'Se for um chamamento, envie os documentos pedidos no prazo do edital. Se for o cadastro na plataforma, faça antes do prazo indicado: sem ele não é possível enviar proposta.',
    sources: [lei('arts. 78 e 79')],
  },
  {
    id: 'leilao',
    term: 'Leilão',
    aliases: [],
    category: 'modalities',
    definition:
      'É a modalidade em que o governo vende bens que não usa mais, como veículos, imóveis e materiais, para quem der o maior lance. Aqui a empresa compra do governo, em vez de vender.',
    whatToDo: 'Leia o edital para saber como visitar os bens, como dar lances e quais são os prazos de pagamento e retirada.',
    sources: [lei('arts. 6º e 31')],
  },
  {
    id: 'dialogo-competitivo',
    term: 'Diálogo competitivo',
    aliases: [],
    category: 'modalities',
    definition:
      'É uma modalidade para contratações complexas, em que o órgão conversa com empresas previamente selecionadas para desenvolver soluções antes de pedir as propostas finais. É usada em situações específicas previstas na lei, como inovação tecnológica ou técnica.',
    whatToDo: 'Leia o edital para entender os critérios de pré-seleção e o cronograma das fases de diálogo.',
    sources: [lei('art. 32')],
  },
  {
    id: 'registro-de-precos',
    term: 'Ata de registro de preços',
    aliases: ['ata de registro de preço', 'sistema de registro de preços', 'registro de preços', 'SRP'],
    category: 'modalities',
    definition:
      'No sistema de registro de preços, a licitação registra preços e fornecedores para compras futuras, sem obrigar o órgão a comprar tudo. A ata é o documento que formaliza esses preços e vale por 1 ano, podendo ser prorrogada por igual período. Durante a vigência, o órgão faz pedidos conforme a necessidade.',
    whatToDo: 'Ao assinar a ata, a empresa se compromete a fornecer pelo preço registrado quando for chamada. Avalie se consegue manter o preço por toda a vigência e acompanhe os pedidos.',
    sources: [lei('arts. 82 a 86')],
  },
  {
    id: 'adesao-ata',
    term: 'Adesão à ata (carona)',
    aliases: ['adesão à ata', 'adesão a ata', 'carona'],
    category: 'modalities',
    definition:
      'É quando um órgão que não participou da licitação usa a ata de registro de preços de outro órgão para comprar. A lei impõe limites e condições, e o fornecedor precisa aceitar.',
    whatToDo: 'Se receber um pedido de adesão, avalie se consegue atender à nova quantidade nas mesmas condições antes de aceitar.',
    sources: [lei('art. 86')],
  },

  // Cadastro e acesso
  {
    id: 'sicaf',
    term: 'SICAF',
    aliases: ['Sistema de Cadastramento Unificado de Fornecedores'],
    category: 'registration',
    definition:
      'É o Sistema de Cadastramento Unificado de Fornecedores do governo federal, onde a empresa registra seus dados e documentos de habilitação. O cadastro é necessário para disputar no Compras.gov.br. O acesso é feito com a conta gov.br.',
    whatToDo: 'Faça ao menos o credenciamento no SICAF antes de disputar no Compras.gov.br e mantenha as certidões do cadastro em dia. O manual e as perguntas frequentes do Portal de Compras explicam cada nível.',
    sources: [SICAF, SICAF_FAQ],
  },
  {
    id: 'compras-gov',
    term: 'Compras.gov.br',
    aliases: ['Comprasnet', 'Portal de Compras do Governo Federal'],
    category: 'registration',
    definition:
      'É o sistema de compras do governo federal, usado também por estados e municípios que aderiram a ele, onde acontecem pregões, dispensas eletrônicas e outras disputas. Para participar, a empresa precisa estar cadastrada no SICAF.',
    whatToDo: 'Confira no edital se a disputa será no Compras.gov.br. Se for, faça o cadastro com antecedência e conheça o sistema pelos manuais do fornecedor.',
    sources: [COMPRAS, FORNECEDOR],
  },
  {
    id: 'plataforma-disputa',
    term: 'Plataforma de disputa',
    aliases: ['plataformas de disputa', 'plataforma eletrônica', 'sistema eletrônico'],
    category: 'registration',
    definition:
      'É o sistema na internet onde a disputa acontece: envio de propostas, lances e documentos. Além do Compras.gov.br, há plataformas públicas e privadas usadas por estados e municípios, cada uma com seu próprio cadastro e regras de acesso.',
    whatToDo: 'Veja no edital qual plataforma será usada e faça o cadastro nela com antecedência. Algumas cobram taxa do fornecedor ou pedem certificado digital, então confira antes.',
    sources: [lei('art. 17')],
  },
  {
    id: 'certificado-digital',
    term: 'Certificado digital',
    aliases: ['e-CNPJ'],
    category: 'registration',
    definition:
      'É uma identidade eletrônica emitida por autoridade certificadora credenciada, que permite assinar documentos e acessar sistemas com validade jurídica. Para empresas, o tipo mais comum é o e-CNPJ.',
    whatToDo: 'Verifique se a plataforma ou o edital exige certificado digital e quanto tempo a emissão leva. Mantenha o certificado dentro da validade.',
    sources: [ITI],
  },

  // Habilitação e documentos
  {
    id: 'habilitacao',
    term: 'Habilitação',
    aliases: ['documentos de habilitação', 'fase de habilitação', 'inabilitação', 'inabilitada', 'inabilitado'],
    category: 'documents',
    definition:
      'É a fase em que o órgão confere se a empresa tem condições de cumprir o contrato, analisando documentos jurídicos, fiscais, trabalhistas, técnicos e econômico-financeiros. Pela Lei 14.133, em regra ela acontece depois do julgamento das propostas e só para quem ficou mais bem colocado. Quem não apresenta os documentos exigidos é inabilitado.',
    whatToDo: 'Monte uma pasta com os documentos que se repetem em quase todo edital e acompanhe as validades. Confira em cada edital a lista exata e o prazo de envio.',
    sources: [lei('arts. 17, 62 a 70')],
  },
  {
    id: 'habilitacao-juridica',
    term: 'Habilitação jurídica',
    aliases: ['documento societário', 'documentos societários', 'ato constitutivo', 'contrato social'],
    category: 'documents',
    definition:
      'É a prova de que a empresa existe legalmente e de quem pode representá-la. Em geral envolve o ato constitutivo, como o contrato social e suas alterações.',
    whatToDo: 'Tenha a versão atualizada do contrato social, ou documento equivalente, e confira se quem assina pela empresa tem poderes para isso.',
    sources: [lei('art. 66')],
  },
  {
    id: 'regularidade-fiscal',
    term: 'Regularidade fiscal',
    aliases: ['regularidade fiscal e trabalhista', 'regularidade fiscal, social e trabalhista'],
    category: 'documents',
    definition:
      'É a prova de que a empresa está em dia com tributos e contribuições, feita por certidões da Receita Federal, do estado, do município e do FGTS. O edital diz quais certidões são exigidas naquela compra.',
    whatToDo: 'Emita as certidões nos sites oficiais e acompanhe as datas de validade. Se aparecer alguma pendência, trate com o órgão responsável antes da disputa.',
    sources: [lei('art. 68'), CERTIDAO_FEDERAL],
  },
  {
    id: 'cnd',
    term: 'CND (certidão negativa de débitos)',
    aliases: [
      'CND',
      'certidão negativa',
      'certidões negativas',
      'certidão negativa de débitos',
      'certidão positiva com efeitos de negativa',
      'certidão de regularidade fiscal',
      'certidões',
    ],
    category: 'documents',
    definition:
      'É a certidão que mostra que a empresa não tem débitos em aberto com um órgão, como a Receita Federal, o estado ou o município. A certidão positiva com efeitos de negativa, emitida quando o débito está parcelado ou suspenso, tem os mesmos efeitos da negativa. Cada certidão tem prazo de validade.',
    whatToDo: 'Emita a certidão federal no gov.br e as estaduais e municipais nos sites da Fazenda do seu estado e da prefeitura. Guarde os arquivos e anote as datas de validade.',
    sources: [CERTIDAO_FEDERAL, lei('art. 68')],
  },
  {
    id: 'cndt',
    term: 'CNDT (certidão trabalhista)',
    aliases: ['CNDT', 'certidão negativa de débitos trabalhistas', 'certidão trabalhista', 'regularidade trabalhista'],
    category: 'documents',
    definition:
      'É a Certidão Negativa de Débitos Trabalhistas, emitida pela Justiça do Trabalho, que mostra se a empresa tem dívidas reconhecidas em processos trabalhistas. É gratuita e emitida pela internet.',
    whatToDo: 'Emita no site do Tribunal Superior do Trabalho informando o CNPJ e confira a validade antes de enviar.',
    sources: [CNDT, lei('art. 68')],
  },
  {
    id: 'crf-fgts',
    term: 'CRF do FGTS',
    aliases: ['CRF', 'certificado de regularidade do FGTS', 'regularidade do FGTS'],
    category: 'documents',
    definition:
      'É o Certificado de Regularidade do FGTS, emitido pela Caixa, que mostra que a empresa está em dia com os depósitos do Fundo de Garantia. A validade é curta, por isso vale emitir perto da data de envio.',
    whatToDo: 'Consulte e emita no site da Caixa informando o CNPJ. Se houver pendência, ela é tratada junto à Caixa.',
    sources: [CRF, lei('art. 68')],
  },
  {
    id: 'qualificacao-tecnica',
    term: 'Qualificação técnica',
    aliases: ['capacidade técnica', 'qualificação técnico-operacional', 'qualificação técnico-profissional'],
    category: 'documents',
    definition:
      'É a prova de que a empresa e, em alguns casos, seus profissionais já executaram trabalhos parecidos com o que está sendo contratado. Costuma ser feita com atestados de capacidade técnica e, em obras e serviços de engenharia, com registros no conselho profissional.',
    whatToDo: 'Compare o que o edital pede com os atestados que você já tem. Se faltar algum, avalie se vale participar ou formar um consórcio, quando o edital permitir.',
    sources: [lei('art. 67')],
  },
  {
    id: 'atestado-capacidade-tecnica',
    term: 'Atestado de capacidade técnica',
    aliases: ['atestados de capacidade técnica', 'atestado técnico', 'atestados técnicos'],
    category: 'documents',
    definition:
      'É uma declaração emitida por um cliente, público ou privado, confirmando que a empresa já forneceu ou executou algo parecido. O edital pode exigir quantidades mínimas, limitadas em regra a 50% das parcelas mais relevantes do que está sendo contratado.',
    whatToDo: 'Peça atestados aos clientes ao terminar cada entrega, com descrição, quantidades, período e contato de quem assina. Guarde também notas fiscais e contratos que comprovem o trabalho.',
    sources: [lei('art. 67')],
  },
  {
    id: 'qualificacao-economica',
    term: 'Qualificação econômico-financeira',
    aliases: ['qualificação econômica', 'balanço patrimonial', 'índices contábeis', 'certidão negativa de falência'],
    category: 'documents',
    definition:
      'É a prova de que a empresa tem saúde financeira para cumprir o contrato. Pode envolver balanço patrimonial dos dois últimos exercícios, índices contábeis e certidão negativa de falência.',
    whatToDo: 'Converse com seu contador sobre os documentos e índices pedidos no edital, com antecedência.',
    sources: [lei('art. 69')],
  },
  {
    id: 'visita-tecnica',
    term: 'Visita técnica (vistoria)',
    aliases: ['visita técnica', 'vistoria', 'declaração de vistoria'],
    category: 'documents',
    definition:
      'É a visita ao local onde o serviço ou a obra será executado, para conhecer as condições antes de fazer a proposta. Quando o edital exige a vistoria, deve permitir substituí-la por uma declaração de que a empresa conhece as condições do local.',
    whatToDo: 'Veja no edital se a visita é obrigatória ou facultativa, como agendar e até quando. Se optar pela declaração, leia com atenção o que ela afirma.',
    sources: [lei('art. 63')],
  },
  {
    id: 'amostra',
    term: 'Amostra ou prova de conceito',
    aliases: ['amostra', 'amostras', 'prova de conceito'],
    category: 'documents',
    definition:
      'É a análise do produto ou da solução oferecida pelo licitante mais bem colocado, para confirmar que atende ao termo de referência. O edital define prazo, local e critérios de avaliação.',
    whatToDo: 'Separe o produto com antecedência e confira o prazo de entrega da amostra: perder o prazo pode levar à desclassificação.',
    sources: [lei('arts. 17 e 41')],
  },

  // Proposta e disputa
  {
    id: 'proposta',
    term: 'Proposta',
    aliases: ['propostas', 'proposta comercial', 'proposta de preços'],
    category: 'dispute',
    definition:
      'É a oferta formal da empresa, com preço e descrição do que será fornecido, enviada pela plataforma até o prazo do edital. Depois da disputa, o vencedor normalmente precisa enviar a proposta ajustada ao último lance.',
    whatToDo: 'Siga o modelo do edital, se houver, e confira marca, modelo, prazo de validade da proposta e o que está incluído no preço.',
    sources: [lei('arts. 55 a 59')],
  },
  {
    id: 'lance',
    term: 'Lance',
    aliases: ['lances', 'fase de lances', 'sessão de lances', 'modo de disputa', 'disputa aberta', 'disputa fechada'],
    category: 'dispute',
    definition:
      'É cada nova oferta de preço feita durante a sessão de disputa, depois que as propostas são abertas. No modo aberto, os lances aparecem para todos e podem ser cobertos; no modo fechado, as ofertas ficam sigilosas até a abertura. O edital define o modo de disputa, que pode combinar os dois.',
    whatToDo: 'Defina antes da sessão o menor preço que você aceita e não passe dele durante a disputa. Acompanhe as mensagens do sistema, por onde o pregoeiro ou agente de contratação dá avisos.',
    sources: [lei('art. 56')],
  },
  {
    id: 'criterio-julgamento',
    term: 'Critério de julgamento',
    aliases: ['menor preço', 'maior desconto', 'técnica e preço', 'melhor técnica'],
    category: 'dispute',
    definition:
      'É a regra que define quem vence a disputa, como menor preço, maior desconto ou técnica e preço. O critério vem no edital, e o resultado pode ser apurado por item, por lote ou pelo total.',
    whatToDo: 'Confira o critério e se a disputa é por item ou por lote: isso muda o que você precisa oferecer para concorrer.',
    sources: [lei('art. 33')],
  },
  {
    id: 'valor-estimado',
    term: 'Valor estimado',
    aliases: ['valor estimado da contratação', 'orçamento estimado', 'preço de referência', 'orçamento sigiloso'],
    category: 'dispute',
    definition:
      'É quanto o órgão calculou que a compra deve custar, a partir de pesquisa de preços. Ele pode ser divulgado no edital ou ficar sigiloso até o fim do julgamento, quando o órgão justifica.',
    whatToDo: 'Use o valor estimado como referência, não como meta. Propostas acima dele podem ser desclassificadas, e preços muito abaixo podem ser questionados.',
    sources: [lei('arts. 23, 24 e 59')],
  },
  {
    id: 'inexequivel',
    term: 'Proposta inexequível',
    aliases: ['inexequível', 'inexequibilidade', 'preço inexequível'],
    category: 'dispute',
    definition:
      'É a proposta com preço tão baixo que o órgão entende que não será possível cumprir o contrato. Nesse caso o órgão pode pedir que a empresa comprove que consegue executar pelo preço oferecido, e a proposta pode ser desclassificada.',
    whatToDo: 'Tenha a composição de custos pronta para mostrar como chegou ao preço, caso seja questionado.',
    sources: [lei('art. 59')],
  },
  {
    id: 'deserta-fracassada',
    term: 'Licitação deserta ou fracassada',
    aliases: ['licitação deserta', 'licitação fracassada', 'item deserto', 'item fracassado', 'deserta', 'fracassada'],
    category: 'dispute',
    definition:
      'Deserta é a licitação, ou o item, em que nenhuma empresa apresentou proposta. Fracassada é quando houve propostas, mas todas foram desclassificadas ou as empresas foram inabilitadas.',
    whatToDo: 'Itens desertos ou fracassados podem voltar em nova licitação ou em contratação direta. Vale acompanhar o órgão se o item interessa à sua empresa.',
    sources: [lei('art. 75')],
  },

  // Dúvidas, contestação e resultado
  {
    id: 'esclarecimento',
    term: 'Pedido de esclarecimento',
    aliases: ['pedidos de esclarecimento', 'esclarecimento', 'esclarecimentos'],
    category: 'contest',
    definition:
      'É a pergunta formal feita ao órgão sobre algum ponto do edital que não ficou claro. Qualquer pessoa pode pedir, dentro do prazo previsto no edital e na lei, e as respostas são divulgadas no site oficial.',
    whatToDo: 'Envie a dúvida pelo canal indicado no edital, de forma objetiva, e acompanhe as respostas publicadas: elas podem mudar a forma de participar.',
    sources: [lei('art. 164')],
  },
  {
    id: 'impugnacao',
    term: 'Impugnação',
    aliases: ['impugnações', 'impugnar', 'impugnação ao edital'],
    category: 'contest',
    definition:
      'É o pedido formal para corrigir uma regra do edital considerada irregular, como uma exigência que restringe a competição sem justificativa. Pela Lei 14.133, qualquer pessoa pode impugnar até 3 dias úteis antes da abertura do certame.',
    whatToDo: 'Aponte com clareza o trecho do edital e por que ele é irregular. Em casos complexos, procure orientação jurídica.',
    sources: [lei('art. 164')],
  },
  {
    id: 'recurso',
    term: 'Recurso',
    aliases: ['recursos', 'fase recursal', 'intenção de recurso', 'intenção de recorrer', 'contrarrazões'],
    category: 'contest',
    definition:
      'É o pedido para rever uma decisão da licitação, como o julgamento das propostas ou a habilitação de uma empresa. Em geral, a intenção de recorrer deve ser manifestada logo após a decisão, e as razões são apresentadas em 3 dias úteis, conforme a Lei 14.133 e o edital.',
    whatToDo: 'Acompanhe a sessão até o fim para não perder o momento de manifestar a intenção. As demais empresas podem apresentar contrarrazões em prazo igual.',
    sources: [lei('art. 165')],
  },
  {
    id: 'adjudicacao-homologacao',
    term: 'Adjudicação e homologação',
    aliases: ['adjudicação', 'adjudicado', 'adjudicada', 'homologação', 'homologado', 'homologada'],
    category: 'contest',
    definition:
      'Adjudicação é o ato que atribui o objeto ao vencedor. Homologação é a confirmação, pela autoridade, de que o processo foi regular, o que encerra a licitação e permite convocar o vencedor.',
    whatToDo: 'Depois da homologação, fique atento à convocação para assinar o contrato ou a ata: o prazo está no edital, e a recusa sem justificativa pode gerar penalidade.',
    sources: [lei('arts. 71 e 90')],
  },
  {
    id: 'sancoes',
    term: 'Sanções e multas',
    aliases: ['sanção', 'sanções', 'multa', 'multas', 'penalidade', 'penalidades', 'impedimento de licitar', 'inidoneidade'],
    category: 'contest',
    definition:
      'São as penalidades para quem descumpre regras da licitação ou do contrato: advertência, multa, impedimento de licitar e declaração de inidoneidade. Antes de aplicar, o órgão precisa abrir processo e garantir o direito de defesa.',
    whatToDo: 'Leia a parte de sanções do edital e da minuta do contrato antes de participar. Desistir sem justificativa depois de vencer ou deixar de entregar pode gerar multa e impedimento.',
    sources: [lei('arts. 155 a 163')],
  },

  // Contrato e execução
  {
    id: 'contrato-vigencia',
    term: 'Contrato e vigência',
    aliases: ['vigência do contrato', 'vigência', 'prazo de vigência', 'contrato administrativo', 'minuta do contrato'],
    category: 'contract',
    definition:
      'O contrato formaliza o que foi vencido na licitação, com prazos, obrigações, forma de pagamento e penalidades. A vigência é o período em que ele vale; serviços contínuos podem ser contratados por até 5 anos, com prorrogações nos limites da lei.',
    whatToDo: 'Leia a minuta do contrato anexa ao edital antes de fazer a proposta: ela mostra prazos de entrega e de pagamento e as obrigações da empresa.',
    sources: [lei('arts. 89 a 114')],
  },
  {
    id: 'garantia-proposta',
    term: 'Garantia de proposta',
    aliases: [],
    category: 'contract',
    definition:
      'É uma garantia que a empresa apresenta para participar, como prova de seriedade da proposta. Pela Lei 14.133, pode ser de até 1% do valor estimado da contratação e é devolvida conforme as regras do edital.',
    whatToDo: 'Veja no edital o valor, as formas aceitas e o prazo de apresentação. Seguro-garantia e fiança bancária podem levar alguns dias para ser emitidos.',
    sources: [lei('art. 58')],
  },
  {
    id: 'garantia-contratual',
    term: 'Garantia contratual',
    aliases: ['garantia de execução', 'seguro-garantia', 'fiança bancária', 'caução'],
    category: 'contract',
    definition:
      'É a garantia exigida do vencedor para assegurar que o contrato será cumprido. Pode ser caução em dinheiro ou títulos, seguro-garantia, fiança bancária ou título de capitalização, em geral de até 5% do valor do contrato, podendo chegar a 10% em casos justificados.',
    whatToDo: 'Inclua o custo da garantia no seu preço e verifique com antecedência qual modalidade você consegue contratar.',
    sources: [lei('arts. 96 a 102')],
  },
  {
    id: 'reajuste',
    term: 'Reajuste',
    aliases: ['reajustes', 'repactuação', 'reequilíbrio', 'reequilíbrio econômico-financeiro'],
    category: 'contract',
    definition:
      'É a atualização do preço do contrato pela inflação, com índice e data-base definidos no edital. É diferente do reequilíbrio, pedido quando um fato imprevisível altera muito os custos.',
    whatToDo: 'Confira o índice e a partir de quando o reajuste vale. Para pedir reequilíbrio, guarde documentos que comprovem a mudança de custos.',
    sources: [lei('arts. 25, 92 e 124')],
  },
  {
    id: 'empenho',
    term: 'Empenho',
    aliases: ['nota de empenho', 'empenhado'],
    category: 'contract',
    definition:
      'É o ato em que o órgão reserva o dinheiro do orçamento para pagar uma compra. A nota de empenho pode substituir o contrato em casos previstos na lei, como compras com entrega imediata.',
    whatToDo: 'Em geral, a entrega começa depois do empenho ou da ordem de fornecimento; confira no edital. O pagamento vem depois que o órgão confere e aceita a entrega.',
    sources: [LEI_4320, lei('art. 95')],
  },
  {
    id: 'consorcio',
    term: 'Consórcio',
    aliases: ['consórcios'],
    category: 'contract',
    definition:
      'É a união de duas ou mais empresas para participar juntas de uma licitação, somando capacidades técnicas e financeiras. O edital pode permitir ou vedar, e as empresas respondem juntas pelas obrigações.',
    whatToDo: 'Veja se o edital permite consórcio e quais regras exige, como o compromisso de constituição e a indicação da empresa líder.',
    sources: [lei('art. 15')],
  },
  {
    id: 'subcontratacao',
    term: 'Subcontratação',
    aliases: ['subcontratar'],
    category: 'contract',
    definition:
      'É quando o contratado repassa parte do contrato a outra empresa. Só pode ocorrer nos limites autorizados pelo edital e pelo órgão, e o contratado continua responsável pelo todo.',
    whatToDo: 'Se pretende repassar parte do trabalho, confira antes se o edital permite e em que limite.',
    sources: [lei('art. 122')],
  },

  // Pequenas empresas
  {
    id: 'me-epp',
    term: 'ME/EPP',
    aliases: ['ME e EPP', 'microempresa', 'microempresas', 'empresa de pequeno porte', 'empresas de pequeno porte', 'EPP'],
    category: 'small-business',
    definition:
      'Microempresa (ME) e empresa de pequeno porte (EPP) são definidas pelo faturamento anual na Lei Complementar 123: até R$ 360 mil para ME e até R$ 4,8 milhões para EPP. Elas têm tratamento diferenciado nas licitações, como desempate a seu favor, cotas e prazo extra para regularizar certidões.',
    whatToDo: 'Declare a condição de ME/EPP onde o edital ou a plataforma pedir, somente se a empresa se enquadrar. Declaração falsa pode gerar sanção.',
    sources: [lc123('arts. 3º e 42 a 49'), lei('art. 4º')],
  },
  {
    id: 'cota-reservada',
    term: 'Cota reservada e participação exclusiva',
    aliases: ['cota reservada', 'cota reservada para ME/EPP', 'exclusivo para ME/EPP', 'participação exclusiva', 'item exclusivo'],
    category: 'small-business',
    definition:
      'Para favorecer pequenas empresas, a lei prevê itens de até R$ 80 mil com participação exclusiva de ME/EPP. Em compras de bens divisíveis, o órgão pode reservar uma cota de até 25% do objeto para elas.',
    whatToDo: 'Procure no edital os itens exclusivos ou de cota reservada: neles a disputa é só entre empresas de pequeno porte.',
    sources: [lc123('art. 48')],
  },
  {
    id: 'empate-ficto',
    term: 'Empate ficto (preferência para ME/EPP)',
    aliases: ['empate ficto', 'direito de preferência'],
    category: 'small-business',
    definition:
      'Quando a proposta de uma ME/EPP fica até 10% acima da melhor oferta de uma empresa maior, ou até 5% no pregão, a lei considera que há empate. A ME/EPP mais bem colocada pode então cobrir a melhor oferta e ficar com o item.',
    whatToDo: 'Fique conectado ao fim da disputa: a plataforma abre um prazo curto para a ME/EPP apresentar a nova oferta.',
    sources: [lc123('arts. 44 e 45')],
  },
  {
    id: 'regularizacao-me-epp',
    term: 'Regularização fiscal tardia (ME/EPP)',
    aliases: ['regularização tardia', 'restrição fiscal', 'pendência fiscal'],
    category: 'small-business',
    definition:
      'A ME/EPP pode participar mesmo com alguma restrição na regularidade fiscal ou trabalhista, mas precisa apresentar os documentos exigidos. Se vencer, tem 5 dias úteis, prorrogáveis por igual período, para regularizar. Se não regularizar, perde o direito à contratação e pode sofrer sanção.',
    whatToDo: 'Não conte com o prazo extra como rotina: verifique as certidões antes de disputar e procure seu contador se houver dívida, inclusive no Simples Nacional.',
    sources: [lc123('arts. 42 e 43'), SIMPLES],
  },

  // Cultura, ciência, inovação e parcerias
  {
    id: 'chamada-publica',
    term: 'Chamada pública',
    aliases: ['chamada', 'edital de fomento', 'seleção pública', 'oportunidade de fomento', 'CNPq', 'CAPES', 'FINEP', 'MinC', 'Funarte'],
    category: 'national-opportunities',
    definition:
      'É um convite para pessoas ou organizações apresentarem projetos, propostas ou manifestações de interesse conforme regras publicadas. Em fomento, a seleção costuma considerar elegibilidade e mérito; não há disputa de lances como em um pregão.',
    whatToDo: 'Confira quem pode participar, o que recebe apoio, as despesas permitidas, os critérios de avaliação e o sistema de submissão.',
    sources: [CNPQ, TRANSFEREGOV],
    detect: false,
  },
  {
    id: 'proponente',
    term: 'Proponente',
    aliases: ['propositor', 'responsável pela proposta', 'coordenador da proposta', 'coordenador do projeto'],
    category: 'national-opportunities',
    definition:
      'É a pessoa ou organização que apresenta a proposta e responde por ela. Cada fonte define quem pode ser proponente: pessoa física, empresa, instituição científica, organização da sociedade civil ou órgão público.',
    whatToDo: 'Confirme a elegibilidade antes de preparar o projeto e use o cadastro da pessoa ou organização que realmente assumirá as obrigações.',
    sources: [MAPAS_CULTURAIS, ROUANET, CNPQ],
    detect: false,
  },
  {
    id: 'agente-cultural',
    term: 'Agente cultural',
    aliases: ['agente individual', 'agente coletivo', 'perfil de agente', 'Mapas Culturais', 'Mapa da Cultura'],
    category: 'national-opportunities',
    definition:
      'É o perfil usado no Mapas Culturais para representar uma pessoa ou um coletivo. O agente reúne dados e portfólio e é selecionado no momento da inscrição em uma oportunidade.',
    whatToDo: 'Crie ou atualize o agente adequado antes de se inscrever e confira se o edital aceita agente individual, coletivo ou ambos.',
    sources: [MAPAS_CULTURAIS],
    detect: false,
  },
  {
    id: 'inscricao-mapas',
    term: 'Inscrição e categoria (Mapas Culturais)',
    aliases: ['número de inscrição', 'categoria de inscrição', 'oportunidade', 'formulário de inscrição', 'Mapas Culturais'],
    category: 'national-opportunities',
    definition:
      'Inscrição é o formulário enviado para uma oportunidade no Mapas Culturais. A categoria separa linhas, perfis ou tipos de apoio dentro do mesmo edital e pode mudar campos, documentos e critérios.',
    whatToDo: 'Escolha a categoria correta antes de preencher, revise os anexos e guarde o número ou comprovante gerado após o envio.',
    sources: [MAPAS_CULTURAIS],
    detect: false,
  },
  {
    id: 'bolsa-auxilio',
    term: 'Bolsa e auxílio',
    aliases: ['bolsista', 'auxílio à pesquisa', 'auxílio financeiro', 'CNPq', 'CAPES'],
    category: 'national-opportunities',
    definition:
      'Bolsa costuma apoiar a formação ou atuação de uma pessoa por determinado período. Auxílio financia despesas de um projeto, evento, pesquisa ou missão; modalidades, beneficiários e itens permitidos mudam em cada chamada.',
    whatToDo: 'Confira quem recebe o recurso, quais despesas são aceitas e se a chamada exige currículo Lattes, vínculo institucional ou indicação de coordenador.',
    sources: [CNPQ],
    detect: false,
  },
  {
    id: 'subvencao-economica',
    term: 'Subvenção econômica',
    aliases: ['subvenção', 'subvenção para inovação', 'recurso não reembolsável para empresa', 'FINEP'],
    category: 'national-opportunities',
    definition:
      'É apoio público não reembolsável destinado a empresas para atividades de inovação previstas na chamada. Não é dinheiro livre: há plano aprovado, despesas permitidas, acompanhamento, prestação de contas e possível contrapartida.',
    whatToDo: 'Valide o porte e o tipo de empresa elegível, a tecnologia apoiada, a contrapartida mínima e os gastos financiáveis.',
    sources: [FINEP],
    detect: false,
  },
  {
    id: 'recursos-reembolsaveis',
    term: 'Recursos reembolsáveis e não reembolsáveis',
    aliases: ['financiamento reembolsável', 'financiamento não reembolsável', 'crédito', 'recursos não reembolsáveis', 'FINEP'],
    category: 'national-opportunities',
    definition:
      'Reembolsável é financiamento que deve ser pago nas condições contratadas. Não reembolsável não exige devolução normal do valor, mas depende do cumprimento do projeto, das despesas autorizadas e da prestação de contas.',
    whatToDo: 'Não compare apenas o valor anunciado. Confira juros, garantias e prazo no crédito, ou contrapartida, itens financiáveis e obrigações no apoio não reembolsável.',
    sources: [FINEP],
    detect: false,
  },
  {
    id: 'contrapartida',
    term: 'Contrapartida',
    aliases: ['contrapartida financeira', 'contrapartida econômica', 'aporte próprio'],
    category: 'national-opportunities',
    definition:
      'É a contribuição que o beneficiário precisa colocar no projeto além do recurso recebido. Conforme a chamada, pode ser dinheiro ou bens e serviços economicamente mensuráveis.',
    whatToDo: 'Calcule a contrapartida antes de se inscrever e confirme percentual, forma aceita, período de gasto e documentos para comprová-la.',
    sources: [TRANSFEREGOV, FINEP],
    detect: false,
  },
  {
    id: 'plano-trabalho',
    term: 'Plano de trabalho',
    aliases: ['plano de execução', 'metas', 'etapas', 'cronograma físico-financeiro'],
    category: 'national-opportunities',
    definition:
      'É o documento que organiza o que será feito, as metas, etapas, prazos, orçamento e resultados esperados. Depois da aprovação, ele orienta a execução e a prestação de contas.',
    whatToDo: 'Faça atividades, prazos e custos conversarem entre si. Não prometa uma entrega que o orçamento ou a equipe não conseguem sustentar.',
    sources: [TRANSFEREGOV],
    detect: false,
  },
  {
    id: 'termo-fomento-colaboracao',
    term: 'Termo de fomento e termo de colaboração',
    aliases: ['termo de fomento', 'termo de colaboração', 'MROSC', 'organização da sociedade civil', 'OSC', 'Transferegov'],
    category: 'national-opportunities',
    definition:
      'São instrumentos de parceria com organizações da sociedade civil. No termo de fomento, a iniciativa da proposta é da organização; no termo de colaboração, a política ou proposta parte da administração pública.',
    whatToDo: 'Confirme se sua organização é elegível e leia as regras do chamamento sobre plano de trabalho, seleção, execução e prestação de contas.',
    sources: [TRANSFEREGOV],
    detect: false,
  },
  {
    id: 'concedente-convenente',
    term: 'Concedente e convenente',
    aliases: ['concedente', 'convenente', 'órgão concedente', 'Transferegov'],
    category: 'national-opportunities',
    definition:
      'Concedente é o órgão ou entidade federal responsável por transferir os recursos. Convenente é o ente ou organização que celebra o instrumento e assume a execução do programa, projeto, atividade, obra ou serviço.',
    whatToDo: 'Confirme em qual papel sua organização aparece e quais responsabilidades de cadastro, execução e prestação de contas cabem a ela.',
    sources: [TRANSFEREGOV],
    detect: false,
  },
  {
    id: 'captacao-rouanet',
    term: 'Captação na Lei Rouanet',
    aliases: ['captação de recursos', 'Salic', 'Pronac', 'projeto incentivado', 'mecenato', 'incentivo fiscal'],
    category: 'national-opportunities',
    definition:
      'Depois da aprovação técnica, o proponente autorizado busca patrocinadores ou doadores para financiar o projeto por incentivo fiscal. Aprovação não é repasse automático e o valor precisa ser captado nas condições do mecanismo.',
    whatToDo: 'Cadastre e acompanhe a proposta no Salic, confira a autorização para captar e planeje a abordagem a incentivadores antes da execução.',
    sources: [ROUANET],
    detect: false,
  },

  // Oportunidades internacionais
  {
    id: 'expressao-interesse',
    term: 'EOI ou REOI (expressão de interesse)',
    aliases: ['EOI', 'REOI', 'expression of interest', 'request for expressions of interest', 'manifestação de interesse', 'Banco Mundial', 'BID'],
    category: 'international-opportunities',
    definition:
      'É uma etapa usada principalmente para selecionar consultores ou empresas que demonstram experiência e capacidade. Em geral, não é a proposta técnica e comercial final; serve para formar uma lista de candidatos qualificados.',
    whatToDo: 'Responda exatamente às qualificações pedidas, com experiências relevantes e comprováveis. Confira se o aviso aceita empresa, consultor individual ou associação.',
    sources: [WORLD_BANK, IDB],
    detect: false,
  },
  {
    id: 'ifb-rfb-rfp-rfq',
    term: 'IFB, RFB, RFP e RFQ',
    aliases: ['invitation for bids', 'request for bids', 'request for proposals', 'request for quotations', 'convite para licitar', 'pedido de propostas', 'pedido de cotação'],
    category: 'international-opportunities',
    definition:
      'São siglas de documentos de disputa internacional. IFB ou RFB convidam a enviar oferta; RFP pede proposta, muitas vezes técnica e financeira; RFQ solicita cotações em processos mais simples.',
    whatToDo: 'Identifique qual documento foi publicado e siga suas instruções de idioma, moeda, garantia, formato e canal de entrega.',
    sources: [WORLD_BANK, WORLD_BANK_NOTICES, IDB],
    detect: false,
  },
  {
    id: 'lista-curta',
    term: 'Shortlist (lista curta)',
    aliases: ['short list', 'lista curta', 'pré-seleção', 'preselection'],
    category: 'international-opportunities',
    definition:
      'É a lista de consultores ou empresas pré-selecionados depois da análise das expressões de interesse. Apenas os integrantes da lista recebem o convite para apresentar a proposta na etapa seguinte, quando o procedimento prevê essa seleção.',
    whatToDo: 'Trate a expressão de interesse como uma etapa própria. Ser incluído na shortlist habilita a continuar, mas ainda não significa vencer o contrato.',
    sources: [WORLD_BANK, IDB],
    detect: false,
  },
  {
    id: 'mutuario-agencia-executora',
    term: 'Borrower e executing agency',
    aliases: ['borrower', 'mutuário', 'executing agency', 'agência executora', 'entidade executora', 'implementing agency'],
    category: 'international-opportunities',
    definition:
      'Borrower é o país ou entidade que recebe o financiamento. Executing agency é a instituição que executa o projeto e normalmente conduz a compra, publica contatos e recebe manifestações, propostas ou dúvidas.',
    whatToDo: 'Use os contatos e o canal indicados no aviso da entidade executora. O banco financiador nem sempre recebe a sua documentação.',
    sources: [WORLD_BANK_NOTICES, IDB],
    detect: false,
  },
  {
    id: 'contract-award',
    term: 'Contract award',
    aliases: ['contract award notice', 'notice of contract award', 'aviso de adjudicação', 'contrato adjudicado'],
    category: 'international-opportunities',
    definition:
      'É o aviso de que um contrato internacional já foi atribuído a um fornecedor ou consultor. Ele informa o resultado de uma seleção anterior e, por isso, não é uma oportunidade aberta para enviar proposta.',
    whatToDo: 'Use o aviso para conhecer compradores, vencedores e preços praticados, e procure os novos procurement notices do mesmo projeto.',
    sources: [WORLD_BANK_NOTICES, IDB],
    detect: false,
  },
  {
    id: 'call-topic',
    term: 'Call e topic (União Europeia)',
    aliases: ['call for proposals', 'topic', 'tópico', 'chamada europeia', 'Funding & Tenders', 'União Europeia'],
    category: 'international-opportunities',
    definition:
      'Call é a chamada ampla de financiamento. Topic é o recorte específico dentro dela, com objetivos, orçamento, condições, documentos e prazo próprios para a proposta.',
    whatToDo: 'Leia a página do topic e seus documentos. É ali que ficam as condições efetivas, inclusive países elegíveis, composição do consórcio e taxa de financiamento.',
    sources: [EU_GLOSSARY, EU_MANUAL],
    detect: false,
  },
  {
    id: 'applicant-beneficiary',
    term: 'Applicant e beneficiary',
    aliases: ['applicant', 'candidato', 'beneficiary', 'beneficiário', 'participant', 'coordinator', 'partner', 'coordenador', 'parceiro'],
    category: 'international-opportunities',
    definition:
      'Applicant é a organização que prepara ou envia a proposta. Depois da aprovação e da assinatura do acordo, a organização que recebe o apoio e assume obrigações passa a ser beneficiary; o coordinator representa o consórcio perante a União Europeia.',
    whatToDo: 'Defina cedo quem será o coordenador e quais organizações serão parceiras. Cada papel traz tarefas e documentos diferentes.',
    sources: [EU_GLOSSARY, EU_MANUAL],
    detect: false,
  },
  {
    id: 'consorcio-pic',
    term: 'Consortium e PIC',
    aliases: ['consortium', 'consórcio europeu', 'PIC', 'participant identification code', 'Participant Register'],
    category: 'international-opportunities',
    definition:
      'Consortium é o grupo de organizações que apresenta e executa a proposta em conjunto. PIC é o código de nove dígitos obtido ao registrar uma organização no Participant Register da Comissão Europeia.',
    whatToDo: 'Confira quantos parceiros e países o topic exige e registre cada organização com antecedência para obter ou validar o PIC.',
    sources: [EU_GLOSSARY, EU_MANUAL],
    detect: false,
  },
  {
    id: 'grant-agreement',
    term: 'Grant agreement',
    aliases: ['acordo de subvenção', 'contrato de subvenção', 'GA', 'grant preparation'],
    category: 'international-opportunities',
    definition:
      'É o acordo que formaliza uma subvenção da União Europeia depois da seleção. Ele define atividades, orçamento, contribuição europeia, prazos, direitos, obrigações, relatórios e condições de pagamento.',
    whatToDo: 'Antes de assinar, alinhe responsabilidades, orçamento e entregas entre coordenador e parceiros e confira o acordo do consórcio, quando exigido.',
    sources: [EU_GLOSSARY, EU_MANUAL],
    detect: false,
  },
];

export const glossaryById = new Map(GLOSSARY.map((entry) => [entry.id, entry]));

/** "Primeiros passos para vender ao governo": general order, no promise of result. */
export const FIRST_STEPS: { title: string; text: string }[] = [
  {
    title: 'Organize os documentos da empresa',
    text: 'Reúna contrato social, CNPJ e as certidões de regularidade fiscal e trabalhista. Anote as validades: a maioria precisa ser renovada de tempos em tempos.',
  },
  {
    title: 'Confira se a empresa é ME/EPP',
    text: 'Microempresas e empresas de pequeno porte têm cota reservada, desempate a seu favor e prazo extra para regularizar certidões. Confirme o enquadramento com seu contador.',
  },
  {
    title: 'Faça os cadastros e o certificado digital',
    text: 'Para compras federais, faça o cadastro no SICAF com a conta gov.br. Estados e municípios usam outras plataformas de disputa, cada uma com seu cadastro; algumas pedem certificado digital.',
  },
  {
    title: 'Encontre editais do seu ramo',
    text: 'Busque por palavras do que você vende e filtre por modalidade, estado e prazo. Comece por pregão eletrônico e dispensa, que costumam ter regras mais simples.',
  },
  {
    title: 'Leia o edital antes de decidir',
    text: 'Veja o objeto no termo de referência, os documentos de habilitação, os prazos e as garantias. Se algo estiver confuso, faça um pedido de esclarecimento dentro do prazo.',
  },
  {
    title: 'Envie a proposta e acompanhe a sessão',
    text: 'Envie a proposta na plataforma até o prazo, defina antes o menor preço que aceita e acompanhe a fase de lances. Depois, fique atento ao resultado, ao prazo de recurso e à convocação para assinar.',
  },
];
