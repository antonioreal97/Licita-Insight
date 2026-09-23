```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-006

Feature: Assinatura de desenvolvimento (roadmap 0.6) + LGPD da conta: exportar dados e excluir conta (roadmap 1.7b)

Priority: P1 (0.6 destrava o QA de todas as próximas ondas) · P1 (1.7b é pré-requisito para cobrar em produção)

Contexto: docs/roadmap-monetizacao.md (revisado contra main @ 434775f). Branch de trabalho: antonioreal97/cycle3.

1) Assinatura de desenvolvimento (0.6)
  - Env BILLING_DEV_ENTITLED=true, respeitada somente quando NODE_ENV !== 'production'
    (mesmo padrão de AUTH_DEV_LOGIN; impossível ligar em produção).
  - Com a flag, isEntitled() trata qualquer usuário autenticado como assinante ativo.
    GET /api/v1/me/billing deve refletir isso de forma honesta (ex.: `entitled: true` e um campo
    `source: 'dev'` ou equivalente), para a UI não mostrar "assinatura ativa" como se fosse paga.
  - Log de warning no boot quando a flag estiver ativa. Documentar em .env.example.
  - Aceite: com a flag, /me/* responde normalmente sem linha em subscriptions; sem a flag, 402 como hoje;
    com NODE_ENV=production a flag é ignorada (teste).

2) LGPD da conta (1.7b) — rotas novas, fora do gate de assinatura (todo usuário autenticado precisa delas)
  - GET /api/v1/me/export → 200 JSON (Content-Disposition attachment, nome licitai-dados-<data>.json):
    user (sem segredos), sessions ativas (sem token/hash), saved_tenders, saved_searches (incl. soft-deleted
    ainda retidas), notifications, subscription (status, período; sem dados de cartão, que ficam no Asaas).
  - DELETE /api/v1/me → 204. Exige CSRF (X-Requested-With + Origin) e corpo { confirm: "EXCLUIR" }
    (sem isso → 400 INVALID_PARAMETER). Cancela a assinatura no Asaas quando houver (falha no Asaas não
    deve deixar a conta meio apagada: definir ordem/compensação e documentar), apaga users em cascata,
    revoga sessões e limpa o cookie.
  - Registrar no contrato docs/contracts/account-v1.md (seção "LGPD") e no OpenAPI + codegen.
  - Aceite: testes de export (isolamento entre usuários, sem hash de sessão), delete (cascata completa,
    cookie limpo, sessão revogada, sem confirm → 400, sem CSRF → 403), assinatura cancelada/compensação.

Frontend (Claude): consome as duas rotas em /settings (seção "Seus dados") depois do seu READY.
Mock already implemented: NO (regra do owner). Blocking: NO para o backend; frontend espera o READY.
Processo: worktree e índice git compartilhados — commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-006-dev-entitlement-lgpd.md
```
