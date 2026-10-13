# Revisão aprovada — hub adaptativo de oportunidades

Data de atualização: 13 out. 2026
Status: **ajustes e decisões aprovados pelo dono em 12 e 13/10/2026**

Este documento complementa, sem alterar, o [plano técnico original](./hub-adaptativo-2026-10-12.md). Aprovação de arquitetura não autoriza iniciar a Fase 1, criar/aplicar migração ou ativar mudança visível.

## Princípios arquiteturais aprovados

- **O catálogo é universal.** Espaços são contextos de descoberta e acompanhamento, não bases separadas de oportunidades.
- A mesma oportunidade pode aparecer no espaço adequado e em “Explorar tudo”, respeitando filtros e vocabulário de cada experiência.
- Domínio da oportunidade, país de origem e fonte de coleta são dimensões distintas; nenhuma é inferida da outra.
- A personalização não pode fragmentar o Pardal Digital nem duplicar oportunidades por espaço.
- A nomenclatura única é `workspace_id` em todos os contratos e dados contextuais.

## 1. Migração para Espaços sem escrita dupla

### Decisão aprovada

Substituir os passos 5–7 da §4.2 por um backfill único, idempotente e auditável, seguido de adaptadores nas rotas v1:

1. criar as tabelas aditivas de Espaços;
2. congelar uma versão de corte do schema do perfil;
3. executar um backfill único por usuário, com checkpoint e relatório de divergências;
4. fazer as rotas v1 lerem e escreverem o serviço de domínio de Espaços por meio do espaço `procurement` padrão;
5. remover o caminho de escrita legado apenas depois da reconciliação e de uma janela de observação.

Justificativa: a base beta ainda é pequena e o custo operacional de duas fontes graváveis supera o risco mitigado pela escrita dupla. O backfill deve continuar reversível por backup e relatório de auditoria. Nenhuma migração está autorizada na Fase 0.

Escrita dupla não será reintroduzida como atalho de corte ou rollback. Se o delta ou a validação não couberem na janela aprovada, o corte será cancelado.

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

## Decisões de 13/10/2026

As decisões abaixo foram **aprovadas pelo dono em 13/10/2026** e fecham ou refinam pontos desta revisão:

1. **Downgrade:** espaços excedentes ficam somente leitura e nenhum dado é excluído. Entre os espaços não arquivados, o de menor slot permanece gravável. A UI deve informar claramente, antes da expiração, qual espaço continuará editável.
2. **Membros:** `workspace_members` entra na Fase 1 apenas com a associação `owner`. Convites, outros papéis, equipes, gerenciamento de membros e colaboração ficam na Fase 6. A primeira migração não inclui convites; `requireWorkspaceMember` continua sendo a regra de autorização, satisfeita na Fase 1 somente pelo `owner`.
3. **Corte:** aceita-se uma janela curta de manutenção, bloqueando somente as mutações afetadas; busca e detalhes públicos permanecem disponíveis. A duração máxima e o critério de aborto serão definidos pelo dono após ensaio com volume real. Se o delta ou a validação excederem a janela aprovada, o corte é cancelado; escrita dupla não será usada como atalho.
4. **Asaas:** checkout e webhooks serão validados ponta a ponta antes de ativar a Fase 1, pois o entitlement determina quais espaços são graváveis. Esta decisão não autoriza mudar os gates atuais.
5. **Janela de corte — parâmetros iniciais:** início às 03:30 de `America/Sao_Paulo`, teto de 15 minutos de mutações bloqueadas (meta de até 5), ponto de não retorno em T+10 min, drenagem de até 3 min e `lock_timeout` de 5 s, com cinco gatilhos de aborto imediato e tolerância zero nas invariantes. São valores iniciais: os finais valem `min(15 min, 2 × o pior ensaio)`. Detalhes na seção “Janela de corte” do [roadmap](./hub-adaptativo-roadmap-v2.md#janela-de-corte).
6. **Janela de corte — acréscimos:** a drenagem inclui, além da fila de IA, os agendadores que gravam continuamente nas tabelas do escopo (envio imediato de e-mail, avaliação de buscas salvas e os demais listados no roadmap). O ensaio usa cópia do backup de produção, contém dado pessoal e por isso roda no servidor, executado pelo dono; a cópia é descartada e o relatório sai sem dado pessoal.
7. **Espaço ativo inválido:** resolvedor determinístico único — não arquivados graváveis, depois o selecionado mais recentemente, depois o criado primeiro; `null` se não houver nenhum. Na leitura, resolve sem gravar.
8. **Estados de onboarding:** permanecem `not_started | in_progress | complete`; `complete` significa mínimo concluído (palavras-chave e região). Riqueza do perfil é dado derivado, não estado.
9. **Busca com `workspaceId`:** `401` sem sessão; `400` para id malformado; para id inexistente, de outro usuário ou sem acesso, `200` com resultado universal, sem personalização, sem cache e com corpo idêntico nos três casos.
10. **Edição simultânea do perfil:** controle otimista somente na rota nova, com contador `revision` separado de `profileVersion`; a rota v1 continua com última gravação vence.
11. **Histórico de perguntas de IA:** log pessoal da conta, sem `workspace_id`, com a retenção atual de 90 dias e fora do backfill.

Nenhuma dessas decisões autoriza a Fase 1, a criação de migrações ou qualquer mudança em produção.

## 5. Checkout Asaas antes de ativar a Fase 1

### Pré-requisito aprovado

Criar um gate de entrada para a Fase 1: checkout Asaas validado de ponta a ponta no sandbox e, depois, em produção com transação controlada. O roteiro deve cobrir criação/recuperação de cliente, geração do checkout, retorno à aplicação, webhook autenticado, idempotência, estados `pending`/`active`/`past_due`/`cancelled`, liberação e remoção do entitlement e reconciliação após webhook perdido.

Não usar a Fase 0 para disparar checkout real. A evidência mínima é um relatório com IDs redigidos, horários, estados observados e resultado dos gates; nunca registrar chave, token, nome, e-mail ou URL privada completa.

### Regra de contenção

Se a integração não puder ser validada de ponta a ponta, a Fase 1 não é ativada. A validação é evidência para o cálculo de entitlement, não autorização para alterar busca/detalhe públicos nem os gates atuais das ações premium.

## Limites desta aprovação

Não iniciar a Fase 1 sem nova autorização explícita. O dono revisará antes o contrato de Espaços, o backfill, a sequência de migrações, a estratégia de isolamento, o ensaio da janela de corte e a evidência do Asaas. Migrações de produção continuam manuais, uma a uma, sempre após backup verificado.
