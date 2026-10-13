# Hub adaptativo — revisão de compatibilidade de `workspace_id`

Data de atualização: 13 out. 2026
Status: revisão de impacto consolidada para uma futura Fase 1. Este documento não autoriza nem contém migração, backfill ou mudança de rota.

Referências: [plano técnico](./hub-adaptativo-2026-10-12.md), [decisões aprovadas](./hub-adaptativo-revisao.md), [contrato de Espaços](../contracts/workspaces-v1.md) e schemas atuais em `lib/db/src/schema/`.

## Premissas aprovadas

- O nome canônico é `workspace_id`.
- Haverá um Espaço por objetivo; “Explorar tudo” continua universal e fora dos Espaços.
- Catálogo é único. Um item pode aparecer no catálogo universal e no Espaço de Compras sem duplicação da oportunidade.
- A migração inicial será um backfill único, seguido por adaptadores nas rotas v1; não haverá escrita dupla.
- Conta gratuita terá um Espaço; teste ou assinatura, até cinco. Na expiração, nenhum dado é apagado: o Espaço não arquivado de menor slot permanece gravável e os excedentes ficam somente leitura, ainda listáveis, selecionáveis, consultáveis e exportáveis.
- `workspace_members` entra na Fase 1 somente com a associação `owner`. Convites, demais papéis, equipes, gerenciamento de membros e colaboração ficam na Fase 6.
- Assinatura, sessão e identidade continuam na conta. Salvos, buscas salvas, monitoramento, alertas e personalização passam a ter contexto de Espaço.

## Regra de autorização

Toda operação autenticada com recurso de Espaço deve executar `requireWorkspaceMember(userId, workspaceId)` antes de consultar, alterar ou revelar se o recurso existe. Na Fase 1, essa regra é satisfeita somente por uma associação `owner`; o nome é preservado para a ampliação de papéis na Fase 6. O filtro de persistência deve conter simultaneamente o identificador do recurso e `workspace_id`; verificar a associação e depois consultar apenas pelo `id` mantém risco de IDOR e não é suficiente.

Ordem recomendada para mutações pagas:

1. validar sessão pelo cookie HttpOnly `licita_session`;
2. resolver o Espaço explícito ou, apenas no adaptador v1, o Espaço padrão;
3. exigir associação ao Espaço;
4. calcular `accessMode` pelo entitlement e slot; rejeitar mutações em Espaço somente leitura;
5. exigir assinatura para salvar, monitorar ou alertar;
6. executar a consulta sempre limitada por `workspace_id`.

Erros devem ser indistinguíveis entre Espaço inexistente e Espaço de terceiro (`404 WORKSPACE_NOT_FOUND`). Criação acima do limite usa HTTP `402` com `WORKSPACE_LIMIT_REACHED`; mutação em excedente usa HTTP `402` com `WORKSPACE_READ_ONLY`; o gate de assinatura existente continua `402 SUBSCRIPTION_REQUIRED` para ações premium.

## Inventário de persistência

### Identidade, sessão e cobrança — permanecem na conta

| Estrutura atual                                       | Estado atual                                                             | Mudança futura                                                                                                                                 | Risco                                                        | Teste obrigatório                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `users`                                               | identidade, preferências de e-mail, teste e preferências de recomendação | manter identidade, consentimento e trial na conta; mover somente seleção ativa e preferências específicas de jornada para estruturas de Espaço | duplicar consentimento ou mudar entitlement por Espaço       | alternar Espaço não altera sessão, trial, opt-out nem cobrança               |
| `google_trial_tombstones`                             | impede novo trial por identidade Google                                  | nenhuma                                                                                                                                        | conceder trial adicional ao criar Espaço                     | criação/remoção de Espaço não afeta tombstone                                |
| `beta_access_grants`                                  | grant por e-mail                                                         | nenhuma                                                                                                                                        | grant aplicado só ao Espaço ativo                            | grant vale para a conta e respeita o limite de Espaços definido pelo produto |
| `sessions`                                            | sessão por `user_id`                                                     | nenhuma; o Espaço ativo não deve ir no token nem em `localStorage`                                                                             | sessão presa a Espaço removido; vazamento por estado cliente | trocar/remover Espaço mantém cookie e obriga nova resolução server-side      |
| `subscriptions`, `coupon_codes`, `coupon_redemptions` | entitlement por conta                                                    | nenhuma coluna `workspace_id`; cálculo de limite de Espaços consulta entitlement da conta                                                      | cobrança duplicada ou gate divergente entre Espaços          | uma assinatura habilita até cinco Espaços e sua expiração não apaga dados    |

`email_digest`, `email_immediate_critical`, `profile_alerts`, unsubscribe e consentimento de personalização são preferências de conta até decisão explícita em contrário. Filtros, termos, região e sinais são de Espaço.

### Recursos pessoais — precisam de contexto de Espaço

| Estrutura atual                | Estado atual                                                 | Mudança futura                                                                                                    | Risco                                                    | Teste obrigatório                                                                             |
| ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `company_profiles`             | uma linha por `user_id`                                      | converter uma vez para `workspace_profiles` do Espaço padrão `procurement`; não manter escrita dupla              | perda de campos, versão ou alertas                       | comparação campo a campo conforme `workspace-profiles-v1.md`, inclusive nulos e arrays vazios |
| `company_tender_fits`          | cache por usuário, versão de perfil e edital                 | incluir `workspace_id`; chave/cache passa a usar Espaço + versão + oportunidade/modelo/prompt                     | reaproveitar fit calculado para outro perfil             | dois Espaços do mesmo usuário recebem resultados independentes                                |
| `saved_tenders`                | PK `(user_id, tender_id)` com monitoramento e acompanhamento | adicionar `workspace_id` e reconstruir unicidade por Espaço; na etapa de catálogo, migrar para salvo genérico     | conflito ao salvar o mesmo edital em dois Espaços        | mesmo usuário salva o mesmo edital em dois Espaços, com checklist e etapa independentes       |
| `saved_searches`               | busca e dedupe por usuário + consulta                        | adicionar `workspace_id`; unicidade ativa passa a incluir Espaço e a consulta deve carregar domínio               | dedupe entre jornadas, alerta executado no Espaço errado | mesma consulta em dois Espaços não colide; exclusão/restauração fica isolada                  |
| `notifications`                | feed e dedupe por usuário                                    | adicionar `workspace_id`; chave de dedupe inclui Espaço; preservar snapshots                                      | notificação visível no Espaço errado                     | listagem, não lidas e marcação como lida filtram associação + Espaço                          |
| `email_deliveries`             | entrega e dedupe por usuário                                 | registrar `workspace_id` quando originada de recurso de Espaço; mensagens estritamente de conta podem ficar nulas | colisão de dedupe ou link sem contexto                   | digest separa itens por Espaço e mantém dedupe por execução                                   |
| `email_delivery_notifications` | relação entrega/notificação                                  | herdar consistência por FKs e validar Espaços iguais                                                              | uma entrega agrupa notificações de Espaços diferentes    | constraint/teste de serviço impede mistura                                                    |

O backfill preserva `saved_at`, monitoramento, etapa, protocolo, checklist, histórico, datas, soft delete, contadores e snapshots. Não se deve recalcular esses valores.

### Recomendação e sinais

| Estrutura atual                    | Estado atual                                       | Mudança futura                                                                         | Risco                                   | Teste obrigatório                                    |
| ---------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `recommendation_events`            | eventos por usuário, inclusive termos normalizados | incluir `workspace_id`; eventos futuros sempre associados ao contexto em que ocorreram | sinais de Compras influenciam Cultura   | eventos idênticos geram perfis diferentes por Espaço |
| `recommendation_dismissals`        | PK usuário + edital                                | incluir Espaço na PK                                                                   | descartar em um Espaço oculta em todos  | descarte isolado por Espaço                          |
| `recommendation_interest_profiles` | uma linha derivada por usuário                     | chave por Espaço; reconstrução usa apenas sinais daquele Espaço                        | perfil híbrido entre jornadas           | rebuild não lê sinais de outro Espaço                |
| `user_recommendations`             | ranking usuário + edital                           | chave por Espaço + oportunidade                                                        | ranking sobrescrito entre Espaços       | paginação e regeneração isoladas                     |
| `recommendation_metrics_daily`     | métrica agregada global                            | manter global; opcionalmente adicionar dimensão de domínio só após decisão analítica   | cardinalidade ou identificação indireta | nenhuma dimensão pessoal é persistida                |
| `profile_keyword_vocabulary`       | vocabulário global de editais                      | manter global e público; futuros vocabulários podem ter dimensão de domínio            | replicar dado global por Espaço         | resultado independe do usuário                       |

`show_international_opportunities` hoje está em `users`. Na Fase 1 deve virar preferência/sinal do Espaço, pois país, domínio e fonte são dimensões independentes; o valor atual é copiado para o Espaço padrão no backfill.

### IA e jobs

| Estrutura atual                                                                                           | Escopo futuro           | Compatibilidade                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tender_ai_indexes`, `tender_ai_documents`, `tender_ai_passages`, `tender_ai_answers`, `tender_ai_sheets` | catálogo/global         | não adicionar `workspace_id`; conteúdo público e indexação são compartilháveis                                                                                   |
| `ai_daily_usage`, `ai_daily_tenders`, `ai_sheet_daily_usage`                                              | quota de conta          | manter por `user_id`; o limite comercial não multiplica por Espaço                                                                                               |
| `ai_ask_requests`                                                                                         | histórico/cache pessoal | nenhuma: permanece log pessoal da conta, sem `workspace_id` e fora do backfill (decisão de 13/10/2026); retenção de 90 dias e cache público por hash inalterados | excluir um Espaço não toca nesse log; pergunta bruta nunca entra em analytics |
| `company_tender_fits`                                                                                     | resultado personalizado | obrigatório `workspace_id`                                                                                                                                       | versão do perfil sozinha não identifica o Espaço                              |
| `ai_jobs`                                                                                                 | misto                   | jobs globais (`index`, OCR, ficha e título) permanecem sem Espaço; job `fit` recebe e valida `workspace_id` no registro e payload                                | dedupe de `fit` inclui Espaço; worker revalida associação antes de persistir  |
| `job_run_audit`                                                                                           | operacional/global      | nenhuma mudança                                                                                                                                                  | não registrar PII nem termos                                                  |

## Rotas e adaptadores v1

As rotas novas documentadas em `workspaces-v1.md` exigem `workspaceId` explícito. Durante a compatibilidade, as rotas atuais continuam com o mesmo formato externo e resolvem internamente o Espaço padrão; não há escrita dupla.

| Rotas atuais                                                 | Resolução futura                                                                   | Risco/teste de regressão                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `/v1/me/company-profile` e `/region-preview`                 | Espaço padrão `procurement`                                                        | GET/PUT/DELETE preservam payload e afetam só esse Espaço                 |
| `/v1/me/fit`                                                 | Espaço padrão, depois `workspaceId` explícito na rota v2                           | cache e versão não atravessam Espaços                                    |
| `/v1/me/saved-tenders*`                                      | Espaço padrão                                                                      | ids, importação, salvar, excluir e acompanhamento mantêm resposta v1     |
| `/v1/me/saved-searches*`                                     | Espaço padrão                                                                      | criar, editar, excluir, restaurar e marcar visto filtram o mesmo Espaço  |
| `/v1/me/notifications*`                                      | Espaço padrão                                                                      | feed, contador e leitura não incluem outro Espaço                        |
| `/v1/recommendations*` e `/v1/me/recommendation-history`     | Espaço padrão                                                                      | eventos, lista, descarte e limpeza ficam isolados                        |
| `/v1/me/recommendation-preferences`                          | consentimento continua na conta; preferências temáticas vão ao Espaço              | desabilitar continua apagando/impedindo sinais conforme política vigente |
| `/v1/tenders/:id/ask*` e `/sheet`                            | detalhe público continua universal; artefato personalizado usa Espaço padrão no v1 | não duplicar índice global; histórico pessoal não cruza Espaço           |
| `/v1/me/export` e `DELETE /v1/me`                            | conta inteira                                                                      | exporta e remove todos os Espaços e seus recursos                        |
| `/v1/me/billing*`, `/v1/billing/*`                           | conta                                                                              | checkout, webhook, cupom e cancelamento não recebem `workspace_id`       |
| rotas públicas de busca, detalhe, perfil/vocabulário e flags | globais                                                                            | comportamento e cache permanecem idênticos                               |

O adaptador deve falhar de modo observável se não houver Espaço padrão após o backfill; não pode escolher “o primeiro” sem ordenação. A resolução é por marcador explícito de padrão e associação ativa.

## Processos assíncronos

| Processo atual                               | Mudança necessária                                                                         | Teste de isolamento                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| avaliação de buscas salvas                   | carregar `workspace_id`, domínio e filtros; produzir notificações no mesmo Espaço          | duas buscas iguais em Espaços diferentes geram dedupes independentes         |
| alertas de perfil                            | ler perfil/sinais do Espaço e atualizar cursor daquele Espaço                              | cursor de um Espaço não suprime alerta de outro                              |
| digest e envio imediato                      | agrupar por destinatário **e** Espaço; gerar link contextual                               | nenhum e-mail mistura recursos; link antigo ainda abre o Espaço padrão       |
| recomendações diárias e rebuild com debounce | iterar Espaços elegíveis; chave de lock/debounce `(user_id, workspace_id)`                 | concorrência no Espaço A não bloqueia nem sobrescreve B                      |
| retenção de eventos e documentos de IA       | apagar todos os registros pessoais por Espaço sem tocar cache público antes do prazo       | deleção da conta cobre todos os Espaços; deleção de Espaço cobre somente ele |
| exportação e exclusão LGPD                   | incluir Espaços, membros, perfis, sinais, salvos, buscas, notificações e histórico pessoal | contagem/exportação completa e exclusão em cascata auditável                 |
| jobs de IA                                   | propagar Espaço apenas para jobs personalizados                                            | retry conserva Espaço; job global continua reutilizável                      |

## Backfill único: invariantes e casos de borda

O procedimento futuro deve ser idempotente, auditável e executado com a aplicação compatível já pronta, mas ainda com flags de Espaços desligadas.

1. Criar exatamente um Espaço padrão `procurement` por usuário existente, inclusive usuário sem perfil ou sem salvos.
2. Criar associação `owner` e preferência de Espaço padrão/ativo no servidor.
3. Converter `company_profiles` com o mapeamento aprovado, preservando `version`, timestamps, cursor de alerta e opt-in internacional.
4. Atribuir ao Espaço padrão todos os recursos pessoais atuais.
5. Reconstruir chaves compostas e dedupes depois da atribuição, antes de aplicar `NOT NULL`.
6. Comparar contagens, nulos e órfãos; bloquear cutover se qualquer invariável falhar.

Casos que precisam de tratamento explícito:

- usuário sem e-mail verificado, sem perfil ou com conta parcialmente criada;
- usuário excluído enquanto o backfill está em janela de execução;
- linha órfã preexistente, soft delete e notificação cujo recurso de origem já foi removido;
- arrays vazios versus `null`, valores numéricos em texto e versões antigas do perfil;
- duplicidade hoje impossível pela chave de usuário que passa a ser possível por Espaço;
- retries de e-mail/job em andamento com dedupe antigo;
- trial/assinatura expirando durante a operação;
- conta gratuita que, por erro ou retry, receba mais de um Espaço;
- oportunidade internacional com `scope = 'international'`: domínio aprovado `procurement` para Banco Mundial, preservando país, fonte e regra de elegibilidade como dimensões distintas.

Validações quantitativas mínimas: usuários = Espaços padrão = memberships `owner`; linhas atribuídas antes/depois iguais; zero `workspace_id` nulo nas tabelas convertidas; zero recurso cujo usuário não seja membro; zero colisão de chave; amostra reversível de mapeamento do perfil.

### Janela de corte

O corte aceita uma janela curta de manutenção. Somente as mutações nas tabelas afetadas são bloqueadas; busca e detalhes públicos continuam disponíveis. Jobs que escrevem nesses conjuntos são drenados ou pausados, o delta após os marcos é aplicado e as invariantes são validadas antes da troca.

Os parâmetros iniciais da janela, os gatilhos de aborto, a lista de rotinas a drenar e as condições do ensaio foram aprovados em 13/10/2026 e estão na seção [Janela de corte](./hub-adaptativo-roadmap-v2.md#janela-de-corte) do roadmap. Os valores finais são confirmados pelo dono depois do ensaio com volume real, que ele executa no servidor. Se o delta ou a validação excederem a janela aprovada, o corte é cancelado; escrita dupla não é introduzida como atalho.

## Cache, links e clientes

- Chaves React Query hoje agrupadas em `me.*` devem incorporar `workspaceId` para recursos contextuais e ser invalidadas ao trocar Espaço. Cache de cobrança/conta não muda.
- `pendingRebuilds` de recomendações hoje usa apenas `userId`; a chave futura é `userId:workspaceId`.
- Locks, dedupes de jobs, notificações e e-mails contextuais incluem `workspace_id`; jobs globais não.
- URLs antigas sem Espaço continuam resolvidas pelo adaptador v1 para o padrão. URLs novas de e-mail carregam um identificador opaco/slug de Espaço, validado no servidor; nunca confiam somente no parâmetro.
- Busca pública e detalhes continuam cacheáveis sem `workspace_id`. Respostas personalizadas devem variar pelo Espaço e nunca usar cache público compartilhado.
- Nenhum perfil ou seleção de Espaço vai para `localStorage`; o servidor mantém a preferência, e a sessão continua em `licita_session`.

## LGPD e cobrança

Exportação de dados deve identificar o Espaço de cada dado contextual e incluir memberships `owner`. Convites e dados colaborativos só passam a integrar exportação/exclusão na Fase 6. Exclusão da conta remove todos os Espaços de propriedade exclusiva; exclusão de um Espaço não pode apagar a conta nem caches globais do catálogo. Logs e métricas usam IDs técnicos e não registram respostas de perfil, termos, e-mail ou nome.

Billing permanece por conta. O limite de criação e o `accessMode` consultam entitlement no servidor; o webhook Asaas nunca recebe nem deriva `workspace_id`. Antes de ativar a Fase 1, checkout, confirmação por webhook, cancelamento, atraso, cupom, trial e retomada precisam ser homologados ponta a ponta. Isso não autoriza mudar gates atuais. Na expiração, o menor slot não arquivado permanece gravável e os excedentes ficam somente leitura; a UI informa antes da expiração qual continuará editável.

## Matriz mínima de aceitação da futura Fase 1

| Cenário                                          | Resultado esperado                                        |
| ------------------------------------------------ | --------------------------------------------------------- |
| owner consulta seu Espaço                        | `200`, somente dados daquele Espaço                       |
| usuário autenticado usa UUID de terceiro         | `404`, sem diferença entre inexistente e proibido         |
| recurso pertence a outro Espaço do mesmo usuário | não é lido nem alterado                                   |
| membership `owner` falta durante request/job     | próxima autorização falha; job não persiste resultado     |
| usuário grátis cria segundo Espaço               | `402 WORKSPACE_LIMIT_REACHED`                             |
| assinatura expira com cinco Espaços              | menor slot gravável; demais legíveis e somente leitura    |
| usuário seleciona Espaço somente leitura         | seleção e leitura permitidas; mutação dá `402`            |
| adaptador v1 após backfill                       | mesmo contrato e recursos no Espaço padrão                |
| mesmo item salvo em dois Espaços                 | estados de acompanhamento independentes                   |
| busca/alerta/recomendação                        | sinais e resultados não atravessam Espaços                |
| exportação/exclusão                              | cobre todos os dados contextuais e mantém catálogo global |
| cache/link de e-mail manipulado                  | associação é revalidada e nenhum dado vaza                |
| job em retry                                     | conserva `workspace_id` e dedupe corretos                 |

## Decisões de 13/10/2026 que afetam a compatibilidade

- **Espaço ativo:** a preferência referencia o Espaço com `ON DELETE SET NULL` e guarda a última seleção por Espaço. Preferência inválida é resolvida na leitura, sem gravar, pela ordem do [contrato](../contracts/workspaces-v1.md#resolução-do-espaço-ativo). O backfill grava o Espaço padrão como ativo e como última seleção.
- **Perfil:** `workspace_profiles` ganha o contador `revision`, separado de `profileVersion`. O backfill inicia `revision` de forma determinística a partir do perfil convertido; a rota v1 de perfil continua sem checagem de conflito e também incrementa `revision`, para que a rota nova perceba gravações feitas pelo adaptador.
- **Busca:** `workspaceId` na busca nunca muda a resposta para quem não é membro e sempre desliga o cache público; a busca v1 sem o parâmetro segue idêntica.
- **Onboarding:** os estados permanecem `not_started | in_progress | complete`. Perfis convertidos pelo backfill ficam `complete` quando têm palavras-chave e região, e `in_progress` quando falta um dos dois.
- **Perguntas de IA:** `ai_ask_requests` e as cotas de IA permanecem na conta; nenhuma coluna, índice ou job dessa área muda na Fase 1.

## Pontos ainda a decidir pelo dono

- valores finais da janela de corte (duração máxima e ponto de não retorno), depois do ensaio com volume real;
- forma da troca no corte: por flag, sem reinício, ou por deploy, aceitando interromper o job noturno de classificação naquela noite;
- política de transferência/exclusão de Espaço com mais de um membro, adiada para a Fase 6.
