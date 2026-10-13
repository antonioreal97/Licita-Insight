# Hub adaptativo — plano de execução do código da Fase 1

Data de atualização: 13 out. 2026
Status: **plano proposto para aprovação do dono**. Em 13/10/2026 o dono autorizou iniciar o código da Fase 1 com este escopo: “flag de corte em runtime, serviço de Espaços e adaptadores das rotas v1, tudo desligado e sem migração em produção”. Continuam valendo: nenhuma migração aplicada em produção; ativação só depois dos gates (Asaas ponta a ponta, ensaio do corte no servidor, aprovação do SQL e do backfill).

Referências: [roadmap v2](./hub-adaptativo-roadmap-v2.md), [compatibilidade](./hub-adaptativo-compatibilidade.md), [revisão aprovada](./hub-adaptativo-revisao.md), [contrato da flag de corte](../contracts/workspace-cutover-v1.md), [contrato de Espaços](../contracts/workspaces-v1.md), [perfis](../contracts/workspace-profiles-v1.md) e [ensaio W1–W4](../../ops/rehearsal/workspaces/README.md).

## Estratégia de branch

### Recomendação: branch de integração `feat/workspaces-phase-1`

Criada da `main`. Todos os PRs de código da Fase 1 apontam para ela. A `main` só recebe documentação da Fase 1 até a aprovação dos gates; o PR final `feat/workspaces-phase-1` → `main` **é** o deploy preparatório.

Por que ela, com base no fluxo real:

- O agente de deploy do servidor (`licita-monitor-deploy`, regras em `ops/macbook/monitor/ALBERT.md` na branch `ops/macbook-worker`) classifica como `db_schema` qualquer arquivo em `lib/db/migrations/` **ou** `lib/db/src/schema/` e, nesse caso, **para e só reporta, sem `pull`**. Um schema Drizzle da Fase 1 na `main` travaria todos os deploys seguintes, inclusive correções urgentes, até o dono aplicar a migração — que depende de gates ainda não cumpridos.
- `verify:migrations` exige que schema Drizzle e migrações andem juntos; não dá para levar o schema sem a migração nem o contrário.
- Produção nunca migra sozinha; o dono aplica cada migração à mão, uma por vez, depois de backup verificado (ex.: [`docs/migrations/0041-international-opportunities.md`](../migrations/0041-international-opportunities.md)).
- O `db-setup` de desenvolvimento roda `push-force` a partir do schema Drizzle. Na branch de integração isso cria as tabelas novas em quem trabalha nela, sem afetar quem está na `main`.
- Quase todo o código da Fase 1 depende dos tipos Drizzle das tabelas novas; ele não compila sem o schema.

### Alternativa avaliada: entrar na `main` aos poucos, atrás da flag

Serve só para módulos puros, sem schema (cálculo de limites 1/5, `accessMode`, resolvedor do Espaço ativo, conversão do perfil). Mesmo esses ficariam na `main` sem chamador real até o resto chegar, o que contraria a regra do repositório de não criar abstração sem callsite. Todo o resto esbarra no bloqueio do deploy por `db_schema` e na dupla schema + migração. Além disso, entrar aos poucos obrigaria a versão em produção a rodar sobre o schema atual, ou seja, projeção explícita em toda consulta legada (ver [comportamento com a flag desligada](../contracts/workspace-cutover-v1.md#comportamento-com-a-flag-desligada)). **Não recomendada.**

### Rotina da branch de integração

- PRs saem de worktrees próprios criados a partir de `origin/feat/workspaces-phase-1`, nunca do worktree `main`; commits com paths explícitos, mensagem convencional em inglês, sem `Co-authored-by`.
- A `main` entra na branch de integração por **merge** (sem rebase e sem force push), pelo menos uma vez por semana e sempre antes de mergear um PR na integração, num PR próprio `chore: merge main into feat/workspaces-phase-1`.
- Numeração de migrações: W1 e W2 nascem como as próximas livres (hoje `0042` e `0043`). Se a `main` ganhar migração nova, as da Fase 1 são renumeradas no PR de sincronização, para continuarem depois de tudo o que produção já aplicou. O número definitivo só se fixa no PR final.
- Não há CI no repositório (`.github/` tem só `dependabot.yml`). Cada PR informa o que rodou localmente: typecheck, testes unitários, testes da API com `PNCP_TEST_DATABASE_URL`, `verify:migrations` e build do frontend quando houver UI.

### Riscos da branch longa e mitigação

| Risco                                                | Mitigação                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| divergência da `main`                                | sincronização semanal por merge; PR final só depois de uma sincronização sem conflito pendente                                                                    |
| conflitos em arquivos quentes                        | lista abaixo comunicada ao coordenador; trabalho na `main` nesses arquivos durante a Fase 1 é avisado antes e, se possível, adiado ou feito pequeno               |
| migração nova na `main` no meio do caminho           | renumeração das migrações da Fase 1 no PR de sincronização; regra de que W1/W2 sempre ficam por último                                                            |
| nova gravação no escopo criada na `main` sem a porta | toda sincronização roda o teste estático de “gravação fora da porta” do [contrato](../contracts/workspace-cutover-v1.md#matriz-de-testes); falha bloqueia o merge |
| agendador novo na `main`                             | a lista de rotinas a drenar é refeita a cada sincronização e antes do ensaio, como o roadmap já exige                                                             |
| branch parada envelhece                              | se ficar mais de 4 semanas sem PR, o coordenador avalia com o dono congelar ou descartar                                                                          |

Arquivos quentes: `artifacts/api-server/src/index.ts`, `routes/account.ts`, `routes/profile.ts`, `routes/recommendations.ts`, `account/account-service.ts`, `account/notification-service.ts`, `account/account-privacy-service.ts`, `account/personal-data-retention.ts`, `ai/company-fit-service.ts`, `ai/ai-job-queue.ts`, `email/email-scheduler.ts`, `email/email-service.ts`, `recommendations/recommendation-service.ts`, `lib/db/src/schema/*`, `lib/db/migrations/meta/_journal.json` e as chaves `me.*` do React Query no frontend.

## Sequência de unidades

A unidade A é a deste documento e do [contrato da flag](../contracts/workspace-cutover-v1.md). As demais são PRs contra `feat/workspaces-phase-1`. “Sem banco” = testes unitários; “Postgres temporário” = testes de integração com `PNCP_TEST_DATABASE_URL`; “ensaio” = só o dono, no servidor, sobre a cópia `_rehearsal`.

```text
B ──► C1 ──► C2 ─────────────► H
       │
       ├──► D1 … D5 ──► E ──► F ──► G
```

### B — schema, migrações W1/W2 e leitor da flag

**Depende de:** A aprovada.
**Arquivos:** `lib/db/src/schema/workspaces.ts` (novo) e colunas `workspace_id` nos schemas existentes; `lib/db/migrations/0042_*.sql`, `0043_*.sql` e `_journal.json`; `docs/migrations/0042-*.md` e `0043-*.md` com o procedimento manual de produção; leitor do estado e verificação de subida em `artifacts/api-server/src/` chamados por `index.ts`.
**Conteúdo:** W1 e W2 derivadas dos rascunhos de ensaio, sem a guarda `_rehearsal` e sem a tabela de checkpoints do ensaio; `workspace_cutover_events` dentro de W1; nenhuma constraint de W4; verificação de subida que encerra o processo listando o que falta se a tabela da flag ou as colunas `workspace_id` não existirem.
**Ponto técnico a confirmar:** os índices de W2 são `CREATE INDEX CONCURRENTLY` em produção, que não roda dentro de transação. Conferir se o migrador do Drizzle da versão instalada envolve as migrações em transação; se envolver, a migração versionada usa índice comum (desenvolvimento e testes) e o procedimento manual de produção traz a variante concorrente, com teste provando que os dois produzem os mesmos índices.
**Testes:** sem banco — interpretação do estado (tabela vazia = `legacy`). Postgres temporário — migrações sobre banco vazio e sobre banco na `0041` com dados fictícios; `verify:migrations`; verificação de subida falha sem W2 e passa com W2; suíte atual da API inteira verde com as colunas anuláveis. Ensaio — nada novo além do que W1/W2 já medem.
**Pronto quando:** nenhuma rota muda de comportamento; suíte atual verde; procedimento manual de produção revisado.

### C1 — domínio de Espaços e porta de escrita

**Depende de:** B.
**Arquivos:** módulo novo em `artifacts/api-server/src/workspaces/` (serviço de Espaços, `requireWorkspaceMember`, perfil com `revision`, conversão legado ↔ `procurement`), porta de escrita e erro `503 MAINTENANCE_IN_PROGRESS` em `lib/api-error.ts`.
**Conteúdo:** criação com `owner` na mesma transação e slot serializado por proprietário; limites 1/5 a partir do entitlement atual (`billing/billing-access.ts`); `accessMode`; resolvedor do Espaço ativo sem gravar em leitura; perfil com `baseRevision`/`revision`; conversão de ida e inversa; porta conforme o [contrato](../contracts/workspace-cutover-v1.md#porta-de-escrita-como-cada-mutação-enxerga-a-flag). Chamadores reais: criação de conta (D5) e rotas novas (C2) — por isso a porta nasce aqui e não em B.
**Testes:** sem banco — limites, `accessMode`, resolvedor, ida e volta do perfil, conflito de `revision`, ordem das instruções da porta. Postgres temporário — corrida na criação no limite e no slot, pausa com mutação em voo, `503` durante pausa e durante virada, erro de leitura da flag. Ensaio — nada.
**Pronto quando:** a porta tem testes da matriz do contrato; nada é montado em rota existente.

### C2 — rotas novas de Espaços, desligadas

**Depende de:** C1.
**Arquivos:** rotas de [`workspaces-v1.md`](../contracts/workspaces-v1.md) em `artifacts/api-server/src/routes/`.
**Conteúdo:** rotas montadas, mas respondendo `422 FEATURE_DISABLED` enquanto não valerem as três condições: `mode = 'workspaces'`, W4 aplicada e jornada habilitada em `FEATURE_JOURNEYS`. A exigência de W4 decorre da condição C2 do [rollback pela flag](../contracts/workspace-cutover-v1.md#rollback-pela-flag-e-seus-limites): com dois Espaços, a desvirada deixa de ser segura e a chave legada não comporta o mesmo edital em dois Espaços.
**Testes:** sem banco — validação de payload. Postgres temporário — matriz de isolamento do contrato de Espaços, `FEATURE_DISABLED` em cada condição faltante, `workspaceId` na busca (401/400/200 idêntico). Ensaio — nada.
**Pronto quando:** em `legacy` ou sem W4, nenhuma rota nova grava nada.

### D — adaptadores das rotas v1

**Depende de:** C1. Cinco PRs independentes entre si:

| PR  | Escopo                                                                                                          | Arquivos principais                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | `/v1/me/company-profile`, `/region-preview`, `/v1/me/fit`, preferência internacional                            | `routes/profile.ts`, `ai/company-fit-service.ts`, `recommendations/recommendation-service.ts` (leitura de `showInternational`) |
| D2  | `/v1/me/saved-tenders*`, participação, busca com `includeMonitored`                                             | `routes/account.ts`, `account/account-service.ts`, `account/participation.ts`, repositório de busca                            |
| D3  | `/v1/me/saved-searches*`, `/v1/me/notifications*`                                                               | `account/notification-service.ts`, `routes/account.ts`                                                                         |
| D4  | `/v1/recommendations*`, eventos, histórico, preferências                                                        | `routes/recommendations.ts`, `recommendations/recommendation-service.ts`                                                       |
| D5  | criação de conta (Espaço padrão no modo `workspaces`) e tratamento do `503 MAINTENANCE_IN_PROGRESS` no frontend | `auth/`, `account/account-service.ts`, cliente HTTP do frontend                                                                |

**Conteúdo:** cada rota lê o modo e escolhe o caminho; o legado fica como está hoje, só envolvido pela porta; o caminho novo resolve sempre o Espaço padrão, nunca o ativo, e grava `workspace_id`. Antes de W4, o caminho novo mantém as mesmas strings de `dedupe_key` do legado.
**Testes:** sem banco — escolha de caminho por modo. Postgres temporário — a mesma suíte de contrato v1 roda duas vezes, em `legacy` e em `workspaces`, e compara payloads; virada sob concorrência na área do PR. Ensaio — latência p95 das mutações com a porta.
**Pronto quando:** payload v1 idêntico nos dois modos; nenhuma gravação do escopo fora da porta na área do PR.

### E — jobs e agendadores

**Depende de:** D1–D4.
**Arquivos:** `email/email-scheduler.ts`, `email/email-service.ts`, `account/trial-notification-scheduler.ts`, `ai/ai-job-queue.ts`, `ai/company-fit-service.ts`, `recommendations/recommendation-service.ts`, `account/personal-data-retention.ts`, notificações geradas pela coleta.
**Conteúdo:** regra de ciclo do [contrato](../contracts/workspace-cutover-v1.md#jobs-e-agendadores) (não começar em pausa, concluir ciclo já iniciado, descartar se o modo mudou); job `fit` com `workspace_id` e revalidação de membership; chave de debounce `userId:workspaceId`; e-mails agrupados por destinatário e Espaço.
**Testes:** sem banco — regra de ciclo com estado falso. Postgres temporário — job enfileirado antes da virada, job sem Espaço depois da virada, ciclo atravessando a virada, API e worker separados, dedupe sem envio duplicado. Ensaio — tempo de drenagem real.
**Pronto quando:** consulta de drenagem do contrato retorna zero com as rotinas pausadas.

### F — LGPD e matriz de isolamento

**Depende de:** E.
**Arquivos:** `account/account-privacy-service.ts`, `account/personal-data-retention.ts`, testes de isolamento e testes estáticos.
**Conteúdo:** exportação e exclusão cobrindo os dois modelos em qualquer modo, porque depois de uma desvirada as tabelas novas continuam guardando dados pessoais; matriz de isolamento de API, jobs, cache e links; teste estático de gravação fora da porta e de gravação na tabela da flag.
**Testes:** Postgres temporário — exportação completa e exclusão em cascata nos dois modos; isolamento negativo. Ensaio — nada.
**Pronto quando:** checklist LGPD do gate preenchido com evidência.

### G — W3 e W4 definitivos e ferramenta de corte

**Depende de:** B–F.
**Arquivos:** `ops/workspaces/` (novo, separado do ensaio) com `cutover.sh` e o SQL de W3 lote, W3 delta, reconciliação de perfis, invariantes, cópia reversa e W4; extensão de `ops/rehearsal/workspaces/` para medir a aplicação.
**Conteúdo:** comandos `status`, `pause`, `cut`, `resume`, `abort`, `rollback` do contrato; cronômetro com ponto de não retorno; gatilhos de aborto aprovados; delta com reconciliação de perfis (achado no rascunho atual, que usa `ON CONFLICT DO NOTHING`); W4 como passo separado; extensão do ensaio com uma instância da aplicação nova sobre a cópia, com e-mail, IA, coletas e Asaas desligados, para medir propagação, `503` e desvirada.
**Testes:** Postgres temporário, no padrão de `test-rehearsal.sh` — ciclo completo virada → desvirada → nova virada, recusa da desvirada com W4 ou com Espaço não padrão, aborto em cada etapa. Ensaio — tudo o que a seção “Ensaio com volume real” do roadmap lista, mais as medições de propagação do contrato.
**Pronto quando:** dois ensaios no servidor com relatório sanitizado e valores finais da janela propostos ao dono.

### H — frontend mínimo, desligado

**Depende de:** C2.
**Arquivos:** `artifacts/licitainsight/src/features/workspaces/` (já tem `use-journey-feature-flags.ts`), `AppShell` só atrás da flag.
**Conteúdo:** seletor de Espaço, onboarding mínimo, aviso de downgrade antes da expiração; chaves React Query com `workspaceId`; nada visível com as jornadas desligadas.
**Testes:** sem banco — testes de componente e de chaves de cache; contraste AA. Postgres temporário — não se aplica. Ensaio — não se aplica; validação visual em desenvolvimento com Docker.
**Pronto quando:** com `FEATURE_JOURNEYS` vazia, a UI é idêntica à atual.

### Conteúdo do deploy preparatório

B, C1, C2, D1–D5, E, F e G. H pode ir junto, desligado. Nada disso muda comportamento em `legacy`.

## O que continua bloqueado e por quem

| Ação                                                           | Quem decide e executa | Depois de                                                |
| -------------------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| merge `feat/workspaces-phase-1` → `main` (deploy preparatório) | dono                  | ver ponto 6 abaixo                                       |
| aplicar W1 e W2 em produção                                    | dono, à mão           | backup verificado, aprovação do SQL                      |
| rodar W3 lote em produção                                      | dono                  | aprovação do backfill e ensaio aprovado                  |
| virada da flag (janela)                                        | dono                  | todos os gates do roadmap, inclusive Asaas ponta a ponta |
| desvirada                                                      | dono                  | condições C1 e C2 do contrato                            |
| W4 em produção                                                 | dono                  | período de observação aprovado                           |
| habilitar criação de Espaços e jornadas                        | dono                  | W4 aplicada e gate por jornada                           |

Agentes não acessam servidor, banco de produção, cópias `_rehearsal` nem backups.

## Pontos a decidir pelo dono

1. **W4 dentro ou fora da janela.** O ensaio aplica W4 na transação do corte; o roadmap lista na janela só drenagem, bloqueio, delta, validação e troca. **Recomendação:** W4 fora, depois de um período de observação, porque é a única forma de “desligar a flag” ser rollback. **Alternativa:** W4 na janela, aceitando que não há rollback pela flag desde a virada, só rollback de dados.
2. **Duração do período de observação** entre a virada e W4. Proposta: 7 dias sem incidente e com zero linhas do escopo com `workspace_id` nulo criadas depois da virada.
3. **Rollback pela flag exige cópia reversa e condições.** O roadmap diz que “o rollback de aplicação é apenas desligar a flag”. O contrato conclui que isso só vale com a cópia reversa do perfil, antes de W4 e sem Espaço não padrão. Aprovar essa redação mais estrita.
4. **Versão nova exige W1 e W2 na subida** (recomendado) **ou** projeção explícita para rodar sobre o schema atual. A primeira não atende ao pé da letra “igual a hoje quando as tabelas novas não existem”; a ordem migrar → implantar já é imposta pelo agente de deploy.
5. **Retomada das escritas separada da troca** (recomendado: o dono confere uma leitura pelas rotas v1 antes de liberar) **ou** retomada automática no `COMMIT` da troca.
6. **Quando a `main` recebe a Fase 1.** **Recomendação:** o PR final só entra depois do gate de migração (SQL aprovado, backup/restore, ensaio com volume real) e com o dono pronto para aplicar W1/W2 e implantar em seguida; a virada continua esperando todos os gates, inclusive Asaas. **Alternativa:** só mergear depois de todos os gates, inclusive Asaas, o que alonga a vida da branch de integração.
7. **Correção do delta W3.** O rascunho de ensaio não reconcilia perfis editados ou apagados, cursor de alerta nem preferência internacional entre o lote e a janela. Aprovar que o delta definitivo (unidade G) faça essa reconciliação, e que o ensaio seja refeito com ela.
8. **Ferramenta de corte em `psql` + `bash`** (recomendado, mesmo SQL do ensaio e sem Node no host) **ou** comando Node executado dentro do contêiner da aplicação.
9. **Novo código de erro `503 MAINTENANCE_IN_PROGRESS`** e o texto “Manutenção rápida em andamento. Tente de novo em alguns minutos.”
10. **Rotas novas exigem W4.** Criação de Espaços, rotas novas e jornadas só respondem depois de W4, o que coloca W4 dentro da Fase 1 antes do aceite de limites 1/5 e downgrade.
