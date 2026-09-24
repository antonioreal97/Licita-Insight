```text
CODEX_HANDOFF

ID: CODEX_HANDOFF-007

Feature: Onda 1 — teste de 14 dias, plano único e oportunidades culturais atrás do gate

Priority: P0 (Onda 1 do docs/roadmap-monetizacao.md, reescrita com as decisões do owner de 24 set 2026)

Decisões do owner (não reabrir sem ele):
  - Entrada = teste de 14 dias com acesso completo (sem gratuito permanente).
  - Plano único, valor BILLING_MONTHLY_BRL (sem Starter/Pro, sem limites por plano).
  - Oportunidades culturais só para quem tem acesso (teste vigente ou assinatura).

Backend requirement (proposta de forma pública; você decide schema/internals):
  1. Teste: começa no primeiro login (criação do usuário) e dura 14 dias. Usuários que já existem
     ganham 14 dias contados da migração. entitled = assinatura elegível OU teste vigente OU dev.
  2. BillingResponse (aditivo): trialEndsAt: string | null; source passa a
     'subscription' | 'trial' | 'dev' | null (prioridade: subscription > trial > dev). Checkout
     permitido durante o teste; ao ativar assinatura, source vira 'subscription'.
     Proposta: pagar durante o teste não "perde" dias — a 1ª cobrança/período começa no fim do teste
     se o Asaas permitir (nextDueDate); se complicar, documente e siga com cobrança imediata.
  3. Um teste por conta Google, também depois de DELETE /api/v1/me: guardar um tombstone mínimo
     (hash com segredo do sub do Google + data), documentado como finalidade antiabuso (LGPD:
     dado mínimo, sem e-mail/nome). Recriar conta com o mesmo Google → sem novo teste.
  4. Notificação no app `trial_ending` 3 dias antes do fim (idempotente, 1 por usuário). Adicionar ao
     NotificationType do contrato. (O "teste acabou" a UI mostra a partir do billing.)
  5. Oportunidades culturais: GET /api/v1/opportunities e /:id passam a exigir sessão + acesso
     (anônimo 401, sem acesso 402 SUBSCRIPTION_REQUIRED). Coleta diária inalterada. Atualizar
     docs/contracts/opportunities-v1.md.
  6. Rota pública GET /api/v1/billing/plan → { monthlyBrl: number | null, trialDays: 14, currency: 'BRL' }
     (sem auth; para landing e login). monthlyBrl null quando não configurado.

Contrato: atualizar docs/contracts/account-v1.md (seção Assinatura + NotificationType),
opportunities-v1.md, OpenAPI + codegen.

Acceptance criteria:
  - testes: teste vigente libera /me e culturais; teste expirado → 402; assinatura prevalece sobre teste;
    migração dá 14 dias aos usuários existentes; recriar conta não gera novo teste; trial_ending uma vez
    só e 3 dias antes; /billing/plan público; BILLING_DEV_ENTITLED continua funcionando.
  - typecheck, build e testes do api-server passando.

Frontend (Claude/Gemini, em paralelo, contra este contrato): selo "Teste · N dias", aviso nos últimos
3 dias, tela de assinatura ao expirar, "14 dias grátis" na landing/login com preço de /billing/plan,
paywall nas culturais, e a seção "Seus dados" (export/exclusão) do HANDOFF-006 em /settings.

Mock already implemented: NO. Blocking: SIM para a integração da UI de teste.
Processo: branch antonioreal97/cycle3; commite só seus paths (`git commit -- <paths>`).
Resposta esperada: docs/handoffs/CLAUDE_HANDOFF-007-trial.md
```
