# Hub adaptativo — roadmap v2

Data de atualização: 13 out. 2026
Status: **roadmap vigente, consolidado com as decisões aprovadas pelo dono em 12 e 13/10/2026**. Ele ordena trabalho futuro; esta consolidação é somente documental e não autoriza tabelas, migrações, flags ou telas em produção. Em 13/10/2026 o dono autorizou o código da Fase 1, desligado e sem migração em produção, e aprovou as decisões de execução do [plano da Fase 1](./hub-adaptativo-fase1-execucao.md#decisões-aprovadas-em-13102026).

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
- resolver preferência de Espaço ativo inválida por ordem determinística, sem gravar em leitura;
- adotar controle otimista (`baseRevision`/`revision`) apenas na rota nova de perfil, mantendo a rota v1 como está;
- responder `workspaceId` na busca conforme o contrato: `401` sem sessão, `400` para id malformado e resultado universal idêntico para id inexistente ou alheio;
- manter o histórico de perguntas de IA como log pessoal da conta, fora do backfill.

**Critérios de aceite:**

- um Espaço padrão e membership `owner` para cada usuário preexistente;
- contagens e checksums antes/depois conciliados, sem órfãos, duplicatas, vínculo incorreto ou `workspace_id` nulo no corte;
- gravações concorrentes capturadas pelo delta da janela de corte;
- isolamento negativo coberto em API, jobs, cache e links;
- rotas v1 mantêm payload, gates e comportamento no Espaço padrão;
- conta grátis limitada a um Espaço e trial/assinatura a cinco; expiração não apaga dados e torna excedentes somente leitura;
- rollback pela flag (com cópia reversa do perfil) e rollback de dados ensaiados separadamente;
- parâmetros iniciais da janela confirmados ou ajustados pelo dono após ensaio com volume real, executado por ele no servidor;
- W4 aplicada em segunda janela, depois de 7 dias de observação sem incidente e com zero linhas do escopo com `workspace_id` nulo criadas depois da virada;
- rotas novas de Espaços, criação de Espaços e jornadas respondendo somente depois de W4;
- os três estados de onboarding preservados, com `complete` significando mínimo concluído.

**Esforço indicativo:** 2–3 sprints, incluindo ensaio de backfill e rollout.

**Gate:** aprovação explícita do SQL, backfill, relatório do dry run, backup/restore, valores finais da janela de corte após o ensaio, evidências de isolamento, checklist LGPD e validação ponta a ponta do Asaas. Esta aprovação ainda não existe. A Fase 1 tem duas janelas em produção, cada uma com aprovação própria do dono: a da virada e a de W4, esta só depois da observação de 7 dias.

**Execução do código:** [plano de execução da Fase 1](./hub-adaptativo-fase1-execucao.md) (branch de integração, unidades B–H e decisões aprovadas em 13/10/2026).

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

| Ordem | Artefato lógico           | Conteúdo e disciplina operacional                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1    | fundação de Espaços       | criar `workspaces`, `workspace_members` apenas com associação `owner`, perfis, sinais e preferência ativa; não criar convites; garantir idempotência do Espaço padrão e da membership; incluir constraints e índices de propriedade, `limit_slot` e preferência ativa compatíveis com carga; o perfil nasce com o contador `revision` do controle otimista, separado de `profileVersion`; a preferência ativa referencia o Espaço com `ON DELETE SET NULL` e registra a última seleção por Espaço                                                                 |
| W2    | expansão de escopo        | adicionar colunas `workspace_id` anuláveis às tabelas pessoais da matriz; criar FKs como `NOT VALID` quando apropriado e índices concorrentes fora de transações quando o PostgreSQL exigir; a aplicação compatível tolera nulos até o corte                                                                                                                                                                                                                                                                                                                      |
| W3    | backfill único            | executar procedimento idempotente e auditável: lote do Espaço `procurement`, perfil e artefatos; manter checkpoints e relatório por linha/conjunto; `ai_ask_requests` fica fora, por ser log pessoal da conta; durante o corte curto, drenar jobs, bloquear somente mutações afetadas, aplicar o delta desde os marcos (inclusive perfis editados ou apagados, cursor de alerta e preferência internacional) e reconciliar invariantes; nunca manter escrita dupla                                                                                                |
| W4    | enforcement               | fora da janela de corte, em segunda janela curta, depois de 7 dias de observação com a flag ligada, sem incidente e com zero linhas do escopo com `workspace_id` nulo criadas depois da virada; validar FKs e contagens, eliminar nulos e só então aplicar `NOT NULL` e novas unicidades por Espaço; remover apenas constraints incompatíveis; manter estruturas legadas até uma release posterior comprovar ausência de leitores, writers e retries antigos; é o ponto sem volta do rollback pela flag e o que libera rotas novas, criação de Espaços e jornadas |
| C1    | catálogo                  | criar a projeção universal e índices; backfill de `tenders` e `cultural_opportunities`; validar fingerprints e proveniência antes do cutover de leitura                                                                                                                                                                                                                                                                                                                                                                                                           |
| A1    | artefatos                 | criar modelos universais de salvos, buscas, alertas e dashboard da Fase 3; copiar estados com verificação e trocar leituras antes de qualquer remoção futura                                                                                                                                                                                                                                                                                                                                                                                                      |
| E1    | afinidade e elegibilidade | criar caches, rulesets, resultados e evidências separados da Fase 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| T1    | colaboração               | ampliar memberships para demais papéis e criar convites, equipes e organizações apenas na Fase 6                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Nunca combinar criação, backfill massivo, constraint e remoção em uma única migração. Qualquer falha interrompe a sequência. Nenhuma remoção de coluna/tabela ocorre até uma release posterior comprovar que não há leitores, jobs ou retries antigos.

## Janela de corte

O corte de W3 aceita uma janela curta de manutenção. Somente as mutações que escrevem nas tabelas afetadas são bloqueadas; busca e detalhes públicos continuam disponíveis, assim como coleta global que não escreva nessas tabelas. O backfill em lote roda fora da janela; dentro dela ficam apenas a drenagem de jobs, o bloqueio no menor escopo, o delta desde os marcos, a conferência de invariantes e a troca para gravar só no modelo novo. A retomada das escritas é um passo separado da troca: o dono confere uma leitura pelas rotas v1 antes de liberar.

W4 não entra nesta janela (decisão de 13/10/2026). Ela roda numa segunda janela curta, depois de 7 dias de observação, porque `SET NOT NULL` e a troca de chaves tomam `ACCESS EXCLUSIVE` nas tabelas do escopo. Enquanto W4 não é aplicada, o rollback pela flag continua possível nas condições da [Forma da troca](#forma-da-troca).

Se o delta ou a validação excederem a janela aprovada, o corte é cancelado. A aplicação permanece ou retorna ao estado anterior conforme o runbook, e a escrita dupla nunca é introduzida como atalho.

### Parâmetros iniciais

Aprovados pelo dono em 13/10/2026 como **valores iniciais, a confirmar no ensaio com volume real**. Os valores finais saem das fórmulas abaixo e nunca passam do teto.

```
janela_max   = min(15 min, 2 × (drenagem + bloqueio + delta + validação + troca) medidos no pior ensaio)
ponto_aborto = janela_max − tempo de rollback de aplicação medido
```

| Parâmetro                             | Valor inicial              | Por quê                                                                                                                                          |
| ------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Início                                | 03:30 `America/Sao_Paulo`  | depois da retenção das 03:00, que apaga registros do escopo e mudaria o delta; antes da coleta do PNCP das 06:00 e do digest de e-mail das 07:00 |
| Duração máxima de mutações bloqueadas | 15 min (meta de até 5 min) | base beta pequena; leitura, busca e detalhe nunca entram em manutenção                                                                           |
| Ponto de não retorno                  | T+10 min                   | deixa 5 min para reabrir as mutações no legado                                                                                                   |
| Drenagem de jobs                      | até 3 min                  | job de afinidade/IA ou envio de e-mail ainda rodando depois disso aborta o corte                                                                 |
| `lock_timeout` por tabela de origem   | 5 s                        | espera maior por lock indica tráfego inesperado                                                                                                  |

### Aborto

Aborto imediato, em qualquer momento antes da troca, se:

1. qualquer contagem, checksum por usuário/tabela, órfão, duplicata ou vínculo com Espaço errado divergir — tolerância zero;
2. o ponto de não retorno chegar sem a validação concluída;
3. a drenagem passar de 3 min ou um `lock_timeout` disparar;
4. o delta tiver mais de 3× as linhas previstas pela taxa medida de mutações naquele horário;
5. as leituras públicas passarem de 1% de erro ou de 2× o p95 do baseline durante a janela.

Abortar significa soltar os locks, manter as flags desligadas, reabrir as mutações no legado — que nunca deixou de ser a fonte — e preservar as tabelas novas para investigação. Como nada grava no modelo novo antes da troca, abortar não exige restaurar backup.

O script de corte precisa de cronômetro com ponto de não retorno, `lock_timeout` explícito, relatório das invariantes antes da troca e um comando de aborto ensaiado.

### Forma da troca

Decisão do dono em 13/10/2026: **troca por flag em runtime, com um deploy preparatório**.

- O deploy preparatório leva schema e adaptadores com a flag de corte **desligada**: as migrações aditivas (W1 e W2) são aplicadas manualmente pelo dono, como toda migração de produção, e a aplicação compatível sobe em seguida. Isso acontece antes e fora da janela, como um deploy comum, e não muda o comportamento. A `main` só recebe esse código depois do gate de migração (SQL aprovado, backup/restore, ensaio com volume real), e a versão nova exige W1 e W2 aplicadas para subir.
- A virada é atômica e sem reinício: ligar a flag faz a aplicação passar a gravar somente no modelo novo, de uma vez, em todos os processos que gravam nas tabelas do escopo.
- Rollback de aplicação pela flag (decisão de 13/10/2026): desligar a flag **só** é rollback se vier com a cópia reversa do perfil do Espaço padrão para o legado, feita na mesma transação, **antes de W4** e **sem nenhum Espaço não padrão**. Fora dessas condições, resta só o rollback de dados, que segue sendo um procedimento separado.
- `FEATURE_JOURNEYS` é lida do ambiente na subida e exige reinício; por isso **não serve sozinha para o corte**. A Fase 1 precisa de uma flag de corte lida em runtime, com propagação medida no ensaio. O mecanismo está implementado na branch da Fase 1; a propagação na cópia do servidor ainda precisa ser medida pelo dono.
- As flags de jornada continuam como estão: controlam disponibilidade de produto, não o corte de dados.
- Mecanismo, ferramenta (`psql` + `bash`), erro `503 MAINTENANCE_IN_PROGRESS` e regras de rollback: [contrato da flag de corte](../contracts/workspace-cutover-v1.md).

### Rotinas a drenar ou pausar

Além da fila de IA, a API mantém agendadores que gravam continuamente em tabelas do escopo. Todos entram na drenagem e ficam pausados até a troca ou o aborto. Lista levantada a partir de `startSchedulers` em `artifacts/api-server/src/index.ts` e conferida no código de cada rotina em 13/10/2026, refeita na unidade E da Fase 1 (as 22 entradas de `startSchedulers`); deve ser refeita antes do ensaio, porque agendadores novos podem ter entrado. A consulta que prova o fim da drenagem e as chaves de `job_run_audit` destas rotinas estão em `artifacts/api-server/src/workspaces/cutover-drain.ts`.

| Rotina                                          | Onde                                                             | O que grava no escopo                                                                                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fila durável de IA                              | `ai/ai-job-queue.ts` (`startAiJobWorker`)                        | somente os jobs `fit`, que executam `executeCompanyFitJob` em `ai/company-fit-service.ts` e gravam em `company_tender_fits`; os demais tipos de job são globais |
| envio imediato de e-mail, a cada 60 s           | `email/email-scheduler.ts` (`startEmailNotificationJobs`)        | entregas de e-mail e vínculo com notificações                                                                                                                   |
| avaliação de buscas salvas, por intervalo       | `email/email-scheduler.ts` e `account/notification-service.ts`   | notificações, checkpoint e contador de novos itens da busca salva                                                                                               |
| digest diário de e-mail                         | `email/email-scheduler.ts`                                       | entregas de e-mail; fora do horário da janela, mas pausado por segurança                                                                                        |
| notificação de fim de teste                     | `account/trial-notification-scheduler.ts`, por intervalo         | notificações, via `createTrialEndingNotifications` em `account/notification-service.ts`                                                                         |
| alertas de perfil                               | `email/email-scheduler.ts` (`runProfileAlerts`)                  | notificações de novos editais com alta aderência, via `evaluateProfileAlertNotifications`                                                                       |
| rebuild de recomendações                        | `recommendations/recommendation-service.ts`                      | perfil de interesse e recomendações materializadas                                                                                                              |
| retenção de dados pessoais                      | `account/personal-data-retention.ts`                             | apaga notificações lidas e limpa o conteúdo de entregas de e-mail antigas; por isso a janela começa depois das 03:00. A retenção de perguntas de IA (`ai/ask-tender-service.ts`) só apaga `ai_ask_requests`, fora do escopo, e não precisa ser drenada |
| notificações de mudança de edital               | geradas pela coleta do PNCP (`pncp_collect`) e pelo enriquecimento de detalhes (`pncp_detail:<id>`), que também roda ao abrir a página de um edital sem detalhes | notificações de prazo, status, valor e documento. Cada edital alterado que tem alguém monitorando é um ciclo: durante a pausa ele não começa e a coleta seguinte o refaz; a coleta de catálogo em si não precisa parar |
| reconciliação de prazos e status                | `ingest/reconcile-tender-deadlines.ts`                           | nada no escopo: atualiza apenas `tenders` por SQL direto e não chama o serviço de notificações; não precisa ser drenada                                         |

Os rebuilds de recomendação disparados pelas rotas (debounce em memória) e pela leitura sem lista pronta não passam por `job_run_audit` e não entram na consulta de drenagem: não começam em pausa, o que gravaram antes do bloqueio do corte entra no delta, e o que atravessa o corte é descartado.

Não gravam em tabelas do escopo e não precisam ser drenados: retenção de documentos de IA, nova tentativa de documentos, coleta de transparência, backfill de plataforma, revisão de valor estimado, revisão de dono de oportunidade, coletas de cultura, fomento e internacional, classificação de categorias (diária e noturna), vocabulário de palavras-chave de perfil e reconciliação de cobrança.

O job noturno de classificação de categorias (00:00–05:30) não grava em tabelas de usuário e não precisa ser drenado. Como a troca é feita por flag em runtime, sem reinício, ele não é interrompido pelo corte.

### Ensaio com volume real

O ensaio usa cópia restaurada do backup de produção e a taxa de mutações extraída dos logs; contém dado pessoal. Condições aprovadas:

O [runbook do ensaio definitivo](../../ops/rehearsal/workspaces/README.md) usa os SQLs versionados de [`ops/workspaces/`](../../ops/workspaces/). Os rascunhos históricos W1–W4 da pasta de ensaio não são migrações aprovadas nem autorizam a Fase 1. O dono executa o ensaio no servidor somente sobre a cópia isolada descrita abaixo.

**Ensaio no servidor pendente do dono:** a unidade G disponibiliza o delta definitivo, a cópia reversa e W4 em segunda janela. O dono refaz o ensaio com eles antes de aprovar qualquer corte em produção; o resultado local não substitui as duas cópias com volume real.

- roda **no servidor, executado pelo dono**; agentes não acessam o banco de produção nem cópias dele;
- a cópia é descartada ao fim do ensaio;
- o relatório traz somente contagens, tempos e resultados de invariantes, sem dado pessoal;
- o ensaio roda pelo menos duas vezes e vale o pior resultado.

O que o ensaio mede:

1. contagem e tamanho por tabela do escopo (perfis, salvos e participação, buscas salvas, notificações, afinidades, recomendações e eventos);
2. duração do backfill em lote, para garantir que ele cabe fora da janela;
3. taxa real de mutações por minuto entre 03:30 e 04:30 e, com ela, o tamanho esperado do delta;
4. tempo de aplicar o delta com escritas sintéticas nessa taxa durante o lote;
5. tempo de drenagem da fila de IA e do envio de e-mails no pior caso;
6. tempo de obter os locks e de rodar todas as conferências — os checksums são a parte mais provável de estourar;
7. tempo da troca pela flag de corte e do rollback de aplicação (desligar a flag com a cópia reversa do perfil), cada um ensaiado de verdade;
8. tempo de restaurar o backup, que não entra na janela mas decide se o rollback de dados é viável.

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

- **rollback de aplicação:** voltar o tráfego para a versão anterior enquanto estruturas legadas continuam intactas e, quando substituídas, somente leitura; só é válido se a versão anterior não tentar gravar nelas durante o retorno. No corte da Fase 1, é desligar a flag **com** a cópia reversa do perfil, antes de W4 e sem Espaço não padrão; desligar a flag sem essas condições não é rollback;
- **rollback de dados:** restaurar o backup ou executar procedimento de reversão validado, reconciliando também as gravações posteriores ao snapshot; nunca presumir que um `down.sql` recupera dados removidos ou transformados.

Rollback por categoria:

- DDL aditivo: desligar adaptadores/flags e voltar a aplicação; estruturas novas podem permanecer vazias até remoção planejada;
- backfill: usar o relatório e as chaves determinísticas para remover apenas os dados identificados ou restaurar o backup, conforme runbook aprovado;
- índices/constraints: cancelar operação longa e remover somente o índice novo inválido pelo nome exato; não relaxar constraint após o corte sem voltar primeiro a aplicação;
- corte: desligar a flag com a cópia reversa do perfil, enquanto W4 não foi aplicada e só existe o Espaço padrão; depois de W4, só rollback de dados ou correção para frente; escrita dupla não é mecanismo de rollback;
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
2. **Asaas:** checkout, retorno, webhooks autenticados/idempotentes, estados de assinatura e reconciliação são validados ponta a ponta antes de ativar a Fase 1; isso não autoriza mudar gates atuais. Antes de ligar a chave de produção do Asaas, os ids de eventos já processados passam a ser guardados (migração própria), para que um pagamento reentregue depois de um estorno não reative a assinatura.
3. **Migração:** revisão de SQL, estimativa de lock, backup/restore e dry run com volume real.
4. **Corte:** os parâmetros iniciais e os gatilhos de aborto estão aprovados; a troca é por flag em runtime, com deploy preparatório; depois do ensaio no servidor, refeito com o delta definitivo, o dono confirma os valores finais da janela e a lista de rotinas pausadas. W4 tem janela própria, aprovada depois de 7 dias de observação sem incidente e com zero linhas do escopo com `workspace_id` nulo criadas depois da virada; só depois dela respondem as rotas novas, a criação de Espaços e as jornadas.
5. **Integridade, isolamento e reversibilidade:** as três evidências ficam verdes antes de `NOT NULL`, cutover ou liberação de mutações.
6. **Catálogo:** proveniência, fingerprint, fontes e metas de busca aprovadas.
7. **Artefatos/jornadas:** contratos, UX, acessibilidade, analytics, jobs e rollback de flag aprovados individualmente.
8. **Afinidade/elegibilidade:** rulesets, evidências, limiares e taxa de `unknown` aprovados por domínio.
9. **Fontes:** Pesquisa/Estudo avançam somente após homologação por fonte; Estudo permanece oculto sem fonte oficial.
10. **Colaboração:** convites, papéis, equipes e organizações exigem contrato, política LGPD e decisão comercial próprios da Fase 6.

Nenhuma fase começa automaticamente pela aprovação deste roadmap. O código da Fase 1 foi autorizado em 13/10/2026, desligado e sem migração em produção; migrações, virada e ativação continuam dependendo destes gates.
