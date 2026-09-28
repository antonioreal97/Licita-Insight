# QA — Prontidão de deploy (HANDOFF-021) — 27–28 set 2026

Validação independente de [`CODEX_HANDOFF-021`](../handoffs/CODEX_HANDOFF-021-deploy-readiness.md): itens 1–5 (caminho de migração, imagem de produção, estático,
Fly enxuto, runbook) e item 6 (beta fechado no Mac atrás do Cloudflare Tunnel, decisão do owner de 28 set).

## Itens 1–5 — aceitos

Refeito por mim, sem confiar no relatório do Codex:

- `verify:migrations`: `migrate` num banco vazio == `prepare-extensions + push-force + apply-ai-ledger`, diff
  vazio, segunda execução idempotente. **Teste de mutação:** um índice só no schema Drizzle fez o verificador
  falhar (exit 1) apontando exatamente o índice — a guarda funciona.
- O Codex acrescentou ao Drizzle constraints `CHECK` e o índice GIN de `tender_ai_passages` que só existiam nas
  migrations SQL. Conferido: nenhuma linha de `licita` ou `licita_cycle4` viola as novas regras, então o próximo
  `push-force` do dev aplica sem erro. `expired` é status só calculado, nunca gravado.
- Suíte 171/171 (duas vezes; a segunda para descartar interferência do teste de mutação).
- Imagem `Dockerfile.prod` (147 MiB, amd64, usuário `node`): `release_command` num banco temporário criou 25
  tabelas, 18 migrations, `pg_trgm` e a view `ai_usage_ledger`; segunda execução sem efeito. App `role=all` com
  166 MiB de RSS. Smoke: SPA, deep link, assets, `healthz`/`readyz`/plano em JSON, `/api/x` 404 JSON, traversal
  404 sem vazamento, `dev-login` desligado em produção. Render no Chrome headless chamando a API na mesma origem.
- **Corrigido por mim (`5eb6e77`)**: a regra de cache imutável casava qualquer nome com 8+ caracteres, então
  `LicitAI_logo.png` (sem hash) ficaria 1 ano no cache dos visitantes; agora só `assets/` é imutável
  (teste primeiro). Runbook passou a guardar arquivos de segredo em `~/.licitai-secrets/`, fora do repo.

## Item 6 — não aceito como veio; corrigido e validado por mim

A conta do Codex chegou a menos de 10% do limite de 5h ao fim dos itens 1–5; depois de um diálogo de troca de
modelo, o terminal passou a mostrar `gpt-5.6-luna medium` (antes aparecia `gpt-5.6-sol high`). Não sei se isso
explica a queda, mas nas duas entregas do item 6 (≈5 min cada, contra 21 min dos itens 1–5) ele só rodou
typecheck, não commitou e devolveu as validações ao coordenador. Problemas encontrados na revisão:

| Problema | Consequência no beta | Correção |
|---|---|---|
| App sem nenhum segredo (1ª entrega) | ninguém conseguiria logar | `env_file` em `~/.licitai-secrets/beta.env` (Codex, 2ª entrega) |
| Coleta desligada (1ª entrega) | banco vazio para sempre | coleta ligada + janela medida (abaixo) |
| Token do túnel em `deploy/beta-local/cloudflared.env`, fora do `.gitignore` (1ª entrega) | token real commitável por engano | lido de `~/.licitai-secrets/` |
| Convite só valia no gate `402` | convidado veria a tela de pagamento e deixaria de receber alertas após 7 dias | respeitado também em `/me/billing` e nos e-mails |
| Comando `grant:beta-access` via `tsx` + `../../.env` | gravaria convites no **banco de dev** | removido; só o runner na imagem, que exige `DATABASE_URL` |
| E-mail como chave, sensível a maiúsculas | `Convidado@X` e `convidado@x` viravam duas linhas; expirar uma deixava a outra ativa | `CHECK (email = lower(email))` na migration `0018` e no schema |
| E-mail consultava o banco por candidato (2ª entrega) | até 5.000 consultas a cada 15 min | uma consulta por rodada (`activeBetaGrantEmails`) |
| `billing-access.ts` (puro) passou a acessar o banco, com imports no fim do arquivo | — | consultas movidas para `billing/beta-grants.ts` |
| Contrato/Zod/frontend sem o valor `beta` | resposta fora do contrato; convidado aparecia como "sem assinatura" | OpenAPI + clientes regenerados + [`account-v1.md`](../contracts/account-v1.md) + tipo e texto em Configurações |
| `restore.sh` dava `dropdb` com o app conectado | restauração falharia | para o app, `--force`, exige `--yes`, religa o app |
| `backup.sh` escrevia direto no arquivo final e dependia da pasta atual | dump pela metade parecendo válido; launchd falharia | `.partial` + `mv`, caminho absoluto, `chmod 600` |
| Runbook: comando de carga com `tsx` (inexistente na imagem), `PNCP_UF=SP,RJ` (o código aceita uma UF), host do túnel ≠ redirect do Google, sem `--yes`, launchd sem `PATH` | o owner travaria na primeira execução | runbook reescrito ([`docs/ops/beta-local.md`](../ops/beta-local.md)) |
| Rotas `/api/v1/ingest/*` sem autenticação, agora públicas pelo túnel | qualquer um dispararia coletas (limite 3/min) | regra WAF da Cloudflare no runbook; correção no código segue pendente (achado do Hermes) |
| Compose sem `platform: linux/amd64` | aviso e emulação implícita no Mac arm64 | declarado em `migrate` e `app` |

### Testes novos (`billing/beta-grants.integration.test.ts`, 8 casos, schema isolado)

Sem convite: sem acesso em nenhum caminho · banco recusa e-mail com maiúsculas (nome exato da constraint) ·
convite ativo contra e-mail do Google com maiúsculas: gate, `/me/billing` (`source: beta`) e e-mail · convite
expirado volta ao `402` · convite revogado não vale · pagante continua `source: subscription` · webhook
`PAYMENT_REFUNDED` cancela a assinatura e o convite fica intacto, virando a fonte do acesso · runner na imagem:
grant/list/revoke e recusa sem `DATABASE_URL`. O teste existente `account.integration.test.ts` passou a criar a
tabela a partir da migration `0018` no schema isolado (sem DDL no `public` do `licita_cycle4`).

### Resultados

- Suíte completa: **180/180** (171 + 9), `DATABASE_URL` não exportado, `PNCP_TEST_DATABASE_URL` no `licita_cycle4`.
- `verify:migrations`: PASS com a `0018` e a constraint nova; typecheck de tudo: 0 erros.
- Stack do beta (projeto `licitai-beta-qa`, HOME falso com segredos descartáveis, túnel desligado) ao lado do
  stack de dev, **sem porta publicada no host**: migrate exit 0; smoke pela rede do compose (SPA, deep link,
  `healthz`, `readyz`, plano, `/api/x` 404, logo `no-cache`, asset imutável); `role=all` com agendadores.
- Runner na imagem: grant (e-mail normalizado), list, revoke. Backup: dump de 77 KB, `600`, pasta `700`.
  Restore recusou sem `--yes`; com `--yes` levou 3 s, trouxe de volta o marcador apagado, 26 tabelas, 19
  migrations e o app voltou saudável.
- **Carga inicial medida:** um dia útil nacional (25/09/2026) = 5.264 editais, 115 páginas, ~11 min, +28 MB.
  Projeção e recomendação (14 dias ≈ 53 mil editais, ~2h30, ~290 MB) no runbook, seção 6.
- Tudo o que o QA criou foi removido (containers, volume, rede, imagens, segredos descartáveis); stack de dev
  intacto.

## Pendências

- **Verificar o IP real atrás do túnel** (runbook, seção 5.4): `TRUST_PROXY=1` está coberto por teste para um
  salto confiável, mas o comportamento exato do `cloudflared` com `X-Forwarded-For` só se confirma com o túnel
  real, que depende do domínio do owner.
- Autenticação das rotas de ingestão (a regra WAF mitiga no beta; no Fly não há Cloudflare na frente).
- Nome/marca: o espaço "Licita + IA" está saturado ([`docs/reviews/competitive-analysis-2026-09-27.md`](competitive-analysis-2026-09-27.md)); o
  domínio do beta depende dessa decisão.
