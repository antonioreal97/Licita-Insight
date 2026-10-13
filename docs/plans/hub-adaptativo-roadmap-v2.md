# Hub adaptativo — roadmap v2

Data de atualização: 13 out. 2026
Status: **roadmap vigente, consolidado com as decisões aprovadas pelo dono em 12 e 13/10/2026**. Ele ordena trabalho futuro; esta consolidação é somente documental, não inicia a Fase 1 e não autoriza tabelas, migrações, flags ou telas.

Referências: [plano original](./hub-adaptativo-2026-10-12.md), [revisão aprovada](./hub-adaptativo-revisao.md), [compatibilidade de `workspace_id`](./hub-adaptativo-compatibilidade.md) e contratos em `docs/contracts/`.

## Princípios e sequência crítica

O catálogo é universal; Espaços são contextos de descoberta e acompanhamento. Personalização não cria bases separadas. A primeira alteração estrutural de produção deve ser Espaços e compatibilidade dos recursos atuais, antes de qualquer redesenho do dashboard.

Sequência crítica:

`Fase 0: contratos` → `Fase 1: Espaços` → `Fase 2: catálogo e busca universal` → `Fase 3: salvos, alertas e dashboard` → `Fase 4: afinidade e elegibilidade` → `Fase 5: fontes de Pesquisa e Estudo` → `Fase 6: colaboração, convites e organizações`.

Pesquisa começa como especialização/filtro de Fomento. Estudo permanece oculto até haver pelo menos uma fonte oficial homologada e verificada. Banco Mundial entra em `procurement`; domínio, país e fonte continuam dimensões independentes. Busca e detalhe permanecem públicos, enquanto salvar, monitorar, criar buscas salvas e receber notificações preservam os gates atuais.

## Fase 0 — contratos e baseline (concluída)

**Escopo:** schemas versionados dos cinco perfis; sinais e completude; registro de experiências; catálogo tipado e mapeadores; contrato de Espaços; homologação de fontes; flags desligadas por padrão; instrumentação mínima e baseline; revisão de compatibilidade; este roadmap.

**Dependências:** plano do dono, schemas e serviços atuais, inventário de coletores e decisões aprovadas.

**Critérios de aceite:**

- nenhum schema de banco, rota v1 ou comportamento visual muda;
- `FEATURE_JOURNEYS` vazio preserva o produto atual;
- contratos e mapeadores têm testes unitários;
- baseline separa consultas agregadas de eventos GA4 com consentimento;
- decisões restantes aparecem explicitamente como pendências.

**Esforço indicativo:** 1–2 semanas de engenharia/revisão, já concentradas na Fase 0.

**Gate:** concluída sem autorização implícita para a Fase 1. Contratos, sequência de migração e plano operacional ainda exigem aprovação específica do dono.

## Fase 1 — fundação de Espaços e migração compatível

**Objetivo:** introduzir Espaços na persistência e nas APIs sem redesenhar o produto, executar um backfill único e manter rotas v1 por adaptadores.

**Dependências:** Fase 0 aprovada; contrato de Espaços aprovado; inventário e checksums; backup restaurado em ambiente isolado; aplicação compatível com colunas nulas e adaptadores pronta; corte ensaiado com volume real; checkout e webhooks do Asaas validados de ponta a ponta, porque o entitlement determina quais Espaços são graváveis.

**Escopo:**

- criar `workspaces`, `workspace_members` somente com associação `owner`, perfis versionados, sinais e preferência ativa; convites ficam exclusivamente na Fase 6;
- atribuir recursos pessoais existentes ao Espaço padrão `procurement`;
- aplicar limites 1/5 e downgrade sem exclusão: o Espaço não arquivado de menor slot permanece gravável e os excedentes ficam somente leitura;
- informar claramente na UI, antes da expiração, qual Espaço continuará editável;
- adaptar rotas `/me`, jobs, caches, e-mails, exportação e exclusão;
- manter assinatura/sessão na conta, catálogo atual global e `requireWorkspaceMember` como regra de autorização, nesta fase satisfeita apenas pelo `owner`;
- criar gestão e onboarding mínimo de Espaços somente depois da integridade estrutural, sem redesenhar o dashboard.

**Critérios de aceite:**

- um Espaço padrão e membership `owner` para cada usuário preexistente;
- contagens e checksums antes/depois conciliados, sem órfãos, duplicatas, vínculo incorreto ou `workspace_id` nulo no corte;
- gravações concorrentes capturadas pelo delta da janela de corte;
- isolamento negativo coberto em API, jobs, cache e links;
- rotas v1 mantêm payload, gates e comportamento no Espaço padrão;
- conta grátis limitada a um Espaço e trial/assinatura a cinco; expiração não apaga dados e torna excedentes somente leitura;
- rollback de aplicação e de dados ensaiados separadamente;
- duração máxima e critério de aborto da janela definidos e aprovados após ensaio com volume real.

**Esforço indicativo:** 2–3 sprints, incluindo ensaio de backfill e rollout.

**Gate:** aprovação explícita do SQL, backfill, relatório do dry run, backup/restore, duração máxima e critério de aborto da janela, evidências de isolamento, checklist LGPD e validação ponta a ponta do Asaas. Esta aprovação ainda não existe.

## Fase 2 — catálogo e busca universal

**Objetivo:** unificar leitura de `tenders` e `cultural_opportunities` sob `OpportunitySummary`, preservando tabelas/fontes de origem e proveniência.

**Dependências:** Fase 1 estável; fontes com homologação suficiente; classificação de domínio/país/fonte fechada; estratégia de projeção e fingerprint validada; baseline quente/frio e índices revisados.

**Escopo:**

- materializar/projetar catálogo comum sem duplicar a origem;
- incluir extensões por domínio, elegibilidade internacional e países;
- manter “Explorar tudo” fora dos Espaços e permitir o mesmo item no universal e no contexto personalizado;
- iniciar Pesquisa dentro de Fomento e manter Estudo oculto;
- criar índices de busca necessários antes de prometer metas agressivas.

**Critérios de aceite:**

- mapeamento e round-trip de proveniência auditáveis;
- fingerprint estável e colisões monitoradas;
- busca universal e por domínio têm paridade funcional e paginação determinística;
- falha de projeção não apaga registro válido;
- metas p50/p95/p99 são definidas a partir dos baselines quente e frio, sem adotar 300 ms como meta inicial;
- nenhuma oportunidade internacional perde país, regra ou evidência de elegibilidade.

**Esforço indicativo:** 2–3 sprints.

**Gate:** dono aprova qualidade das fontes, amostra de mapeamento, deduplicação e metas de latência por etapa; ativação ocorre por domínio e coorte, com flags desligadas por padrão.

## Fase 3 — salvos, alertas e dashboard adaptativos

**Objetivo:** generalizar os artefatos pessoais e habilitar progressivamente as jornadas aprovadas por Espaço, sem mudar os gates de assinatura.

**Dependências:** catálogo e ids globais estáveis; Fase 1 sem incidentes de isolamento; contratos dos widgets e artefatos fechados; telemetria de funil; textos e UX aprovados; flags com rollback operacional.

**Escopo:**

- generalizar salvos, buscas e notificações para `opportunity_id + workspace_id`;
- preservar participação, protocolo, etapa, checklist e histórico de licitações;
- introduzir widgets, navegação, e-mails e jobs multiespaço;
- ligar experiências uma a uma por `FEATURE_JOURNEYS` e exposição controlada;
- preservar busca/detalhe públicos e mutações premium;
- manter Pesquisa como especialização de Fomento e Estudo oculto até sua fase própria.

**Critérios de aceite:**

- salvos, histórico, checklist, alertas e notificações pertencem ao Espaço correto;
- nenhum vazamento visual após troca de Espaço;
- digest pode reunir Espaços sem perder contexto;
- eventos de funil respeitam consentimento e não carregam termos ou dados pessoais;
- experiência desligada mantém a UI anterior;
- comparação de contagens e execução sombra dos jobs são aprovadas antes de ativar escrita.

**Esforço indicativo:** 2–3 sprints.

**Gate:** aprovação do dono por jornada, com contrato do artefato, acessibilidade, analytics, fonte aplicável e rollback da flag. A validação do Asaas permanece requisito antes de qualquer alteração futura nos gates de assinatura, sem autorizar mudança nos gates atuais.

## Fase 4 — afinidade e elegibilidade explícitas

**Objetivo:** separar, explicar e auditar o quanto uma oportunidade combina com o perfil e se os requisitos obrigatórios conhecidos são atendidos.

**Dependências:** catálogo normalizado da Fase 2; perfis versionados; qualidade mínima de dados por domínio; artefatos da Fase 3 quando usados como sinal.

**Escopo:** motor determinístico de afinidade; rulesets de elegibilidade com estados positivo, negativo e indeterminado; evidências, referências e datas; reaproveitamento controlado das regras internacionais; interface que separa os dois conceitos. Recomendações personalizadas universais dependentes desses sinais só são ativadas depois desta fase.

**Critérios de aceite:** suítes independentes para afinidade e elegibilidade; nenhum `eligible` com critério obrigatório desconhecido; justificativas auditáveis; nenhum percentual apresentado como garantia; benchmarks de precisão, custo e taxa de `unknown` aprovados antes de usar IA.

**Esforço indicativo:** 2–3 sprints.

**Gate:** limiares aprovados por domínio e ativação separada por flag, sem relaxar a exigência de evidência nem confundir afinidade com elegibilidade.

## Fase 5 — novas fontes de Pesquisa e Estudo

**Objetivo:** expandir Pesquisa e, somente com fonte oficial real, liberar Estudo.

**Dependências:** homologação jurídica e técnica da fonte; cobertura, deduplicação e SLA medidos; contratos de extensão do catálogo.

**Escopo:** Pesquisa permanece dentro de Fomento; fontes acadêmicas e de pesquisa entram incrementalmente; Estudo só fica visível após uma fonte oficial atualizada e auditável.

**Critérios de aceite:** fonte oficial identificável; atualização monitorada; amostra revisada; proveniência, encerramento e deduplicação corretos; flag permite rollback imediato sem apagar dados.

**Esforço indicativo:** 1–2 sprints por fonte homologada.

**Gate:** aprovação por fonte e por jornada; ausência de fonte homologada mantém Estudo oculto.

## Fase 6 — colaboração, convites e organizações

**Objetivo:** adicionar colaboração somente depois de comprovar o isolamento owner-only da Fase 1.

**Dependências:** isolamento do proprietário comprovado; modelo de autorização e regra comercial aprovados; LGPD revisada para Espaços compartilhados.

**Escopo:** convites, papéis além de `owner`, equipes, gerenciamento de membros, auditoria, transferência de propriedade, preferências individuais, organizações e eventual cobrança por assento. `workspace_members` já existe desde a Fase 1 com vínculos `owner`; nesta fase seu modelo é ampliado. `workspace_invites` nasce somente aqui.

**Critérios de aceite:** matriz de permissões completa; revogação imediata; convites idempotentes e expiráveis; transferência auditável; exportação e exclusão respeitam propriedade compartilhada.

**Esforço indicativo:** 3–4 sprints; prioridade P2.

**Gate:** decisão comercial separada, contrato de colaboração aprovado e política LGPD para transferência/exclusão definida. Nenhuma rota ou tabela de convite entra na primeira migração.

## Sequência lógica futura de migrações

Esta é uma ordem lógica, não nomes ou números de arquivos autorizados. Produção continua operada manualmente pelo dono, uma migração por vez, sempre após backup verificado. Antes de W1, o preflight não executa DDL: conta usuários e recursos, identifica órfãos/duplicidades, estima locks e registra contagens, checksums e marcos por tabela.

| Ordem | Artefato lógico           | Conteúdo e disciplina operacional                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1    | fundação de Espaços       | criar `workspaces`, `workspace_members` apenas com associação `owner`, perfis, sinais e preferência ativa; não criar convites; garantir idempotência do Espaço padrão e da membership; incluir constraints e índices de propriedade, `limit_slot` e preferência ativa compatíveis com carga                       |
| W2    | expansão de escopo        | adicionar colunas `workspace_id` anuláveis às tabelas pessoais da matriz; criar FKs como `NOT VALID` quando apropriado e índices concorrentes fora de transações quando o PostgreSQL exigir; a aplicação compatível tolera nulos até o corte                                                                      |
| W3    | backfill único            | executar procedimento idempotente e auditável: lote do Espaço `procurement`, perfil e artefatos; manter checkpoints e relatório por linha/conjunto; durante o corte curto, drenar jobs, bloquear somente mutações afetadas, aplicar o delta desde os marcos e reconciliar invariantes; nunca manter escrita dupla |
| W4    | enforcement               | validar FKs e contagens, eliminar nulos e só então aplicar `NOT NULL` e novas unicidades por Espaço; remover apenas constraints incompatíveis; manter estruturas legadas até uma release posterior comprovar ausência de leitores, writers e retries antigos                                                      |
| C1    | catálogo                  | criar a projeção universal e índices; backfill de `tenders` e `cultural_opportunities`; validar fingerprints e proveniência antes do cutover de leitura                                                                                                                                                           |
| A1    | artefatos                 | criar modelos universais de salvos, buscas, alertas e dashboard da Fase 3; copiar estados com verificação e trocar leituras antes de qualquer remoção futura                                                                                                                                                      |
| E1    | afinidade e elegibilidade | criar caches, rulesets, resultados e evidências separados da Fase 4                                                                                                                                                                                                                                               |
| T1    | colaboração               | ampliar memberships para demais papéis e criar convites, equipes e organizações apenas na Fase 6                                                                                                                                                                                                                  |

Nunca combinar criação, backfill massivo, constraint e remoção em uma única migração. Qualquer falha interrompe a sequência. Nenhuma remoção de coluna/tabela ocorre até uma release posterior comprovar que não há leitores, jobs ou retries antigos.

## Janela de corte

O corte de W3 aceita uma janela curta de manutenção. Somente as mutações que escrevem nas tabelas afetadas são bloqueadas; busca e detalhes públicos continuam disponíveis, assim como coleta global que não escreva nessas tabelas.

Durante a janela, os jobs afetados são drenados ou pausados, as tabelas de origem são bloqueadas no menor escopo possível, o delta posterior aos marcos é aplicado e integridade e isolamento são validados antes da troca. A duração máxima e o critério objetivo de aborto permanecem pendentes de definição pelo dono **após ensaio com volume real**; não há número presumido neste roadmap.

Se o delta ou a validação excederem a janela aprovada, o corte é cancelado. A aplicação permanece ou retorna ao estado anterior conforme o runbook, e a escrita dupla nunca é introduzida como atalho.

## Operação, backup, validação e rollback

Antes de cada passo em produção:

- o dono confirma a janela e executa backup; verificar conclusão e capacidade de restore em ambiente isolado, não apenas existência do arquivo;
- registrar versão da aplicação, contagens, checksums, tamanho das tabelas, marcos de delta, duração esperada e queries de cancelamento;
- pausar somente jobs e mutações que escrevem nas tabelas afetadas, preservando busca/detalhes públicos e coleta global quando segura;
- executar uma migração por vez, medir lock/duração, rodar validações e obter aprovação antes da próxima.

Três condições são independentes e todas precisam de evidência:

| Condição        | Evidência obrigatória                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| Integridade     | contagens e checksums conciliados; nenhum registro perdido, órfão ou no Espaço errado |
| Isolamento      | testes provam que um usuário não descobre, consulta ou modifica dados de outro Espaço |
| Reversibilidade | backup restaurado e procedimento ensaiado para voltar à versão anterior               |

Rollback de código não reverte banco. O runbook deve distinguir:

- **rollback de aplicação:** voltar o tráfego para a versão anterior enquanto estruturas legadas continuam intactas e, quando substituídas, somente leitura; só é válido se a versão anterior não tentar gravar nelas durante o retorno;
- **rollback de dados:** restaurar o backup ou executar procedimento de reversão validado, reconciliando também as gravações posteriores ao snapshot; nunca presumir que um `down.sql` recupera dados removidos ou transformados.

Rollback por categoria:

- DDL aditivo: desligar adaptadores/flags e voltar a aplicação; estruturas novas podem permanecer vazias até remoção planejada;
- backfill: usar o relatório e as chaves determinísticas para remover apenas os dados identificados ou restaurar o backup, conforme runbook aprovado;
- índices/constraints: cancelar operação longa e remover somente o índice novo inválido pelo nome exato; não relaxar constraint após o corte sem voltar primeiro a aplicação;
- corte: voltar a aplicação enquanto o legado compatível permanece; escrita dupla não é mecanismo de rollback;
- falha de integridade ou isolamento: cancelar o corte, preservar ambos os conjuntos e evidências, restaurar quando necessário e não seguir para a próxima fase.

## Riscos para usuários existentes

| Risco                                           | Mitigação/validação                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| perfil atual perde nuance                       | conversão campo a campo, amostra antes/depois e `schemaVersion` preservado                             |
| salvos, checklists ou histórico somem           | contagens e hashes de payload; sem recomputação                                                        |
| gravação durante o lote fica sem vínculo        | marco por tabela, janela curta e passagem delta sob bloqueio antes da troca                            |
| alerta, notificação ou job usa Espaço errado    | `workspace_id` persistido, reautorização na execução e dedupe por Espaço                               |
| link antigo de e-mail deixa de abrir            | adaptador v1 resolve Espaço padrão; teste de URLs emitidas antes do corte                              |
| cache mostra dados de outro Espaço              | chave inclui `workspaceId`, invalidação na troca e teste negativo                                      |
| assinatura expira durante migração              | dados nunca apagados; entitlement consultado na ação; menor slot gravável e excedentes somente leitura |
| UI surpreende o usuário no downgrade            | avisar antes da expiração qual Espaço continuará editável                                              |
| conta recebe mais de um Espaço por retry        | idempotência e unicidade de Espaço padrão e membership `owner`                                         |
| job antigo persiste sem Espaço                  | drenar/pausar workers, payload versionado e rejeição segura                                            |
| rollback de código encontra schema incompatível | expandir antes de contrair, manter legado e ensaiar rollback de aplicação e dados separadamente        |
| aumento de latência                             | índices antes do corte e SLO quente/frio medido por etapa                                              |
| exclusão/exportação incompleta                  | testes LGPD abrangendo todos os Espaços antes de liberar criação múltipla                              |
| gates pagos mudam acidentalmente                | preservar gates atuais e validar Asaas ponta a ponta antes de ativar a Fase 1                          |

## Gates de aprovação

1. **Contrato:** dono aprova a Fase 0 consolidada, o contrato owner-only e as pendências registradas.
2. **Asaas:** checkout, retorno, webhooks autenticados/idempotentes, estados de assinatura e reconciliação são validados ponta a ponta antes de ativar a Fase 1; isso não autoriza mudar gates atuais.
3. **Migração:** revisão de SQL, estimativa de lock, backup/restore e dry run com volume real.
4. **Corte:** dono define, após o ensaio, a duração máxima e o critério de aborto; aprova bloqueio limitado às mutações afetadas e cancelamento quando delta ou validação não couberem.
5. **Integridade, isolamento e reversibilidade:** as três evidências ficam verdes antes de `NOT NULL`, cutover ou liberação de mutações.
6. **Catálogo:** proveniência, fingerprint, fontes e metas de busca aprovadas.
7. **Artefatos/jornadas:** contratos, UX, acessibilidade, analytics, jobs e rollback de flag aprovados individualmente.
8. **Afinidade/elegibilidade:** rulesets, evidências, limiares e taxa de `unknown` aprovados por domínio.
9. **Fontes:** Pesquisa/Estudo avançam somente após homologação por fonte; Estudo permanece oculto sem fonte oficial.
10. **Colaboração:** convites, papéis, equipes e organizações exigem contrato, política LGPD e decisão comercial próprios da Fase 6.

Nenhuma fase começa automaticamente pela aprovação deste roadmap. Em especial, esta consolidação não inicia a Fase 1.
