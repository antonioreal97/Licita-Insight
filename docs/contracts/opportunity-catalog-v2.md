# Catálogo de oportunidades v2 — rascunho

Status: contrato da Fase 0; sem tabela, backfill ou rota v2
Plano de referência: [hub adaptativo](../plans/hub-adaptativo-2026-10-12.md)

O schema e os mapeadores puros ficam em `@workspace/api-zod/hub/opportunity-catalog`. O OpenAPI e seus arquivos gerados não foram alterados.

O catálogo é universal. Espaços são contextos de descoberta e acompanhamento, não partições do catálogo. Uma mesma oportunidade pode aparecer em um espaço e em “Explorar tudo” sem duplicação. `domain`, `countries` e `provenance.source` representam, respectivamente, natureza, país de execução/origem e fonte de coleta; são campos independentes e nenhum é inferido do outro.

## Resumo comum

`OpportunitySummary` é uma união discriminada por `domain` e tem `schemaVersion = 2`.

| Campo                                | Semântica                                                             |
| ------------------------------------ | --------------------------------------------------------------------- |
| `id`                                 | id global opaco e estável, alocado pela projeção                      |
| `domain`                             | `procurement`, `funding`, `study`, `research` ou `culture`            |
| `title`, `summary`, `issuerName`     | texto de exibição e emissor                                           |
| `status`                             | `open`, `upcoming`, `closed` ou `undated`                             |
| `publishedAt`, `applicationDeadline` | instantes ISO 8601 com offset ou `null`                               |
| `amountMin`, `amountMax`, `currency` | faixa na moeda original; moeda ISO 4217 ou `null`                     |
| `countries`, `states`                | ISO alfa-2 e UF; listas vazias significam localização não determinada |
| `areas`, `audience`                  | vocabulários normalizados para filtros                                |
| `sourceUrl`, `scope`                 | URL oficial e abrangência nacional/internacional                      |
| `fingerprint`                        | versão do conteúdo normalizado que invalida derivados                 |
| `updatedAt`                          | última atualização da entidade fonte no Pardal                        |
| `provenance`                         | tabela/id internos, fonte, id externo, URL canônica e `readAt`        |
| `extension`                          | bloco tipado conforme o domínio                                       |

O `fingerprint` deve ser SHA-256 de uma serialização canônica dos campos que afetam exibição, filtro, afinidade ou elegibilidade, excluindo `id`, `updatedAt` e o próprio fingerprint. Os mapeadores recebem `catalogId` e `fingerprint`; a futura projeção é responsável por alocá-los.

## Extensões

- `procurement`: status original, modalidade, números, unidade compradora, plataforma, semântica/flag do valor e, para internacional, elegibilidade auditável.
- `funding`: natureza, programa, tipo, origem, início das inscrições, fluxo contínuo, conversão aproximada em BRL e elegibilidade.
- `study`: nível acadêmico, áreas, cobertura da bolsa, idiomas, instituições anfitriãs e elegibilidade. Nenhuma fonte atual alimenta esta extensão.
- `research`: natureza, programa, tipo, áreas, estágio de carreira, datas, fluxo contínuo, BRL aproximado e elegibilidade.
- `culture`: natureza, programa, tipo, origem, termos culturais originais e datas de inscrição.

Elegibilidade preserva `brazilEligibility`, motivo, regra, `brazilFunding`, motivo e data da avaliação. Ausência ou dado desconhecido nunca é convertido em “sim”.

## `tenders` → catálogo

Implementação de referência: `mapTenderToOpportunitySummary`.

| Origem `tenders`                         | Destino                     | Regra                                                                                                         |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                                     | `provenance.sourceEntityId` | literal; `sourceEntity = tenders`                                                                             |
| `pncp_control_number`                    | `provenance.externalId`     | id externo estável                                                                                            |
| —                                        | `id`                        | fornecido pela projeção; o cliente não interpreta sua composição                                              |
| `display_title`, `title`                 | `title`                     | usa `display_title` quando presente                                                                           |
| `object_summary`, `description`          | `summary`                   | primeiro valor não nulo                                                                                       |
| `organization_name`                      | `issuerName`                | cópia                                                                                                         |
| `status`                                 | `status`                    | `open` → `open`; demais estados atuais → `closed`; status futuro sem prazo pode virar `undated`               |
| `published_at`                           | `publishedAt`               | ISO 8601                                                                                                      |
| `proposal_deadline`                      | `applicationDeadline`       | ISO 8601                                                                                                      |
| `estimated_value`                        | `amountMin`, `amountMax`    | mesmo valor nos dois limites; valor oficial é preservado                                                      |
| valor presente                           | `currency`                  | `BRL`                                                                                                         |
| `estimated_value_status/flag`            | `extension.*`               | preserva confidencial/não publicado e alertas; consulta de soma/ranking deverá excluir flag conforme regra v1 |
| —                                        | `countries`                 | `['BR']`                                                                                                      |
| `state`                                  | `states`                    | zero ou uma UF                                                                                                |
| `categories[].slug`                      | `areas`                     | slugs normalizados                                                                                            |
| —                                        | `audience`                  | vazio; restrição de porte ainda não é coluna confiável do edital                                              |
| `source_url`                             | `sourceUrl`, URL canônica   | cópia                                                                                                         |
| `source_id`                              | `provenance.source`         | `source_name` fica sem equivalente comum; pode aparecer no detalhe especializado                              |
| `fetched_at`                             | `provenance.readAt`         | última leitura da origem                                                                                      |
| `updated_at`                             | `updatedAt`                 | cópia                                                                                                         |
| modalidade, números, unidade, plataforma | `extension`                 | cópia campo a campo                                                                                           |

Sem equivalente no resumo: `organization_id`, cidade/código IBGE, `opening_at`, itens, documentos, timeline, campos normalizados de busca, vetores, `raw_payload`, confiança/fonte de categoria, campos de geração de título, `created_at` e `details_fetched_at`. Eles permanecem no detalhe especializado ou na fonte, não em `attributes` genérico.

## `cultural_opportunities` → catálogo

Implementação de referência: `mapCulturalOpportunityToOpportunitySummary`.

| Origem                                       | Destino                          | Regra                                                                                    |
| -------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `id`                                         | `provenance.sourceEntityId`      | `sourceEntity = cultural_opportunities`                                                  |
| `external_id`                                | `provenance.externalId`          | id estável dentro da instalação/fonte                                                    |
| `source`                                     | `provenance.source`              | `mapas`, `transferegov`, `worldbank`, `eu_ft` etc.                                       |
| `title`, `summary`, `organization_name`      | `title`, `summary`, `issuerName` | cópia                                                                                    |
| `status`, `registration_to`                  | `status`                         | `upcoming`/`closed` preservados; `open` sem prazo → `undated`; `open` com prazo → `open` |
| —                                            | `publishedAt`                    | `null`; `registration_from` não é publicação                                             |
| `registration_to`                            | `applicationDeadline`            | ISO 8601                                                                                 |
| `amount` nacional                            | `amountMin/Max`, `currency`      | valor igual nos dois limites e `BRL`                                                     |
| `amount_original`, `currency` internacional  | `amountMin/Max`, `currency`      | preserva moeda original                                                                  |
| `amount_brl_approx`                          | `extension.amountBrlApprox`      | aproximação, nunca substitui valor original                                              |
| `country`                                    | `countries`                      | país ISO; nacional sem país explícito → `BR`                                             |
| `state`                                      | `states`                         | zero ou uma UF                                                                           |
| `areas`                                      | `areas`                          | cópia dos slugs                                                                          |
| `audience`                                   | `audience`                       | zero ou um texto; futura normalização pode separar valores                               |
| `source_url`                                 | `sourceUrl`, URL canônica        | cópia                                                                                    |
| `scope`                                      | `scope`                          | preserva nacional/internacional                                                          |
| `fetched_at`, `updated_at`                   | `readAt`, `updatedAt`            | cópia                                                                                    |
| `kind`, programa, tipo, origem, datas, fluxo | extensão do domínio              | cópia tipada                                                                             |
| elegibilidade e regra                        | extensão aplicável               | cópia sem inferência                                                                     |

Sem equivalente no resumo: `installation_id` (permanece na fonte/id externo), cidade, documentos, termos de área fora de cultura, agência, nome do país/região, idioma, títulos original/traduzido, origem da tradução, taxa/data PTAX, precisão/fuso/texto original do prazo, `search_text`, `raw_payload` e `created_at`. O detalhe especializado v2 deverá expor os campos relevantes sem colocá-los em um mapa livre.

## Classificação de domínio dos registros atuais

| Condição                                     | Domínio aprovado |
| -------------------------------------------- | ---------------- |
| `kind = procurement` ou `source = worldbank` | `procurement`    |
| `kind = culture`                             | `culture`        |
| `kind = funding`                             | `funding`        |
| `kind = innovation` ou `partnership`         | `research`       |

Isso também distribui EU F&T por natureza; a fonte permanece “em avaliação” e requer amostra auditada. Banco Mundial em `procurement` foi aprovado independentemente de hoje estar gravado em `cultural_opportunities`. O mapeamento não produz `study` com dados atuais.

## Invariantes para a futura projeção

1. unicidade por `sourceEntity + sourceEntityId` e também por origem/id externo quando a origem garante unicidade;
2. reprocessamento idempotente;
3. falha não apaga a última projeção válida;
4. mudança de fingerprint invalida afinidade/elegibilidade derivadas;
5. detalhe resolve pela proveniência e aplica a autorização do recurso, nunca por tabela escolhida pelo cliente;
6. fonte, URL oficial e data de leitura ficam visíveis;
7. nenhum `raw_payload` integra a resposta pública;
8. exemplos e testes usam somente registros fictícios.
