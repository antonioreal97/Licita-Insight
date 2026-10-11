# Oportunidades internacionais para brasileiros — pesquisa independente

**Data da verificação:** 11 de outubro de 2026

**Escopo:** licitações, fomento cultural/audiovisual e pesquisa/inovação com possibilidade de participação brasileira

**Método:** documentação e termos oficiais, `robots.txt` e quatro testes pontuais de APIs públicas, sem conta, login, CAPTCHA ou evasão. Os testes usaram `PardalDigital/pesquisa (+https://pardaldigital.com; contato@pardaldigital.com)`. Contagens são retratos da data acima, não promessa de inventário futuro.

## Resumo e top 5 recomendado

Ranking consolidado depois da comparação final:

1. **Banco Mundial — integrar primeiro:** 654 avisos com prazo aberto foram medidos pela outra pesquisa, sobre uma API/dataset diário CC BY 4.0; classificar método e documento em vez de presumir elegibilidade universal.
2. **BID/IDB — integrar após acertar o canal de consumo:** Brasil é um dos 48 países-membros elegíveis, o catálogo é CC BY 4.0 e tinha 2.321 avisos de 2026; o `robots.txt` pede evitar a API/download direto, portanto obter autorização ou entrega oficial.
3. **EU Funding & Tenders/Horizon Europe — integrar:** 1.197 itens abertos/futuros foram medidos na consulta correta e há API oficial; a UI precisa separar “pode participar” de “recebe verba europeia”.
4. **Programas ibero-americanos — piloto cultural:** Mapa IberCultura Viva tem API compatível com o stack atual e Ibermedia/Iberescena/IberMúsicas somam linhas anuais muito aderentes; limitar a chamadas oficiais e confirmar licença/curadoria.
5. **TED sob o acordo UE–Mercosul — integrar como recorte:** o iTA aplica-se provisoriamente desde 01/05/2026 e cobre compras governamentais, mas somente entidades, objetos e valores dos anexos; fora da cobertura, manter elegibilidade desconhecida.

### Ranking obtido antes de ler a outra pesquisa

1. **BID/IDB — integrar primeiro:** API/CSV estruturados sob CC BY 4.0 e elegibilidade de país-membro.
2. **Banco Mundial — integrar:** maior acervo verificável e atualização diária, com elegibilidade por aviso.
3. **EU Funding & Tenders/Horizon Europe — integrar:** API pública e alto valor para pesquisadores/startups.
4. **Mapa IberCultura Viva — piloto condicionado:** API pública e bom encaixe com `/oportunidades`, após confirmar licença e origem oficial.
5. **UKRI–FAPESP — parceria:** 11 resultados abertos/futuros para “Brazil”, cooperação até 2030 e licença não comercial.

**Decisão geral.** Banco Mundial e EU Funding & Tenders podem avançar tecnicamente; o BID é prioridade equivalente, condicionado a autorização/canal de consumo compatível com o `robots.txt`. TED entra como quarta fonte estruturada apenas no recorte coberto pelo iTA UE–Mercosul ou admitido expressamente — publicar o acervo inteiro como “aberto a brasileiros” produziria falsos positivos. As fontes culturais são valiosas e de baixo volume, porém quase todas carecem de API/licença explícita: a rota correta é parceria ou curadoria autorizada, não raspagem. UNGM e agregadores proíbem ou restringem expressamente redistribuição/extração automatizada.

## Critérios usados

- **Elegibilidade BR:** `sim` significa que a regra oficial inclui o Brasil; `condicional` exige entidade, residência, parceiro, território ou modalidade; `por aviso` exige leitura da documentação; `não` vale para a chamada genérica avaliada.
- **Volume:** contagem oficial, resultado de consulta ou número de linhas de chamada. Quando a fonte não publica inventário/API, consta “não mensurado”, em vez de extrapolação.
- **Risco:** **baixo** = API/dado aberto e licença compatível; **médio** = página pública sem licença clara, exigindo autorização; **alto** = termos vedam coleta/redistribuição, `robots.txt` bloqueia ou o conteúdo útil depende de login.
- **Esforço:** **P** = esquema estável e pouca extração; **M** = normalização, tradução e regras; **G** = documentos não estruturados, login ou negociação.
- `robots.txt` não concede licença. Ele é uma restrição operacional adicional; termos/licenças prevalecem.

## Tabela comparativa

| Fonte | Elegibilidade BR e detecção | Acesso | Termos/risco | Barreiras | Volume e atualização | Campos úteis | Esforço | Recomendação |
|---|---|---|---|---|---|---|---|---|
| **BID/IDB** | Sim para firmas e pessoas dos 48 membros, salvo restrição no edital; `member_country=true` + exceções do documento | CKAN DataStore API, CSV, página pública | CC BY 4.0; **baixo**. `robots.txt` bloqueia `/api/`, então preferir CSV oficial ou obter confirmação para polling | Documentos podem detalhar nacionalidade/consórcio | 37.615 total; 2.321 com `publicationyear=2026`; atualização observada até 09/10 | título, projeto, país, setor, datas, prazo, método, categoria, URLs | P/M | **Integrar** |
| **Banco Mundial** | Por aviso; processos internacionais tendem a admitir firmas elegíveis, trust funds podem restringir; método + texto/documento | API de Procurement Notices, API/JSON/CSV Finances One | CC BY 4.0; **baixo** | API não entrega “BR eligible”; prazo/status precisam de normalização | 422.441 na API testada; dataset diário; abertas/mês não exposto de modo confiável | descrição, país, projeto, tipo, método, idioma, publicação, prazo, texto | M | **Integrar** |
| **EU Funding & Tenders / Horizon** | Participação geralmente sim; financiamento direto geralmente não para entidade brasileira, salvo chamada/mecanismo complementar; campos separados | Search, Facet e Topic Details REST públicos | conteúdo da UE em geral CC BY 4.0; **baixo** | consórcio, tipo de ação e financiamento variam; consulta requer DSL documentada | Portal de alto volume; não há contagem oficial pronta “aberta a BR”; atualização contínua | tópico, programa, status, datas, orçamento, destino, documentos, URLs | M/G | **Integrar** |
| **TED/UE** | Condicional: o iTA UE–Mercosul cobre o Brasil desde 01/05/2026 quando comprador, objeto e valor constam dos anexos; fora disso, por aviso | Search API anônima, XML bulk | reuso oficial/CC BY 4.0; **baixo jurídico**, alto risco de falso positivo | transformar os anexos do acordo em regras; exceções/documentos | 35.653 avisos ativos medidos na outra pesquisa; fração coberta pelo iTA não calculada | comprador, CPV, país, valor/moeda, prazos, idiomas, documentos | G | **Integrar só o recorte coberto/confirmado** |
| **Mapa IberCultura Viva** | Condicional; Brasil membro, mas cada edital define países e em 2026 houve modalidade em que brasileiros entravam por seleção interna | API pública Mapas Culturais e páginas | software livre, mas licença de republicação do conteúdo não localizada; **médio** | registros de usuários misturados aos oficiais | 65 oportunidades em todos os status no retrato; atualização colaborativa | título, tipo, áreas, status, datas com fuso, descrição, anexos, agente | M | **Piloto após autorização** |
| **UKRI/FAPESP** | Condicional a PI britânico e contraparte FAPESP; frequentemente pesquisador/apoio em SP | páginas públicas/filtros | CC BY-NC-SA predominante; uso comercial exige permissão; **médio/alto** | regras por conselho, instituição e estado | 11 resultados abertos/futuros para “Brazil”; cooperação até dez/2030 | título, status, financiadores, faixa, abertura/fecho, regras | M | **Parceria** |
| **UNGM** | Por aviso: aberta/limitada, país beneficiário, sanções e nível de registro | portal público; API OAuth de agência não é feed global | termos §5.2–5.3 vedam uso comercial, disseminação e sistema de recuperação sem permissão; **alto** | registro; documentos/eSourcing; API não resolve agregação | grande hub ONU; total aberto/elegível BR não publicado | órgão, referência, título, países, datas GMT, descrição, documentos | G | **Parceria** |
| **UNOPS** | Por aviso; fornecedores internacionais são comuns, mas há requisitos locais | oportunidades no UNGM/eSourcing | herda restrições UNGM; **alto** para coleta | cadastro e envio autenticado | >US$1 bi comprado/ano; >6 mil fornecedores de >170 países, não número de editais | campos UNGM + documentos | G | **Parceria via UNGM** |
| **OPAS/PAHO** | Por aviso; várias compras aceitam empresas, outras exigem entidade no país | UNGM + Workday Strategic Sourcing | sem feed/licença; login para processo; **alto** | cadastro Workday/UNGM e pré-requisitos | RFQ US$5 mil–150 mil; ITB >US$150 mil; sem contagem aberta pública | tipo, escopo, país, prazo, anexos | G | **Parceria** |
| **PNUD/UNDP** | Por aviso e qualificação; individuais e empresas | portal legado público + Quantum autenticado | `robots.txt` do legado bloqueia `/`; sem licença de reuso; **alto** | Quantum/login; documentos e submissão autenticados | fluxo global, mas contagem atual verificável não publicada | título, referência, escritório/país, processo, prazo, anexos | G | **Parceria; não coletar legado** |
| **CAF** | Por chamada; há chamadas “all local and international suppliers” | páginas públicas, OPR/eBox para participar | sem API/licença de reuso localizada; **médio** | cadastros OPR/eBox; regras no corpo/PDF | poucas dezenas/ano aparentes, sem série oficial | título, país, status, prazo, objeto, documentos | M/G | **Parceria** |
| **Ibermedia** | Sim/condicional; produtoras independentes de países-membros, normalmente coprodução entre membros | páginas/PDFs; login para inscrição | sem API/licença clara; **médio** | empresa produtora, coprodutor e modalidade | 6 modalidades em 2026; anual | linha, período, requisitos, valores, bases, contato | M | **Parceria/curadoria autorizada** |
| **Iberescena** | Sim; Brasil listado em 2026–27, com PF/PJ conforme linha | notícia e bases públicas; plataforma de inscrição | sem API/licença clara; **médio** | residência/nacionalidade e cooperação conforme linha | 3 linhas anuais em 2026–27 | título, linha, países, abertura, prazo local, bases | M | **Parceria/curadoria autorizada** |
| **IberMúsicas** | Sim/condicional; nacionalidade ou residência certificada em país participante e adesão do país à convocatória | páginas/bases; login para inscrição | sem API/licença clara; **médio** | país pode não aderir a toda modalidade | 14 convocatórias anunciadas em 2026 | modalidade, país, público, prazo, valor, bases | M | **Parceria** |
| **Iberbibliotecas** | Sim para biblioteca pública/comunitária ou entidade de país/cidade membro; não é edital geral para PF | página/PDF; submissão conforme bases | sem API/licença clara; `robots` respondeu 403; **médio** | tipo institucional e uma proposta por entidade | 1 chamada principal anual (14ª em 2026) | objeto, países, prazo local, regras, apoio, contato | P/M | **Parceria/curadoria** |
| **UNESCO IFCD** | Sim/condicional: instituição pública ou ONG de país em desenvolvimento parte da Convenção 2005; não PF nem produção artística isolada | página/PDF; conta para inscrição | página pública sem API/licença específica localizada; **médio** | foco estrutural em indústrias/políticas culturais; inglês/francês | 1 chamada anual; até US$100 mil/projeto | público, países, teto, prazo Paris, idiomas, guia | P/M | **Parceria/curadoria** |
| **Hubert Bals Fund (IFFR)** | Brasil elegível; HBF+Brazil exige diretor brasileiro e produtora CNPJ, com requisitos de carreira/região | página pública; inscrição autenticada | sem API/licença de reuso localizada; **médio** | cinema autoral, estágio e requisitos específicos | HBF apoiou 20 projetos em 2026; HBF+Brazil até 11 bolsas de €10 mil | programa, país, estágio, valor, prazo, regulamento | P/M | **Parceria/curadoria** |
| **World Cinema Fund** | Brasil consta entre países elegíveis; diretor/região e coprodução alemã conforme modalidade | páginas/PDFs; conta para inscrição | sem API/licença clara; **médio** | longa e parceiro alemão; regras de produção/pós/distribuição | tipicamente 2 rodadas/ano; contagem elegível BR não publicada | modalidade, região, teto (€60 mil em produção), prazo, bases | P/M | **Parceria/curadoria** |
| **IDFA Bertha Fund** | Brasil consta na IBF Europe; na IBF Classic 2026 só Development, não (Post-)Production | páginas/PDF; MyIDFA | sem API/licença clara; **médio** | coprodução, diretor/produção e estágio | chamadas anuais; próxima Classic informada para 10/02/2027; sem contagem BR | linha, países, fase, valores (€7,5 mil/€25 mil), prazo | P/M | **Parceria/curadoria** |
| **Prince Claus Fund** | Sim para indivíduo no início da carreira que vive/trabalha em país DAC elegível; brasileira premiada em 2026 confirma aplicação | página pública/formulário | sem API/licença clara; **médio** | apenas indivíduo, critérios sociais e geográficos | Seed Award anual; volume de inscrições não publicado | programa, perfil, países, prazo, valor, FAQ | P | **Parceria/curadoria** |
| **Sundance Institute** | Documentário aceita projetos do mundo todo; regras variam por programa | páginas públicas; portal autenticado | sem API/licença de reuso; **médio** | estágio, orçamento e não reapresentação; conta na candidatura | 25–30 projetos apoiados/ano no Documentary Fund; uma janela 2026 | programa, público, período, teto/orçamento, regras | P/M | **Parceria/curadoria** |
| **DAAD** | Brasileiros em programas que listam Brasil; pessoa e nível acadêmico variam | Funding Guide/páginas; portal para candidatura | sem API/licença de reuso localizada; **médio** | programa, diploma, idioma e residência | catálogo amplo; total aberto/elegível BR não publicado | bolsa, país, nível, área, prazo, benefícios | M | **Parceria** |
| **Fulbright Brasil** | Sim nas bolsas “para brasileiros”; docente, doutorando ou instituição conforme programa | site nacional; candidatura autenticada | sem API/licença clara; **médio** | perfil acadêmico, vínculo e inglês | pequeno conjunto por ciclo; ex.: até 20 projetos no Specialist | programa, público, benefício, datas, edital | P/M | **Parceria/curadoria** |
| **British Council** | Não para a chamada global CTC 2026; Brasil não consta. Há ações locais pontuais no Brasil | páginas locais/globais | sem API/licença de reuso localizada; **médio** | fragmentação por país e programa | esparso; nenhuma contagem oficial | título, público, local, datas, formulário | M | **Descartar feed global; parceria local** |
| **Newton Fund** | Não aplicável como fonte atual: programa encerrado; sucedâneo é ISPF e chamadas UKRI específicas | página histórica | oficial, mas sem oportunidades atuais | encerrado | zero atuais como Newton | histórico | P | **Descartar; usar UKRI/ISPF** |
| **Devex** | varia por oportunidade; só assinantes veem parte do conteúdo | plataforma/login | Acceptable Use proíbe scraping, bots e redistribuição/serviço concorrente; **alto** | paywall/conta | não mensurado sem login | agregados | G | **Parceria apenas** |
| **fundsforNGOs** | varia por chamada | plataforma/assinatura | política proíbe extração automatizada e uso comercial de listings; **alto** | paywall/conta | não mensurado sem login | agregados | G | **Parceria apenas** |
| **Prosas** | varia por edital; há editais nacionais e internacionais | páginas e embed oficial | conteúdo pertence aos publicadores e licença é dada à Prosas, não ao Pardal; **alto** para raspagem | sem direito claro de sublicença | central atualizada, volume não mensurado | título, patrocinador, período, área, link | M/G | **Parceria ou embed oficial** |

## Evidências e notas por fonte

### 1. Aquisições e licitações

#### BID/IDB

- O [catálogo oficial](https://data.iadb.org/pt-BR/dataset/project-procurement-bidding-notices-and-notification-of-contract-awards) declara CC BY 4.0, oferece CSV/API e informa atualização; a [API DataStore](https://data.iadb.org/pt-BR/api/action/datastore_search?resource_id=856aabfd-2c6a-48fb-a8b8-19f3ff443618) respondeu com 37.615 registros e campos de processo, método, setor, publicação, prazo e documento. Um filtro por `publicationyear=2026` retornou 2.321. A página de metadados ainda dizia cobertura até 2025, embora a API já contivesse 2026.
- A [regra de elegibilidade](https://www.iadb.org/en/how-we-can-work-together/procurement/procurement-projects/frequently-asked-questions) limita bens, obras e serviços a firmas/indivíduos dos 48 membros; o [Brasil é membro](https://www.iadb.org/en/who-we-are/how-we-are-organized/member-countries). A regra automática inicial pode ser `BR=yes`, rebaixada para `conditional/unknown` se as bases trouxerem restrição.
- O `robots.txt` de `data.iadb.org` incluía `Disallow: /api/`. Isso não anula a API nem a licença aberta, mas recomenda usar o download CSV documentado ou obter confirmação do BID antes de polling frequente.

#### Banco Mundial

- O dataset [Procurement Notice — DS00979](https://financesone.worldbank.org/procurement-notice/DS00979) é público, CC BY 4.0, atualizado diariamente e cobre setembro de 2005 em diante. O [API Explorer](https://financesone.worldbank.org/api-explorer?id=DS00979) documenta JSON/CSV e paginação; a [API oficial de notices](https://search.worldbank.org/api/v2/procnotices?format=json&rows=1&os=0), testada com uma linha, informou 422.441 itens e campos como `notice_status`, `notice_type`, `procurement_method_name`, `project_ctry_name`, `noticedate` e `submission_date`.
- A [minuta oficial de General Procurement Notice](https://thedocs.worldbank.org/en/doc/483081468421567709-0290022016/render/Templateforgeneralprocurementnotice.pdf) usa a regra de firmas/indivíduos elegíveis, mas admite restrições de certos trust funds. Logo, “financiado pelo Banco Mundial” não equivale automaticamente a “aberto ao Brasil”. Detectar método internacional, nacionalidade/países no texto e exceções nas bases; na dúvida, `unknown`.
- O total aberto por mês não foi publicado pela API em filtro estável nesta verificação. Não transformar o acervo de 422 mil em estimativa de “abertas”. O coletor deve calcular o estoque pelo prazo e status após ingestão.

#### UNGM

- Os [Termos do UNGM](https://www.ungm.org/Public/Pages/Terms), §§5.2–5.3, limitam o material a uso pessoal e vedam uso comercial, disseminação e inclusão em site/sistema de recuperação sem autorização escrita. Para um produto comercial, o risco é alto mesmo que o aviso seja visível publicamente.
- O [Developer Center](https://developer.ungm.org/) exige OAuth. A [Search Notices API](https://developer.ungm.org/Article/SearchNotices) recupera avisos criados pela própria agência autenticada, não um feed global para agregador. Portanto, negociar licença/feed com `registry@ungm.org`; não raspar.
- Elegibilidade é por aviso: competição aberta ou limitada, país beneficiário, sanções, nível de registro e exigências técnicas. O campo automático deve permanecer `unknown` até regra/documento oficial.

#### UNOPS, OPAS/PAHO e PNUD/UNDP

- A [UNOPS Supplier Resource Centre](https://www.unops.org/business-opportunities/supplier-resource-centre) informa mais de US$1 bilhão em compras anuais, mais de 6 mil fornecedores e mais de 170 países; as oportunidades apontam ao UNGM/eSourcing. Alto valor, mas a integração deve ser negociada no nível UNGM/UNOPS.
- A [OPAS — Become a vendor](https://www.paho.org/en/doing-business-paho/become-vendor) dirige fornecedores ao UNGM e Workday Strategic Sourcing; documenta RFQ de US$5 mil a US$150 mil, ITB acima de US$150 mil e RFP acima de US$5 mil. Algumas oportunidades locais exigem entidade estabelecida no país: classificar por documento, nunca pelo organismo.
- O [portal legado de Procurement Notices do PNUD](https://procurement-notices.undp.org/) mostra título, referência, escritório, processo e prazo, mas seu `robots.txt` bloqueia `/`. O processo atual usa o [Quantum Supplier Portal](https://www.undp.org/sites/g/files/zskgke326/files/2022-10/Invitation%20to%20the%20Quantum%20Supplier%20Portal%20Webinar_0.pdf), com conta/login. Não coletar o legado; buscar parceria ou feed licenciado.

#### CAF

- A CAF publica [chamadas públicas](https://www.caf.com/en/work-with-us/calls/) e [diretrizes de seleção](https://www.caf.com/en/who-we-are/what-we-do/access-to-information/guidelines-for-the-selection/). Uma chamada verificada de equipamentos dizia estar aberta a [fornecedores locais e internacionais](https://www.caf.com/en/work-with-us/calls/invitation-to-prequalify-for-the-supply-and-delivery-of-laptops-cases-and-headsets/), mas exigia OPR/eBox.
- Sem API ou licença de redistribuição identificada, elegibilidade e prazo dependem do HTML/PDF. Pedir permissão e, enquanto isso, usar apenas curadoria com link.

#### TED

- A [Search API](https://docs.ted.europa.eu/api/latest/search.html) é anônima, pagina até 250 registros e é oferecida para reuso/análise, inclusive por organizações comerciais; há também [bulk XML](https://docs.ted.europa.eu/ODS/latest/reuse/index.html). O conteúdo da Comissão segue a [licença de reutilização/CC BY 4.0](https://commission.europa.eu/legal-notice_en), salvo indicação contrária.
- Isoladamente, o Brasil é [observador, não parte do GPA](https://www.wto.org/english/tratop_e/gproc_e/memobs_e.htm). No caso [Kolin, C-652/22](https://curia.europa.eu/jcms/upload/docs/application/pdf/2024-10/cp240183en.pdf), o TJUE registrou que operador de terceiro país sem acordo não pode exigir tratamento igual; esse era o limite encontrado na pesquisa independente.
- A comparação revelou um fato posterior e decisivo: o [Acordo Interino de Comércio UE–Mercosul](https://policy.trade.ec.europa.eu/eu-trade-relationships-country-and-region/countries-and-regions/mercosur/eu-mercosur-agreement/text-agreement_en) passou a aplicar-se provisoriamente em **01/05/2026** e inclui compras governamentais, com anexos de cobertura por entidade, bens/serviços e limiares. Isso dá tratamento coberto a fornecedores brasileiros, mas não a todo aviso TED.
- Publicar como `yes` quando comprador, objeto/CPV e valor se enquadrarem nos anexos do iTA; como `conditional` quando faltar confirmar uma dimensão; e como `unknown` fora da cobertura, salvo se as bases admitirem expressamente terceiros países. O badge não pode usar apenas `gpa-lot`.

### 2. Fomento cultural e audiovisual

#### Ibermedia, Iberescena e IberMúsicas

- O [Ibermedia](https://www.programaibermedia.com/convocatorias/) abriu seis modalidades em 2026, com janela de 30/01 a 30/03. As bases de coprodução exigem produtoras independentes de países membros e parceiros de mais de um país. Brasil participa do programa; detectar país, tipo de entidade, estágio e coprodutor em cada PDF.
- O [Iberescena 2026–27](https://iberescena.org/Noticias/2564) listou expressamente Brasil, abriu de 26/05 a 23/07/2026 às 12h do país e ofereceu três linhas. Guardar a zona original, não apenas converter uma data sem hora.
- A [FAQ IberMúsicas](https://www.ibermusicas.org/index.php/preguntas-frecuentes-3/) inclui Brasil e exige nacionalidade ou residência certificada em membro participante; cada país pode aderir a chamadas distintas. Foram anunciadas 14 convocatórias em 2026. Sem API/licença, todas pedem autorização/curadoria.

#### IberCultura Viva

- O [Mapa IberCultura Viva](https://mapa.iberculturaviva.org/oportunidades/) mostrava 65 oportunidades em todos os status, com filtro de “chamadas oficiais”. A [API pública testada](https://mapa.iberculturaviva.org/api/opportunity/find?@select=id,name,status,registrationFrom,registrationTo&@limit=1) devolveu JSON com id, título, status e datas/fuso. A plataforma se declara [livre, colaborativa e software livre](https://mapa.iberculturaviva.org/), mas isso não prova licença para republicar todo conteúdo do usuário.
- O Brasil é membro, porém a [Mobilidade 2026](https://mapa.iberculturaviva.org/files/opportunity/587/portugues-edital-de-mobilidade-ibcv-2026-docx.pdf) determinou que brasileiros não concorreriam no edital: as vagas seriam preenchidas por seleção interna na Teia Nacional. Isso demonstra por que “país membro” é só sinal, não decisão final.
- Integrar apenas registros do agente oficial do programa e/ou `official=true`, após confirmação de licença; excluir conteúdo colaborativo não verificado ou exibi-lo com origem claramente identificada.

#### Iberbibliotecas e UNESCO IFCD

- A [14ª Convocatória Iberbibliotecas 2026](https://www.iberbibliotecas.org/por/convocatoria-de-ayudas/) incluiu Brasil e destinou-se a bibliotecas públicas/comunitárias ou entidades responsáveis, com uma proposta por entidade e prazo local. É uma oportunidade anual, não um feed de alto volume.
- A [FAQ do UNESCO IFCD](https://www.unesco.org/creativity/en/ifcd/faq) limita candidatura a instituição pública ou ONG de país em desenvolvimento parte da Convenção de 2005; não financia indivíduo nem simples produção artística. A [chamada 2026](https://www.unesco.org/creativity/sites/default/files/medias/fichiers/2026/03/17_IFCD_call_2026_en__0.pdf?hub=11) fixou até US$100 mil e prazo em horário de Paris. A [lista de projetos financiados](https://www.unesco.org/creativity/en/ifcd/funded-projects/list) contém projeto do Brasil, confirmação prática da elegibilidade; ainda é preciso validar a categoria da entidade.

#### HBF, World Cinema Fund, IDFA Bertha, Prince Claus e Sundance

- O [Hubert Bals Fund FAQ](https://iffr.com/en/hubert-bals-fund/hubert-bals-fund-faq) define país, residência/trabalho, formato e estágio. O [HBF+Brazil](https://iffr.com/en/hubert-bals-fund/hubert-bals-fund-faq/hbfbrazil-co-development-support-faq) ofereceu até 11 bolsas de €10 mil para diretor brasileiro e produtora brasileira com CNPJ, com recortes de carreira e região.
- O [World Cinema Fund](https://www.berlinale.de/en/world-cinema-fund/funding-programmes/production-support/intro.html) cobre América Latina. As [diretrizes de produção](https://www.berlinale.de/media/download/wcf/wcf_guidelines_classic_prod_en.pdf) exigem vínculo regional e cooperação com produtora alemã; o teto verificado é €60 mil. Brasil consta na [lista de países](https://www.berlinale.de/media/download/wcf/wcf_europe_eligible_regions_and_countries.pdf).
- A [FAQ do IDFA Bertha Fund](https://professionals.idfa.nl/en/training-funding/funding/faq-funding/) exige nacionalidade/residência conforme a linha. Brasil aparece na [IBF Europe Country List 2025](https://cdn2.assets-servd.host/idfa-cms/production/uploads/Professionals-Training-and-Funding/IBF-Europe-Country-List-2025.pdf?dm=1740068071); a linha Europe requer coprodutor europeu de país MEDIA. Na [IBF Classic Country List 2026](https://cdn2.assets-servd.host/idfa-cms/production/uploads/Professionals-Training-and-Funding/IBF-Classic-Country-List-2026.pdf), Brasil está limitado a **Development**, sem (Post-)Production. Um [projeto brasileiro financiado em 2025](https://professionals.idfa.nl/bertha-fund/7d990ddb-102e-410e-8966-7862ec326cbb/freedom-is-no-fear/) confirma aplicação prática na linha Europe.
- O [Prince Claus Seed Award](https://princeclausfund.nl/awards-and-programmes/seed-award) é para indivíduos no início da carreira em países DAC elegíveis. A seleção de [Caxtrinho, Brasil, em 2026](https://princeclausfund.nl/awardees/caxtrinho) é evidência concreta de elegibilidade.
- O [Sundance Documentary Film Program](https://www.sundance.org/programs/documentary-film) aceita documentários cinematográficos do mundo todo, financia 25–30 projetos/ano e publicou janela 18/05–15/06/2026. A candidatura ocorre em [portal autenticado](https://apply.sundance.org/). Outros programas têm regras próprias.

### 3. Pesquisa, inovação e educação

#### EU Funding & Tenders / Horizon Europe

- A Comissão documenta [Search, Facet e Topic Details APIs](https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/support/apis). Um POST mínimo ao Search API retornou JSON, mas uma consulta ampla também indexou eventos do portal; a implementação deve reproduzir a DSL oficial de `type`, `status`, `frameworkProgramme` e validar cada datasource, em vez de usar busca textual indiscriminada.
- A página oficial de [cooperação UE–Brasil](https://research-and-innovation.ec.europa.eu/strategy/strategy-research-and-innovation/europe-world/international-cooperation/bilateral-cooperation-science-and-technology-agreements-non-eu-countries/brazil_en) diz que entidades brasileiras podem participar, mas em princípio não são financiadas diretamente em projetos colaborativos; CNPq/FINEP/CONFAP mantêm mecanismo complementar. [Quem pode se candidatar](https://rea.ec.europa.eu/horizon-europe-who-should-apply_en) explica consórcios mínimos e participação de outros países; ERC/MSCA têm exceções individuais.
- Modelar três resultados distintos: `can_participate`, `eu_funding_available` e `complementary_funding_available`. Um único booleano “aberto a brasileiros” seria enganoso.

#### UKRI, Newton/ISPF e British Council

- A busca oficial [UKRI opportunities — Brazil](https://www.ukri.org/opportunity/?filter_status%5B%5D=open&filter_status%5B%5D=upcoming&keywords=Brazil) mostrou 11 resultados abertos/futuros. A página [Collaborate with researchers in Brazil](https://www.ukri.org/opportunity/collaborate-with-researchers-in-brazil/) informa memorando UKRI–FAPESP até dezembro de 2030; o PI britânico lidera e a contraparte brasileira normalmente precisa ser elegível à FAPESP.
- Os [termos UKRI](https://www.ukri.org/who-we-are/terms-of-use/) usam predominantemente CC BY-NC-SA e exigem permissão para reprodução eletrônica comercial. Como o Pardal tem assinatura, usar apenas por parceria/licença.
- O [Newton Fund](https://www.gov.uk/government/publications/newton-fund-building-science-and-innovation-capacity-in-developing-countries/newton-fund-building-science-and-innovation-capacity-in-developing-countries) está encerrado e foi sucedido pelo International Science Partnerships Fund. Não criar fonte “Newton”; acompanhar chamadas atuais UKRI/ISPF.
- A chamada global [Connections Through Culture 2026](https://arts.britishcouncil.org/connections-through-culture) não incluiu Brasil. Existem ações locais, como [AfroEstima](https://www.britishcouncil.org.br/atividades/artes/afroestima), mas sem feed consistente. Descartar a fonte global como integração e conversar com o escritório brasileiro sobre um feed local.

#### DAAD e Fulbright

- O [DAAD Scholarships](https://www.daad.de/en/studying-in-germany/scholarships/daad-scholarships/) encaminha ao Funding Guide e ressalta que público e condições variam. Um programa verificado, [Green Hydrogen](https://www.daad.de/en/studying-in-germany/scholarships/daad-funding-programmes/green-hydrogen/ausschreibungen_announcements/), inclui Brasil. Não há API/licença pública identificada; parceria.
- A [Fulbright Brasil — bolsas para brasileiros](https://fulbright.org.br/bolsas-para-brasileiros/) torna a nacionalidade explícita por programa. Exemplos incluem [Doutorado Sanduíche](https://fulbright.org.br/bolsas-para-brasileiros/doutorado-sanduiche-nos-estados-unidos/) e [Fulbright Specialist](https://fulbright.org.br/bolsas-para-brasileiros/pvcd-fulbright-specialist/), com até 20 projetos na edição verificada. Volume baixo e estruturável por curadoria autorizada.

### 4. Agregadores: somente parceria

- A [Acceptable Use Policy do Devex](https://support.devex.com/hc/en-us/articles/203927850-Acceptable-use-policy) proíbe scraping/crawling, bots, reprodução, redistribuição e uso em serviço concorrente.
- Os [termos do fundsforNGOs](https://www.fundsforngos.org/terms/) proíbem extração automatizada e uso comercial de listagens e conteúdo de membros.
- Os [termos da Prosas](https://produtos.prosas.com.br/termos-de-uso) não concedem ao Pardal direito de reutilizar conteúdo de terceiros. Há [componentes de embed oficiais](https://developer.prosas.com.br/docs/embeds/components/listagem-editais/), caminho aceitável mediante acordo. Nenhum dos três deve ser raspado.

## Modelo de dados recomendado

Não usar apenas `kind = international`: “internacional” é escopo geográfico, enquanto `kind` deve distinguir licitação, bolsa e prêmio. Para não sobrecarregar `cultural_opportunities`, criar uma entidade geral `opportunities` (ou `international_opportunities` inicialmente) e mapear as oportunidades culturais existentes para ela progressivamente.

```text
opportunities
  id uuid
  scope enum('brazil','international')
  kind enum('procurement','grant','research_call','scholarship','fellowship','prize')
  audiences text[]                 -- supplier, artist, producer, researcher, startup...
  source_id / external_id / source_url / canonical_url
  source_org / buyer_org
  title_original / title_pt
  summary_original / summary_pt
  original_language bcp47
  countries iso3166[] / regions text[] / areas text[]
  eligibility_br enum('yes','conditional','no','unknown')
  eligibility_reason_pt text
  eligibility_entity_types text[] -- individual, company, NGO, university...
  eligible_country_codes text[] / excluded_country_codes text[]
  requires_local_partner bool / requires_foreign_partner bool
  can_participate bool? / direct_funding_available bool? / complementary_funding bool?
  eligibility_detection enum('structured','rules','document_model','manual')
  eligibility_confidence numeric / eligibility_evidence_url
  published_at / source_updated_at / opens_at / deadline_at timestamptz
  deadline_timezone text / deadline_original_text text
  amount_min / amount_max / currency char(3)
  amount_brl_approx / fx_rate / fx_rate_date / fx_source
  application_requires_login bool / application_url
  documents jsonb / raw_payload jsonb / raw_hash / fetched_at
  license_code / attribution_text / status / last_verified_at
```

Regras importantes:

- chave única `(source_id, external_id)` e histórico de alterações de prazo/status;
- `deadline_at` sempre UTC, preservando `deadline_timezone` e texto original. Se a fonte não der hora/fuso, não inventar meia-noite; mostrar “hora não informada”;
- valor sempre no original. Exibir `≈ R$` com PTAX do Banco Central, data/cotação visíveis e aviso de aproximação;
- “sim” só com evidência estruturada ou regra inequívoca; “condicional” deve expor a condição; “unknown” não entra no filtro padrão “aberto a brasileiros”;
- armazenar só metadados/documentos cuja licença permita; caso contrário, título mínimo autorizado e link para a fonte.

## Tradução, resumo e custo

O JEV já usado no projeto é adequado para classificação estruturada, não para gerar tradução livre confiável. Pela tarifa local registrada no projeto (`US$ 0,042/M` tokens de entrada), classificar 10 mil oportunidades/ano com 600–2.000 tokens por item custaria aproximadamente **US$ 0,25–0,84/ano**, fora saída/infra; usar para `eligibility_br`, área e público, com regra determinística antes do modelo.

Para título/resumo em português sem OpenAI, usar **NLLB-200 distilled 600M** ou **Marian/OPUS-MT**, em lote, cacheado por `raw_hash`; resumo pode ser extrativo e depois traduzido. Hipótese explícita: 10 mil itens × 250 tokens = 2,5 milhões de tokens; a 15–40 tokens/s são cerca de 17–46 CPU-h/ano. Em instância batch pequena, ordem de grandeza **US$ 3–12/ano**, sem incluir operação/revisão. Medir benchmark no hardware real antes de contratar. Exibir “tradução automática” e oferecer o original.

## UX proposta

- Rota `/oportunidades?scope=international`, preservando a experiência atual; abas **Todas**, **Licitações**, **Cultura**, **Pesquisa & inovação**, **Bolsas & prêmios**.
- Filtro padrão **Aberto a brasileiros** = `yes + conditional`; opção separada “inclui elegibilidade a confirmar”. Filtros: público (PF/PJ/ONG/universidade), organismo, região/país, idioma, área, tipo, valor/moeda, prazo e “exige parceiro no exterior”.
- Card com badge **Brasil: sim/condicional/a confirmar**, condição em uma linha, título PT + idioma original, organização, prazo em Brasília e fuso original, valor original + conversão aproximada, e link oficial.
- Página de detalhe com bloco “Por que aparece para brasileiros?”, evidência/data da verificação e aviso para conferir as bases. Para Horizon: badges separados “pode participar” e “verba da UE disponível”.
- Datas relativas (“encerra em 3 dias”) calculadas de `deadline_at`; se a hora não veio da fonte, não mostrar contagem horária.

## Esboço de integração das top 3

### 1. BID/IDB

1. Baixar o recurso CSV oficial em job diário (ou API após confirmação sobre `robots.txt`), registrar ETag/hash e processar só mudança.
2. Mapear `noticeid`, `type`, `countryname`, `projectnumber`, `noticetitle`, `documenturl`, `publicationdate`, `deadline`, `sector`, `category_nm`, `prcrmnt_mthd_engl_nm` e `process_desc`.
3. Excluir adjudicações/encerrados do feed aberto; interpretar prazo/fuso sem suposição. Aplicar `eligibility_br=yes` pela regra de país-membro e rebaixar se documento contiver restrição territorial/nacional.
4. Atribuir BID e CC BY 4.0; revisão amostral semanal de falsos positivos.

### 2. Banco Mundial

1. Consumir DS00979/API oficial em lote incremental por publicação/id, respeitando paginação (máximo documentado) e cache.
2. Separar GPN/awards de oportunidades acionáveis; manter apenas prazo futuro/status corrente na busca padrão.
3. Regra de elegibilidade: método internacional + ausência de exclusão → `conditional` até confirmação; método nacional/restrição → `unknown/no`; extrair nacionalidade e trust fund do documento.
4. Manter idioma original, atribuição e link; computar métricas abertas/mês no banco local, não a partir do total histórico.

### 3. EU Funding & Tenders

1. Usar a DSL documentada no Search API para `type`, `status`, período/programa e depois Topic Details; validar que o datasource é de grants/tenders, pois busca textual ampla retorna também eventos.
2. Para Horizon, mapear tópico, programa, destino, tipo de ação, orçamento, abertura/encerramento e documentos.
3. Classificar Brasil em três eixos: participação, financiamento direto e mecanismo complementar. Regras estruturadas por tópico primeiro; PDF/modelo apenas para exceções.
4. Para tenders do portal, aplicar o mesmo gate do TED e não presumir acesso de terceiro país.

## Testes técnicos pontuais

| Teste | Resultado verificado |
|---|---|
| World Bank `search.worldbank.org/api/v2/procnotices`, `rows=1` | HTTP/JSON; `total=422441`; 15 campos úteis no registro |
| BID CKAN `datastore_search`, `limit=1` e filtro de ano | HTTP/JSON; `total=37615`; 23 campos; `publicationyear=2026` retornou 2.321 |
| EU Search API, POST com filtros da documentação | HTTP/JSON; busca ampla também trouxe datasource de eventos, exigindo validação de DSL/datasource |
| Mapa IberCultura Viva `/api/opportunity/find`, `limit=1` | HTTP/JSON; id, nome, status, início/fim e fuso |

Nenhum teste submeteu proposta, baixou área autenticada ou contornou proteção. O `robots.txt` relevante foi consultado uma vez por host: BID bloqueia `/api/`; PNUD legado bloqueia `/`; IberCultura pede `crawl-delay: 60` no site editorial (a API do Mapa respondeu separadamente); os demais achados materiais foram incorporados à tabela.

## Limitações

- “Elegível” é decisão jurídica/operacional da fonte, não garantia do Pardal. Documentos podem mudar até o prazo.
- Volumes de páginas sem API não são auditáveis sem coleta continuada; foram deixados como não mensurados.
- Não foi criada conta para descobrir campos pós-login. Valores, documentos ou contagens ocultos não foram inferidos.
- A pesquisa cobre fontes de alto valor conhecidas, não todos os financiadores do mundo.

## Comparação com a outra pesquisa

O relatório paralelo consultado foi `docs/research/oportunidades-internacionais-2026-10.md`, commit `5a7a940e` da branch `origin/docs/research-internacional`. Ele só foi aberto depois de a matriz, as notas por fonte, o modelo e o ranking independente acima estarem escritos.

### Onde concordam

- **Núcleo integrável:** Banco Mundial, BID e EU Funding & Tenders são as fontes estruturais; UNGM e agregadores exigem parceria.
- **Elegibilidade não é um booleano simples:** Horizon separa participação e financiamento; TED e Banco Mundial exigem regra/documento; editais culturais variam por modalidade.
- **Programas ibero-americanos:** têm alto encaixe com o público cultural, baixo volume e cadência anual; Mapa IberCultura Viva é tecnicamente o mais fácil.
- **Operação:** preservar idioma/fuso/valor original, converter para Brasília/PTAX com transparência, manter link oficial e sinalizar que o edital prevalece.
- **Modelo:** `international` é escopo, não tipo. Ambos propõem `scope`, elegibilidade explicada e filtros por público, região, organismo e idioma.
- **Compliance:** não raspar Devex, fundsforNGOs, Prosas, UNGM ou o portal legado bloqueado do PNUD; não copiar regulamentos sem licença.

### Divergências e força da evidência

| Tema | Esta pesquisa independente | Outra pesquisa | Evidência mais forte / conclusão consolidada |
|---|---|---|---|
| **Ordem Banco Mundial × BID** | BID em 1º pela elegibilidade de membro e esquema completo; Banco Mundial em 2º | Banco Mundial em 1º por 654 abertos; BID condicionado ao `robots` | A outra é mais forte em **estoque aberto**; esta é mais forte em **BID** (API realmente testada, 37.615 total/2.321 em 2026 e campos). Consolidado: Banco Mundial 1º, BID 2º após autorização/canal oficial. |
| **Banco Mundial: elegibilidade** | Por aviso; método nacional e trust funds impedem regra universal | `open` fixo, rebaixando processos nacionais/locais | Esta pesquisa tem evidência mais direta na minuta oficial e evita contradição lógica. Consolidado: `conditional` por padrão, `yes` só após método/documento; sanções seguem regra própria. |
| **Banco Mundial: volume** | 422.441 total; não obteve filtro de abertos confiável | 654 com `deadline_strdate`/`deadline_enddate`, detalhados por tipo/região | A outra pesquisa é mais forte e reproduzível no retrato. Sua estimativa de 450–700 novos/mês continua estimativa, não volume medido. |
| **BID: acesso** | Chamou o DataStore uma vez apesar do `robots`, comprovou schema/volume e propôs CSV/permissão | Não chamou API/download por causa do `robots` | Esta é mais forte nos fatos do dado; a outra é mais conservadora operacionalmente. Consolidado: não fazer polling até resposta do BID, usar entrega/download expressamente autorizado. |
| **EU F&T: documentação e licença** | Localizou a página oficial de APIs e a licença geral CC BY 4.0; teste amplo misturou eventos | Não localizou docs/licença, mas executou a consulta multipart correta e mediu 1.197 | Evidência complementar: esta é mais forte em base técnica/jurídica; a outra em volume e payload. Integrar usando a DSL documentada e checagem de datasource. |
| **IberCultura Viva: elegibilidade/risco** | Demonstrou que a Mobilidade 2026 excluiu brasileiros do concurso direto; licença de conteúdo segue não confirmada | Regra fixa `open` por país-membro, risco baixo, 1 chamada aberta | Esta é mais forte na elegibilidade por edital e na distinção software livre × conteúdo. A outra é mais forte na contagem aberta. Consolidado: apenas chamadas oficiais, `conditional` até ler bases e autorização de republicação. |
| **Ibermedia/Iberescena/IberMúsicas** | Parceria ou curadoria autorizada por falta de licença | Integrar curado/HTML, risco baixo-médio | Não há licença positiva em nenhuma pesquisa. Fica a postura mais conservadora: metadados mínimos/link por curadoria autorizada; nada de raspagem automática antes de permissão. |
| **TED e Brasil** | Considerou GPA/Kolin e, inicialmente, só admissão explícita | Identificou aplicação provisória do iTA UE–Mercosul desde 01/05/2026, sem resolver anexos | A pista da outra pesquisa era essencial. Esta comparação a confirmou em páginas oficiais e verificou que compras governamentais têm anexos de cobertura. Consolidado: TED sobe ao top 5, mas apenas com motor de entidade + objeto + limiar; não é elegibilidade universal. |
| **IDFA Bertha** | Confirmou Brasil na IBF Europe e coprodução europeia | Encontrou a lista Classic 2026: Brasil só Development | A outra pesquisa é mais atual para Classic; esta confirmou o PDF e acrescenta Europe. Guardar elegibilidade por linha/ano. |
| **UKRI** | 11 resultados abertos/futuros para Brazil; termos CC BY-NC-SA e uso comercial sob permissão | 151 oportunidades totais e RSS de 20; licença não confirmada | Esta é mais forte para escopo BR e termos; a outra para inventário total/feed. Recomendação consolidada: parceria, fora do top 5 inicial. |
| **CAF, HBF, IFCD, Iberbibliotecas, British Council** | Abriu páginas/bases oficiais e confirmou regras específicas | Várias ficaram bloqueadas ou não verificadas | Esta pesquisa tem evidência mais forte; manter parceria/curadoria e as condições detalhadas nesta versão. |
| **Tradução/custo** | Modelo local; JEV só classifica, com constante no código de US$0,042/M tokens de entrada | Modelo local, mas sugeriu OpenAI como reserva e disse que o custo JEV não estava documentado | Esta é mais alinhada ao requisito “sem OpenAI se possível” e à constante em `artifacts/api-server/src/titles/nightly-classification.ts`. Manter NLLB/Marian e benchmark real. |

### Top 5 consolidado

1. **Banco Mundial:** API/dataset diário e aberto, 654 avisos com prazo vigente medidos; implementar elegibilidade conservadora.
2. **BID/IDB:** melhor aderência empresarial regional e esquema CC BY completo; formalizar o canal de ingestão por causa do `robots.txt`.
3. **EU Funding & Tenders:** 1.197 abertos/futuros no retrato, API oficial e grande valor para pesquisa/startups; separar participação de financiamento.
4. **Programas ibero-americanos:** Mapa IberCultura Viva como piloto e Ibermedia/Iberescena/IberMúsicas por curadoria autorizada, com regra por edital.
5. **TED coberto pelo iTA UE–Mercosul:** alto potencial novo desde maio de 2026, condicionado a transformar os anexos do acordo em regras verificáveis.

**Síntese da comparação:** a outra pesquisa foi mais forte nas contagens operacionais de Banco Mundial, UE e inventário aberto do Mapa; esta foi mais forte em documentação/licença da UE, schema/volume do BID, exceções reais de elegibilidade cultural, termos do UKRI e regras dos fundos. O principal ganho consolidado é elevar TED por causa do acordo UE–Mercosul em vigor provisório, sem repetir o erro de tratar todo o TED como aberto a empresas brasileiras.
