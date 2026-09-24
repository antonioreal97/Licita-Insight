# GEMINI_TASK-002 — "7 dias grátis" na landing e no login

**De:** Claude Orchestrator · **Para:** agente Gemini (Antigravity CLI) · **Prioridade:** P1 · **Branch:** `antonioreal97/cycle3`

> **ATUALIZAÇÃO:** o owner mudou o teste de 14 para **7 dias**. Use sempre `trialDays` da API; o texto fixo de fallback é 7.

## Contexto (leia antes)

- Regras: `AGENTS.md`, `.cursorrules`, `memory-bank/systemPatterns.md`; design system em `design-system/*.md`.
- Decisões do owner (24 set 2026): **teste de 7 dias** com acesso completo, **plano único** (valor de `BILLING_MONTHLY_BRL`),
  **oportunidades culturais só para quem tem acesso**. Roadmap: `docs/roadmap-monetizacao.md` (Onda 1).
- Contrato: `docs/handoffs/CODEX_HANDOFF-007-trial.md` item 6 — rota pública `GET /api/v1/billing/plan`
  → `{ monthlyBrl: number | null, trialDays: number, currency: 'BRL' }`.
- Regras do owner: PT-BR; **nunca inventar preço** — se `monthlyBrl` for `null` ou a rota falhar, não mostre valor
  (mostre só "7 dias grátis"); erros visíveis sem quebrar a página; menos código; tokens do DS, nada de cor crua.

## Dependência

O agente Claude vai criar o hook `usePublicPlan()` em
`artifacts/licitainsight/src/features/billing/hooks/use-public-plan.ts` com esta assinatura:

```ts
export function usePublicPlan(): UseQueryResult<{ monthlyBrl: number | null; trialDays: number; currency: 'BRL' }>;
```

Importe dele. **Não crie esse arquivo.** Se ainda não existir quando você precisar, aguarde e verifique de novo
(`ls` no caminho). Formate valores com `formatCurrency` de `src/lib/format.ts`.

## Tarefas

1. **Landing** (`src/features/landing/landing-page.tsx`):
   - CTA principal e secundário deixam claro "Comece com 7 dias grátis" (`trialDays` do hook; fallback 7 só
     enquanto carrega, sem piscar valor errado).
   - Nova seção curta "Plano" antes do rodapé: um cartão único com o preço mensal (quando houver), o que está
     incluso (busca, salvar e monitorar editais, buscas salvas com alertas no app, oportunidades culturais),
     "7 dias grátis, sem cartão para começar" **somente se isso for verdade no fluxo** — o teste começa no login
     com Google e não pede pagamento, então é verdade — e CTA para `/login`.
   - Sem depoimentos, números de clientes ou selos inventados.
2. **Login** (`src/features/auth/auth-page.tsx`): uma linha abaixo do botão Google:
   "Ao entrar pela primeira vez, você ganha 7 dias de acesso completo." (usar `trialDays`). Não mexer no fluxo OAuth,
   nos erros nem no `returnTo`.

## Propriedade de arquivos

Somente `src/features/landing/landing-page.tsx` e `src/features/auth/auth-page.tsx`. **Não toque** em nenhum outro
arquivo (o Claude está em `features/billing`, `features/settings`, `features/opportunities`, `app-shell.tsx`, `src/api`,
`src/services`; o Codex no backend).

## Restrições

- Sem novas dependências. **Não faça commit, stash nem reset.**
- Prettier: `cd artifacts/licitainsight && ../../node_modules/.bin/prettier --write <arquivos>`.
- Manter `data-testid` existentes; novos: `section-plan`, `text-plan-price`, `link-plan-start`, `text-login-trial`.
- Acessibilidade: um `h1` por página, seção com `h2`, contraste AA (tokens).

## Aceite

- `cd artifacts/licitainsight && ../../node_modules/.bin/tsc -p tsconfig.json --noEmit` passa.
- Sem preço exibido quando `monthlyBrl` é `null`/erro (descreva como verificou).

## Resposta

`docs/handoffs/GEMINI_REPORT-002-trial-landing.md` com arquivos alterados, o que fez, evidência e pendências.
