# Ensaio do corte de Espaços (W1–W4)

> **Rascunhos exclusivos para ensaio. Não são migrações aprovadas e não autorizam a Fase 1.**

Esta pasta é deliberadamente independente de `lib/db/migrations`, do schema Drizzle e do código da aplicação. Ela serve para o dono restaurar um backup em um banco descartável no próprio servidor, medir W1–W4 e compartilhar apenas os relatórios sanitizados. Não execute estes arquivos no banco de produção, em réplica de produção, nem no banco usado pela aplicação.

## Conteúdo e ordem

| arquivo | função |
|---|---|
| `w1_foundation.sql` | tabelas aditivas de Espaços, owner, perfil, sinais, preferência ativa e checkpoints do ensaio |
| `w2_scope_expand.sql` | colunas anuláveis e FKs `NOT VALID` nas tabelas contextuais reais |
| `w2_scope_expand_indexes.sql` | índices concorrentes, obrigatoriamente fora de transação |
| `w3_backfill.sql` | passe `batch` por faixa e passe `delta`; ids determinísticos e `ON CONFLICT DO NOTHING` |
| `w4_enforce.sql` | prova invariantes, valida FKs e só então aplica `NOT NULL` e chaves por Espaço |
| `*_rollback.sql` | reversões mensuráveis de cada etapa, na ordem W4 → W3 → W2 → W1 |
| `run-rehearsal.sh` | orquestra preflight, lote, corte simulado, relatório e rollback opcional |
| `test-rehearsal.sh` | teste destrutivo somente em bancos temporários próprios, com dados fictícios |

Os helpers `rehearsal_metrics.sql`, `rehearsal_invariants.sql` e `rehearsal_cut_gate.sql` pertencem somente à ferramenta. Nenhum deles é candidato a migração.

## Pré-requisitos e guardas

- PostgreSQL 16, igual ao `docker-compose.yml`, e cliente `psql` compatível;
- `bash` e acesso de rede do servidor ao PostgreSQL; Node e pnpm não são necessários no servidor;
- backup concluído e restore previamente verificado pelo dono;
- espaço livre para uma cópia isolada e para os índices concorrentes;
- banco alvo com nome terminado literalmente em `_rehearsal`;
- `REHEARSAL_CONFIRM` exatamente igual ao nome resolvido pelo PostgreSQL;
- `REHEARSAL_DATABASE_URL` diferente de `DATABASE_URL`.

O script não carrega `.env`, não conhece credenciais de produção e não imprime a URL. A taxa sintética fica desligada por padrão. O relatório não contém hash agregado, timestamp de marco, e-mail, nome, termo, texto, id de usuário/edital ou qualquer linha.

## Restauração isolada pelo dono

Os comandos abaixo são exemplos; **o dono os executa no servidor** e substitui nomes, host, porta, usuário e caminho. Não reutilize o banco da aplicação.

```bash
createdb --host=127.0.0.1 --port=5432 --username=licita licita_spaces_01_rehearsal
pg_restore \
  --host=127.0.0.1 --port=5432 --username=licita \
  --dbname=licita_spaces_01_rehearsal \
  --clean --if-exists --no-owner --exit-on-error \
  /caminho/backup-validado.dump
```

Para dump SQL texto, use `psql --dbname=... --file=...` em vez de `pg_restore`. Confirme que nenhum processo da aplicação aponta para o banco restaurado. O restore é parte do ensaio, mas seu tempo não entra na janela de corte.

## Execução

```bash
export REHEARSAL_DATABASE_URL='postgres://usuario:senha@127.0.0.1:5432/licita_spaces_01_rehearsal'
export REHEARSAL_CONFIRM='licita_spaces_01_rehearsal'
unset DATABASE_URL

ops/rehearsal/workspaces/run-rehearsal.sh --rollback \
  --report-dir /caminho/seguro/relatorios-ensaio-01
```

Parâmetros opcionais:

- `REHEARSAL_BATCH_SIZE` (padrão `500`): usuários por faixa do lote;
- `REHEARSAL_POINT_OF_NO_RETURN_SECONDS` (padrão `600`): T+10 min inicial;
- `REHEARSAL_EXPECTED_DELTA_ROWS` (padrão `0`, gate desabilitado): expectativa calculada a partir da taxa real lida pelo dono nos logs; o gate aborta acima de 3×;
- `REHEARSAL_PUBLIC_ERROR_PERCENT` e `REHEARSAL_PUBLIC_P95_RATIO`: observações externas passadas pelo dono; abortam acima de 1% e 2×, respectivamente;
- `REHEARSAL_DRAIN_SECONDS` (padrão `0`): duração observada externamente da drenagem; aborta acima de 180 s. A ferramenta não drena processos por conta própria;
- `REHEARSAL_SYNTHETIC_RATE_PER_MINUTE` (padrão `0`): grava usuários, buscas e notificações exclusivamente fictícios e marcados durante o lote. Use apenas na cópia descartável. Com `--rollback`, essas linhas são removidas pelo prefixo exclusivo da execução.

O modo de aborto deliberado para comprovar que a troca não ocorreu é:

```bash
ops/rehearsal/workspaces/run-rehearsal.sh --abort-drill --rollback \
  --report-dir /caminho/seguro/relatorios-aborto
```

O abort drill chega ao lock e executa `ROLLBACK` antes do delta/enforcement. O legado permanece fonte e conteúdo; com `--rollback`, as estruturas aditivas também são removidas.

## Duas execuções e cálculo da janela

Faça dois restores independentes do mesmo backup, em bancos diferentes terminados em `_rehearsal`, e rode a ferramenta uma vez em cada cópia. Não use a segunda execução sobre o schema já modificado pela primeira. Guarde o pior valor de cada etapa e especialmente a soma `drenagem + bloqueio + delta + validação + troca`.

Use os parâmetros do roadmap:

```text
janela_max   = min(15 min, 2 × pior ensaio)
ponto_aborto = janela_max − tempo medido do rollback de aplicação
```

O relatório traz `lock_wait_ms`, `delta_rows`, durações por etapa, volume inicial, reconciliação e cada invariante com tolerância zero. Qualquer falha, lock acima de 5 s, delta acima de 3× o previsto, chegada ao ponto de não retorno ou gate externo de leitura reprova o corte. Use o pior ensaio, não a média.

## Decisões de SQL a validar

1. **IDs:** o rascunho usa `ws_ || md5('pardal-digital:procurement:' || user_id)`. É repetível e não exige extensão, mas o formato opaco definitivo precisa de aprovação.
2. **Perfil e revisão:** `profile_version` e `revision` começam no `company_profiles.version`; isso preserva a versão e produz revisão inicial determinística. Perfil ausente não cria `workspace_profiles` e deixa onboarding `not_started`.
3. **Municípios:** o legado persiste somente o código IBGE; nome/UF são hoje enriquecidos por JSON dentro da aplicação. Como o servidor de ensaio deve usar só `bash` + `psql`, o rascunho preserva o código, infere a UF pelo prefixo IBGE e usa o próprio código como nome estrutural. Alternativa preferida para o SQL definitivo: carregar uma tabela versionada oficial ou materializar o mesmo catálogo da Fase 0 no banco antes do backfill.
4. **Entregas de e-mail:** apenas entregas ligadas a notificações recebem Espaço. Entregas estritamente de conta continuam nulas. A relação entrega/notificação é obrigatoriamente contextual e fica `NOT NULL`.
5. **Jobs:** apenas `ai_jobs.kind = 'fit'` recebe Espaço e passa a ser protegido por `CHECK`; indexação, OCR, ficha, resumo e título permanecem globais.
6. **Afinidade:** `recommendation_interest_profiles` é copiado como afinidade legada; o JSON não é recalculado e não vira elegibilidade.
7. **Preferência:** o ativo fica em `user_workspace_preferences` com `ON DELETE SET NULL`; a última seleção por Espaço fica em `workspace_members.last_selected_at`.
8. **FKs de recursos contextuais:** o rascunho usa `ON DELETE CASCADE`; jobs globais e entregas de conta usam `SET NULL`. A política definitiva deve passar pelo gate LGPD e de retries.
9. **Diferença do inventário:** `email_delivery_notifications` não tem `user_id`; W3 deriva e valida o Espaço por notificação + entrega. `company_profiles` não recebe `workspace_id`, pois continua legado somente leitura após a troca e é convertido para `workspace_profiles`.
10. **Delta:** os checkpoints registram marcos quantitativos e temporais, mas o passe sob lock procura todo usuário sem Espaço e toda linha contextual ainda nula, em vez de confiar apenas em `updated_at`. É equivalente a “desde os marcos” para a atribuição e mais conservador diante de writers que não atualizem timestamp; a alternativa é filtrar por marca d'água + chave de desempate após provar que todos os writers as mantêm.

## O que este ensaio não cobre

- drenagem real dos agendadores, fila de IA, envio imediato e avaliação de buscas;
- flag de corte em runtime, sua propagação atômica ou rollback de aplicação — o mecanismo ainda não existe;
- erros e p95 reais das leituras públicas; os valores opcionais só permitem registrar o gate observado externamente;
- taxa real de mutações, que vem dos logs de produção lidos somente pelo dono;
- validação da UI, rotas, adaptadores, jobs ou isolamento em código de aplicação;
- restauração com reconciliação de gravações posteriores ao snapshot.

Esses tempos devem ser medidos separadamente quando drenagem e flag existirem. Este PR não implementa nem simula código de aplicação.

## Descarte

Depois de copiar apenas os arquivos `.md` e `.json` sanitizados para o local aprovado, o dono encerra conexões remanescentes e descarta cada cópia:

```bash
dropdb --host=127.0.0.1 --port=5432 --username=licita licita_spaces_01_rehearsal
dropdb --host=127.0.0.1 --port=5432 --username=licita licita_spaces_02_rehearsal
```

Não arquive dumps, logs do `psql` ou diretórios temporários junto do relatório compartilhável.
