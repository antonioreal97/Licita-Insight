# Pesquisa de fontes para o hub de oportunidades (2026-10)

## Resumo executivo

Top 5, na ordem recomendada:

1. **Transferegov.br (API pública + CSV)** — API oficial, dados abertos e cobertura de programas/parcerias federais; maior retorno por esforço médio.
2. **Querido Diário (OKBR)** — API pública documentada, 60 req/min como referência e cobertura municipal que complementa o PNCP; exige classificação de texto para achar editais.
3. **FINEP + CNPq + CAPES** — chamadas de fomento de alto valor para empresas, ICTs e pesquisadores; páginas oficiais HTML estruturadas, integração P/M e sem login para leitura.
4. **FAPs (FAPESP, FAPERJ, FAPEMIG e padrão TECNOVA/Centelha)** — forte valor estadual e inovação; começar pelas três FAPs pedidas e depois replicar o adaptador para demais FAPs.
5. **SENAI/SESI — Plataforma Inovação para a Indústria** — inscrições permanentes e chamadas nacionais/regionais para startups e indústria; bom público B2B, mas sem API pública conhecida.

As demais fontes privadas (Prosas, GIFE, Licitações-e, Caixa, Petronect e Sebrae) devem ficar em **parceria/API oficial** ou em escopo posterior. Não foi encontrada autorização para raspagem redistributiva; onde há login, CAPTCHA, taxa ou termos restritivos, a coleta automática está explicitamente fora de escopo. Estimativas de volume são ordens de grandeza para priorização, não métricas publicadas pelas fontes.

## Tabela comparativa

| Fonte | Acesso observado | Termos/risco | Barreiras | Volume/frequência/cobertura | Sobreposição PNCP | Esforço | Recomendação |
|---|---|---|---|---|---|---|---|
| Transferegov.br Gestão de Parcerias + CSV Discricionárias/Legais | API pública PostgREST/Swagger e CSV | Dados públicos; Decreto 8.777 autoriza livre utilização/reuso de bases federais; baixo (atribuir fonte e preservar links) | Sem login para leitura; limites a confirmar por módulo | Milhares de programas/propostas/instrumentos; API/CSV atualizados diariamente; nacional | Baixa: convênios/chamamentos/fomento, não licitação; pode referenciar compras PNCP | M | **Integrar 1** |
| Querido Diário (OKBR) | API pública `/gazettes`, `/territories`, docs Swagger | Projeto declara dados em formato aberto e livre consulta; sem restrição formal, pede bom senso; baixo-médio (atribuir OKBR e fonte original) | Referência 60 req/min; cobertura municipal desigual; PDFs exigem NLP/OCR; sem CAPTCHA na API | Até 5.570 municípios-alvo; edições diárias por município (ordem 10^4–10^5/mês quando cobertura ampla); nacional municipal | Complementar: atos municipais podem incluir compras já no PNCP, mas também credenciamentos/chamamentos fora dele | G | **Integrar 2** |
| FINEP | Página de Chamadas Públicas e documentos PDF/HTML | Órgão federal; leitura pública; dados sujeitos a direitos dos editais; baixo-médio | HTML sem API documentada; filtros e PDFs; submissão usa FAP/login, mas leitura não | ~5–20 chamadas abertas/ano e dezenas em arquivo; atualização conforme edital; nacional | Baixa para fomento; eventual compra institucional pode aparecer no PNCP | P | **Integrar 3 (com CNPq/CAPES)** |
| CNPq | Página “Abertas para Submissão” HTML + PDFs/links | Órgão federal e dados públicos; baixo-médio | Sem API pública encontrada; páginas CMS e PDFs; submissão em plataforma própria | ~10–40 chamadas abertas/ano; nacional; atualização por publicação/retificação | Baixa | P | **Integrar 3 (com FINEP/CAPES)** |
| CAPES | Páginas de editais/resultados e Dados Abertos CKAN | Dados abertos CAPES via CKAN API; política federal de dados abertos; baixo para datasets, médio para PDFs | Editais em HTML/PDF, algumas áreas em sistemas autenticados; sem feed único | Dezenas de editais/chamadas/ano; nacional | Baixa em fomento; licitações CAPES já podem estar no PNCP | P | **Integrar 3 (com FINEP/CNPq)** |
| FAPESP | `fapesp.br/chamadas` HTML estruturado + PDFs | Fundação pública paulista; não foi localizada licença/API de redistribuição específica; médio (confirmar termos antes de armazenar PDFs) | HTML sem API; chamadas internacionais e retificações; submissão em SAGe | ~20–60 chamadas abertas/ano; SP/nacional/internacional; atualização semanal/eventual | Baixa; fomento não licitatório | M | **Integrar 4A** |
| FAPERJ | Lista de editais HTML/PDF; SisFAPERJ para submissão | Sem licença/API pública clara; médio | CMS legado, PDFs, calendário; submissão exige SisFAPERJ/login | ~20–50 editais/ano; RJ; atualização por edital/DOE | Baixa | M | **Integrar 4B** |
| FAPEMIG | Página de chamadas com filtros e campos de valor/prazo | Sem licença/API explícita; médio | Nuxt/HTML; documentos PDF; submissão em sistema próprio | Catálogo observado ~191 chamadas (3 abertas na consulta); MG; atualização contínua | Baixa | M | **Integrar 4C** |
| TECNOVA/Centelha (FINEP + FAPs) | Páginas estaduais e portal Centelha; editais PDF | Cada FAP define termos; risco médio (varia por estado) | Fragmentação estadual, sistemas de submissão; sem API nacional de oportunidades | Dezenas de chamadas estaduais por ciclo (MCTI indicou 18 em 2025 e 8 em 2026); nacional por ondas | Baixa | G (adaptador + catálogo de FAPs) | **Integrar após FAPs, padrão replicável** |
| Licitações-e (Banco do Brasil) | Portal web de pregão; API pública documentada para oportunidades não encontrada | Termos/licença de redistribuição não públicos; robots respondeu 403 na consulta; alto | Cadastro para participar; potencial anti-robô; sem API aberta comprovada | Centenas/milhares de disputas/mês; nacional; atualização em tempo real | Alta: parte relevante de licitações de estatais/empresas públicas pode ser publicada no PNCP; deduplicar por UASG/CNPJ/número | G | **Parceria/API; não raspar** |
| Portal de Compras Caixa | Consulta pública HTML; participação exige cadastro/código de acesso | Sem licença/API de redistribuição identificada; médio-alto | Login/código para fornecedor; portal JS; limites não publicados | Dezenas–centenas de certames/mês; Caixa e conveniados; nacional | Alta: Caixa/estatais sob Lei 13.303 podem também publicar no PNCP | G | **Parceria/API; não raspar** |
| Petronect (Petrobras) | Área pública de oportunidades; área de fornecedor/termo de adesão | Termos condicionam acesso e podem cobrar taxa; sem licença de redistribuição; alto | Login/aceite; taxa para habilitar licitações públicas; portal SAP/anti-robô | Dezenas–centenas de oportunidades/mês; Petrobras; atualização frequente | Alta: Petrobras publica contratações sob Lei 13.303 no PNCP em vários casos | G | **Parceria; não coletar automaticamente** |
| Prosas | API REST oficial documentada, mas exige cadastro de administrador e token; componente embed | Termos proíbem copiar/retransmitir e métodos de extração; alto | Autenticação, escopos, editais privados por convite/link; proteção de dados | Centenas de editais/mês (estimativa); nacional, fomento privado/público | Baixa: fomento/patrocínio, não contratação | M via contrato/API; G por scraping | **Parceria/API** |
| Rede GIFE | Página editorial HTML de editais e chamadas | Termos/licença de redistribuição não localizados; médio-alto | Sem API/RSS público identificado; curadoria manual | Dezenas de posts/chamadas/mês; nacional, investimento social privado | Baixa | M | **Parceria/licença; não raspar** |
| SENAI/SESI — Plataforma Inovação para a Indústria | Portal editorial HTML; regulamento PDF; inscrições permanentes | Instituição privada; regulamento não concede licença de base; médio | Sem API pública; chamadas regionais e documentos; submissão em plataforma | Inscrições permanentes + dezenas de chamadas/ano; nacional/regional | Baixa; P&D/fomento, não licitação | M | **Integrar 5 (HTML cooperativo) / parceria para API** |
| Sebrae (Sebraetec e credenciamentos) | Portais estaduais/Canal do Fornecedor; PDFs; alguns conteúdos requerem login | Sem licença/API de redistribuição geral; médio-alto | Fragmentação por UF, credenciamento/login, páginas dinâmicas | Dezenas de credenciamentos/chamadas por ano por UF; nacional | Média: compras/credenciamentos do Sistema S podem aparecer no PNCP em alguns casos, mas não todos | G | **Parceria; iniciar só com feeds/licenças estaduais** |
| dados.gov.br (catálogo) | API REST/Swagger do catálogo; metadados e links para CSV/JSON | Decreto 8.777: bases federais de livre utilização; licença pode variar por dataset; baixo-médio | Catálogo não garante que cada recurso seja oportunidade nem atualização uniforme; novo portal pede gov.br para certas ações | Catálogo nacional com milhares de datasets; atualização conforme órgão | Indireta: descoberta de APIs/CSVs de FINEP, CAPES, Transferegov etc. | P (metacoleção) | **Integrar como índice, não como coletor único** |

## Evidências e avaliação por fonte

### 1. Transferegov.br / Plataforma +Brasil

O portal oficial descreve APIs de Dados Abertos para **Gestão de Parcerias**, Transferências Especiais, Fundo a Fundo e TED, além de arquivos CSV de Transferências Discricionárias e Legais, com ciclo de vida de programas, propostas e instrumentos ([API pública](https://api-publica.transferegov.gestao.gov.br/); [página de dados abertos](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/api-de-dados-abertos-transferegov.br)). A página afirma acesso público, estruturado e automatizado; a documentação TED confirma filtros PostgREST ([docs TED](https://docs.api.transferegov.gestao.gov.br/ted/)). O Decreto 8.777/2016 estabelece livre utilização das bases e permissão irrestrita de reuso ([texto legal](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8777.htm)).

Campos esperados: órgão/concedente, programa, município/UF, instrumento, valores, situação, datas e links/documentos. Mapear para uma tabela nova `funding_opportunities` (não `tenders`, pois não é compra) e preservar `raw_payload`; quando o registro for um chamamento ainda aberto, preencher `title`, `organizationName`, `state`, `registrationTo`, `sourceUrl`, valor e documentos. Volume é alto no histórico, mas o recorte de oportunidades abertas deve ser filtrado por situação e datas.

### 2. Querido Diário (Open Knowledge Brasil)

A documentação oficial confirma API em `https://api.queridodiario.ok.org.br/docs`, endpoint `/gazettes`, parâmetros `territory_ids`, `querystring`, `excerpt_size`, `number_of_excerpts` e `size`, e URL permanente para automação ([documentação API](https://docs.queridodiario.ok.org.br/pt-br/latest/utilizando/api-publica.html)). A mesma página informa referência de **60 requisições/minuto** e pede taxa baixa por bom senso. A OKBR descreve os dados como diários oficiais municipais em formato aberto e API aberta ([projeto OKBR](https://ok.org.br/projetos/querido-diario/)); a documentação de raspadores registra meta de cobertura dos 5.570 municípios ([raspadores](https://docs.queridodiario.ok.org.br/pt-br/latest/contribuindo/raspadores.html)).

O endpoint devolve metadados da edição, excerto, URL dos arquivos original/TXT, data, edição e território; não entrega um campo “valor” ou “prazo” confiável. O coletor Pardal deve buscar termos de oportunidade (edital, chamamento, credenciamento, tomada de subsídios, contratação), classificar excertos/documentos e só publicar após validação de título, órgão, UF, prazo e link. Tabela sugerida: nova `public_notices` (ou `funding_opportunities` quando o classificador confirmar fomento); não misturar texto bruto de diário em `tenders`.

### 3. FINEP, CNPq e CAPES

FINEP mantém filtro de Chamadas Públicas e páginas de chamada com data de publicação, situação, público-alvo, fonte de recurso e documentos ([lista FINEP](https://www.finep.gov.br/chamadas-publicas/chamadapublica/1); [exemplo de chamada](https://www.finep.gov.br/chamadas-publicas/chamadapublica/763)). O SIC da FINEP orienta que chamadas abertas são consultadas no site e que cadastro de cliente não é obrigatório para participar da chamada ([FAQ/SIC](https://faleconosco.finep.gov.br/sic)).

CNPq publica página “Abertas para Submissão” com título, objetivo, datas de inscrição e links de chamada/FAQ ([página](https://www.gov.br/cnpq/pt-br/chamadas/abertas-para-submissao)). CAPES mantém lista de editais e resultados com anexos PDF/planilhas ([editais e resultados](https://www.gov.br/capes/pt-br/assuntos/editais-e-resultados-capes)) e catálogo de Dados Abertos em CKAN, cuja API `datastore_search` é documentada ([API CKAN CAPES](https://dadosabertos.capes.gov.br/pt_BR/api/1/util/snippet/api_info.html?resource_id=4eee7e99-1692-4819-818b-07839292c688)). Para os três, a leitura é pública e a barreira é formato/retificação, não CAPTCHA.

Esboço de campos: `source_id` estável (URL + número do edital), `title`, `organizationName`, `state` nulo ou UF de execução, `summary`, `registrationFrom/To`, `amount` quando explicitado, `audience`, `sourceUrl`, lista de PDFs e `rawPayload`. Usar `cultural_opportunities` somente para chamadas culturais; demais chamadas em `funding_opportunities`.

### 4. FAPs estaduais e TECNOVA/Centelha

FAPESP apresenta lista HTML de chamadas abertas com prazo, área, programa e modalidade ([chamadas](https://fapesp.br/chamadas/)). FAPERJ mantém lista de editais com datas de submissão, resultados e referência ao Diário Oficial ([lista FAPERJ](https://www.faperj.br/?id=28.5.7)); submissões de várias modalidades exigem SisFAPERJ ([calendário](https://faperj.br/?id=46.5.9)). FAPEMIG oferece catálogo filtrável com status, datas, valor, público-alvo e áreas; na consulta havia 191 registros ([chamadas FAPEMIG](https://fapemig.br/oportunidades/chamadas-e-editais)).

O programa Centelha é operado pela FINEP com parceiros estaduais/FAPs e cada projeto pode receber cerca de R$ 50 mil; o portal oficial lista o modelo e parceiros ([Centelha/FINEP](https://www.finep.gov.br/apoio-e-financiamento-externa/programas-e-linhas/centelha)). Para TECNOVA, páginas estaduais publicam edital, anexos e resultados; exemplo oficial da FUNDECT informa que chamadas e resultados ficam no site e DOE ([TECNOVA MS](https://www.fundect.ms.gov.br/tecnova/)). MCTI registrou ondas de 18 editais estaduais em 2025 e 8 em 2026 ([monitoramento MCTI](https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/ppa/ppa-2024-2027/arquivos/siop_espelho_monitoramento_programa_2324.pdf)).

Integração deve começar por HTML estruturado de FAPESP/FAPERJ/FAPEMIG, com monitoramento semanal e deduplicação por número/URL; depois criar configuração por FAP para TECNOVA/Centelha. Licença de redistribuição não apareceu claramente nos três sites: exibir título, prazo e link oficial com atribuição e não copiar PDF integral até confirmação jurídica.

### 5. Licitações-e, Caixa e Petronect

O BB informa que licitações eletrônicas devem ser consultadas em `licitacoes-e.com.br` e que avisos/editais são divulgados no portal de compras ([BB avisos e editais](https://www.bb.com.br/site/compras-contratacao-e-venda-de-imoveis/compras-e-contratacoes/avisos-e-editais/)). Não foi encontrada API pública documentada para oportunidades; a tentativa de `robots.txt` de `licitacoes-e2.bb.com.br` respondeu 403. Portanto, não propor raspagem.

O Portal de Compras Caixa possui consulta pública de itens, número, ano, valor, modalidade e situação ([portal](https://licitacoes.caixa.gov.br/)), mas as FAQ exigem cadastro/habilitação e código de acesso para participar ([FAQ Caixa](https://www.caixa.gov.br/compras-caixa/perguntas-frequentes/Paginas/default.aspx)). Petronect oferece área pública de oportunidades da Petrobras, porém o termo/FAQ exige aceite e, para licitações públicas, taxa de acesso ([portal Petronect](https://www.petronect.com.br/irj/portal/anonymous/pt); [FAQ](https://www.petronect.com.br/irj/go/km/docs/pccshrcontent/Site%20Content%20%28Legacy%29/Portal2018/pt/faq-socio-fornecedor.html)). Em todos, recomendar contato institucional para feed/API, com cláusula explícita de redistribuição/exibição; sem isso, descartar coleta automática.

### 6. Prosas e Rede GIFE

Prosas possui API REST documentada, mas exige cadastro de administrador e token ([API Prosas](https://developer.prosas.com.br/docs/restapi/prosas-api-rest/)). Seus termos proíbem “transferir, copiar ou retransmitir” conteúdo sem licença e “métodos de prospecção ou métodos semelhantes de extração de dados” ([termos](https://produtos.prosas.com.br/termos-de-uso)). A recomendação é parceria/API com escopo de campos, licença e tratamento de dados; não raspar a Central de Editais.

GIFE publica seleção editorial de editais abertos ([editais GIFE](https://gife.org.br/editais/)) e se apresenta como curadoria de oportunidades do investimento social privado. Não foi localizada API/RSS ou licença de redistribuição; solicitar feed/parceria pelo contato institucional exibido na página inicial ([GIFE](https://gife.org.br/)).

### 7. SENAI/SESI — Plataforma Inovação para a Indústria

O Portal da Indústria informa que o antigo Edital de Inovação virou Plataforma, com inscrições permanentemente abertas, novas chamadas a qualquer momento e mais de 1.400 projetos aprovados ([edições](https://www.portaldaindustria.com.br/canais/plataforma-inovacao-para-industria/edicoes/)). A página lista chamadas nacionais e regionais, categorias para startups, desafios de âncoras, aliança industrial e SESI/SENAI ([plataforma](https://www.portaldaindustria.com.br/canais/plataforma-inovacao-para-industria/); [categorias](https://www.portaldaindustria.com.br/canais/plataforma-inovacao-para-industria/categoria/empreendedorismo-industrial-startuptech/)).

Não foi encontrada API pública nem licença de base; o regulamento é a fonte de regras. Um coletor HTML cooperativo de baixa frequência pode indexar apenas título, categoria, datas, público, valor/faixa e URL do regulamento, sujeito a autorização. Modelo: `funding_opportunities`, público startups/indústrias e empresas que buscam P&D aplicado.

### 8. Sebrae — Sebraetec e credenciamentos

Sebrae mantém Sistema de Gestão de Fornecedores e explica credenciamento contínuo para consultorias/instrutorias e Sebraetec ([Sebrae fornecedores](https://fornecedor.df.sebrae.com.br/fornecedor/default/credenciamento); [sistema](https://meuatendimento.sebrae.com.br/sites/PortalSebrae/canais_adicionais/sistemagestaofornecedores)). Os editais são fragmentados por UF e alguns anexos/resultados exigem login ([exemplo](https://meuatendimento.sebrae.com.br/sites/PortalSebrae/ufs/am/artigos/sebraetec-edital-de-credenciamento-012020%2C5771b6ca7f5e3810VgnVCM100000d701210aRCRD)). Não há licença/API nacional para redistribuição. Priorizar parceria com Sebrae Nacional/UF ou ingestão de feeds explicitamente licenciados; não automatizar login nem contornar bloqueios.

### 9. dados.gov.br como índice transversal

O Portal Brasileiro de Dados Abertos expõe API REST/Swagger para listar e detalhar conjuntos de dados ([Swagger](https://dados.gov.br/swagger-ui/index.html); [catálogo de APIs](https://www.gov.br/conecta/catalogo/apis/api-portal-de-dados-abertos)). O Decreto 8.777 fundamenta livre utilização das bases federais, mas a licença deve ser conferida em cada dataset. Usar o catálogo para descobrir novas APIs/CSVs de órgãos (FINEP, CAPES, Transferegov etc.), não para inferir que todo dataset é uma oportunidade. Integração P: indexar metadados, `organization`, `format`, `license`, `modified` e `accessUrl` e alimentar fila de avaliação humana.

## Mapeamento inicial para as três primeiras integrações

| Fonte | Tabela sugerida | Mapeamento mínimo |
|---|---|---|
| Transferegov | `funding_opportunities` (nova) | `id=instrumento/programa`; `title=nomePrograma/objeto`; `organizationName=órgão concedente`; `state/municipality`; `amount=valor global`; `registrationFrom/To` quando o programa/chamamento trouxer; `sourceUrl`; `documents[]`; `rawPayload`; status derivado de datas/situação. |
| Querido Diário | `public_notices` (nova; ou `funding_opportunities` após classificação) | `id=territory_id+gazette_id+hash`; `title` e `organizationName` extraídos do excerto/documento; `state` via território IBGE; `publishedAt=date`; `proposalDeadline` somente quando extraído com confiança; `sourceUrl=file_url`; `documents[]` com original/TXT; guardar `excerpt`, `edition_number`, `rawPayload`. Não preencher valor ausente. |
| FINEP + CNPq + CAPES | `funding_opportunities` (nova) | `id=org+numero+ano`; `title`; `summary/objective`; `organizationName`; `state` nulo ou UF do programa; `registrationFrom/To`; `amount`/faixa; `audience`; `sourceUrl`; `documents[]` PDF/FAQ/retificações; `status=open/upcoming/closed`; `rawPayload`. `cultural_opportunities` só se a chamada for especificamente audiovisual/cultural. |

## Observações de compliance e operação

- User-Agent de pesquisa usado: `PardalDigital/pesquisa (+https://pardaldigital.com; contato@pardaldigital.com)`; não foram criadas contas, feitos logins ou resolvidos CAPTCHAs.
- Respeitar `robots.txt`, limites publicados e cache local; Querido Diário recomenda referência de 60 req/min, mas o coletor deve operar bem abaixo disso.
- Para fontes sem licença clara, armazenar apenas metadados mínimos e link oficial até obter autorização escrita; não republicar PDFs ou conteúdo integral.
- Deduplicar com PNCP por CNPJ/UASG/número/URL e marcar `source_overlap` para evitar alertas duplicados.
- Revisar termos e licença com jurídico antes de lançar qualquer fonte privada ou distribuir documentos.
