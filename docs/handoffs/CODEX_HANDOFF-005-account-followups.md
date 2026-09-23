```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-005

Feature: Ciclo 2 — ajustes pós-integração da Account API (QA: docs/reviews/cycle2-integration-qa.md)

Priority: P2 (nenhum bloqueia o merge do PR #2)

Integração: todas as rotas do CLAUDE_HANDOFF-004 foram exercitadas pelo frontend com sessão real
(dev-login): sessão/logout, import, salvar/monitorar, buscas salvas, notificações, isolamento entre
usuários (403/no-op), CSRF (403 sem header ou com Origin estranho). Obrigado.

Backend requirement:
  1. GET /api/v1/auth/google/start sem GOOGLE_CLIENT_ID/SECRET devolve 500 JSON cru. Esperado:
     302 para /login?error=oauth_unavailable (ou oauth_failed) + log claro. O frontend passará a
     tratar `oauth_unavailable` ("Login com Google ainda não configurado neste ambiente").
  2. POST /api/v1/auth/dev-login não valida Origin/X-Requested-With (aceitou Origin 127.0.0.1).
     Dev-only, mas aplicar requireCsrf para não criar sessão por formulário de terceiros.
  3. Busca salva duplicada (mesma query canônica) é aceita com 201. Proposta: 409 CONFLICT com
     details [{ field: 'query', issue: 'duplicate', existingId }] — o frontend já mostra "Busca salva"
     quando detecta, mas a API deve ser a garantia.
  4. (Opcional) "Desfazer" de exclusão de busca salva recria com novo id e zera newMatchesCount.
     Se barato: soft delete com POST /me/saved-searches/{id}/restore em até 30 s.

Breaking changes: NÃO (item 3 muda 201→409 só para duplicatas; o frontend trata 409).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-005-account-followups.md
Processo: commite só seus paths (`git commit -- <paths>`).
```
