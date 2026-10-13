# Homologação de fontes de oportunidades

Status: checklist verificável da Fase 0  
Plano de referência: [hub adaptativo](./plans/hub-adaptativo-2026-10-12.md)

Este documento registra apenas evidência encontrada no código e na documentação local. “A verificar” significa que a fonte não pode ser considerada aprovada naquele item, ainda que o coletor exista.

## Estados

- **Homologada**: os dez itens têm evidência suficiente e uma amostra manual assinada.
- **Condicional**: pode operar no escopo atual, mas possui item “a verificar”, limitação explícita ou fonte parcialmente indisponível.
- **Em avaliação**: não deve ser promovida a jornada/catálogo geral até fechar as pendências.
- **Suspensa**: acesso ou qualidade deixou de cumprir o mínimo; o último dado válido não é apagado, mas recebe estado operacional.

## Checklist e evidência aceita

| #   | Critério                              | Evidência verificável para aprovação                                                                                                              |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Acesso permitido                      | cópia/URL dos termos ou licença com data de consulta; resultado de `robots.txt` por host; método e User-Agent; parecer quando o texto for ambíguo |
| 2   | Fonte oficial                         | domínio e responsável público identificados; endpoint/página documentado; justificativa assinada se agregador for inevitável                      |
| 3   | Id e URL estáveis                     | amostra relida em dias diferentes com mesmo id/URL; regra de composição; unique index ou teste de colisão                                         |
| 4   | Paginação, atualização e encerramento | contrato do cursor/página e ordenação; agenda; janela; condição de fechamento; teste de listagem incompleta que não encerra registros             |
| 5   | Deduplicação                          | chave intra-fonte; regra/candidatos entre fontes; teste com duplicata conhecida e decisão de precedência                                          |
| 6   | Normalização                          | testes de datas/fuso, moeda, país/UF/município e valores ausentes; preservação do valor/texto original quando necessário                          |
| 7   | Atribuição/licença                    | campos exibidos, extensão máxima do trecho/documento, fonte e link oficial; licença permite o armazenamento adotado                               |
| 8   | Limite, retry e circuito              | atraso/teto de requests, timeouts, `Retry-After`, número de tentativas, comportamento 403/429/5xx e disjuntor/adiamento                           |
| 9   | Atualidade e cobertura                | métricas por execução (`read/created/updated/closed/rejected`), atraso desde a fonte, cobertura esperada e alerta de estagnação                   |
| 10  | Revisão manual                        | amostra com tamanho e método definidos, revisor/data, comparação campo a campo com a fonte, taxa de erro e decisão registrada                     |

Evidência deve ser repetível sem acessar produção. Fixtures sanitizadas e respostas fictícias podem provar parser; a amostra manual deve referenciar URLs oficiais sem copiar dados pessoais.

## Resumo das fontes existentes

| Fonte                | Estado nesta revisão | Principais pendências                                                                    |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| PNCP                 | Condicional          | licença/termos e relatório formal da amostra manual a verificar                          |
| Mapas Culturais      | Condicional          | licença por instalação, cobertura dinâmica e amostra assinada a verificar                |
| Transferegov         | Condicional          | deduplicação entre API/CSV e outras fontes; amostra assinada                             |
| MinC                 | Condicional          | licença/termos formalizados e métricas de cobertura por lista                            |
| Funarte              | Condicional          | mesmos pontos das páginas gov.br e redirecionamentos externos                            |
| CNPq                 | Condicional          | contrato/estabilidade do HTML, licença e encerramento por remoção                        |
| CAPES                | Condicional          | contrato/estabilidade do HTML, licença e encerramento por remoção                        |
| Salic                | Condicional          | é marcador de editais do MinC, não uma coleta autônoma da API Salic                      |
| Banco Mundial        | Condicional          | amostra manual assinada e deduplicação entre fontes internacionais                       |
| EU Funding & Tenders | **Em avaliação**     | validar DSL/datasource, licença de trechos, regras de elegibilidade, cobertura e amostra |

## Fichas

### PNCP

- Escopo: licitações em `tenders`; coletor `pncp-client.ts`, mapeamento `pncp-map.ts`, persistência `upsert-tenders.ts`.
- Oficialidade: API do Portal Nacional de Contratações Públicas; fonte oficial. **Evidência:** endpoints e campos estão implementados no cliente; documentação operacional em `docs/ingest-pncp-calendar.md`.
- Id/URL: `pncp_control_number` possui unique index; URL oficial é preservada. Testes cobrem mapeamento e reconsulta. **Atende.**
- Paginação/encerramento: calendário por modalidade/UF, dias selados e refresh separado; reconciliação de prazos existe. **Atende no código.**
- Deduplicação: número de controle PNCP. Deduplicação com fontes não PNCP: **a verificar**.
- Normalização: status, prazo, valor, órgão, localidade, itens e documentos testados. **Atende no escopo atual.**
- Licença/atribuição: fonte/URL são exibidas; licença/termos arquivados no repo: **a verificar**.
- Resiliência: retry, refresh, circuitos por etapa e auditoria aparecem nos coletores/configuração. **Atende no código.**
- Métricas: `ingest_runs`/`ingest_days` registram progresso; atraso e cobertura de campos como SLI formal: **parcial**.
- Revisão manual: há testes/fixtures; ficha assinada com amostra e taxa de erro: **a verificar**.

### Mapas Culturais

- Escopo: chamadas culturais em `cultural_opportunities`; `cultural-installations.ts`, `mapas-client.ts`, `opportunity-map.ts`.
- Oficialidade: instâncias públicas oficiais estaduais/municipais; a instância federal bloqueada por Cloudflare não é contornada. **Atende com lacunas documentadas** em `docs/contracts/opportunities-v1.md`.
- Id/URL: unique `(installation_id, external_id)` e URL da oportunidade. **Atende.**
- Paginação/encerramento: páginas limitadas, lookback, refresh por prazo e remoção somente após listagem completa. Testes cobrem 403/429/incompletude. **Atende.**
- Deduplicação: intra-instalação atende; chamadas repetidas em instalações distintas e com fontes federais: **a verificar**.
- Normalização: data de Mapas, UF/cidade, áreas, status e fluxo contínuo têm parsers/testes. Fuso por instalação: **parcial; verificar catálogo completo**.
- Licença/atribuição: fonte/URL são preservadas; licença de cada instalação e permissão para trechos: **a verificar**.
- Resiliência: atraso, retry, teto de páginas, erros estruturados e pin TLS restrito estão no código. **Atende.**
- Métricas: execução e problemas por instalação existem; cobertura por território aparece na API. Alerta de estagnação: **a verificar**.
- Revisão manual: revisão automática de owner existe; amostra humana assinada: **a verificar**.

### Transferegov

- Escopo: programas de fomento/parceria, por API JSON e CSV oficial; `transferegov-parsers.ts`, `federal-client.ts`.
- Acesso/oficialidade: APIs/dados abertos oficiais, sem login, documentados em `docs/contracts/opportunities-v1.md`. Termos/licença arquivados: **a verificar**.
- Id/URL: `programa-<COD_PROGRAMA>` ou `parcerias-<id_programa>`; portal oficial não oferece página pública individual. **Atende com limitação explícita.**
- Paginação/encerramento: API paginada e CSV em fluxo; somente programas disponibilizados e com janela pública. Remoção/fechamento após listagem completa está documentado. **Atende no código; confirmar SLA.**
- Deduplicação: unique por instalação/id; colisões entre API e CSV e com MinC/Funarte: **a verificar**.
- Normalização: datas, instrumento, valor, UF e audiência testados em `federal-sources.test.ts`. **Atende.**
- Atribuição/licença: número e dados abertos preservados; regra formal de reprodução: **a verificar**.
- Resiliência: limites e comportamento de erro seguem coletor federal; CSV grande é lido em fluxo. Circuito de falha explícito: **a verificar**.
- Métricas/revisão: contagem por fonte existe; atualidade, cobertura e amostra assinada: **a verificar**.

### MinC

- Escopo: lista “Editais abertos” e páginas oficiais; `federal-client.ts`, `govbr-parsers.ts`.
- Acesso: `robots.txt` consultado antes; GET público, sem login/cookies/JS, 1 s entre requests e tetos. **Atende no código.**
- Id/URL: SHA-256 truncado da URL canônica e link oficial. **Atende.**
- Paginação/encerramento: lista limitada; o que some só fecha após leitura completa; prazo fecha por data. **Atende.**
- Deduplicação: precedência evita parte das duplicatas MinC/Funarte; cobertura completa entre fontes: **a verificar**.
- Normalização: título, trecho ≤400, datas, anexos, programa e fluxo contínuo. **Atende com campo ausente mantido nulo.**
- Licença: documentação atual cita CC BY-ND 3.0 do gov.br e armazenamento literal curto; registrar URL/data da licença: **a verificar**.
- Resiliência: proibição vira `blocked_by_robots`; 403/5xx não repete no dia; limites por fonte. **Atende.**
- Métricas/revisão: resultado por fonte existe; cobertura e amostra humana assinada: **a verificar**.

### Funarte

- Escopo: página oficial “Editais abertos”, páginas de programa e chamadas; mesmo coletor federal.
- Acesso, paginação, encerramento, normalização e resiliência: mesmas regras gov.br do MinC. **Atende no código.**
- Id/URL: hash da URL canônica; redirecionamento externo é guardado e não requisitado. **Atende com limitação.**
- Deduplicação: precedência com MinC para a mesma URL; equivalência com título/edital diferente: **a verificar**.
- Licença/atribuição: mesma pendência documental do MinC.
- Atualidade/cobertura/revisão manual: **a verificar**.

### CNPq

- Escopo: chamadas de fomento/pesquisa; `funding-client.ts` e `funding-parsers.ts`.
- Oficialidade: página do CNPq; fonte oficial. Método e endpoint estão no cliente. Termos/robots/licença documentados: **a verificar**.
- Id/URL: parser produz id por fonte/chamada e URL oficial; estabilidade longitudinal: **a verificar**.
- Paginação/encerramento: leitura de listagem e datas existe; regra segura quando chamada some: **a verificar**.
- Deduplicação: unique por instalação/id; sobreposição com Transferegov/FINEP: **a verificar**.
- Normalização: parser testado com fixture para título, prazo e tipo; classificação final entre `funding` e `research` depende de decisão. **Parcial.**
- Resiliência: atraso entre páginas configurável; detalhes de retry/circuito para HTML: **a verificar**.
- Métricas: contagem por fonte no job; cobertura/atualidade: **a verificar**.
- Revisão manual: **a verificar**.

### CAPES

- Escopo e implementação: `funding-client.ts` e `funding-parsers.ts`; fonte oficial da CAPES.
- Evidência de parser: testes cobrem múltiplas chamadas fictícias/sanitizadas. **Atende para forma conhecida.**
- Id estável, URL, paginação, encerramento por remoção, licença/robots, deduplicação entre fontes, SLI de cobertura e revisão manual: **a verificar**.
- Datas/campos ausentes não devem ser inferidos. Registros classificados como `research` aparecem inicialmente como especialização/filtro dentro de Fomento; a jornada independente depende de volume, qualidade e demanda.

### Salic

- Escopo real: a API Salic possui projetos/propostas, não chamadas. O código não a coleta como feed de oportunidades.
- `source = salic` marca um edital da lista do MinC cuja inscrição ocorre no Salic, com `opportunityType = Lei Rouanet`.
- Acesso, paginação, encerramento e licença: herdados da página MinC para o edital; o sistema de inscrição é apenas destino. **Condicional.**
- Id/URL/deduplicação: id vem da URL canônica listada pelo MinC. Não atribuir à API Salic dados que ela não forneceu.
- Atualidade e revisão manual: mesmas pendências do MinC.

### Banco Mundial

- Escopo: avisos de aquisição internacionais; `worldbank-parsers.ts`, `international-client.ts`, `collect-international.ts`.
- Acesso/oficialidade/licença: API oficial Procurement Notice, dataset DS00979, CC BY 4.0 conforme `docs/contracts/opportunities-v1.md`. Registrar snapshot da licença/data: **a verificar**.
- Id/URL: id do aviso (ex. `OP…`) e URL oficial; unique por instalação/id. **Atende.**
- Paginação/encerramento: 100/página, janela de deadline, exclui adjudicações/avisos gerais; remoção só fecha após listagem completa. **Atende.**
- Deduplicação entre fontes: **a verificar**.
- Normalização: país, idioma, prazo com precisão/fuso, moeda e elegibilidade por regra são testados em `international-sources.test.ts`. **Atende com limites documentados para países multifuso.**
- Privacidade/atribuição: `raw_payload` usa lista fechada sem contato/e-mail/endereço; resumo por regras e URL oficial. **Atende.**
- Resiliência: robots, 1 s, 100/página, máximo, `Retry-After` em 429/503 uma vez, sem redirects. **Atende.**
- Métricas/revisão: relatório por fonte/elegibilidade existe; SLI e amostra assinada: **a verificar**.

### EU Funding & Tenders — em avaliação

- Escopo: tópicos de subvenção, ação externa e chamadas em cascata; `eu-ft-parsers.ts`.
- Oficialidade: Search/Facet API da Comissão Europeia. **Atende.** A chave `SEDIA` é pública conforme documentação local; confirmar termos de uso: **a verificar**.
- Id/URL: identificador do tópico, `cascade-<id>` ou `prospect-<id>` e URL oficial. Testes existem. **Atende para casos conhecidos.**
- Paginação/encerramento: DSL por `type`/`status`, 100/página, ignora outros datasources e datas antigas, fechamento seguro após leitura completa. Revalidar contra mudanças do índice: **a verificar continuamente**.
- Deduplicação: intra-fonte tratada; entre programas/fontes: **a verificar**.
- Normalização: horário de Bruxelas, prazos de corte, EUR/PTAX, país/área e elegibilidade/funding separados têm testes. A interpretação de chamadas em cascata e ação externa continua `unknown` quando a regra não prova. **Atende condicionalmente.**
- Atribuição/licença: resumo por regras reduz cópia; permissão para armazenar descrição/condições presentes no resultado da busca: **a verificar**.
- Resiliência: robots, atraso, teto, `Retry-After`, sem redirect e uma tentativa adicional. **Atende no código.**
- Métricas: relatório por fonte/status/elegibilidade existe; cobertura por programa e atraso: **a verificar**.
- Revisão manual: comparar amostra estratificada por tipo 1/2/8, programa, aberto/previsto e regra de elegibilidade; **pendente**. Até concluir, permanece “em avaliação”.

## Gate para nova fonte

Uma fonte só entra no catálogo público após: ficha sem item crítico “a verificar”; fixture de parser; teste de idempotência; amostra manual; owner definido; orçamento de requests; métrica de atualidade; procedimento de suspensão. A ativação deve ocorrer por flag/coorte e ter rollback que desliga novas leituras sem apagar o último registro válido.
