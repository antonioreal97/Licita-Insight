```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-004

Feature: Ciclo 2 — Login Google, editais salvos/monitorados, buscas salvas e notificações no app

Objective:
  Tornar reais os passos SAVE → MONITOR do fluxo. Contrato público completo:
  docs/contracts/account-v1.md (fonte da verdade da forma pública; você decide schema e internals).

Priority: P0

Decisões do owner (não reabrir sem ele):
  - Login: Google OAuth (authorization code + PKCE no servidor), sem Supabase/Lovable/Netlify Identity.
  - Alertas: somente dentro do app neste ciclo (sem e-mail).
  - Monitorar: editais específicos E buscas salvas.

Frontend context:
  Hoje "Salvar" usa localStorage, "Monitorar" / "Salvar busca" / sino estão "em breve".
  O frontend vai: chamar a API pela mesma origem (proxy Vite /api → :3001), mandar cookies,
  enviar X-Requested-With: licita-insight nas mutações, proteger /saved-tenders, /saved-searches,
  /monitoring, /settings; migrar ids do localStorage via /me/saved-tenders/import após o 1º login;
  consultar /me/notifications/unread-count a cada 60 s com a aba visível.

Backend requirement:
  1. Tabelas (nomes a seu critério): users, sessions, saved_tenders (com monitored), saved_searches,
     notifications, + o necessário para diff de campos monitorados. Migrations via lib/db.
  2. Rotas de docs/contracts/account-v1.md §1–4, OpenAPI + codegen.
  3. Geração de notificações integrada à coleta/revisão PNCP (§4 "Regras de geração"),
     idempotente e sem notificar na primeira ingestão.
  4. Segurança: cookie HttpOnly/SameSite=Lax/Secure fora de dev; sessões revogáveis; CSRF por
     X-Requested-With + Origin; validação de returnTo (só caminho relativo); e-mail verificado do
     Google; nenhum segredo no repositório; CORS deixa de ser aberto (`cors()` hoje) — restringir à
     origem pública ou remover, já que o frontend passa a usar proxy de mesma origem.
  5. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_APP_ORIGIN (ex. http://localhost:24252),
     SESSION_SECRET, AUTH_DEV_LOGIN (opcional, dev only). Documentar em .env.example e docs.
  6. Rota POST /api/v1/auth/dev-login SOMENTE com NODE_ENV!=='production' && AUTH_DEV_LOGIN=true,
     para QA sem conta Google. Deve ser impossível habilitá-la em produção.

Method / Parameters / Filters / Sorting / Pagination / Expected response / Expected errors:
  Conforme docs/contracts/account-v1.md. Paginação no mesmo formato de search-v1.

Authentication: sessão por cookie (acima). /api/v1/tenders/* continuam públicas.

Performance expectations: ver contrato (p95 < 100 ms para session/ids/unread-count).

Acceptance criteria:
  - OAuth completo funcionando com credenciais reais quando configuradas (o owner cria o client
    no Google Cloud; redirect URI = PUBLIC_APP_ORIGIN + /api/v1/auth/google/callback)
  - dev-login funciona localmente e retorna 404 quando desabilitado
  - testes: sessão/expiração/logout, CSRF (sem header → 403), isolamento entre usuários
    (usuário A não lê/altera dados de B), import com ids inexistentes, limites 409,
    geração de notificação por mudança de prazo/status/documento/valor, sem duplicata,
    sem notificar na 1ª ingestão, busca salva com editais novos
  - typecheck, build e testes do api-server passando

Mock already implemented: NO (regra do owner: sem fixtures no frontend). O frontend constrói contra
  os tipos do contrato e integra quando você sinalizar READY.

Blocking: SIM para a integração do frontend; o frontend adianta a infraestrutura (proxy, sessão,
  guardas de rota, telas) em paralelo.

Contract changes: se precisar mudar a forma pública, responda com a proposta antes de implementar.

Processo: worktree e índice git compartilhados — commite só seus paths (`git commit -- <paths>`).
  Frontend: artifacts/licitainsight/**, design-system/**, docs/contracts/account-v1.md é co-editável
  (anote mudanças numa seção "Decisões do backend").

Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-004-account.md
```
