# Ciclo 12 — QA integrado (29–30 set 2026)

Tarefa D do ciclo 12. Verificação independente da branch `antonioreal97/cycle12` inteira, com os commits
3e3c905 (C: detalhe/participação/configurações), b0a5670 (A: prazos no resumo diário), 99e3461 (B: busca abre
em Abertos, sem seletor semântico) e 11bb25e (E: links de e-mail de busca salva com `status=all`).
Nenhum deploy, push, envio de e-mail, chamada ao Asaas, chamada paga de IA ou `push-force`/`db-setup`.

**Resultado:** tudo verde. Nenhum defeito do ciclo 12 bloqueia a entrega. Há dois achados de baixa severidade,
listados na seção 5. Não fiz nenhuma correção de código.

## 1. Suítes

Bancos temporários próprios no Postgres da stack: `licita_c12_qa` (testes da API e prova do resumo) e
`licita_c12_qa_mig` (migrations). Os dois foram apagados no fim. O `pnpm-lock.yaml` não mudou no ciclo, e
`lib/db/migrations` também não: a última continua sendo a 0019, e o ledger do banco `licita` tem 20 entradas.

| Comando | Resultado real |
|---|---|
| `pnpm install --frozen-lockfile` | OK (lockfile inalterado) |
| `DATABASE_URL=…/licita_c12_qa node lib/db/scripts/migrate.mjs` (prepara o banco de teste) | OK, 20 migrations |
| `PNCP_TEST_DATABASE_URL=…/licita_c12_qa pnpm --filter @workspace/api-server run test` | **199 testes, 199 pass, 0 fail, 0 skipped**, 24 suites; `dist tender sheet policy: PASS`. Inclui `Daily digest deadlines with PostgreSQL` (1,1 s) |
| `PNCP_TEST_DATABASE_URL=… pnpm exec tsx --test src/static-app.test.ts src/server-runtime.test.ts src/metrics.integration.test.ts src/app-role.test.ts` (em `artifacts/api-server`) | **9 pass, 0 fail, 0 skipped**. Esses 4 arquivos ficam fora do glob do `pnpm test` (achado 5.1) |
| `pnpm --filter @workspace/licitainsight run test` | **25 testes, 25 pass, 0 fail, 0 skipped** (5 arquivos) |
| `pnpm run typecheck` (raiz: libs + api-server + licitainsight + mockup-sandbox + scripts) | OK, 0 erros |
| `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run build` | OK, `built in 1.31s`. Só os avisos já conhecidos (sourcemap dos `components/ui/*`, chunk > 500 kB) |
| `MIGRATIONS_TEST_DATABASE_URL=…/licita_c12_qa_mig pnpm --filter @workspace/db run verify:migrations` | `migrations parity: PASS (empty diff, first migrate 320 ms, second migrate idempotent)` |

## 2. Stack local (projeto `licita-insight`)

Antes do QA, `api` e `web` estavam parados (`Exited`, SIGTERM). Subi os dois com o comando de
[`participation-activation-2026-09-28.md`](participation-activation-2026-09-28.md), sem alterar nada:

```sh
docker compose -p licita-insight \
  --env-file /Users/antonio/CODE/MY/LicitAI/Licita-Insight/.env \
  -f docker-compose.yml -f .local/compose-activation-0019.yml \
  up -d --no-deps --wait --wait-timeout 180 api web
```

- `db-setup` não rodou: nenhuma linha no log do `up`; o container continua `Exited (0)` de 27 h antes.
- Os containers foram iniciados, não recriados (`Created` 28/09). O código montado é o deste worktree:
  `search-defaults.ts` com `SEARCH_MODE_ENABLED` existe dentro do container.
- O que a própria API fez ao subir, lido em `ingest_runs` do `licita` (só leitura): a coleta PNCP diária
  (`PNCP_DAILY_COLLECT=true` no override) começou e falhou em 15 s com `fetch failed`, 0 páginas e 0 upserts.
  A coleta do Mapas Culturais terminou com 10 upserts; o Mapa da Cultura respondeu 403 e o Amapá deu erro de
  certificado, como já acontecia. Também marcou como `failed` a coleta PNCP de 28/09, que tinha ficado
  abandonada. Além disso, não mexi no banco `licita`.
- **Estado final:** `licita-insight-api-1` e `licita-insight-web-1` `healthy`; `GET :3001/api/healthz` → 200;
  `GET :24252/` → 200; `GET :24252/api/healthz` → `{"status":"ok"}`; Postgres `healthy`, sem reinício.

## 3. Navegador (Playwright 1.63 / Chromium headless, 1440×900 e 390×844)

O `.env` real não tem `AUTH_DEV_LOGIN`: `POST /api/v1/auth/dev-login` respondeu 404 na stack. Por isso o QA
teve duas partes:

- **A — stack real, `http://localhost:24252`, anônimo:** busca, detalhe, painel e os redirecionamentos para login.
- **B — instância isolada desta branch, `http://localhost:24352`, logado:** API buildada deste worktree em
  `:3101` e Vite em `:24352`, apontando para o banco temporário `licita_c12_qa`. Rodou com `env -i`, sem ler
  nenhum `.env`: `AUTH_DEV_LOGIN=true` e `BILLING_DEV_ENTITLED=true`; PNCP, cultura e jobs de e-mail
  desligados; sem chave de Jev, Resend ou Asaas. Copiei do `licita`, só com leitura, 480 editais (361 abertos,
  42 em análise, 80 revogados, 1 suspenso) e 2 fichas prontas com seus trechos. A instância foi encerrada no fim
  e o banco, apagado.

Resultado final: **104/104 verificações PASS** (`results.json`). Em cada tela e nos dois tamanhos,
`scrollWidth − clientWidth = 0`. Não houve `pageerror`, erro de console nem resposta HTTP ≥ 400 atribuível ao
app. As únicas 401 foram de `/api/v1/auth/session` sem sessão: 9× por viewport em A e 1× em B, antes do
login. Esse comportamento é esperado.

| Área | Verificação | A (anônimo) | B (logado) |
|---|---|---|---|
| Busca | `/search` abre sem `status` na URL, chip "Status: Aberto (padrão)", sem "Limpar tudo" | PASS | PASS |
| Busca | Remover o chip padrão → `?status=all`, chip "Todos", mais resultados | PASS (14.230 → 22.648) | PASS (361 → 484) |
| Busca | Recarregar mantém `status=all` e o chip "Todos" | PASS | PASS |
| Busca | `?status=open&status=under_review&q=serviço` → "Limpar tudo" → volta ao padrão e mantém `q` | PASS | PASS |
| Busca | Sem seletor semântico (`radio-search-mode-*`) e sem texto "semântica" | PASS | PASS |
| Busca | URL antiga `?mode=semantic&q=computador` → `?q=computador`, sem aviso de fallback | PASS | PASS |
| Buscas salvas | Salvar "Todos os status" e reabrir pela lista → `/search?q=serviço&status=all` (mesma regra do link de e-mail da tarefa E) | — | PASS |
| Detalhe | Aviso "escolhidos automaticamente": 0 para visitante; 1 vez, dentro de "Antes de decidir", com ficha pronta | PASS (0) | PASS (1) |
| Participação | Painel renderiza (visitante vê o convite para entrar) | PASS | PASS |
| Participação | "Vou analisar" → próxima ação + prazo salvos; mudança de etapa; formulário antes de "Ver histórico"; rótulo "Protocolo" sem "informado por você" | — | PASS |
| Painel | `/dashboard` é pública (rota sem `RequireAuth`) e renderiza | PASS | PASS |
| Salvos | `/saved-tenders` lista o edital como "Preparando documentos" | redireciona p/ login: PASS | PASS |
| Configurações | Notificações: "…os prazos dos próximos 3 dias…" e "Sem novidade nem prazo próximo, não enviamos." | redireciona p/ login: PASS | PASS |
| Acesso | `/saved-tenders`, `/saved-searches` e `/settings` sem sessão → `/login?returnTo=…` | PASS | — |

Na primeira rodada, 8 verificações falharam por erro do roteiro, não do app. Os motivos: eu esperava
redirecionamento em `/dashboard`, que é pública; lia a contagem antes de a nova busca responder; o histórico só
aparece com 2 ou mais mudanças; e os 401 esperados de sessão contavam como erro. Também usei uma ficha gravada
com o prompt v2 (o código está na v3); sem chave de IA, a API isolada respondeu 503, o que é esperado nesse
ambiente. Corrigi o roteiro e a segunda rodada deu 104/104.

Capturas (33 PNG), `results.json`, os roteiros e os logs estão numa pasta temporária, sujeita à limpeza do sistema:

```text
/private/tmp/claude-501/-Users-antonio-orca-workspaces-Licita-Insight-main/3ad2c80e-0d90-4038-b004-a0bde99ba6bd/scratchpad/
  qa-c12/shots/{desktop,mobile}-{A,B}-*.png, digest-seus-prazos.png, results.json
  qa-c12/digest-0.txt, digest-0.html
  pw/qa.mjs, digest-proof.mts, logs/*.log
```

## 4. Prazos no resumo diário (tarefa A)

Script próprio (`digest-proof.mts`), diferente do teste de integração. Ele chama o `runDailyEmailDigest` real
contra `licita_c12_qa` com um *sender* que só captura a mensagem, sem `RESEND_API_KEY`. O script se recusa a
rodar se a URL não for de um banco `licita_c12_*`. Dados: uma conta com assinatura ativa, `now` = 29/09/2026
08:30 em Brasília, e quatro editais salvos:

| Edital salvo | Esperado | Saiu |
|---|---|---|
| Etapa *participating*, proposta oficial hoje às 19:00 | aparece, "(hoje)" | sim |
| Etapa *analyzing*, prazo pessoal 02/10 15:00 | aparece, "(em 3 dias)" | sim |
| Etapa *participating*, edital **suspenso** com proposta amanhã | fica fora | fora |
| Etapa *analyzing*, prazo pessoal 03/10, fora da janela | fica fora | fora |

`{"queued":1,"sent":1,"failed":0,"skipped":0}`. Assunto: `LicitAI: 2 prazos nos próximos dias`. O texto e o
HTML têm a seção **"Seus prazos (até o fim do 3º dia a partir de hoje, horário de Brasília)"**, com "Sua
etapa: Preparando documentos / Analisando", link para `/tenders/<id>` em `http://localhost:24252`, link de
preferências e o de descadastro com token. A imagem do HTML renderizado é `digest-seus-prazos.png`.
Também passou o teste de integração da tarefa A: assunto, ordem, escape de `<certidões>`, exclusão das etapas
`submitted`/`dismissed` e de prazos vencidos, conta beta, e nenhum reenvio no mesmo dia.

## 4b. Links de busca salva no e-mail (tarefa E)

`savedSearchHref` (`artifacts/api-server/src/email/email-template.ts:89-93`) acrescenta `status=all` quando a
busca salva não tem `status` e deixa o link como está quando tem. É a mesma regra do `savedQueryHref` do app
(`search-defaults.ts`), que também é usada nas notificações do sino (`notification-copy.ts:84`). Teste
`links a saved search without status to every status, as the app does`: pass, dentro dos 199. No navegador,
a busca salva sem status reabriu em `/search?q=serviço&status=all`, e a tela mostrou "Todos" e 484 resultados
(seção 3). Então o link do e-mail e o botão da lista abrem a mesma coisa.

## 5. Achados

Nenhum defeito do ciclo 12. Os dois achados abaixo não bloqueiam a entrega; nenhum foi corrigido.

### 5.1 `pnpm test` da API não roda os testes da raiz de `src/` — baixa, backend, anterior ao ciclo

`artifacts/api-server/package.json:26`: `"test": "tsx --test src/**/*.test.ts && …"`. O glob está sem aspas, e o
`sh` do pnpm não tem `globstar`, então `src/**/*.test.ts` vira `src/*/*.test.ts`. Com isso, 4 dos 43 arquivos
ficam fora: `src/static-app.test.ts`, `src/server-runtime.test.ts`, `src/metrics.integration.test.ts` e
`src/app-role.test.ts`. Rodados à parte, deram 9/9 pass. O problema vem de 6d1b8f7 (22/09). Correção sugerida:
pôr o glob entre aspas simples, como já faz o frontend (`'src/**/*.test.ts'`). O `tsx`/Node então expande o
padrão de forma recursiva. Fica para o coordenador redistribuir, porque é configuração do backend.

### 5.2 Aviso de trechos aparece também sem trechos na tela — baixa, UX, frontend

`artifacts/licitainsight/src/features/participation/components/decision-panel.tsx:243-249`: o aviso
(`text-sheet-disclaimer`) aparece sempre que `found` existe. Isso inclui o esqueleto de carregamento,
"Lendo os documentos…" e o erro "Não foi possível carregar a ficha". Nesses estados não há trecho na tela,
então "Encontrado no edital. Os trechos são…" aparece acima de uma linha de erro. Vi isso na instância isolada,
com a ficha que caiu em 503. O aviso continua único e fica no lugar certo, como pedia a tarefa C.
Mostrar o aviso só com a ficha pronta é uma mudança de uma linha, mas é escolha de design, porque o aviso
sobre o esqueleto evita que o layout pule. Por isso não corrigi e deixo a decisão ao coordenador.

### Observação de ambiente (não é defeito)

No `licita`, a ficha do edital `03288908000483-1-000042-2026` está gravada com o prompt v2, e o código atual
usa a v3. Com a chave real de Jev configurada, o primeiro acesso gera a ficha de novo, uma chamada paga. Sem
chave, a API responde 503 e a UI mostra o erro dentro do bloco, com "Tentar de novo".

## 6. Mensagens de commit do ciclo

`git log ba8273a..HEAD`: 3e3c905, b0a5670, 99e3461 e 11bb25e são todos de `antonio-real`. Nenhum tem
`Co-authored-by`, e nenhum cita Claude, Codex, Cursor ou IA (busca sem distinção de maiúsculas no corpo
completo das mensagens).
