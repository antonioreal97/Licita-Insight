import { CATEGORY_LABELS, type GlossaryCategory, type GlossaryEntry } from './glossary';

export type GlossaryTopic = {
  title: string;
  description: string;
  analogy: string;
};

export type GlossaryLearningNote = {
  example: string;
  remember: string;
};

export const GLOSSARY_TOPICS: Record<GlossaryCategory, GlossaryTopic> = {
  basics: {
    title: CATEGORY_LABELS.basics,
    description: 'Aprenda quem cria as regras, onde os avisos aparecem e quais documentos explicam a compra.',
    analogy: 'Pense em um jogo: a lei cria as regras gerais, o edital explica a partida e o termo de referência mostra o que precisa ser entregue.',
  },
  modalities: {
    title: CATEGORY_LABELS.modalities,
    description: 'Descubra os diferentes caminhos que o governo pode usar para comprar, contratar ou vender bens.',
    analogy: 'São portas diferentes para chegar a uma contratação. Cada porta tem uma regra, um prazo e um tipo de disputa.',
  },
  registration: {
    title: CATEGORY_LABELS.registration,
    description: 'Entenda os cadastros, sistemas e chaves digitais necessários para entrar em uma disputa.',
    analogy: 'É como preparar a entrada em um campeonato: você faz a inscrição, confirma sua identidade e aprende onde a partida acontece.',
  },
  documents: {
    title: CATEGORY_LABELS.documents,
    description: 'Veja quais provas mostram que sua empresa existe, está regular e consegue fazer o trabalho.',
    analogy: 'É a mochila de documentos da empresa. Cada comprovante responde a uma pergunta diferente do órgão público.',
  },
  dispute: {
    title: CATEGORY_LABELS.dispute,
    description: 'Aprenda como preços, lances e critérios são usados para escolher a melhor proposta.',
    analogy: 'É a parte do placar: as empresas apresentam ofertas e o edital diz qual regra será usada para escolher a vencedora.',
  },
  contest: {
    title: CATEGORY_LABELS.contest,
    description: 'Saiba como perguntar, apontar um problema e pedir que uma decisão seja revista.',
    analogy: 'É o direito de levantar a mão: primeiro para tirar uma dúvida, depois para corrigir uma regra ou contestar uma decisão.',
  },
  contract: {
    title: CATEGORY_LABELS.contract,
    description: 'Entenda o que acontece depois da vitória, do compromisso assinado ao pagamento.',
    analogy: 'Ganhar a disputa é só o começo. O contrato transforma a promessa em tarefas, prazos e responsabilidades reais.',
  },
  'small-business': {
    title: CATEGORY_LABELS['small-business'],
    description: 'Conheça as regras que ajudam micro e pequenas empresas a competir nas compras públicas.',
    analogy: 'É como uma rampa de acesso: a disputa continua séria, mas algumas regras reduzem desvantagens das empresas menores.',
  },
  'national-opportunities': {
    title: CATEGORY_LABELS['national-opportunities'],
    description: 'Aprenda a linguagem usada em editais de cultura, pesquisa, inovação e parcerias públicas.',
    analogy: 'Aqui você não vende apenas um produto. Muitas vezes apresenta uma ideia, um projeto e um plano para usar o recurso.',
  },
  'international-opportunities': {
    title: CATEGORY_LABELS['international-opportunities'],
    description: 'Traduza as siglas mais comuns de bancos internacionais e chamadas da União Europeia.',
    analogy: 'O processo é parecido, mas as placas estão em outro idioma. Saber as siglas ajuda a encontrar a porta certa.',
  },
};

export const GLOSSARY_LEARNING_NOTES: Record<string, GlossaryLearningNote> = {
  'lei-14133': {
    example: 'Uma prefeitura quer comprar computadores. A Lei 14.133 diz quais caminhos ela pode usar e quais cuidados deve tomar.',
    remember: 'A lei traz as regras gerais. O edital traz as regras daquela oportunidade.',
  },
  edital: {
    example: 'O edital informa quantos computadores serão comprados, quando enviar a proposta e quais documentos a empresa deve apresentar.',
    remember: 'Se a resposta não estiver na tela do portal, procure no edital e nos anexos.',
  },
  'termo-de-referencia': {
    example: 'Em vez de dizer apenas “computador”, o termo de referência detalha memória, armazenamento, garantia e prazo de entrega.',
    remember: 'É a descrição detalhada do que o órgão espera receber.',
  },
  pncp: {
    example: 'Você pesquisa no PNCP e encontra avisos publicados por órgãos de diferentes cidades e estados em um só lugar.',
    remember: 'O PNCP divulga a oportunidade. A disputa pode acontecer em outra plataforma.',
  },
  uasg: {
    example: 'Dois setores do mesmo ministério podem ter UASGs diferentes, como duas unidades de uma mesma rede escolar.',
    remember: 'A UASG identifica a unidade compradora, não a modalidade da licitação.',
  },
  retificacao: {
    example: 'O edital dizia entrega em 10 dias, mas uma retificação mudou o prazo para 20 dias e adiou a disputa.',
    remember: 'Uma retificação pode mudar sua proposta. Leia sempre a versão mais recente.',
  },
  pregao: {
    example: 'Várias empresas oferecem o mesmo tipo de cadeira e reduzem seus preços durante uma sessão eletrônica.',
    remember: 'No pregão, preço e acompanhamento da sessão costumam ser decisivos.',
  },
  concorrencia: {
    example: 'Um órgão contrata uma obra e compara preço, experiência técnica e outros critérios definidos no edital.',
    remember: 'Concorrência costuma aparecer em objetos especiais, obras e serviços de engenharia.',
  },
  dispensa: {
    example: 'Uma escola precisa comprar rapidamente um item de baixo valor e publica um aviso curto para receber propostas.',
    remember: 'Dispensa não significa compra sem regra. Existe justificativa, processo e prazo.',
  },
  inexigibilidade: {
    example: 'Um museu contrata uma obra de um artista específico, sem existir outra pessoa capaz de entregar aquela mesma obra.',
    remember: 'Ela ocorre quando uma competição verdadeira não é possível.',
  },
  credenciamento: {
    example: 'Uma prefeitura aprova todos os laboratórios que cumprem as condições e chama cada um quando surge demanda.',
    remember: 'Quem cumpre as condições entra na lista. Não existe necessariamente um único vencedor.',
  },
  leilao: {
    example: 'O governo anuncia veículos que não usa mais, e os interessados fazem lances para comprá-los.',
    remember: 'No leilão, você normalmente compra do governo.',
  },
  'dialogo-competitivo': {
    example: 'O órgão tem um problema tecnológico complexo, conversa com empresas selecionadas e depois pede propostas finais.',
    remember: 'Primeiro se constrói uma solução possível. Depois vem a proposta final.',
  },
  'registro-de-precos': {
    example: 'Um órgão registra o preço do papel por um ano e faz pedidos menores conforme precisa, sem comprar tudo de uma vez.',
    remember: 'A ata registra condições para compras futuras, mas não garante que todo o volume será comprado.',
  },
  'adesao-ata': {
    example: 'Uma prefeitura usa, com autorização, a ata criada por outro órgão para comprar o mesmo papel pelo preço registrado.',
    remember: 'O fornecedor avalia e aceita a nova demanda antes de atender a carona.',
  },
  sicaf: {
    example: 'A empresa coloca dados e certidões no SICAF para não começar seu cadastro do zero em cada pregão federal.',
    remember: 'SICAF é o cadastro do fornecedor. Mantenha os documentos atualizados.',
  },
  'compras-gov': {
    example: 'Você entra no Compras.gov.br, envia a proposta e acompanha os lances e as mensagens do pregoeiro.',
    remember: 'É uma plataforma de disputa. Confira se o edital escolheu esse sistema.',
  },
  'plataforma-disputa': {
    example: 'O aviso aparece no PNCP, mas o edital manda enviar a proposta em um sistema eletrônico específico.',
    remember: 'Descobrir a plataforma cedo evita perder a oportunidade por falta de cadastro.',
  },
  'certificado-digital': {
    example: 'A pessoa responsável usa o e-CNPJ para assinar um documento eletrônico em nome da empresa.',
    remember: 'É uma identidade e uma assinatura digital com validade jurídica.',
  },
  habilitacao: {
    example: 'Depois dos lances, o órgão confere os documentos da empresa mais bem colocada antes de confirmar a vitória.',
    remember: 'Preço bom não basta. A empresa também precisa provar que pode contratar.',
  },
  'habilitacao-juridica': {
    example: 'O contrato social mostra que a empresa existe e quem pode assinar por ela.',
    remember: 'Ela responde: esta empresa existe legalmente e quem a representa?',
  },
  'regularidade-fiscal': {
    example: 'As certidões mostram se a empresa está em dia com tributos federais, estaduais e municipais.',
    remember: 'Cada certidão tem origem e validade próprias.',
  },
  cnd: {
    example: 'A empresa emite uma certidão no site oficial para provar que não possui débitos em aberto naquele órgão.',
    remember: 'CND vencida pode não servir. Confira a validade antes do envio.',
  },
  cndt: {
    example: 'A Justiça do Trabalho emite a CNDT para mostrar a situação das dívidas trabalhistas da empresa.',
    remember: 'CNDT trata de débitos trabalhistas.',
  },
  'crf-fgts': {
    example: 'A Caixa emite o CRF para confirmar que a empresa está regular com os depósitos do FGTS.',
    remember: 'CRF trata do FGTS e costuma ter validade curta.',
  },
  'qualificacao-tecnica': {
    example: 'Para instalar uma rede grande, a empresa mostra que já executou serviços parecidos e tem equipe preparada.',
    remember: 'Ela responde: a empresa sabe fazer o que está oferecendo?',
  },
  'atestado-capacidade-tecnica': {
    example: 'Um cliente declara que sua empresa entregou 200 cadeiras corretamente e dentro do prazo.',
    remember: 'Peça atestados depois de boas entregas e guarde os comprovantes.',
  },
  'qualificacao-economica': {
    example: 'O balanço ajuda o órgão a verificar se a empresa tem estrutura financeira para sustentar um contrato grande.',
    remember: 'Ela responde: a empresa consegue manter o contrato financeiramente?',
  },
  'visita-tecnica': {
    example: 'Antes de orçar uma reforma, a empresa visita o prédio para entender o espaço e os desafios do serviço.',
    remember: 'Confira como agendar e se o edital aceita uma declaração no lugar da visita.',
  },
  amostra: {
    example: 'A empresa mais bem colocada entrega uma cadeira para o órgão conferir material, medidas e resistência.',
    remember: 'A amostra prova, na prática, que o produto atende ao pedido.',
  },
  proposta: {
    example: 'A empresa informa o produto, a marca, o preço, o prazo de entrega e a validade de sua oferta.',
    remember: 'A proposta é um compromisso formal. Confira tudo antes de enviar.',
  },
  lance: {
    example: 'Durante a sessão, uma empresa oferece R$ 100 e outra reduz para R$ 95, respeitando as regras do sistema.',
    remember: 'Defina seu limite antes de competir para não vender com prejuízo.',
  },
  'criterio-julgamento': {
    example: 'Uma compra escolhe o menor preço, enquanto outra combina qualidade técnica e preço.',
    remember: 'O critério explica como o órgão transforma propostas em classificação.',
  },
  'valor-estimado': {
    example: 'Após pesquisar preços, o órgão calcula que a compra deve custar perto de R$ 50 mil.',
    remember: 'É uma referência do órgão, não uma garantia de pagamento.',
  },
  inexequivel: {
    example: 'Uma proposta custa menos que os próprios materiais necessários, então o órgão pede uma explicação dos custos.',
    remember: 'Preço baixo demais também pode eliminar uma proposta.',
  },
  'deserta-fracassada': {
    example: 'É deserta quando ninguém envia proposta. É fracassada quando propostas chegam, mas nenhuma pode ser aceita.',
    remember: 'Deserta significa sem participantes. Fracassada significa sem proposta válida.',
  },
  esclarecimento: {
    example: 'A empresa pergunta oficialmente se a medida indicada no edital aceita uma pequena variação.',
    remember: 'Use o esclarecimento para perguntar, não para contestar uma ilegalidade.',
  },
  impugnacao: {
    example: 'Uma exigência parece impedir concorrentes sem motivo, então a empresa pede que o edital seja corrigido.',
    remember: 'Impugnação questiona uma regra do edital antes da disputa.',
  },
  recurso: {
    example: 'A empresa é inabilitada, discorda da análise e apresenta seus argumentos dentro do prazo.',
    remember: 'Recurso questiona uma decisão tomada no processo.',
  },
  'adjudicacao-homologacao': {
    example: 'O objeto é atribuído à vencedora e a autoridade confirma que o processo pode seguir para contratação.',
    remember: 'Adjudicar aponta a vencedora. Homologar confirma o resultado do processo.',
  },
  sancoes: {
    example: 'Uma empresa abandona a entrega sem justificativa e recebe multa prevista no edital e no contrato.',
    remember: 'Descumprimentos podem gerar consequências financeiras e impedir novas contratações.',
  },
  'contrato-vigencia': {
    example: 'O contrato começa em uma data, vale por 12 meses e define entregas, pagamentos e responsabilidades.',
    remember: 'Vigência é o período em que o contrato produz efeitos.',
  },
  'garantia-proposta': {
    example: 'O edital pede uma pequena garantia para reduzir o risco de a vencedora desistir da proposta.',
    remember: 'Ela protege a proposta antes da assinatura do contrato.',
  },
  'garantia-contratual': {
    example: 'Depois de assinar, a empresa apresenta uma garantia para cobrir problemas no cumprimento do contrato.',
    remember: 'Ela protege a execução do contrato, não a participação na disputa.',
  },
  reajuste: {
    example: 'Após o período previsto, o valor do contrato é atualizado pelo índice indicado no edital.',
    remember: 'Reajuste segue uma regra e uma data-base definidas, não acontece quando a empresa quiser.',
  },
  empenho: {
    example: 'Antes de comprar, o órgão reserva no orçamento o valor necessário e emite a nota de empenho.',
    remember: 'Empenho reserva o dinheiro público, mas não significa que o pagamento já aconteceu.',
  },
  consorcio: {
    example: 'Duas empresas unem experiências e capacidades para disputar juntas um contrato que seria grande demais para uma só.',
    remember: 'O edital precisa permitir e definir as regras do consórcio.',
  },
  subcontratacao: {
    example: 'A contratada executa o trabalho principal e chama outra empresa para uma parte específica permitida no edital.',
    remember: 'Subcontratar não transfere toda a responsabilidade e depende das regras do contrato.',
  },
  'me-epp': {
    example: 'Uma microempresa comprova seu enquadramento para usar benefícios previstos nas compras públicas.',
    remember: 'ME e EPP são portes empresariais definidos por lei.',
  },
  'cota-reservada': {
    example: 'Uma compra grande separa parte da quantidade para disputa exclusiva entre pequenas empresas.',
    remember: 'A cota cria uma parte reservada. A participação exclusiva limita toda a disputa.',
  },
  'empate-ficto': {
    example: 'Uma pequena empresa fica um pouco acima da primeira colocada e recebe a chance de melhorar seu preço.',
    remember: 'Não é empate exato. É uma faixa de preferência definida pela lei.',
  },
  'regularizacao-me-epp': {
    example: 'A pequena empresa vence, mas uma certidão fiscal tem problema. Ela recebe prazo para regularizar a situação.',
    remember: 'O benefício dá tempo para corrigir a regularidade fiscal, não dispensa o documento.',
  },
  'chamada-publica': {
    example: 'Uma fundação publica regras para escolher projetos de pesquisa que receberão apoio financeiro.',
    remember: 'A chamada explica quem pode participar, o que será apoiado e como enviar a proposta.',
  },
  proponente: {
    example: 'Uma associação envia um projeto e passa a ser a proponente responsável pelas informações apresentadas.',
    remember: 'Proponente é quem apresenta a proposta e assume a responsabilidade por ela.',
  },
  'agente-cultural': {
    example: 'Uma artista, um grupo de teatro ou uma produtora pode aparecer como agente cultural em uma oportunidade.',
    remember: 'O termo identifica quem cria, produz ou realiza atividades culturais.',
  },
  'inscricao-mapas': {
    example: 'Um edital cultural tem categorias para música e teatro. O proponente escolhe a categoria correta e envia a inscrição.',
    remember: 'Categoria errada pode tornar a proposta inadequada, mesmo que o projeto seja bom.',
  },
  'bolsa-auxilio': {
    example: 'Uma pesquisadora recebe uma bolsa para desenvolver seu trabalho, enquanto um auxílio paga despesas previstas no projeto.',
    remember: 'Leia o edital para saber quem recebe e quais gastos são permitidos.',
  },
  'subvencao-economica': {
    example: 'Uma empresa recebe recurso público não reembolsável para desenvolver uma inovação de interesse coletivo.',
    remember: 'Não é um empréstimo comum, mas exige projeto, regras e prestação de contas.',
  },
  'recursos-reembolsaveis': {
    example: 'Um recurso reembolsável precisa ser devolvido. Um não reembolsável não é devolvido se todas as regras forem cumpridas.',
    remember: 'Não reembolsável não significa dinheiro sem obrigação.',
  },
  contrapartida: {
    example: 'O edital apoia parte do projeto e pede que o proponente contribua com dinheiro, equipe, espaço ou equipamentos.',
    remember: 'Contrapartida é a parcela de contribuição do próprio participante.',
  },
  'plano-trabalho': {
    example: 'O plano organiza objetivos, atividades, datas, responsáveis e orçamento do projeto.',
    remember: 'Ele mostra como a ideia será transformada em entregas verificáveis.',
  },
  'termo-fomento-colaboracao': {
    example: 'Uma organização apresenta uma ideia ao governo em um termo de fomento. Em outro caso, executa uma iniciativa proposta pelo governo em termo de colaboração.',
    remember: 'No fomento, a iniciativa parte da organização. Na colaboração, parte da administração pública.',
  },
  'concedente-convenente': {
    example: 'Um ministério transfere recursos e é o concedente. A entidade que executa o projeto é a convenente.',
    remember: 'Concedente transfere. Convenente recebe e executa.',
  },
  'captacao-rouanet': {
    example: 'Um projeto é autorizado a buscar patrocinadores, mas ainda precisa captar o dinheiro para ser realizado.',
    remember: 'Aprovação para captar não significa que o recurso já está disponível.',
  },
  'expressao-interesse': {
    example: 'Uma consultoria envia experiência e qualificações para mostrar que deve ser considerada na próxima etapa.',
    remember: 'EOI demonstra interesse e capacidade. Normalmente ainda não é a proposta final.',
  },
  'ifb-rfb-rfp-rfq': {
    example: 'Uma RFQ pede uma cotação simples. Uma RFP pede uma proposta mais completa, com solução técnica e preço.',
    remember: 'A sigla indica o tipo de resposta que o comprador espera receber.',
  },
  'lista-curta': {
    example: 'Depois de analisar expressões de interesse, o comprador convida apenas algumas empresas da shortlist para a próxima fase.',
    remember: 'Entrar na lista curta é avançar no processo, não vencer o contrato.',
  },
  'mutuario-agencia-executora': {
    example: 'Um país recebe financiamento de um banco internacional, e um ministério executa as compras do projeto.',
    remember: 'O banco financia e supervisiona regras, mas a agência executora costuma conduzir a contratação.',
  },
  'contract-award': {
    example: 'O aviso de contract award informa qual empresa venceu, o valor e outras informações do contrato.',
    remember: 'É a divulgação do resultado, não um novo convite para enviar proposta.',
  },
  'call-topic': {
    example: 'Uma call reúne uma grande linha de financiamento, e cada topic descreve um desafio específico que aceita propostas.',
    remember: 'Escolha primeiro a call e depois confirme se seu projeto cabe no topic.',
  },
  'applicant-beneficiary': {
    example: 'Durante a inscrição, a organização é applicant. Se o projeto for aprovado e o acordo assinado, vira beneficiary.',
    remember: 'O nome muda conforme a proposta avança para um projeto financiado.',
  },
  'consorcio-pic': {
    example: 'Universidades de países diferentes formam um consortium, e cada organização usa seu PIC para ser identificada no portal.',
    remember: 'Consortium é o grupo. PIC é o número de identificação de cada participante.',
  },
  'grant-agreement': {
    example: 'Após a aprovação, as partes assinam o grant agreement com orçamento, tarefas, prazos e regras de prestação de contas.',
    remember: 'É o acordo que transforma a proposta aprovada em um projeto financiado.',
  },
};

export function simpleGlossaryDefinition(entry: GlossaryEntry): string {
  return entry.definition.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? entry.definition;
}

export function learningNoteFor(entry: GlossaryEntry): GlossaryLearningNote {
  return GLOSSARY_LEARNING_NOTES[entry.id] ?? {
    example: `Imagine encontrar “${entry.term}” em uma oportunidade. A explicação completa abaixo mostra como interpretar o termo.`,
    remember: entry.whatToDo,
  };
}
