# GEMINI_REPORT-002 — "7 dias grátis" na landing e no login

**Executado por:** Claude (engenheiro de frontend), em nome da tarefa `GEMINI_TASK-002` (o agente Gemini ficou sem cota).
**Branch:** `antonioreal97/cycle3` · **Data:** 24 set 2026 · **Sem commit, stash nem reset.**

## Arquivos alterados

- `artifacts/licitainsight/src/features/landing/landing-page.tsx`
- `artifacts/licitainsight/src/features/auth/auth-page.tsx`

Nenhum outro arquivo foi tocado, exceto este relatório. O hook `usePublicPlan()` já existia e foi só importado.

## O que foi feito

### Landing (`/`)

- **Dias de teste:** `useTrialDays()` lê `usePublicPlan().data?.trialDays`. O fallback 7 vale só enquanto carrega ou se a rota falhar.
- **CTA principal** (`link-hero-start`), para visitante: "Explorar o radar" → **"Comece com N dias grátis"**. Para quem já entrou, continua "Ir para a visão geral".
- **CTA secundário** do cabeçalho (`link-landing-register`): "Começar agora" → **"Testar N dias grátis"**.
- **Link "Plano"** no menu do cabeçalho (âncora `#plano`).
- **Nova seção "Plano"** (`section-plan`, `id="plano"`, `h2` "Um plano. Acesso completo."), antes do rodapé. É um cartão único com:
  - **Preço** (`text-plan-price`): "R$ 49,90 por mês", **só quando `monthlyBrl !== null`**. Enquanto carrega, aparece um skeleton (`role="status"`).
  - **Se `/billing/plan` falhar:** a linha `role="alert"` "Não foi possível carregar o valor da assinatura agora." aparece e **nenhum preço** é mostrado.
  - **Oferta:** "N dias grátis, sem cartão para começar." É verdade no fluxo: o teste começa no primeiro login com Google (`users.trial_ends_at`) e não pede pagamento.
  - **O que está incluso:** busca de editais do PNCP com filtros; salvar e monitorar editais; buscas salvas com alertas no app; oportunidades de fomento cultural.
  - **CTA** (`link-plan-start`): "Comece com N dias grátis" → `/login`. Para quem já está logado: "Ver minha assinatura" → `BILLING_HREF` (`/settings#assinatura`), para não oferecer um teste que a pessoa já usou.
  - **Nota:** "O teste vale uma vez por conta Google." É a mesma frase do `AccessPanel` e segue a regra do tombstone.
- **Sem invenções:** nenhum depoimento, número de clientes ou selo. Só tokens do DS (`bg-surface`, `border-border`, `text-muted-foreground`, `text-destructive`, `bg-inverse`…). Nenhuma cor crua.

### Login (`/login`)

- **Nova linha** abaixo do botão Google e da frase "Primeiro acesso?…": `text-login-trial` "Ao entrar pela primeira vez, você ganha N dias de acesso completo." (`trialDays` da API, fallback 7).
- **Sem mudanças** no fluxo OAuth, nos erros (`alert-auth-error`, `oauth_unavailable` segue sem botão e sem essa linha) e no `returnTo`.

### Decisão que diverge da tarefa

A tarefa pedia `formatCurrency`, mas ele usa `maximumFractionDigits: 0` e mostraria R$ 49,90 como "R$ 50". Isso é um preço inventado. Usei `formatCurrencyPrecise` ("R$ 49,90"), o mesmo que `settings-page.tsx` já usa para o plano.

## Evidências

- `tsc -p tsconfig.json --noEmit`: **passou** (exit 0). `prettier --check` nos 2 arquivos: ok.
- **Ambiente isolado:** banco `licita_qa_landing` (criado, `push-force`, **depois apagado**; a checagem de `pg_database` retornou 0), API em `:3005`, Vite em `:24256` com o proxy apontando para ela. As portas 3001/24252 do owner não foram tocadas. Tudo foi conferido numa aba própria do navegador do Orca, fechada no fim.

| Cenário | `/api/v1/billing/plan` | Resultado verificado (DOM + screenshot) |
| --- | --- | --- |
| Preço configurado (`BILLING_MONTHLY_BRL=49.90`), tema claro | `{"monthlyBrl":49.9,"trialDays":7}` | `text-plan-price` = "R$ 49,90 por mês"; hero "Comece com 7 dias grátis"; nav "Testar 7 dias grátis"; `link-plan-start` → `/login`; 1 `h1`; `h2` da seção presente |
| Mesmo, tema escuro | idem | cartão e CTA com contraste correto (tokens), sem override `dark:` |
| 375 px de largura | idem | `scrollWidth` 375 = largura da viewport (sem rolagem horizontal); cartão e CTA cabem |
| Sem preço (sem `BILLING_MONTHLY_BRL`) | `{"monthlyBrl":null,"trialDays":7}` | sem `text-plan-price`, nenhum "R$" na seção, nenhum alerta; "7 dias grátis, sem cartão para começar." |
| API parada (proxy → 500) | falha | página renderiza inteira; sem `text-plan-price` nem "R$"; alerta visível "Não foi possível carregar o valor da assinatura agora."; `/login` mostra a linha do teste (fallback 7) e o botão Google |
| `/login`, claro e escuro | 200 | 1 `h1`; `text-login-trial` = "Ao entrar pela primeira vez, você ganha 7 dias de acesso completo." |

## Pendências

- **CTA logado** ("Ver minha assinatura") não foi exercitado no navegador (o ambiente não tinha `AUTH_DEV_LOGIN`). A lógica é a mesma `status === 'authenticated'` do hero.
- **Comportamento antigo, fora do meu escopo:** com a API fora do ar, `useSession` fica em `loading` (por projeto, `use-session.ts`). Então o CTA do hero e o do cabeçalho mostram só o placeholder. A seção Plano continua com o CTA "Comece com 7 dias grátis". Se o owner quiser o CTA do hero também nesse caso, a mudança é em `use-session.ts`, que pertence a outra frente.
- **Menu mobile:** o cabeçalho mobile continua só com "Entrar", como antes. O CTA do hero e a seção Plano cobrem o teste no celular.
