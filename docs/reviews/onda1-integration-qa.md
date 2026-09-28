# Onda 1 — QA de integração do frontend (teste de 7 dias, plano único, culturais atrás do gate, LGPD)

Data: 2026-09-24 · Branch `antonioreal97/cycle3` @ `f098cbc` · Papel: FRONTEND QA (somente leitura no código).

**Ambiente próprio.** Nada foi feito na stack do owner (portas 3001/24252). Usei:
- API em `:3006` (`NODE_ENV=development`, `AUTH_DEV_LOGIN=true`, `BILLING_MONTHLY_BRL=49.90`, `PUBLIC_APP_ORIGIN=http://localhost:24257`, `SESSION_SECRET` hex fixo reaproveitado nos restarts, **`PNCP_DAILY_COLLECT=false` e `CULTURE_DAILY_COLLECT=false`**, então nenhuma coleta externa rodou). Não existe `.env` na raiz, então `--env-file-if-exists` não carregou nada além disso.
- Vite em `:24257` (`API_PROXY_TARGET=http://localhost:3006`).
- Banco compartilhado `licita-insight-postgres-1` (migration 0003 já aplicada). Linha de base: 1 usuário (o owner), trial fora da janela D-3 e 0 tombstones. Os restarts da minha API rodaram o scheduler `trial_ending` no banco inteiro, mas só a conta de QA estava na janela.
- 5 boots da API: normal → normal (scheduler) → normal (2º scheduler) → `BILLING_DEV_ENTITLED=true` → normal.

**Método.** Uma aba própria no navegador do Orca (`browserPageId 3013d543…`), com `--page` em todos os comandos e viewport redefinido depois de cada `goto`. Fiz login com `POST /api/v1/auth/dev-login` **de dentro da aba**. Os pedidos à API foram lidos em `performance.getEntriesByType('resource')` depois de cada navegação completa. Os estados foram forçados por SQL, só nas linhas de QA. Screenshots em `/tmp/claude-li/qa3/`.

**Limitação de ferramenta.** Um `orca click --element '<css>'` no botão "Excluir minha conta", logo depois de navegar para `/settings#seus-dados`, não abriu o diálogo. O mesmo botão abriu normalmente com clique por ref do `snapshot` (`@e32`) depois de `scrollIntoView` e também com `element.click()`. É timing de rolagem ou coordenada da ferramenta, não defeito do app.

## Resumo

| Classificação | Qtde |
| --- | --- |
| PASS | 61 |
| FAIL | 0 |
| WARNING | 2 (minor 2; um deles fora do escopo da Onda 1) |
| RECOMMENDATION | 5 |
| Não testado | 2 |

Principais pontos:
- **QA3-001:** os redirecionamentos do paywall levam a `/settings?billing=required` sem `#assinatura`.
- **QA3-007:** fora do escopo, é um bug de fuso já existente no backend. O filtro `deadlineFrom` de editais compara a data em UTC, e o dashboard mostra "Encerrou ontem" em "Prazos a partir de hoje".

O fluxo principal da Onda 1 funcionou de ponta a ponta: teste → últimos dias → aviso → expirado → dev → exclusão.

---

## Resultados por cenário

### 1. Anônimo
| Verificação | Resultado |
| --- | --- |
| `GET /api/v1/billing/plan` → `200 {"monthlyBrl":49.9,"trialDays":7,"currency":"BRL"}` sem sessão | PASS |
| Landing: "Testar 7 dias grátis" (header), "Comece com 7 dias grátis" (hero e card), "7 dias grátis, sem cartão para começar." | PASS (`s1-landing-plan-1440.png`) |
| Card do plano "R$ 49,90 por mês" (vem da API) | PASS, com ressalva visual em QA3-002 |
| `/login`: "Ao entrar pela primeira vez, você ganha 7 dias de acesso completo." | PASS (`s1-login-1440.png`) |
| `/oportunidades`: painel `data-reason="anonymous"` com "Entre com Google e ganhe 7 dias de acesso completo." e "O teste vale uma vez por conta Google." | PASS (`s1-oportunidades-anon-1440.png`) |
| Pedidos à API em `/oportunidades` anônimo: só `auth/session 401` e `billing/plan 200`, **nenhum `/opportunities`** | PASS |
| API direta: `GET /opportunities` e `/opportunities/xyz` → `401 UNAUTHENTICATED` | PASS |
| Sidebar: "Chamadas culturais · INCLUSO NO ACESSO" (cadeado) | PASS |

### 2. Usuário novo (`qa.onda1.trial@teste.dev`)
| Verificação | Resultado |
| --- | --- |
| `/me/billing`: `source:"trial"`, `entitled:true`, `trialEndsAt 2026-10-01T17:57:13.619Z` (login às 17:57:13Z, ou seja, exatamente agora + 7 d) | PASS |
| Badge do shell "Teste · 7 dias", tom primário, `aria-label="Período de teste, termina em 7 dias. Ver assinatura"`. A conta é por dia de calendário de São Paulo: 24/09 → 01/10 = 7, e no próprio 01/10 mostra "hoje". É coerente | PASS (`s2-dashboard-trial-1440.png`) |
| Sem banner com 7 dias restantes | PASS |
| O clique no badge leva a `/settings#assinatura` e rola até a seção (top = 96 px) | PASS |
| `#assinatura`: "R$ 49,90 por mês." e "Período de teste até 01 de out de 2026 (faltam 7 dias)…". "Assinar agora" aparece como secundário (outline) | PASS (`s2-settings-trial-1440.png`) |
| Salvar edital em `/search` → o botão vira "Remover dos salvos" e `/me/saved-tenders/ids` o inclui | PASS |
| Monitorar em `/saved-tenders` → o edital entra em `monitored` | PASS |
| `/oportunidades` lista dados reais: `GET /opportunities?pageSize=20&facets=true 200`, 9 chamadas (= 9 linhas em `cultural_opportunities`), avisos de cobertura por instalação. O detalhe `/oportunidades/ce-8273` também carrega | PASS (`s2-oportunidades-trial-1440.png`) |
| Dashboard: cards `monitoring` e `opportunities` sem "Incluso no acesso"; sidebar sem o cadeado | PASS |

### 3. Últimos dias (`trial_ends_at = now() + 2 days`)
| Verificação | Resultado |
| --- | --- |
| Badge "Teste · 2 dias" com `bg-warning-subtle` | PASS (`s3-banner-2days-1440.png`) |
| Banner: "Seu teste termina em 2 dias (26 de set de 2026). Assine para continuar… Ver assinatura" | PASS |
| **Sem consentimento de cookies:** o X esconde o banner, e ele volta no reload, como documentado no código ("only lasts for this page load") | PASS (comportamento esperado) |
| **Com "Concordar":** o X grava `licita-trial-banner-dismissed = "2026-09-24"` e o banner continua oculto depois do reload | PASS |
| Uma data dispensada antiga (`2026-09-23`) é ignorada e o banner volta | PASS |
| Restart da API → log `Trial ending notifications evaluated created: 1`, e o banco recebe 1 linha `trial_ending`, `dedupe_key account:trial-ending`, `change.to = trialEndsAt` | PASS |
| Sino com badge "1". O item diz "Seu teste termina em 2 dias · Termina em 26 de set de 2026. Assine para continuar salvando e monitorando editais." | PASS (`s3-bell-trial-ending-1440.png`) |
| O clique no item vai para `/settings#assinatura` (seção no topo), marca como lida (contador 0) e, com ≤ 3 dias, "Assinar agora" vira primário | PASS |
| 2º restart → `created: 0`. O banco segue com 1 notificação (lida) | PASS |
| Em 375 px, badge e banner cabem sem rolagem horizontal (`scrollWidth 375`) | PASS (`s3-dashboard-2days-375.png`) |

### 4. Expirado (`trial_ends_at = now() - 1 hour`)
| Verificação | Resultado |
| --- | --- |
| `/me/billing` → `entitled:false, source:null`. `/me/saved-tenders/ids`, `/me/notifications/unread-count`, `/me/saved-searches`, `/opportunities` e `/opportunities/:id` → `402 SUBSCRIPTION_REQUIRED` | PASS |
| O dashboard não gera pedidos `/me/*` com 402 (os pedidos gated só disparam com `entitled`) | PASS |
| Badge e banner somem. O card "Salve e monitore editais… Ver assinatura" aparece, e o card de culturais ganha "Incluso no acesso" | PASS (`s4-dashboard-expired-1440.png`) |
| Salvar em `/search` redireciona para `/settings?billing=required`, que mostra "Seu teste de 7 dias terminou em 24 de set de 2026. Assine para voltar…" e o botão primário **"Assinar"** (lg) | PASS, com a ressalva de QA3-001 (falta o hash) (`s4-settings-expired-1440.png`) |
| "Assinar" → `POST /me/billing/checkout 503 BILLING_UNAVAILABLE`, toast "Pagamento indisponível · A cobrança ainda não está configurada.", mensagem honesta vinda da API | PASS (`s4-checkout-503-1440.png`) |
| `/saved-tenders`, `/monitoring` e `/saved-searches` redirecionam para `/settings?billing=required` | PASS |
| `/oportunidades`: painel `no-access` "Seu acesso terminou…" com "Ver assinatura" → `/settings?billing=required#assinatura`. Pedidos: só `session`, `billing` e `plan`, **sem** `/opportunities` | PASS (`s4-oportunidades-expired-1440.png`) |
| `/oportunidades/ce-8273` também mostra o painel `no-access` | PASS |
| Sino: popover "Assine para acompanhar editais… Ver assinatura" | PASS |
| "Seus dados" → "Baixar meus dados" dispara o download `licitai-dados-2026-09-24.json` (blob) sem erro | PASS |
| `GET /me/export` sem acesso: `200`, `Content-Disposition: attachment; filename="licitai-dados-2026-09-24.json"`, `Cache-Control: no-store`. `user` traz `trialEndsAt`. Sessões só com `createdAt/lastSeenAt/expiresAt`. As notificações não têm `dedupeKey`. Nenhuma chave de token, hash, `googleSub` ou Asaas | PASS |

### 5. Assinatura de desenvolvimento (`BILLING_DEV_ENTITLED=true`, usuário expirado)
| Verificação | Resultado |
| --- | --- |
| Log de boot: `WARN BILLING_DEV_ENTITLED is active; authenticated users bypass the subscription gate` | PASS |
| `/me/billing` → `entitled:true, source:"dev", status:"none"` (o trial expirado não prevalece) | PASS |
| Shell: badge "Dev" com title "Acesso de desenvolvimento (BILLING_DEV_ENTITLED). Não é uma assinatura paga.", sem badge de teste e sem banner | PASS (`s5-dashboard-dev-1440.png`) |
| Acesso restaurado: os salvos e o monitorado de antes voltam (dados retidos), e `/oportunidades` lista as 9 chamadas | PASS |
| `#assinatura`: "Acesso de desenvolvimento (BILLING_DEV_ENTITLED). Não é uma assinatura paga." com "Assinar" | PASS |

### 6. Exclusão da conta (modo normal, usuário expirado)
| Verificação | Resultado |
| --- | --- |
| `DELETE /me` com `{"confirm":"excluir"}` → 400. Sem `X-Requested-With` → 403 | PASS |
| O diálogo abre com foco no campo. "Excluir conta" fica desabilitado vazio e com "excluir", e só habilita com "EXCLUIR" exato | PASS (`s6-delete-dialog-1440.png`) |
| Confirmar → `DELETE /api/v1/me 204` → navega para `/`, toast "Conta excluída · Seus dados pessoais foram apagados do LicitAI.", sem toast de "Sua sessão expirou" | PASS (`s6-after-delete-1440.png`) |
| O cookie `licita_session` sumiu e `/auth/session` responde 401. O shell da landing mostra "Entrar" | PASS |
| Banco: 0 usuários `qa.onda1.%` e 0 sessões órfãs. Tombstones continuam em 0, porque o dev-login não tem `google_sub` (ver "Não testado") | PASS |
| O export feito antes da exclusão não tem segredos (cenário 4) | PASS |

### 7. Regressão
| Verificação | Resultado |
| --- | --- |
| `/search?q=limpeza` anônimo: 20 resultados, sugestões 200, `session 401` | PASS |
| `/tenders/:id` anônimo: o detalhe carrega (`GET /tenders/:id 200`) | PASS |
| Sem rolagem horizontal da página em 1440: `/`, `/login`, `/oportunidades`, `/search`, `/tenders/:id` (anônimo) e `/settings`, `/oportunidades`, `/oportunidades/:id`, `/dashboard` (logado) | PASS |
| Sem rolagem horizontal da página em 375 nas mesmas rotas (`scrollWidth = clientWidth = 375`). Em `/settings`, a lista de seções transborda **dentro** do seu `overflow-x-auto`, e não na página | PASS (`s7-settings-375.png`, `s7-landing-plan-375.png`, `s7-oportunidades-trial-375.png`) |
| Console sem erros ou warnings, exceto o `console.error('[billing] Falha ao abrir o checkout…')` intencional do 503. O 401 esperado de `/auth/session` anônimo não gera log do app | PASS |
| Id inexistente com acesso: API `404 NOT_FOUND`, UI "Chamada não encontrada · Voltar às chamadas" | PASS |
| Teste terminando no mesmo dia (`now() + 2 hours`): badge "Teste · hoje", banner "Seu teste termina hoje (24 de set de 2026)", status "(termina hoje)" e checkout primário | PASS |

---

## WARNING

### QA3-001 — Redirecionamentos do paywall não levam `#assinatura` · WARNING · minor
- **Repro:** com o teste expirado, clicar em salvar em `/search`, abrir `/saved-tenders`, clicar em "Ver assinatura" no card do dashboard ou em "Ver assinatura" no popover do sino.
- **Esperado:** `/settings?billing=required#assinatura`, como faz o painel de culturais (`access-gate.tsx:48`) e como pede o roteiro.
- **Atual:** `/settings?billing=required`, sem o hash. Hoje o impacto é pequeno porque "Assinatura" é a primeira seção (top ≈ 341 px em 1440, visível em 375). Mas qualquer seção acima dela passaria a esconder o paywall, e o comportamento fica inconsistente com o gate cultural.
- **Evidência:** URLs medidas depois do redirecionamento (cenário 4); `s4-settings-expired-1440.png`.
- **Arquivos suspeitos:** `features/billing/hooks/use-billing.ts:50`, `features/billing/components/require-subscription.tsx:17`, `features/dashboard/dashboard-page.tsx:85`, `components/app-shell.tsx:444`. Sugestão: uma constante `BILLING_REQUIRED_HREF = '/settings?billing=required#assinatura'` em `features/billing/lib/trial.ts`. Hoje só existe `BILLING_HREF`, sem o `?billing=required`.

### QA3-007 — Filtro `deadlineFrom` de editais usa a data UTC: "Prazos a partir de hoje" lista "Encerrou ontem" · WARNING · minor · **fora do escopo da Onda 1 (já existia)**
- **Repro:** abrir `/dashboard` às 14–15 h BRT de 24/09. A lista "Prazos mais próximos" (`deadlineFrom=2026-09-24`) mostra editais "Aberto" com "Encerrou ontem · 23 de set de 2026".
- **Esperado:** `deadlineFrom` inclusivo no dia de Brasília (o contrato de oportunidades diz isso explicitamente; em editais o `search-v1` não define fuso, mas a UI trata o dia como BRT).
- **Atual:** `proposalDeadline = 2026-09-24T02:59:00Z` (23/09 23:59 BRT) passa no filtro porque o repositório compara `(proposal_deadline at time zone 'UTC')::date >= '2026-09-24'`.
- **Evidência:** `curl /api/v1/tenders/search?status=open&deadlineFrom=2026-09-24&sort=deadline_asc` → os dois primeiros têm `proposalDeadline 2026-09-24T02:59:00.000Z`; `s2-dashboard-trial-1440.png`.
- **Arquivo suspeito:** `artifacts/api-server/src/repositories/postgres-tender-repository.ts:152-154`, que deveria usar `at time zone 'America/Sao_Paulo'`. É backend (Codex).

## RECOMMENDATION

- **QA3-002 — Preço do plano em fonte mono com espaçamento largo.** No card da landing, "R$ 49,90" aparece como "R$  49 , 90": a vírgula ganha espaço de dígito tabular, e fica pior em 375. Sugestão: usar a fonte de display, ou `letter-spacing` normal no valor. Arquivo: `features/landing/landing-page.tsx` (seção do plano). Evidência: `s1-landing-plan-1440.png`, `s7-landing-plan-375.png`.
- **QA3-003 — Com o teste expirado, dizer que os dados continuam guardados.** Com `/me/saved-tenders/ids` em 402, o edital salvo aparece como "Salvar edital" em `/search`, e o usuário pode achar que perdeu os salvos, que continuam no banco (voltaram no modo dev). Sugestão: no bloco `text-trial-expired`, acrescentar "Seus editais salvos, monitoramentos e buscas continuam guardados." Arquivo: `features/settings/settings-page.tsx`.
- **QA3-004 — A lista de seções de Configurações parece abas, mas não é clicável.** Em 375 ela vira uma faixa com rolagem horizontal ("Assinatura · Perfil e conta · Notificações · Seus…"), com cara de navegação, mas os `li` não têm link. Agora que existem `#assinatura` e `#seus-dados`, vale transformar em âncoras (o `useEffect` de hash já rola). Arquivo: `features/settings/settings-page.tsx` (`sections`).
- **QA3-005 — Mostrar a hora no último dia e "hoje" ao expirar.** O teste termina num instante exato (ex.: 17:06), mas o texto diz só "termina hoje (24 de set de 2026)". Ao expirar no mesmo dia, "terminou em 24 de set de 2026" poderia ser "terminou hoje, às 14:00". Arquivos: `features/billing/components/trial-notice.tsx`, `features/settings/settings-page.tsx`.
- **QA3-006 — O rótulo do header diz "Fonte: PNCP" também em `/oportunidades`.** A fonte das chamadas é o Mapas Culturais. Sugestão: ocultar o rótulo nessa rota ou torná-lo dependente dela. Arquivo: `components/app-shell.tsx:265`.

## Não testado

1. **Tombstone antiabuso (recriar a conta sem reiniciar o teste).** Exige login Google real: usuários de dev-login não têm `google_sub`, então a exclusão não gera tombstone. Confirmei que `google_trial_tombstones` ficou em 0 antes e depois. A consequência é que, em dev, recriar a mesma conta pelo dev-login dá um teste novo de 7 dias, o que é esperado. A cobertura fica com os testes integrados do backend ([`CLAUDE_HANDOFF-007`](../handoffs/CLAUDE_HANDOFF-007-trial.md)).
2. **Checkout com sucesso ou retorno do Asaas.** Sem as chaves `ASAAS_*`, só o caminho 503 foi verificado.

## Notas de ambiente

- A API, ao subir, reconcilia execuções de ingestão com heartbeat vencido (`abandonStale*Runs`) e roda o scheduler `trial_ending` sobre **todo** o banco. Não havia execução `running` nem outro usuário na janela D-3, então o único efeito foi a notificação da conta de QA, removida em cascata. Quem subir uma segunda API contra o banco do owner deve verificar essas duas condições antes.
- O `pnpm run dev` da API reescreve `artifacts/api-server/dist` (ignorado pelo git). A árvore de trabalho continua limpa (`git status` vazio).

## Limpeza (SQL executado)

```sql
-- Usuário 1 (qa.onda1.trial@teste.dev) foi excluído pela própria UI (DELETE /api/v1/me → 204, cascata).
-- Usuário 2 e verificação final:
BEGIN;
DELETE FROM users WHERE email LIKE 'qa.onda1.%@teste.dev' RETURNING email;  -- 1 linha: qa.onda1.layout@teste.dev
COMMIT;
SELECT count(*) FROM users WHERE email LIKE 'qa.onda1.%';                     -- 0
SELECT count(*) FROM google_trial_tombstones;                                  -- 0 (nenhum criado: dev-login não tem google_sub)
SELECT count(*) FROM sessions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id);  -- 0
SELECT count(*) FROM users;                                                    -- 1 (só o owner, como na linha de base)
```

Manipulações feitas durante o QA, só em linhas de QA:

```sql
UPDATE users SET trial_ends_at = now() + interval '2 days' WHERE email = 'qa.onda1.trial@teste.dev';
UPDATE users SET trial_ends_at = now() - interval '1 hour' WHERE email = 'qa.onda1.trial@teste.dev';
UPDATE users SET trial_ends_at = now() + interval '2 hours' WHERE email = 'qa.onda1.layout@teste.dev';
```

Servidores próprios (API `:3006` e Vite `:24257`) parados; aba `3013d543…` fechada. A stack do owner (`licita-insight-api-1`, `-web-1`, `-postgres-1`) não foi tocada.
