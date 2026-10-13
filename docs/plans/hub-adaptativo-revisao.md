# Revisão aprovada — hub adaptativo de oportunidades

Data: 12 out. 2026
Status: **ajustes e decisões aprovados pelo dono em 12/10/2026**

Este documento complementa, sem alterar, o [plano técnico original](./hub-adaptativo-2026-10-12.md). Aprovação de arquitetura não autoriza iniciar a Fase 1, criar/aplicar migração ou ativar mudança visível.

## Princípios arquiteturais aprovados

- **O catálogo é universal.** Espaços são contextos de descoberta e acompanhamento, não bases separadas de oportunidades.
- A mesma oportunidade pode aparecer no espaço adequado e em “Explorar tudo”, respeitando filtros e vocabulário de cada experiência.
- Domínio da oportunidade, país de origem e fonte de coleta são dimensões distintas; nenhuma é inferida da outra.
- A personalização não pode fragmentar o Pardal Digital nem duplicar oportunidades por espaço.
- A nomenclatura única é `workspace_id`; não introduzir `space_id`.

## 1. Migração para Espaços sem escrita dupla

### Decisão aprovada

Substituir os passos 5–7 da §4.2 por um backfill único, idempotente e auditável, seguido de adaptadores nas rotas v1:

1. criar as tabelas aditivas de Espaços;
2. congelar uma versão de corte do schema do perfil;
3. executar um backfill único por usuário, com checkpoint e relatório de divergências;
4. fazer as rotas v1 lerem e escreverem o serviço de domínio de Espaços por meio do espaço `procurement` padrão;
5. remover o caminho de escrita legado apenas depois da reconciliação e de uma janela de observação.

Justificativa: a base beta ainda é pequena e o custo operacional de duas fontes graváveis supera o risco mitigado pela escrita dupla. O backfill deve continuar reversível por backup e relatório de auditoria. Nenhuma migração está autorizada na Fase 0.

### Alternativa descartada para esta migração

Manter escrita dupla temporária conforme o plano original quando a base, o volume de mutações ou a necessidade de rollback online crescerem antes da Fase 1. Exige idempotência, métrica de divergência e definição explícita da fonte vencedora.

## 2. Meta de latência da busca

### Baseline conhecido

A busca atual observada está em aproximadamente **0,4–0,9 s quente** e **3–10 s fria**. A meta única de p95 abaixo de 300 ms da §9 não é realista sem trabalho específico de índice, cache e plano de execução.

### Regra aprovada por etapa

| Etapa                     | Escopo               | Critério antes de definir meta                                      | Trabalho necessário                                                                                                        |
| ------------------------- | -------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Fase 0                    | busca v1 atual       | medir p50/p95/p99 quente e fria, por filtros                        | registrar `tookMs`, separar primeira consulta após inatividade e guardar plano de referência sem parâmetros privados       |
| Antes da Fase 2           | v1 otimizada         | aprovar volume e mistura de referência depois da análise de índices | revisar `EXPLAIN (ANALYZE, BUFFERS)`, seletividade e índices de status/prazo/localização/trigramas; aquecimento controlado |
| Fase 2                    | catálogo por domínio | medir cada domínio e “Explorar tudo” separadamente                  | índices parciais/compostos do catálogo, paginação estável, facetas pré-agregadas ou cacheadas                              |
| Após volume de referência | catálogo consolidado | fixar metas p50/p95/p99 somente a partir do benchmark reproduzível  | definir cache hit ratio, orçamento de facetas e capacidade do PostgreSQL                                                   |

### Alternativa

300 ms pode permanecer como objetivo exploratório de longo prazo, nunca critério inicial. Limites numéricos futuros exigem nova validação após análise de índices e definição de se a medição inclui rede e renderização.

## 3. Encaixe das oportunidades internacionais existentes

`cultural_opportunities.scope = 'international'` já contém `worldbank` e `eu_ft`, com `brazil_eligibility`, `brazil_funding`, motivos e regra auditável. “Internacional” é alcance, não domínio.

### Decisão aprovada

- Banco Mundial: domínio `procurement`; `country` vira `countries[]`; o aviso preserva `brazilEligibility` e regra na extensão de licitação.
- EU Funding & Tenders usa natureza e regra explícita para classificar `funding`, `research`, `procurement` ou `culture`; enquanto a fonte permanece em avaliação, a classificação deve ser auditada por amostra.
- `study` não recebe nenhum registro atual. Deve ficar oculto até uma fonte acadêmica oficial ser homologada.
- A elegibilidade e o financiamento do participante brasileiro continuam separados; `unknown` nunca vira aprovação.

Essa regra está codificada apenas como mapeador puro de contrato na Fase 0; não altera a tabela nem a UI.

### Alternativas registradas

1. Manter todo EU F&T em `funding` até haver classificador homologado. É simples, mas mistura subvenção, pesquisa, ação externa e chamadas em cascata.
2. Criar um domínio `international`. Foi rejeitado como recomendação porque confunde alcance com natureza e cria uma sexta jornada.
3. Exigir classificação editorial por chamada. Aumenta precisão, mas não escala e atrasa atualização.

## 4. Decisões da §13 aprovadas pelo dono em 12/10/2026

| Decisão       | Regra aprovada                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Organização   | Um espaço por objetivo; “Explorar tudo” é independente dos espaços personalizados                                           |
| Limite        | Conta gratuita: 1 espaço; teste ou assinatura ativa: até 5; expiração não exclui excedentes                                 |
| Perfil mínimo | Obrigatórios somente palavras-chave e região; demais respostas progressivas e opcionais                                     |
| Pesquisa      | Começa como especialização de Fomento, com filtros próprios; vira jornada independente conforme volume, qualidade e demanda |
| Estudo        | Oculto até existir ao menos uma fonte oficial homologada com coleta e atualização verificadas                               |
| Acesso        | Busca e detalhe públicos em todos os domínios; salvar, monitorar e alertar seguem gates de assinatura existentes            |

Permanece **a definir pelo produto** o acesso aos espaços excedentes depois que teste/assinatura expira. Invariante já aprovado: registros são preservados e nunca excluídos automaticamente. O contrato recomenda leitura/exportação dos cinco, um espaço selecionável para ações gratuitas e bloqueio de novas criações/mutações premium até reativação; essa recomendação ainda não está aprovada.

## 5. Checkout Asaas antes da Fase 3

### Pré-requisito aprovado

Criar um gate de entrada para a Fase 3: checkout Asaas validado de ponta a ponta no sandbox e, depois, em produção com transação controlada. O roteiro deve cobrir criação/recuperação de cliente, geração do checkout, retorno à aplicação, webhook autenticado, idempotência, estados `pending`/`active`/`past_due`/`cancelled`, liberação e remoção do entitlement e reconciliação após webhook perdido.

Não usar a Fase 0 para disparar checkout real. A evidência mínima é um relatório com IDs redigidos, horários, estados observados e resultado dos gates; nunca registrar chave, token, nome, e-mail ou URL privada completa.

### Regra de contenção

Se a integração de produção não puder ser exercitada antes, limitar a Fase 3 a mudanças internas que não alterem gates e adiar qualquer mudança de cobrança até a validação.

## Limites desta aprovação

Não iniciar a Fase 1 sem nova autorização explícita. O dono revisará antes o contrato de Espaços, o backfill, a sequência de migrações e a estratégia de isolamento. Migrações de produção continuam manuais, uma a uma, sempre após backup.
