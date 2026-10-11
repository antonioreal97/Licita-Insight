# Oportunidades internacionais que brasileiros podem disputar (2026-10)

Pesquisa de fontes para uma seção internacional do hub de oportunidades. Complementa `docs/research/fontes-oportunidades-2026-10.md` (fontes nacionais). Testes feitos em 11/10/2026. Nenhum coletor foi implementado.

## Resumo executivo

Top 5, na ordem recomendada:

1. **Banco Mundial — avisos de aquisição** — API pública sem login, dado sob CC BY 4.0, elegibilidade universal e 654 avisos com prazo aberto no dia do teste (11 no Brasil, 44 na América Latina).
2. **Programas ibero-americanos (IberCultura Viva, Ibermedia, Iberescena, Ibermúsicas)** — o Brasil é país-membro, as chamadas saem em espanhol e português, e o IberCultura Viva roda em Mapas Culturais, que o coletor do Pardal já lê.
3. **Portal Funding & Tenders da União Europeia** — API de busca pública com 1.197 oportunidades abertas ou previstas (1.003 tópicos de fomento, 174 chamadas em cascata, 20 licitações de ação externa); a elegibilidade de brasileiros é condicional e precisa de selo próprio.
4. **BID — avisos de aquisição** — a fonte mais aderente a empresas brasileiras (país-membro, projetos na América Latina) e o dado é CC BY 4.0, mas o `robots.txt` bloqueia a API e o download; depende de um pedido de liberação.
5. **Calendário curado de fundos e bolsas (World Cinema Fund, IDFA Bertha, Hubert Bals, UNESCO IFCD, Prince Claus, Sundance, Fulbright)** — poucas chamadas por ano, alto valor para produtores e pesquisadores; cadastro manual com link oficial, sem coleta automática.

Ficam para **parceria**: UNGM (que concentra UNOPS, PNUD e OPAS), CAF, Devex, FundsforNGOs e Prosas. Os termos proíbem redistribuição ou o site tem anti-robô. O TED entra depois, só como recorte (execução no Brasil e na América Latina), porque o acesso de fornecedor brasileiro às compras europeias não é garantido.

O que não foi possível confirmar está marcado como "não verificado" em cada fonte. Volumes são contagens do dia do teste quando a fonte responde uma contagem; o resto é estimativa e está dito como tal.

## Tabela comparativa

| Fonte | Elegibilidade BR | Acesso | Termos / risco | Barreiras | Volume | Campos | Esforço | Recomendação |
|---|---|---|---|---|---|---|---|---|
| Banco Mundial — procurement notices | Aberta a empresas elegíveis de qualquer país, salvo sanção ou embargo | API JSON pública, sem chave | Dataset CC BY 4.0; termos pedem volume razoável de requisições. Risco baixo | Texto do aviso em HTML livre; hora do prazo sem fuso | 654 abertos (364 licitações, 286 manifestações de interesse); estimativa de 450–700 novos por mês | Título, projeto, país, região, método, prazo (data e hora), idioma, contato, texto | P/M | **Integrar 1** |
| IberCultura Viva | País-membro | API Mapas Culturais (`mapa.iberculturaviva.org`) | `robots.txt` sem regras; mesma base técnica das instalações já coletadas. Risco baixo | Volume pequeno | 1 chamada aberta no dia; 230 posts na categoria "editais" do site | Os do Mapas Culturais (nome, resumo, datas, link) | P (nova instalação no coletor atual) | **Integrar 2A** |
| Ibermedia | País-membro (21 países) | Página pública de convocatórias | `robots.txt` libera; sem licença de reuso publicada. Risco baixo-médio | Uma janela por ano; inscrição com login | 6 linhas por ano (janela de 30/01 a 30/03 em 2026) | Linha, situação, início e fim com hora | P (curado ou HTML) | **Integrar 2B** |
| Iberescena | País-membro (17 países) | Site em JavaScript (SPA) | Sem `robots.txt`; sem licença publicada. Risco baixo-médio | Página não entrega conteúdo sem JS | 3 linhas por ano (22/05 a 23/07 em 2026; 842 projetos recebidos) | Linha, teto em euros, prazo | P (curado) | **Integrar 2B** |
| Ibermúsicas | Programa cita o Brasil; lista formal de membros não lida | Página pública | `robots.txt` libera tudo. Risco baixo-médio | Ciclo anual; próximas chamadas só em meados de 2027 | Um ciclo por ano, várias linhas | Linha, descrição, prazo | P (curado) | **Integrar 2B** |
| Iberbibliotecas | Não verificado | Site respondeu 403 | — | Bloqueio ao nosso User-Agent | Não verificado | — | — | **Curado manual ou descartar** |
| Portal Funding & Tenders (UE) | Condicional: Horizon não financia entidade brasileira por padrão; pesquisador individual (MSCA, ERC) é elegível | API de busca pública (`apiKey=SEDIA`) | Documentação oficial da API não localizada; política de reuso da Comissão a confirmar. Risco baixo-médio | Elegibilidade está em texto livre; só em inglês | 1.003 tópicos + 174 cascata + 20 licitações abertos ou previstos | Identificador, título, prazo em UTC, orçamento, programa, tipo de ação, palavras-chave, condições | M | **Integrar 3** |
| BID — avisos de aquisição | Só países-membros; o Brasil é membro | Dataset aberto em `data.iadb.org` (CSV e API CKAN) | CC BY 4.0, mas `robots.txt` bloqueia `/api/` e os caminhos de download. Risco jurídico baixo; bloqueio operacional | `www.iadb.org` atrás de Cloudflare (403) | Não medido | Não verificados (acesso bloqueado) | M | **Integrar 4, após liberação** |
| Fundos de cinema e cultura (WCF, IDFA Bertha, HBF, IFCD, Prince Claus, Sundance) | Varia por fundo; ver seção 6 | Páginas públicas; IFFR atrás de Cloudflare | Sem licença de reuso. Risco médio se copiar texto; baixo se só título, prazo e link | Regras em PDF; uma ou duas janelas por ano | Ordem de 15–25 chamadas por ano no conjunto (estimativa) | Programa, teto, prazo, lista de países | P (curado) | **Integrar 5 (curado)** |
| Fulbright Brasil | 100% para brasileiros | Página pública com cartões | `robots.txt` libera. Risco baixo-médio | Datas só por mês | 18 programas (1 aberto, 17 previstos) | Programa, público, situação, mês previsto | P (curado) | **Integrar 5 (curado)** |
| DAAD e British Council | Chamadas específicas para o Brasil | Sites do Brasil não responderam no teste | Não verificado | — | Poucas por ano | — | P (curado) | **Curado, após verificação** |
| UKRI (inclui ISPF, sucessor do Newton) | Em geral exige instituição britânica na liderança | RSS público e página com filtros | Licença de reuso não confirmada. Risco médio | Elegibilidade brasileira é exceção | 151 oportunidades listadas | Título, financiador, tipo, abertura, fechamento, valor | P | **Depois; só chamadas com parceiro brasileiro** |
| TED (União Europeia) | Não garantida: Brasil não é parte confirmada do GPA; acordo UE–Mercosul em aplicação provisória | API v3 pública, sem autenticação | Docs citam reuso comercial; site HTML tem CAPTCHA (usar só a API). Risco baixo | Volume enorme e pouco elegível | 35.653 avisos ativos; 5 com execução no Brasil | Título em 24 línguas (inclui português), comprador, país, prazo com fuso, CPV, valor, GPA | P (recorte) | **Depois; recorte Brasil e América Latina** |
| UNGM (ONU) | Aberto a fornecedores, com cadastro | Página pública de avisos | Termos proíbem uso comercial ou público e disseminação sem autorização escrita. Risco alto | Alerta de licitações é pago | Não medido | — | — | **Parceria** |
| UNOPS, PNUD, OPAS | Via UNGM | PNUD: `robots.txt` com `Disallow: /`; UNOPS e OPAS exigem cadastro UNGM | Idem UNGM | Login para detalhes e proposta | Não medido | — | — | **Parceria (via UNGM)** |
| CAF | Não verificado | Site atrás de Incapsula | — | Anti-robô | Não verificado | — | — | **Parceria** |
| Devex | — | `robots.txt` respondeu página com CAPTCHA | Política proíbe scraping e uso concorrente. Risco alto | Assinatura | — | — | — | **Parceria ou descartar** |
| FundsforNGOs | — | Cloudflare (403) | Licença só para uso pessoal e não comercial. Risco alto | Conteúdo premium | — | — | — | **Descartar** |
| Prosas (internacional) | — | API com token (pesquisa anterior) | Termos proíbem retransmissão e extração. Risco alto | Cadastro | — | — | — | **Parceria** |

## Evidências por fonte

### 1. Banco Mundial

- **Acesso.** `GET https://search.worldbank.org/api/v2/procnotices?format=json` respondeu 200 em JSON, sem chave. O total é de 422.441 avisos: 311.520 adjudicações, 60.814 pedidos de manifestação de interesse, 45.866 convites a licitar, 3.468 avisos gerais e 733 pré-qualificações. `search.worldbank.org/robots.txt` não existe (404).
- **Abertos.** Com `deadline_strdate=2026-10-12&deadline_enddate=2027-12-31` voltaram 654 avisos: 364 convites a licitar, 286 manifestações de interesse e 4 pré-qualificações. Por região: África Oriental e Austral 250, África Ocidental e Central 129, Europa e Ásia Central 82, Oriente Médio e Norte da África 55, Leste Asiático 49, Sul da Ásia 45, América Latina e Caribe 44. Por país, 11 no Brasil. Por grupo: consultoria 286, bens 197, obras 140, serviços 31. Os filtros `strdate`/`enddate` não tiveram efeito no teste; só os de prazo funcionaram.
- **Volume mensal.** A fonte não responde esse número. Com 654 abertos e prazos típicos de 4 a 6 semanas, a ordem é de 450 a 700 novos por mês (estimativa).
- **Campos.** `id`, `notice_type`, `noticedate`, `notice_lang_name`, `submission_deadline_date`, `submission_deadline_time`, `project_ctry_name`, `project_id`, `project_name`, `bid_reference_no`, `bid_description`, `procurement_group`, `procurement_method_name`, contato (organização, endereço, e-mail, telefone) e `notice_text` em HTML. Não há campo de valor estimado no aviso de licitação. A hora do prazo vem sem fuso ("11:00"), no horário local do comprador. Os avisos vistos estavam em inglês, espanhol e francês.
- **Termos.** O dataset "Procurement Notice" está catalogado como CC BY 4.0, com atualização diária ([Finances One DS00979](https://financesone.worldbank.org/procurement-notice/DS00979); [Data Catalog](https://datacatalog.worldbank.org/search/dataset/0037776/procurement-notice)). Os [termos do site](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets) proíbem uso das APIs "in a manner that exceeds reasonable request volume" e restringem uso comercial de materiais que não são datasets. Como o endpoint de busca não é o mesmo host do dataset, vale um e-mail a `data@worldbankgroup.org` confirmando que a exibição no Pardal está coberta pela CC BY 4.0.
- **Elegibilidade.** Documentos de projeto do Banco dizem que a aquisição é aberta a empresas elegíveis de qualquer país, conforme a Seção III do Regulamento de Aquisições, com exceção de firmas sancionadas e de boicote legal do país mutuário ou do Conselho de Segurança da ONU ([exemplo](https://documents1.worldbank.org/curated/en/099100424051542779/text/P177876-0684c3c7-c6b4-44c5-815e-34c2cb9d84ec.txt)). O texto do Regulamento em si não foi lido nesta pesquisa.
- **Detecção automática.** Regra fixa por fonte: `open`. Marcar `conditional` quando `procurement_method_name` ou o texto indicar concorrência nacional ou consultor individual local.

### 2. Programas ibero-americanos

- **IberCultura Viva.** O site lista o Brasil entre os países do programa e aponta para `mapa.iberculturaviva.org`, que é uma instalação Mapas Culturais. `GET /api/opportunity/find` com `registrationTo=GTE(2026-10-11)` respondeu JSON com 1 chamada aberta. O `robots.txt` do mapa só tem comentários, sem nenhuma regra. O site institucional é WordPress com API REST pública; a categoria "editais" tem 230 posts. `iberculturaviva.org/robots.txt` pede `Crawl-delay: 60`.
- **Ibermedia.** Programa de 21 países, com o Brasil na lista ([o programa](https://www.programaibermedia.com/el-programa/)). A [página de convocatórias](https://www.programaibermedia.com/convocatorias/) mostra as seis linhas de 2026 (codesenvolvimento de longas, codesenvolvimento de séries, coprodução, formação, distribuição e ajudas complementares), todas com janela de 30/01/2026 12:00 a 30/03/2026 11:59 e situação "CERRADA". O fuso da hora não é declarado. `robots.txt` libera as páginas.
- **Iberescena.** A convocatória 2026-2027 ficou aberta de 22/05 (uma fonte cita 26/05) a 23/07/2026 para 17 países-membros, entre eles o Brasil, com três linhas: criação em residência (até € 10 mil), coprodução (até € 15 mil) e programação de espaços, festivais e mercados (até € 20 mil) ([nota do governo do Paraguai](https://www.ip.gov.py/ip/2026/06/03/abren-convocatoria-iberescena-2026-2027-para-financiar-proyectos-de-artes-escenicas/); [Uruguai, 842 projetos recebidos](https://www.gub.uy/ministerio-educacion-cultura/comunicacion/noticias/842-proyectos-recibidos-iberescena-cierra-nueva-edicion-su-convocatoria)). O site oficial é uma aplicação JavaScript: a página de convocatórias chega vazia sem execução de script.
- **Ibermúsicas.** A [página de convocatórias](https://www.ibermusicas.org/index.php/convocatorias/) informa que as chamadas de 2027 saem em meados de 2027. `robots.txt` libera tudo. A página do programa cita o Brasil como proponente de uma linha de apoio; a lista formal de países-membros não foi lida.
- **Iberbibliotecas.** `www.iberbibliotecas.org` respondeu 403. Nada foi verificado.
- **Detecção automática.** Regra fixa por programa: `open` quando o Brasil é país-membro. A regra vale enquanto o Brasil estiver em dia com a cota do programa; conferir uma vez por ano, na abertura da convocatória.

### 3. Portal Funding & Tenders (União Europeia)

- **Acesso.** `POST https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=***`, com `query` em multipart, respondeu 200 em JSON. É a busca que o próprio portal usa. Não localizei documentação oficial desse endpoint nem aviso de reuso específico; a política geral de reuso da Comissão (Decisão 2011/833/UE) não foi relida nesta sessão. Confirmar antes de ligar.
- **Volume.** Abertas ou previstas (`status` 31094501 e 31094502): 1.197 no total. Por `type`: 1.003 tópicos de fomento (tipo 1), 20 licitações (tipo 2; a amostra vista era de ação externa, com identificador `EuropeAid/...`) e 174 chamadas em cascata (tipo 8). O código 31094502 aparece como "Open" no próprio payload; 31094501 foi tratado como "Forthcoming" e não está confirmado.
- **Campos.** `identifier`, `title`, `deadlineDate` em UTC, `startDate`, `status`, `frameworkProgramme`, `typesOfAction`, `keywords`, `tags`, `budgetOverview` (orçamento por ano, número de projetos esperados, contribuição mínima e máxima), `topicConditions` e `links`. Nas licitações: `budget`, `currency`, `contractType`, `geographicalZone`. Tudo em inglês.
- **Elegibilidade.** O campo `topicConditions` dos tópicos Horizon remete ao Anexo B e diz que países fora da UE e não associados "are not automatically eligible for funding". A Comissão informa que, em princípio, não financia entidades brasileiras em projetos colaborativos, e que CNPq, FINEP e CONFAP mantêm um mecanismo complementar desde 19/11/2021 ([página do Brasil](https://research-and-innovation.ec.europa.eu/strategy/strategy-research-and-innovation/europe-world/international-cooperation/bilateral-cooperation-science-and-technology-agreements-non-eu-countries/brazil_en)). Pesquisadores individuais em MSCA e ERC são elegíveis ([guia Euraxess](https://euraxess.ec.europa.eu/sites/default/files/guidelines_for_brazilian_participation_in_horizon_europe_-_elisa_natola.pdf), de 2021 a 2024; conferir o programa de trabalho vigente).
- **Detecção automática.** Padrão `conditional` com a nota "entidade brasileira participa sem financiamento da UE, salvo previsão na chamada". Subir para `open` quando `typesOfAction` for MSCA ou ERC, ou quando o texto citar o Brasil. Licitações de ação externa: usar `geographicalZone` e deixar `unknown` até ler a regra de nacionalidade do aviso.

### 4. BID

- **Acesso.** `www.iadb.org` respondeu a página "Attention Required" do Cloudflare (403). `projectprocurement.iadb.org` respondeu 526. O dataset [IDB Project procurement bidding notices and notification of contract awards](https://data.iadb.org/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards) está no ar: avisos gerais, específicos, manifestações de interesse e adjudicações, licença CC BY 4.0, modificado em 09/10/2026, em CSV e com API CKAN. Desde março de 2025 a origem é o próprio BID (antes, UN Development Business).
- **Bloqueio.** `data.iadb.org/robots.txt` tem `Disallow: /api/`, `/dataset/download/`, `/file/download/` e `/datastore/dump/`, com o comentário "Block direct download paths to force landing page traffic". A licença permite o reuso, mas o caminho automático está fechado. Não chamei a API nem baixei o CSV; por isso os campos não foram verificados.
- **Elegibilidade.** Só empresas e pessoas de países-membros do BID (48), e o Brasil é membro. A informação veio de resultado de busca sobre a página de aquisições do BID; a página oficial não abriu.
- **Próximo passo.** Pedido de liberação ao time de dados abertos do BID, no modelo de `docs/ops/pedido-liberacao-mapa-cultura.md`: User-Agent identificado, um download diário do CSV, atribuição CC BY.

### 5. Sistema ONU: UNGM, UNOPS, PNUD e OPAS

- **UNGM.** O `robots.txt` libera as páginas públicas de avisos, mas os [termos](https://www.ungm.org/Public/Pages/Terms) dizem que "None of the material on the Site may be used for any commercial or public use" (5.2), que nenhum material pode ser disseminado sem autorização escrita (5.3) e que o material de licitação pertence às agências (7.2). O serviço de alerta de licitações é pago (6.1). Coleta e exibição ficam fora sem acordo.
- **UNOPS.** O eSourcing exige cadastro no UNGM para ver o detalhe do processo ([UNGM — UNOPS eSourcing](https://www.ungm.org/Shared/KnowledgeCenter/Pages/UNOPS_eSourcing)).
- **PNUD.** `procurement-notices.undp.org/robots.txt` tem `Disallow: /`. As propostas passam pelo portal Quantum, com cadastro.
- **OPAS.** Fornecedores se cadastram no UNGM ([become a vendor](https://www.paho.org/en/doing-business-paho/become-vendor)). A OPAS publica um [calendário de licitações](https://www.paho.org/en/doing-business-paho/tender-calendar) dos fundos estratégicos (seringas, imunoglobulinas, vacinas), útil só para a indústria de saúde.
- **Recomendação.** Um único pedido de parceria ao UNGM cobre as quatro. Até lá, a seção pode ter um cartão fixo "Licitações da ONU", com link para o UNGM, sem dado coletado.

### 6. Fundos e prêmios culturais (calendário curado)

- **World Cinema Fund (Berlinale).** Por resultado de busca sobre as páginas do fundo ([WCF](https://www.berlinale.de/en/wcf/home/welcome.html)): regiões elegíveis incluem a América Latina; o WCF Classic pede parceiro de produção alemão e o WCF Europe, parceiro europeu; são de 10 a 15 filmes apoiados por ano. As diretrizes vigentes não foram lidas. O prazo de 2026 (24/07) veio de fonte secundária e não foi confirmado. `robots.txt` bloqueia só `/api/`.
- **IDFA Bertha Fund.** Próximos prazos: IBF Europe em 15/01/2027 e IBF Classic em 10/02/2027 ([página do fundo](https://professionals.idfa.nl/training-funding/funding/about-the-idfa-bertha-fund/)). Na [lista de países de 2026](https://cdn2.assets-servd.host/idfa-cms/production/uploads/Professionals-Training-and-Funding/IBF-Classic-Country-List-2026.pdf) o Brasil aparece como "Development category only; not eligible for (Post-)Production": só a linha de desenvolvimento, com teto de € 7.500.
- **Hubert Bals Fund (IFFR).** `iffr.com` respondeu o desafio do Cloudflare; nada foi lido no site. Por resultado de busca: a lista de países segue a lista DAC da OCDE e existe a linha HBF+Brazil. Elegibilidade do Brasil nas linhas gerais: não verificada.
- **UNESCO IFCD.** Podem pedir instituições públicas e ONGs de países em desenvolvimento que sejam partes da Convenção de 2005, e ONGs internacionais ([como pedir](https://www.unesco.org/creativity/en/ifcd/apply)). A chamada de 2026 ficou aberta de 23/03 a 06/05, com até US$ 100 mil por projeto. Que o Brasil está na lista de países elegíveis: não verificado. O `robots.txt` da UNESCO declara `ai-train=no` e aponta os termos de uso.
- **Prince Claus Fund.** Os Seed Awards dão € 5 mil a 100 artistas em início de carreira; a chamada de 2026 fechou em 08/01/2026. A [lista de contemplados de 2026](https://princeclausfund.nl/awards-and-programmes/seed-award/2026) tem brasileiros, o que confirma a elegibilidade. Só pessoa física.
- **Sundance Institute.** A [página de inscrições](https://www.sundance.org/apply/) reúne laboratórios, bolsas e fundos. A elegibilidade internacional varia por programa e não foi conferida linha a linha.
- **Tratamento.** Para todos: cadastro manual de programa, janela, teto, quem pode pedir e link oficial, revisto a cada ciclo. Não copiar regulamento nem PDF.

### 7. Pesquisa, inovação e educação

- **Fulbright Brasil.** A [página de bolsas para brasileiros](https://fulbright.org.br/bolsas-para-brasileiros/) lista 18 programas em cartões, com filtro de situação: 1 aberto e 17 previstos, a maioria para junho de 2027. As datas vêm só por mês.
- **UKRI.** O [buscador de oportunidades](https://www.ukri.org/opportunity/) lista 151 itens, com financiador, tipo, datas de abertura e fechamento (hora do Reino Unido) e valor. O RSS `https://www.ukri.org/opportunity/feed/` respondeu com 20 itens. O rodapé só traz "© 2026 Copyright UKRI"; a licença de reuso não foi confirmada. O Newton Fund fechou em 2021; o sucessor é o International Science Partnerships Fund, com atuação no Brasil pela iniciativa Amazônia+10, segundo a página do [British Council](https://www.britishcouncil.org.br/en/programmes/education/Ispf) vista por resultado de busca. Quem lidera a proposta é, em geral, a instituição britânica.
- **DAAD e British Council.** `www.daad.org.br`, `www.britishcouncil.org.br` e `www.britishcouncil.org` não responderam no teste (falha de conexão). Por resultado de busca: o DAAD teve em 2026 uma chamada de bolsas curtas de pesquisa cofinanciadas com CAPES e FAPs (prazo 03/09/2026), e o British Council teve o Study UK Alumni Awards (prazo 15/10/2026). Verificar antes de cadastrar.

### 8. TED (União Europeia)

- **Acesso.** `POST https://api.ted.europa.eu/v3/notices/search` respondeu 200 sem autenticação. A [documentação](https://docs.ted.europa.eu/api/latest/search.html) diz que a API "does not require authentication" e lista organizações comerciais entre os usuários. O site `ted.europa.eu` respondeu 405 com página de verificação por CAPTCHA em `/en/legal-notice`; o aviso legal não foi lido e o site não deve ser coletado, só a API.
- **Volume.** 35.653 avisos de concorrência ativos com prazo de 12/10/2026 em diante. Com `place-of-performance=BRA`, 5 (entre eles, dois de comprador francês sobre bioeconomia na Amazônia).
- **Campos.** `notice-title` em 24 línguas, com chave `por`; `buyer-name`, `buyer-country`, `deadline-receipt-tender-date-lot` com fuso, `classification-cpv`, `estimated-value-lot` e moeda, `gpa-lot`, links para XML e PDF em português.
- **Elegibilidade.** O Brasil é observador do Acordo de Compras Governamentais da OMC desde 2017 e pediu adesão em 2020; não encontrei confirmação de adesão concluída. O Acordo Comercial Interino UE–Mercosul está em aplicação provisória desde 01/05/2026 e tem capítulo de compras públicas com "reciprocal and non-discriminatory access" ([Comissão](https://trade.ec.europa.eu/access-to-markets/en/content/eu-mercosur-partnership-agreement-and-interim-trade-agreement)); entidades cobertas e limiares não foram verificados (texto no JO L 2026/184), e o Parlamento Europeu pediu parecer ao Tribunal de Justiça. Até isso ficar claro, o selo é `unknown`.

### 9. CAF e agregadores

- **CAF.** `www.caf.com` respondeu a página de verificação do Incapsula. Nenhum conteúdo foi lido. Fora da coleta automática.
- **Devex.** A [política de uso](https://support.devex.com/hc/en-us/articles/203927850-Acceptable-use-policy) proíbe scripts e robôs para "scrape", "crawl" ou "spider", e proíbe usar o conteúdo em serviço concorrente. Só por contrato de licenciamento.
- **FundsforNGOs.** Os [termos](https://www.fundsforngos.org/terms/), lidos por resultado de busca, dão licença limitada só para uso pessoal e não comercial e vedam exploração comercial e site concorrente. O site respondeu o desafio do Cloudflare. Descartar.
- **Prosas.** Conclusão da pesquisa nacional mantida: termos proíbem retransmissão e extração; só por parceria.

### 10. Fontes não avaliadas

Banco Africano de Desenvolvimento, FONPLATA, Novo Banco de Desenvolvimento (NDB), Ibermuseus e Iberarquivos não foram testados. São candidatos à próxima rodada.

## Modelo de dados e UX

### Modelo

"Internacional" é abrangência, não natureza: uma chamada do Ibermedia é cultura **e** internacional. Por isso a proposta é um campo novo em `cultural_opportunities`, em vez de `kind = international`.

| Campo | Valores | Observação |
|---|---|---|
| `scope` | `national` \| `international` | Default `national`; migração só de metadados |
| `kind` | acrescenta `procurement` | Licitações de organismos; continuam fora de `tenders` (PNCP) |
| `source` | acrescenta `worldbank`, `eu-ft`, `iberculturaviva`, `curated`, depois `idb` e `ted` | No `curated`, `sourceName` leva o nome do fundo |
| `country`, `region` | ISO 3166-1 alfa-2; `america-latina`, `africa`, `europa`, `asia`, `oriente-medio`, `global` | País de execução, não o do organismo |
| `eligibility_br` | `open` \| `conditional` \| `closed` \| `unknown` | Só `open` e `conditional` aparecem por padrão |
| `eligibility_basis`, `eligibility_note`, `eligibility_checked_at` | Regra aplicada (`wb-universal`, `ibero-member`, `horizon-self-funded`, `idb-member`, `curated`), frase curta e data | A nota aparece no cartão |
| `applicant_types` | `company`, `individual`, `ngo`, `public`, `research` | Filtro "quem pode pedir" |
| `language`, `title_original`, `title_pt`, `summary_pt`, `translation_source` | BCP 47; `source` \| `model` \| `teacher` | O original é sempre guardado e exibido |
| `amount`, `currency`, `amount_brl_approx`, `fx_rate`, `fx_date` | ISO 4217 | Sem conversão quando a moeda não está na PTAX |
| `deadline_at`, `deadline_tz`, `deadline_precision` | `timestamptz`; IANA ou nulo; `datetime` \| `date` | Ver regra abaixo |

- **Prazo em Brasília.** UE e TED já mandam o fuso. O Banco Mundial manda data e hora local sem fuso: resolver por país quando o país tem um fuso só; nos demais, guardar `deadline_precision = date` e mostrar a hora como texto ("11:00, hora local"). Nunca inventar a hora.
- **Câmbio.** A PTAX do Banco Central (`olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata`) respondeu sem chave e cobre AUD, CAD, CHF, DKK, EUR, GBP, JPY, NOK, SEK e USD. Uma leitura por dia basta. Exibir como "€ 1,3 mi ≈ R$ 7,3 mi (PTAX de 09/10)".
- **Tradução.** O Jev devolve julgamentos tipados, não texto (`docs/contracts/ai-cost-v1.md`); serve para classificar área e conferir a elegibilidade, não para traduzir. Para título e resumo em português:
  - Fontes ibero-americanas e TED dispensam tradução (já vêm em português ou espanhol).
  - Banco Mundial e UE: modelo local em primeiro lugar, no mesmo arranjo professor/aluno dos títulos de editais (`docs/contracts/tender-titles-v1.md`).
  - Se o professor OpenAI for usado como reserva: cerca de 650 tokens de entrada e 150 de saída por item, aos preços do contrato (US$ 0,15 e US$ 0,60 por milhão), dá US$ 0,0002 por item. Carga inicial de 2.000 itens: US$ 0,40. Fluxo de 1.000 novos por mês: US$ 0,20. Cabe no teto `TITLE_OPENAI_BUDGET_USD`.
  - O custo do Jev por chamada não está documentado no repositório; a classificação entra no limite de RPM já particionado.

### UX

- Aba "Internacional" em `/oportunidades` (`scope=international` na URL), separada da lista nacional para não misturar prazos e moedas.
- Selo no cartão: "Aberto a brasileiros" (`open`) ou "Brasileiro entra com condição" (`conditional`), com a nota da regra ao tocar. `unknown` só aparece se o usuário ligar "mostrar sem confirmação".
- Cartão: título em português, título original menor logo abaixo, chip de idioma, organismo, país, valor com conversão aproximada, prazo em Brasília com a hora local entre parênteses.
- Filtros: tipo (licitação, fomento, bolsa ou prêmio), região, país, organismo, idioma, área, quem pode pedir, prazo.
- Aviso fixo no detalhe: "Elegibilidade indicativa. Confira o edital oficial." Link sempre para a página oficial; nenhum PDF copiado.

## Esboço de integração das top 3

### Banco Mundial

1. Coletor diário: `procnotices` com `deadline_strdate=<hoje>`, 100 por página, intervalo de 1 s (7 páginas no volume atual).
2. Entram `Invitation for Bids`, `Request for Expression of Interest` e `Invitation for Prequalification`. Adjudicações ficam fora.
3. Mapeamento: `externalId = id`; `title_original = bid_description`; `organizationName = contact_organization`; `originName = project_name`; `country` de `project_ctry_name`; `opportunityType = procurement_method_name`; `deadline_at` de data, hora e fuso do país; `language` de `notice_lang_name`; `sourceUrl` = página do aviso em `projects.worldbank.org` (padrão de URL a confirmar); `summary` = primeiros parágrafos de `notice_text` sem HTML.
4. `kind = procurement`, `scope = international`, `eligibility_br = open`, `eligibility_basis = wb-universal`.
5. Encerramento pelo prazo; aviso que some da listagem completa é fechado, como no Mapas.
6. Antes de ligar: e-mail a `data@worldbankgroup.org` sobre a licença do endpoint de busca.

### Programas ibero-americanos

1. IberCultura Viva: acrescentar `mapa.iberculturaviva.org` à lista de instalações do coletor Mapas, com `scope = international` e `state = null`. Nenhum código novo de leitura.
2. Ibermedia, Iberescena e Ibermúsicas: `source = curated`, uma linha por linha de apoio e por ano, cadastrada à mão a partir da página oficial (são cerca de 15 linhas por ano no conjunto). Um verificador semanal lê só a página de convocatórias do Ibermedia e a do Ibermúsicas e avisa quando o texto muda; ele não grava nada sozinho.
3. `eligibility_br = open`, `eligibility_basis = ibero-member`; `applicant_types` por linha (produtora, artista, festival).
4. Fora da janela, a linha fica como `upcoming` com o mês previsto, para o usuário poder monitorar.

### Portal Funding & Tenders

1. Coletor diário na API de busca, `type` 1, 2 e 8, `status` aberto e previsto, 100 por página (12 páginas).
2. Mapeamento: `externalId = identifier`; `title_original = title`; `deadline_at = deadlineDate` (UTC); `amount` de `budgetOverview.maxContribution` ou `budget`; `currency = EUR`; `areas` a partir de `keywords` e `tags`; `opportunityType = typesOfAction`; `sourceUrl = url`.
3. `kind = innovation` para tópicos e cascata; `procurement` para o tipo 2.
4. Elegibilidade por regra: `conditional` e `horizon-self-funded` por padrão; `open` para MSCA e ERC; revisão por classificação do texto de `topicConditions` quando citar países.
5. Primeiro corte recomendado: só chamadas em cascata e MSCA/ERC, que são as que uma startup ou um pesquisador brasileiro consegue disputar sem montar consórcio europeu.
6. Antes de ligar: confirmar com o helpdesk do portal que o uso da API de busca por terceiros é permitido.

## Compliance e operação

- User-Agent em todos os testes: `PardalDigital/pesquisa (+https://pardaldigital.com; contato@pardaldigital.com)`. Cerca de 70 requisições no total, espalhadas por uns 35 hosts, no máximo 8 por host. Sem contas, sem login, sem CAPTCHA resolvido, sem evasão.
- Hosts que bloquearam ou exigiram verificação e ficam fora da coleta: `www.iadb.org` (Cloudflare), `www.caf.com` (Incapsula), `iffr.com` (Cloudflare), `www.devex.com` (CAPTCHA), `www2.fundsforngos.org` (Cloudflare), `www.iberbibliotecas.org` (403), `ted.europa.eu` no HTML (CAPTCHA), `procurement-notices.undp.org` (`Disallow: /`).
- Em fonte sem licença de reuso publicada, guardar só título, organismo, prazo, valor e link. Regulamentos e PDFs ficam no site de origem.
- O selo de elegibilidade é indicativo. A regra aplicada e a data da conferência ficam visíveis, e o edital oficial prevalece.
- Pendências que dependem de terceiros: resposta do Banco Mundial sobre a licença do endpoint, liberação do BID, parceria com o UNGM, confirmação do portal da UE.
