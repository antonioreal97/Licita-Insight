```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-009

Feature: Onda 2 — alertas por e-mail (Resend): digest diário + imediato para críticos, preferências e descadastro

Priority: P0 (docs/roadmap-monetizacao.md, Onda 2). Branch: antonioreal97/cycle4 (main 1b5ed5d + seu fix de datas 079b7bd).

Decisões do owner (24 set 2026, não reabrir sem ele):
  - Provedor: Resend.
  - Padrão: digest diário às 07:00 (America/Sao_Paulo) + envio imediato para eventos críticos.
  - Opt-out em um clique (LGPD).

Proposta de forma pública (você decide schema/internals; registre o final em docs/contracts/account-v1.md, seção "E-mail"):

  1. Preferências (sessão; FORA do gate de assinatura — gerenciar/desligar e-mail é direito do titular):
     GET  /api/v1/me/notification-preferences →
       { email: { digest: 'daily' | 'off', immediateCritical: boolean }, emailAddress: string, updatedAt: string | null }
     PUT  /api/v1/me/notification-preferences (CSRF) → mesmo shape; corpo parcial { email?: { digest?, immediateCritical? } }.
     Default para conta nova e existente: digest 'daily', immediateCritical true.

  2. Descadastro em um clique (público, sem sessão):
     POST /api/v1/email/unsubscribe { token, scope: 'all' | 'digest' | 'immediate' } → 200 { scope, email: {digest, immediateCritical} }
     Token assinado (HMAC, sem expiração curta), sem dados pessoais legíveis. Link nos e-mails aponta para a página do app
     /descadastro?token=...&scope=all. Cabeçalhos List-Unsubscribe + List-Unsubscribe-Post (RFC 8058) chamando a API com POST.
     Token inválido → 400 INVALID_PARAMETER.

  3. Envio:
     - Mailer Resend (RESEND_API_KEY, MAIL_FROM, opcional MAIL_REPLY_TO). Sem chave: log de warning e entrega marcada 'skipped'.
     - Tabela de entregas (canal, notificação(ões), status queued|sent|failed|skipped, tentativas, erro, providerMessageId),
       idempotente pelo dedupeKey que já existe. Retry com backoff para falha transitória.
     - Digest: diário às 07:00 BRT (configurável por env), um e-mail por usuário com notificações ainda não enviadas por e-mail
       desde o último digest (lidas ou não); não envia se vazio.
     - Imediato (se immediateCritical): mudança de prazo (tender_deadline_changed) e mudança de status para suspenso/revogado
       (tender_status_changed) de edital monitorado; agrupar eventos do mesmo usuário numa janela curta (ex. 10 min).
       trial_ending também vai por e-mail uma vez.
     - Só envia para quem tem acesso (teste vigente/assinatura/dev) — exceto o e-mail de trial_ending.
     - Sem pixel de rastreamento nem links encurtados de tracking.
  4. Desacoplar a avaliação de buscas salvas do fim da coleta PNCP (roadmap 2.5): job próprio com intervalo configurável.
  5. Conteúdo: PT-BR, HTML simples + texto puro, marca LicitAI, cada item com objeto (truncado), órgão, prazo e link para
     /tenders/:id ou /search?<query>; rodapé com "por que você recebeu", link de preferências (/settings#notificacoes) e
     descadastro. Não inventar dados; usar os snapshots das notificações.

Acceptance criteria:
  - testes: preferências (default, PUT parcial, CSRF, fora do gate), token de descadastro (válido/inválido/escopos),
    digest (agrupamento, vazio não envia, idempotência, horário BRT), imediato (só críticos, só monitorados, janela de
    agrupamento), sem chave Resend → skipped, sem acesso → sem e-mail (exceto trial_ending), buscas salvas por job próprio.
  - typecheck, build e testes do api-server passando; OpenAPI + codegen.

Frontend (Claude, em paralelo, contra esta proposta): seção "Notificações" real em /settings (id="notificacoes"),
página pública /descadastro, e textos de landing/configurações que hoje dizem "sem e-mail".
Mock already implemented: NO. Blocking: SIM para a integração da UI.
Processo: commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-009-email-alerts.md
```
