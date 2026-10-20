# Pendências — Pardal Digital — 2026-10-08

> Relatório gerado em 08/10/2026 00:32 BRT. Somente leitura; nenhum arquivo do repositório foi alterado.

---

## Resumo executivo

| | |
|---|---|
| Issues abertas | **3** (issues #28, #29, #41) |
| Itens pendentes (checklists + comentários) | **~14** |
| PRs aguardando merge em `main` | **1** (PR #46) |
| PR #46 bloqueado? | Não — `MERGEABLE`, sem review obrigatório |

### 5 pendências mais importantes

1. **[#41] Webhook do Asaas** → ainda aponta para URL antiga; sem isso cobranças não chegam ao servidor.
2. **[#41] Borda `origem.pardaldigital.com`** → sslip.io ainda em uso; sem certificado Cloudflare Origin CA e sem restrição de IPs, a origem fica acessível diretamente.
3. **[#41] App OAuth em "Status de teste"** → só contas de teste conseguem fazer login; publicar para acesso público é ação de owner no Console do Google.
4. **[#28] `pg_dump` diário** → backup automatizado ainda não configurado; dados de produção correm risco em falha de hardware.
5. **[PR #46] Merge do OCR em `main`** → está pronto (`MERGEABLE`), sem pendências de revisão; bloqueia o deploy dos novos formatos de documento no servidor.

---

## 1. Issues abertas

### Issue #28 — Servidor 24h: produção no MacBook Ubuntu

> Runbook: `docs/ops/macbook-worker.md`. Branch: `ops/macbook-worker`.

| Item | Status | Evidência | Próximo passo | Quem |
|---|---|---|---|---|
| 1 — Compose macbook + `.env` completo | ✅ feito | Comentário 06/10 20:11; PR #31 + #30 aplicados; ops/macbook-worker reconciliado | — | — |
| 2.1 — Domínio estático ngrok | ⚠️ superado* | Borda Oracle no ar (comentário 07/10 20:42) — ngrok segue como rollback | Owner decidir se remove ngrok | owner |
| 2.2 — `PUBLIC_APP_ORIGIN` fixo + OAuth + Asaas | ✅ feito (OAuth+origem) / **pendente** (Asaas) | Comentário #41 07/10 01:21 confirma `PUBLIC_APP_ORIGIN=https://pardaldigital.com`; webhook Asaas ainda não atualizado | Atualizar webhook Asaas → `https://pardaldigital.com/api/v1/billing/asaas/webhook` | owner (painel Asaas) |
| 2.3 — URL sobrevive a restart | ⚠️ não verificado | ngrok não é mais a rota principal; borda Oracle responde via Tailscale | Validar se borda mantém conectividade após reboot | servidor |
| 3.1 — `HandleLidSwitch*=ignore`; sleep mascarados | ✅ feito | Comentário 06/10 21:53 (owner rodou o script) | — | — |
| 3.2 — Tampa fechada 2 min, app continua | **pendente** | Sonda de 06/10 não registrou fechamento; validação presencial não confirmada | Fechar a tampa 2 min e conferir `readyz` | owner (presencial) |
| 4.1 — Timer `pg_dump` diário com retenção | **pendente** | Nenhum comentário ou commit confirmando criação | Criar timer systemd; dump em `~/backups/licita/` | servidor / owner |
| 4.2 — Restore de teste em banco descartável | **pendente** | Depende do 4.1 | Rodar após 4.1 | servidor |
| Regra TCP 22 da Security List Oracle | **pendente** | Comentário 07/10 20:42 pede ao owner para remover | Remover regra no console Oracle | owner (console Oracle) |
| Otimização das facetas de busca (~10 s) | **pendente** | Comentário 07/10 20:42: "buscas com termo comum ~10 s — pede otimização das facetas" | Abrir issue ou PR específico | código |

---

### Issue #29 — Monitor do servidor (diário permanente do Albert-CLAUDE)

> Canal de relatórios contínuo. **Nunca pendente de fechamento.**

| Item de atenção | Status | Evidência | Ação sugerida | Quem |
|---|---|---|---|---|
| 978 exemplos (06–07/10) sem `embedding_model` | **pendente decisão** | Benchmark 07/10 23:12 (comentário #29) | Se busca semântica for ligada, gerar embeddings antes | código/owner |
| Volume `ollama-bench` (5,7 GB) no servidor | **pendente decisão** | Comentário 08/10 00:28: mantido para reaproveitamento | Owner decide: `docker volume rm ollama-bench` | owner |
| Teto OpenAI: subir para ~6.500/dia (≈ US$ 0,27/d) | **pendente decisão** | Recomendação do benchmark; sem resposta do owner | Owner confirmar e ajustar `AI_DAILY_BUDGET_USD` | owner |
| Relatórios 08:00 e alertas | ativo/contínuo | Último relatório 08/10 03:26 | Nenhuma ação; canal segue ativo | — |

---

### Issue #41 — Migração para `pardaldigital.com`

| Item | Status | Evidência | Próximo passo | Quem |
|---|---|---|---|---|
| Cloudflare ativa (NS propagados) | ✅ feito | Comentário 07/10 01:07 | — | — |
| SSL/TLS → Full (strict) | **pendente** | Não mencionado em nenhum comentário | Configurar no painel Cloudflare | owner |
| DNSSEC | **pendente** | Aguarda estabilidade; não feito | Habilitar DS na Hostinger após validar tudo | owner |
| PRs #42 + #43 mergeados e no ar | ✅ feito | #42 mergeado 08/10 01:13; #43 mergeado 08/10 01:19; `git log` confirma | — | — |
| Vercel: `pardaldigital.com` + `www` (308) | ✅ feito | Comentário 07/10 01:07; site 200 no domínio novo | — | — |
| Google OAuth: origem + callback `pardaldigital.com` | ✅ feito | Comentário 07/10 01:21 | — | — |
| App OAuth em "Status de teste" | **pendente** | Comentário 07/10 01:21: "⚠️ só usuários de teste"; publicar é ação do owner | Publicar app no Console Google | owner |
| Servidor `PUBLIC_APP_ORIGIN=https://pardaldigital.com` | ✅ feito | Comentário 07/10 01:21; `compose.macbook.yml` via `.env` | — | — |
| Redirect 308 `abriu-la.vercel.app → pardaldigital.com` | ✅ feito | Comentário 07/10 01:21 | — | — |
| Webhook Asaas atualizado | **pendente** | Não confirmado em nenhum comentário | Painel Asaas → `https://pardaldigital.com/api/v1/billing/asaas/webhook` | owner |
| Borda: certificado Cloudflare Origin CA para `origem.pardaldigital.com` | **pendente** | Último comentário menciona `sslip.io` ainda em uso; `compose.macbook.tailscale.yml` usa `ORIGIN_SHARED_SECRET` mas sem subdomínio cloudflare | Emitir cert Origin CA; configurar DNS `origem` → IP VM (proxied); `API_UPSTREAM_ORIGIN=https://origem.pardaldigital.com` na Vercel | owner + servidor |
| Borda: restringir 443 VM aos IPs Cloudflare | **pendente** | Depende do item anterior | Após migração para Cloudflare Origin CA | servidor |
| Borda: monitor com `EDGE_URL=https://origem.pardaldigital.com` | **pendente** | Ainda usa sslip.io | Atualizar `config.env` do monitor após DNS | servidor |
| E-mail Brevo no servidor | ✅ feito | Comentário 08/10 03:17: teste recebido | — | — |
| Zoho `suporte@pardaldigital.com` | ⚠️ descartado | Comentário 07/10 01:07: Zoho sem plano gratuito; substituído por Cloudflare Email Routing + Gmail | Opcional: abrir issue separada se caixa de suporte profissional for necessária | owner (decisão) |
| Limpeza: ngrok, URIs antigas, sslip.io | **pendente** | Explicitamente listado como pendente no corpo do #41 | Após borda Cloudflare validada | servidor + owner |
| Limpeza: remover `RESEND_API_KEY`/`MAIL_FROM` antigos | **pendente** | Comentário 08/10 03:17 | PR simples de `.env.example` + remover vars do servidor | código |
| Validação final (checklist do issue) | **pendente** | Múltiplos itens acima ainda abertos | Executar após fechar os itens de borda e Asaas | — |

---

## 2. PRs em aberto (aguardando merge em `main`)

| PR | O que faz | Base | Dependência | `MERGEABLE` | Riscos | Ordem sugerida |
|---|---|---|---|---|---|---|
| [#46](https://github.com/antonioreal97/Licita-Insight/pull/46) `feat/document-formats → main` | Leva PR #45 (OCR Tesseract) para `main`; inclui migração `0027_document_ocr.sql`, serviço `ops/ocr/`, fila `document_ocr`, variáveis `DOCUMENT_OCR_*`; desligado por padrão | `feat/document-formats` → `main` | PR #44 já está em `main` (mergeado 08/10 00:29) | ✅ `MERGEABLE` | **Migração de banco** (`ALTER TABLE ai_jobs`, `tender_ai_indexes`, `tender_ai_documents` + 2 novas colunas); server precisa rodar `release_command` na próxima imagem. OCR desligado por padrão, sem risco de regressão imediata. `.env.example` atualizado com 6 variáveis novas. | 1º (único PR aberto) |

> **Notas sobre PRs #44 e #45:**  
> #44 (`feat/document-formats`) foi mergeado em `main` em 08/10 00:29.  
> #45 (`feat/document-ocr`) foi mergeado em `feat/document-formats` antes do GitHub rebaseá-lo; PR #46 foi aberto para levar o conteúdo ao `main` sem mudanças adicionais.

---

## 3. Pendências fora das issues

Itens encontrados em `memory-bank/activeContext.md`, `memory-bank/progress.md` e inspecção dos arquivos em `main`, sem issue ou PR correspondente:

| Item | Origem | Próximo passo | Quem |
|---|---|---|---|
| Checkout de teste real no Asaas Sandbox (fluxo de cobrança ponta a ponta) | `activeContext.md` § Próximos passos (27/09, sem resposta) | Owner aprovar explicitamente para disparar | owner |
| `client_secret` da chave SSH do servidor ainda activa como fallback (recomendação: desabilitar senha) | `activeContext.md` ln 12–13 | `sudo passwd -l kruid` após confirmar acesso via chave | owner (presencial) |
| Reserva de DHCP `192.168.1.13` no roteador | `activeContext.md` ln 45 | Configurar no painel do roteador para IP estático local | owner |
| `Button` duplicado (componente de páginas ≠ `components/ui/button`) | `progress.md` § Problemas conhecidos | Unificar em PR de refactor | código |
| Carga nacional de 30 dias do PNCP (não medida) | `activeContext.md` § Próximos passos | Agendar janela de manutenção e rodar | servidor/owner |
| Outras instalações Mapas Culturais (15 UFs ausentes) | `activeContext.md` ln 194 | Próximo ciclo de coleta cultural | código |
| Volume `ollama-bench` (ver #29 acima) | Relatório de benchmark | `docker volume rm ollama-bench` | owner |
| Overrides de binários nativos (`pnpm-workspace.yaml`) para linux-x64 podem quebrar dev no macOS | `progress.md` § Problemas conhecidos | Revisar overrides ou documentar workaround | código |

---

## 4. Itens que dependem de ação manual do owner

### Contas e painéis externos

| Item | Serviço | Issue/Ref |
|---|---|---|
| Publicar app OAuth (sair de "Status de teste") | Google Console | #41 |
| Emitir certificado Cloudflare Origin CA para `origem.pardaldigital.com` | Cloudflare | #41 |
| Adicionar DNS `A origem → 137.131.233.192` (proxied) e configurar SSL Full (strict) | Cloudflare | #41 |
| Habilitar DNSSEC (DS na Hostinger) | Cloudflare + Hostinger | #41 |
| Atualizar webhook Asaas → `https://pardaldigital.com/api/v1/billing/asaas/webhook` | Asaas | #41 + #28 |
| Remover regra TCP 22 da Security List | Oracle Console | #28 (comentário 07/10) |
| Fechar tampa do MacBook 2 min e confirmar que app + borda respondem | presencial | #28 item 3.2 |
| Aprovar checkout de teste Asaas Sandbox | Asaas | `activeContext.md` |
| Decidir sobre volume `ollama-bench` (5,7 GB) | servidor SSH | #29 |
| Subir teto OpenAI para ~6.500/dia | OpenAI + `.env` | #29 |
| Reservar DHCP `192.168.1.13` no roteador | roteador doméstico | `activeContext.md` |

### Ações de código/servidor (sem conta externa)

| Item | Responsável | Issue/Ref |
|---|---|---|
| Merge do PR #46 em `main` | owner (merge) | PR #46 |
| Deploy do PR #46 no servidor (pull + rebuild) | servidor | PR #46 + #28 |
| Criar timer `pg_dump` diário e testar restore | servidor | #28 item 4 |
| Atualizar `EDGE_URL`/`PUBLIC_URL` no monitor após DNS `origem.pardaldigital.com` | servidor | #41 |
| Remover `RESEND_API_KEY`/`MAIL_FROM` antigos do `.env.example` | código | #41 (comentário 08/10) |
| Limpeza: desligar ngrok, remover URIs antigas, aposentar `sslip.io` | servidor | #41 |
| Restringir porta 443 VM Oracle aos IPs Cloudflare (iptables) | servidor | #41 |
| `API_UPSTREAM_ORIGIN=https://origem.pardaldigital.com` na Vercel + redeploy | servidor/Vercel | #41 |
