# Ciclo 2 — QA de integração do frontend com sessão real (Licita Insight)

Data: 2026-09-23 · Ambiente: frontend `http://localhost:24252` (proxy Vite `/api` → API `:3001`, `AUTH_DEV_LOGIN=true`), PostgreSQL `licita-postgres`, 19 editais PNCP/DF.
Método: aba própria no navegador embutido do Orca (`browserPageId b804efbc…`), login por `POST /api/v1/auth/dev-login` executado **dentro da aba** (cookie HttpOnly no navegador), medições por `orca eval`/`snapshot`, screenshots em `/tmp/claude-li/qa2/`, `curl` com cookie jars separados para isolamento e CSRF, SQL direto para notificações e para forçar 401. Nenhum código-fonte foi alterado.

**Limitações de ferramenta.** A aba não tinha foco de documento (`document.hasFocus() === false`, `activeElement = BODY`). `orca click` falhou em silêncio duas vezes em elementos fora da viewport dentro de contêiner com rolagem (botão salvar da tabela, "Próxima página"); nesses casos o clique foi feito por `element.click()` via `eval`. Os toasts com "Desfazer" duram ~5 s (padrão Radix), menos que o ciclo snapshot → clique; o Desfazer foi exercitado por `eval` (clicar na ação → clicar em "Desfazer" no mesmo script).

## Resumo

| Classificação | Qtde |
| --- | --- |
| PASS | 47 (algumas com ressalva, indicadas nas tabelas) |
| FAIL | 3 (blocker 0 · major 0 · minor 3) |
| WARNING | 2 (major 1 · minor 1) |
| RECOMMENDATION | 9 |
| Não testado | 4 |

Principais: **QA2-001** (tirar dos salvos pela lista/detalhe apaga o monitoramento sem aviso nem desfazer), **QA2-002** (depois de um 401 no meio da sessão os marcadores de salvo/monitorado continuam na tela com o shell já deslogado), **QA2-003** (401 numa ação mostra "Não foi possível … Tente de novo" em vez de "Sua sessão expirou").

---

## Resultados por área

### 1. Sessão
| Verificação | Resultado |
| --- | --- |
| Shell anônimo em `/search`: botão "Entrar", sem sino | PASS (`t1-anon-search.png`) |
| Shell logado: sino "Notificações", botão "Conta de QA Usuário A" com iniciais "QA" (avatarUrl null → primeira + última palavra) | PASS (`t2-import-toast.png`) |
| Menu da conta: iniciais, nome, e-mail, "Configurações", "Sair" | PASS |
| "Sair" → `/` (landing), `GET /auth/session` 401, shell com "Entrar" e sem sino | PASS |
| `/monitoring` deslogado → `/login?returnTo=%2Fmonitoring` | PASS |
| Login (dev-login) em `/login?returnTo=/monitoring` + reload → vai para `/monitoring` e a página carrega | PASS |
| "Sair" em `/settings` também funciona | PASS |

### 2. Importação do legado
| Verificação | Resultado |
| --- | --- |
| `licita-saved-tenders = ["00394700000108-1-000394-2026","nao-existe"]` antes do login → toast "1 edital salvo neste navegador foi adicionado à sua conta · 1 edital não existe mais na base e ficou de fora." | PASS (`t2-import-toast.png`) |
| Chave removida do localStorage | PASS |
| Edital aparece em `/saved-tenders` e em `saved_tenders` no banco | PASS |

### 3. Salvar / monitorar
| Verificação | Resultado |
| --- | --- |
| Salvar pelo marcador da lista em `/search` (fica preenchido, `aria-pressed=true`, linha no banco) | PASS (`t3-save-list.png`) |
| Tirar dos salvos pelo marcador (linha some do banco; anúncio sr-only "Edital removido dos salvos") | PASS — sem toast/desfazer na lista (o próprio marcador desfaz); ver QA2-001 para editais monitorados |
| Salvar pela visão tabela | PASS com ressalva: coluna fora da tela em 1440 (QA2-004) |
| Detalhe desktop: "Monitorar" → "Monitorando" + toast "Edital monitorado"; desligar volta a "Monitorar" | PASS (`t3-detail-monitored.png`) |
| Barra mobile 375: monitorar edital não salvo salva + monitora (`monitored=t`), botão salvar vira "Salvo" | PASS (`t3-mobile-bar.png`, `t3-mobile-toast.png`) |
| `/saved-tenders`: remover edital monitorado → toast "Edital removido dos salvos" + Desfazer → volta salvo **e monitorado** | PASS |
| `/saved-tenders`: exportar CSV → `editais-salvos-2026-09-23.csv`, `;`, 11 colunas PT-BR, 3 linhas, toast "3 editais exportados" | PASS |
| `/monitoring` aba "Editais monitorados 1" lista o edital | PASS |
| "Parar de monitorar" → toast "Edital deixou de ser monitorado · Ele continua em Editais salvos." + Desfazer → volta monitorado; contador da aba atualiza | PASS (`t3-stop-monitor.png`) |
| Estado consistente depois de reload: `/search` (3 marcadores), `/tenders/:id` (Salvo + Monitorando), `/me/saved-tenders/ids` | PASS |
| Paginação de `/saved-tenders` | NÃO TESTADO — PAGE_SIZE 50 e só há 19 editais na base |

### 4. Buscas salvas
| Verificação | Resultado |
| --- | --- |
| `/search?q=serviços&status=open&state=DF` → "Salvar busca" abre diálogo com nome "serviços", resumo (Termo, Status, UF) e switch de alertas ligado | PASS (`t4-save-dialog.png`) |
| Salvar → toast "Busca salva" + "Ver buscas salvas"; botão vira "Busca salva"; query canônica `q=servi%C3%A7os&status=open&state=DF` | PASS |
| URL com parâmetros em outra ordem continua reconhecida como "Busca salva" | PASS |
| Clicar em "Busca salva" leva a `/saved-searches` (evita duplicar pela UI) | PASS |
| Renomear inline (foco vai para o input, Enter salva, lista reordena por `updatedAt`) | PASS |
| Alternar alertas (banco `alerts_enabled` f/t) | PASS |
| "Abrir busca" → `/search?q=servi%C3%A7os&status=open&state=DF`, 8 resultados, botão "Busca salva" | PASS |
| Excluir → diálogo de confirmação "Excluir “dup QA”?" → contador 2→1 → Desfazer → 2 | PASS (`t4-delete-confirm.png`); ver QA2-012 |
| Duplicata via API (`POST` com a mesma query em outra ordem) | 201, aceita — ver QA2-008 |
| 409 de limite (50) | NÃO TESTADO (instruído a pular); o texto existe em `save-search-button.tsx` |

### 5. Notificações (5 linhas inseridas no banco, prefixo `qa-test-`; mais 18 lidas para paginação)
| Verificação | Resultado |
| --- | --- |
| Polling de 60 s: página aberta antes do insert passou a mostrar badge **4** sem reload após ~65 s (aba visível) | PASS |
| Popover: tipos com texto em PT-BR ("Prazo alterado · De 02 de out de 2026, 10:00 para 09 de out de 2026, 10:00", "Status alterado · De Aberto para Em análise", "2 editais novos em “Serviços DF abertos”", "Valor alterado · De R$ 64.610 para R$ 70.000", "Novo documento · Documento: QA-TEST Anexo II.pdf"), ponto de não lida, tempo relativo | PASS (`t5-popover.png`) |
| Clicar em notificação de edital → `/tenders/03288908…`, marcada como lida, badge 4→3 | PASS |
| Clicar em notificação de busca → `/search?q=…`, marcada como lida; `new_matches_count` 0 | PASS; ver QA2-013 |
| `/monitoring` Notificações: filtros Todas / "Não lidas (2)" com `aria-pressed`, lista filtrada | PASS |
| Paginação (23 itens, 20 por página): 1–20 → 21–23 | PASS com texto errado (QA2-005) |
| "Marcar todas como lidas" (popover): badge some, botão desabilita, banco 0 não lidas | PASS |
| Card "Monitoramento" do dashboard: "2 notificações não lidas · 1 edital monitorado" → "Nenhuma notificação não lida" após marcar todas | PASS |

### 6. Isolamento e erros
| Verificação | Resultado |
| --- | --- |
| Usuário B (navegador): `/saved-tenders`, `/saved-searches`, `/monitoring` vazios; shell "QA Usuário B / QB" | PASS |
| `curl` com jar de B contra a busca de A: `GET` lista vazia; `PATCH`, `DELETE`, `POST /seen` → 403 `FORBIDDEN`; banco inalterado | PASS |
| B `POST /me/notifications/read {ids:["qa-test-1"]}` e `{all:true}` → 200 sem efeito nas notificações de A (conferido no banco) | PASS |
| B `DELETE /me/saved-tenders/<id salvo por A>` → 204 sem efeito nos salvos de A | PASS |
| 401 em página protegida (`/saved-searches`, sessão apagada no banco, alternar alertas) → `/login?returnTo=%2Fsaved-searches` | PASS no redirecionamento; FAIL na mensagem (QA2-003) |
| 401 em página pública (`/search`, tirar dos salvos) → shell vira "Entrar" | PASS parcial; ver QA2-002 e QA2-003 (`t6-401.png`) |
| 403 CSRF via `curl`: `Origin: http://127.0.0.1:24252` → 403 "CSRF validation failed"; sem `X-Requested-With` → 403; sem `Origin` → 403. Via host `127.0.0.1` o cookie de `localhost` não vai junto → 401 antes do CSRF | PASS (documentado); ver QA2-010 e QA2-011 |

### 7. Regressão
| Verificação | Resultado |
| --- | --- |
| Deslogado: `/`, `/search`, `/tenders/:id`, `/dashboard`, `/login` carregam com "Entrar" e sem sino (375 e 1440) | PASS |
| Sem scroll horizontal de página em 375 e 1440: `/saved-searches`, `/monitoring`, `/settings`, `/login` (e `/saved-tenders`, `/search`, `/dashboard`) | PASS (`scrollWidth ≤ innerWidth` em todos; `t7-375-*.png`) |
| Console: nenhum erro além dos 2 `console.error` esperados dos 401 forçados | PASS |
| Visão tabela não gera mais scroll de página em 1440 (QA-001 do Ciclo 1) | PASS |

### Não testado
- Paginação de `/saved-tenders` (19 editais, página de 50).
- 409 de limite de buscas salvas e de editais salvos.
- Como a UI mostra um 403 no navegador (só `curl`).
- OAuth Google real (`/auth/google/start` responde 500 sem credenciais; ver QA2-009).

---

## FAIL

### QA2-002 — Depois de um 401 no meio da sessão, salvos/monitorados continuam marcados com o shell deslogado · FAIL · minor
- **Página / viewport:** `/search`, 1440×900.
- **Repro:** logar como A com 2 editais salvos → abrir `/search` → apagar as sessões de A no banco → clicar em qualquer marcador.
- **Esperado:** ao detectar o 401, o shell passa a anônimo **e** os dados `['me', …]` saem do cache, como no "Sair" explícito.
- **Obtido:** o shell mostra "Entrar", mas os dois editais continuam com `aria-label="Remover dos salvos"`, `aria-pressed=true` (conferido 3 s depois). Um visitante deslogado vê o estado do usuário anterior.
- **Evidência:** `t6-401.png`; `eval` → `["Salvar edital:false","Remover dos salvos:true","Remover dos salvos:true",…]`.
- **Arquivos suspeitos:** `src/App.tsx:23-25` (`onUnauthenticated` só invalida `queryKeys.session`, não faz `removeQueries(queryKeys.me.all)`); `src/features/saved-tenders/hooks/use-saved-tenders.ts` (`saved`/`monitored` saem de `ids.data` mesmo quando `enabled` virou false).

### QA2-003 — 401 numa ação mostra erro genérico em vez de "Sua sessão expirou" · FAIL · minor
- **Repro:** (a) `/saved-searches`, apagar a sessão, alternar alertas; (b) `/search`, apagar a sessão, tirar um edital dos salvos.
- **Esperado:** "Sua sessão expirou · Entre novamente…" (esse texto já existe em `components/common/query-states.tsx:64`), e a tela de login explica por que o usuário voltou para ela.
- **Obtido:** (a) toast "Não foi possível desligar os alertas · Tente de novo. ref. 6532287b-…" e redirecionamento para `/login?returnTo=%2Fsaved-searches` sem nenhuma menção a sessão; (b) toast vermelho "Não foi possível remover o edital · Tente de novo. ref. ede87743-…". "Tente de novo" não resolve: o usuário precisa entrar de novo.
- **Arquivos suspeitos:** `errorDescription` em `src/features/saved-tenders/hooks/use-saved-tenders.ts` e equivalentes em `src/features/saved-searches/saved-searches-page.tsx`, `src/features/search/components/save-search-button.tsx`, `src/components/app-shell.tsx:396`; `src/features/auth/auth-page.tsx` (sem estado "sessão expirou").

### QA2-005 — Paginação das notificações diz "oportunidades" · FAIL · minor
- **Página:** `/monitoring`, aba Notificações, 23 notificações.
- **Obtido:** "Mostrando 1–20 de 23 oportunidades" / "Mostrando 21–23 de 23 oportunidades".
- **Esperado:** "notificações" (e "editais" na aba de monitorados).
- **Arquivos suspeitos:** `src/features/search/components/search-pagination.tsx` (substantivo fixo) reutilizado por `src/features/monitoring/monitoring-page.tsx`.

## WARNING

### QA2-001 — Tirar dos salvos pelo marcador apaga o monitoramento sem aviso nem desfazer · WARNING · major
- **Página:** `/search` (lista e tabela); o mesmo `toggle` é usado pelo botão "Salvo" do detalhe.
- **Repro:** monitorar `03288908000483-1-000042-2026` → em `/search`, clicar no marcador preenchido do card.
- **Obtido:** `DELETE` imediato; a linha some de `saved_tenders` (`monitored=t` perdido). Sem confirmação, sem toast e sem desfazer. Salvar de novo pelo marcador **não** devolve o monitoramento.
- **Esperado:** para edital monitorado, um toast "Edital removido dos salvos e do monitoramento" com Desfazer que restaure `monitored` (como `/saved-tenders` já faz), ou confirmação.
- **Arquivos suspeitos:** `src/features/tenders/components/save-button.tsx`, `src/features/saved-tenders/hooks/use-saved-tenders.ts` (`toggle`).

### QA2-004 — Visão tabela em 1440: coluna de salvar fica fora da área visível · WARNING · minor
- **Página / viewport:** `/search?view=table`, 1440×900.
- **Obtido:** a tabela (`scrollWidth 960`) está num wrapper de 792 px com `overflow:auto`; o botão salvar fica em `x=1497` (viewport 1440). As colunas UF e salvar só aparecem com rolagem horizontal dentro da tabela, sem indicação visual.
- **Esperado:** ação de salvar visível sem rolar em desktop comum (coluna fixa à direita, ou salvar junto do título).
- **Evidência:** `t3-table-1440.png`.
- **Arquivo suspeito:** `src/features/search/components/results-table.tsx`.

## RECOMMENDATION

- **QA2-006 — Toast com Desfazer dura ~5 s e `TOAST_LIMIT = 1`.** Qualquer toast novo substitui o Desfazer anterior, e 5 s é pouco para uma ação de desfazer (WCAG 2.2.1). Sugestão: `duration` ≥ 10 s em toasts com ação. `src/hooks/use-toast.ts`, `src/components/ui/toast.tsx`.
- **QA2-007 — `/saved-tenders` não indica nem alterna monitoramento.** Não há selo "Monitorando" nem botão por linha; só dá para saber abrindo o edital ou indo a `/monitoring`. `src/features/saved-tenders/saved-tenders-page.tsx`.
- **QA2-008 — Backend aceita buscas salvas duplicadas.** `POST /me/saved-searches` com a mesma query canônica responde 201. A UI evita duplicatas, mas duas buscas iguais com alerta geram notificações em dobro. Sugestão: 409 ou devolver a existente (backend, Codex).
- **QA2-009 — `/api/v1/auth/google/start` sem credenciais responde 500 JSON cru.** "Entrar com Google" (e salvar/monitorar deslogado) leva o navegador a uma página `{"error":{"code":"INTERNAL_ERROR",…}}`. Sugestão: 302 para `/login?error=oauth_failed` (backend). É esperado enquanto as credenciais não chegam, mas a falha precisa ser tratada.
- **QA2-010 — `dev-login` não valida `Origin`** (criou usuário com `Origin: http://127.0.0.1:24252`). Só existe em dev com flag. Baixo risco; vale aplicar a mesma checagem por consistência (backend).
- **QA2-011 — Recurso de outro usuário responde 403, inexistente responde 404.** Segue o contrato, mas revela que o id existe. Com UUID o risco é baixo; considerar 404 nos dois casos em v2.
- **QA2-012 — Desfazer recria em vez de restaurar.** Desfazer a exclusão de busca cria outro id (`0caa…`→`ff2a…`), zerando `lastCheckedAt`/`newMatchesCount`. Desfazer a remoção de edital salvo muda `savedAt` e o edital vai para o topo. Para desfazer de verdade, a exclusão precisaria ser adiada até o toast fechar, ou haver soft-delete.
- **QA2-013 — Notificação "N editais novos" abre só a busca.** Os `tenderIds` da notificação não são destacados nos resultados. Sugestão: marcar "novo" nesses ids ou filtrar por eles.
- **QA2-014 — Pequenos ajustes de UI.** (a) Na barra mobile do detalhe, o botão de monitorar mantém `aria-label="Monitorar edital"` quando ativo, mas o de salvar muda para "Salvo". Para consistência com o desktop, usar "Monitorando". (b) A aba ativa de `/monitoring` não fica na URL, então reload e link voltam para Notificações. (c) As abas de `/settings` em 375 mostram barra de rolagem visível. (d) Os switches "Alertas" em `/saved-searches` têm o mesmo nome acessível; usar "Alertas de “<nome>”".

---

## Limpeza (SQL executado)

Inserção de teste:
```sql
-- /tmp/claude-li/qa2/insert.sql: 5 notificações qa-test-1..5 para qa.user.a@teste.dev
-- (tender_deadline_changed, tender_status_changed, saved_search_new_matches, tender_value_changed [lida], tender_document_added)
INSERT INTO notifications (id,user_id,type,dedupe_key,created_at,read_at,tender_id,tender_title,tender_number_short,change,saved_search_id,saved_search_name,saved_search_query,match_count,tender_ids) SELECT 'qa-test-1', … ;
-- 18 notificações lidas para paginação
INSERT INTO notifications (id,user_id,type,dedupe_key,created_at,read_at,tender_id,tender_title,tender_number_short,change)
SELECT 'qa-test-p'||g, u.id, 'tender_status_changed', 'qa-test-p'||g, now() - (g||' days')::interval - interval '5 days', now(), t.id, t.title, '43/2026',
       '{"field":"status","from":"open","to":"under_review"}'::jsonb
FROM users u, tenders t, generate_series(1,18) g WHERE u.email='qa.user.a@teste.dev' AND t.id='03288908000483-1-000042-2026';
UPDATE notifications SET read_at = NULL WHERE id IN ('qa-test-1','qa-test-5');          -- teste de isolamento
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email='qa.user.a@teste.dev');  -- 2x, forçar 401
```
Limpeza (todas as FKs de `sessions`, `saved_tenders`, `saved_searches`, `notifications` → `users` são `ON DELETE CASCADE`, conferido com `\d`):
```sql
DELETE FROM users WHERE email = 'qa.x@teste.dev';          -- criado pelo teste de dev-login com Origin 127.0.0.1
DELETE FROM notifications WHERE id LIKE 'qa-test-%';        -- 23 linhas
DELETE FROM users WHERE email IN ('qa.user.a@teste.dev','qa.user.b@teste.dev','qa.x@teste.dev');  -- 2 linhas (cascade)
```
Estado final: `users 0 · sessions 0 · saved_tenders 0 · saved_searches 0 · notifications 0`, igual ao início. O localStorage terminou só com `licita-theme` e `licita-sidebar-collapsed`, os mesmos valores do início; `licita-saved-tenders` não existia antes e foi consumido pela importação. A aba terminou deslogada (`/auth/session` 401) e foi fechada. Os cookie jars do `curl` foram apagados.
