# Ciclo 13 — QA integrado (29–30 set 2026)

Tarefa I do ciclo 13. Verifiquei de forma independente a branch `antonioreal97/cycle13` inteira, com os commits
1ff8761 (F: uma linha por edital em "Seus prazos" e link de perfil com `status=all`) e 54bbc3c (G: limites de
taxa por perfil). Não houve deploy, push, envio de e-mail, chamada ao Asaas, chamada paga de IA nem
`push-force`/`db-setup`. O banco `licita` só foi lido.

**Resultado:** tudo verde. Não encontrei defeito no ciclo 13 e não corrigi código. Na seção 6 ficam quatro
observações de baixa severidade para o coordenador decidir.

## 1. Suítes

Usei bancos temporários próprios no Postgres da stack: `licita_c13_qa` (testes da API), `licita_c13_qa_mig`
(migrations), `licita_c13_rl` (API isolada), `licita_c13_mail` (prova do e-mail) e `licita_c13_loop1..16`
(repetições da suíte). Todos foram apagados no fim. O ciclo não mudou o `pnpm-lock.yaml` nem `lib/db/migrations`:
a última migration continua sendo a 0019, e o ledger do `licita` tem 20 entradas.

| Comando | Resultado real |
|---|---|
| `pnpm install --frozen-lockfile` | OK, `Already up to date` |
| `DATABASE_URL=…/licita_c13_qa node lib/db/scripts/migrate.mjs` | OK, 20 migrations |
| `PNCP_TEST_DATABASE_URL=…/licita_c13_qa pnpm --filter @workspace/api-server run test` | **218 testes, 218 pass, 0 fail, 0 skipped**, 25 suites; `dist tender sheet policy: PASS`. Inclui `Daily digest deadlines with PostgreSQL`, `rate limit profiles through the app` e os testes de perfil/independência de baldes |
| Mesma suíte, 16 vezes mais, cada uma num banco novo migrado, com `tsx --test --test-reporter=spec 'src/**/*.test.ts'` (as rodadas 9–16 começaram junto com o Playwright da stack real) | **16/16 rodadas com 218 pass, 0 fail, 0 skipped** (seção 5) |
| `tsx --test --test-reporter=spec src/middlewares/request-protection.test.ts src/middlewares/rate-limit-http.test.ts`, 40 vezes, com 6 processos `yes` ocupando a CPU | **40/40 rodadas com 20 pass, 0 fail** |
| `pnpm --filter @workspace/licitainsight run test` | **27 testes, 27 pass, 0 fail, 0 skipped** |
| `pnpm run typecheck` (raiz) | OK, 0 erros |
| `PORT=24252 BASE_PATH=/ pnpm --filter @workspace/licitainsight run build` | OK, `built in 1.36s`. Só apareceram os avisos já conhecidos: sourcemap dos `components/ui/*` e chunk > 500 kB |
| `MIGRATIONS_TEST_DATABASE_URL=…/licita_c13_qa_mig pnpm --filter @workspace/db run verify:migrations` | `migrations parity: PASS (empty diff, first migrate 320 ms, second migrate idempotent)` |

## 2. Rate limiting na prática (API isolada desta branch)

A API foi buildada deste worktree e subiu em `:3113` com `env -i`, sem ler nenhum `.env`. Configuração:
`DATABASE_URL=…/licita_c13_rl`, `AUTH_DEV_LOGIN=true`, `BILLING_DEV_ENTITLED=true`,
`PUBLIC_APP_ORIGIN=http://localhost:24363`, coletas PNCP/cultura e jobs de e-mail desligados, sem chave de Jev,
Resend ou Asaas. O Vite ficou em `:24363`, com proxy para essa API. Copiei do `licita`, só com leitura, 520
editais: 400 abertos, 118 em análise e 2 suspensos. Os limites são os padrões do código. A instância foi
encerrada no fim.

### 2.1 Estouro de cada perfil (`burst.mjs`, 47/47 PASS)

O roteiro espera 61 s para as janelas zerarem e cria três sessões (A, B e C). Depois repete cada chamada até
receber 429. Só usei chamadas sem efeito colateral: 400 de validação, 403 de CSRF, 404 ou leitura. Nenhuma
chegou ao Asaas, ao Resend, ao PNCP ou à IA.

| Perfil | Chamada | Passaram | 1ª resposta | 429: `Retry-After` / `RateLimit-Policy` / `-Limit` / `-Remaining` / `-Reset` |
|---|---|---|---|---|
| public (anônimo, IP) | `GET /api/v1/tenders/search?q=serviço` | 60 | 200, `60;w=60`, rem 59 | 60 / `60;w=60` / 60 / 0 / 60 |
| public_write (anônimo, IP) | `POST /api/v1/email/unsubscribe` (token inválido → 400) | 9 + 1 anterior = 10 | 400, `10;w=60` | 60 / `10;w=60` / 10 / 0 / 60 |
| auth (IP) | `POST /api/v1/auth/dev-login` com corpo vazio (400) | 17 + 3 logins = 20 | 400, `20;w=60` | 60 / `20;w=60` / 20 / 0 / 60 |
| ingest (IP) | `GET /api/v1/ingest/pncp` (só lê a última coleta) | 3 | 200, `3;w=60` | 60 / `3;w=60` / 3 / 0 / 60 |
| ai (usuário A) | `GET /api/v1/tenders/qa-c13-nao-existe/ask-status` (404) | 60 | 404, `60;w=60` | 60 / `60;w=60` / 60 / 0 / 60 |
| write (usuário A) | `PUT /api/v1/me/notification-preferences` com `{}` (400) | 59 + 1 anterior = 60 | 400, `60;w=60` | 60 / `60;w=60` / 60 / 0 / 60 |
| billing (usuário A) | `POST /api/v1/me/billing/checkout` sem CSRF (403, antes do Asaas) | 5 | 403 `CSRF validation failed`, `5;w=60` | 60 / `5;w=60` / 5 / 0 / 60 |
| privacy (usuário C) | `GET /api/v1/me/export` (200) | 5 | 200, `5;w=3600` | **3600** / `5;w=3600` / 5 / 0 / 3600 |
| preauth (IP) | `GET /api/v1/billing/plan` com `licita_session=forjado` | 457 forjados + 143 com cookie válido = 600 | — | 60 / sem `RateLimit-*` (esperado: o balde é interno) |

O corpo de todas as 429 veio igual:
`{"error":{"code":"RATE_LIMITED","message":"Request rate limit exceeded","requestId":"…"}}`. Em todas,
`Retry-After` = `RateLimit-Reset` = segundos até o fim da janela do perfil (60 ou 3600).

Independência dos baldes, com um perfil estourado de cada vez:

| Situação | Resultado |
|---|---|
| public anônimo do IP estourado → `/api/healthz` e `/api/readyz`, 30× cada | 200 em todas, sem `RateLimit-*` |
| mesmo estado → `POST /api/v1/billing/asaas/webhook` sem token, 30× | 401 `Invalid Asaas webhook token` em todas, nunca 429, sem `RateLimit-*` |
| mesmo estado → usuário A lê a busca | 200, `240;w=60`, rem 239 |
| mesmo estado → unsubscribe anônimo | 400, `10;w=60` (não é 429) |
| public_write do IP estourado → write do usuário A | 400, `60;w=60` |
| auth do IP estourado → leitura do usuário B | 200 |
| ai de A estourado → ai de B / leitura de A | 404 com rem 59 / 200 com rem 238 |
| write de A estourado → write de B | 400 com rem 59 |
| `GET /api/v1/me/billing` de A | 200, `240;w=60` (fica no balde public, como disse o coordenador) |
| billing de A estourado → `cancel` de B | 403 com rem 4 |
| privacy de C estourado → export de A / leitura de C | 200 com `5;w=3600` e rem 4 / 200 |

### 2.2 Navegação normal sem 429 (`nav.mjs`, Playwright 1.63, Chromium headless)

O fluxo, em 1440×900 e 390×844: busca por "serviço", clique numa faceta de modalidade (no celular, pela gaveta
e "Aplicar"), página 2, abrir o detalhe, **salvar** (logado), voltar (a URL mantém `q`, a faceta e `page=2`),
página anterior, abrir outro detalhe e voltar. Logado, o fluxo também passa por `/saved-tenders`.

| Instância | Resultado | Menor `RateLimit-Remaining` visto por política |
|---|---|---|
| Isolada, logado (dev-login) | **30/30 PASS**. Salvar = `PUT /me/saved-tenders/:id` 200 em `60;w=60` (rem 59). Zero 429, zero HTTP ≥ 400 inesperado, zero erro de console, rolagem horizontal 0 | desktop: `60;w=60` 46, `240;w=60` 201, `20;w=60` 18 · celular: 54 / 206 / 19 |
| Isolada, anônimo | **20/20 PASS**, zero 429 | `60;w=60`: 46 no desktop, 33 no celular (mesma janela, mesmo IP) |

**Polling do detalhe (pedido do coordenador).** Deixei um detalhe aberto por 75 s, logado, com a ficha e o
índice em `processing`. O Playwright deixa o pedido chegar à API, que conta na janela e devolve os cabeçalhos,
e só troca o corpo da resposta. Isso é necessário porque sem chave de IA a ficha termina logo como
`no_documents`. Resultado: **16 chamadas do perfil ai no 1º minuto** (8 `sheet` + 8 `ask-status`) e 20 em 75 s,
contra um limite de 60/min por usuário. O intervalo é 2, 4, 8, 10, 10… s
(`use-tender-sheet.ts:9` e `use-ask-tender.ts:9`). O `fit` do perfil tem teto de tentativas (`MAX_POLLS`) e
só roda na busca com perfil da empresa. Então o limite de 60 deixa folga para ~3 detalhes em processamento ao
mesmo tempo.

**Formato de `RateLimit-Reset` (pedido do coordenador).** O frontend não lê `RateLimit-*`. Ele só usa
`Retry-After` (`api/adapters/http/http-client.ts:33` → `api/errors.ts:31`, em segundos), que não mudou de
formato. A mudança de `RateLimit-Reset` (antes o instante absoluto em segundos, agora os segundos até o fim da
janela) não afeta o app.

## 3. Stack real (projeto `licita-insight`)

Antes do QA, `api` e `web` estavam `healthy`, mas a API rodava o código de antes do G: `/api/v1/billing/plan`
respondia sem `RateLimit-Policy`. Recriei **só a `api`** com o comando de
[`participation-activation-2026-09-28.md`](participation-activation-2026-09-28.md), com `--no-deps`. Acrescentei
`--force-recreate`, porque sem mudança de configuração o `up` não reinicia o container:

```sh
docker compose -p licita-insight \
  --env-file /Users/antonio/CODE/MY/LicitAI/Licita-Insight/.env \
  -f docker-compose.yml -f .local/compose-activation-0019.yml \
  up -d --no-deps --force-recreate --wait --wait-timeout 180 api
```

- Saída: `Recreate → Recreated → Started → Healthy`. O `db-setup` não rodou (continua `Exited (0)` de 28 h
  antes), e o `web` e o Postgres não foram tocados.
- Depois disso, `/api/v1/billing/plan` e `/api/v1/tenders/search` respondem com `RateLimit-Policy: 60;w=60`.
- Ao subir, a API fez duas coletas, lidas em `ingest_runs` só com leitura. A PNCP (`PNCP_DAILY_COLLECT=true`
  no override) falhou em 18 s com `fetch failed`, 0 páginas e 0 upserts, como no ciclo 12. A do Mapas
  Culturais terminou com 10 upserts, e o Mapa da Cultura respondeu 403, também como antes. Além disso, não
  mexi no banco `licita`.

Playwright anônimo em `http://localhost:24252` com o mesmo `nav.mjs`, sem salvar, porque a stack real não tem
dev-login: **20/20 PASS**. Nos dois tamanhos: busca `q=serviço&modality=dispensa`, página 2, detalhe, voltar e
outro detalhe, com **zero 429**, zero HTTP ≥ 400 inesperado, **zero erro de console** e
`scrollWidth − clientWidth = 0` na busca e no detalhe. O menor `RateLimit-Remaining` foi 45 no desktop e 33 no
celular, na mesma janela e no mesmo IP.

**Estado final:** `licita-insight-api-1` `healthy` (recriado às 01:03 UTC, 0 reinícios),
`licita-insight-web-1` `healthy`, Postgres `healthy`, `db-setup` `Exited (0)`. `GET :3001/api/healthz` → 200,
`GET :24252/` → 200 e `GET :24252/api/healthz` → `{"status":"ok"}`. A instância isolada (`:3113`/`:24363`)
foi encerrada, e os bancos `licita_c13_*` foram apagados.

## 4. E-mail: uma linha por edital e link de perfil com `status=all` (tarefa F)

O roteiro próprio (`digest-proof.mts`) chama o `runDailyEmailDigest` real contra `licita_c13_mail`. O *sender*
só captura a mensagem, sem `RESEND_API_KEY`, e o roteiro se recusa a rodar fora de um banco `licita_c13_*`.
Dados: `now` = 29/09/2026 08:30 em Brasília, uma conta com assinatura ativa, três editais salvos e uma
notificação `profile_new_matches`.

| Edital salvo | Esperado | Saiu |
|---|---|---|
| Pessoal 30/09 15:00 **e** proposta 01/10 14:00 | uma linha, com o prazo pessoal primeiro | `Seu prazo (informado por você): Pedir atestado de capacidade técnica — 30/09/2026, 15:00 (amanhã) · Prazo oficial de proposta: 01/10/2026, 14:00 (em 2 dias)`. O título aparece 1 vez |
| Proposta 29/09 19:00 **e** pessoal 02/10 09:00 | uma linha, com a proposta primeiro | `Prazo oficial de proposta: 29/09/2026, 19:00 (hoje) · Seu prazo (informado por você): Conferir certidões — 02/10/2026, 09:00 (em 3 dias)`. O título aparece 1 vez |
| Só proposta 02/10 10:00 | uma linha | `Prazo oficial de proposta: 02/10/2026, 10:00 (em 3 dias)` |
| Notificação de perfil (3 editais) | link `…/search?status=all`; destaque ainda aponta para o edital | texto: `http://localhost:24252/search?status=all`; HTML: `href="…/search?status=all">Ver oportunidades`, e o destaque aponta para `…/tenders/11222333000181-1-008103-2026` |

`{"queued":1,"sent":1,"failed":0,"skipped":0}`, com o assunto `LicitAI: 5 prazos e 1 atualização no seu resumo`
(ver 6.3). Os editais saem ordenados pelo prazo mais próximo. A imagem do HTML renderizado é
`digest-seus-prazos.png`. No app, `notificationHref` usa `savedQueryHref('')` para a notificação de perfil sem
destaque, e o teste de `notification-copy.test.ts` passa dentro dos 27 do frontend.

## 5. Teste intermitente relatado pelo coordenador

O coordenador viu 1 falha em 218 numa rodada e não sabia qual teste tinha falhado. **Não reproduzi.** Ao todo
foram 17 rodadas completas (1 + 16 com `--test-reporter=spec`, cada uma num banco novo e migrado; as 8 últimas começaram junto com
o Playwright da stack), todas 218/218. Também rodei 40 vezes os dois arquivos de rate limit com a CPU
saturada, e as 40 deram 20/20. Os logs estão em `logs/api-loop-*.log`.

Pela leitura do código:

- Os testes novos do ciclo 13 usam relógio injetado (`now: () => clock`) ou janelas de 60 s bem folgadas
  (`rate-limit-http.test.ts`). O único `setTimeout` novo é o atraso de 1 ms do store assíncrono
  (`request-protection.test.ts:608`), e ele não influi no resultado.
- Os candidatos mais prováveis são anteriores ao ciclo (7b87e9e6): os testes de concorrência que dependem de
  esperas curtas em `request-protection.test.ts:174-275`. "N+1 inflight" espera 20 ms para o 1º pedido estar em
  curso, o cliente abortado espera 10 ms, o *global shedding* espera 20 ms e o *timeout* de 30 ms espera 100 ms.
  Numa máquina ocupada, essas esperas podem não bastar. Mesmo assim, 40 rodadas sob carga não falharam.
- Sem o log da rodada que falhou, não dá para afirmar a causa. A recomendação é rodar sempre com
  `--test-reporter=spec` e guardar a saída, para que a próxima falha já diga o nome do teste.

## 6. Achados

Não há defeito do ciclo 13. As observações abaixo não bloqueiam a entrega.

### 6.1 Na stack Docker local, todos os anônimos dividem um balde de 60/min — baixa, ambiente de dev

O compose não define `TRUST_PROXY`, e o proxy do Vite (`artifacts/licitainsight/vite.config.ts:66-70`) não
envia `X-Forwarded-For`. Por isso a API vê todos os navegadores com o IP do container `web`: em `:3001` direto e
via `:24252`, as contagens foram separadas (as duas começaram em 59). Uma navegação anônima completa e rápida
consumiu ~15 do balde de 60 em ~20 s. Com o G, também passam a contar nesse balde leituras anônimas que antes
não tinham janela, como `GET /auth/session` (401) e `/billing/plan`. Em produção isso não acontece:
`fly.toml:14` e `deploy/beta-local/docker-compose.yml:25` definem `TRUST_PROXY=1`. Só vale lembrar se a stack
local for exposta a várias pessoas.

### 6.2 O balde preauth conta também sessões válidas — baixa, comportamento anterior ao ciclo

Todo pedido com cookie `licita_session`, válido ou forjado, conta no preauth do IP (600/min) antes de a sessão
ser lida (`request-protection.ts:291`). No teste, 143 pedidos com cookie válido + 457 forjados = 600 bastaram
para o 429. Isso já estava assim no `main` e é intencional (o comentário no código explica). Muitos usuários
logados atrás de um mesmo NAT dividem esse teto, que por ora é folgado.

### 6.3 O assunto conta prazos, a seção lista editais — baixa, decisão registrada

Com 3 editais e 5 prazos, o assunto diz "5 prazos" e a seção mostra 3 itens. A mensagem do commit 1ff8761 diz
que isso é deliberado ("the subject still counts deadlines"). Fica registrado porque o leitor pode esperar 3.

### 6.4 `RateLimit-Policy` igual para ai e write — cosmética

Os dois perfis anunciam `60;w=60`, então pelo cabeçalho não dá para saber qual balde respondeu. A métrica
`licitai_http_rate_limited_total` tem o rótulo `profile`, então o diagnóstico no servidor não é afetado.

### Observação de ambiente (não é defeito)

Na instância isolada, abrir o detalhe dispara o enriquecimento no PNCP (`PNCP detail enrichment failed`,
`fetch failed: read ECONNRESET`). Esse comportamento é anterior ao ciclo, e o detalhe renderiza normalmente,
sem erro de console. A coleta PNCP na stack também falha com `fetch failed`, como no ciclo 12.

## 7. Mensagens de commit do ciclo

`git log origin/main..HEAD`: os dois commits, 1ff8761 e 54bbc3c, são de `antonio-real`. Nenhum tem
`Co-authored-by`, e nenhum cita Claude, Codex ou Cursor (busca sem distinção de maiúsculas no corpo completo das
mensagens). "AI" aparece só como nome de perfil de rota ("AI routes").

## Artefatos

Pasta temporária, sujeita à limpeza do sistema:

```text
/private/tmp/claude-501/-Users-antonio-orca-workspaces-Licita-Insight-main/a9199f40-4bfc-4638-927c-f3e35c573c5f/scratchpad/
  pw/nav.mjs, pw/burst.mjs, digest-proof.mts, loop-tests.sh
  qa-c13/burst.json, qa-c13/shots/*.png (iso, iso-anon, stack, digest-seus-prazos), qa-c13/shots/*-results.json
  qa-c13/digest-0.txt, qa-c13/digest-0.html
  qa-c13/logs/{api-test,api-loop-1..16,web-test,typecheck,build,mig,burst,nav-*,compose-up,api-isolated}.log
```
