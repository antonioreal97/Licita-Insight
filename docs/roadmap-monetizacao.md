# Roadmap de monetização — Pardal Digital

Origem: documento de análise competitiva (ConLicitação, Effecti, Siga Pregão) × escopo do Licita-Insight.
Este roadmap traduz aquela análise em épicos executáveis, corrigidos contra o **código que existe hoje** (23 set 2026).

Revisado pelo Claude Orchestrator contra `main @ 434775f` (rotas, gate de assinatura, códigos de erro, sequenciamento e LGPD).

---

## 0. Correção de premissas

O documento de análise descreve o produto como protótipo com mocks. O repositório está bem à frente disso. Antes de priorizar, o que muda:

| Afirmação no documento | Estado real no código |
| :--- | :--- |
| "Pesquisas salvas e alertas — ✅ Previsto" | **Implementado.** `savedSearchesTable`, `evaluateSavedSearchNotifications()`, rotas `/api/v1/me/saved-searches`, UI em `features/saved-searches`. |
| "Monitoramento de alterações — ✅ Previsto" | **Implementado.** `tenderChanges()` detecta mudança de prazo, status e valor; `createDocumentAddedNotifications()` detecta anexo novo. Dispara no upsert da coleta. |
| "Tags e favoritos — ✅ Previsto" | Salvar e monitorar existem (`savedTendersTable`, flag `monitored`). **Tags não existem.** |
| "Busca e filtros — core" | Implementado sobre Postgres, com facets, sugestões e contrato em [`docs/contracts/search-v1.md`](contracts/search-v1.md). Sem mocks. |
| (não citado) Paywall | **Já existe.** Assinatura mensal Asaas, `subscriptions`, gate `402 SUBSCRIPTION_REQUIRED` aplicado em `router.use("/v1/me", …)` — ou seja, em **todas** as rotas `/me` (salvar, monitorar, buscas, notificações) —, UI de checkout em Configurações. |
| (não citado) Fomento cultural | `cultural_opportunities` + `/oportunidades` — um diferencial que nenhum concorrente citado tem. |

**Conclusão que muda a prioridade:** o que falta para cobrar não é funcionalidade, é (a) **operação** — chaves Asaas, deploy, base nacional carregada — e (b) **embalagem** — hoje o gate é binário (assinante ou não), sem plano gratuito nem limites, e o alerta só existe dentro do app.

Nenhuma linha de IA, RAG ou embedding existe no código hoje (a busca semântica citada no [`AGENTS.md`](../AGENTS.md) cai para palavra-chave). Não há nenhuma infra de e-mail (`resend`/`nodemailer`/SMTP ausentes).

---

## 1. Princípio de priorização

Ordem por *razão de saída de dinheiro*, não por sofisticação:

1. **Destravar** o que já está pronto e não fatura (Onda 0).
2. **Embalar** em planos, para existir upgrade a vender (Onda 1).
3. **Entregar fora do app** — e-mail é o que faz a assinatura ser lembrada todo dia (Onda 2).
4. **Diferenciar** com IA no edital (Onda 3).
5. **Reter** com funil/CRM (Onda 4).
6. **Subir ticket** com inteligência de mercado e multi-CNPJ (Onda 5).

Robô de lances fica **fora do roadmap**: exige integração autenticada com Comprasnet/BEC/portais, operação em tempo real e responsabilidade jurídica sobre o lance. Reavaliar só depois da Onda 5.

---

## Onda 0 — Destravar a cobrança

**Objetivo:** primeiro real pago. Nada aqui é código novo de produto.

| # | Tarefa | Onde | Dependência | Pronto quando |
| :-- | :--- | :--- | :--- | :--- |
| 0.0 | Criar o OAuth Client (Web) no Google Cloud e preencher `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`; redirect URI = origem pública + `/api/v1/auth/google/callback` | Google Cloud, `.env` | — | login Google real funciona (hoje só `dev-login`) |
| 0.1 | Preencher `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `BILLING_MONTHLY_BRL` (sandbox) e `docker compose restart api` | `.env` | conta Asaas | `POST /api/v1/me/billing/checkout` devolve URL em vez de `503 BILLING_UNAVAILABLE` |
| 0.2 | Webhook Asaas apontando para a origem pública com o token | painel Asaas | 0.1 + 0.3 | pagamento sandbox vira `status=active` em `subscriptions` |
| 0.3 | Deploy online (API + Postgres + Vite), origem pública e `PUBLIC_APP_ORIGIN`/redirect URI do Google corrigidos | `docker-compose.yml`, provedor | — | login Google e busca funcionam no domínio público |
| 0.4 | Carga nacional dos últimos 30 dias do PNCP | `collect:pncp` com `PNCP_FROM`/`PNCP_TO` | 0.3 | `GET /api/v1/ingest/pncp` mostra as 27 UFs seladas no período |
| 0.5 | Teste ponta a ponta com um CNPJ real: assinar → salvar → receber notificação | produção | 0.1–0.4 | ciclo completo sem intervenção manual |
| 0.6 | ✅ ([`CLAUDE_HANDOFF-006`](handoffs/CLAUDE_HANDOFF-006-dev-entitlement-lgpd.md)) Assinatura de desenvolvimento: `BILLING_DEV_ENTITLED=true` (só com `NODE_ENV !== 'production'`, como o `AUTH_DEV_LOGIN`) trata o usuário como assinante | `billing/billing-access.ts`, `.env.example` | — | QA dos fluxos `/me` sem Asaas nem `INSERT` manual em `subscriptions` |

**Esforço:** 2–4 dias. **Risco:** timeout do PNCP na janela de 30 dias — a coleta já reparte por UF, mas a carga deve rodar fora do horário de pico e pode levar horas.

---

## Onda 1 — Teste de 7 dias, plano único e LGPD da conta

**Decisões do owner (24 set 2026):** **teste de 7 dias** (alterado de 14 para 7 pelo owner) (sem gratuito permanente), **plano único** no valor de
`BILLING_MONTHLY_BRL`, **oportunidades culturais só para quem tem acesso** (teste ou assinatura).
Isso substitui o desenho anterior de níveis Starter/Pro e limites por plano.

**Por que paga:** o teste mostra o produto inteiro (salvar, monitorar, alertas, culturais) e o fim do teste é o ponto de venda.

| # | Tarefa | Onde | Detalhe |
| :-- | :--- | :--- | :--- |
| 1.1 | Teste de 7 dias a partir do primeiro login; usuários já existentes ganham 7 dias a partir da migração | `lib/db` (ex. `users.trial_ends_at`), `billing/billing-access.ts` | `entitled` = assinatura elegível **ou** teste vigente |
| 1.2 | `GET /me/billing` expõe o teste | `billing-service.ts`, contrato | `trialEndsAt`, `source: 'subscription' \| 'trial' \| 'dev' \| null` |
| 1.3 | Um teste por conta Google, inclusive após excluir a conta | tombstone com hash do `sub` | ponderar com LGPD (dado mínimo, finalidade antiabuso) |
| 1.4 | Aviso no app 3 dias antes do fim do teste | notificação `trial_ending` | a de "teste acabou" é mostrada pela UI a partir do billing (as notificações ficam atrás do gate) |
| 1.5 | Oportunidades culturais atrás do gate | `routes/opportunities.ts` | anônimo → 401; sem acesso → 402; coleta diária inalterada |
| 1.6 | Rota pública com preço e duração do teste | `GET /api/v1/billing/plan` | `{ monthlyBrl, trialDays }` para landing e login |
| 1.7 | UI: selo "Teste · N dias", aviso nos últimos 3 dias, tela de assinatura ao expirar, textos "7 dias grátis" na landing/login, culturais com paywall | `features/billing`, `app-shell`, `landing`, `opportunities` | o upgrade aparece onde o acesso acaba |
| 1.8 | LGPD da conta: exportar e excluir | **feito no backend** ([`CLAUDE_HANDOFF-006`](handoffs/CLAUDE_HANDOFF-006-dev-entitlement-lgpd.md)); UI em `/settings` | — |

**Depende de:** Onda 0.1 para cobrar de fato; o desenvolvimento usa `BILLING_DEV_ENTITLED`. **Pronto quando:** um usuário novo usa tudo por 7 dias, recebe o aviso no dia 4 e, no dia 8, cai na tela de assinatura com o checkout.

---

## Onda 2 — Entrega proativa (e-mail + frequência)

**Objetivo:** a frase que vende a assinatura é "você não precisa entrar no sistema todo dia". Hoje a notificação só existe dentro do app.

**Decisões do owner (24 set 2026):** Resend; padrão = **digest diário às 07:00 + envio imediato para eventos críticos** (mudança de prazo, suspensão/revogação de edital monitorado), com opt-out em um clique.

**Limitação atual a resolver:** `evaluateSavedSearchNotifications()` é chamada **uma vez, no fim da coleta do PNCP** (`collect-pncp.ts:520`), que roda às 06:00. Alerta "em tempo real" não é possível sem desacoplar isso.

| # | Tarefa | Onde | Detalhe |
| :-- | :--- | :--- | :--- |
| 2.1 | Provedor de e-mail transacional: **Resend** (decisão do owner) | `artifacts/api-server/src/notify/mailer.ts` (novo) | env `RESEND_API_KEY`, `MAIL_FROM`; sem chave → log e entrega marcada como `skipped` |
| 2.2 | Tabela `notification_deliveries` (canal, status, tentativa, erro) | `lib/db/src/schema/accounts.ts` | idempotência pelo `dedupeKey` que já existe em `notifications` |
| 2.3 | Digest diário por e-mail: agrupa notificações não lidas por usuário | `notify/digest.ts` (novo) + agendador ao lado de `daily-collect.ts` | um e-mail por usuário por dia, não um por edital |
| 2.4 | Alerta imediato para mudança de prazo e suspensão de edital monitorado | gancho em `upsert-tenders.ts` | classe de evento crítico ≠ digest |
| 2.5 | Desacoplar a avaliação de buscas salvas da coleta | `collect-pncp.ts` → job próprio, intervalo configurável | pré-requisito do "quase tempo real" |
| 2.6 | Preferências de notificação por usuário (canal, frequência, silêncio) | `routes/account.ts` + `features/settings` | LGPD: opt-out precisa existir |
| 2.7 | Link de descadastro e registro de consentimento | `notify/mailer.ts` | exigência legal, não opcional |
| 2.8 | *(opcional, Pro)* WhatsApp via provedor oficial | `notify/whatsapp.ts` | só depois que o e-mail estiver estável |

**Depende de:** Onda 1 (acesso = teste ou assinatura). **Esforço:** 6–9 dias sem WhatsApp. **Pronto quando:** um usuário Starter recebe, às 07:00, um e-mail com os editais novos da busca salva dele e consegue desligar isso em um clique.

---

## Onda 3 — IA no edital (com Jev, da TypeSafe)

**Decisão do owner (24 set 2026):** usar o **Jev** (TypeSafe) via API key, guardada só no servidor.

**O que muda no desenho:** o Jev é um modelo *System One*: devolve **julgamentos tipados e probabilidades**
(Choice, Noul, Score), **não gera texto**. Por isso a Onda 3 passa de "responder em prosa" para
**"selecionar a evidência"** — o que reforça a regra de sempre citar a fonte: a resposta mostrada ao usuário é
o trecho oficial do edital, com página, escolhido pelo Jev; nunca um texto inventado.

**Base que já existe:** `enrich-tender.ts` busca itens e **anexos** do PNCP na primeira abertura do detalhe e grava em `documents`.

| # | Tarefa | Onde | Detalhe |
| :-- | :--- | :--- | :--- |
| 3.1 | Download e extração de texto dos anexos, com página | `artifacts/api-server/src/ai/extract.ts` (novo) | PDF nativo + OCR de fallback |
| 3.2 | Trechos (`tender_chunks`) com página e busca textual no Postgres | `lib/db` | candidatos por palavra-chave/`tsvector`; embeddings só se o reranking não bastar |
| 3.3 | Cliente Jev no servidor | `ai/jev-client.ts` | `JEV_API_KEY` (decisão do owner); ler a doc viva (docs.typesafe.ai) antes de integrar |
| 3.4 | "Perguntar ao edital": recuperar candidatos → Jev reordena/seleciona → devolver os trechos com página | `POST /api/v1/tenders/:id/ask` | resposta = trechos citados + confiança; abaixo do limiar, "não encontrei no edital" |
| 3.5 | Ficha estruturada (objeto, habilitação, prazos, garantia, penalidades) por **seleção de trechos candidatos** | `ai/summarize.ts` | cada campo aponta o trecho e a página; campo sem evidência fica vazio, não inventado |
| 3.6 | Aderência edital × perfil da empresa (Score) | `ai/fit-score.ts` | selo na busca/detalhe → alerta diário do perfil; `mode=semantic` depois (decisões de 25 set 2026) |
| 3.7 | UI: painel "Perguntar ao edital" e ficha no detalhe, com link para a página do documento | `features/tenders` | mostrar a confiança de forma honesta |
| 3.8 | Cota por usuário (teste com cota menor) + medidor de custo | `ai/usage.ts` | custo por chamada |
| 3.9 | Aviso "confira o edital original" | UI | a seleção orienta, não substitui o edital |

**Depende de:** Onda 1. **Riscos:** PDF escaneado sem OCR; validar os limiares de confiança do Jev com editais reais antes de exibir.

---

## Onda 4 — Funil / CRM de licitações

**Objetivo:** retenção. Quem coloca o processo dele dentro da ferramenta não troca de ferramenta.

| # | Tarefa | Onde | Detalhe |
| :-- | :--- | :--- | :--- |
| 4.1 | Tabelas `pipeline_stages` (por usuário) e `pipeline_items` | `lib/db` | estágios editáveis, não fixos |
| 4.2 | Migrar `savedTendersTable.monitored` para item de funil sem perder o salvo | migração | salvar continua existindo; o funil é uma camada acima |
| 4.3 | Tags livres em editais salvos (lacuna apontada na análise) | `saved_tender_tags` | pedido simples, entrega rápida |
| 4.4 | Notas e anexos próprios por licitação | `pipeline_notes` | onde a proposta e o orçamento vivem |
| 4.5 | Quadro Kanban com arrastar entre estágios | `features/pipeline` (novo) | usar os tokens de `design-system/` |
| 4.6 | Registro de resultado (vencida/perdida/valor) | `pipeline_items.outcome` | alimenta a Onda 5 |
| 4.7 | Lembretes de prazo por item do funil | reaproveita `notify/` da Onda 2 | prazo de proposta e de sessão |

**Depende de:** Onda 2 (lembretes). **Esforço:** 8–12 dias.

---

## Onda 5 — Inteligência de mercado e multi-CNPJ

**Objetivo:** ticket de plano Enterprise/Consultor.

| # | Tarefa | Onde | Detalhe |
| :-- | :--- | :--- | :--- |
| 5.1 | Coleta de **resultados** e atas do PNCP (vencedor, valor homologado) | `ingest/collect-results.ts` (novo) | é a matéria-prima de tudo nesta onda; hoje o coletor só traz a publicação |
| 5.2 | Tabela `tender_awards` (fornecedor, CNPJ, item, valor, desconto) | `lib/db` | — |
| 5.3 | Histórico de preços por item/categoria | `features/market` | "quanto costuma sair este item neste órgão" |
| 5.4 | Perfil de concorrente por CNPJ (o que ganha, onde, com que desconto) | `features/market` | o relatório que a empresa grande pede |
| 5.5 | Perfil de comprador por órgão (o que compra, quando, com que frequência) | `features/market` | alimenta recomendação |
| 5.6 | Recomendação de editais pelo histórico do usuário | `ai/recommend.ts` | só faz sentido com o funil da Onda 4 alimentado |
| 5.7 | Multi-CNPJ: `organizations` + `memberships`, dados por empresa | refactor de `usersTable` | **refactor pesado de autorização**: toda rota `/me` passa a precisar de contexto de empresa |
| 5.8 | Exportação de relatório CSV/PDF por empresa | `routes/reports.ts` | entrega do plano Consultor |
| 5.9 | Download de anexos em lote (ZIP) | `routes/tenders.ts` | pedido do documento original; barato depois da Onda 3.1 |

**Depende de:** 5.1 antes de tudo; 5.6 depende da Onda 4. **Esforço:** 15–25 dias. **Nota:** o 5.7 é o item de maior risco de regressão do roadmap inteiro — fazer isolado, com teste de integração antes.

---

## 2. Sequenciamento

```
Onda 0  ██                        destrava faturamento
Onda 1    ████                    planos e limites
Onda 2        ██████              e-mail e frequência
Onda 3              ██████████    IA no edital          ← diferencial de mercado
Onda 4                    ██████  funil / CRM
Onda 5                        ████████  mercado + multi-CNPJ
```

A Onda 3 depende só da Onda 1 (cota é atributo de plano), não da Onda 2: com a equipe atual (Codex no backend, Claude/Gemini no frontend) as Ondas 2 e 3 podem rodar em paralelo.

Ondas 0 a 2 formam o **produto cobrável mínimo**: a assinatura já se justifica com alerta por e-mail e monitoramento de retificação, exatamente como conclui o documento de origem. A Onda 3 diferencia dentro da categoria "IA com fonte", não é mais exclusividade nossa: pesquisa de
27 set 2026 ([`docs/reviews/competitive-analysis-2026-09-27.md`](reviews/competitive-analysis-2026-09-27.md)) achou pelo menos dois concorrentes
(Acumi, Licitei) já entregando chat citado por página e ficha campo a campo. Nosso diferencial de preço
(R$ 49,90 sem limite mensal de análises) e as chamadas de fomento cultural continuam sem equivalente
encontrado no mercado.

---

## 3. Decisões

Tomadas em 24 set 2026: teste de 7 dias (o owner trocou de 14 para 7); plano único (`BILLING_MONTHLY_BRL`); oportunidades culturais só com acesso.

Também em 24 set 2026: e-mail pelo **Resend**; alertas com **digest diário + imediato para críticos**; IA da Onda 3 com o **Jev (TypeSafe)**.

Em 25 set 2026, aderência (3.6): perfil da empresa com **6 campos** (o que fornece, produtos/serviços, o que não atende, área de atuação com opção **Brasil inteiro**, faixa de valor, porte). **Porte só pesa com trecho citado** do edital. **Um perfil por conta**. Superfície: **selo de aderência** na busca e no detalhe primeiro, depois **alerta diário de editais para o perfil**; reordenar a busca (`mode=semantic`) fica para depois, opcional. Formulário em **Configurações** com convite no painel inicial, sem wizard bloqueante.

Limiares da aderência aprovados em 25 set 2026, após a calibração (3 perfis × 30 editais reais): **alta ≥ 0,75**, **média ≥ 0,55**.

Ciclo 6 (25 set 2026): **ficha do edital (3.5)**. Campo sem trecho fica "não encontrado nos documentos"; ausência nunca vira resposta ("não exige").

Em 26 set 2026: **valor do plano R$ 49,90/mês** (`BILLING_MONTHLY_BRL=49.90` no `.env` de produção), para ficar bem abaixo da concorrência; reajuste se o custo por assinante passar de R$ 25. Conta de margem, hospedagem, metas, limite de IA e retenção em [`docs/architecture-scale.md`](architecture-scale.md), seção 7.

---

## 4. Riscos transversais

- **Dependência do PNCP.** Timeout já observado em 22 set 2026. Alerta prometido em contrato exige monitorar a saúde da coleta e avisar o usuário quando a base está desatualizada (o `Atualizado em` da busca já é a base disso).
- **Custo variável da IA** sem cota por plano corrói a margem da assinatura.
- **LGPD no e-mail**: consentimento, descadastro e retenção precisam entrar junto com a Onda 2, não depois.
- **LGPD da conta**: exportação e exclusão de conta (item 1.7b) antes de cobrar em produção.
- **Responsabilidade sobre a informação**: a UI já não serve edital fictício; a resposta de IA precisa do mesmo rigor — sempre com citação e link para a fonte oficial.
