# Flag de corte de Espaços v1 — rascunho

Data de atualização: 13 out. 2026
Status: **contrato vigente**. Em 13/10/2026 o dono aprovou as dez decisões do [plano de execução](../plans/hub-adaptativo-fase1-execucao.md#decisões-aprovadas-em-13102026) que afetam este contrato: W4 fora da janela, 7 dias de observação, rollback estrito, W1/W2 obrigatórias na subida, retomada separada, ferramenta em `psql` + `bash`, `503 MAINTENANCE_IN_PROGRESS` e rotas novas só depois de W4. O armazenamento e a porta de escrita são o desenho de referência para o código e podem ser refinados nos PRs, sem mudar as garantias. Nada aqui está implementado; nenhuma tabela, migração ou flag existe. O código da Fase 1 foi autorizado apenas desligado e sem migração em produção.

Referências: [roadmap v2 — Forma da troca](../plans/hub-adaptativo-roadmap-v2.md#forma-da-troca), [compatibilidade de `workspace_id`](../plans/hub-adaptativo-compatibilidade.md), [contrato de Espaços](./workspaces-v1.md), [flags de jornada](./feature-flags-v1.md), [ensaio W1–W4](../../ops/rehearsal/workspaces/README.md) e [plano de execução da Fase 1](../plans/hub-adaptativo-fase1-execucao.md).

## Decisão de partida

O dono decidiu em 13/10/2026: troca por **flag em runtime, com deploy preparatório**; virada atômica e sem reinício; rollback de aplicação = desligar a flag. `FEATURE_JOURNEYS` é lida do ambiente na subida e não serve para o corte.

Este contrato define onde o valor mora, como cada escrita o enxerga, como o dono vira e desvira, e **até onde desligar a flag é de fato um rollback**. A regra central, aprovada pelo dono em 13/10/2026, está em [Rollback pela flag](#rollback-pela-flag-e-seus-limites): desligar a flag só é rollback com a cópia reversa do perfil, antes de W4 e sem Espaço não padrão.

## Código atual que condiciona o desenho

- API e agendadores rodam no mesmo processo: em produção, `APP_ROLE: all` (`compose.macbook.yml`, branch `ops/macbook-worker`). `artifacts/api-server/src/app-role.ts` já admite `api` e `worker` separados; o mecanismo precisa servir aos dois.
- `jobs/job-lock.ts` serializa rotinas com `pg_try_advisory_lock(hashtextextended('licitai:job:<chave>', 0))` e audita em `job_run_audit`. Vários serviços já usam `pg_advisory_xact_lock` dentro de `db.transaction` (perfil em `ai/company-fit-service.ts`, buscas salvas em `account/notification-service.ts`, conta em `account/account-service.ts`).
- Muitas escritas do escopo não estão em transação hoje: são `insert`/`update` avulsos.
- O debounce de recomendações (`pendingRebuilds` em `recommendations/recommendation-service.ts`) vive em memória do processo.
- O ensaio executa delta W3, invariantes **e W4** na mesma transação, sob `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` (`run-rehearsal.sh`).

## Onde o valor mora

### Desenho de referência: tabela própria, só de inserção, no PostgreSQL

Uma tabela criada pela W1, `workspace_cutover_events`, guarda cada mudança de estado como uma linha nova. O estado vigente é a linha de maior `id`; **sem nenhuma linha, o estado é `legacy` com escritas liberadas**, por definição, e não como fallback de erro.

| coluna          | tipo                                                        | conteúdo                                                                                  |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`            | `bigserial` PK                                              | ordem das mudanças                                                                        |
| `mode`          | `text`, `CHECK (mode IN ('legacy','workspaces'))`           | qual modelo recebe as escritas                                                            |
| `writes_paused` | `boolean NOT NULL`                                          | mutações do escopo em manutenção                                                          |
| `actor`         | `text NOT NULL`, 1–80 caracteres                            | quem executou, informado pelo dono                                                        |
| `reason`        | `text NOT NULL`, 1–500 caracteres                           | motivo (`pause`, `cut`, `resume`, `abort`, `rollback`) e observação curta                 |
| `db_user`       | `text NOT NULL DEFAULT current_user`                        | usuário do PostgreSQL da sessão                                                           |
| `client_app`    | `text NOT NULL DEFAULT current_setting('application_name')` | ferramenta usada                                                                          |
| `details`       | `jsonb NOT NULL DEFAULT '{}'`                               | só contagens e tempos (linhas do delta, perfis copiados); nunca e-mail, nome, termo ou id |
| `created_at`    | `timestamptz NOT NULL DEFAULT clock_timestamp()`            | momento da mudança                                                                        |

Por que esta opção:

- a leitura acontece na mesma transação da mutação, então a virada pode ser atômica em relação às escritas (seção seguinte);
- API e worker, no mesmo processo ou separados, leem a mesma fonte, sem cache e sem reinício;
- a auditoria é a própria tabela, gravada na mesma transação da mudança;
- o `db-setup` de desenvolvimento (`push-force`) cria a tabela vazia, que já significa `legacy`; não depende de semente;
- a mudança pode entrar na mesma transação do delta e da validação do corte.

A aplicação **só lê** esta tabela. Nenhum caminho HTTP ou job grava nela; um teste deve garantir isso.

### Descartadas

| Opção                                                              | Por que não                                                                                                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| linha única mutável (`UPDATE` em `id = 1`)                         | exige semente na migração e no `push-force`; ausência da linha vira caso de erro; perde o histórico sem uma segunda tabela de auditoria                                                                    |
| ler com `SELECT ... FOR SHARE` na linha da flag                    | cada mutação gravaria um bloqueio na tupla (multixact) e sujaria a página; o bloqueio consultivo compartilhado faz o mesmo papel só em memória                                                             |
| reutilizar `job_run_audit` ou os advisory locks de `job-lock.ts`   | `job_run_audit` é registro operacional de execuções, com `CHECK` de status próprio; advisory lock não guarda valor, só exclusão — ele é usado aqui como mecanismo de sincronização, não como armazenamento |
| GUC do PostgreSQL (`ALTER DATABASE ... SET app.workspace_cutover`) | só vale para sessões novas; conexões do pool continuariam no valor antigo; não há virada atômica nem auditoria                                                                                             |
| arquivo ou sinal no host (`SIGHUP`)                                | cada processo relê em momento diferente; não participa da transação do delta; sem auditoria; exige acesso ao contêiner                                                                                     |
| variável de ambiente (`FEATURE_JOURNEYS` ou nova)                  | exige reinício; descartada pelo dono                                                                                                                                                                       |
| endpoint HTTP administrativo                                       | o produto não tem papel de administrador; abriria superfície de ataque para um comando que o dono executa poucas vezes                                                                                     |

## Porta de escrita: como cada mutação enxerga a flag

### Regra

Toda gravação em tabela do escopo passa por uma única porta de escrita (nome proposto: `withCutoverGate`), que executa, nesta ordem e em **instruções separadas**, dentro da mesma transação da mutação:

1. `BEGIN` (isolamento `READ COMMITTED`, o padrão do Drizzle; a porta deve recusar ser chamada dentro de transação `REPEATABLE READ` ou `SERIALIZABLE`);
2. bloqueio consultivo compartilhado na chave `hashtextextended('licitai:workspace-cutover', 0)`: requisições HTTP usam `pg_try_advisory_xact_lock_shared` (não esperam); jobs usam `pg_advisory_xact_lock_shared` com `SET LOCAL lock_timeout = '5s'`, para que um ciclo já iniciado — por exemplo, um envio de e-mail que registra a entrega depois de enviar — não falhe só porque a pausa ocupou o bloqueio por alguns milissegundos;
3. `SELECT mode, writes_paused FROM workspace_cutover_events ORDER BY id DESC LIMIT 1`;
4. a leitura e a gravação da mutação, já no modelo indicado por `mode`;
5. `COMMIT`.

Os passos 2 e 3 precisam ser instruções distintas: em `READ COMMITTED` o snapshot é tirado no início de cada instrução, e uma subconsulta na mesma instrução do bloqueio poderia ler o valor anterior à virada.

Toda mudança de estado (pausa, virada, retomada, aborto, desvirada) é feita por uma transação que obtém **o mesmo bloqueio em modo exclusivo** (`pg_advisory_xact_lock`, com `SET LOCAL lock_timeout = '5s'`) antes de inserir a linha nova.

Consequências:

- o bloqueio exclusivo só é concedido quando nenhuma mutação está em voo; mutações em voo terminam inteiramente no modo antigo;
- enquanto o exclusivo espera ou está concedido, o PostgreSQL faz novas requisições compartilhadas conflitarem com ele, então `pg_try_advisory_xact_lock_shared` devolve `false` de imediato e a espera dos jobs fica na fila, sem furá-la;
- depois do `COMMIT` da mudança, qualquer mutação nova lê o estado novo. Não existe intervalo em que uma requisição grave no legado depois que outra gravou no modelo novo.

### Quando a porta recusa

| Situação                                                             | Requisição HTTP                                                          | Rotina ou job                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| bloqueio compartilhado indisponível (mudança de estado em andamento) | `503 MAINTENANCE_IN_PROGRESS`, `Retry-After: 60`, nada gravado           | espera até 5 s; estourando, o ciclo falha com o erro de `lock_timeout` e é auditado como `failed` |
| `writes_paused = true`                                               | `503 MAINTENANCE_IN_PROGRESS`, `Retry-After: 60`, nada gravado           | permitido só a ciclo já iniciado antes da pausa (ver jobs); ciclo novo não começa                 |
| `mode` diferente do modo em que o job leu seus insumos               | não se aplica                                                            | descarta o resultado, registra `warn` e reprograma sem consumir tentativa                         |
| erro ao ler a tabela (qualquer erro do PostgreSQL)                   | propaga como erro da requisição (500 com `requestId`), sem escolher modo | propaga; o ciclo falha e é auditado como `failed`                                                 |

`MAINTENANCE_IN_PROGRESS` (aprovado em 13/10/2026) é um código novo no envelope v1 `{ error: { code, message, requestId } }`; a UI mostra “Manutenção rápida em andamento. Tente de novo em alguns minutos.” Busca, detalhe e demais leituras nunca recebem esse código.

### Leituras

Leituras do escopo leem `mode` com uma consulta simples, sem bloqueio, no início do tratamento. Uma leitura que começou antes da virada pode devolver o estado legado até terminar; como o legado continua íntegro até o instante da virada, a resposta é coerente. Não há cache do estado em memória: cada requisição consulta o banco.

### Escopo da porta

Passam pela porta todas as gravações em: `users` quando cria conta ou altera `show_international_opportunities`; `company_profiles`; `company_tender_fits`; `saved_tenders`; `saved_searches`; `notifications`; `email_deliveries`; `email_delivery_notifications`; `recommendation_events`; `recommendation_dismissals`; `recommendation_interest_profiles`; `user_recommendations`; `ai_jobs` do tipo `fit`; e as tabelas novas da W1. A exclusão de conta também passa pela porta e remove os dois modelos na mesma transação. A exportação é uma leitura deliberadamente fora da porta: consulta os dois modelos em qualquer modo, inclusive durante a pausa, para que a desvirada nunca esconda dados do titular.

Criação de conta passa pela porta em qualquer modo: no modo `workspaces`, cria Espaço padrão, membership `owner` e preferência ativa na mesma transação; no modo `legacy`, cria só o usuário, e o delta seguinte o atribui.

Ficam fora: catálogo (`tenders`, `cultural_opportunities`, índices e documentos de IA), sessões, cobrança, `ai_ask_requests`, cotas de IA e `job_run_audit`.

### Restrições para quem escreve código atrás da porta

- nenhuma chamada externa (IA, e-mail, HTTP) dentro da transação com porta; a transação deve ser curta, porque a mudança de estado espera no máximo 5 s;
- ler-modificar-gravar acontece inteiro dentro da transação (ex.: `putCompanyProfile` já lê o perfil dentro da transação; o adaptador mantém isso);
- nenhum `UPDATE`/`INSERT`/`DELETE` em tabela do escopo fora da porta. Um teste estático lista os módulos que importam as tabelas do escopo e falha se algum gravar sem a porta.

### Custo por requisição

Por mutação: um `BEGIN`/`COMMIT` onde hoje não há transação, mais duas instruções curtas (bloqueio consultivo em memória e leitura de uma linha por índice da PK). Na rede Docker local, espera-se menos de 1 ms somado; o número real é medido no ensaio. A conexão do pool fica presa durante a transação inteira, o que já acontece nas mutações transacionais de hoje. Por leitura do escopo: uma consulta adicional de uma linha.

## Jobs e agendadores

Os agendadores de `startSchedulers` rodam no processo com `runsJobs` (`all` ou `worker`). Como o estado mora no banco, os dois papéis enxergam a mesma virada, sem cache local.

Regras:

1. **Início de ciclo.** Cada rotina do escopo (lista em [Rotinas a drenar ou pausar](../plans/hub-adaptativo-roadmap-v2.md#rotinas-a-drenar-ou-pausar)) lê o estado antes de começar. Com `writes_paused = true`, não começa o ciclo e registra `info`. A fila de IA não reivindica jobs `fit` enquanto as escritas estiverem pausadas.
2. **Ciclo já iniciado.** Um ciclo que começou antes da pausa pode concluir suas gravações: a porta, para jobs, só exige que `mode` seja o mesmo lido no início do ciclo. É isso que permite drenar sem cortar no meio rotinas com efeito externo, como o envio de e-mail, que registra a entrega depois de enviar.
3. **Mudança de modo durante o ciclo.** Se `mode` mudou entre o início do ciclo e a gravação, o ciclo descarta o resultado, registra `warn` e termina. Com a drenagem correta isso não acontece; é a rede de proteção.
4. **Job enfileirado antes da virada.** Jobs `fit` com `workspace_id` nulo são atribuídos pelo delta da janela (o rascunho W3 já faz isso). No modo `workspaces`, o worker lê o Espaço da coluna, revalida membership e perfil; job `fit` sem Espaço nesse modo falha com erro explícito (`fit job without workspace_id after cutover`) e vai para `dead`, nunca é ignorado.
5. **Debounce em memória.** O `pendingRebuilds` de recomendações dispara depois da virada como um ciclo novo; ao executar, passa pela regra 1 e lê o modo vigente.
   **Exceção aprovada pelo dono em 13/10/2026 — coleta de editais.** A coleta grava o catálogo, que está fora do escopo, e só toma a porta por edital, quando o edital alterado tem alguém monitorando. Durante a pausa, esse passo recusa (`CutoverPausedError`): a transação daquele edital é desfeita e a coleta em andamento falha ali, em vez de concluir como diz a regra 2. Ela é retomável e a coleta seguinte encontra a mesma mudança, então nenhuma notificação se perde; a troca encurta a drenagem. A coleta de edital sem monitoramento não toma bloqueio nem lê a flag.

6. **Drenagem observável.** O fim da drenagem é provado por consulta: nenhuma linha `running` em `job_run_audit` para as chaves do escopo e nenhum `ai_jobs` `fit` com `status = 'running'`. Passou de 3 min, aborta.

## Como o dono vira, desvira e confere

Alteração em produção é sempre do dono. A ferramenta é um conjunto de scripts `psql` + `bash` (decisão de 13/10/2026), no mesmo formato do ensaio (`ops/rehearsal/workspaces/run-rehearsal.sh`), para que o SQL medido no ensaio seja o mesmo executado em produção e o servidor não precise de Node no host. Ela será entregue na unidade G do [plano de execução](../plans/hub-adaptativo-fase1-execucao.md); os comandos abaixo são a interface prevista, não comandos existentes.

| Comando previsto                     | O que faz                                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cutover.sh status`                  | estado vigente, últimas mudanças, W4 aplicada ou não, Espaços não padrão existentes, linhas com `workspace_id` nulo criadas depois da última virada                              |
| `cutover.sh pause --actor <nome>`    | insere `mode` atual + `writes_paused = true`; inicia o cronômetro da janela                                                                                                      |
| `cutover.sh cut --actor <nome>`      | aguarda a drenagem, abre a transação de corte (bloqueio, delta, validação) e insere `mode = 'workspaces'` mantendo as escritas pausadas; aborta sozinho pelos gatilhos aprovados |
| `cutover.sh resume --actor <nome>`   | insere o modo vigente com `writes_paused = false`, depois da conferência de leitura pelo dono                                                                                    |
| `cutover.sh abort --actor <nome>`    | `ROLLBACK` da transação de corte em curso, se houver, e insere `mode = 'legacy'`, `writes_paused = false`                                                                        |
| `cutover.sh rollback --actor <nome>` | desvirada: recusa se as condições de segurança não valerem; senão pausa, drena, e faz cópia reversa e `mode = 'legacy'` na mesma transação                                       |

Execução no servidor atual, como no ensaio: um contêiner cliente descartável `postgres:16` com `--network container:licita-macbook-postgres-1`, senha lida por `read -rs` e URL em variável de ambiente, nunca colada na linha de comando.

SQL equivalente para emergência, se a ferramenta falhar — só a mudança de estado, sem delta nem cópia reversa, e portanto só válido para `pause`, `resume` e `abort` antes da virada:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('licitai:workspace-cutover', 0));
INSERT INTO workspace_cutover_events (mode, writes_paused, actor, reason)
VALUES ('legacy', false, '<nome>', 'abort: <motivo>');
COMMIT;
```

Conferir sem reinício: `cutover.sh status` ou, direto,

```sql
SELECT id, mode, writes_paused, actor, reason, created_at
FROM workspace_cutover_events ORDER BY id DESC LIMIT 5;
```

Uma métrica Prometheus do modo no `METRICS_PORT` privado é opcional e só entra se o dono quiser alerta automático.

## Propagação e requisições em voo

Como não há cache, a propagação é o próprio `COMMIT` da mudança. O que o ensaio precisa medir:

1. espera pelo bloqueio exclusivo na pausa e na virada (= a mutação em voo mais longa no instante);
2. intervalo entre o `COMMIT` da virada e a primeira gravação com `workspace_id` vinda do adaptador;
3. quantidade de `503 MAINTENANCE_IN_PROGRESS` por minuto durante a janela;
4. latência p95 das mutações fora da janela com a porta ativa, comparada com o baseline sem porta;
5. tempo da desvirada com cópia reversa, que entra no `ponto_aborto = janela_max − rollback de aplicação`.

Isso exige uma instância da aplicação nova apontando para a cópia `_rehearsal`, com carga sintética e com envio de e-mail, IA, coletas e Asaas desligados. O ensaio atual só mede SQL; a extensão é parte da unidade G.

Requisições em voo:

| Momento da requisição                      | Resultado                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| mutação com bloqueio obtido antes da pausa | termina no modo antigo; a pausa espera por ela (até 5 s, senão a pausa falha e nada muda) |
| mutação que chega durante pausa ou corte   | `503 MAINTENANCE_IN_PROGRESS` imediato                                                    |
| mutação que chega depois da retomada       | grava no modo novo                                                                        |
| leitura que atravessa a virada             | responde com o estado que leu no início; não grava                                        |
| ciclo de job iniciado antes da pausa       | conclui no modo antigo durante a drenagem; se não terminar em 3 min, o corte aborta       |

## Rollback pela flag e seus limites

**Desligar a flag, sozinho, deixa de ser rollback seguro na primeira gravação depois da retomada.** Sem escrita dupla, o perfil diverge a partir daí. A desvirada é segura somente com a cópia reversa abaixo e somente enquanto valerem duas condições:

- **C1 — W4 não aplicada.** W4 troca as chaves de `(user_id, …)` para `(workspace_id, …)`, aplica `NOT NULL` e remove os índices de unicidade legados. O caminho legado grava `workspace_id` nulo e usa `ON CONFLICT` nas chaves antigas; depois de W4 ele falha em toda gravação.
- **C2 — só existe o Espaço padrão.** Com dois Espaços, o legado (que filtra só por `user_id`) mistura recursos dos dois, e a chave legada `(user_id, tender_id)` não comporta o mesmo edital salvo duas vezes. Consequência: criação de Espaços, rotas novas e jornadas ficam desligadas até W4.

`cutover.sh rollback` confere C1 (ausência das constraints de W4 em `pg_constraint`) e C2 (`SELECT count(*) FROM workspaces WHERE NOT is_default` = 0) e recusa se qualquer uma falhar.

### Tabela a tabela

| Estrutura                                                                                                        | Depois da virada                                               | Visão do legado após desvirar                                                                                                       | Diverge?                        | Procedimento de volta                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `company_profiles` ↔ `workspace_profiles` + `workspace_profile_signals`                                          | adaptador v1 grava só em `workspace_profiles`                  | `company_profiles` parado no instante da virada                                                                                     | **sim**                         | cópia reversa do perfil do Espaço padrão (abaixo)                                                         |
| `last_alert_at` do perfil                                                                                        | cursor avança em `workspace_profiles`                          | cursor antigo reenviaria alertas                                                                                                    | **sim**                         | parte da cópia reversa                                                                                    |
| `users.show_international_opportunities` ↔ `workspaces.show_international_opportunities`                         | preferência gravada no Espaço                                  | valor antigo em `users`                                                                                                             | **sim**                         | copiar do Espaço padrão para `users` na mesma transação                                                   |
| `company_profiles` apagado depois da virada                                                                      | `DELETE` remove o perfil do Espaço                             | perfil antigo ressuscitaria                                                                                                         | **sim**                         | a cópia reversa apaga `company_profiles` e as afinidades do usuário quando o Espaço padrão não tem perfil |
| `workspaces`, `workspace_members`, `user_workspace_preferences`                                                  | criados no corte e na criação de conta                         | ignorados pelo legado                                                                                                               | não                             | ficam como estão; são reconciliados na próxima virada                                                     |
| `company_tender_fits`                                                                                            | linhas novas com `workspace_id` e `profile_version` do Espaço  | legado lê por `(user_id, profile_version, …)`; válido porque a cópia reversa alinha `version` à `profile_version`, que é monotônica | não, com a cópia reversa        | nenhum                                                                                                    |
| `saved_tenders` (participação, etapa, checklist)                                                                 | mesmas linhas, com `workspace_id` preenchido                   | lê por `user_id`; PK `(user_id, tender_id)` intacta antes de W4                                                                     | não                             | nenhum                                                                                                    |
| `saved_searches`                                                                                                 | mesmas linhas, com `workspace_id`                              | unicidade ativa `(user_id, query)` intacta antes de W4                                                                              | não                             | nenhum                                                                                                    |
| `notifications`, `email_deliveries`, `email_delivery_notifications`                                              | linhas com `workspace_id`                                      | dedupe legado continua valendo **se** o texto de `dedupe_key` não mudar                                                             | não, com regra                  | antes de W4, o modelo novo usa as mesmas strings de `dedupe_key` do legado no Espaço padrão               |
| `recommendation_events`, `recommendation_dismissals`, `recommendation_interest_profiles`, `user_recommendations` | linhas com `workspace_id`                                      | PKs legadas intactas antes de W4                                                                                                    | não                             | nenhum                                                                                                    |
| `ai_jobs` (`fit`)                                                                                                | jobs com `workspace_id` e, se houver, `workspaceId` no payload | worker legado ignora a coluna; o payload novo precisa ser aditivo e aceito pelo parser legado                                       | não, com regra                  | a desvirada só roda com a fila `fit` drenada                                                              |
| linhas gravadas pelo legado depois da desvirada                                                                  | não se aplica                                                  | `workspace_id` nulo                                                                                                                 | —                               | a próxima virada as atribui no delta                                                                      |
| constraints de W4                                                                                                | aplicadas em passo separado (ver abaixo)                       | legado falha em toda gravação                                                                                                       | **sim, irreversível pela flag** | só rollback de dados ou reversão de W4 com aplicação parada                                               |

### Cópia reversa

Executada por `cutover.sh rollback`, na mesma transação que obtém o bloqueio exclusivo e insere `mode = 'legacy'`, com as escritas pausadas e a fila `fit` drenada. Não é escrita dupla: é uma cópia única, determinística e auditada, feita só na desvirada.

1. para todo Espaço padrão com perfil — todos, e não só os alterados, para não depender de `updated_at` em gravações como o avanço do cursor de alerta: converter `answers` de volta para as colunas de `company_profiles` pela inversa do mapeamento de [`workspace-profiles-v1.md`](./workspace-profiles-v1.md#compatibilidade-com-company_profiles), com `version = profile_version`, `updated_at` e `last_alert_at` do Espaço; criar a linha se o perfil nasceu depois da virada;
2. para cada Espaço padrão sem perfil cujo usuário tem `company_profiles`: apagar o perfil legado e as afinidades do usuário, repetindo o `deleteCompanyProfile` atual;
3. copiar `show_international_opportunities` do Espaço padrão para `users`;
4. registrar em `details` só as contagens de cada passo;
5. falhar a transação inteira se algum perfil tiver resposta sem coluna correspondente no legado (`buyerTypes`, `modalities` ou outro campo novo). Com C2 e as rotas novas desligadas, isso não deve ocorrer; se ocorrer, a desvirada para e o dono decide.

A conversão de ida (W3) e a inversa precisam ser testadas como par: perfil legado → Espaço → legado devolve o mesmo registro, campo a campo, inclusive nulos e listas vazias.

### Virar de novo depois de uma desvirada

Requer a janela completa outra vez, com uma etapa a mais no delta: reconverter os perfis legados alterados depois da desvirada (`company_profiles.updated_at` posterior), apagar perfis de Espaço cujo legado foi apagado, recopiar `show_international_opportunities` e regenerar os sinais. `revision` sobe uma unidade em cada perfil reconvertido; `profile_version` passa a ser o maior entre o legado e o Espaço.

**Delta definitivo (decisão de 13/10/2026):** o delta do rascunho `w3_backfill.sql` usa `ON CONFLICT DO NOTHING` em `workspace_profiles`, `workspaces` e sinais. Por isso, não captura perfis editados, apagados ou com cursor de alerta avançado entre o lote e a janela, nem mudança de `show_international_opportunities`. O delta definitivo faz essa reconciliação já na primeira virada, porque os alertas de perfil e as edições continuam acontecendo entre o lote e as 03:30. O ensaio é refeito com o delta definitivo, e o ensaio no servidor fica suspenso até lá.

### Regra para W4

Decisões de 13/10/2026: W4 fica fora da janela de corte e vira um passo próprio, com segunda janela curta em produção. Ela só é aplicada depois de **7 dias de observação** com a flag ligada, sem incidente. Durante a observação:

- a desvirada pela flag continua disponível (C1);
- `cutover.sh status` e uma consulta diária confirmam zero linhas do escopo com `workspace_id` nulo criadas depois da virada; qualquer linha nula indica gravação fora da porta, conta como incidente e bloqueia W4;
- criação de Espaços, rotas novas e jornadas continuam desligadas (C2). Elas só respondem depois de W4.

Aplicar W4 é o **ponto sem volta pela flag**. Daí em diante restam rollback de dados (restaurar backup e reconciliar gravações posteriores) ou correção para frente. A segunda janela existe porque `SET NOT NULL` e a troca de PK tomam `ACCESS EXCLUSIVE` nas tabelas, inclusive `saved_tenders`, lida pela busca com `includeMonitored`.

O rascunho de ensaio atual ainda aplica W4 dentro da transação do corte; a versão definitiva (unidade G do [plano de execução](../plans/hub-adaptativo-fase1-execucao.md)) separa os dois passos.

## Relação com W1–W4 e com a janela

| Passo                     | Onde a flag está                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------- |
| W1                        | cria `workspace_cutover_events` vazia, junto com as tabelas de Espaços. Vazia = `legacy`              |
| W2                        | colunas `workspace_id` anuláveis e índices; a flag não muda                                           |
| deploy preparatório       | aplicação com a porta, os adaptadores e o leitor da flag, em `legacy`. Comportamento igual ao de hoje |
| W3 lote                   | fora da janela, com a aplicação em `legacy`; o legado continua sendo a fonte                          |
| janela (W3 delta + troca) | pausa → drenagem → transação de corte → conferência → retomada                                        |
| observação                | `workspaces`, desvirada possível                                                                      |
| W4                        | segunda janela, depois de 7 dias de observação; fim da desvirada pela flag; libera rotas novas        |

O deploy preparatório contém: migrações W1 e W2 (aplicadas à mão pelo dono antes do deploy), schema Drizzle correspondente, porta de escrita em todas as gravações do escopo, adaptadores v1 com os dois caminhos, jobs com a regra de ciclo, exportação e exclusão cobrindo os dois modelos e a ferramenta `cutover.sh`. Não contém W3, W4, nem rotas novas ou jornadas ligadas.

Ordem exata na janela, a partir dos parâmetros aprovados (início 03:30, teto de 15 min, ponto de não retorno T+10 min, drenagem até 3 min, `lock_timeout` 5 s):

1. **T0 — pausa.** `cutover.sh pause`: bloqueio exclusivo, linha com `writes_paused = true`. A partir daqui, mutações do escopo respondem `503` e nenhum ciclo novo começa.
2. **Drenagem.** A ferramenta consulta `job_run_audit` e `ai_jobs` até não haver ciclo `running` no escopo. Mais de 3 min: aborta.
3. **Bloqueio.** Na transação de corte: `SET LOCAL lock_timeout = '5s'`, bloqueio consultivo exclusivo, depois `LOCK TABLE ... IN SHARE ROW EXCLUSIVE MODE` nas tabelas do escopo, como rede de proteção contra gravação fora da porta.
4. **Delta.** W3 delta mais a reconciliação de perfis descrita acima.
5. **Validação.** Invariantes do ensaio com tolerância zero e verificação do ponto de não retorno.
6. **Troca.** Na mesma transação: linha `mode = 'workspaces'`, `writes_paused = true`; `COMMIT`.
7. **Conferência.** O dono faz uma leitura autenticada pelas rotas v1 (perfil, salvos, notificações) e `cutover.sh status`.
8. **Retomada.** `cutover.sh resume`. O cronômetro da janela para aqui.

Aborto antes do passo 6: `ROLLBACK` e linha `legacy`, `writes_paused = false`. Problema entre 6 e 8: `cutover.sh rollback`, rápido porque nada foi gravado no modelo novo.

A retomada é sempre separada da troca (decisão de 13/10/2026): as escritas só voltam depois que o dono confere a leitura no passo 7. Retomar no `COMMIT` da troca foi descartado.

## Comportamento com a flag desligada

Com `mode = 'legacy'` (ou tabela vazia), a versão nova executa exatamente os caminhos de hoje para leitura e gravação. As diferenças observáveis se limitam a:

- mutações do escopo passam a rodar em transação, com as duas instruções da porta;
- um `503 MAINTENANCE_IN_PROGRESS` possível, só durante pausa ou mudança de estado;
- jobs leem o estado no início do ciclo.

Payloads, códigos de erro existentes, gates de assinatura e textos da UI não mudam.

**Tabelas e colunas novas ausentes.** O schema Drizzle da versão nova declara `workspace_id` nas tabelas do escopo, e várias consultas atuais usam `select()` ou `returning()` sem projeção (`account/account-privacy-service.ts`, `account/account-service.ts`, `account/notification-service.ts`, entre outros). Contra um banco sem W2, essas consultas pediriam uma coluna inexistente e falhariam.

Regra (decisão de 13/10/2026): **a versão nova exige W1 e W2 aplicadas.** Na subida, uma verificação confere a tabela da flag e as colunas `workspace_id` e, se faltar algo, encerra o processo com erro listando o que falta. A ordem migrar → implantar já é imposta pelo agente de deploy do servidor, que para quando o pull contém `lib/db/migrations/` ou `lib/db/src/schema/`. A mesma verificação existe como comando para o dono rodar antes do deploy. Foi descartada a projeção explícita em toda consulta legada para rodar sobre o schema de hoje.

Antes de W1 e W2 em produção, quem roda é a versão atual, que tolera colunas e tabelas aditivas: não as lê e grava `workspace_id` nulo.

## Matriz de testes

Testes de integração com PostgreSQL temporário (`PNCP_TEST_DATABASE_URL`), salvo indicação.

| Cenário                                   | Como                                                                                                        | Esperado                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tabela da flag vazia                      | subir com o banco do `push-force`                                                                           | modo `legacy`; rotas v1 com payload idêntico ao de hoje                                                                                                                    |
| tabela ou colunas ausentes                | banco com migrações até a 0041                                                                              | verificação de subida falha e lista o que falta; nenhuma requisição é atendida em modo indefinido                                                                          |
| erro de leitura da flag                   | revogar `SELECT` na tabela durante o teste                                                                  | mutação responde 500 com `requestId`; nada gravado; erro no log                                                                                                            |
| virada sob concorrência                   | N clientes salvando, editando perfil e marcando notificações em paralelo, enquanto outra conexão vira       | toda linha gravada antes do `COMMIT` da virada está no legado e foi atribuída pelo delta; toda linha depois tem `workspace_id`; nenhuma linha legada nova depois da virada |
| mutação durante a transação de virada     | uma conexão abre a virada e para antes do `COMMIT`; outra tenta mutar; nova mutação depois da retomada      | a primeira recebe `503` sem esperar; a segunda grava no modo novo                                                                                                          |
| ordem das instruções da porta             | teste unitário com cliente falso que registra as instruções                                                 | bloqueio compartilhado e leitura do modo saem em instruções separadas, nessa ordem, antes de qualquer gravação                                                             |
| mutação em voo na pausa                   | transação de mutação aberta e parada; pausa com `lock_timeout` 5 s                                          | pausa espera e conclui depois do `COMMIT` da mutação; com a mutação parada além de 5 s, a pausa falha e o estado não muda                                                  |
| mutação durante pausa                     | `PUT /api/v1/me/saved-tenders/...` com `writes_paused = true`                                               | `503 MAINTENANCE_IN_PROGRESS`, `Retry-After`; nada gravado                                                                                                                 |
| leitura durante pausa                     | busca, detalhe e `GET` v1                                                                                   | `200`, sem diferença                                                                                                                                                       |
| job enfileirado antes da virada           | `ai_jobs` `fit` com `workspace_id` nulo, delta, virada, worker                                              | delta atribui o Espaço; worker revalida e grava com `workspace_id`                                                                                                         |
| job `fit` sem Espaço depois da virada     | inserir job nulo após a virada                                                                              | job vai para `dead` com erro explícito; nada gravado                                                                                                                       |
| ciclo de job atravessando mudança de modo | rotina lê insumos, virada acontece, rotina grava                                                            | resultado descartado, `warn` registrado, nada gravado                                                                                                                      |
| ciclo novo durante pausa                  | disparar agendadores com `writes_paused = true`                                                             | nenhum ciclo do escopo começa; rotinas fora do escopo seguem                                                                                                               |
| API e worker separados                    | dois processos (`APP_ROLE=api` e `worker`) no mesmo banco                                                   | ambos mudam de modo no mesmo `COMMIT`                                                                                                                                      |
| desvirada com cópia reversa               | editar perfil, apagar perfil, criar conta nova e mudar preferência internacional depois da virada; desvirar | `company_profiles`, `users.show_international_opportunities` e `last_alert_at` iguais ao Espaço padrão; rotas v1 devolvem o mesmo payload de antes da desvirada            |
| ida e volta do perfil                     | fixtures de perfil legado (nulos, listas vazias, raio, municípios)                                          | legado → Espaço → legado devolve o mesmo registro                                                                                                                          |
| desvirada recusada                        | com W4 aplicada; com um Espaço não padrão                                                                   | ferramenta recusa e não altera nada                                                                                                                                        |
| nova virada após desvirada                | gravar no legado, virar de novo                                                                             | delta atribui as linhas nulas e reconcilia perfis; invariantes verdes                                                                                                      |
| afinidade depois da desvirada             | gerar fit no modo novo, desvirar, editar perfil no legado                                                   | cache não reaproveita fit de outro conteúdo (`version` monotônica)                                                                                                         |
| dedupe de notificação e e-mail            | mesma notificação antes e depois da virada e da desvirada                                                   | nenhum envio duplicado                                                                                                                                                     |
| exportação e exclusão                     | em `legacy` e em `workspaces`, com tabelas novas povoadas                                                   | exportação inclui os dois modelos; exclusão de conta remove tudo                                                                                                           |
| auditoria                                 | cada comando da ferramenta                                                                                  | uma linha por mudança com `actor`, `reason`, `db_user` e só contagens em `details`                                                                                         |
| aplicação não grava na tabela da flag     | teste estático                                                                                              | nenhum módulo da API faz `INSERT`/`UPDATE`/`DELETE` em `workspace_cutover_events`                                                                                          |
| gravação fora da porta                    | teste estático sobre módulos que importam tabelas do escopo                                                 | falha se houver gravação sem a porta                                                                                                                                       |

Só o ensaio no servidor prova: tempos de bloqueio, drenagem, delta, validação, troca e desvirada com volume real; latência p95 das mutações com a porta; e o comportamento sob a taxa real de mutações.

## O que este contrato não autoriza

Nenhuma migração em produção, virada da flag ou ativação de jornada. Tudo isso é do dono, depois dos gates do [roadmap](../plans/hub-adaptativo-roadmap-v2.md#gates-de-aprovação): Asaas ponta a ponta, ensaio do corte no servidor, aprovação do SQL e do backfill.
